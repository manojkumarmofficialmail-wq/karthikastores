# Karthika Stores

A mobile-first online storefront for a neighbourhood provision shop on the Thrissur
Round, Kerala. Customers browse the aisles, fill a basket, **pay by UPI QR** (or on
handover) and either take **free delivery within 5 km** or **collect at the counter**.
The shop gets a dashboard for orders, inventory, pricing and payment verification.

Built to be used as an app, not read as a page: one full-screen shell that owns its
own scrolling, a pinned tab bar, pull-to-refresh, screen transitions and an install
prompt. On a desktop it becomes a phone-shaped window rather than stretching into a
website. It is a PWA — installable, touch-first, and able to browse the catalogue
with no connection at all.

```
Node.js + Express 5  ·  React 19 + Vite  ·  Neon PostgreSQL  ·  UPI QR (Razorpay ready)
```

---

## What it does

**Customer**
- 98 seeded provision items across 12 aisles, with live stock, MRP struck through and a saving badge
- Type-ahead search plus filters on aisle, price band, stock and sort order
- Basket that survives the login wall — a guest basket in `localStorage` is merged into the server cart at sign-in
- Delivery **or** pickup at checkout, with the distance, ETA and serviceability computed from the address
- **Pay by UPI**: scan the shop's QR in any UPI app, or tap through to it on the same phone, then report the reference — the shop confirms and packing starts
- Pay on delivery or at the counter as well; card and netbanking (Razorpay) switch on with one environment variable
- Live order tracking: confirmed → being packed → ready / out for delivery → delivered
- Order history, one-tap reorder, cancellation that restocks the shelf and refunds an online payment
- Saved addresses with GPS pinning or PIN-code fallback, and a "too far" verdict shown *before* checkout

**Shop staff**
- Today's orders and sales, open-order queue, 7-day revenue chart, best sellers
- A **Verify payment** queue: every customer who says they paid by UPI, with their reference, ready to confirm against the bank alert or send back for a retry
- Order queue with a picking list, customer phone, and one-tap status moves the state machine allows
- Inventory: ± stock from the list, full item editor, price/MRP guardrails, delist without breaking order history
- Customer list with order counts and spend
- Shop settings: hours, delivery radius, minimum order, packing time, the shop's UPI ID and which payment modes are offered

---

## Quick start

### 1. Create the database (Neon)

1. Sign in at [console.neon.tech](https://console.neon.tech) and create a project.
2. Copy the **pooled** connection string — it looks like
   `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.

Any PostgreSQL 13+ works too (`postgresql://postgres@localhost:5432/karthika` with
`DATABASE_SSL=false`); Neon is the default because it needs no local server.

### 2. Configure

```bash
git clone <this repo> && cd karthikastores
npm install                       # installs both workspaces
cp server/.env.example server/.env
```

Edit `server/.env` and set at minimum:

```ini
DATABASE_URL=postgresql://…?sslmode=require
JWT_SECRET=…                      # node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 3. Create the schema and load the shop

```bash
npm run db:migrate                # applies server/db/schema.sql (idempotent)
npm run db:seed                   # categories, 98 products, delivery zones, demo accounts
```

`npm run db:reset` drops everything and redoes both.

### 4. Run it

```bash
npm run dev                       # API on :4000, web on :5173
```

Open **http://localhost:5173**. Vite proxies `/api` to the backend, so the browser
stays on one origin and the refresh cookie is first-party.

### Demo logins

| Role | Mobile | Password |
| --- | --- | --- |
| Customer | `9876500002` | `Customer@123` |
| Shop admin | `9876500001` | `Admin@12345` |

The customer has two saved addresses on purpose: Chembukkavu (1.6 km — deliverable)
and Ollur (18.8 km — pickup only), so both branches are demoable immediately.

### Other commands

```bash
npm run build          # production bundle into web/dist
npm start              # API only; also serves web/dist if it exists
node app.js            # same thing, the way a hosting panel starts it
npm test               # server unit tests (no database needed)
```

`node app.js` reads `server/.env` when the environment does not already define
`DATABASE_URL`, so it works locally and on a managed host without changes — a
panel's own variables always win over the file.

---

## Payments

### UPI QR — on by default

The QR is a standard UPI intent URI (NPCI's deep-link format) built around the
shop's own VPA:

```
upi://pay?pa=karthikastores@okicici&pn=Karthika%20Stores&am=487.50&cu=INR&tr=KS2609151042A1
```

The money moves bank-to-bank between the customer's UPI app and the shop's account.
There is no gateway, no API key, no merchant onboarding and no percentage — which is
the point for a shop this size. Set the UPI ID once in **Store → Settings → UPI** and
it works.

**The consequence, which shapes everything else:** with no gateway there is no
callback, so the server cannot *know* that money arrived. It can only record what the
customer says and wait for a human. So `payment_status` has a state between `pending`
and `paid`:

| State | Means |
| --- | --- |
| `pending` | the QR has been shown; nobody has claimed anything |
| `submitted` | the customer entered a UTR and is waiting on the shop |
| `paid` | a staff member matched it against the bank alert |
| `failed` | the shop looked and the money was not there |

Only `POST /api/admin/orders/:id/payment` — staff-only — can write `paid`. A customer
claim is a claim. The order sits in **Orders → Verify payment** until somebody at the
counter confirms it, and the customer's tracking screen says so plainly rather than
pretending the order is confirmed.

Two smaller decisions fall out of the same place. A UTR is unique across the whole
`payments` table, so the same reference cannot be used to claim two orders. And
cancelling a paid UPI order reports a **manual** refund — there is no refund API to
call, so the app says the shop will send it back from the same account instead of
claiming a refund was raised.

The QR expires after 15 minutes and a refresh mints a new attempt, so a screenshot is
not payable forever; the amount is always re-derived from the order, never from the
client.

### Card and netbanking — ready, switched off

`PAYMENT_PROVIDER` defaults to `none`, so a fresh clone takes UPI and handover money
with no payment setup at all. The Razorpay integration is present and idle; turning it
on is an environment change, not a code change. When it is `none` the storefront does
not offer "Card or netbanking" at all and the gateway routes answer 503.

**`simulated`** (development only) — the checkout, the HMAC signature and the webhook
are all real; only the counterparty is local. Choosing *Approve payment* makes the
server mint a signed payload that goes through the **same** `/api/payments/verify`
endpoint Razorpay would hit. `config.js` refuses to boot with this in production.

**`razorpay`** — the real thing, for when you are ready. Test keys are free:

```ini
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_test_…
RAZORPAY_KEY_SECRET=…
RAZORPAY_WEBHOOK_SECRET=…
```

Then in the Razorpay dashboard → Settings → Webhooks, point
`https://your-host/api/payments/webhook` at the events `payment.captured`,
`payment.failed` and `order.paid`. The browser callback and the webhook race each
other by design; whichever lands second is a no-op.

Card details never reach this server — the gateway collects them. UPI details never
reach it either; the customer pays inside their own bank's app.

> ⚠️ **Before the first live order**, replace the seeded UPI ID
> (`karthikastores@okicici`) with the shop's real one. Whatever it resolves to is
> where every scanned rupee actually goes, and it cannot be pulled back.

---

## Project layout

```
server/
  db/
    schema.sql          tables, enums, indexes, triggers
    migrate.js          applies the schema (--fresh drops first)
    seed.js             shop, zones, catalogue, demo accounts, sample orders
    seed-data.js        the catalogue itself
  src/
    app.js              express app: helmet, cors, rate limits, routes, SPA hosting
    config.js           every environment variable, validated once at boot
    db.js               pg pool, query helpers, withTransaction
    lib/                geo (haversine + quote), upi (QR + intent URI), upiOrders
                        (the pending → submitted → paid lifecycle), gateway,
                        tokens, cart, orders, serializers
    middleware/         auth, zod validation, error handler
    routes/             auth, store, catalog, cart, addresses, orders, payments, admin
  test/                 unit tests for distance, status flow and signatures
web/
  public/               manifest, icons, service worker
  src/
    lib/                api client (silent refresh), payments, formatting
    store/              zustand: auth, cart, store info, toasts
    components/         app shell (scroll + pull-to-refresh), UPI pay sheet,
                        install prompt, product card, stepper, sheet, timeline…
    pages/              home, category, search, product, cart, checkout, orders, account
    pages/admin/        overview, orders, inventory, customers, settings
```

---

## API

All routes are under `/api`. Money is integer **paise** everywhere.

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/auth/register`, `/auth/login` | returns an access token + sets the refresh cookie |
| `POST` | `/auth/refresh`, `/auth/logout` | refresh tokens rotate on every use |
| `GET/PATCH` | `/auth/me` | profile and saved preferences |
| `POST` | `/auth/change-password` | revokes every other session |
| `GET` | `/store`, `/store/delivery-quote`, `/store/pincode/:pin` | shop, hours, slots, distance quote |
| `GET` | `/catalog/categories`, `/catalog/products`, `/catalog/products/:slug` | search, filters, sort, paging |
| `GET/POST/PATCH/DELETE` | `/cart`, `/cart/items/:productId`, `/cart/merge` | server-side basket |
| `GET/POST/PATCH/DELETE` | `/addresses` | each returns its delivery verdict |
| `POST` | `/orders/quote` | bill preview for a fulfilment choice |
| `POST` | `/orders` | places the order; totals are recomputed server-side |
| `GET` | `/orders`, `/orders/:id` | history and tracking |
| `POST` | `/orders/:id/cancel`, `/orders/:id/reorder` | cancel restocks; reorder refills the basket |
| `POST` | `/payments/upi/intent` | opens (or refreshes) a QR attempt for an order |
| `POST` | `/payments/upi/claim` | customer reports a UTR — moves the order to `submitted` |
| `POST` | `/payments/checkout`, `/payments/verify`, `/payments/abandon` | gateway handshake |
| `POST` | `/payments/webhook` | HMAC-verified, raw-body |
| `GET` | `/admin/overview`, `/admin/orders`, `/admin/products`, `/admin/customers` | staff only |
| `POST` | `/admin/orders/:id/payment` | confirm or reject a UPI payment — **the only route that writes `paid`** |
| `PATCH` | `/admin/orders/:id/status`, `/admin/products/:id`, `/admin/store` | staff only |

Errors are always `{ "error": { "message": string, "details"?: [{ field, message }] } }`.

---

## Design decisions

**Money as integer paise.** Floats and currency do not mix. Every price, total and
fee is an `integer`; only the display layer divides by 100.

**The server never trusts a price.** Checkout re-reads every product row inside the
transaction (`SELECT … FOR UPDATE`), recomputes the subtotal, re-runs the delivery
quote, and only then writes the order. The client's numbers exist to render, never to
charge. The row lock is also what stops two parallel checkouts from selling the same
last packet of sugar.

**Order lines are snapshots.** `order_items` copies the name, pack size and price at
the time of sale, and the delivery address is copied onto the order. Editing a product
or an address later must not rewrite the history of a delivered order.

**Distance by haversine, not a routing API.** A 5 km radius does not need turn-by-turn
routing. Straight-line distance × 1.3 (the usual detour factor for a dense Indian town
grid) is accurate enough to decide serviceability, costs nothing, and has no API key
to leak or rate limit. Addresses are placed by browser GPS, or by PIN-code centroid
when the customer denies location — a table of real Thrissur centroids ships in the seed.

**Delivery bands are data.** `delivery_zones` holds concentric bands with their own
fee, minimum and ETA. The shop can charge for a wider ring later from the dashboard
without a code change; today there is one free 5 km band.

**Status flow is a table, not if-chains.** `STATUS_FLOW` in `lib/orders.js` is the one
definition of what can follow what; the API validates against it and the dashboard
renders its buttons from it. A pickup order is never offered "out for delivery".

**Nothing but a person marks a UPI payment paid.** The tempting shortcut is to trust
the UTR the customer types in — it is a real number, after all, and the order would
flow straight through. But the app cannot check it against anything, so trusting it
would mean any string of twelve digits gets a bag of groceries. The `submitted` state
exists so the system can be honest about what it knows: the customer has done their
part, and the shop has not yet looked. A staff account confirming it is the only
transition to `paid`, and the UTR carries a unique index so it cannot be spent twice.

**The shell owns the scrolling.** `.app` is a CSS container with its own
`overflow-y`, which does three things at once: the tab bar and cart bar are fixed to
the frame rather than the browser window, every grid sizes against the shell (so a
five-column product grid cannot appear inside a 430px frame), and the browser's own
pull-to-refresh never fires over the catalogue, leaving the gesture free for the
app's. Sheets portal into the shell for the same reason. On a desktop the shell
becomes a 430px phone window — except under `/admin`, where staff are working with
tables and a picking list all day and the full width is the right shape.

**Cancelling actually returns the money.** A cancellation restocks inside the
transaction, then calls the gateway's refund API *after* the commit — an HTTP
round-trip must never be made while holding row locks. `payment_status` only
becomes `refunded` once the gateway accepts; if the call fails it stays `paid`
with the reason recorded on the payment row, so the books never claim money was
returned when it was not, and staff can see what is still owed.

**The QR is generated on the server.** It keeps a QR library out of the web bundle,
gives the customer's screen and the shop's dashboard the identical image, and means
the encoded amount is always re-derived from the order row rather than from anything
the client sent. The SVG is rebuilt on every request rather than stored: it is derived
data, and the order total is the only thing that may legitimately be paid.

**Tokens: short access, rotating refresh.** A 30-minute JWT lives in memory on the
client — never `localStorage`, so XSS cannot exfiltrate it. The refresh token is an
httpOnly cookie, stored only as a SHA-256 in the database, and single-use: every
refresh rotates it. Passwords are bcrypt.

**Generated product art.** Until the shop photographs its stock, each item renders a
deterministic SVG tile — a stable hue from the name plus a matching glyph. It never
404s, needs no CDN, and works offline. Set `imageUrl` on a product and the photo takes
over with no code change.

**The service worker caches the catalogue, never the wallet.** App shell is
stale-while-revalidate; `/api/store` and `/api/catalog/*` are network-first with a
cache fallback, so a customer on patchy 4G keeps browsing. Auth, cart writes, orders
and payments are never cached.

**One deployable if you want it.** In production the API serves `web/dist` and routes
SPA deep links to `index.html`, so this can ship as a single service — or stay split,
with `CORS_ORIGINS` naming the web host.

---

## Testing

```bash
npm test
```

31 unit tests over the parts worth pinning down: haversine distance and the delivery
quote (inside the ring, outside it, below the minimum), the order status machine for
both fulfilment types, gateway signature and refund handling including tampered
payloads and wrong-length signatures, and the UPI layer — VPA validation, two-decimal
amount formatting, intent URIs whose payee name cannot truncate the amount, UTR
shapes, and attempt-scoped references. They need no database.

The HTTP layer was exercised end to end against PostgreSQL: guest basket → sign-in
merge → delivery quote → UPI order → QR intent → claim → staff rejection → retry →
staff confirmation → cancellation with restock and a manual-refund verdict. Also
checked: a refreshed QR reusing its attempt, a reused UTR being refused, a customer
being refused the staff confirmation route (403), no QR for an already paid order,
card payment refused while `PAYMENT_PROVIDER=none`, a malformed UPI ID refused at save
time, and the guard that stops the shop switching off every payment method at once.
The enum migration was verified against a database created before UPI existed.

The screens are smoke-rendered headlessly (jsdom) to catch anything that crashes on
mount: the shell, checkout offering UPI and hiding the switched-off gateway, the QR
sheet and its post-claim state, the tracking screen's "Show QR", and the staff
verification queue and settings.

---

## Deploying

Already running the previous release? See **[UPGRADING.md](UPGRADING.md)** — the
migration is additive and keeps every existing order.

See **[DEPLOY.md](DEPLOY.md)** for a step-by-step Hostinger walkthrough, the full
environment-variable table and the gotchas. The short version:

- Set `NODE_ENV=production`, a real `JWT_SECRET`, `PAYMENT_PROVIDER=razorpay` and live keys.
- Set `TRUST_PROXY` to the number of reverse proxies actually in front of the API
  (1 on Render/Fly/Nginx, 0 direct). Rate limiting buckets on the client IP, and
  trusting a hop that is not there lets a client forge `X-Forwarded-For`.
- If the web app is on another host, set `CORS_ORIGINS`, plus `COOKIE_SECURE=true` and
  `COOKIE_SAMESITE=none` so the refresh cookie survives.
- Run `npm run db:migrate` against the production Neon branch, then `npm run build`
  and `npm start`.
- Neon scales idle compute to zero; the pool already handles dropped idle sockets.
- `app.js` at the repo root is the startup file for panels that expect one there.
