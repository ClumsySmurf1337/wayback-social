# DeletedProof — Storage (R2), Users, Login & Tracking Plan

**Date:** 2026-11-26. **Status:** plan only — no code, no accounts.
Prices verified live 26 Nov 2026 (Cloudflare R2 pricing page, updated
30 Oct 2026; vendor pricing pages / comparisons checked Oct–Nov 2026).
Re-check at build time; vendors move fast. Companion docs:
`docs/pricing-features.md` (tiers), `docs/cloudflare-hosting.md`
(Pages + Paddle), `docs/branding-seo-plan.md` (subdomains, production).

**Standing rule (John, 2026-11-26) — FREE TIERS ONLY until there are
paying customers.** R2 Standard free tier only (10 GB-mo, 1M Class A /
10M Class B ops/mo, free egress) — never Infrequent Access (no free
tier), never a paid plan. Clerk free tier only; Resend free only. If a
feature needs a paid plan to work, build the free path and log the paid
option as a later upgrade gated on customers (see
`docs/data-sources.md`, "Standing rule").

## 1. R2 storage — verified prices, our cost, retention

### Verified R2 rates (Standard storage, developers.cloudflare.com/r2/pricing)

| Item | Free tier (monthly) | Paid rate |
|---|---|---|
| Storage | 10 GB-month | $0.015 / GB-month |
| Class A ops (PUT, LIST, multipart) | 1,000,000 | $4.50 / million |
| Class B ops (GET, HEAD) | 10,000,000 | $0.36 / million |
| Egress to internet | Unlimited, free | $0 |
| Deletes | Free (always) | Free |

Infrequent Access is cheaper storage ($0.01/GB-mo) but has **no free
tier**, $9.00/M Class A, $0.90/M Class B, $0.01/GB retrieval and a
30-day minimum — do not use it for packs. Stay on Standard.

### What a pack costs us

An evidence pack (JSON/CSV + HTML + replay links, zipped) is ~2–5 MB;
use **3 MB** for planning. 10 GB free tier ≈ **3,300 packs stored**.

| Scale | Stored | Monthly R2 bill |
|---|---|---|
| 100 paying users × 10 packs | 3 GB | $0 (inside free tier) |
| 1,000 paying users × 10 packs | 30 GB | (30 − 10) × $0.015 = **$0.30** |
| 10,000 users × 10 packs | 300 GB | (300 − 10) × $0.015 = **$4.35** |
| 100,000 packs (~300 GB) | 300 GB | **$4.35** |
| 1 TB stored | 1,024 GB | **$15.21** after free tier |

Operations never bind first: 10,000 pack uploads/mo = 10,000 Class A
(1% of the free 1M); downloads are Class B (10M free). **R2 is
effectively $0 until ~3,300 packs are stored, and stays under $5/mo
until ~300 GB.** Egress being free is the whole reason to use R2
over S3 ($0.09/GB egress) for downloadable packs.

### What we store — and what we never store

**Store (per user, in R2):** search-result exports the user chose to
save (JSON/CSV/ZIP evidence packs), each under
`packs/<user-id>/<pack-id>.zip` with a small JSON sidecar
(`created_at`, `tier`, `handle_count`, `sha256`). Nothing else.

**Store (in D1, not R2):** licence records `{key_hash, email, tier,
seats, created_at, revoked}` and usage counters. No passwords, ever.

**Never store server-side:** searched handles or watchlists by
default (local-first is the selling point — the CLI/web keep results
on the user's machine unless they explicitly click "Save to cloud"),
DMs, private-account data, face/biometric data, or raw personal data
about third parties beyond the public archive rows themselves.
A saved pack contains only what the Wayback Machine already published.

### Retention rules (enforce with R2 lifecycle rules + a nightly job)

| User | Retention | After expiry |
|---|---|---|
| Free | **30 days** | Auto-deleted by lifecycle rule; download link dies with it |
| Starter / Pro (one-time) | **12 months** from last activity | Auto-deleted; user warned by email at 30 days before |
| Studio (one-time) | **12 months** from last activity, renewable by any new save | Same; Studio users get a "keep forever" export prompt instead of silent deletion |
| Cancelled / refunded / revoked licence | 30-day grace, then delete | Refund = licence revoked = cloud packs deleted after grace |
| Deleted account (user asks) | Immediate | Delete R2 objects + D1 rows within 24h; confirm by email |

R2 lifecycle rules can expire objects by prefix/age — set
`packs/free/*` → 30 days, `packs/paid/*` → 365 days. Deletion is a
free operation, so expiry costs nothing. Keep a D1 row per pack so
the UI can show "expires on …" before the lifecycle rule fires.

### How the CLI / web app uploads to R2 (no secrets in the browser)

1. User clicks "Save pack to cloud" (web) or runs
   `deletedproof save <export>` (CLI).
2. Client calls a Pages Function `POST /api/pack-upload` with the
   licence key (or session token) and the pack's size + SHA-256.
3. The Function verifies the licence (Ed25519 signature, see §3),
   checks the tier's storage quota, and returns a **presigned PUT
   URL** (S3-compatible SigV4, 15-minute expiry, exact content-length
   and content-type bound, key fixed to that user's prefix).
4. The browser/CLI PUTs the ZIP **directly to R2** — the R2 credentials
   never leave Cloudflare. Downloads work the same way via presigned
   GET URLs (15-minute expiry), or a signed link emailed to the buyer.
5. The Function records the pack in D1 on a confirm call
   (`POST /api/pack-confirm` with the SHA-256, so a tampered upload
   is rejected).

Buckets (separate from the account's existing
`jobquiver-staging-quarantine` bucket — never mix products):
`deletedproof-packs` (production) and `deletedproof-packs-staging`
(test deploys on `northforgelabs.dev`). Private buckets, no public
access; all downloads go through presigned URLs.

### Provisioning checklist (issue #5 — 2026-11-26 status)

**Code DONE locally:** `functions/api/packs-upload.js` (207 lines) —
DP2 licence verification + size/sha validation + SigV4 presigned PUT
(15-min expiry, content-addressed key `packs/<free|paid>/<hash8>/<sha256>.zip`,
free → 30-day retention, paid → 365-day); `functions/api/packs-upload.test.mjs`
**14/14** (signature verified against an independent recomputation);
pytest wrapper `tests/test_packs_upload.py`; CI runs the suite.
**Buckets CREATED LIVE 2026-11-27 01:09 UTC** via the Cloudflare API
(`POST /accounts/9ea150e75aa3812cbaea8ae80bfe2f8d/r2/buckets`, both
`success: true`): `deletedproof-packs` and
`deletedproof-packs-staging`, Standard class, WNAM, jurisdiction
default. The `[[r2_buckets]] PACKS` binding in `wrangler.toml` is now
uncommented (live on the next deploy). Still human: R2 S3 API token +
`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` Pages
secrets (step 2 below), lifecycle rules (step 4), then a real end-to-end
upload test after the push.

**Standing rule (John, 2026-11-26): FREE TIERS ONLY.** R2 Standard
free tier (10 GB-mo, 1M Class A / 10M Class B ops/mo, free egress).
Never Infrequent Access (no free tier), never a paid plan, until
paying customers. At ~3 MB/pack the free tier holds ~3,300 packs;
1,000 users × 10 packs = $0.30/mo — the first paid R2 dollar is
nowhere near v1 scale.

Human steps (or one API call each — no purchase, no card):

```bash
# 1. Create the buckets — DONE LIVE 2026-11-27 01:09 UTC via the
#    Cloudflare API (both success:true, Standard, WNAM). Commands kept
#    here for reference / re-creation:
#    npx wrangler r2 bucket create deletedproof-packs
#    npx wrangler r2 bucket create deletedproof-packs-staging

# 2. R2 S3 API token for presigning (dashboard: R2 → Manage R2 API
#    Tokens → Create API token → Object Read & Write, apply to the
#    two buckets above). Then set the Pages secrets:
npx wrangler pages secret put R2_ACCOUNT_ID --project-name deletedproof
npx wrangler pages secret put R2_ACCESS_KEY_ID --project-name deletedproof
npx wrangler pages secret put R2_SECRET_ACCESS_KEY --project-name deletedproof
#    PACKS_BUCKET is optional (defaults to deletedproof-packs);
#    set it only if the bucket name ever changes.

# 3. Uncomment the [[r2_buckets]] PACKS binding in wrangler.toml
#    (needed by the pack-confirm endpoint, not by presigning) and
#    redeploy (push to main auto-deploys).

# 4. Lifecycle rules (dashboard: R2 → bucket → Settings → Object
#    lifecycle rules; no wrangler one-liner is documented for this):
#      packs/free/* → expire after 30 days
#      packs/paid/* → expire after 365 days
```

**Still to build (follow-up with the Paddle go-live, not this issue):**
`POST /api/pack-confirm` (verify the uploaded object's SHA-256,
record the pack in D1 so the dashboard can show "expires on …") +
D1 `packs` table migration + a client call from the dashboard/CLI
after the PUT succeeds. The lifecycle rules enforce retention even
without the D1 record — the confirm step is about visibility, not
about deletion happening.

## 2. Users, login & tracking — free third parties compared

### Rule 1: v1 needs NO login at all

Launch is licence-key only (see §3): buy on Paddle → key emailed →
paste key → caps unlock, stored in a cookie. No accounts, no
passwords, no user table to breach. Login only becomes necessary
when cloud-saved packs ship (Phase 2) — that is when this section
applies.

### (a) Login / auth — free tiers verified 26 Nov 2026

| Provider | Free tier | Paid after free | Fits Cloudflare Pages? | Verdict |
|---|---|---|---|---|
| **Clerk** | **50,000 monthly retained users/app free** (new plans, Feb 2026 — Clerk's own changelog; older comparisons still say 10,000 MAU, stale) | Pro $25/mo ($20/mo annual) + $0.02 per extra MRU | Yes — JS SDK, no backend to host | ⭐ **Recommended for Phase 2** |
| **Supabase Auth** | 50,000 MAU, 500 MB DB, 1 GB files, 5 GB egress | Pro $25/mo, 100k MAU, then $0.00325/MAU | Yes, but it is a whole backend, not just auth | Runner-up — cheapest per-user at scale, but free projects **pause after 1 week idle** (needs $25/mo Pro to stay live) |
| **WorkOS AuthKit** | **1,000,000 MAU free** | SSO/Directory Sync $125/connection/mo | Yes | Dark horse — biggest free tier; weak for consumer apps, strong if we ever sell B2B/SSO |
| **Firebase Auth** (Identity Platform) | 50,000 MAU free | $0.0055/MAU to 100k, $0.0046 to 1M | Yes | Fiddly: Spark caps 3,000 DAU + email quotas (5 link-emails/day); at 100k MAU ≈ $275/mo — 11× Supabase Pro |
| **Auth0** | **25,000 MAU free** (official pricing page, Nov 2026; older sources say 7,500) | Essentials $35/mo covers only 500 MAU; ~$2,100/mo at 30k users | Yes | ❌ Avoid — the free→paid cliff is the worst in the table |
| **Cloudflare Access** | 50 users free | Paid per user beyond | Yes (native) | ❌ Admin-only — 50 users is not a customer base |
| **Better Auth** | Free forever (MIT library, self-hosted) | $0 per user; optional hosted dashboard Pro $20/mo | Yes — runs in a Pages Function + D1 | ⭐ **Long-term pick**: zero per-user cost, users in our own D1; we run email delivery, patches and rate-limiting ourselves |

**Recommendation:** Phase 1 — no login (licence key only). Phase 2
(cloud packs) — **Clerk**: fastest to ship, free to 50k retained
users, prebuilt sign-in UI, no backend. **What breaks first:** at
50k MRU the bill starts at $25/mo Pro; at 100k MRU ≈ **$1,025/mo**
(50k × $0.02 + $25) — Clerk gets expensive fast. The escape hatch,
planned from day one: migrate to **Better Auth + D1** when auth
cost passes ~$100/mo. Better Auth has no per-user fee at all, so the
migration is a one-time engineering cost that caps auth spend at ~$0
forever. Keep the user schema minimal (id, email, tier, created_at)
so the migration is a table copy, not a rewrite.

### (b) Tracking / analytics — free tiers

| Tool | Free tier | What breaks first | Privacy fit |
|---|---|---|---|
| **Cloudflare Web Analytics** | Free, unlimited sites, no cookies, no localStorage | 6-month retention; sampled after 7 days; no goals/funnels/events | ⭐ **Day-1 default** — already on Cloudflare, zero privacy cost |
| **PostHog** (cloud) | 1M events/mo, 5k session recordings, 1M flag requests, 100k exceptions, 1 project, 1-yr retention | Over 1M events: anonymous $0.00005/event (2M events ≈ $50/mo); **identified events cost ~4× more** ($0.000198) — keep users anonymous | Use when funnels matter (pricing → checkout). Heavier JS, cookie-based — needs a consent note. **Never enable session replay on the search console** (replays would capture typed handles) |
| **Plausible** (cloud) | **No free hosted tier** — 30-day trial, then from $9/mo (10k pageviews) | $9/mo at 10k pageviews | Cookieless, EU-hosted; pay only if you want goals/funnels without PostHog's weight |
| **Umami** | Free (MIT) self-hosted | Needs a Node + Postgres host — Cloudflare Pages cannot run it | Skip unless we already run a VPS |
| Google Analytics 4 | Free | Cookie/consent model; overkill + privacy cost | Skip — Cloudflare analytics covers the need |

**Tracking rules (non-negotiable):** track page views, plan clicks,
checkout starts/completions (from the Paddle webhook) and anonymised
counts only. **Never track searched handles, results, or pack
contents** — that is the user's private investigation, and logging it
would break the trust story and the ethics lines (no monitoring).

### (c) Licence-key delivery & verification

**Correction to `docs/cloudflare-hosting.md` §5:** Paddle Billing
has **no built-in licence-key generation or email delivery** (that
was Paddle Classic). Do not ship assuming Paddle emails the key —
it won't. The v1 design, all free:

1. Paddle `transaction.completed` webhook → Pages Function
   `functions/api/paddle-webhook.js` (same Pages project).
2. Function verifies the `Paddle-Signature` header (HMAC with the
   destination secret, `pdl_ntfset_…`) and rejects unsigned requests;
   fetches the buyer email from the Paddle API (webhooks carry a
   customer ID, not an email); maps price ID → tier.
3. Function mints the key: an **Ed25519-signed token**
   (payload `{email, tier, seats, txn_id}`, private key in a Worker
   secret, public key baked into the web app + CLI). Short human form
   `DP-XXXX-XXXX-XXXX` mapped to the full token in D1.
4. Function writes `{key_hash, email, tier, seats}` to **D1**
   (free tier: 5M rows read/day, 100k rows written/day, 5 GB — and
   since 1 Sep 2026 the free daily limits are **enforced**: over-quota
   queries fail until 00:00 UTC, so keep licence lookups cheap and
   cached) and emails the key via **Resend free tier (100 emails/day,
   3,000/mo)**. KV is the alternative store (100k reads/day, 1k
   writes/day free) but D1 wins: licence checks are relational
   (revocation, seats, expiry) and KV's 1k writes/day cap is the
   first thing that breaks on a launch day.
5. Client verification is **offline-first**: the web app/CLI checks
   the Ed25519 signature with the baked-in public key — no server
   round-trip, nobody can forge a key. An optional online check
   against `/api/licence-check` covers revocation (refunds).
6. Refund/chargeback (`adjustment.created`) → revoke in D1 →
   cloud packs enter the 30-day grace, then delete.

Third-party licence services (LicenseSeat, LicenseManager) do the
same job for a flat monthly fee with no free tier found — not needed
while the Function above is ~150 lines. Revisit only if licence
support becomes a time sink.

**Free-tier breakage order for the whole stack:** Resend 100
emails/day is the first paid wall on a big launch day (then $20/mo
paid tier) → D1 daily write cap on a spike (then Workers Paid,
$5/mo, 25B rows read/mo included) → Clerk 50k MRU → R2 10 GB.
Total fixed cost at launch: **$0 + domain**. First predictable
monthly bill at real traction: **$5/mo Workers Paid + $25/mo
Supabase-or-Clerk Pro**, only when free tiers are genuinely outgrown.

## 3. Subdomains on northforgelabs.dev (testing)

`northforgelabs.dev` is John's dev domain, active on the Cloudflare
account (Free plan) — use it for test deploys now, buy
`deletedproof.com` for production later. One Pages project, hostname
routing in JS (same pattern as production — see
`docs/cloudflare-hosting.md` §2), so the test deployment exercises
the exact subdomain logic that will go live.

| Test host | Mirrors production | Serves in test |
|---|---|---|
| `deletedproof.northforgelabs.dev` | `deletedproof.com` (apex) | Marketing + free search |
| `app.deletedproof.northforgelabs.dev` | `app.deletedproof.com` | Full console |
| `verify.deletedproof.northforgelabs.dev` | `verify.deletedproof.com` | Dating/catfish verify flow |
| `osint.deletedproof.northforgelabs.dev` | `osint.deletedproof.com` | Researcher / batch / evidence pack |
| `legal.deletedproof.northforgelabs.dev` | `legal.deletedproof.com` | Legal triage / citations |

Setup: add each as a custom domain on the Pages project (Cloudflare
auto-creates the DNS — the domain is already on Cloudflare DNS).
**Paddle sandbox only on test hosts** (`sandbox-vendors.paddle.com`
is a separate account from live `vendors.paddle.com` — never paste
live price IDs into the test deploy).

**Cookie-scope caveat (test only):** a licence cookie set on
`.northforgelabs.dev` is shared with John's *other* projects on that
domain. For testing, use a distinct cookie name (`dp_licence`) and
treat test keys as throwaway. In production the cookie is
`.deletedproof.com`, owned entirely by this product.

**Production mapping (once deletedproof.com is bought):** the same
five hosts under `deletedproof.com`, same Pages project, same code —
only the apex changes. No re-architecture, no second backend: one
Paddle account, one product per tier, one D1 licence table, one R2
bucket pair.

## 4. Build order (after the pricing decision is locked)

1. Fix the bundle arithmetic in `config.js` ($147 / 60% off).
2. Evidence-pack ZIP exporter (last unbuilt Studio feature).
3. Pages Function: Paddle webhook → Ed25519 key minting → D1 +
   Resend email. Test with a $1 Paddle sandbox purchase on
   `app.deletedproof.northforgelabs.dev`.
4. Licence-key check in web app + CLI (`--plan` already exists).
5. Phase 2 (only after paid users ask for it): Clerk login +
   R2 presigned-upload Functions + retention lifecycle rules.
6. Never build: user watchlists server-side, monitoring/alerts,
   face search, or any store of searched handles without explicit
   opt-in.

## Addendum (v1.3, 2026-11-26): local HMAC licence scheme (dev/offline)

Shipped in `wayback_social/licence.py` + `wayback-social licence
make|check` + `--licence KEY` on archive/find/batch/diff. Key format:
`DP1-<TIER>-<16 random base32>-<8 hex HMAC-SHA256 checksum>` over
`DP1:<TIER>:<random>`, secret from `WAYBACK_SOCIAL_LICENCE_SECRET`
or `~/.config/wayback-social/licence.key`. `make` is dev-only (refuses
without the env var); `check` / `--licence` verify against the same
secret and unlock that tier's caps from `pricing.yaml`.

This is the **dev/offline equivalent, not production minting**: HMAC
is symmetric, so anyone holding the secret can mint keys — the secret
must never ship to buyers or enter the repo. Production stays as §2(c)
above: the Pages Function mints Ed25519-signed keys on the Paddle
webhook, the CLI/web verify with the baked-in public key (no secret
on the client), revocation is a D1 lookup, and the key is emailed via
Resend. The v1 scheme exists so caps, checkout and the licence UX can
be tested end-to-end before the Function is built. A Bundle purchase
mints a Studio key (bundle caps are Studio-level).
