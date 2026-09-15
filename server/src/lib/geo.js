const EARTH_RADIUS_KM = 6371;
const toRadians = (deg) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in kilometres. Accurate to well under a percent at
 * neighbourhood scale, which is all a 5 km delivery radius needs — and it
 * costs nothing, unlike a routing API call per address.
 */
export const haversineKm = (from, to) => {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
};

/**
 * Straight-line distance under-reports how far a rider actually travels.
 * 1.3 is the usual detour factor for a dense Indian town grid.
 */
export const ROAD_DETOUR_FACTOR = 1.3;

export const roadDistanceKm = (from, to) =>
  Math.round(haversineKm(from, to) * ROAD_DETOUR_FACTOR * 100) / 100;

/**
 * Resolve the delivery quote for a point.
 *
 * @param {object} store       store_settings row
 * @param {Array}  zones       delivery_zones rows ordered by max_distance_km
 * @param {object} point       { latitude, longitude }
 * @param {number} subtotalPaise
 */
export const quoteDelivery = (store, zones, point, subtotalPaise = 0) => {
  const distanceKm = roadDistanceKm(
    { latitude: Number(store.latitude), longitude: Number(store.longitude) },
    point
  );

  const zone = zones.find((z) => distanceKm <= Number(z.max_distance_km));
  const maxRadius = Number(store.max_delivery_radius_km);

  if (!zone || distanceKm > maxRadius) {
    return {
      serviceable: false,
      distanceKm,
      maxRadiusKm: maxRadius,
      reason: `We deliver free within ${maxRadius} km of the shop. Your location is about ${distanceKm} km away — you can still choose store pickup.`,
      deliveryFeePaise: 0,
      etaMinutes: null,
      zoneName: null,
    };
  }

  const minOrder = Math.max(Number(zone.min_order_paise), Number(store.min_order_paise));
  if (subtotalPaise > 0 && subtotalPaise < minOrder) {
    return {
      serviceable: false,
      distanceKm,
      maxRadiusKm: maxRadius,
      reason: `Minimum order for delivery is ₹${(minOrder / 100).toFixed(0)}. Add a little more, or switch to store pickup.`,
      deliveryFeePaise: Number(zone.delivery_fee_paise),
      minOrderPaise: minOrder,
      etaMinutes: zone.eta_minutes,
      zoneName: zone.name,
    };
  }

  const etaMinutes =
    Number(store.base_prep_minutes) + Math.ceil(distanceKm * Number(store.minutes_per_km));

  return {
    serviceable: true,
    distanceKm,
    maxRadiusKm: maxRadius,
    deliveryFeePaise: Number(zone.delivery_fee_paise),
    minOrderPaise: minOrder,
    etaMinutes,
    zoneName: zone.name,
    reason: null,
  };
};
