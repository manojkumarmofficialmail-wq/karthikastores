import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { config } from './config.js';
import { query } from './db.js';
import { authRouter } from './routes/auth.js';
import { storeRouter } from './routes/store.js';
import { catalogRouter } from './routes/catalog.js';
import { cartRouter } from './routes/cart.js';
import { addressRouter } from './routes/addresses.js';
import { orderRouter } from './routes/orders.js';
import { paymentRouter } from './routes/payments.js';
import { adminRouter } from './routes/admin.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { ApiError } from './lib/errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const createApp = () => {
  const app = express();

  // Behind Render/Fly/Nginx the client IP arrives in X-Forwarded-For; the
  // rate limiter needs it to bucket per client rather than per proxy. Trusting
  // more hops than actually exist would let a client forge that header.
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      // The SPA is served from a different origin in dev, and the Razorpay
      // checkout script is injected into the page at runtime.
      contentSecurityPolicy: config.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
              frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
              connectSrc: ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
              imgSrc: ["'self'", 'data:', 'https:'],
              styleSrc: ["'self'", "'unsafe-inline'"],
            },
          }
        : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;
      // Same-origin and server-to-server calls arrive without an Origin. A
      // same-origin request *can* still carry one (Vite tags its bundles with
      // `crossorigin`, and preflights always do), so the request's own host
      // is always allowed — otherwise the API would refuse to serve the very
      // SPA it is hosting.
      const selfOrigin = `${req.protocol}://${req.get('host')}`;
      if (!origin || origin === selfOrigin || config.corsOrigins.includes(origin)) {
        return callback(null, { origin: true, credentials: true });
      }
      // A typed error so the client gets a clean 403 instead of a stack trace.
      callback(new ApiError(403, `Origin ${origin} is not allowed to call this API`));
    })
  );

  if (!config.isProduction) app.use(morgan('dev'));
  app.use(cookieParser());

  // The webhook signature is computed over the exact bytes Razorpay sent, so
  // this route must see the raw body — mount it before the JSON parser.
  app.use('/api/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }));
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));

  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: config.isProduction ? 240 : 2000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { message: 'You are going a bit fast — please retry in a minute.' } },
    })
  );

  app.get('/api/health', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({ ok: true, service: 'karthika-stores-api', database: 'up', env: config.env });
    } catch (error) {
      res.status(503).json({ ok: false, database: 'down', message: error.message });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/store', storeRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/addresses', addressRouter);
  app.use('/api/orders', orderRouter);
  app.use('/api/payments', paymentRouter);
  app.use('/api/admin', adminRouter);

  // In production the API also serves the built SPA, so the whole app is one
  // deployable. In dev, Vite serves it on :5173 and this block is skipped.
  const webDist = path.resolve(here, '../../web/dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  } else if (config.isProduction) {
    // The API is healthy but nobody ran `npm run build`. Say so plainly
    // instead of letting the domain answer with a bare framework 404.
    console.warn(
      '[api] web/dist is missing — the API is up but the storefront is not built.\n' +
        '[api] run `npm run build` in the project root, then restart.'
    );
    app.get(/^(?!\/api\/).*/, (_req, res) =>
      res.status(503).type('text/plain').send(
        'Karthika Stores: the API is running, but the storefront has not been built.\n\n' +
          'Run `npm run build` in the project root (it writes web/dist), then restart the app.\n' +
          'The API itself is fine — check /api/health.'
      )
    );
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
};
