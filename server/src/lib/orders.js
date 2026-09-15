import { query } from '../db.js';
import { serializeOrder } from './serialize.js';
import { badRequest, notFound } from './errors.js';

/**
 * Allowed status moves. Keeping this as data (rather than if-chains in the
 * admin route) means the API and the UI can share one definition of
 * "what can happen next".
 */
export const STATUS_FLOW = {
  awaiting_payment: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'out_for_delivery', 'cancelled'],
  ready_for_pickup: ['delivered', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export const STATUS_LABELS = {
  awaiting_payment: 'Awaiting payment',
  confirmed: 'Order confirmed',
  preparing: 'Being packed',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Statuses that still hold reserved stock, i.e. cancelling must restock. */
const ACTIVE_STATUSES = [
  'awaiting_payment',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
];

export const nextStatuses = (order) =>
  STATUS_FLOW[order.status].filter((status) => {
    if (status === 'ready_for_pickup') return order.fulfilment === 'pickup';
    if (status === 'out_for_delivery') return order.fulfilment === 'delivery';
    return true;
  });

export const generateOrderNumber = async (client) => {
  const { rows } = await client.query(
    `SELECT 'KS-' || to_char(now(), 'YYMMDD') || '-' || nextval('order_number_seq') AS order_number`
  );
  return rows[0].order_number;
};

export const recordStatus = (client, orderId, status, note, changedBy = null) =>
  client.query(
    `INSERT INTO order_status_history (order_id, status, note, changed_by) VALUES ($1,$2,$3,$4)`,
    [orderId, status, note ?? null, changedBy]
  );

/** Put every line back on the shelf. Used when an order is cancelled. */
export const restockOrder = (client, orderId) =>
  client.query(
    `UPDATE products p
        SET stock_qty = p.stock_qty + oi.quantity,
            sold_count = GREATEST(p.sold_count - oi.quantity, 0)
       FROM order_items oi
      WHERE oi.order_id = $1 AND oi.product_id = p.id`,
    [orderId]
  );

export const isActiveStatus = (status) => ACTIVE_STATUSES.includes(status);

/**
 * Load one order with items and history.
 * `userId` scopes the lookup to a customer; omit it for staff.
 */
export const fetchOrder = async ({ orderId, orderNumber, userId = null }) => {
  const clauses = [];
  const params = [];
  if (orderId) clauses.push(`o.id = $${params.push(orderId)}`);
  if (orderNumber) clauses.push(`o.order_number = $${params.push(orderNumber)}`);
  if (userId) clauses.push(`o.user_id = $${params.push(userId)}`);
  if (!clauses.length) throw badRequest('An order id is required');

  const { rows } = await query(
    `SELECT o.*, u.name AS customer_name, u.phone AS customer_phone
       FROM orders o JOIN users u ON u.id = o.user_id
      WHERE ${clauses.join(' AND ')}`,
    params
  );
  const order = rows[0];
  if (!order) throw notFound('Order not found');

  const [{ rows: items }, { rows: history }, { rows: payments }] = await Promise.all([
    query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY product_name`, [order.id]),
    query(`SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at`, [order.id]),
    query(
      `SELECT provider, provider_order_id, provider_payment_id, status, amount_paise,
              method_detail, upi_reference, expires_at, verified_at, error_description, created_at
         FROM payments WHERE order_id = $1 ORDER BY created_at DESC`,
      [order.id]
    ),
  ]);

  return {
    ...serializeOrder(order, items, history),
    nextStatuses: nextStatuses(order),
    payments: payments.map((p) => ({
      provider: p.provider,
      providerOrderId: p.provider_order_id,
      providerPaymentId: p.provider_payment_id,
      status: p.status,
      amountPaise: p.amount_paise,
      methodDetail: p.method_detail,
      upiReference: p.upi_reference,
      expiresAt: p.expires_at,
      verifiedAt: p.verified_at,
      errorDescription: p.error_description,
      createdAt: p.created_at,
    })),
  };
};
