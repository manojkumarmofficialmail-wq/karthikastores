/**
 * Startup file for hosts whose control panel expects one at the project root
 * (Hostinger's Node.js app selector, cPanel/Passenger, and similar), and the
 * file to run for a plain `node app.js` locally.
 *
 * The real server lives in server/src/index.js; this only prepares the
 * environment and forwards to it, so the panel and `npm start` launch the
 * exact same process.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(root, 'server', '.env');

/**
 * On a managed host the environment comes from the panel and there is no .env
 * — that is the intended setup. Locally there is a .env and no environment, so
 * load it rather than failing with "Missing required environment variable" next
 * to a file that has the answer in it.
 *
 * The guard is DATABASE_URL because it is the one variable the app cannot start
 * without: if it is already set, the environment is configured and must win, so
 * a stray .env can never quietly override production settings.
 */
if (!process.env.DATABASE_URL && fs.existsSync(envFile)) {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envFile);
    console.log('[api] loaded configuration from server/.env');
  } else {
    // process.loadEnvFile arrived in Node 20.12. Older 20.x gets a clear
    // instruction instead of a confusing missing-variable error.
    console.warn(
      `[api] found server/.env but this Node (${process.version}) cannot read it.\n` +
        '[api] upgrade to Node 20.12+ or export the variables before starting.'
    );
  }
}

await import('./server/src/index.js');
