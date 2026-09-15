/**
 * Applies db/schema.sql. The schema is written to be idempotent, so running
 * this repeatedly is safe.
 *
 *   node db/migrate.js           apply
 *   node db/migrate.js --fresh   drop every table first (destroys all data)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fresh = process.argv.includes('--fresh');

const DROP_SQL = `
  DROP TABLE IF EXISTS order_status_history, payments, order_items, orders,
                       cart_items, carts, addresses, refresh_tokens, users,
                       products, categories, delivery_zones, pincode_centroids,
                       store_settings CASCADE;
  DROP SEQUENCE IF EXISTS order_number_seq;
  DROP TYPE IF EXISTS user_role, fulfilment_type, order_status, payment_status, payment_method CASCADE;
`;

/**
 * Enum labels added after the first release. These cannot live in schema.sql:
 * node-pg sends a multi-statement script as one implicit transaction, and a
 * newly added enum label may not be used until the transaction that added it
 * has committed. Run standalone, each statement auto-commits.
 */
const ENUM_TOPUPS = [
  `ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'upi_qr'`,
  `ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'submitted'`,
];

const run = async () => {
  const client = await pool.connect();
  try {
    if (fresh) {
      console.log('[migrate] --fresh: dropping existing objects');
      await client.query(DROP_SQL);
    }
    const sql = await fs.readFile(path.join(here, 'schema.sql'), 'utf8');
    await client.query(sql);
    for (const statement of ENUM_TOPUPS) {
      await client.query(statement);
    }
    console.log('[migrate] schema applied');
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error('[migrate] failed:', error.message);
  process.exit(1);
});
