/**
 * The UPI QR lifecycle against the database.
 *
 *   pending  → the QR has been shown, nobody has said anything yet
 *   submitted → the customer entered a UTR and is waiting on the shop
 *   paid      → a staff member matched it against the bank alert
 *   failed    → the shop looked and the money was not there
 *
 * Only `confirmUpiPayment` — which requires a signed-in staff account — can
 * write 'paid'. A customer claim is a claim, never a settlement.
 */
import { withTransaction } from '../db.js';
import { badRequest, notFound } from './errors.js';
import { recordStatus } from './orders.js';
import {
  INTENT_TTL_MINUTES,
  buildUpiIntent,
  isValidReference,
  storeAcceptsUpi,
  transactionRef,
} from './upi.js';

const UNIQUE_VIOLATION = '23505';

const assertPayable = (order) => {
  if (order.payment_method !== 'upi_qr') throw badRequest('This order is not a UPI payment');
  if (order.status === 'cancelled') throw badRequest('That order was cancelled');
  if (order.payment_status === 'paid') throw badRequest('This order is already paid');
};

/**
 * Hand back the QR for an order, creating a payment attempt if there is not
 * already a live one. A customer who merely refreshes the page gets the same
 * reference back; one who waits past the TTL gets a fresh attempt, because a
 * stale QR in a screenshot must not be payable forever.
 */
export const openUpiIntent = async ({ orderId, userId, store }) =>
  withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [orderId, userId]
    );
    const order = rows[0];
    if (!order) throw notFound('Order not found');
    assertPayable(order);

    if (!storeAcceptsUpi(store)) {
      throw badRequest('The shop has not set up UPI payments yet — please pay on handover.');
    }

    const { rows: open } = await client.query(
      `SELECT * FROM payments
        WHERE order_id = $1 AND provider = 'upi_qr' AND status IN ('pending','submitted')
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at DESC LIMIT 1`,
      [order.id]
    );

    let payment = open[0];
    if (!payment) {
      const { rows: counted } = await client.query(
        `SELECT count(*)::int AS attempts FROM payments WHERE order_id = $1`,
        [order.id]
      );
      const reference = transactionRef(order.order_number, counted[0].attempts + 1);
      const intent = await buildUpiIntent({
        vpa: store.upi_vpa,
        payeeName: store.upi_payee_name || store.name,
        amountPaise: order.total_paise,
        reference,
        note: `Order ${order.order_number}`,
      });

      const { rows: inserted } = await client.query(
        `INSERT INTO payments (order_id, provider, provider_order_id, amount_paise, currency,
                               status, method_detail, upi_uri, expires_at)
         VALUES ($1,'upi_qr',$2,$3,'INR','pending','upi', $4, now() + ($5 || ' minutes')::interval)
         RETURNING *`,
        [order.id, reference, order.total_paise, intent.upiUri, String(INTENT_TTL_MINUTES)]
      );
      payment = inserted[0];
    }

    // Rebuild rather than store the SVG: it is derived data, and the amount on
    // the order is the only thing that may legitimately be paid.
    const intent = await buildUpiIntent({
      vpa: store.upi_vpa,
      payeeName: store.upi_payee_name || store.name,
      amountPaise: payment.amount_paise,
      reference: payment.provider_order_id,
      note: `Order ${order.order_number}`,
    });

    return {
      ...intent,
      orderNumber: order.order_number,
      status: payment.status,
      reference: payment.provider_order_id,
      upiReference: payment.upi_reference,
      expiresAt: payment.expires_at,
      ttlMinutes: INTENT_TTL_MINUTES,
    };
  });

/**
 * The customer says they have paid. This moves the order out of the
 * customer's hands and into the shop's queue — it does not release anything.
 */
export const claimUpiPayment = async ({ orderId, userId, reference }) => {
  if (!isValidReference(reference)) {
    throw badRequest('Enter the 12 digit UPI reference (UTR) shown in your payment app');
  }
  const utr = reference.trim().toUpperCase();

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [orderId, userId]
    );
    const order = rows[0];
    if (!order) throw notFound('Order not found');
    assertPayable(order);

    const { rows: attempts } = await client.query(
      `SELECT * FROM payments WHERE order_id = $1 AND provider = 'upi_qr'
        ORDER BY created_at DESC LIMIT 1`,
      [order.id]
    );
    const payment = attempts[0];
    if (!payment) throw badRequest('Open the QR first, then tell us the reference');

    try {
      await client.query(
        `UPDATE payments
            SET status = 'submitted', upi_reference = $2, updated_at = now(),
                raw_payload = raw_payload || jsonb_build_object('claimedAt', now())
          WHERE id = $1`,
        [payment.id, utr]
      );
    } catch (error) {
      if (error.code === UNIQUE_VIOLATION) {
        throw badRequest(
          'That reference has already been used for another order. Check the number and try again.'
        );
      }
      throw error;
    }

    await client.query(`UPDATE orders SET payment_status = 'submitted' WHERE id = $1`, [order.id]);
    await recordStatus(
      client,
      order.id,
      order.status,
      `Customer reported UPI payment · ref ${utr}`,
      userId
    );
    return order.id;
  });
};

/** Staff confirm the money landed. The only path to 'paid'. */
export const confirmUpiPayment = async ({ orderId, staffId, reference, note }) =>
  withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) throw notFound('Order not found');
    if (order.payment_status === 'paid') return order;
    if (order.status === 'cancelled') throw badRequest('That order was cancelled');
    if (!['upi_qr', 'razorpay'].includes(order.payment_method)) {
      throw badRequest('This order is not an online payment');
    }

    const utr = reference?.trim()?.toUpperCase() || null;
    if (utr && !isValidReference(utr)) throw badRequest('That does not look like a UPI reference');

    const { rows: attempts } = await client.query(
      `SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orderId]
    );

    if (attempts[0]) {
      await client.query(
        `UPDATE payments
            SET status = 'paid', verified_by = $2, verified_at = now(),
                upi_reference = COALESCE($3, upi_reference),
                error_description = NULL, updated_at = now()
          WHERE id = $1`,
        [attempts[0].id, staffId, utr]
      );
    } else {
      // Paid at the counter by scanning the printed QR, with no attempt ever
      // opened in the app. Record it so the books still balance.
      await client.query(
        `INSERT INTO payments (order_id, provider, amount_paise, currency, status,
                               method_detail, upi_reference, verified_by, verified_at)
         VALUES ($1,'upi_qr',$2,'INR','paid','upi',$3,$4,now())`,
        [orderId, order.total_paise, utr, staffId]
      );
    }

    const { rows: updated } = await client.query(
      `UPDATE orders
          SET payment_status = 'paid',
              status = CASE WHEN status = 'awaiting_payment' THEN 'confirmed'::order_status
                            ELSE status END
        WHERE id = $1 RETURNING *`,
      [orderId]
    );
    await recordStatus(
      client,
      orderId,
      updated[0].status,
      note || `Payment confirmed by the shop${utr ? ` · ref ${utr}` : ''}`,
      staffId
    );
    return updated[0];
  });

/**
 * Staff looked and the money is not there. The order stays alive and unpaid so
 * the customer can try again — the stock is only released by a cancellation.
 */
export const rejectUpiPayment = async ({ orderId, staffId, reason }) =>
  withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) throw notFound('Order not found');
    if (order.payment_status === 'paid') {
      throw badRequest('This order is already marked paid — cancel it instead to refund');
    }

    const message = reason?.trim() || 'The shop could not find this payment';

    await client.query(
      `UPDATE payments SET status = 'failed', error_description = $2, upi_reference = NULL,
              verified_by = $3, verified_at = now(), updated_at = now()
        WHERE order_id = $1 AND status IN ('pending','submitted')`,
      [orderId, message.slice(0, 500), staffId]
    );
    await client.query(`UPDATE orders SET payment_status = 'pending' WHERE id = $1`, [orderId]);
    await recordStatus(client, orderId, order.status, `Payment not verified — ${message}`, staffId);
    return order;
  });
