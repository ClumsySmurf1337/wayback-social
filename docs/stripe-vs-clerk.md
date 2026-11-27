# Stripe vs Clerk for wayback-social — user-account management

Date: 2026-11-26. Question from John: does Stripe have user account
management too, and can it replace Clerk? Short answer: **no — Stripe
is the cash register, Clerk is the front door.** They complement each
other. Stripe's "accounts" are billing records, not logins.

## 1. Mode test results (Stripe connector, NORTHFORGE LABS LLC)

Both modes reachable via the connected Stripe account:

| Mode | Account | Reachable |
|---|---|---|
| Test (sandbox) | `acct_1TqN24GnFHTsoY17` "NORTHFORGE LABS LLC sandbox" | yes |
| Live | `acct_1TqN1vGW6yc5Tf5G` "NORTHFORGE LABS LLC" | yes, read-only |

### Test mode — Pro Pack dress rehearsal (TEST ONLY, no real money)

Created 2026-11-26 in test mode, launch price from `pricing.yaml`
(Pro $19 one-time):

- Product: `prod_VhYLzeWSMvXfHh` — "Pro Pack" (metadata
  `product=archivecheck, tier=pro, plan=pro`)
- Price: `price_1Ug9EUGnFHTsoY17ooOxds3k` — $19.00 USD, one-time
  (`unit_amount: 1900`, `type: one_time`)
- Payment Link: `plink_1Ug9EYGnFHTsoY17gPoPL62e`
  - URL: **https://buy.stripe.com/test_7sYeVdev7e4PgT21SU9Ve00**
  - Verified: `curl -L` returns **HTTP 200** on that URL.
  - Hosted confirmation message: licence key arrives by email.
  - No tax set (`tax_code: null`, `automatic_tax.enabled: false`).

Test mode was a clean slate before this (0 products). This is the exact
recipe to repeat in live mode when John says go — same three calls,
live context, regular prices if launch has ended.

### Live mode — LIVE CHECKOUT 2026-11-27 (was read-only; John said go)

Live state after Track N (2026-11-27, all verified by Stripe API
read-back + curl — see §7 for the full record):

- Products: **11** — the 6 Meterlane products (untouched) + **5 new
  ArchiveCheck products** (Starter, Pro Pack, Studio, All-in Bundle,
  Text-fetch top-up), all `livemode: true`, `tax_code: null`.
- Payment Links: **5, all ArchiveCheck, all live** (launch prices,
  one-time USD, `customer_creation: if_required`, hosted-confirmation
  message promising the licence key by email). All return HTTP 200
  with the "Stripe Checkout" title.
- Customers: **1** — `cus_UqFlCEiPekjF6j`, the Meterlane customer
  (unchanged). No wayback-social customers exist yet (none until
  someone buys).
- Billing Portal configurations: **1 in live** —
  `bpc_1UgR15GW6yc5Tf5G5fREva6D` (created 2026-11-27, active,
  default, livemode true) + the test one from §5.
- **Sales tax: NOT set** — replicated the test recipe exactly
  (`tax_code: null`, `automatic_tax` off). John's sales-tax
  decision is STILL OPEN — see the flag in §7. Do not assume a
  tax posture from these links.

## 2. What Stripe's "account management" actually is

### Stripe Customer objects
A billing record: email, name, address, payment methods, metadata,
invoice history. No password, no login, no session. A customer is
created automatically by Checkout/Payment Link (`customer_creation:
if_required` on our test link) or by API. It answers "who paid and
with what card", not "who is signed in".

### Customer Billing Portal (docs.stripe.com/customer-management)
A Stripe-hosted page where an existing customer self-serves billing:

- Update billing info incl. tax IDs; update payment methods.
- Update / switch / pause / resume / cancel subscriptions;
  cancellation deflection (retention coupon + reason collection).
- Pay, view and download current and past invoices.
- Cost: included with Billing, **no extra fee** beyond payment
  processing (2.9% + 30c per charge).
- Limits that matter here:
  - **The portal does not authenticate anyone.** You authenticate
    the customer on your side first, then mint a portal session for
    their `cus_` id. Sessions expire 5 min unused / 1 hr after
    activity. It cannot be shown inside an iframe.
  - It is subscription-centric. Our packs are **one-time** purchases:
    there is no subscription to pause/cancel/switch. For a one-time
    buyer the portal is mainly receipts + payment-method management.
  - Portal login links (email magic link) exist, but they open
    **billing only** — no app session, no licence, no profile.
- Not set up yet: zero portal configurations in either mode.

### Stripe Checkout / Payment Links
Collect the first payment; create the Customer; take card/wallets/
promo codes/tax. No sign-in, no account, no session. A buyer can pay
without ever creating an account on our site.

### Stripe Identity
Government-ID + selfie verification, $1.50 per completed check
(first 50 free), $0.50 per US SSN lookup. That is KYC — proving a
real-world person matches an ID — not login. Wrong tool here: the
product never needs to KYC a buyer, and asking catfish-check users
for a government ID would be a privacy non-starter. Not used.

## 3. Comparison table

| Capability | Clerk | Stripe |
|---|---|---|
| Sign-up / sign-in | Yes — prebuilt UI, email + password, magic link, passkeys (Pro) | No. No passwords, no sessions |
| Social login (Google) | Yes, built in (3 social logins on Hobby) | No |
| Sessions / JWT | Yes, managed; 7-day sessions on Hobby | No. Portal sessions are 5 min / 1 hr, billing-only |
| Password reset | Yes, built in | N/A |
| Profile management | Yes — user object, names, metadata, orgs | Billing info only (name/address/tax ID) |
| Link licence key to account | Yes — Clerk user id -> D1 users row -> licence (the Clerk build) | Only via metadata on the Customer + our D1 mapping; Stripe alone cannot gate app features |
| Billing self-service | No | Yes — portal: payment methods, invoices, subscription changes |
| Identity verification (KYC) | No (not its job) | Yes — Stripe Identity, $1.50/check |
| Cost at 0 users | $0 | $0 (portal free; 2.9% + 30c only when paid) |
| Cost at 1,000 users | $0 (Hobby, under 50k MRU) | $0 + payment fees |
| Cost at 50,000 users | $0 Hobby / $25 Pro | $0 + payment fees |
| Cost at 100,000 users | ~$1,025/mo (Pro, $25 + 50k x $0.02) | $0 + payment fees |

Clerk pricing re-checked 2026-11-26: Hobby $0 to 50,000 monthly
retained users per app; Pro $25/mo ($20 annual), $0.02 per extra MRU
(50,001–100,000). Sources: clerk.com/pricing via Nov 2026 write-ups.
Stripe portal pricing: docs.stripe.com/customer-management — no extra
fee beyond processing.

## 4. Recommendation — complement, don't replace

**Verdict: Stripe cannot replace Clerk. Use both, each for its own job.**

The exact combo for wayback-social:

1. **Clerk = identity.** Sign-up / sign-in (Google + email), sessions,
   "My account" view, password reset, profile. (Already being built;
   see `docs/clerk-auth.md`.)
2. **Stripe = money.** Payment Links (default Paddle, Stripe as the
   swappable alternative) take the payment and create the Customer.
3. **Licence = the bridge.** The Paddle/Stripe webhook mints the
   licence (Ed25519, D1) and stores the mapping
   `Clerk user id <-> Stripe cus_ <-> licence key <-> tier` in D1.
   Paid features gate on licence key OR signed-in linked account.
4. **Stripe portal = billing self-service.** A signed-in user clicks
   "Manage billing" in My account; the server mints a portal session
   for their `cus_` and sends them to Stripe to update their card or
   download receipts. Realistic value is modest while packs are
   one-time — receipts + card updates only — and grows if a
   subscription product ever ships.

## 5. What still needs building

- Portal configuration — **DONE IN TEST 2026-11-27** (Track F):
  test-mode config `bpc_1UgEQNGnFHTsoY17wW8AIubt` (created via the
  Stripe connector, `PostBillingPortalConfigurations`, sandbox
  `acct_1TqN24GnFHTsoY17`; verified live with a read-back:
  active, `is_default: true`, `livemode: false`,
  `default_return_url`
  `https://app.deletedproof.northforgelabs.dev/dashboard.html`,
  headline "Manage your ArchiveCheck purchase", privacy policy URL
  `https://deletedproof.northforgelabs.dev/trust.html`;
  invoice history + payment-method update + customer update (email,
  name) enabled; subscription cancel/pause/update OFF — the packs
  are one-time, there is nothing to cancel. No terms-of-service URL
  set (no ToS page exists yet — do not invent one). Metadata
  `product: archivecheck, environment: test`. Live still has 0
  portal configurations.
- Portal session endpoint — **BUILT LOCALLY 2026-11-27** (Track F):
  `functions/api/billing-portal.js` (`POST /api/billing-portal`,
  152 lines) — verifies the caller's licence key with the shared
  verifier (`functions/_lib/verify-key.js`, DP2/DP1), looks up the
  linked Stripe customer in D1 (`licences.stripe_customer_id`,
  migration 0004 — NOT yet applied, see below), creates a Billing
  Portal session via `POST /v1/billing_portal/sessions` with
  `STRIPE_SECRET_KEY` (test) and `return_url` to the dashboard, and
  returns `{portal_url, return_url}`. Honest failures: no linked
  customer → 404 (never a fake link); bad key → 401 (the key is the
  credential here); no DB / no secret → 503; a live secret key
  (`sk_live_...`) is REFUSED outright, 503, Stripe never called;
  migration 0004 not applied → 503 naming the migration; Stripe
  errors pass through with their status + message; Stripe
  unreachable → 502. The licence status is deliberately NOT
  checked: the portal shows the buyer their own billing history,
  and a refunded buyer still has receipts to see. Node suite
  `functions/api/billing-portal.test.mjs` 13/13 (mocked Stripe
  fetch — the exact request is asserted: POST, Basic auth with the
  test secret, customer + return_url + configuration in the body).
  The endpoint IS wired into the dashboard now (Track L,
  `web/dashboard-server.js` — "Manage billing" in the Licence
  card; honest states only, never a fake link). **Proven
  end-to-end against a real test customer 2026-11-27 ~05:50 UTC
  (Track L):** test customer `cus_VhhPSdmcCj0fDo`
  ("ArchiveCheck Portal Test", portal-test@example.com,
  metadata `product: archivecheck, environment: test,
  purpose: portal-e2e-test`) + test config
  `bpc_1UgEQNGnFHTsoY17wW8AIubt` → real portal session
  `bps_1UgI0pGnFHTsoY176h14Q4L0`, `livemode: false`,
  `return_url`
  `https://app.deletedproof.northforgelabs.dev/dashboard.html`.
  The session URL itself is a secret (redacted in the tool
  output) — it is NOT printed here and expires 5 minutes after
  creation if unused. What is NOT yet proven is the endpoint
  itself doing that call: it needs migration 0004 applied + the
  customer linked in D1 + the Pages secrets (see the runbook
  below). The test-mode config id is the default when
  `STRIPE_PORTAL_CONFIGURATION` is unset; the constant is
  test-only by construction (the `sk_live_` guard refuses live
  keys entirely).

### Portal test runbook — run in one go once John approves (Track L, 2026-11-27)

Prerequisite order matters: the **push first** (the live site
still serves the stale v1.3 build, which has no
`/api/billing-portal` at all — until the push lands, a curl to
the live endpoint 404s). Then, in order:

1. **Apply migrations 0003 + 0004** (John's approval tap —
   D1 writes are human-gated). From the repo root, on a machine
   with wrangler + Cloudflare auth (John's Mac). `--remote` is
   required: without it wrangler writes to a LOCAL D1, not the
   live database (the repo's migration headers omit the flag —
   do not copy them for a live apply):
   ```
   npx wrangler d1 execute wayback-social-licences --remote --file migrations/0003_evidence_usage.sql
   npx wrangler d1 execute wayback-social-licences --remote --file migrations/0004_stripe_customer.sql
   ```
   Verify: `npx wrangler d1 execute wayback-social-licences
   --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('evidence_report_logs'); PRAGMA table_info(licences);"` —
   expect the `evidence_report_logs` table and a
   `stripe_customer_id` column on `licences`.
2. **Insert the test licence + link the test customer.**
   The test key was minted 2026-11-27 from the rotated
   production keypair (Python-minted, verified in the Node
   verifier `{valid: true, tier: "studio", scheme: "DP2"}` and
   by keyHash agreement across runtimes). It has NO purchase
   behind it and NO D1 row yet — inserting the row is what
   activates it, and the row can be deleted to revoke it:
   ```
   npx wrangler d1 execute wayback-social-licences --remote --command "INSERT INTO licences (key_prefix, key_hash, scheme, tier, email, seats, reports_used, status, created_at, stripe_customer_id) VALUES ('DP2-STUDIO-34P6PXG62LKY6', 'd07810523aae1be8df481dd013eac554e780e5a9323665dd48f47a114d4a046c', 'DP2', 'studio', 'portal-test@example.com', 5, 0, 'active', '2026-11-27T05:50:00Z', 'cus_VhhPSdmcCj0fDo');"
   ```
   Test key (test only — do not use as a real licence):
   `DP2-STUDIO-34P6PXG62LKY6Q7O-akUD6mrHHcpzGwFtpaLkRbB4jAJRie_imFA6KllXDjCMKIfi5lg7LVt0THvYwxJwAloZ8YWoF9ho0MuTi_hYBg`
   Verify: `npx wrangler d1 execute wayback-social-licences
   --remote --command "SELECT key_prefix, tier, status, stripe_customer_id FROM licences WHERE key_hash = 'd07810523aae1be8df481dd013eac554e780e5a9323665dd48f47a114d4a046c';"` —
   expect one row, `studio`, `active`, `cus_VhhPSdmcCj0fDo`.
3. **Set the Pages secrets** (dashboard or wrangler from
   John's Mac — the test Stripe secret comes from the Stripe
   dashboard, Developers → API keys, test mode; never paste a
   live key here, the endpoint refuses `sk_live_...`):
   ```
   npx wrangler pages secret put STRIPE_SECRET_KEY --project-name deletedproof
   # paste the TEST secret key (sk_test_...) when prompted
   npx wrangler pages secret put LICENCE_ED25519_PUBLIC_KEY --project-name deletedproof
   # value: MCowBQYDK2VwAyEARKv2d0s14DXxgqIm4SbtMN1uUmK/+4CHVF5SaCe89Vs=
   ```
   (`LICENCE_ED25519_PRIVATE_KEY` is also still to set — the
   Paddle webhook needs it to mint — but the portal test does
   not need it; it only verifies with the public key.)
4. **Prove it — two ways, same session:**
   ```
   curl -s -X POST https://app.deletedproof.northforgelabs.dev/api/billing-portal \
     -H "content-type: application/json" \
     -d '{"key":"DP2-STUDIO-34P6PXG62LKY6Q7O-akUD6mrHHcpzGwFtpaLkRbB4jAJRie_imFA6KllXDjCMKIfi5lg7LVt0THvYwxJwAloZ8YWoF9ho0MuTi_hYBg"}'
   ```
   Expect HTTP 200 `{portal_url:
   "https://billing.stripe.com/p/session?...", return_url:
   "https://app.deletedproof.northforgelabs.dev/dashboard.html"}`.
   Open the URL in a browser within 5 minutes and confirm the
   portal loads (test customer's empty billing history, "Manage
   your ArchiveCheck purchase" headline) and the return link
   lands back on the dashboard. Or in the dashboard: paste the
   test key, verify it, click **Manage billing** — the same
   session opens in a new tab.
   Failure map (the endpoint's own errors): 404 = no D1 row /
   no linked customer (step 2 missed); 401 = the key didn't
   verify (wrong key or the public-key secret is wrong); 503
   "D1 database not configured" = the DB binding is missing on
   the Pages project; 503 "Stripe secret key not configured" =
   step 3 missed; 503 "live Stripe keys are refused" = a live
   key was pasted by mistake — replace it with the test key.
- Webhook mapping: on `checkout.session.completed` /
  `payment_link` purchase, store `cus_` + licence in D1 (same table
  the Paddle webhook uses — one licences table, both providers).
  The column exists as migration 0004
  (`licences.stripe_customer_id` + index); the webhook write itself
  is still to build. Until it lands, a licence gets a linked
  customer only by a manual D1 insert (test only).
- Live checkout: **DONE 2026-11-27 (Track N, §7)** — live
  products/prices/Payment Links created, `REPLACE_STRIPE_*` replaced
  in `web/config.js`, Stripe is the live default checkout. **The
  sales-tax answer is still open** (links have no tax set — the
  test recipe, replicated exactly).
- Sales-tax question (open for John): the test product has no
  `tax_code` and `automatic_tax` is off. If he collects sales tax /
  VAT / GST, enable Stripe Tax (`automatic_tax.enabled: true`) and add
  registrations before the live links go out. Never guess a tax code.

## 6. Next steps (in order)

1. Clerk build finishes (sign-in + link-licence) — in progress.
2. Paddle webhook finishes (D1 licences table) — in progress; the
   Stripe webhook mapping reuses that table.
3. Create the portal configuration in TEST, verify a portal session
   end-to-end with a test customer. — **Config DONE in test
   (bpc_1UgEQNGnFHTsoY17wW8AIubt, 2026-11-27); endpoint built
   (POST /api/billing-portal, 13/13 node tests) + wired into the
   dashboard (Track L, "Manage billing"). Stripe side PROVEN
   2026-11-27 ~05:50 UTC: test customer `cus_VhhPSdmcCj0fDo` +
   test config → real session `bps_1UgI0pGnFHTsoY176h14Q4L0`.
   Still open (runbook in §5, in one go once John approves):
   push first, then apply migrations 0003 + 0004 (`--remote`),
   insert the test licence row + link `cus_VhhPSdmcCj0fDo`,
   set Pages secrets `STRIPE_SECRET_KEY` (test key) +
   `LICENCE_ED25519_PUBLIC_KEY`, then curl the live endpoint /
   click "Manage billing" and confirm the portal loads.**
4. John: confirm the sales-tax answer + say go for live Stripe links.
   — **Go given 2026-11-27 (main chat). Sales-tax answer STILL OPEN**
   (live links ship with no tax set — see §7 flag).
5. Create live products/prices/links, replace `REPLACE_STRIPE_*`,
   deploy, test a live purchase flow end-to-end (sandbox first).
   — **Live products/prices/links DONE 2026-11-27 (§7); config.js
   updated; deploy is the parent agent's next step (batch push).
   A live purchase flow end-to-end is NOT yet run — it needs the
   Stripe webhook (§7 gap) before a real buyer can be fulfilled.**

### Human steps for live portal (do NOT do any of this yet)
- John's sales-tax answer (test product has no `tax_code`,
  `automatic_tax` off) + his explicit go-ahead for live Stripe.
- Create the portal configuration in LIVE (same recipe as test:
  invoice history + payment methods + customer update on,
  subscription cancel off, `default_return_url` to the live
  dashboard — move the URL with the canonical decision if the
  canonical moves to archivecheck.com; the endpoint's `RETURN_URL`
  constant must move with it).
- Build the Stripe webhook mapping (`cus_` ↔ licence in D1) and
  set the Pages secrets (`STRIPE_SECRET_KEY` live key — the
  endpoint refuses `sk_live_...` until this go-ahead is given AND
  the code is updated to allow it; `STRIPE_PORTAL_CONFIGURATION`
  = the live config id).
- Prove it with a real live-mode portal session (test customer
  first), then a real purchase flow.

## 7. Live checkout — LIVE 2026-11-27 (Track N)

John authorized live checkout in the main chat 2026-11-27 ("Use
stripe for live checkout"). The test-mode recipe (§1) was repeated
in the live account `acct_1TqN1vGW6yc5Tf5G` ("NORTHFORGE LABS
LLC"). No approval gate fired on any write — all 16 creates went
straight through. No money moved: only products/prices/links/config
were created (no customers, no charges, no refunds, no test
purchases).

### Live products / prices / Payment Links (launch prices, one-time USD)

| Pack | Product | Price | Payment Link | URL |
|---|---|---|---|---|
| Starter $9 | `prod_VhqhukuyVGq7aQ` | `price_1UgR0MGW6yc5Tf5GOIXgIXQv` ($9.00) | `plink_1UgR0gGW6yc5Tf5GUml7KHAx` | https://buy.stripe.com/6oUaEX3Xm3NB16E8Ik3sI04 |
| Pro Pack $19 | `prod_Vhqhzh5djF0FE9` | `price_1UgR0MGW6yc5Tf5GljpjGLoH` ($19.00) | `plink_1UgR0gGW6yc5Tf5GEfJEfbNR` | https://buy.stripe.com/eVq6oHdxWck7dTqf6I3sI00 |
| Studio $49 | `prod_VhqhwFX9BzlrYV` | `price_1UgR0MGW6yc5Tf5GyoH2O7zj` ($49.00) | `plink_1UgR0gGW6yc5Tf5GSQwQnNKI` | https://buy.stripe.com/28EeVd79ydobeXu2jW3sI01 |
| All-in Bundle $59 | `prod_VhqhzSIdQ3B4RF` | `price_1UgR0NGW6yc5Tf5GEsSd39VR` ($59.00) | `plink_1UgR0gGW6yc5Tf5GMajiY61c` | https://buy.stripe.com/4gM9AT3XmdobbLie2E3sI03 |
| Text-fetch top-up $15 | `prod_Vhqhi6OklkZI2b` | `price_1UgR0MGW6yc5Tf5G9nfyhfkd` ($15.00) | `plink_1UgR0gGW6yc5Tf5G93VserqU` | https://buy.stripe.com/bJe7sLdxW4RF02Ae2E3sI02 |

Every product: metadata `{product: archivecheck, tier, plan}`,
`tax_code: null`. Every price: `currency: usd`, `type: one_time`,
`tax_behavior: unspecified`, metadata `{pricing: launch, product:
archivecheck, tier}`. Every link: `active: true`, `livemode:
true`, `customer_creation: if_required`, `allow_promotion_codes:
false`, `submit_type: auto`, hosted-confirmation message
("Thanks — your <Pack> licence key is on its way by email…";
top-up says 500 credits + receipt instead), metadata `{pricing:
launch, product: archivecheck, tier}`.

### Live Billing Portal configuration

`bpc_1UgR15GW6yc5Tf5G5fREva6D` — active, `is_default: true`,
`livemode: true`. Same recipe as the test config (§5):
`default_return_url`
`https://app.deletedproof.northforgelabs.dev/dashboard.html`,
headline "Manage your ArchiveCheck purchase", privacy policy URL
`https://deletedproof.northforgelabs.dev/trust.html`, no ToS URL,
invoice history + payment-method update + customer update (email,
name) on, subscription cancel/pause/update OFF. Metadata
`{product: archivecheck, environment: live}`.

### Verification (all 2026-11-27, live account)

- **curl (browser UA):** all 5 Payment Links return **HTTP 200**
  with `<title>Stripe Checkout</title>`. The fetched HTML is a
  654 KB JS shell — the product name AND the price digits are NOT in
  the static HTML (normal for Stripe Checkout; prices load via its
  API). The API read-back below is the authoritative verification,
  not the fetched HTML.
- **Stripe API read-back (expanded `line_items.data.price`):**
  every link carries exactly one line item, quantity 1, the
  correct live price id + amount + `one_time` + USD (table
  above). All `active: true`, `livemode: true`, correct tier
  metadata.
- **Rendered-DOM check: NOT done — environment limitation.**
  Playwright Chromium in this VM gets
  `ERR_TUNNEL_CONNECTION_FAILED` on buy.stripe.com (the egress
  proxy refuses its CONNECTs; curl works). The link target is
  asserted in the browser instead: the E2E failure-paths test
  stubs `window.open` and asserts the Starter click opens the
  live URL (see below). A real rendered check should be done
  in the live browser after the push (open any link above).
- **config.js:** `CHECKOUT.provider` is now `"stripe"`; all five
  `REPLACE_STRIPE_*` placeholders are the live URLs above.
  Paddle links stay `REPLACE_PADDLE_*` (alternative via
  `?checkout=paddle`); Gumroad/email unchanged.
- **Tests:** `tests/e2e/test_failure_paths.py` now 7/7 (was 6/6):
  new `test_checkout_default_opens_live_stripe_link` (default
  provider opens the live Starter URL, no dialog) and the
  placeholder test now runs under `?checkout=paddle` (still
  shows the "not connected" dialog, no CLI bleed). Two
  test-harness notes, both proven in isolation: (1) the popup
  URL reads `chrome-error://chromewebdata/` after the load
  fails, so the test stubs `window.open` instead of reading the
  popup URL; (2) the stub records one `None` entry from its own
  install (a Playwright/Chromium quirk, reproduced on
  `about:blank`) — the test asserts membership, not exact
  equality, and says so in its comment.

### ⚠️ THE GAP: no Stripe webhook — a live buyer pays and gets nothing (yet)

The hosted-confirmation message on every live link promises the
licence key "on its way by email". **Nothing sends it.** There is
no Stripe webhook endpoint: `functions/api/paddle-webhook.js`
handles Paddle only, and no `functions/api/stripe-webhook.js`
exists. Until one lands, a live Stripe purchase creates a Stripe
Customer + a charge and NO licence key, NO D1 row, NO email, NO
linked customer for the portal. The buyer would have to email
support and be fulfilled by hand. **Do not take live Stripe
payments at volume until the webhook is built and proven with a
sandbox purchase first** (the same $1 sandbox flow as the Paddle
webhook: `checkout.session.completed` → mint DP2 → D1 `licences`
row → Resend email → map `cus_` for the portal). This was out of
scope for Track N (build links, not the webhook) and is the #1
follow-up for the live checkout.

### Sales-tax flag (John's decision, still open)

The live links replicate the test recipe exactly: **no
`tax_code`, `automatic_tax` off, `tax_behavior: unspecified`**.
That means Stripe collects NO sales tax / VAT / GST on these
purchases. If John needs tax collection, the links must be
rebuilt (or edited) with Stripe Tax enabled + registrations
before they take real payments — never guess a tax code. The
flag is unchanged from §5; the live go-ahead did not answer it.

### Follow-ups before the live checkout is complete

1. **Stripe webhook** (the gap above) — build
   `functions/api/stripe-webhook.js` (verify `Stripe-Signature`,
   mint DP2, D1 row, Resend email, `cus_` mapping), set Pages
   secret `STRIPE_WEBHOOK_SECRET`, prove with a sandbox purchase.
2. **Live portal session** — `functions/api/billing-portal.js`
   REFUSES live secret keys by design (503, Stripe never
   called). Lifting that gate is a code change + John's
   decision, and it also needs Pages secrets
   `STRIPE_SECRET_KEY` (live key — never paste it in chat or
   the repo) and `STRIPE_PORTAL_CONFIGURATION`
   (`bpc_1UgR15GW6yc5Tf5G5fREva6D`, the live config above;
   the code currently defaults to the TEST config id).
   Until then the dashboard "Manage billing" button can only
   work in test mode.
3. **Live purchase flow end-to-end** — after (1): a real
   live-mode purchase (smallest pack, John's card, refunded
   after) proving key delivery + D1 row + portal session.
4. **Regular prices** — the live links are LAUNCH prices
   ($9/$19/$49/$59/$15). When launch ends (90 days or 500
   buyers), create regular-price links ($19/$29/$99/$147/$15)
   and swap them into `web/config.js` the same way.
