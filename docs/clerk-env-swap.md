# Clerk env swap + close-to-prod checklist

**Date:** 2026-11-27. **Status:** swap implemented in code + tested
locally; prod instance does NOT exist yet; test users NOT created
yet; email flow NOT tested yet (all three are post-deploy steps,
see §11). Companion: `docs/clerk-auth.md` (the Clerk build) and
`docs/stripe-vs-clerk.md` (Stripe portal).

## §10. Dev/prod env swap — design

**One paragraph:** the browser never hardcodes which environment it
is in. At boot the page fetches same-origin `GET /api/config`
(`functions/api/config.js`), which returns the PUBLIC keys from that
deployment's Pages env vars — `CLERK_PUBLISHABLE_KEY` and
`TURNSTILE_SITE_KEY`, Production vs Preview — and the page uses
them. When the endpoint has no key (env var not set yet, localhost
with no Functions, or an old deploy without the endpoint), the page
falls back to the static values in `web/config.js` (the dev
publishable key today; the Turnstile placeholder until a site key
exists). Secrets never leave the server: `CLERK_SECRET_KEY`,
`TURNSTILE_SECRET_KEY`, `LICENCE_SECRET`, the Ed25519 keys, the
Stripe/Paddle/Resend keys are read from env only by the Functions
that need them — the swap needs no code change for them, only the
right value in the right environment (Production vs Preview) in the
Pages dashboard.

**Why not hostname-based selection:** the public keys could live in
the bundle with a hostname switch, and that would work — but John's
instruction for this round was env vars per environment with config
reading the deployed environment's vars, and the endpoint version
does exactly that while keeping the keys out of the repo entirely
(the dev key stays in `config.js` only as the local/dev fallback
until the Preview env var is set, then the endpoint takes over).
The endpoint also gives one place to verify per-environment
correctness live: `curl https://app…/api/config` must show the dev
key on Preview and the prod key on Production.

**Precedence (per key):** endpoint value wins when it is a real key
(non-empty, no `REPLACE_`); otherwise the static `config.js` value;
when neither has a real key the feature stays unconfigured and the
page behaves exactly as before (free search works, sign-in shows
"coming soon", search runs with no bot check). The endpoint is
never required — a failed fetch just means the static fallback.

**Files:** `functions/api/config.js` (58 lines, GET only, 405 on
other methods, `cache-control: no-store`, returns public keys only),
`web/runtime-config.js` (121 lines, cached single fetch, pure
`merge()`), `web/auth-ui.js` (initAuth consults it first),
`web/turnstile.js` (ensureToken consults it first),
`scripts/dev-server.mjs` (routes `/api/config`; locally the env
comes from the shell, e.g. `CLERK_PUBLISHABLE_KEY=pk_test_… node
scripts/dev-server.mjs 8903`). Tests: `web/runtime-config.test.js`
16/16, `tests/test_clerk_auth.py` 10/10 (incl. an endpoint test
proving no secret field is ever returned), E2E auth slice 6/6.

### Env-var matrix (names + environment + purpose — never values)

| Var | Preview | Production | Purpose / status |
|---|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | `pk_test_…` (Socialz dev) | `pk_live_…` | Served by `/api/config`. Preview: NOT SET yet (config.js fallback holds the dev key) — settable now via the API route (type `secret_text`, see the `CLERK_SECRET_KEY` row): the main chat owns Cloudflare setup, so this doc does not set it. Production: NOT SET — no prod instance yet (§11). |
| `CLERK_SECRET_KEY` | `sk_test_…` | `sk_live_…` | `link-licence.js` session check. **SET 2026-11-27 10:27 EST** — via the Cloudflare API (connector execute, PATCH project), verified live as `secret_text` in Production + Preview (confirmed by API read-back ~10:35 EST). First attempt failed HTTP 500 code 8000000 — the wrong `type` (`secret`); the correct type is `secret_text`. Same 8000000 as the earlier YT_API_KEY PATCH failures: the API route was never broken, the type was wrong. The connector CAN set Pages env vars (PATCH project `deployment_configs`, type `secret_text`) — the dashboard browser task for this secret can be stood down. Dashboard Google sign-in is broken for this account (Cloudflare rejects the OIDC callback, 5 attempts) — use the API route for Pages work. Production: pending prod instance. |
| `TURNSTILE_SITE_KEY` | site key | site key | Served by `/api/config`. NOT SET anywhere — no Turnstile site created yet; John to supply (Cloudflare dashboard → Turnstile → Add site; the dashboard sign-in is broken for this account, so the API route is the fallback if it stays broken — main chat owns Cloudflare setup). |
| `TURNSTILE_SECRET_KEY` | secret | secret | `cdx.js` siteverify. NOT SET anywhere — same step as above. |
| `LICENCE_SECRET` | — | prod DP1 secret | `link-licence.js` DP1 verify. NOT SET. NOT the public demo secret in `web/config.js`. |
| `LICENCE_ED25519_PUBLIC_KEY` | SPKI b64 (same both) | same | `link-licence.js` + `licence-check.js` DP2 verify. NOT SET in Pages yet (baked into `licence2.py` / `licence.js` only). |
| `LICENCE_ED25519_PRIVATE_KEY` | PEM | same | Paddle webhook minting. NOT SET — blocked on John's call (connector Preview-only dev secret vs Drive file + his Mac wrangler). **Technical note:** the API route for Pages secrets works (type `secret_text` — see the `CLERK_SECRET_KEY` row), so the only remaining blocker is John's go-ahead on the approach, not the mechanism. |
| `STRIPE_SECRET_KEY` | test key | live key | Billing portal endpoint. NOT SET. Note: the endpoint refuses `sk_live_…` by design until that gate is lifted deliberately. |
| `PADDLE_WEBHOOK_SECRET`, `PADDLE_WEBHOOK_SECRET_SANDBOX`, `PADDLE_API_KEY`, `PADDLE_PRICE_IDS` | — | — | Paddle webhook. NOT SET — no Paddle account yet. |
| `RESEND_API_KEY`, `RESEND_FROM` | — | — | Licence email delivery. NOT SET — no Resend account yet. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | — | — | Presigned pack uploads. NOT SET — buckets exist, credentials don't. |
| `YT_API_KEY` | — | — | PARKED (John, 2026-11-26). Do not set. |

`APP_URL` needs no env var: the code default is now
`https://app.deletedproof.northforgelabs.dev` (canonical retarget,
2026-11-27). Web Analytics token is not an env var — it goes in
`web/config.js` `ANALYTICS` once the dashboard step is done.

**Project bindings (set 2026-11-27 ~10:35 EST via the connector
API — the live project had ZERO env vars and NO D1/R2 bindings at
all, even though `wrangler.toml` already declared them):** D1
binding `DB` → `wayback-social-licences`; R2 binding `PACKS` →
`deletedproof-packs` (Production) / `deletedproof-packs-staging`
(Preview). Before this, the deployed Functions had no database and
no pack bucket at all — `link-licence.js` would have answered 503
"D1 not configured" on the live site. **All of it takes effect on
the NEXT deploy, not the live build** — the post-deploy setup test
(§11) verifies it live. Deploy flow (John, 10:35 EST): `develop`
branch → preview/dev deploys only; `main` → production; other
branches get no deploys — so Preview in this doc always means a
`develop`-branch deploy.

## §11. Close-to-prod checklist

### Clerk project settings — verified state (dashboard, 2026-11-27)

App **Socialz** (`app_3MhAJrLNopBlL17AH8OOXywPnPs`), dev only, no
production env. Email ON (code only, magic link OFF), Google ON
(shared creds — consent screen every time), Username ON (4–64),
Password ON (min 15, compromised-password rejection ON). Phone,
Passkeys, Biometric, Web3, MFA all OFF. 0 users; secret key never
used. Paths default to the Clerk Account Portal; Home URL and
fallback host blank.

**Keep at default (and why):** email-code-only (the product's
promised flow; magic link stays OFF — code-only is simpler to test
and matches the doc); Google shared creds in dev (fine for dev);
Username on (harmless, gives users a handle); password rules as
verified; Phone/Passkeys/Biometric/Web3 OFF (not needed for this
app); Account Portal paths (they work with zero extra pages —
app-hosted sign-in pages are later polish, not a launch blocker);
MFA OFF for now (revisit for the admin account once real money
flows — a strong unique password is the interim).

**Verify in the dashboard (status NOT confirmed by the read-only
check — do not assume):** Attack protection → Bot sign-up
protection (the doc says enable it; the verification did not
report its state — turn it ON); Sessions (lifetime, multi-session);
Sign-up restrictions (allowlist/blocklist, if any); Domains —
confirm the preview hosts (`*.deletedproof.pages.dev`,
`*.deletedproof.northforgelabs.dev`) are allowed origins for the
dev instance, or sign-in from the deployed preview will be
blocked; if blocked, add them in Dashboard → Domains.

**Needs John (dashboard steps, exact):**
1. **Production instance** — Clerk Dashboard → Socialz app →
   environment switcher (shows "Development") → "Create production
   instance" (label follows the dashboard's current flow) → enter
   the production domain (`deletedproof.northforgelabs.dev` for now;
   the bought domain later) → Clerk issues `pk_live_` /
   `sk_live_`. Then set them as the Production env vars
   (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) in Pages.
   Mirror the dev sign-in methods in the production instance.
2. **Custom Google OAuth creds (production)** — Google Cloud
   console → create an OAuth client → Clerk Dashboard → SSO
   connections → Google → "Use custom credentials" ON → paste the
   client ID + secret. Until then every Google sign-in shows the
   consent screen (dev behaviour, acceptable).
3. **Custom domain (optional, later)** — Clerk Dashboard →
   Domains → Add domain (e.g. `clerk.deletedproof.northforgelabs.dev`)
   → add the DNS CNAME it shows. Keeping the Clerk Account Portal
   domain works without this step.

### Admin + test users — plan (NOT created yet)

**Unblocker (exact):** the secret-key half is DONE — `CLERK_SECRET_KEY`
is set (Production + Preview, verified live 2026-11-27 10:27 EST,
via the API route). What remains is the deploy being live + a
creation path. PREFERRED: sign up on the deployed app (tests the
real flow, needs no dashboard and no CLI auth). BACKUP: Clerk CLI
auth on John's Mac (`npx -y clerk@latest auth login`), then the
Backend API. The Dashboard → Users path is WEAK right now: John
has no Cloudflare password, Google SSO to the dashboard is broken
(OIDC callback rejected 5x), and the secondary-member workaround
is pending his email choice — do not invite anyone unconfirmed.
Do not fake a creation.

**Admin user:** John himself, `clumsysmurf30@gmail.com` — sign up
on the deployed app (this also exercises the real flow), then link
his Studio admin key (`DP1-STUDIO-…` — the key given to him
2026-11-26) in My account. "Admin" is a usage label here, not a
Clerk role — the app has no admin role yet.

**Test users (create in the Clerk Dashboard → Users → Create
user — no email code needed that way):**
- `test+free@archivecheck.example` — no licence; must stay Free.
- `test+pro@archivecheck.example` — link a Pro demo key; Pro caps
  must follow the account to a second browser profile.
- `test+studio@archivecheck.example` — link a Studio demo key;
  evidence-pack gating must unlock.
- **Correction to the old plan:** `docs/clerk-auth.md` §7 step 8
  said "sign up each one in the browser" — `@archivecheck.example`
  is not a real inbox, so no verification code can ever arrive
  there. Create them in the Dashboard (password set there, email
  verification skipped) OR use John's Gmail `+` aliases
  (`clumsysmurf30+archivecheck-free@gmail.com`, `+pro`, `+studio`)
  so the codes land in his inbox. Delete the test users in the
  Dashboard after the setup test.

### Email login flow — test script (post-deploy, real browser)

1. Open `https://app.deletedproof.northforgelabs.dev/` in a real
   browser (not the sandbox — its egress proxy blocks the Clerk
   SDK fetch, see below).
2. Sign up as the admin user (John's email). The code goes to his
   inbox — **ask him for it; never invent one.**
3. Sign in with the email code. Confirm the header shows the
   account and the dashboard "My account" card shows the email.
4. Link the Pro demo key in My account → confirm Pro caps
   (2,500 captures, all 14 networks, JSONL export).
5. Sign out; sign in on a second browser profile → tier follows
   the account (proves the link is server-side, not the device).
6. Repeat for Studio (evidence-pack button unlocks, 10/10
   counting) and Free (no licence → Free caps, Studio features
   blocked with the honest message).
7. Sign out everywhere; delete the test users in the Dashboard.

### Sandbox limits (known, do not re-prove by looping)

- The sandbox browser cannot fetch the Clerk SDK from jsDelivr
  (`ERR_TUNNEL_CONNECTION_FAILED` — the VM egress proxy blocks
  the browser's CONNECT). The page handles it honestly
  ("Sign-in failed to load … — licence keys still work.") and the
  E2E suite accepts that state locally. **The real sign-in render
  can only be proven in a real browser against the deployed site**
  — that is step 2–3 of the script above, not a local test.
- The dev-server `/api/config` on localhost answers `enabled:false`
  (no env vars) and the page falls back to `config.js` — that is
  the designed behaviour, verified live 2026-11-27.

### Post-deploy setup test (runs after the push — Track Q)

- [ ] `/api/config` on Preview returns the dev key; on Production
  returns the prod key (once set); no secret field in either.
- [ ] Sign-in renders on `app.` (real browser); email code flow
  works (script above); Google sign-in works (consent screen
  expected on dev creds).
- [ ] Licence linking works end to end (`/api/link-licence` 200,
  tier follows the account) — needs migration 0002 applied +
  `CLERK_SECRET_KEY` set + `LICENCE_ED25519_PUBLIC_KEY` set.
- [ ] Stripe live links load (200 + checkout renders); Paddle
  stays the `?checkout=paddle` alternative (still placeholders).
- [ ] Turnstile: site key set → widget renders, search carries a
  token, `/api/cdx` verifies it; secret missing → proxy stays
  open with the honest behaviour (never a hard fail).
- [ ] Full E2E green on the pushed tree (the final validation
  gate), zero errors, on preview + production.
