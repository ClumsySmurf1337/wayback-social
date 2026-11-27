# Clerk authentication — design, setup, and the Better Auth escape hatch

**Date:** 2026-11-26. **Status:** built, not live — no Clerk account
exists yet, no keys are configured, D1 is not created. The code is
written so the site works exactly as before until the human steps
in §6 are done. Companion docs: `docs/storage-auth-plan.md` §2
(Clerk was the Phase 2 pick), `docs/cloudflare-auth-options.md`
(the comparison that re-confirmed Clerk over Cloudflare Access,
the hand-rolled magic link, Better Auth-for-now, Lucia, Auth.js).

## 1. What it is

Clerk is the login system. A visitor can sign up / sign in with
email or Google (Clerk's prebuilt UI, `@clerk/clerk-js` 6.48.0,
MIT, loaded from jsDelivr — no build step, no npm). Auth is
**optional**: the free search works signed out, and paid features
work with **either** a licence key **or** a signed-in account that
has a licence linked. Nothing that worked before requires a login.

## 2. Architecture

```
Browser                              Cloudflare Pages
──────────────────────────────────────────────────────────────
index.html / dashboard.html
  ├─ config.js          CLERK.publishable_key (public)
  │                    TURNSTILE.site_key (public)
  ├─ auth.js            tier logic (pure, Node-tested):
  │                      effectiveTier() = higher(licence tier,
  │                      linked-account tier while signed in)
  ├─ auth-ui.js         loads Clerk SDK, renders #auth-area,
  │                      opens Clerk sign-in / sign-up modal,
  │                      sign out, re-applies tier caps
  ├─ turnstile.js       invisible Turnstile widget for search
  └─ licence.js         DP1 licence verify (unchanged)
        │  POST /api/link-licence {licence_key}
        │  Authorization: Bearer <Clerk session JWT>
        ▼
functions/api/link-licence.js
  ├─ verifies the session via Clerk Backend API
  │  (GET /v1/sessions/:id, CLERK_SECRET_KEY)
  ├─ verifies the DP1 key (HMAC, LICENCE_SECRET)
  └─ upserts D1 `users` (clerk_user_id, email, key hash, tier)
        │
        ▼  (Paddle webhook agent owns this table)
functions/api/paddle-webhook.js  →  D1 `licences` (key_hash, email,
   tier, seats, txn_id) + Resend email with the key
```

**Gating rule (one line):** a paid feature is allowed when
`effectiveTier()` — the higher of the licence-key tier on this
device and the linked-account tier while signed in — meets the
feature's tier. The rule is enforced in the browser UI
(`console.js` `currentTier()` delegates to `WS_AUTH.effectiveTier()`)
and, for server-side actions (linking, future pack uploads), in the
Functions. The free tier never needs a sign-in or a key.

**Files (all under ~300 lines):**

| File | Job |
|---|---|
| `web/auth.js` (227) | Tier logic, store, session state, link-licence client, test hooks |
| `web/auth-ui.js` (140) | Clerk SDK load, header auth area, sign-in/up modal, sign out |
| `web/turnstile.js` (186) | Invisible Turnstile widget, token + idempotency key per search |
| `web/auth.test.js` | Node tests for auth.js (no browser, no Clerk account) |
| `web/turnstile.test.js` | Node tests for turnstile.js |
| `functions/api/link-licence.js` (193) | GET linked tier / POST link a key (D1, Clerk session check) |
| `functions/api/cdx.js` | + Turnstile server verification (only when the secret is set) |
| `web/config.js` | `CLERK` + `TURNSTILE` blocks (placeholders until §6) |
| `tests/test_clerk_auth.py` | pytest wrapper: node tests + link-licence Function stubs |
| `tests/e2e/test_auth.py` | Playwright: auth UI present, signed-out search works |

## 3. Keys — what goes where

| Key | Public? | Where it lives |
|---|---|---|
| Clerk **publishable** key (`pk_test_…` / `pk_live_…`) | Yes — safe in frontend code (Clerk's own docs put it there) | `web/config.js` `CLERK.publishable_key` |
| Clerk **secret** key (`sk_test_…` / `sk_live_…`) | **No — never in the repo, never in `web/`** | Pages env var `CLERK_SECRET_KEY` (dashboard or `wrangler pages secret put`) |
| Turnstile **site** key | Yes — public by design | `web/config.js` `TURNSTILE.site_key` |
| Turnstile **secret** key | **No** | Pages env var `TURNSTILE_SECRET_KEY` |
| Licence minting secret (`LICENCE_SECRET`) | **No** | Pages env var (production DP1 secret — NOT the public demo secret) |

Test vs live: Clerk has separate dev (`pk_test_`/`sk_test_`) and
production (`pk_live_`/`sk_live_`) instances. Use the **dev**
instance on the northforgelabs.dev test hosts and the **live**
instance on the production domain. The publishable key in
`config.js` is the only key that ever ships in the repo.

## 4. D1 schema — `users` table + merge point with the Paddle webhook

**The database already exists** (created 2026-11-26 by the Paddle
webhook build): `wayback-social-licences`
(`38a206cb-5256-4ff0-b8b7-d5a06c2d4d22`), bound as `DB` in
`wrangler.toml`, schema `migrations/0001_licences.sql` already
applied. What is NOT applied yet is the `users` table — it ships
as `migrations/0002_users.sql` in this build. Apply it:

```sh
wrangler d1 execute wayback-social-licences --file migrations/0002_users.sql
```

(Or run the SQL below via the Cloudflare dashboard.) Until it is
applied, `link-licence.js` 500s on link attempts — the binding is
live but the table is missing, so apply 0002 before testing links.

```sql
CREATE TABLE IF NOT EXISTS users (
  clerk_user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  licence_key_hash TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

**Merge point with the Paddle webhook** (`functions/api/paddle-webhook.js`
+ `migrations/0001_licences.sql`, landed 2026-11-26): that side
owns `licences (key_prefix, key_hash, scheme, tier, email,
paddle_transaction_id, paddle_customer_id, paddle_price_id, seats,
reports_used, status, created_at, revoked_at)` and
`webhook_events`. The two tables join on the **SHA-256 hex of the
full licence key** — `link-licence.js` stores exactly that hash
(via the shared `keyHash()` in `functions/_lib/dp2.js`, the same
function the webhook uses) in `users.licence_key_hash` and never
stores the raw key. The webhook also writes `users.tier` when it
mints for an email that already has an account — same columns,
same table, no second schema. `users.tier` is a cache of the linked
key's tier at link time; `licences` is the authority if they ever
disagree (e.g. a refund revokes the key — see
`functions/api/licence-check.js`, which re-verifies the signature
server-side AND checks D1 status).

## 5. Licence linking + DP2 hook

Flow: signed-in user pastes a key in My account → the browser
checks it locally first (fast, honest error) → POST
`/api/link-licence` with the Clerk session token → the Function
verifies the session (Clerk Backend API), verifies the key, upserts
`users`, returns the tier → the browser caches `ws_linked_tier`
and re-applies the caps. GET `/api/link-licence` returns the linked
tier for the signed-in account (used after sign-in).

**DP1 (today):** HMAC-SHA256, verified in the Function with
`LICENCE_SECRET`. **DP2 (Ed25519, production):** verified with the
shared verifier in `functions/_lib/dp2.js` (`verifyKey`) against
the Pages env var `LICENCE_ED25519_PUBLIC_KEY` (SPKI DER base64 —
the same public key as `functions/api/licence-check.js` uses and
the same keypair `scripts/gen_licence_keys.mjs` generated). If that
env var is not set, linking a DP2 key answers 503 ("DP2 public key
not configured"). The endpoint shape, the D1 columns, and the
browser code do not change between DP1 and DP2.

## 6. Turnstile — bot check, not login

Turnstile proves the visitor is human; it does not know who they
are. Two places, two mechanisms:

**Sign-up (Clerk's own, no code):** Clerk's bot sign-up protection
is Turnstile-based and invisible for 99.9% of users. Enable it in
the Clerk Dashboard → **Attack protection → Bot sign-up
protection** (toggle on). Clerk runs the challenge inside its own
sign-up flow — do not add a second widget to Clerk's components.

**Search form (own widget, `web/turnstile.js` + `functions/api/cdx.js`):**
an invisible widget renders into `#turnstile-widget`. Before a
search runs, the page executes the challenge and caches
`{token, idem}` (one idempotency key per search). Every CDX request
of that search carries `cf-turnstile-response` + `cf-turnstile-idem`
to `/api/cdx`; the Function verifies them against Cloudflare's
`siteverify` endpoint and never forwards them to archive.org.
Why the idempotency key: Turnstile tokens are **single-use** —
validating the same token twice returns "timeout-or-duplicate", and
a broad search makes many CDX requests. Repeated validations with
the same idempotency key return the cached outcome.
When no site key is configured, the widget never loads and searches
run exactly as before; when `TURNSTILE_SECRET_KEY` is not set, the
proxy verifies nothing (same behaviour as today).

**Test keys (Cloudflare docs — public dummy keys, safe in tests):**

| Site key | Secret key | Behaviour |
|---|---|---|
| `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` | Always passes |
| `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` | Always blocks |
| `3x00000000000000000000FF` | `3x0000000000000000000000000000000AA` | Forces interactive challenge |

A test secret accepts only the matching dummy token; a production
secret rejects dummy tokens — switch both together.

## 7. Human steps to go live (in order)

1. **Clerk app:** clerk.com → Sign up → Create application →
   name it `ArchiveCheck` → enable **Email** + **Google** sign-in
   (the two the product promises) → Create. Keep the **development**
   instance for the northforgelabs.dev test hosts; create the
   **production** instance later for the production domain.
2. **Publishable key:** Clerk Dashboard → API Keys → copy the
   **Publishable key** (`pk_test_…`) → paste into `web/config.js`
   `CLERK.publishable_key` and set `enabled: true`. Push to GitHub;
   Pages redeploys; the header should show Sign in / Sign up.
3. **Secret key:** same page → copy the **Secret key** (`sk_test_…`)
   → Cloudflare dashboard → Pages `deletedproof` → Settings →
   Environment variables → add `CLERK_SECRET_KEY` (production +
   preview) **or** `wrangler pages secret put CLERK_SECRET_KEY`.
   Never paste it in the repo, in chat, or in `web/config.js`.
4. **Bot protection:** Clerk Dashboard → Attack protection → turn
   **Bot sign-up protection** ON (Turnstile-based, invisible).
5. **D1 users table:** the database already exists
   (`wayback-social-licences`, bound as `DB`); apply the users
   migration — `wrangler d1 execute wayback-social-licences
   --file migrations/0002_users.sql` — and confirm the `users`
   table exists before testing links. Also set Pages env var
   `LICENCE_ED25519_PUBLIC_KEY` (SPKI DER base64 — ask the Paddle
   webhook build / `scripts/gen_licence_keys.mjs` output; it is the
   public half of the DP2 keypair, safe to store as a var but never
   in the repo).
6. **Turnstile keys:** Cloudflare dashboard → Turnstile → Add site
   → pick any widget name, mode **Managed** (the page renders it
   invisible) → copy the **Site key** into `web/config.js`
   `TURNSTILE.site_key` (`enabled: true`) and the **Secret key**
   into Pages env var `TURNSTILE_SECRET_KEY`. (For local testing,
   use the §6 dummy keys instead — they work on localhost.)
7. **Licence secret:** set Pages env var `LICENCE_SECRET` to the
   production DP1 minting secret (the same secret the Paddle
   webhook uses to mint — coordinate with that agent; it is NOT
   the public demo secret in `web/config.js`).
8. **Test accounts (create in Clerk, then delete before launch):**
   - `test+free@archivecheck.example` — no licence; must stay Free.
   - `test+pro@archivecheck.example` — link a Pro demo key; must
     show Pro caps on a second device after sign-in (proves the
     link follows the account, not the device).
   - `test+studio@archivecheck.example` — link a Studio demo key;
     evidence-pack gating must unlock.
   Sign up each one in the browser, link the key in My account,
   sign out, sign in on another browser profile, and confirm the
   tier badge follows the account. Delete the test users in the
   Clerk Dashboard afterwards (Users → … → Delete).
9. **Smoke the failure modes:** with D1 unbound, linking must say
   "D1 not configured" (not crash); with a wrong key, "Invalid key";
   signed out, the link form is hidden and free search works.

## 8. Better Auth escape hatch (if we ever leave Clerk)

From `docs/cloudflare-auth-options.md` §7 — Clerk gets expensive
fast (Pro $25/mo + $0.02/MRU over 50k; ~$1,025/mo at 100k MRU).
Migrate when auth spend passes ~$100/mo. Better Auth is MIT,
D1-native (v1.5+ takes `env.DB` directly), $0/user.

**What changes:** client SDK swap (Clerk JS → `better-auth/client`
fetch calls), sign-in/sign-up UI (Clerk components → own forms or
Better Auth's UI), session checks in Functions (Clerk JWT verify →
Better Auth session lookup), Clerk webhooks off.
**What stays the same:** D1 `users` + `licences` tables and their
columns, the Paddle webhook → licence minting flow, licence
verification (DP1/DP2), R2 packs, `pricing.yaml`, and the
link-licence endpoint shape (user id + key → tier).
**Sequence:** stand up Better Auth beside Clerk (dual session
check) → bulk-import users from Clerk's export API (emails +
Clerk ids; users set a password or magic-link on first login,
since passwords cannot be exported) → flip the UI → delete the
Clerk app after 30 days of no Clerk sessions.
**Do not use:** Lucia (deprecated Mar 2025) or Auth.js v5
(still beta; owned by Better Auth Inc., docs point new projects
to Better Auth).

## 9. What is NOT built (honest list)

- The Clerk account EXISTS now ("Socialz", dev only — verified
  2026-11-27, §10) and the dev publishable key is wired. What is
  NOT built: the production instance, the Turnstile keys, the test
  users, the email-flow test — see `docs/clerk-env-swap.md` §11.
- D1 exists, but the `users` migration (`migrations/0002_users.sql`)
  has not been applied yet, and no secret keys are set in Pages
  env vars (`LICENCE_SECRET`,
  `LICENCE_ED25519_PUBLIC_KEY`, `TURNSTILE_SECRET_KEY`).
  (`CLERK_SECRET_KEY` IS set — Production + Preview, 2026-11-27.)
- No server-side enforcement of caps on the CDX proxy (the proxy
  only verifies the bot check; caps are a UI + CLI matter until
  a licence-check endpoint lands with the Paddle webhook).
- No password reset / account deletion UI of our own — that is
  Clerk's UserProfile component; add `clerk.mountUserProfile` to
  the dashboard when the account work needs it.
- `auth-ui.js` is browser-only (no Node tests) — covered by the
  Playwright suite instead.

## 10. Dev/prod env swap + close-to-prod checklist

Moved to `docs/clerk-env-swap.md` (§10 swap design + env matrix,
§11 settings / users / email-flow test / post-deploy setup test).
Headline state 2026-11-27: dev publishable key wired
(`web/config.js:172`, enabled); `CLERK_SECRET_KEY` SET via the
Cloudflare API (Production + Preview, `secret_text` — the dashboard
Google sign-in is broken for this account, use the API route);
prod Clerk instance does NOT exist yet; Turnstile keys NOT
supplied yet; test users NOT created yet.
