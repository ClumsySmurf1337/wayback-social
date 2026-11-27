# Stripe webhook — licence delivery for Stripe purchases (issue #23)

Date: 2026-11-27 (Track T). Status: **built + verified locally;
live proof outstanding** (needs the Pages secrets + the sandbox
purchase proof, then the push).

## The gap it closes

The live Stripe Payment Links (docs/stripe-vs-clerk.md §7) promise
the licence key "on its way by email" — but until this endpoint
there was nothing to send it. A live Stripe purchase created a
Stripe Customer + a charge and NO licence key, NO D1 row, NO email,
NO linked customer for the portal. This webhook is the Stripe
equivalent of `functions/api/paddle-webhook.js`: it closes the
fulfilment loop for the live checkout. **Do not take live Stripe
payments at volume until the sandbox proof (§6) is green.**

## Endpoint

`POST /api/stripe-webhook` — `functions/api/stripe-webhook.js`
(286 lines; signature + tier logic live in
`functions/_lib/stripe-signature.js` and
`functions/_lib/stripe-tier.js`, the email in
`functions/_lib/licence-email.js`, shared with the Paddle webhook).

| Event | What happens |
|---|---|
| `checkout.session.completed` | Resolve the tier → mint a DP2 key → D1 `licences` row (hash only, never the full key) → Resend email with the key → store the Stripe customer/session/payment-intent ids for the portal + refunds. |
| `charge.refunded` | Revoke the licence(s) for that `payment_intent` (`stripe_payment_intent`). A refund with no matching licence is 200 + `revoked: 0`, never an error. |
| `checkout.session.async_payment_failed` | Revoke the licence for that Checkout Session (`stripe_session_id`). |
| anything else | 200 + `ignored: <type>` (recorded in `webhook_events`, no action). |

## Signature verification

Stripe's scheme — **HMAC-SHA256 over `t.rawBody`** with the
endpoint secret (`whsec_...`), header
`Stripe-Signature: t=<unix ts>,v1=<hex>[,v1=<hex>]`
(several `v1` values can arrive during a key rotation; one valid
signature is enough). 5-minute timestamp tolerance, constant-time
compare, never accept an unsigned event. Two secrets are tried:
`STRIPE_WEBHOOK_SECRET` then `STRIPE_WEBHOOK_SECRET_SANDBOX`
(sandbox events use the sandbox endpoint secret — same dual-secret
pattern as the Paddle webhook).

NOT Paddle's scheme (Paddle signs `ts:rawBody` with a
semicolon-separated header) and NOT RSA (that is Paddle Classic).
Deliberate deviation from the Paddle webhook: a bad signature is
**400** here (Paddle returns 401). Stripe retries any non-2xx the
same way, so the behaviour is identical in practice.

Fail-closed, in order: non-POST → 405; no webhook secret at all →
503 naming `STRIPE_WEBHOOK_SECRET`; bad/missing signature → 400;
unparseable JSON → 400; no D1 binding → 500.

## Tier resolution (never a guessed tier)

1. **`session.metadata.tier`** — Stripe copies the Payment Link's
   metadata onto the Checkout Session, and all five live links
   carry it (docs/stripe-vs-clerk.md §7). This is the primary path
   and needs no Stripe API call at all.
2. **Line items** — only when the metadata tier is missing or
   unknown: `GET /v1/checkout/sessions/{id}/line_items` with
   `STRIPE_SECRET_KEY`, then the price id → tier via
   `STRIPE_PRICE_IDS`.
3. **Neither yields a tier → 400** with the price id in the log,
   never a minted key for the wrong pack.

Tier values: `starter` / `pro` / `studio` mint that tier;
`bundle` maps to `studio` (a bundle purchase mints a Studio key,
same as Paddle); **`topup` is NOT a licence** — a text-fetch
top-up purchase is answered 200 + `ignored` (no key, no D1 row,
no email). The buyer still gets Stripe's receipt. Credits have
no ledger yet — that is a known gap, needs a GitHub issue
(text-fetch credits ledger) before top-ups can be fulfilled
automatically. Until then, top-ups are manual fulfilment only.

## Fulfilment + email

Mint (DP2, Ed25519, `functions/_lib/dp2.js`) → D1 row → email.
The email is the shared helper in
`functions/_lib/licence-email.js` (same subject/body/caps lines
as the Paddle webhook — a buyer cannot tell which checkout they
used). **Email never blocks the purchase:** the licence is minted
and stored first; a missing `RESEND_API_KEY` or a Resend 4xx/5xx
returns 200 with `email_sent: false` + a logged warning, and the
row stays `active`. A Stripe retry cannot re-send the key (only
its hash is stored), so a failed email needs a manual re-issue
(new key — see docs/email-setup.md §5).

Buyer email, in order: `session.customer_details.email` →
`session.customer_email` → Stripe API customer fetch (needs
`STRIPE_SECRET_KEY`). No email anywhere → 500 (same as Paddle:
the row requires an email, and Stripe retries).

## Idempotency + refunds

- `webhook_events.event_id` (first check) + UNIQUE
  `licences.stripe_session_id` (second check, migration 0005).
  A duplicate delivery returns 200 + `duplicate: true` and never
  mints twice or re-emails.
- Refunds revoke by `stripe_payment_intent` (precise: a customer
  can hold several licences, so revoking by customer alone would
  be wrong). `async_payment_failed` revokes by session id.
- The licence-check endpoint (`/api/licence-check`) sees the
  revocation: a refunded key returns `valid: false,
  status: "revoked"`.

## Env vars (Pages secrets / vars — never in the repo)

| Var | Purpose |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Live endpoint signing secret (`whsec_...`, from the Stripe Dashboard — shown once). |
| `STRIPE_WEBHOOK_SECRET_SANDBOX` | Test endpoint signing secret (optional; sandbox events only). |
| `STRIPE_SECRET_KEY` | Stripe API key for the line-items + customer-email fallbacks. **The webhook accepts a live key** (`sk_live_...`) — production fulfilment needs it as fallback coverage. (This is NOT the billing-portal endpoint, which refuses live keys by design until its own go-ahead — see docs/stripe-vs-clerk.md §5.) The happy path (metadata tier + `customer_details.email`) needs no API key at all. |
| `STRIPE_PRICE_IDS` | JSON price → tier map, e.g. `{"price_1UgR0MGW6yc5Tf5GOIXgIXQv": "starter", "price_1UgR0MGW6yc5Tf5GljpjGLoH": "pro", "price_1UgR0MGW6yc5Tf5GyoH2O7zj": "studio", "price_1UgR0NGW6yc5Tf5GEsSd39VR": "studio", "price_1UgR0MGW6yc5Tf5G9nfyhfkd": "topup"}` (the five LAUNCH prices, docs/stripe-vs-clerk.md §7). Never hardcode price ids in code. |
| `LICENCE_ED25519_PRIVATE_KEY` | PKCS#8 PEM — mints DP2 keys. Still needs John's approach decision (issue #27); the endpoint 500s without it. |
| `RESEND_API_KEY`, `RESEND_FROM` | Licence email (see docs/email-setup.md). |
| `APP_URL` | `https://app.deletedproof.northforgelabs.dev` — the "Verify my key" link. |
| D1 binding | `DB` → `wayback-social-licences`. |

## Migrations

- `migrations/0004_stripe_customer.sql` — `stripe_customer_id`
  (what `/api/billing-portal` reads). NOT applied live yet.
- `migrations/0005_stripe_purchase.sql` — `stripe_session_id`
  (UNIQUE), `stripe_payment_intent`, `stripe_price_id` + indexes.
  NOT applied live yet. Apply both with `--remote` (John's
  approval tap — D1 writes are human-gated):
  ```
  npx wrangler d1 execute wayback-social-licences --remote --file migrations/0004_stripe_customer.sql
  npx wrangler d1 execute wayback-social-licences --remote --file migrations/0005_stripe_purchase.sql
  ```
- **Tolerance:** if 0004/0005 are not applied, the webhook still
  fulfils purchases — the insert falls back to the 0001 column set
  and logs a warning. Refunds then cannot be linked and answer
  honestly (`revoked: 0` + a reason naming the migrations)
  instead of crashing. The row is still stored; the Stripe
  identifiers are just missing until the migrations land.

## Local verification (what is proven, 2026-11-27)

- Node suites `functions/api/stripe-webhook.test.mjs` (**9 tests**:
  signature valid/wrong/stale/missing/multiple-v1/sandbox
  fallback; mint + D1 + email with the metadata tier; line-items
  fallback with the live Pro price id; duplicate event + duplicate
  session; bundle → studio; top-up ignored; unmapped price 400;
  bad signature 400; missing secret 503; GET 405; no-Resend-key
  and Resend-429 paths) and
  `functions/api/stripe-webhook-refunds.test.mjs` (**4 tests**:
  refund revokes + licence-check sees it; unmatched refund 200;
  async_payment_failed revokes; migration-absent fallback).
  Shared harness: `functions/api/stripe-webhook-harness.mjs`
  (stub D1 + fetch, throwaway keypair + secret). Mocked D1 +
  fetch; no live calls.
- Python cross-check `tests/test_stripe_webhook.py`: **2/2** — the
  Node-minted key verifies in the pure-Python Ed25519 verifier
  (`wayback_social/licence2.py`). The Paddle suite is still
  10/10 after the shared-email extraction (proven
  behavior-identical).
- The tests use a THROWAWAY Ed25519 keypair + throwaway webhook
  secret generated per run. They never read
  `.licence-keygen.txt` (the production private key) and never
  touch a live secret.
- NOT proven yet (needs the push + secrets + §6): the endpoint
  on the deployed host, a real Stripe event, a real Resend email,
  a real D1 row.

## 6. Sandbox proof (run before live payments at volume)

Prerequisites, in order: the batched push (the live site still
serves the stale v1.3 build, which has no `/api/stripe-webhook`
at all) → apply migrations 0004 + 0005 (`--remote`, John's tap)
→ set the Pages secrets below → create the test endpoint.

1. **Test Payment Link** (if not already made): repeat the test
   recipe (docs/stripe-vs-clerk.md §1) in the sandbox account
   `acct_1TqN24GnFHTsoY17` for one pack (the test Pro link
   already exists: https://buy.stripe.com/test_7sYeVdev7e4PgT21SU9Ve00).
2. **Test webhook endpoint** (Stripe Dashboard, test mode):
   Developers → Webhooks → Add endpoint, URL
   `https://develop.deletedproof.pages.dev/api/stripe-webhook`
   (the preview host — the proof runs against the preview build),
   events `checkout.session.completed`,
   `charge.refunded`, `checkout.session.async_payment_failed`.
   Copy the signing secret (`whsec_...`, shown once).
3. **Set the Pages secrets** (Preview env — the proof runs on
   the preview host):
   ```
   STRIPE_WEBHOOK_SECRET_SANDBOX=<the test endpoint secret>
   LICENCE_ED25519_PRIVATE_KEY=<the production private key — issue #27's route decides how it gets here>
   RESEND_API_KEY=<Resend Sending-access key> (+ RESEND_FROM)
   STRIPE_PRICE_IDS=<the five TEST price ids mapped to tiers>
   ```
   (No `STRIPE_SECRET_KEY` needed for the happy path — the test
   link's metadata tier + `customer_details.email` cover it.
   Set the test key too if the line-items fallback is being
   proven.)
4. **Buy with Stripe's test card** `4242 4242 4242 4242`, any
   future expiry, any CVC, any email you control.
   Expect: HTTP 200 from the checkout; a licence email arrives
   with a `DP2-PRO-...` key; the D1 row exists
   (`SELECT key_prefix, tier, status, stripe_customer_id,
   stripe_session_id FROM licences WHERE email = '<that email>';`
   → one row, `pro`, `active`, `cus_...`, `cs_...`); pasting the
   key in the preview dashboard verifies it; "Manage billing"
   opens a test portal session for the linked customer.
5. **Refund the test charge** (Stripe Dashboard → the payment →
   Refund). Expect: the D1 row flips to `revoked`; the dashboard
   licence check now says invalid/revoked.
6. Only then: repeat steps 2–3 for the LIVE endpoint
   (`https://app.deletedproof.northforgelabs.dev/api/stripe-webhook`,
   `STRIPE_WEBHOOK_SECRET` live secret, live price ids in
   `STRIPE_PRICE_IDS`) and re-run the proof against a live
   purchase (smallest pack, refunded after — see
   docs/stripe-vs-clerk.md §7 follow-up 3).

## Failure map (the endpoint's own statuses)

| Status | Meaning |
|---|---|
| 200 `ok` | Fulfilled / revoked / duplicate / ignored — see the body. |
| 400 | Bad signature, unmapped price, missing session/event id, invalid JSON. |
| 401 | (Not used — see the signature note above.) |
| 405 | Non-POST. |
| 500 | No D1 binding, no buyer email, no private key, Stripe API error on the fallback, or an unexpected failure (Stripe retries). |
| 503 | `STRIPE_WEBHOOK_SECRET` not configured. |

## Follow-ups (not in this track)

- **Text-fetch credits ledger** (top-up fulfilment): needs a
  GitHub issue — a top-up purchase currently answers 200 +
  ignored and no credits are recorded anywhere. Until the
  ledger exists, top-ups are manual fulfilment only.
- **Dev-server route**: `scripts/dev-server.mjs` does not route
  `/api/stripe-webhook` yet (same gap as licence-check +
  packs-upload, issue #25 / Track R B2). Local proof uses the
  Node test harness, not the dev server. Add the route when the
  dev-server routing table is split (it is at 275 lines).
- **Live portal gate**: `/api/billing-portal` still refuses
  `sk_live_...` by design — lifting it is a separate code change
  + John's decision (docs/stripe-vs-clerk.md §7 follow-up 2).
  The webhook's `stripe_customer_id` write is what makes the
  portal work for Stripe buyers once that gate lifts.
