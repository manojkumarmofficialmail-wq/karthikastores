import crypto from 'node:crypto';
import { config } from '../config.js';
import { ApiError, serviceUnavailable } from './errors.js';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

const basicAuthHeader = () =>
  'Basic ' +
  Buffer.from(`${config.payments.razorpayKeyId}:${config.payments.razorpayKeySecret}`).toString('base64');

const hmac = (secret, payload) =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex');

/** Constant-time compare so signature checks do not leak timing information. */
const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

/* ------------------------------ Razorpay ------------------------------ */

const razorpayGateway = {
  name: 'razorpay',
  isLive: true,
  publicKey: config.payments.razorpayKeyId,

  async createOrder({ amountPaise, receipt, notes }) {
    const response = await fetch(`${RAZORPAY_API}/orders`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: config.payments.currency,
        receipt,
        notes,
        payment_capture: 1,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const description = payload?.error?.description ?? 'Razorpay rejected the order';
      throw new ApiError(502, `Payment gateway error: ${description}`);
    }
    return {
      providerOrderId: payload.id,
      amountPaise: payload.amount,
      currency: payload.currency,
      raw: payload,
    };
  },

  verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }) {
    const expected = hmac(
      config.payments.razorpayKeySecret,
      `${providerOrderId}|${providerPaymentId}`
    );
    return safeEqual(expected, signature);
  },

  verifyWebhookSignature(rawBody, signature) {
    if (!config.payments.razorpayWebhookSecret) return false;
    return safeEqual(hmac(config.payments.razorpayWebhookSecret, rawBody), signature);
  },

  async fetchPayment(providerPaymentId) {
    const response = await fetch(`${RAZORPAY_API}/payments/${providerPaymentId}`, {
      headers: { Authorization: basicAuthHeader() },
    });
    if (!response.ok) throw serviceUnavailable('Could not reach the payment gateway');
    return response.json();
  },

  async refund({ providerPaymentId, amountPaise, notes }) {
    const response = await fetch(`${RAZORPAY_API}/payments/${providerPaymentId}/refund`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: amountPaise, speed: 'normal', notes }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const description = payload?.error?.description ?? 'the gateway refused the refund';
      throw new ApiError(502, `Refund failed: ${description}`);
    }
    return { refundId: payload.id, amountPaise: payload.amount, status: payload.status, raw: payload };
  },
};

/* --------------------------- Local simulator -------------------------- */
/**
 * Development gateway. It is *not* a stub of the verification logic: orders,
 * signatures and webhooks are produced with the same HMAC scheme Razorpay
 * uses, and the server verifies them through the identical code path. Only
 * the counterparty is local. config.js refuses to boot with this in
 * production.
 */
const simulatedSecret = crypto
  .createHash('sha256')
  .update(`${config.auth.jwtSecret}:simulated-gateway`)
  .digest('hex');

const simulatedGateway = {
  name: 'simulated',
  isLive: false,
  publicKey: 'sim_key_karthika',

  async createOrder({ amountPaise, receipt, notes }) {
    const providerOrderId = `sim_order_${crypto.randomBytes(9).toString('hex')}`;
    return {
      providerOrderId,
      amountPaise,
      currency: config.payments.currency,
      raw: { id: providerOrderId, amount: amountPaise, receipt, notes, simulated: true },
    };
  },

  verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }) {
    return safeEqual(hmac(simulatedSecret, `${providerOrderId}|${providerPaymentId}`), signature);
  },

  verifyWebhookSignature(rawBody, signature) {
    return safeEqual(hmac(simulatedSecret, rawBody), signature);
  },

  async fetchPayment(providerPaymentId) {
    return { id: providerPaymentId, status: 'captured', method: 'simulated' };
  },

  async refund({ providerPaymentId, amountPaise }) {
    const refundId = `sim_rfnd_${crypto.randomBytes(9).toString('hex')}`;
    return {
      refundId,
      amountPaise,
      status: 'processed',
      raw: { id: refundId, payment_id: providerPaymentId, amount: amountPaise, simulated: true },
    };
  },

  /** Dev-only: mint the payment id + signature the real checkout widget returns. */
  authorise(providerOrderId) {
    const providerPaymentId = `sim_pay_${crypto.randomBytes(9).toString('hex')}`;
    return {
      providerOrderId,
      providerPaymentId,
      signature: hmac(simulatedSecret, `${providerOrderId}|${providerPaymentId}`),
    };
  },
};

/* ---------------------------- No gateway ----------------------------- */
/**
 * PAYMENT_PROVIDER=none. The shop takes cash or UPI on handover only. Every
 * online-payment route is closed off at the door rather than half-working, and
 * signature checks answer false so a stray webhook can never mark an order paid.
 */
const disabledGateway = {
  name: 'none',
  isLive: false,
  publicKey: '',

  async createOrder() {
    throw serviceUnavailable(
      'Online payment is not switched on for this shop. Pay on delivery or at the counter.'
    );
  },
  verifyCheckoutSignature: () => false,
  verifyWebhookSignature: () => false,
  async fetchPayment() {
    throw serviceUnavailable('Online payment is not switched on for this shop');
  },
  async refund() {
    throw serviceUnavailable('Online payment is not switched on for this shop');
  },
};

const GATEWAYS = {
  none: disabledGateway,
  simulated: simulatedGateway,
  razorpay: razorpayGateway,
};

export const gateway = GATEWAYS[config.payments.provider];

export const isSimulatedGateway = gateway.name === 'simulated';

/** False when PAYMENT_PROVIDER=none — the UI hides "Pay online" entirely. */
export const isOnlinePaymentEnabled = config.payments.onlineEnabled;
