import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, roadDistanceKm, quoteDelivery } from '../src/lib/geo.js';

const shop = { latitude: 10.5276, longitude: 76.2144 }; // Thrissur Round
const store = {
  ...shop,
  max_delivery_radius_km: 5,
  min_order_paise: 9900,
  base_prep_minutes: 20,
  minutes_per_km: 5,
};
const zones = [
  { name: 'Free delivery zone', max_distance_km: 5, delivery_fee_paise: 0, min_order_paise: 9900, eta_minutes: 45 },
];

test('haversine returns zero for the same point', () => {
  assert.equal(haversineKm(shop, shop), 0);
});

test('haversine matches a known Thrissur distance', () => {
  // Round -> Ollur is a little under 9 km as the crow flies.
  const km = haversineKm(shop, { latitude: 10.453, longitude: 76.245 });
  assert.ok(km > 8.5 && km < 9.5, `expected ~8.9 km, got ${km}`);
});

test('road distance applies the detour factor', () => {
  const straight = haversineKm(shop, { latitude: 10.537, longitude: 76.22 });
  assert.equal(roadDistanceKm(shop, { latitude: 10.537, longitude: 76.22 }), Math.round(straight * 1.3 * 100) / 100);
});

test('an address inside the radius is serviceable and free', () => {
  const quote = quoteDelivery(store, zones, { latitude: 10.537, longitude: 76.22 }, 50000);
  assert.equal(quote.serviceable, true);
  assert.equal(quote.deliveryFeePaise, 0);
  assert.ok(quote.distanceKm < 5);
  // 20 min prep + 5 min per km
  assert.equal(quote.etaMinutes, 20 + Math.ceil(quote.distanceKm * 5));
});

test('an address outside the radius is refused with a readable reason', () => {
  const quote = quoteDelivery(store, zones, { latitude: 10.42, longitude: 76.14 }, 50000);
  assert.equal(quote.serviceable, false);
  assert.match(quote.reason, /5 km/);
  assert.ok(quote.distanceKm > 5);
});

test('an order below the minimum is refused even when nearby', () => {
  const quote = quoteDelivery(store, zones, { latitude: 10.537, longitude: 76.22 }, 5000);
  assert.equal(quote.serviceable, false);
  assert.match(quote.reason, /Minimum order/);
});

test('subtotal 0 (a bare address check) skips the minimum order rule', () => {
  const quote = quoteDelivery(store, zones, { latitude: 10.537, longitude: 76.22 }, 0);
  assert.equal(quote.serviceable, true);
});
