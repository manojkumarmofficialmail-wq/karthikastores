import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_FLOW, nextStatuses } from '../src/lib/orders.js';

test('a delivery order is never offered the pickup-only step', () => {
  assert.deepEqual(nextStatuses({ status: 'preparing', fulfilment: 'delivery' }), [
    'out_for_delivery',
    'cancelled',
  ]);
});

test('a pickup order is never offered the delivery-only step', () => {
  assert.deepEqual(nextStatuses({ status: 'preparing', fulfilment: 'pickup' }), [
    'ready_for_pickup',
    'cancelled',
  ]);
});

test('delivered and cancelled are terminal', () => {
  assert.deepEqual(nextStatuses({ status: 'delivered', fulfilment: 'pickup' }), []);
  assert.deepEqual(nextStatuses({ status: 'cancelled', fulfilment: 'delivery' }), []);
});

test('every status in the flow points only at known statuses', () => {
  const known = new Set(Object.keys(STATUS_FLOW));
  for (const [status, targets] of Object.entries(STATUS_FLOW)) {
    for (const target of targets) {
      assert.ok(known.has(target), `${status} -> ${target} is not a known status`);
    }
  }
});

test('both fulfilment types can reach delivered from confirmed', () => {
  for (const fulfilment of ['delivery', 'pickup']) {
    let status = 'confirmed';
    const seen = [status];
    while (status !== 'delivered' && seen.length < 8) {
      const next = nextStatuses({ status, fulfilment }).find((s) => s !== 'cancelled');
      assert.ok(next, `stuck at ${status} for ${fulfilment}`);
      status = next;
      seen.push(status);
    }
    assert.equal(status, 'delivered');
  }
});
