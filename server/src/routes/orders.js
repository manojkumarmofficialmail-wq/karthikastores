import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest, notFound, unprocessable } from '../lib/errors.js';
import { quoteDelivery } from '../lib/geo.js';
import { loadStoreContext, isStoreOpen } from '../lib/store.js';
import { getCartSummary } from '../lib/cart.js';
import {
  fetchOrder,
  generateOrderNumber,
  recordStatus,
  restockOrder,
  isActiveStatus,
  STATUS_LABELS,
} from '../lib/orders.js';
import { refundOrderIfPaid } from '../lib/refunds.js';
import { isOnlinePaymentEnabled } from '../lib/gateway.js';
import { storeAcceptsUpi } from '../lib/upi.js';
import { serializeOrder } from '../lib/serialize.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const orderRouter = Router();
orderRouter.use(requireAuth);

/** Methods where the money is expected before the bag leaves the shop. */
const PREPAID_METHODS = ['upi_qr', 'razorpay'];

const checkoutSchema = z
  .object({
    fulfilment: z.enum(['delivery', 'pickup']),
    paymentMethod: z.enum(['upi_qr', 'razorpay', 'pay_on_delivery', 'pay_at_store']),
    addressId: z.string().uuid().optional(),
    slotStart: z.string().datetime().optional(),
    customerNote: z.string().trim().max(280).optional().or(z.literal('')),
    contactName: z.string().trim().min(2).max(80).optional(),
    contactPhone: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, 'Enter a valid 10 digit mobile number')
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.fulfilment === 'delivery' && !value.addressId) {
      ctx.addIssue({ code: 'custom', path: ['addressId'], message: 'Choose a delivery address' });
    }
    if (value.fulfilment === 'delivery' && value.paymentMethod === 'pay_at_store') {
      ctx.addIssue({
        code: 'custom',
        path: ['paymentMethod'],
        message: 'Pay at store is only available for pickup orders',
      });
    }
    if (value.fulfilment === 'pickup' && value.paymentMethod === 'pay_on_delivery') {
      ctx.addIssue({
        code: 'custom',
        path: ['paymentMethod'],
        message: 'Pay on delivery is only available for delivery orders',
      });
    }
  });

/**
 * Preview the bill before committing to it: the checkout screen calls this
 * whenever the fulfilment choice or address changes.
 */
orderRouter.post(
  '/quote',
  validate(
    z.object({
      fulfilment: z.enum(['delivery', 'pickup']),
      addressId: z.string().uuid().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const cart = await getCartSummary(req.user.id);
    const { store, zones } = await loadStoreContext();

    let delivery = null;
    if (req.body.fulfilment === 'delivery' && req.body.addressId) {
      const { rows } = await query(`SELECT * FROM addresses WHERE id = $1 AND user_id = $2`, [
        req.body.addressId,
        req.user.id,
      ]);
      if (!rows.length) throw notFound('Address not found');
      delivery = quoteDelivery(
        store,
        zones,
        { latitude: Number(rows[0].latitude), longitude: Number(rows[0].longitude) },
        cart.subtotalPaise
      );
    }

    const deliveryFeePaise = delivery?.serviceable ? delivery.deliveryFeePaise : 0;
    res.json({
      cart,
      delivery,
      storeOpen: isStoreOpen(store),
      totals: {
        subtotalPaise: cart.subtotalPaise,
        savingsPaise: cart.savingsPaise,
        deliveryFeePaise,
        totalPaise: cart.subtotalPaise + deliveryFeePaise,
      },
    });
  })
);

orderRouter.post(
  '/',
  validate(checkoutSchema),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const { store, zones } = await loadStoreContext();

    const order = await withTransaction(async (client) => {
      const cart = await getCartSummary(req.user.id, client);
      if (!cart.lineCount) throw badRequest('Your basket is empty');

      // Lock every product in the basket for the rest of the transaction so
      // two parallel checkouts cannot both claim the last packet of sugar.
      const productIds = cart.items.map((item) => item.product.id);
      const { rows: locked } = await client.query(
        `SELECT id, name, price_paise, mrp_paise, unit_label, image_url, stock_qty, is_active
           FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [productIds]
      );
      const byId = new Map(locked.map((row) => [row.id, row]));

      const lines = [];
      const problems = [];
      for (const item of cart.items) {
        const product = byId.get(item.product.id);
        if (!product?.is_active) {
          problems.push({ field: item.product.name, message: 'No longer available' });
          continue;
        }
        if (product.stock_qty < item.requestedQuantity) {
          problems.push({
            field: product.name,
            message:
              product.stock_qty === 0
                ? 'Just went out of stock'
                : `Only ${product.stock_qty} left — please adjust the quantity`,
          });
          continue;
        }
        lines.push({
          productId: product.id,
          name: product.name,
          unitLabel: product.unit_label,
          imageUrl: product.image_url,
          unitPricePaise: product.price_paise,
          mrpPaise: product.mrp_paise,
          quantity: item.requestedQuantity,
          lineTotalPaise: product.price_paise * item.requestedQuantity,
        });
      }
      if (problems.length) {
        throw unprocessable('Some items in your basket changed', problems);
      }

      // Totals are recomputed here from locked rows — the client's numbers
      // are only ever used to render, never to charge.
      const subtotalPaise = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
      const savingsPaise = lines.reduce(
        (sum, line) => sum + (line.mrpPaise - line.unitPricePaise) * line.quantity,
        0
      );

      let address = null;
      let delivery = null;
      if (body.fulfilment === 'delivery') {
        const { rows } = await client.query(
          `SELECT * FROM addresses WHERE id = $1 AND user_id = $2`,
          [body.addressId, req.user.id]
        );
        address = rows[0];
        if (!address) throw notFound('Address not found');

        delivery = quoteDelivery(
          store,
          zones,
          { latitude: Number(address.latitude), longitude: Number(address.longitude) },
          subtotalPaise
        );
        if (!delivery.serviceable) throw badRequest(delivery.reason);
      }

      const deliveryFeePaise = delivery?.deliveryFeePaise ?? 0;
      const totalPaise = subtotalPaise + deliveryFeePaise;
      // The minimum exists to make a delivery trip worthwhile; someone
      // collecting at the counter can buy a single packet of biscuits, which
      // is what the storefront promises. quoteDelivery() has already applied
      // it to delivery orders.

      const payLater = !PREPAID_METHODS.includes(body.paymentMethod);
      if (body.paymentMethod === 'razorpay' && !isOnlinePaymentEnabled) {
        throw badRequest(
          'Card and netbanking payment is not switched on for this shop — pay by UPI or on handover.'
        );
      }
      if (body.paymentMethod === 'upi_qr' && !storeAcceptsUpi(store)) {
        throw badRequest('UPI payment is not switched on for this shop right now');
      }
      if (payLater && !store.accepts_pay_later) {
        throw badRequest('This shop currently accepts prepaid orders only');
      }

      const slotStart = body.slotStart ? new Date(body.slotStart) : null;
      const slotEnd = slotStart ? new Date(slotStart.getTime() + 45 * 60_000) : null;
      const status = payLater ? 'confirmed' : 'awaiting_payment';
      const orderNumber = await generateOrderNumber(client);

      const { rows: created } = await client.query(
        `INSERT INTO orders (
            order_number, user_id, status, fulfilment, payment_method, payment_status,
            address_id, contact_name, contact_phone, address_line, landmark, city, pincode,
            latitude, longitude, distance_km, slot_start, slot_end, eta_minutes, customer_note,
            subtotal_paise, savings_paise, delivery_fee_paise, total_paise)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING *`,
        [
          orderNumber,
          req.user.id,
          status,
          body.fulfilment,
          body.paymentMethod,
          address?.id ?? null,
          body.contactName ?? address?.contact_name ?? req.user.name,
          body.contactPhone ?? address?.contact_phone ?? req.user.phone,
          address ? [address.line1, address.line2].filter(Boolean).join(', ') : null,
          address?.landmark ?? null,
          address?.city ?? store.city,
          address?.pincode ?? store.pincode,
          address?.latitude ?? null,
          address?.longitude ?? null,
          delivery?.distanceKm ?? null,
          slotStart,
          slotEnd,
          delivery?.etaMinutes ?? store.base_prep_minutes,
          body.customerNote || null,
          subtotalPaise,
          savingsPaise,
          deliveryFeePaise,
          totalPaise,
        ]
      );
      const orderRow = created[0];

      for (const line of lines) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, unit_label, image_url,
                                    unit_price_paise, mrp_paise, quantity, line_total_paise)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            orderRow.id,
            line.productId,
            line.name,
            line.unitLabel,
            line.imageUrl,
            line.unitPricePaise,
            line.mrpPaise,
            line.quantity,
            line.lineTotalPaise,
          ]
        );
        await client.query(
          `UPDATE products SET stock_qty = stock_qty - $2, sold_count = sold_count + $2 WHERE id = $1`,
          [line.productId, line.quantity]
        );
      }

      await recordStatus(
        client,
        orderRow.id,
        status,
        payLater
          ? `${STATUS_LABELS.confirmed} — pay on handover`
          : body.paymentMethod === 'upi_qr'
            ? 'Waiting for the UPI payment'
            : 'Waiting for the payment to clear'
      );
      await client.query(
        `DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)`,
        [req.user.id]
      );

      return orderRow;
    });

    res.status(201).json({
      order: await fetchOrder({ orderId: order.id, userId: req.user.id }),
      // Prepaid orders continue to /api/payments/* with this id.
      requiresPayment: PREPAID_METHODS.includes(order.payment_method),
      paymentMethod: order.payment_method,
    });
  })
);

orderRouter.get(
  '/',
  validate(
    z.object({
      status: z.enum(['active', 'past', 'all']).default('all'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(15),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const { status, page, limit } = req.validatedQuery;
    const params = [req.user.id];
    let statusClause = '';
    if (status === 'active') {
      statusClause = `AND o.status NOT IN ('delivered','cancelled')`;
    } else if (status === 'past') {
      statusClause = `AND o.status IN ('delivered','cancelled')`;
    }

    const offset = (page - 1) * limit;
    const { rows } = await query(
      `SELECT o.*,
              (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
              count(*) OVER () AS total_count
         FROM orders o
        WHERE o.user_id = $1 ${statusClause}
        ORDER BY o.placed_at DESC
        LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`,
      params
    );

    const total = rows.length ? Number(rows[0].total_count) : 0;
    res.json({
      orders: rows.map((row) => serializeOrder(row)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  })
);

orderRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    res.json({ order: await fetchOrder({ orderId: id, userId: req.user.id }) });
  })
);

/** Re-add every still-available line from a past order to the basket. */
orderRouter.post(
  '/:id/reorder',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const order = await fetchOrder({ orderId: id, userId: req.user.id });

    const skipped = [];
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO carts (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING id`,
        [req.user.id]
      );
      const cartId = rows[0].id;

      for (const item of order.items) {
        if (!item.productId) {
          skipped.push(item.name);
          continue;
        }
        const { rows: products } = await client.query(
          `SELECT stock_qty, max_per_order, is_active FROM products WHERE id = $1`,
          [item.productId]
        );
        const product = products[0];
        if (!product?.is_active || product.stock_qty <= 0) {
          skipped.push(item.name);
          continue;
        }
        const quantity = Math.min(item.quantity, product.stock_qty, product.max_per_order);
        await client.query(
          `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1,$2,$3)
           ON CONFLICT (cart_id, product_id)
           DO UPDATE SET quantity = GREATEST(cart_items.quantity, EXCLUDED.quantity)`,
          [cartId, item.productId, quantity]
        );
      }
    });

    res.json({ cart: await getCartSummary(req.user.id), skipped });
  })
);

orderRouter.post(
  '/:id/cancel',
  validate(z.object({ reason: z.string().trim().max(200).optional() })),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);

    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [id, req.user.id]
      );
      const order = rows[0];
      if (!order) throw notFound('Order not found');
      if (!isActiveStatus(order.status)) throw badRequest('This order can no longer be cancelled');
      // Once the rider has left, cancelling is a phone call to the shop.
      if (['out_for_delivery', 'ready_for_pickup'].includes(order.status)) {
        throw badRequest('Your order is already on its way — please call the shop to cancel');
      }

      await restockOrder(client, order.id);
      await client.query(
        `UPDATE orders SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2
          WHERE id = $1`,
        [order.id, req.body.reason || 'Cancelled by customer']
      );
      await recordStatus(client, order.id, 'cancelled', req.body.reason || 'Cancelled by customer', req.user.id);
    });

    // Outside the transaction: the gateway call must not hold row locks.
    const refund = await refundOrderIfPaid(id, req.body.reason || 'Cancelled by customer');

    res.json({ order: await fetchOrder({ orderId: id, userId: req.user.id }), refund });
  })
);
