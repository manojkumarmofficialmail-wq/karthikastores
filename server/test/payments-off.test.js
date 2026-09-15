import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * PAYMENT_PROVIDER=none is the default, so these run in their own process with
 * the variable cleared — the other suites pin it to 'simulated'.
 */
process.env.PAYMENT_PROVIDER = 'none';

const { config } = await import('../src/config.js');
const { gateway, isOnlinePaymentEnabled, isSimulatedGateway } = await import('../src/lib/gateway.js');

test('no gateway is configured', () => {
  assert.equal(config.payments.provider, 'none');
  assert.equal(isOnlinePaymentEnabled, false);
  assert.equal(isSimulatedGateway, false);
  assert.equal(gateway.name, 'none');
});

test('opening a gateway order is refused, not silently faked', async () => {
  await assert.rejects(
    () => gateway.createOrder({ amountPaise: 10000, receipt: 'KS-1', notes: {} }),
    (error) => error.status === 503 && /not switched on/i.test(error.message)
  );
});

test('a refund cannot be attempted without a gateway', async () => {
  await assert.rejects(() => gateway.refund({ providerPaymentId: 'x', amountPaise: 1 }));
});

test('signature checks fail closed so a stray webhook cannot mark an order paid', () => {
  assert.equal(gateway.verifyWebhookSignature('{"event":"payment.captured"}', 'anything'), false);
  assert.equal(
    gateway.verifyCheckoutSignature({ providerOrderId: 'o', providerPaymentId: 'p', signature: 's' }),
    false
  );
});
