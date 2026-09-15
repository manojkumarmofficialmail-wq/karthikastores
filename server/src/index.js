import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, query } from './db.js';
import { gateway } from './lib/gateway.js';

const start = async () => {
  try {
    await query('SELECT 1');
    console.log('[api] database connection ok');
  } catch (error) {
    console.error('[api] cannot reach the database:', error.message);
    console.error('[api] check DATABASE_URL in server/.env (Neon connection string)');
    process.exit(1);
  }

  const server = createApp().listen(config.port, () => {
    console.log(`[api] Karthika Stores API on http://localhost:${config.port}`);
    console.log(`[api] env=${config.env} payments=${gateway.name}`);
    if (gateway.name === 'none') {
      console.log(
        '[api] online payment is off — orders are pay-on-delivery / pay-at-store.\n' +
          '[api] set PAYMENT_PROVIDER=simulated to try the online flow locally, or razorpay with real keys'
      );
    } else if (!gateway.isLive) {
      console.log('[api] payment gateway is the local simulator — set PAYMENT_PROVIDER=razorpay for real keys');
    }
  });

  const shutdown = (signal) => async () => {
    console.log(`\n[api] ${signal} received, shutting down`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    // Do not let a hung socket keep the process alive forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));
};

start();
