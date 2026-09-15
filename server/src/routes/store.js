import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notFound } from '../lib/errors.js';
import { quoteDelivery } from '../lib/geo.js';
import { loadStoreContext, isStoreOpen, buildSlots } from '../lib/store.js';
import { isOnlinePaymentEnabled } from '../lib/gateway.js';
import { storeAcceptsUpi } from '../lib/upi.js';
import { serializeStore } from '../lib/serialize.js';
import { validate } from '../middleware/validate.js';

export const storeRouter = Router();

storeRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { store, zones } = await loadStoreContext();
    res.json({
      store: {
        ...serializeStore(store),
        // Neither of these is a plain column: onlinePaymentEnabled is server
        // configuration, and upiPaymentEnabled also needs the VPA to parse.
        // The checkout screen offers only the methods that pass here.
        onlinePaymentEnabled: isOnlinePaymentEnabled,
        upiPaymentEnabled: storeAcceptsUpi(store),
      },
      isOpen: isStoreOpen(store),
      slots: buildSlots(store),
      deliveryZones: zones.map((z) => ({
        name: z.name,
        maxDistanceKm: Number(z.max_distance_km),
        deliveryFeePaise: z.delivery_fee_paise,
        minOrderPaise: z.min_order_paise,
        etaMinutes: z.eta_minutes,
      })),
    });
  })
);

const querySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  subtotalPaise: z.coerce.number().int().min(0).optional().default(0),
});

/** Distance + ETA + fee for a candidate delivery point. */
storeRouter.get(
  '/delivery-quote',
  validate(querySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { latitude, longitude, subtotalPaise } = req.validatedQuery;
    const { store, zones } = await loadStoreContext();
    res.json({
      quote: quoteDelivery(store, zones, { latitude, longitude }, subtotalPaise),
    });
  })
);

/** Fallback geocoding: pincode -> centroid, when the browser denies GPS. */
storeRouter.get(
  '/pincode/:pincode',
  asyncHandler(async (req, res) => {
    const pincode = String(req.params.pincode).trim();
    if (!/^\d{6}$/.test(pincode)) throw notFound('Enter a valid 6 digit PIN code');

    const row = await queryOne(`SELECT * FROM pincode_centroids WHERE pincode = $1`, [pincode]);
    if (!row) {
      throw notFound('We do not have this PIN code on our map yet — please pin your location instead');
    }
    const { store, zones } = await loadStoreContext();
    const point = { latitude: Number(row.latitude), longitude: Number(row.longitude) };
    res.json({
      pincode: row.pincode,
      area: row.area,
      city: row.city,
      state: row.state,
      ...point,
      quote: quoteDelivery(store, zones, point),
    });
  })
);

/** Every PIN code the shop knows about — used to power the address picker. */
storeRouter.get(
  '/pincodes',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT pincode, area, city, state, latitude, longitude
         FROM pincode_centroids ORDER BY area`
    );
    res.json({
      pincodes: rows.map((r) => ({
        pincode: r.pincode,
        area: r.area,
        city: r.city,
        state: r.state,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
      })),
    });
  })
);
