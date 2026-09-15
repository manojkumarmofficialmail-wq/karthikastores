import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { gateway, isSimulatedGateway } from '../src/lib/gateway.js';

test('the test environment uses the simulated gateway', () => {
  assert.equal(isSimulatedGateway, true);
});

test('a signature produced by the gateway verifies', async () => {
  const order = await gateway.createOrder({ amountPaise: 12345, receipt: 'KS-TEST-1', notes: {} });
  const authorised = gateway.authorise(order.providerOrderId);
  assert.equal(gateway.verifyCheckoutSignature(authorised), true);
});

test('a tampered payment id fails verification', async () => {
  const order = await gateway.createOrder({ amountPaise: 100, receipt: 'KS-TEST-2', notes: {} });
  const authorised = gateway.authorise(order.providerOrderId);
  assert.equal(
    gateway.verifyCheckoutSignature({ ...authorised, providerPaymentId: 'pay_tampered' }),
    false
  );
});

test('a signature of the wrong length is rejected without throwing', async () => {
  const order = await gateway.createOrder({ amountPaise: 100, receipt: 'KS-TEST-3', notes: {} });
  const authorised = gateway.authorise(order.providerOrderId);
  assert.equal(gateway.verifyCheckoutSignature({ ...authorised, signature: 'short' }), false);
});

test('a refund returns a reference and the amount it returned', async () => {
  const order = await gateway.createOrder({ amountPaise: 45000, receipt: 'KS-TEST-4', notes: {} });
  const authorised = gateway.authorise(order.providerOrderId);

  const refund = await gateway.refund({
    providerPaymentId: authorised.providerPaymentId,
    amountPaise: 45000,
    notes: { reason: 'cancelled' },
  });

  assert.ok(refund.refundId, 'a refund must carry a reference for the books');
  assert.equal(refund.amountPaise, 45000);
  assert.ok(['processed', 'pending'].includes(refund.status));
});

test('webhook signatures are verified over the exact raw body', () => {
  const secret = crypto
    .createHash('sha256')
    .update(`${process.env.JWT_SECRET ?? 'karthika-stores-development-secret-do-not-use-in-production'}:simulated-gateway`)
    .digest('hex');
  const body = JSON.stringify({ event: 'payment.captured' });
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  assert.equal(gateway.verifyWebhookSignature(body, signature), true);
  assert.equal(gateway.verifyWebhookSignature(`${body} `, signature), false);
  assert.equal(gateway.verifyWebhookSignature(body, 'nope'), false);
});
