import pg from 'pg';
import { config } from './config.js';

/**
 * Postgres numeric columns come back as strings by default because they can
 * exceed IEEE-754 range. Every numeric in this schema is a small money or
 * distance value, so parsing them to Number keeps the API JSON clean.
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => (value === null ? null : Number(value)));
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => (value === null ? null : Number(value)));

export const pool = new pg.Pool({
  connectionString: config.database.url,
  ssl: config.database.ssl ? { rejectUnauthorized: true } : false,
  max: config.database.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // An idle client blew up (Neon scales to zero and drops idle sockets).
  // The pool replaces it; log and carry on rather than crashing the API.
  console.error('[db] idle client error:', err.message);
});

/** Run a parameterised query. Never interpolate user input into SQL. */
export const query = (text, params) => pool.query(text, params);

/** Convenience: first row or null. */
export const queryOne = async (text, params) => {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
};

/**
 * Run `fn` inside a transaction, rolling back on any thrown error.
 * The callback receives a dedicated client — use it for every statement
 * in the unit of work, not the module-level `query`.
 */
export const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[db] rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
};

export const closePool = () => pool.end();
