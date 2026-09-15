/**
 * Central configuration. Everything the app needs from the environment is
 * read exactly once, here, so a missing variable fails loudly at boot
 * instead of at the first request that happens to need it.
 */
const required = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${key}. ` +
        'Copy server/.env.example to server/.env and fill it in.'
    );
  }
  return value;
};

const optional = (key, fallback) => process.env[key] ?? fallback;
const int = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${key} must be an integer`);
  return parsed;
};
const bool = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
};

const env = optional('NODE_ENV', 'development');
const isProduction = env === 'production';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && isProduction) {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  env,
  isProduction,
  port: int('PORT', 4000),
  /**
   * How many reverse proxies sit in front of the API. Rate limiting buckets on
   * the client IP, so trusting a hop that is not really there would let a
   * client spoof X-Forwarded-For and get a fresh budget per request. Behind
   * Render/Fly/Nginx set TRUST_PROXY=1; direct-to-node leaves it at 0.
   */
  trustProxy: int('TRUST_PROXY', isProduction ? 1 : 0),
  // Comma separated list of origins allowed to call the API with cookies.
  // The dev default covers Vite's dev server and its preview build on both
  // hostnames a browser might resolve to.
  corsOrigins: optional(
    'CORS_ORIGINS',
    [5173, 4173].flatMap((port) => [`http://localhost:${port}`, `http://127.0.0.1:${port}`]).join(',')
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  database: {
    url: required('DATABASE_URL'),
    // Neon always speaks TLS. Local Postgres usually does not.
    ssl: bool('DATABASE_SSL', /neon\.tech|sslmode=require/.test(process.env.DATABASE_URL ?? '')),
    poolMax: int('DATABASE_POOL_MAX', 10),
  },

  auth: {
    // Dev fallback keeps `npm run dev` working before anyone edits .env;
    // production refuses to start without a real secret (checked above).
    jwtSecret: jwtSecret ?? 'karthika-stores-development-secret-do-not-use-in-production',
    accessTokenTtl: optional('ACCESS_TOKEN_TTL', '30m'),
    refreshTokenDays: int('REFRESH_TOKEN_DAYS', 30),
    bcryptRounds: int('BCRYPT_ROUNDS', 10),
    cookieName: 'ks_refresh',
    cookieSecure: bool('COOKIE_SECURE', isProduction),
    cookieSameSite: optional('COOKIE_SAMESITE', isProduction ? 'none' : 'lax'),
  },

  payments: {
    /**
     * 'none'      — no online payment. Customers pay the rider or the counter.
     *               The default, so a fresh clone runs with zero payment setup.
     * 'simulated' — local development gateway: the checkout flow, the
     *               signature and the webhook are all exercised for real,
     *               but the order is signed locally instead of by Razorpay.
     *               Refused in production.
     * 'razorpay'  — talk to the real Razorpay API (test or live keys).
     */
    provider: optional('PAYMENT_PROVIDER', 'none'),
    razorpayKeyId: optional('RAZORPAY_KEY_ID', ''),
    razorpayKeySecret: optional('RAZORPAY_KEY_SECRET', ''),
    razorpayWebhookSecret: optional('RAZORPAY_WEBHOOK_SECRET', ''),
    currency: 'INR',
  },

  seed: {
    adminPhone: optional('SEED_ADMIN_PHONE', '9876500001'),
    adminPassword: optional('SEED_ADMIN_PASSWORD', 'Admin@12345'),
    customerPhone: optional('SEED_CUSTOMER_PHONE', '9876500002'),
    customerPassword: optional('SEED_CUSTOMER_PASSWORD', 'Customer@123'),
  },
};

const KNOWN_PROVIDERS = ['none', 'simulated', 'razorpay'];
if (!KNOWN_PROVIDERS.includes(config.payments.provider)) {
  throw new Error(
    `PAYMENT_PROVIDER must be one of ${KNOWN_PROVIDERS.join(', ')} — got "${config.payments.provider}"`
  );
}

/** Is there a gateway at all? Everything online-payment branches on this. */
config.payments.onlineEnabled = config.payments.provider !== 'none';

if (config.isProduction && config.payments.provider === 'simulated') {
  throw new Error(
    'PAYMENT_PROVIDER=simulated cannot be used in production. ' +
      'Set PAYMENT_PROVIDER=razorpay with live keys.'
  );
}

if (config.payments.provider === 'razorpay') {
  if (!config.payments.razorpayKeyId || !config.payments.razorpayKeySecret) {
    throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when PAYMENT_PROVIDER=razorpay');
  }
}
