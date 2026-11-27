# Track T — Stripe webhook (issue #23) — DONE 2026-11-27

Built locally, no push, no deploy, no live calls, no secrets read.
The live checkout's #1 gap (a live Stripe buyer paid and got no
licence key) now has a built + tested fulfilment path; what remains
is secrets + migrations + the sandbox purchase proof.

## Files created / changed (line counts)

| File | Lines | What |
|---|---|---|
| `functions/api/stripe-webhook.js` | 286 | NEW. POST /api/stripe-webhook: Stripe-Signature verify, tier resolution (metadata → line items), DP2 mint, D1 row, Resend email, refunds. Under the ~300 ceiling. |
| `functions/_lib/stripe-signature.js` | 42 | NEW. `verifyStripeSignature` (HMAC-SHA256 over `t.rawBody`, 300s tolerance, multi-v1 + sandbox-secret fallback). |
| `functions/_lib/stripe-tier.js` | 75 | NEW. `normalizeTier`, `resolveTier`, `tierSeats` (bundle → studio; topup sentinel). |
| `functions/_lib/licence-email.js` | 78 | NEW. Shared licence email (extracted verbatim from the Paddle webhook) — subject/body/caps/sandbox sender, one copy for both providers. |
| `functions/api/paddle-webhook.js` | 221 → 199 | Refactored to import the shared email lib. Behaviour-identical, proven by its suite (still 10/10). |
| `functions/api/stripe-webhook.test.mjs` | 9 tests, 182 lines | Fulfilment-path tests: signature, mint + D1 + email, line-items fallback, idempotency, bundle/topup, failure paths, email failures. |
| `functions/api/stripe-webhook-refunds.test.mjs` | 4 tests, 99 lines | Refund / revocation / migration-tolerance / licence-check tests. |
| `functions/api/stripe-webhook-harness.mjs` | 173 lines | Shared test harness (stub D1 + fetch, throwaway keypair + secret, event builders). No tests here. |
| `tests/test_stripe_webhook.py` | 35 | NEW. Pytest wrapper (runs BOTH Node suites) + Python Ed25519 cross-check of the Node-minted key. |
| `migrations/0005_stripe_purchase.sql` | 22 | NEW. `stripe_session_id` (UNIQUE), `stripe_payment_intent`, `stripe_price_id` + indexes. NOT applied live (human-gated). |
| `docs/stripe-webhook.md` | 243 | NEW. Endpoint, signature, tier resolution, env vars, migrations, local verification, sandbox proof (§6), failure map, follow-ups. |
| `docs/issues.md` | — | #3 section: #23 marked BUILT LOCALLY (Track T). |
| `docs/issue-tracker.md` | — | #23 row updated to BUILT LOCALLY + remaining steps. |
| `.github/workflows/ci.yml` | — | +1 line: `node functions/api/stripe-webhook.test.mjs`. |

## Test results (all local, mocked, no live calls)

- **Stripe webhook Node suites: 13/13** — fulfilment suite 9/9
  (`node --test functions/api/stripe-webhook.test.mjs`) +
  refunds suite 4/4
  (`node --test functions/api/stripe-webhook-refunds.test.mjs`),
  sharing `functions/api/stripe-webhook-harness.mjs`. The test
  file was split (it hit 432 lines; every file now sits under the
  ~300 ceiling): signature valid / wrong secret / stale / missing
  / multiple-v1 / sandbox fallback; mint + D1 row with Stripe ids
  + email (metadata tier, no Stripe API call); line-items fallback
  with the live Pro price id; duplicate event + duplicate session
  (1 row, 1 email); bundle → studio (5 seats); top-up ignored (no
  key, no row, no email); unmapped price 400; bad signature 400;
  missing secret 503; GET 405; no-Resend-key + Resend-429 (200,
  row intact); refund revokes by payment_intent + licence-check
  sees it; unmatched refund 200; async_payment_failed revokes by
  session id; migrations-absent fallback (purchase succeeds, refund
  honestly reports 0005).
- **Python cross-check: 2/2** (`tests/test_stripe_webhook.py`) —
  the Node-minted key verifies in the pure-Python Ed25519
  verifier (`wayback_social/licence2.py`), tier pro.
- **Paddle webhook suite: still 10/10** after the shared-email
  extraction (proven behavior-identical; baseline was 10/10
  before the refactor). Python Paddle wrapper: 2/2.
- Full pytest (non-e2e): **152 passed, 0 failed** (13.16s) at the
  end of this track — includes my 2 new Stripe wrapper tests;
  the rest of the delta over Track P's 148 baseline is Track R's
  in-flight additions.
- All `functions/api` node suites green at the end of this track:
  arquivo 11/11, billing-portal 13/13, commoncrawl 15/15,
  evidence-usage 18/18, ghostarchive 12/12, live-check 6/6,
  packs-upload 14/14, stripe-webhook 13/13, middleware 1/1.
  (One transient packs-upload failure — 13 pass / 1 fail — appeared
  in an intermediate run while Track R was mid-edit on the tree;
  the immediate re-run was 14/14 and the packs-upload files were
  untouched since 01:00 UTC, so it was a mid-edit collision, not
  this track's code. Recorded honestly here per the push
  discipline: local-only verification never closes an issue.)

## Design decisions (with why)

- **Tier from session metadata first.** Stripe copies the
  Payment Link's metadata onto the Checkout Session, and all
  five live links carry `tier` — so the happy path needs no
  Stripe API call and no `STRIPE_SECRET_KEY` at all. The
  line-items fetch is only a fallback.
- **Top-up is ignored, not minted.** A $15 text-fetch top-up
  is credits, not a licence (no `topup` tier exists in DP2).
  It answers 200 + `ignored`; the buyer still gets Stripe's
  receipt. The credits ledger is a known gap — needs a GitHub
  issue before top-ups can be fulfilled automatically.
- **Migration 0005 (new).** Refunds must revoke the RIGHT
  licence: a customer can hold several, so revoking by customer
  would be wrong. `charge.refunded` revokes by
  `stripe_payment_intent`; `async_payment_failed` by session id.
  The endpoint tolerates 0004/0005 being absent (purchase still
  succeeds; refunds answer honestly) — purchases never break on
  a missing migration.
- **Bad signature is 400, not 401** (deliberate deviation from
  the Paddle webhook, per the Track T brief). Stripe retries
  any non-2xx identically, so the behaviour is the same.
- **The webhook ACCEPTS a live `STRIPE_SECRET_KEY`.** It has
  to — production fulfilment needs it as fallback coverage.
  This is NOT the billing-portal endpoint, which refuses live
  keys by design until its own go-ahead.
- **Shared email lib.** The Paddle + Stripe webhooks now share
  one `sendLicenceEmail` — a buyer cannot tell which checkout
  they used from the email, and the copy can never drift.

## Proven locally vs still outstanding

PROVEN: signature verification (incl. rotation + sandbox
fallback), tier resolution both paths, mint + D1 + email,
idempotency, refunds (both events), migration tolerance,
licence-check seeing revocations, Python cross-verification of
minted keys, Paddle behaviour unchanged.

NOT PROVEN (needs the push + secrets + §6): the endpoint on the
deployed host, a real Stripe event, a real Resend email, a real
D1 row, the sandbox purchase proof, the live purchase proof.

## Go-live checklist (for John — exact steps in docs/stripe-webhook.md §6)

1. Push first (live still serves v1.3 — no `/api/stripe-webhook`).
2. Apply migrations 0004 + 0005 (`--remote`, John's tap).
3. Stripe Dashboard → Webhooks → Add endpoint (test mode first):
   URL `https://develop.deletedproof.pages.dev/api/stripe-webhook`,
   events `checkout.session.completed`, `charge.refunded`,
   `checkout.session.async_payment_failed`. Copy the `whsec_...`
   secret (shown once).
4. Set Pages secrets (Preview): `STRIPE_WEBHOOK_SECRET_SANDBOX`,
   `LICENCE_ED25519_PRIVATE_KEY` (issue #27's route),
   `RESEND_API_KEY` + `RESEND_FROM`, `STRIPE_PRICE_IDS` (test
   price ids).
5. Sandbox proof: buy with test card `4242 4242 4242 4242` on
   the test Pro link → licence email arrives → D1 row is
   `active` with `cus_` + `cs_` linked → dashboard verifies the
   key → "Manage billing" opens a test portal session → refund
   the charge → row flips to `revoked`.
6. Repeat 3–4 for LIVE (`https://app.deletedproof.northforgelabs.dev/api/stripe-webhook`,
   `STRIPE_WEBHOOK_SECRET`, live price ids), then a live
   purchase (smallest pack, refunded after).

## Follow-ups (not in this track)

- Text-fetch credits ledger — needs a GitHub issue (top-up
  fulfilment). Until it exists, top-ups are manual only.
- Dev-server route for `/api/stripe-webhook` (same gap as
  licence-check + packs-upload, issue #25 / Track R B2) — add
  when the routing table is split.
- Live portal gate (`/api/billing-portal` refuses `sk_live_...`)
  — separate code change + John's decision; the webhook's
  `stripe_customer_id` write is what makes it work for Stripe
  buyers once the gate lifts.
- Sales-tax answer (#28) still open — unchanged by this track.
