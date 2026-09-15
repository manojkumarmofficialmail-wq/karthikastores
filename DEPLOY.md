# Deploying Karthika Stores

Written for **Hostinger's Node.js hosting** (hPanel → Node.js app), but the
environment table and the gotchas apply to any Node host — Render, Railway, Fly,
a VPS with PM2.

The app deploys as **one service**: the Express API also serves the built React
app, so there is no separate frontend host and no CORS to configure between them.

---

## Before you start

| Thing | Why |
| --- | --- |
| Node **20 or newer** selected in the panel | The code uses Node 20+ APIs |
| A **Neon** database | Hostinger shared hosting gives you MySQL, not PostgreSQL — the database has to be external. Neon's free tier is enough to start |
| SSL on your domain | Cookies are sent with `Secure`; the app will not stay signed in over plain HTTP |
| The shop's UPI ID | **Required before the first live order.** Not an environment variable — set it in the dashboard at **Store → Settings → UPI**. Every scanned rupee goes to whatever it resolves to, and cannot be pulled back |
| Razorpay keys | **Optional.** Leave `PAYMENT_PROVIDER=none` and the shop takes UPI QR plus cash on handover. Add them whenever you want card and netbanking too |

---

## 1. Get the code onto the server

**Git (preferred).** hPanel has a Git section — point it at your repository and
branch, with the deploy path as your application root (e.g. `/home/uXXXX/karthikastores`).

**Or upload.** Zip the project *without* `node_modules`, upload through File
Manager, extract into the application root.

Either way the layout on the server must stay:

```
<application root>/
  app.js            ← startup file
  package.json
  server/
  web/dist/         ← built frontend (step 2)
```

## 2. Build the frontend

The API serves `web/dist`. It must exist on the server or you get the API with
no website.

A `.npmrc` in the repo root sets `include=dev` so this works even when the
platform installs with `NODE_ENV=production` — without it npm skips
devDependencies, Vite is never installed, and the build dies with
`sh: 1: vite: not found` (exit code 127). That is the single most common way
this deploy fails.

**Over SSH** (Business plans and up):

```bash
cd ~/karthikastores
npm install          # includes dev deps — Vite needs them to build
npm run build        # writes web/dist
```

**If the build runs out of memory** on a shared plan, build on your own machine
instead and upload the `web/dist` folder. `dist/` is gitignored, so a Git deploy
will never bring it for you.

## 3. Trim the dependencies (optional)

Over SSH, once the build has produced `web/dist`:

```bash
npm ci --omit=dev
```

This drops Vite and the other build-time packages. Only do it *after* the build,
and skip it entirely if the platform runs its own install step — a managed
pipeline will reinstall on the next deploy anyway.

## 4. Set the environment variables

In the panel's Node.js app there is an environment-variables section. Add the
rows from the table below. **Do not upload a `.env` file** — the panel's
variables are what the process actually gets, and a stray `.env` in the repo is
a credential leak waiting to happen.

### Required

| Variable | Value | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Turns on CSP and secure cookies, hides stack traces, and refuses the simulated payment gateway |
| `DATABASE_URL` | `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/karthika?sslmode=require` | Use Neon's **pooled** string (the host has `-pooler` in it). Keep `?sslmode=require` |
| `JWT_SECRET` | a long random string | Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. The app refuses to start in production without it |
| `CORS_ORIGINS` | `https://yourdomain.com,https://www.yourdomain.com` | Both the www and non-www forms if both resolve |
| `TRUST_PROXY` | `1` | Hostinger puts a proxy in front of the app. Rate limiting buckets on the client IP, and this tells the app how many hops to trust — see the warning below |
| `COOKIE_SECURE` | `true` | The refresh cookie only travels over HTTPS |
| `COOKIE_SAMESITE` | `lax` | Correct for this single-origin deploy. Only use `none` if you ever split the API onto a different domain |

### Payments

**UPI QR needs nothing in this file.** The shop's UPI ID lives in the database
and is edited from the dashboard, so it can be corrected without a redeploy.
Set it before taking orders:

1. Sign in as the shop admin → **Store → Settings → UPI**.
2. Type the shop's UPI ID (`name@bank`) and the name to show in the customer's
   UPI app. Check it character by character.
3. Place one ₹1 test order and pay it yourself, then confirm it from
   **Orders → Verify payment**. That exercises the whole path — QR, claim,
   confirmation — before a customer does.

Somebody has to watch the shop's bank alerts during opening hours: a UPI order
sits in the verification queue until a person confirms it. If nobody is free,
switch **Offer UPI QR at checkout** off in the same screen and the shop falls
back to pay-on-handover.

### Card and netbanking (optional)

Skip this whole block to launch on UPI alone — set `PAYMENT_PROVIDER=none` (or
leave it unset). Add these later and restart; nothing else changes.

| Variable | Value |
| --- | --- |
| `PAYMENT_PROVIDER` | `razorpay` |
| `RAZORPAY_KEY_ID` | `rzp_test_…` while testing, `rzp_live_…` when you go live |
| `RAZORPAY_KEY_SECRET` | from the Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | the secret you type when creating the webhook (step 6) |

`PAYMENT_PROVIDER=simulated` is a development-only gateway and the app will
**refuse to boot** with it when `NODE_ENV=production`. That is deliberate.

### Optional (sensible defaults already)

| Variable | Default | When to change |
| --- | --- | --- |
| `PORT` | `4000` | Only if the panel does not set it for you. Most panels do — leave it alone unless the app fails to bind |
| `DATABASE_POOL_MAX` | `10` | Drop to `5` on a small Neon plan |
| `DATABASE_SSL` | auto-detected | Already `true` for any `neon.tech` URL |
| `ACCESS_TOKEN_TTL` | `30m` | Session length before a silent refresh |
| `REFRESH_TOKEN_DAYS` | `30` | How long "stay signed in" lasts |
| `BCRYPT_ROUNDS` | `10` | `12` is stronger but slower on shared CPU |

### Seeding only

`SEED_ADMIN_PHONE`, `SEED_ADMIN_PASSWORD`, `SEED_CUSTOMER_PHONE`,
`SEED_CUSTOMER_PASSWORD` are read **only** by `npm run db:seed`. See the warning
in step 5 — never seed production with the defaults.

## 5. Create the schema and load the catalogue

Neon is reachable from anywhere, so the easiest path is to run this **from your
own laptop** against the production database — no SSH needed:

```bash
# in a local checkout, with the production DATABASE_URL
DATABASE_URL='postgresql://…?sslmode=require' \
SEED_ADMIN_PHONE='<your real mobile>' \
SEED_ADMIN_PASSWORD='<a strong password you choose>' \
npm run db:migrate --workspace server && npm run db:seed --workspace server
```

> **Change the seed admin password.** The defaults (`9876500001` /
> `Admin@12345`) are printed in this repo's README. Seeding production with them
> leaves the shop dashboard open to anyone who has read it. Either set the two
> variables above before seeding, or sign in immediately afterwards and change
> the password from the account screen.

The seed also creates a demo customer. Delete that row once you have real
customers, or leave it — it owns nothing.

## 6. Point the app at your domain

- Set the **application startup file** to `app.js` and the **application root**
  to the folder containing it.
- Set the **application URL** to your domain.
- Start (or restart) the app.

Then check it:

```
https://yourdomain.com/api/health   →  {"ok":true,"database":"up","env":"production"}
https://yourdomain.com/             →  the storefront
```

If `/api/health` says `database: down`, the `DATABASE_URL` is wrong or Neon is
blocking the connection — that endpoint tells you which half is broken without
digging through logs.

## 7. Razorpay webhook (skip unless you turned the gateway on)

In the Razorpay dashboard → **Settings → Webhooks**, add:

- **URL**: `https://yourdomain.com/api/payments/webhook`
- **Secret**: the same value you put in `RAZORPAY_WEBHOOK_SECRET`
- **Events**: `payment.captured`, `payment.failed`, `order.paid`

The webhook and the browser callback race each other by design — whichever
arrives second is a no-op. Without the webhook, a customer who closes the tab
mid-payment leaves an order stuck in `awaiting_payment`.

## 8. After it is live

- Sign in as admin → **Settings** and set the real shop address, hours, delivery
  radius and minimum order. The seeded shop is a Thrissur address.
- The shop's coordinates matter: delivery distance is measured from them. Set
  `latitude`/`longitude` in `store_settings` to your actual shop, or every
  distance will be wrong.
- Update `pincode_centroids` for your area — it is the fallback when a customer
  denies location access.

---

## Gotchas worth knowing

**Rate limiting and `TRUST_PROXY`.** Set it to the number of proxies actually in
front of the app — `1` on Hostinger. Setting it higher than reality lets a client
forge `X-Forwarded-For` and get a fresh rate-limit budget on every request;
setting it to `0` behind a proxy makes every request look like it came from the
proxy, so one customer can exhaust the limit for everyone.

**Shared hosting sleeps.** Some shared Node plans idle the process out. The first
request after that is slow while it boots and reconnects to Neon. Neon also
scales its compute to zero — the pool already handles the dropped sockets, it
just costs a second on the first hit.

**`web/dist` is gitignored.** Every deploy that pulls from Git needs a build step
(or an uploaded `dist`). If it is missing, the app still starts and `/api/health`
still answers — but every page returns a 503 saying the storefront was not built,
and the boot log says the same. That is the symptom to look for.

**Redeploying.** Pull, `npm ci --omit=dev`, `npm run build`, restart the app.
Schema changes: re-run `npm run db:migrate` — it is idempotent and safe on a
live database. Never run `db:reset` or `db:seed` against production data;
`db:reset` drops every table, and `db:seed` resets prices and stock to the
catalogue defaults.

---

## On a Hostinger VPS instead

Full root, so it is the ordinary Node deployment:

```bash
npm ci --omit=dev && npm run build
npm i -g pm2
pm2 start app.js --name karthika --env production
pm2 save && pm2 startup
```

Put Nginx in front for TLS, proxying to `http://127.0.0.1:4000`, and keep
`TRUST_PROXY=1`. Set the environment variables in the pm2 ecosystem file or the
systemd unit rather than a `.env`.
