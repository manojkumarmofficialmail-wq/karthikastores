import { query, queryOne } from '../db.js';
import { gateway } from './gateway.js';

/**
 * Return the money for a cancelled order that was paid online.
 *
 * Deliberately called *after* the cancellation transaction commits: an HTTP
 * round-trip to the gateway must never be made while holding row locks.
 *
 * The order's payment_status only becomes 'refunded' once the gateway has
 * accepted the refund. If the call fails it stays 'paid' with the reason
 * recorded on the payment row, so staff can see the money is still owed
 * instead of the books quietly claiming it was returned.
 *
 * @returns {Promise<{status: 'refunded'|'not_applicable'|'failed', message?: string}>}
 */
export const refundOrderIfPaid = async (orderId, reason = 'Order cancelled') => {
  const order = await queryOne(
    `SELECT id, order_number, payment_method, payment_status, total_paise FROM orders WHERE id = $1`,
    [orderId]
  );
  if (!order || order.payment_status !== 'paid') return { status: 'not_applicable' };

  // A UPI QR payment went bank-to-bank with no gateway in the middle, so
  // there is nothing to call: somebody at the shop has to send the money
  // back from the same account. Say that plainly rather than pretending a
  // refund was raised — the payment row keeps the note for the staff screen.
  if (order.payment_method === 'upi_qr') {
    await query(
      `UPDATE payments SET error_description = $2, updated_at = now()
        WHERE order_id = $1 AND status = 'paid'`,
      [orderId, `Refund owed to the customer (${reason})`.slice(0, 500)]
    );
    return {
      status: 'manual',
      message: 'This was a UPI payment — the shop refunds it from the same UPI account.',
    };
  }

  if (order.payment_method !== 'razorpay') return { status: 'not_applicable' };

  const payment = await queryOne(
    `SELECT id, provider_payment_id, amount_paise FROM payments
      WHERE order_id = $1 AND status = 'paid' AND provider_payment_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [orderId]
  );
  if (!payment) {
    return { status: 'failed', message: 'No captured payment found to refund' };
  }

  try {
    const result = await gateway.refund({
      providerPaymentId: payment.provider_payment_id,
      amountPaise: payment.amount_paise ?? order.total_paise,
      notes: { orderNumber: order.order_number, reason },
    });

    await query(
      `UPDATE payments SET status = 'refunded', error_description = NULL,
              raw_payload = raw_payload || $2::jsonb, updated_at = now()
        WHERE id = $1`,
      [payment.id, JSON.stringify({ refund: result.raw ?? {} })]
    );
    await query(`UPDATE orders SET payment_status = 'refunded' WHERE id = $1`, [orderId]);

    return { status: 'refunded', refundId: result.refundId };
  } catch (error) {
    await query(
      `UPDATE payments SET error_description = $2, updated_at = now() WHERE id = $1`,
      [payment.id, `Refund failed: ${error.message}`.slice(0, 500)]
    );
    console.error(`[refund] ${order.order_number}: ${error.message}`);
    return { status: 'failed', message: error.message };
  }
};
