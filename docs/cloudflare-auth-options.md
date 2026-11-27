# Auth options — Cloudflare-native vs Clerk (research, 2026-11-26)

**Date:** 2026-11-26. **Status:** research only — no code changed, no
accounts created. **Question from John:** check Cloudflare's docs for
an auth library too, and pick the easiest. **Current state:** a Clerk
agent is building Clerk auth in parallel (`docs/clerk-auth.md`, not
yet landed — this doc does not edit it). Companion:
`docs/storage-auth-plan.md` §2 (Clerk was the Phase 2 pick; Better
Auth the planned escape hatch).

## 1. What Cloudflare itself offers

### Cloudflare Access / Zero Trust — NOT for a consumer product
- **What it is:** identity-aware gate in front of an app. You write a
  policy (allow emails from an IdP, or one-time PIN by email) and
  Cloudflare enforces it at the edge before any request reaches Pages.
- **Pricing (cloudflare.com/products/access, checked 26 Nov 2026):**
  Free $0 for up to 50 users; Pay-as-you-go **$7 per user/month**,
  no user limit; Contract custom. The plan page describes Free as
  "best for teams under 50 users or enterprise proof-of-concept
  tests."
- **Why it loses:** it is built for **team/internal apps**, not public
  sign-ups. There is no public registration page, no user-profile UI,
  no password reset — an admin provisions users (or an IdP does).
  It gates the *whole app* at the edge, so free search would sit
  behind a login wall unless you split the site. And the billing is
  per seat: 1,000 users = **$7,000/mo**, 50,000 users = $350,000/mo.
  A licence-link is technically possible (the `CF-Access-JWT-Assertion`
  header carries the verified email into a Function), but the price
  alone disqualifies it. **Verdict: no.**

### Turnstile — bot check, NOT login
- Free, unlimited verifications (Cloudflare free-stack docs, Oct 2026).
  It proves the visitor is human; it does not know who they are.
- **Verdict: complement, not auth.** Add it to the sign-up and search
  forms whichever auth wins — it costs nothing and stops bot sign-ups.

### Cloudflare Email Service magic link — the real Cloudflare-native path
- Official example in Cloudflare's own docs:
  `developers.cloudflare.com/email-service/examples/email-sending/magic-link/`
  (updated 2026-10-15): a Worker exposes `POST /send-magic-link`,
  generates a `crypto.randomUUID()` token, emails a login link with
  the Email Service binding. The docs' llms index describes it as
  "passwordless login system using magic links sent via email with
  JWT tokens and session management" — the **send half is official;
  the session half (token storage, expiry, JWT issue/verify, refresh)
  is yours to build** in D1 + Web Crypto.
- **Pricing (developers.cloudflare.com/email-service/platform/pricing/,
  updated 2026-11-24):** Workers Free sends **only to verified
  destination addresses** (your own account's addresses — useless for
  customers). Workers Paid **$5/mo** includes 3,000 outbound
  emails/mo, then $0.35/1,000. Inbound Email Routing is free and
  unlimited on both plans. Email Sending is transactional-only, and
  new accounts start with an unpublished low daily quota.
- **What it costs us:** $5/mo from the first real customer email.
  What it costs in work: medium — a Function for request/verify link,
  a D1 table for tokens + users, JWT sessions, rate limiting, and
  Turnstile on the form. **Google social login is NOT included** —
  that is a full OAuth code flow by hand on top. No passwords to
  breach, users live in our D1, zero lock-in.
- **Verdict: viable, and the honest fallback.** If Clerk ever becomes
  a problem before scale, this is a ~1-day build from the official
  example. It is not the easiest *today* because sessions, Google
  login, and password-reset UX are all hand-built.

### Workers OAuth provider — wrong direction
`@cloudflare/workers-oauth-provider` lets you **be** an OAuth
provider (so other apps log in with you). We need the opposite
(let users log in with Google/email). Skip.

## 2. Self-hosted auth libraries (what people pair with Cloudflare)

### Better Auth — the long-term pick, not the easiest today
- MIT, actively maintained: v1.5 (native D1 support — pass `env.DB`
  directly, no adapter) and v1.6 (2026). Email/password, magic link,
  email OTP, Google OAuth, 2FA, passkeys, admin plugin. Library is
  free; optional hosted plans meter audit logs/email/SMS, **not users**
  (Starter $0, Pro $20/mo).
- **Cost:** $0 per user at any scale (+ D1/KV/Workers free tiers;
  email via Cloudflare Email Service $5/mo or Resend free 100/day).
  **Lock-in: none** — users live in our D1.
- **Effort in THIS codebase: medium-high.** It needs npm + wrangler
  bundling for Pages Functions (this repo is deliberately no-build-step
  vanilla JS — Better Auth adds a build pipeline), Drizzle or Kysely
  for complex schemas, and D1's eventual consistency means sessions
  should live in KV, not D1. The `better-auth-cloudflare` package
  glues the bindings. Realistic: 2–3 days to ship properly.
- **Verdict: best economics, wrong moment.** It is the escape hatch
  already planned in `docs/storage-auth-plan.md` §2 — migrate when
  auth spend passes ~$100/mo. Building it now throws away the Clerk
  work already in flight for a worse first week.

### Lucia — DEPRECATED, not a candidate
Deprecated March 2025 by its own author; last release 3.2.2
(Oct 2024); the repo is now a learning resource (one reference file
for writing sessions yourself). Any article recommending it is dated.

### Auth.js (NextAuth) — not for new work
v5 still in beta after ~3 years, security patches only. Since
Sep 2025 it is owned by Better Auth Inc. and the official docs point
new projects to Better Auth. Not a candidate.

## 3. Clerk — the current pick, re-checked 26 Nov 2026

- **Pricing (clerk.com/pricing, checked 26 Nov 2026):** Hobby **$0**,
  50,000 monthly retained users (MRU) per app, prebuilt sign-up /
  sign-in / profile UI, email + all social providers, custom domain.
  Pro **$25/mo** ($20/mo annual), same 50,000 MRU included, then
  **$0.02/MRU** (50k–100k band). 100,000 MRU on Pro =
  $25 + 50,000 × $0.02 = **$1,025/mo**. MRU counts only users who
  return 24+ hours after signing up — one-time visitors never bill.
  Hobby limits: fixed 7-day session lifetime, 1-day log retention,
  Clerk branding, no MFA/passkeys (those need Pro).
- **Effort in THIS codebase: lowest.** `@clerk/clerk-js` loads from a
  CDN script tag — no build step, no DB schema for auth, no email
  templates, no session security to own. Google + email sign-in are
  built in. Licence link: a Function maps `clerk_user_id` → licence
  in D1 (the Clerk agent is building `functions/api/link-licence.js`).
- **Lock-in: real but escapable.** Users live in Clerk's cloud;
  export is via API and a migration means re-issuing sessions. The
  mitigation is the same minimal user schema (id, email, tier,
  licence_key) that makes a later Better Auth migration a table copy.

## 4. Comparison

| Option | Effort here (Pages, no build step, vanilla JS) | Cost 0 / 1k / 50k / 100k users | Email + Google login | Sessions | Licence link in D1 | Switch later |
|---|---|---|---|---|---|---|
| **Clerk** | **Lowest** — CDN SDK, prebuilt UI | $0 / $0 / $0–25 / **$1,025/mo** | Built in | Hosted, 7-day fixed on Hobby | `clerk_user_id` → licence | Medium (export API, re-issue) |
| Better Auth | Medium-high — npm + wrangler build, Drizzle/KV | $0 / $0 / $0 / $0 (+ $5/mo email) | Built in (plugins) | Own D1/KV | Native — same D1 tables | **None** (users already ours) |
| CF magic link (hand-rolled) | Medium — official send example + own JWT/D1 | $0 dev / $5 / $5 / $5–7/mo | Email only; Google = hand-built OAuth | Own JWT | Native — same D1 tables | None |
| Cloudflare Access | Lowest code (dashboard policy) | $0 / **$7,000/mo** / $350k / — | IdP / email PIN, no public sign-up | Edge JWT | Possible via header email | High (no user store of ours) |
| Turnstile | Trivial (script tag) | $0 at all scales | — (not login) | — | — | — |
| Lucia / Auth.js | — | — | — | — | — | **Do not use** (deprecated / beta-only) |

Costs assume retained users ≈ MRU for Clerk; Better Auth / magic-link
costs are the $5/mo Workers Paid email bill (3,000 emails/mo incl.).

## 5. Recommendation — Clerk still wins, for "easiest"

**Ship Clerk now.** It is the easiest option by a wide margin in this
codebase, it costs $0 until 50,000 retained users, and the Clerk agent
is already building it — switching now burns that work for a worse
first week. Cloudflare's own options lose for a consumer product:
Access is team/internal auth with per-seat billing that reaches
$7,000/mo at 1,000 users, Turnstile is a bot check rather than a
login, and the magic-link path is real but hand-builds sessions and
Google login. Better Auth is the right *second* auth system, not the
first: adopt it when auth spend passes ~$100/mo (or when the Clerk
bill first appears), with the user schema kept minimal so the move is
a table copy, not a rewrite.

## 6. Setup steps (winner: Clerk — owned by docs/clerk-auth.md)

1. Create the Clerk app at clerk.com; copy the **publishable key**
   into `web/config.js` (`CLERK_PUBLISHABLE_KEY` placeholder).
2. Set the **secret key** as a Pages env var (never in the repo).
3. D1 `users` table: `clerk_user_id, email, licence_key, tier,
   created_at` — the same columns Better Auth would use later.
4. `functions/api/link-licence.js`: signed-in user posts a licence
   key; server verifies it (DP1 HMAC now, DP2 Ed25519 when the
   Paddle webhook lands) and stores the link.
5. Add Turnstile (free, dashboard keys) to the sign-up form and the
   search console — bot protection, whichever auth wins.

## 7. If we switch Clerk → Better Auth later (migration note)

- **Changes:** client SDK swap (Clerk JS → `better-auth/client`
  fetch calls), sign-in/sign-up UI (Clerk components → own forms or
  Better Auth's UI), session checks in Functions (Clerk JWT verify →
  Better Auth session lookup), Clerk webhooks off.
- **Stays the same:** D1 `users` + `licences` tables and their
  columns, the Paddle webhook → licence minting flow, licence
  verification (DP1/DP2), R2 packs, pricing.yaml, the link-licence
  endpoint shape (user id + key → tier).
- **Sequence:** stand up Better Auth beside Clerk (dual session
  check) → bulk-import users from Clerk's export API (emails +
  Clerk ids; users set a password or magic-link in on first login,
  since passwords cannot be exported) → flip the UI → delete the
  Clerk app after 30 days of no Clerk sessions.

## Sources (all checked 26 Nov 2026)

- Cloudflare Access pricing: cloudflare.com/products/access — Free
  50 users, $7/user/mo PAYG, "teams under 50 users".
- Cloudflare Email Service magic-link example:
  developers.cloudflare.com/email-service/examples/email-sending/magic-link/
  (updated 2026-10-15); pricing:
  developers.cloudflare.com/email-service/platform/pricing/
  (updated 2026-11-24) — Free = verified destinations only; Paid
  $5/mo = 3,000 emails/mo, then $0.35/1,000.
- Turnstile free/unlimited: Cloudflare free-stack docs, Oct 2026.
- Better Auth: better-auth.com (v1.5 native D1, v1.6, 2026);
  community D1 guides confirm Drizzle/Kysely requirement pre-1.5
  and the KV-for-sessions caveat.
- Lucia deprecation: lucia-auth/lucia discussions #1707 (Mar 2025);
  last release 3.2.2 (Oct 2024).
- Auth.js: owned by Better Auth Inc. since Sep 2025; official docs
  recommend Better Auth for new projects.
- Clerk: clerk.com/pricing — Hobby $0 / 50k MRU, Pro $25/mo
  ($20 annual), $0.02/MRU overage; corroborated by Nov 2026
  pricing round-ups (turbostarter.dev, activepieces.com).
