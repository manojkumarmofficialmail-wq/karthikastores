import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notFound } from '../lib/errors.js';
import { quoteDelivery } from '../lib/geo.js';
import { loadStoreContext } from '../lib/store.js';
import { serializeAddress } from '../lib/serialize.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const addressRouter = Router();
addressRouter.use(requireAuth);

const addressSchema = z.object({
  label: z.string().trim().min(1).max(24).default('Home'),
  contactName: z.string().trim().min(2, 'Who should we hand the order to?').max(80),
  contactPhone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10 digit mobile number'),
  line1: z.string().trim().min(4, 'House / flat and street are needed').max(160),
  line2: z.string().trim().max(160).optional().or(z.literal('')),
  landmark: z.string().trim().max(120).optional().or(z.literal('')),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6 digit PIN code'),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  isDefault: z.boolean().default(false),
});

/** Attach the delivery verdict so the UI can grey out un-servable addresses. */
const withQuote = async (rows) => {
  const { store, zones } = await loadStoreContext();
  return rows.map((row) => ({
    ...serializeAddress(row),
    delivery: quoteDelivery(store, zones, {
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    }),
  }));
};

addressRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );
    res.json({ addresses: await withQuote(rows) });
  })
);

addressRouter.post(
  '/',
  validate(addressSchema),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const row = await withTransaction(async (client) => {
      const { rows: existing } = await client.query(
        `SELECT count(*)::int AS count FROM addresses WHERE user_id = $1`,
        [req.user.id]
      );
      // The first address a customer saves is their default.
      const isDefault = body.isDefault || existing[0].count === 0;
      if (isDefault) {
        await client.query(`UPDATE addresses SET is_default = false WHERE user_id = $1`, [req.user.id]);
      }
      const { rows } = await client.query(
        `INSERT INTO addresses
           (user_id, label, contact_name, contact_phone, line1, line2, landmark,
            city, state, pincode, latitude, longitude, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          req.user.id,
          body.label,
          body.contactName,
          body.contactPhone,
          body.line1,
          body.line2 || null,
          body.landmark || null,
          body.city,
          body.state,
          body.pincode,
          body.latitude,
          body.longitude,
          isDefault,
        ]
      );
      return rows[0];
    });
    res.status(201).json({ address: (await withQuote([row]))[0] });
  })
);

addressRouter.patch(
  '/:id',
  validate(addressSchema.partial()),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const owned = await queryOne(`SELECT id FROM addresses WHERE id = $1 AND user_id = $2`, [
      id,
      req.user.id,
    ]);
    if (!owned) throw notFound('Address not found');

    const body = req.body;
    const row = await withTransaction(async (client) => {
      if (body.isDefault) {
        await client.query(`UPDATE addresses SET is_default = false WHERE user_id = $1`, [req.user.id]);
      }
      const { rows } = await client.query(
        `UPDATE addresses SET
           label = COALESCE($3, label),
           contact_name = COALESCE($4, contact_name),
           contact_phone = COALESCE($5, contact_phone),
           line1 = COALESCE($6, line1),
           line2 = COALESCE($7, line2),
           landmark = COALESCE($8, landmark),
           city = COALESCE($9, city),
           state = COALESCE($10, state),
           pincode = COALESCE($11, pincode),
           latitude = COALESCE($12, latitude),
           longitude = COALESCE($13, longitude),
           is_default = COALESCE($14, is_default)
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [
          id,
          req.user.id,
          body.label ?? null,
          body.contactName ?? null,
          body.contactPhone ?? null,
          body.line1 ?? null,
          body.line2 ?? null,
          body.landmark ?? null,
          body.city ?? null,
          body.state ?? null,
          body.pincode ?? null,
          body.latitude ?? null,
          body.longitude ?? null,
          body.isDefault ?? null,
        ]
      );
      return rows[0];
    });
    res.json({ address: (await withQuote([row]))[0] });
  })
);

addressRouter.post(
  '/:id/default',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    await withTransaction(async (client) => {
      const { rowCount } = await client.query(
        `SELECT 1 FROM addresses WHERE id = $1 AND user_id = $2`,
        [id, req.user.id]
      );
      if (!rowCount) throw notFound('Address not found');
      await client.query(`UPDATE addresses SET is_default = false WHERE user_id = $1`, [req.user.id]);
      await client.query(`UPDATE addresses SET is_default = true WHERE id = $1`, [id]);
    });
    const { rows } = await query(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );
    res.json({ addresses: await withQuote(rows) });
  })
);

addressRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { rowCount } = await query(`DELETE FROM addresses WHERE id = $1 AND user_id = $2`, [
      id,
      req.user.id,
    ]);
    if (!rowCount) throw notFound('Address not found');

    // Keep exactly one default alive so checkout always has a pre-selection.
    await query(
      `UPDATE addresses SET is_default = true
        WHERE id = (
          SELECT id FROM addresses WHERE user_id = $1
           AND NOT EXISTS (SELECT 1 FROM addresses WHERE user_id = $1 AND is_default)
           ORDER BY created_at DESC LIMIT 1
        )`,
      [req.user.id]
    );
    res.json({ ok: true });
  })
);
