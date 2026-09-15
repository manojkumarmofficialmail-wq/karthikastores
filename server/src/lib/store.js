import { query, queryOne } from '../db.js';

/** The shop row + its delivery bands. Small and hot, so it is cached briefly. */
let cache = null;
let cachedAt = 0;
const TTL_MS = 30_000;

export const loadStoreContext = async ({ fresh = false } = {}) => {
  if (!fresh && cache && Date.now() - cachedAt < TTL_MS) return cache;

  const store = await queryOne(`SELECT * FROM store_settings WHERE id = 1`);
  if (!store) {
    throw new Error('store_settings is empty — run `npm run db:seed` in server/');
  }
  const { rows: zones } = await query(
    `SELECT * FROM delivery_zones WHERE is_active ORDER BY max_distance_km ASC`
  );

  cache = { store, zones };
  cachedAt = Date.now();
  return cache;
};

export const invalidateStoreCache = () => {
  cache = null;
};

/** Is the shop open at `when` (server local time)? */
export const isStoreOpen = (store, when = new Date()) => {
  const minutes = when.getHours() * 60 + when.getMinutes();
  const [oh, om] = String(store.opens_at).split(':').map(Number);
  const [ch, cm] = String(store.closes_at).split(':').map(Number);
  return minutes >= oh * 60 + om && minutes <= ch * 60 + cm;
};

/**
 * Next few pickup / delivery slots, in 45 minute steps, starting once the
 * store has had `base_prep_minutes` to pack the order.
 */
export const buildSlots = (store, { count = 8, from = new Date() } = {}) => {
  const slots = [];
  const [oh, om] = String(store.opens_at).split(':').map(Number);
  const [ch, cm] = String(store.closes_at).split(':').map(Number);

  const cursor = new Date(from.getTime() + store.base_prep_minutes * 60_000);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(Math.ceil(cursor.getMinutes() / 15) * 15);

  for (let guard = 0; slots.length < count && guard < 200; guard += 1) {
    const openAt = new Date(cursor);
    openAt.setHours(oh, om, 0, 0);
    const closeAt = new Date(cursor);
    closeAt.setHours(ch, cm, 0, 0);

    if (cursor < openAt) cursor.setTime(openAt.getTime());
    if (cursor > new Date(closeAt.getTime() - 45 * 60_000)) {
      // Past today's last usable slot — roll to tomorrow's opening time.
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(oh, om, 0, 0);
      continue;
    }

    const end = new Date(cursor.getTime() + 45 * 60_000);
    slots.push({ start: cursor.toISOString(), end: end.toISOString() });
    cursor.setTime(end.getTime());
  }
  return slots;
};
