import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest, notFound } from '../lib/errors.js';
import {
  fetchOrder,
  recordStatus,
  restockOrder,
  nextStatuses,
  STATUS_LABELS,
} from '../lib/orders.js';
import { refundOrderIfPaid } from '../lib/refunds.js';
import { isOnlinePaymentEnabled } from '../lib/gateway.js';
import { isValidVpa, storeAcceptsUpi } from '../lib/upi.js';
import { confirmUpiPayment, rejectUpiPayment } from '../lib/upiOrders.js';
import { serializeOrder, serializeProduct, serializeCategory, serializeStore } from '../lib/serialize.js';
import { invalidateStoreCache } from '../lib/store.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/* ------------------------------ overview ----------------------------- */

adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [totals, queue, lowStock, topProducts, revenueByDay] = await Promise.all([
      queryOne(
        `SELECT
           count(*) FILTER (WHERE placed_at::date = current_date)                       AS orders_today,
           coalesce(sum(total_paise) FILTER (
             WHERE placed_at::date = current_date AND status <> 'cancelled'), 0)        AS revenue_today_paise,
           count(*) FILTER (WHERE status NOT IN ('delivered','cancelled'))              AS open_orders,
           coalesce(sum(total_paise) FILTER (WHERE status = 'delivered'), 0)            AS lifetime_revenue_paise,
           count(*)                                                                     AS total_orders
         FROM orders`
      ),
      query(
        `SELECT status, count(*)::int AS count FROM orders
          WHERE status NOT IN ('delivered','cancelled') GROUP BY status`
      ),
      query(
        `SELECT p.id, p.name, p.slug, p.unit_label, p.stock_qty, p.price_paise, p.mrp_paise,
                p.image_url, p.is_active, p.max_per_order, p.is_popular, p.sold_count, p.tags,
                c.id AS category_id, c.name AS category_name, c.slug AS category_slug, c.emoji AS category_emoji
           FROM products p JOIN categories c ON c.id = p.category_id
          WHERE p.is_active AND p.stock_qty <= 10
          ORDER BY p.stock_qty ASC, p.name LIMIT 12`
      ),
      query(
        `SELECT oi.product_name AS name, sum(oi.quantity)::int AS units,
                sum(oi.line_total_paise)::int AS revenue_paise
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE o.status <> 'cancelled' AND o.placed_at > now() - interval '30 days'
          GROUP BY oi.product_name ORDER BY units DESC LIMIT 8`
      ),
      query(
        `SELECT d::date AS day,
                coalesce(sum(o.total_paise) FILTER (WHERE o.status <> 'cancelled'), 0)::int AS revenue_paise,
                count(o.id)::int AS orders
           FROM generate_series(current_date - interval '6 days', current_date, interval '1 day') d
           LEFT JOIN orders o ON o.placed_at::date = d::date
          GROUP BY d ORDER BY d`
      ),
    ]);

    res.json({
      totals: {
        ordersToday: Number(totals.orders_today),
        revenueTodayPaise: Number(totals.revenue_today_paise),
        openOrders: Number(totals.open_orders),
        lifetimeRevenuePaise: Number(totals.lifetime_revenue_paise),
        totalOrders: Number(totals.total_orders),
      },
      queue: queue.rows.map((r) => ({ status: r.status, label: STATUS_LABELS[r.status], count: r.count })),
      lowStock: lowStock.rows.map(serializeProduct),
      topProducts: topProducts.rows,
      revenueByDay: revenueByDay.rows.map((r) => ({
        day: r.day,
        revenuePaise: r.revenue_paise,
        orders: r.orders,
      })),
    });
  })
);

/* ------------------------------- orders ------------------------------ */

adminRouter.get(
  '/orders',
  validate(
    z.object({
      status: z
        .enum([
          'all',
          'open',
          'awaiting_payment',
          'confirmed',
          'preparing',
          'ready_for_pickup',
          'out_for_delivery',
          'delivered',
          'cancelled',
        ])
        .default('open'),
      fulfilment: z.enum(['all', 'delivery', 'pickup']).default('all'),
      // 'submitted' is the shop's real working queue: customers who say they
      // have paid by UPI and are waiting on someone to check the bank alert.
      payment: z.enum(['all', 'submitted', 'unpaid', 'paid']).default('all'),
      q: z.string().trim().max(60).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const { status, fulfilment, payment, q, page, limit } = req.validatedQuery;
    const where = ['true'];
    const params = [];
    const add = (value) => `$${params.push(value)}`;

    if (status === 'open') where.push(`o.status NOT IN ('delivered','cancelled')`);
    else if (status !== 'all') where.push(`o.status = ${add(status)}::order_status`);
    if (fulfilment !== 'all') where.push(`o.fulfilment = ${add(fulfilment)}::fulfilment_type`);
    if (payment === 'submitted') where.push(`o.payment_status = 'submitted'`);
    else if (payment === 'unpaid') where.push(`o.payment_status IN ('pending','submitted','failed')`);
    else if (payment === 'paid') where.push(`o.payment_status = 'paid'`);
    if (q) {
      const needle = add(`%${q}%`);
      where.push(`(o.order_number ILIKE ${needle} OR o.contact_name ILIKE ${needle} OR o.contact_phone ILIKE ${needle})`);
    }

    const offset = (page - 1) * limit;
    const { rows } = await query(
      `SELECT o.*, u.name AS customer_name, u.phone AS customer_phone,
              (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
              count(*) OVER () AS total_count
         FROM orders o JOIN users u ON u.id = o.user_id
        WHERE ${where.join(' AND ')}
        ORDER BY (o.status NOT IN ('delivered','cancelled')) DESC, o.placed_at DESC
        LIMIT ${add(limit)} OFFSET ${add(offset)}`,
      params
    );

    const total = rows.length ? Number(rows[0].total_count) : 0;
    res.json({
      orders: rows.map((row) => ({ ...serializeOrder(row), nextStatuses: nextStatuses(row) })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  })
);

adminRouter.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    res.json({ order: await fetchOrder({ orderId: id }) });
  })
);

adminRouter.patch(
  '/orders/:id/status',
  validate(
    z.object({
      status: z.enum([
        'confirmed',
        'preparing',
        'ready_for_pickup',
        'out_for_delivery',
        'delivered',
        'cancelled',
      ]),
      note: z.string().trim().max(200).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { status, note } = req.body;

    await withTransaction(async (client) => {
      const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [id]);
      const order = rows[0];
      if (!order) throw notFound('Order not found');

      const allowed = nextStatuses(order);
      if (!allowed.includes(status)) {
        throw badRequest(
          `An order that is "${STATUS_LABELS[order.status]}" cannot move to "${STATUS_LABELS[status]}"`,
          { allowed }
        );
      }

      if (status === 'cancelled') {
        await restockOrder(client, order.id);
        await client.query(
          `UPDATE orders SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2
            WHERE id = $1`,
          [order.id, note || 'Cancelled by the store']
        );
      } else if (status === 'delivered') {
        await client.query(
          // Handing over a pay-later order settles it. A prepaid order
          // (UPI QR or gateway) is only ever marked paid by the payment
          // confirmation path — otherwise "delivered" would quietly claim
          // money nobody checked for.
          `UPDATE orders SET status = 'delivered', completed_at = now(),
                  payment_status = CASE
                    WHEN payment_method IN ('pay_on_delivery','pay_at_store') THEN 'paid'::payment_status
                    ELSE payment_status END
            WHERE id = $1`,
          [order.id]
        );
      } else {
        await client.query(`UPDATE orders SET status = $2 WHERE id = $1`, [order.id, status]);
      }

      await recordStatus(client, order.id, status, note, req.user.id);
    });

    // Outside the transaction: the gateway call must not hold row locks.
    const refund =
      status === 'cancelled'
        ? await refundOrderIfPaid(id, note || 'Cancelled by the store')
        : { status: 'not_applicable' };

    res.json({ order: await fetchOrder({ orderId: id }), refund });
  })
);

/**
 * Settle a UPI QR payment by hand. This is the only route in the codebase
 * that can write payment_status = 'paid' for a prepaid order, and it is
 * deliberately a staff action: with no gateway in the loop, the only evidence
 * the money arrived is the bank alert on the shop's phone.
 */
adminRouter.post(
  '/orders/:id/payment',
  validate(
    z.object({
      action: z.enum(['confirm', 'reject']),
      reference: z.string().trim().max(32).optional().or(z.literal('')),
      note: z.string().trim().max(200).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { action, reference, note } = req.body;

    if (action === 'confirm') {
      await confirmUpiPayment({
        orderId: id,
        staffId: req.user.id,
        reference: reference || null,
        note,
      });
    } else {
      await rejectUpiPayment({ orderId: id, staffId: req.user.id, reason: note });
    }

    res.json({ order: await fetchOrder({ orderId: id }) });
  })
);

/* ------------------------------ catalogue ---------------------------- */

const productSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  brand: z.string().trim().max(80).optional().or(z.literal('')),
  description: z.string().trim().max(600).optional().or(z.literal('')),
  unitLabel: z.string().trim().min(1).max(40),
  pricePaise: z.coerce.number().int().min(1),
  mrpPaise: z.coerce.number().int().min(1),
  imageUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
  stockQty: z.coerce.number().int().min(0).default(0),
  maxPerOrder: z.coerce.number().int().min(1).max(99).default(20),
  isActive: z.boolean().default(true),
  isPopular: z.boolean().default(false),
  tags: z.array(z.string().trim().max(30)).max(10).default([]),
});

const PRODUCT_SELECT = `
  p.*, c.name AS category_name, c.slug AS category_slug, c.emoji AS category_emoji
`;

adminRouter.get(
  '/products',
  validate(
    z.object({
      q: z.string().trim().max(60).optional(),
      category: z.string().trim().max(80).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const { q, category, page, limit } = req.validatedQuery;
    const where = ['true'];
    const params = [];
    const add = (value) => `$${params.push(value)}`;
    if (q) {
      const needle = add(`%${q}%`);
      where.push(`(p.name ILIKE ${needle} OR p.brand ILIKE ${needle})`);
    }
    if (category) where.push(`c.slug = ${add(category)}`);

    const offset = (page - 1) * limit;
    const { rows } = await query(
      `SELECT ${PRODUCT_SELECT}, count(*) OVER () AS total_count
         FROM products p JOIN categories c ON c.id = p.category_id
        WHERE ${where.join(' AND ')}
        ORDER BY p.is_active DESC, p.name
        LIMIT ${add(limit)} OFFSET ${add(offset)}`,
      params
    );
    const total = rows.length ? Number(rows[0].total_count) : 0;
    res.json({
      products: rows.map(serializeProduct),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  })
);

adminRouter.post(
  '/products',
  validate(productSchema),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (body.pricePaise > body.mrpPaise) throw badRequest('Selling price cannot exceed the MRP');

    const baseSlug = slugify(`${body.name}-${body.unitLabel}`);
    const row = await queryOne(
      `INSERT INTO products (category_id, name, slug, brand, description, unit_label, price_paise,
                             mrp_paise, image_url, stock_qty, max_per_order, is_active, is_popular, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        body.categoryId,
        body.name,
        baseSlug,
        body.brand || null,
        body.description || null,
        body.unitLabel,
        body.pricePaise,
        body.mrpPaise,
        body.imageUrl || null,
        body.stockQty,
        body.maxPerOrder,
        body.isActive,
        body.isPopular,
        body.tags,
      ]
    );
    const full = await queryOne(
      `SELECT ${PRODUCT_SELECT} FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = $1`,
      [row.id]
    );
    res.status(201).json({ product: serializeProduct(full) });
  })
);

adminRouter.patch(
  '/products/:id',
  validate(productSchema.partial()),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = req.body;

    const current = await queryOne(`SELECT * FROM products WHERE id = $1`, [id]);
    if (!current) throw notFound('Product not found');

    const price = body.pricePaise ?? current.price_paise;
    const mrp = body.mrpPaise ?? current.mrp_paise;
    if (price > mrp) throw badRequest('Selling price cannot exceed the MRP');

    await query(
      `UPDATE products SET
         category_id = COALESCE($2, category_id),
         name = COALESCE($3, name),
         brand = COALESCE($4, brand),
         description = COALESCE($5, description),
         unit_label = COALESCE($6, unit_label),
         price_paise = COALESCE($7, price_paise),
         mrp_paise = COALESCE($8, mrp_paise),
         image_url = COALESCE($9, image_url),
         stock_qty = COALESCE($10, stock_qty),
         max_per_order = COALESCE($11, max_per_order),
         is_active = COALESCE($12, is_active),
         is_popular = COALESCE($13, is_popular),
         tags = COALESCE($14, tags)
       WHERE id = $1`,
      [
        id,
        body.categoryId ?? null,
        body.name ?? null,
        body.brand ?? null,
        body.description ?? null,
        body.unitLabel ?? null,
        body.pricePaise ?? null,
        body.mrpPaise ?? null,
        body.imageUrl ?? null,
        body.stockQty ?? null,
        body.maxPerOrder ?? null,
        body.isActive ?? null,
        body.isPopular ?? null,
        body.tags ?? null,
      ]
    );

    const full = await queryOne(
      `SELECT ${PRODUCT_SELECT} FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = $1`,
      [id]
    );
    res.json({ product: serializeProduct(full) });
  })
);

/** Quick restock from the inventory table: +n / -n without a full edit. */
adminRouter.post(
  '/products/:id/stock',
  validate(z.object({ delta: z.coerce.number().int().optional(), set: z.coerce.number().int().min(0).optional() })),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { delta, set } = req.body;
    if (delta === undefined && set === undefined) throw badRequest('Send either delta or set');

    const row = await queryOne(
      `UPDATE products
          SET stock_qty = GREATEST(COALESCE($2, stock_qty + COALESCE($3, 0)), 0)
        WHERE id = $1 RETURNING id`,
      [id, set ?? null, delta ?? null]
    );
    if (!row) throw notFound('Product not found');

    const full = await queryOne(
      `SELECT ${PRODUCT_SELECT} FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = $1`,
      [id]
    );
    res.json({ product: serializeProduct(full) });
  })
);

/** Products are never hard deleted — order history references them. */
adminRouter.delete(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const row = await queryOne(`UPDATE products SET is_active = false WHERE id = $1 RETURNING id`, [id]);
    if (!row) throw notFound('Product not found');
    res.json({ ok: true, message: 'Product delisted' });
  })
);

adminRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT c.*, count(p.id) AS product_count
         FROM categories c LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id ORDER BY c.sort_order, c.name`
    );
    res.json({ categories: rows.map(serializeCategory) });
  })
);

adminRouter.post(
  '/categories',
  validate(
    z.object({
      name: z.string().trim().min(2).max(60),
      description: z.string().trim().max(200).optional().or(z.literal('')),
      emoji: z.string().trim().max(8).optional().or(z.literal('')),
      imageUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
      sortOrder: z.coerce.number().int().min(0).max(999).default(100),
    })
  ),
  asyncHandler(async (req, res) => {
    const { name, description, emoji, imageUrl, sortOrder } = req.body;
    const row = await queryOne(
      `INSERT INTO categories (name, slug, description, emoji, image_url, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, slugify(name), description || null, emoji || null, imageUrl || null, sortOrder]
    );
    res.status(201).json({ category: serializeCategory(row) });
  })
);

/* ---------------------------- store settings -------------------------- */

adminRouter.patch(
  '/store',
  validate(
    z.object({
      name: z.string().trim().min(2).max(80).optional(),
      tagline: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(20).optional(),
      opensAt: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      closesAt: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      freeDeliveryRadiusKm: z.coerce.number().min(0.5).max(25).optional(),
      maxDeliveryRadiusKm: z.coerce.number().min(0.5).max(25).optional(),
      minOrderPaise: z.coerce.number().int().min(0).optional(),
      basePrepMinutes: z.coerce.number().int().min(5).max(240).optional(),
      acceptsPayLater: z.boolean().optional(),
      upiVpa: z
        .string()
        .trim()
        .max(80)
        .refine((value) => value === '' || isValidVpa(value), {
          message: 'Enter a UPI ID in the form name@bank',
        })
        .optional(),
      upiPayeeName: z.string().trim().max(50).optional(),
      acceptsUpiQr: z.boolean().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const b = req.body;

    const current = await queryOne(`SELECT * FROM store_settings WHERE id = 1`);
    // What the shop would look like after this save, used for the two
    // "customers must have *some* way to pay" guards below.
    const next = {
      ...current,
      ...(b.upiVpa !== undefined ? { upi_vpa: b.upiVpa || null } : {}),
      ...(b.acceptsUpiQr !== undefined ? { accepts_upi_qr: b.acceptsUpiQr } : {}),
    };
    const prepaidAvailable = isOnlinePaymentEnabled || storeAcceptsUpi(next);

    if (b.acceptsPayLater === false && !prepaidAvailable) {
      throw badRequest(
        'Pay on handover cannot be switched off while no prepaid method is set up — ' +
          'add a UPI ID first, or customers would have no way to pay.'
      );
    }
    if (!prepaidAvailable && !next.accepts_pay_later) {
      throw badRequest('Turning this off would leave customers with no way to pay');
    }
    const row = await queryOne(
      `UPDATE store_settings SET
         name = COALESCE($1, name),
         tagline = COALESCE($2, tagline),
         phone = COALESCE($3, phone),
         opens_at = COALESCE($4::time, opens_at),
         closes_at = COALESCE($5::time, closes_at),
         free_delivery_radius_km = COALESCE($6, free_delivery_radius_km),
         max_delivery_radius_km = COALESCE($7, max_delivery_radius_km),
         min_order_paise = COALESCE($8, min_order_paise),
         base_prep_minutes = COALESCE($9, base_prep_minutes),
         accepts_pay_later = COALESCE($10, accepts_pay_later),
         -- '' clears the UPI ID (and with it UPI payments); NULL leaves it be.
         upi_vpa = CASE WHEN $11::text IS NULL THEN upi_vpa
                        WHEN $11 = '' THEN NULL ELSE $11 END,
         upi_payee_name = COALESCE($12, upi_payee_name),
         accepts_upi_qr = COALESCE($13, accepts_upi_qr)
       WHERE id = 1 RETURNING *`,
      [
        b.name ?? null,
        b.tagline ?? null,
        b.phone ?? null,
        b.opensAt ?? null,
        b.closesAt ?? null,
        b.freeDeliveryRadiusKm ?? null,
        b.maxDeliveryRadiusKm ?? null,
        b.minOrderPaise ?? null,
        b.basePrepMinutes ?? null,
        b.acceptsPayLater ?? null,
        b.upiVpa ?? null,
        b.upiPayeeName ?? null,
        b.acceptsUpiQr ?? null,
      ]
    );
    invalidateStoreCache();
    res.json({ store: serializeStore(row) });
  })
);

/* ------------------------------ customers ---------------------------- */

adminRouter.get(
  '/customers',
  validate(
    z.object({
      q: z.string().trim().max(60).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const { q, page, limit } = req.validatedQuery;
    const params = [];
    const add = (value) => `$${params.push(value)}`;
    const where = q
      ? `WHERE (u.name ILIKE ${add(`%${q}%`)} OR u.phone ILIKE ${add(`%${q}%`)})`
      : '';
    const offset = (page - 1) * limit;

    const { rows } = await query(
      `SELECT u.id, u.name, u.phone, u.email, u.role, u.created_at,
              count(o.id)::int AS order_count,
              coalesce(sum(o.total_paise) FILTER (WHERE o.status <> 'cancelled'), 0)::int AS spend_paise,
              count(*) OVER () AS total_count
         FROM users u LEFT JOIN orders o ON o.user_id = u.id
         ${where}
         GROUP BY u.id ORDER BY spend_paise DESC, u.created_at DESC
         LIMIT ${add(limit)} OFFSET ${add(offset)}`,
      params
    );
    const total = rows.length ? Number(rows[0].total_count) : 0;
    res.json({
      customers: rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        role: r.role,
        joinedAt: r.created_at,
        orderCount: r.order_count,
        spendPaise: r.spend_paise,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  })
);
