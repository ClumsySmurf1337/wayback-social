# Gaps: user accounts, email, recovery, billing — audit 2026-11-26

**STATUS UPDATE 2026-11-27 (Track M): this audit is now PARTLY SUPERSEDED
— read it as the 2026-11-26 snapshot, not the current state.** Gap 2 (no
email anywhere) is CLOSED in code: the Paddle webhook + Resend email
exists (functions/api/paddle-webhook.js, node suite 10/10; email never
blocks the purchase) — only the human steps remain (Resend account +
verified domain + Pages secrets, issue #4). Gap 1 (no accounts) is
PARTLY closed: Clerk sign-in is built (web/auth.js, link-licence.js)
and John's Clerk app exists with the test publishable key in
web/config.js — secret env var + migration 0002 + Turnstile keys
remain (issue #6). Gap 5 (no billing portal) is PARTLY closed: the
test-mode portal is proven end-to-end (real session) and the live
portal config is being created this round (issue #3, Track N). Gap 4
(lost-key recovery) still has no self-serve path — manual re-issue
only (docs/email-setup.md §5). Gap 7 (sales@example.com placeholder)
is UNCHANGED — still needs John's real address.

**Method:** searched the whole product (web/*.html, web/*.js,
functions/, wayback_social/) for signup / password / email-sending
code, and tested the licence panel end-to-end in Chromium. Nothing
below is inferred — every "missing" was checked and found absent.
**Status:** v1 is licence-key-only BY DESIGN (docs/storage-auth-plan.md
§2 Rule 1). The gaps are real, but most are Phase 2 by decision, not
oversights. A paying customer would still expect them, so each gap
names its unblocker.

## What a paying customer expects vs what exists today

| # | Expectation | Today | Gap? | Covered by |
|---|---|---|---|---|
| 1 | Create an account (sign up / log in) | **No accounts exist.** No signup form, no login form, no password field anywhere in web/. The only identity is a licence key pasted into the "Licence" panel (index.html `#licence`, dashboard.html) and stored in localStorage on that device. | Yes — by design for v1 | Issue #6 (Clerk, Phase 2 — only once paid users ask for cloud-saved packs) |
| 2 | Email receipt + licence key delivered after purchase | **No email is sent anywhere in the product.** No Resend/SMTP code, no webhook, no mail-sending function. `functions/` contains only `api/cdx.js` (the CDX proxy). The only email touchpoint is the `email` checkout provider in web/config.js, which is a `mailto:sales@example.com` placeholder — that address is not real. | Yes — the biggest purchase-flow gap | Issue #4 (Paddle webhook → Ed25519 key minting → D1 → Resend). Blocked on Issue #3 first (Paddle account + real price IDs) |
| 3 | Password recovery ("forgot password") | **No passwords exist, so there is nothing to recover.** This is not a missing page — it is a consequence of gap 1. | No (by design) | — |
| 4 | Licence-key recovery ("I lost my key") | **No recovery path at all.** There is no account and no email record of the purchase, so a lost key is a lost purchase today. The panel warns the key is "stored on this device" only. | Yes — the sharpest edge of gap 2 | Issue #4 (D1 licence store keyed by email → a "resend my key" function). Until then: buyers must save the key themselves |
| 5 | Billing portal (see purchases, invoices, refund request) | **None.** Buy buttons show "Checkout not connected yet" (verified live in Chromium, Pro Pack $19). Paddle's customer portal becomes available once Issue #3 is done. | Yes | Issue #3 |
| 6 | Usage shown across devices (reports used, packs saved) | **Local-only.** Dashboard usage is hand-logged on one device ("log them here by hand until the licence server syncs usage"). No cloud packs, no sync. | Yes | Issue #5 (R2 buckets) + Issue #15 (Studio report counting) |
| 7 | Email checkout that actually reaches the seller | **Placeholder.** `web/config.js` email provider = `mailto:sales@example.com` for all five packs. | Yes — one-line human fix | John: replace with his real sales address when enabling the email provider |
| 8 | Analytics / "did my purchase go through" tracking | **Off.** Cloudflare Web Analytics is disabled in config.js (dashboard.html says so). No telemetry of any kind leaves the browser — verified: the only outbound calls are CDX (archive.org) and the same-origin `/api/cdx` proxy. No searched handle is ever sent to us. | No (privacy choice) | Issue #10 / #14 (enable Web Analytics; keep the no-handle-tracking rule) |

## What DOES work today (verified 2026-11-26, Chromium)

- **Licence panel (the "My licence" panel):** already built — paste a
  key, Verify, tier badge updates (Free → Pro Pack: 2,500
  captures/search, 14 networks, csv/json/jsonl/html), key + tier
  persist in localStorage across reload, Remove clears it, a bad key
  is rejected with "Invalid key: checksum mismatch — not minted with
  this secret". No `web/licence-panel.js` was built as a separate
  file because the panel already exists in index.html + dashboard.html
  (same `licence.js`, demo-secret verification, labelled as demo).
- **Buy-button safety:** every paid Buy button opens the "Checkout
  not connected yet" dialog instead of a dead link — no customer can
  pay into a void today.

## Exact human steps that unblock the gaps (in order)

1. **Issue #3 — Paddle account (John, ~30 min):** create the account
   at https://www.paddle.com/ (vendor dashboard:
   https://vendors.paddle.com/), create one product per pack
   (Starter $9/$19, Pro $19/$29, Studio $49/$99, Bundle $59/$147,
   top-up $15), copy the five checkout links into `web/config.js`
   over the `REPLACE_*` placeholders. Stripe alternative:
   https://dashboard.stripe.com/ → Payment Links (same five links).
   Paddle sandbox for testing: https://sandbox-vendors.paddle.com/
   (separate account — never paste live price IDs into test).
2. **Issue #4 — webhook + email (build, then John creates the
   accounts):** Resend free tier (100 emails/day) at
   https://resend.com/ for the API key; D1 database in the
   Cloudflare dashboard; Pages Function `functions/api/paddle-webhook.js`
   (verify `Paddle-Signature`, mint Ed25519 key, write D1, email the
   key). Test with a $1 Paddle sandbox purchase. This single build
   closes gaps 2, 4 and most of 5.
3. **Issue #6 — accounts (only when paid users ask):** Clerk free
   tier (50k retained users) at https://clerk.com/; escape hatch
   Better Auth + D1. Do not build login before cloud packs exist.
4. **Gap 7 (one line):** replace `sales@example.com` in
   `web/config.js` with John's real sales address.

## What NOT to build

- Do not add a password system: v1 deliberately has no passwords
  (nothing to breach, nothing to reset). Accounts arrive with Clerk
  in Phase 2, not as a homegrown login form.
- Do not store searched handles server-side to "recover" a purchase
  — the no-tracking rule (docs/storage-auth-plan.md) forbids it.
- Do not enable the `email` checkout provider until the address is
  real (gap 7) — a mailto to a dead address is worse than the
  "not connected yet" dialog.
