# Upgrading an existing Karthika Stores install

If this is a fresh clone, ignore this file — `npm run db:migrate && npm run db:seed`
covers everything. This is for a shop that is already live on the previous release.

**No data is dropped and no order history changes.** Do not run
`npm run db:reset`; it destroys everything.

## 1. Install the one new dependency

```bash
npm install          # adds qrcode to the server workspace
```

The QR is rendered on the server, which is why this appears now.

## 2. Migrate

```bash
npm run db:migrate   # idempotent — safe to run on a live database
```

This adds, all in place:

- `payment_method` gains `upi_qr`, `payment_status` gains `submitted`
- `store_settings` gains `upi_vpa`, `upi_payee_name`, `accepts_upi_qr`
- `payments` gains `upi_uri`, `upi_reference`, `expires_at`, `verified_by`,
  `verified_at`, plus a unique index on `upi_reference`

The two enum labels are applied as standalone statements rather than inside
`schema.sql`, because a new enum label cannot be used until the transaction that
added it has committed. That is handled for you in `db/migrate.js`.

## 3. Set the shop's UPI ID

Nothing goes in `.env` for this. Sign in as the shop admin and open
**Store → Settings → UPI**, then enter the shop's UPI ID and the name to show in the
customer's app. Check it character by character: money scanned against the wrong ID
goes to whoever owns it and cannot be pulled back.

Until a valid ID is saved, `upi_vpa` is `NULL`, `storeAcceptsUpi()` is false, and the
storefront simply does not offer UPI — the shop keeps taking orders exactly as before.

## 4. Rebuild and restart

```bash
npm run build && npm start
```

The service worker version moved to `ks-v2`, so returning customers pick up the new
shell on their next visit rather than being served the old bundle.

## What changes for the shop's routine

A UPI order does not confirm itself. It lands in **Orders → Verify payment** with the
customer's reference and waits for somebody to match it against the shop's bank alert
and tap *Money received*. Somebody needs to be watching those alerts during opening
hours; if nobody is free, switch **Offer UPI QR at checkout** off and the shop falls
back to pay-on-handover.

One behaviour changed for existing orders too: marking an order *delivered* no longer
auto-marks a prepaid order paid. It only settles `pay_on_delivery` and `pay_at_store`.
Previously a Razorpay order could be marked paid by the delivery step without anyone
checking, which is the same mistake in a different coat.

## Rolling back

The added columns and enum labels are additive, so the previous release runs against
the migrated database unchanged — it simply ignores them. The one thing to do first is
settle or cancel any order sitting in `submitted`, since the old code has no screen
for that state.
