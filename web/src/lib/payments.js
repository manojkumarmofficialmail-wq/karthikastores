import { api } from './api.js';

/* ------------------------------ UPI QR -------------------------------- */
/**
 * The QR path has no gateway and no SDK: the server returns a UPI intent URI
 * and the matching SVG, the customer pays from their own UPI app, and the
 * shop confirms the money landed. `claimUpiPayment` records what the customer
 * says — it never marks the order paid.
 */
export const openUpiIntent = async (orderId) => {
  const { intent } = await api.post('/payments/upi/intent', { orderId });
  return intent;
};

export const claimUpiPayment = async ({ orderId, reference }) => {
  const { order } = await api.post('/payments/upi/claim', { orderId, reference });
  return order;
};

/* ----------------------------- Razorpay -------------------------------- */
/* Present and idle until PAYMENT_PROVIDER=razorpay. Nothing below runs while
   the shop is on UPI QR only. */

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

let scriptPromise = null;

const loadRazorpayScript = () => {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load the payment window. Check your connection.'));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
};

/**
 * Drive an order through the payment gateway.
 *
 * With real Razorpay keys this opens the hosted checkout and posts the
 * returned signature back for verification. With the local simulator it asks
 * the UI (via `confirmSimulated`) what should happen, then runs the *same*
 * verification endpoint with a server-signed payload — so the code path being
 * exercised in development is the code path that runs in production.
 *
 * Resolves with the paid order, or throws with a message worth showing.
 */
export const payForOrder = async ({ orderId, customer, confirmSimulated }) => {
  const session = await api.post('/payments/checkout', { orderId });

  if (session.simulated) {
    const outcome = await confirmSimulated({
      amountPaise: session.amountPaise,
      orderNumber: session.orderNumber,
    });
    if (outcome === 'cancel') {
      await api.post('/payments/abandon', { orderId, reason: 'Closed the payment sheet' });
      throw new Error('Payment cancelled');
    }
    const signed = await api.post('/payments/simulate', { orderId, outcome });
    const { order } = await api.post('/payments/verify', {
      orderId,
      providerOrderId: signed.providerOrderId,
      providerPaymentId: signed.providerPaymentId,
      signature: signed.signature,
    });
    return order;
  }

  await loadRazorpayScript();

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: session.keyId,
      amount: session.amountPaise,
      currency: session.currency,
      name: 'Karthika Stores',
      description: `Order ${session.orderNumber}`,
      order_id: session.providerOrderId,
      prefill: session.prefill ?? customer,
      theme: { color: '#1f8a4c' },
      handler: async (response) => {
        try {
          const { order } = await api.post('/payments/verify', {
            orderId,
            providerOrderId: response.razorpay_order_id,
            providerPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          resolve(order);
        } catch (error) {
          reject(error);
        }
      },
      modal: {
        ondismiss: async () => {
          await api.post('/payments/abandon', { orderId, reason: 'Closed the payment sheet' }).catch(() => {});
          reject(new Error('Payment cancelled'));
        },
      },
    });

    checkout.on('payment.failed', (event) => {
      reject(new Error(event?.error?.description ?? 'The payment did not go through'));
    });
    checkout.open();
  });
};
