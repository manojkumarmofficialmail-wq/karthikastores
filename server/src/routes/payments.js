import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db.js';
import { config } from '../config.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest, forbidden, notFound, serviceUnavailable } from '../lib/errors.js';
import { gateway, isSimulatedGateway, isOnlinePaymentEnabled } from '../lib/gateway.js';
import { fetchOrder, recordStatus, restockOrder } from '../lib/orders.js';
import { loadStoreContext } from '../lib/store.js';
import { storeAcceptsUpi, REFERENCE_PATTERN } from '../lib/upi.js';
import { openUpiIntent, claimUpiPayment } from '../lib/upiOrders.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const paymentRouter = Router();

/* ------------------------------------------------------------------ */
/* Webhook — mounted before requireAuth: the caller is Razorpay, not a  */
/* signed-in customer. It authenticates with an HMAC over the raw body. */
/* ------------------------------------------------------------------ */

const markPaid = async ({ orderId, providerPaymentId, providerOrderId, methodDetail, raw }) =>
  withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) throw notFound('Order not found');

    // Webhook and browser callback race each other; whoever arrives second
    // must be a no-op.
    if (order.payment_status === 'paid') return order;
    if (order.status === 'cancelled') throw badRequest('That order was cancelled');

    await client.query(
      `UPDATE payments
          SET status = 'paid', provider_payment_id = $2, method_detail = $3,
              raw_payload = $4, updated_at = now()
        WHERE order_id = $1 AND provider_order_id = $5`,
      [orderId, providerPaymentId, methodDetail ?? null, raw ?? {}, providerOrderId]
    );
    const { rows: updated } = await client.query(
      `UPDATE orders SET payment_status = 'paid',
              status = CASE WHEN status = 'awaiting_payment' THEN 'confirmed'::order_status ELSE status END
        WHERE id = $1 RETURNING *`,
      [orderId]
    );
    await recordStatus(client, orderId, 'confirmed', 'Payment received');
    return updated[0];
  });

const markFailed = async ({ orderId, providerOrderId, description, raw }) =>
  withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order || order.payment_status === 'paid') return;

    await client.query(
      `UPDATE payments SET status = 'failed', error_description = $3, raw_payload = $4, updated_at = now()
        WHERE order_id = $1 AND provider_order_id = $2`,
      [orderId, providerOrderId, description ?? null, raw ?? {}]
    );
    // A failed payment releases the stock it had reserved.
    if (order.status === 'awaiting_payment') {
      await restockOrder(client, orderId);
      await client.query(
        `UPDATE orders SET status = 'cancelled', payment_status = 'failed',
                cancelled_at = now(), cancel_reason = $2
          WHERE id = $1`,
        [orderId, description || 'Payment failed']
      );
      await recordStatus(client, orderId, 'cancelled', description || 'Payment failed');
    }
  });

paymentRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const signature = req.get('x-razorpay-signature') ?? '';
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);

    if (!gateway.verifyWebhookSignature(rawBody, signature)) {
      // Answer 400 rather than 401: an unsigned call is malformed, and
      // Razorpay retries on 5xx only.
      return res.status(400).json({ error: { message: 'Invalid webhook signature' } });
    }

    const event = JSON.parse(rawBody);
    const entity = event?.payload?.payment?.entity;
    const providerOrderId = entity?.order_id ?? event?.payload?.order?.entity?.id;
    if (!providerOrderId) return res.json({ received: true, ignored: 'no order id in payload' });

    const payment = await queryOne(`SELECT order_id FROM payments WHERE provider_order_id = $1`, [
      providerOrderId,
    ]);
    if (!payment) return res.json({ received: true, ignored: 'unknown order' });

    if (['payment.captured', 'order.paid'].includes(event.event)) {
      await markPaid({
        orderId: payment.order_id,
        providerOrderId,
        providerPaymentId: entity?.id,
        methodDetail: entity?.method,
        raw: event,
      });
    } else if (event.event === 'payment.failed') {
      await markFailed({
        orderId: payment.order_id,
        providerOrderId,
        description: entity?.error_description,
        raw: event,
      });
    }

    res.json({ received: true });
  })
);

/* ------------------------- customer endpoints ----------------------- */

paymentRouter.use(requireAuth);

paymentRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const { store } = await loadStoreContext();
    res.json({
      provider: gateway.name,
      enabled: isOnlinePaymentEnabled,
      keyId: gateway.publicKey,
      simulated: isSimulatedGateway,
      currency: config.payments.currency,
      upi: {
        enabled: storeAcceptsUpi(store),
        payeeName: store.upi_payee_name || store.name,
      },
    });
  })
);

/* ---------------------------- UPI QR payments ------------------------- */
/**
 * No gateway sits in this path. The QR is a plain UPI intent URI pointing at
 * the shop's VPA, so the server never learns on its own that money moved —
 * see lib/upi.js for why that shapes the two endpoints below.
 */

/** Show (or refresh) the QR for an order. */
paymentRouter.post(
  '/upi/intent',
  validate(z.object({ orderId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const { store } = await loadStoreContext();
    const intent = await openUpiIntent({
      orderId: req.body.orderId,
      userId: req.user.id,
      store,
    });
    res.json({ intent });
  })
);

/** "I have paid" — records the UTR and puts the order in the shop's queue. */
paymentRouter.post(
  '/upi/claim',
  validate(
    z.object({
      orderId: z.string().uuid(),
      reference: z
        .string()
        .trim()
        .regex(REFERENCE_PATTERN, 'Enter the UPI reference (UTR) exactly as your app shows it'),
    })
  ),
  asyncHandler(async (req, res) => {
    await claimUpiPayment({
      orderId: req.body.orderId,
      userId: req.user.id,
      reference: req.body.reference,
    });
    res.json({ order: await fetchOrder({ orderId: req.body.orderId, userId: req.user.id }) });
  })
);

/** Open a gateway order for an unpaid order and hand the browser its handle. */
paymentRouter.post(
  '/checkout',
  validate(z.object({ orderId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const order = await queryOne(`SELECT * FROM orders WHERE id = $1 AND user_id = $2`, [
      req.body.orderId,
      req.user.id,
    ]);
    if (!order) throw notFound('Order not found');
    if (order.payment_status === 'paid') throw badRequest('This order is already paid');
    if (order.status === 'cancelled') throw badRequest('That order was cancelled');
    if (order.payment_method !== 'razorpay') throw badRequest('This order is not an online payment');
    if (!isOnlinePaymentEnabled) {
      throw serviceUnavailable('Online payment is not switched on for this shop');
    }

    // Reuse the pending gateway order if the customer merely refreshed.
    const existing = await queryOne(
      `SELECT * FROM payments WHERE order_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      [order.id]
    );

    let providerOrderId = existing?.provider_order_id;
    if (!providerOrderId) {
      const created = await gateway.createOrder({
        amountPaise: order.total_paise,
        receipt: order.order_number,
        notes: { orderNumber: order.order_number, customer: req.user.phone },
      });
      providerOrderId = created.providerOrderId;
      await query(
        `INSERT INTO payments (order_id, provider, provider_order_id, amount_paise, currency, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          order.id,
          gateway.name,
          providerOrderId,
          order.total_paise,
          config.payments.currency,
          created.raw ?? {},
        ]
      );
    }

    res.json({
      provider: gateway.name,
      simulated: isSimulatedGateway,
      keyId: gateway.publicKey,
      providerOrderId,
      amountPaise: order.total_paise,
      currency: config.payments.currency,
      orderNumber: order.order_number,
      prefill: { name: req.user.name, contact: req.user.phone, email: req.user.email ?? '' },
    });
  })
);

/**
 * The browser posts back what the checkout widget returned. The signature is
 * what proves the payment happened — the ids alone are not trusted.
 */
paymentRouter.post(
  '/verify',
  validate(
    z.object({
      orderId: z.string().uuid(),
      providerOrderId: z.string().min(4),
      providerPaymentId: z.string().min(4),
      signature: z.string().min(8),
    })
  ),
  asyncHandler(async (req, res) => {
    const { orderId, providerOrderId, providerPaymentId, signature } = req.body;

    const payment = await queryOne(
      `SELECT p.* FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE p.order_id = $1 AND p.provider_order_id = $2 AND o.user_id = $3`,
      [orderId, providerOrderId, req.user.id]
    );
    if (!payment) throw notFound('We could not find that payment attempt');

    if (!gateway.verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature })) {
      await markFailed({
        orderId,
        providerOrderId,
        description: 'Signature verification failed',
        raw: { providerPaymentId },
      });
      throw badRequest('Payment could not be verified. If money was debited it will be refunded.');
    }

    await markPaid({
      orderId,
      providerOrderId,
      providerPaymentId,
      methodDetail: gateway.name,
      raw: { verifiedVia: 'checkout-callback' },
    });

    res.json({ order: await fetchOrder({ orderId, userId: req.user.id }) });
  })
);

/** Customer abandoned the payment sheet — release the stock straight away. */
paymentRouter.post(
  '/abandon',
  validate(z.object({ orderId: z.string().uuid(), reason: z.string().max(200).optional() })),
  asyncHandler(async (req, res) => {
    const order = await queryOne(`SELECT id FROM orders WHERE id = $1 AND user_id = $2`, [
      req.body.orderId,
      req.user.id,
    ]);
    if (!order) throw notFound('Order not found');
    await markFailed({
      orderId: order.id,
      providerOrderId: null,
      description: req.body.reason || 'Payment cancelled by customer',
      raw: {},
    });
    res.json({ ok: true });
  })
);

/**
 * Development only. Produces the payment id + signature that the real
 * Razorpay widget would hand back, so the whole verify path can be exercised
 * without live keys. Disabled whenever PAYMENT_PROVIDER=razorpay.
 */
paymentRouter.post(
  '/simulate',
  validate(z.object({ orderId: z.string().uuid(), outcome: z.enum(['success', 'failure']).default('success') })),
  asyncHandler(async (req, res) => {
    if (!isSimulatedGateway) throw forbidden('The simulated gateway is disabled');

    const payment = await queryOne(
      `SELECT p.* FROM payments p JOIN orders o ON o.id = p.order_id
        WHERE p.order_id = $1 AND o.user_id = $2 AND p.status = 'pending'
        ORDER BY p.created_at DESC LIMIT 1`,
      [req.body.orderId, req.user.id]
    );
    if (!payment) throw notFound('Start the checkout first');

    if (req.body.outcome === 'failure') {
      await markFailed({
        orderId: payment.order_id,
        providerOrderId: payment.provider_order_id,
        description: 'Payment declined by the (simulated) bank',
        raw: {},
      });
      return res.status(402).json({ error: { message: 'Payment declined by the (simulated) bank' } });
    }

    res.json(gateway.authorise(payment.provider_order_id));
  })
);
