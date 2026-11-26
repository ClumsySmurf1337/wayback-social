# DeletedProof — Cloudflare Capabilities

**Date:** 2026-11-26. **Status:** research for the build queue — no code
changed. Companion: `docs/data-sources.md` (archive + live sources),
`docs/cloudflare-hosting.md` (Pages project plan),
`docs/storage-auth-plan.md` (auth/storage detail, sibling research).

**Verification method:** limits below are from Cloudflare's own pricing/
limits pages as re-checked by independent round-ups in Oct–Nov 2026
(cloudsteading.com pricing calculator, checked 11 Nov 2026; 1flare.cloud
free-tier catalog, recorded 5 Nov 2026; zenn.dev / dev.to free-tier
checks, Nov 2026). Re-verify against
`developers.cloudflare.com/workers/platform/limits/` before launch —
Cloudflare renames products (Browser Rendering is now "Browser Run")
and moves limits. All figures are the **free plan** unless stated.

## 1. What each primitive does for this product

| Primitive | Free limit (Nov 2026) | How it fits DeletedProof | What breaks first |
|---|---|---|---|
| **Pages** | Unlimited static requests; 500 builds/mo | Hosts the site (already planned in `cloudflare-hosting.md`). One deploy, five subdomains, hostname routing in JS | Builds/mo only if you deploy constantly |
| **Workers** | 100,000 requests/day (resets 00:00 UTC, then Error 1027); 10 ms CPU/invocation; 50 subrequests/invocation | **CDX proxy:** the browser calls our Worker, the Worker calls `web.archive.org/cdx` — dodges browser CORS flakiness and lets us add caching, rate limits and per-plan caps server-side. Also the API layer for licence checks | **This is the first wall.** Every API call, licence check and proxied CDX query counts. ~1.15 req/s average. Paid ($5/mo) jumps to 10 M req/mo |
| **Pages Functions** | Share the Workers quota (100k/day) | Paddle webhook receiver (`functions/api/paddle-webhook.js`), licence verification, "capture now" endpoint — same project as Pages, no separate Worker to deploy | Same 100k/day pool as Workers — count Functions + proxy together |
| **D1** (SQLite at the edge) | 5 M rows read/day; 100k rows written/day; 5 GB total; 500 MB per DB; 10 DBs | **Users + licences + searches ledger:** `licences(key, tier, email, created)`, `usage(key, day, searches, fetches)`, `searches` (metadata only — never store targets' posts server-side; local-first is the selling point). SQL beats KV for "how many fetches has this key used today?" | 100k writes/day is generous; the 500 MB/DB cap matters only if you log every search row. Since 1 Sep 2026 over-quota queries **fail** until midnight UTC — handle that error honestly in the UI |
| **KV** | 100k reads/day; 1,000 writes/day; 1,000 deletes/lists per day; 1 GB stored | **Plan caps + licence cache:** `licence:<key> → tier`, `usage:<key>:<date> → count`. Fast reads, tiny writes. Good for the hot path (is this key valid? has it used its fetches?) | **1,000 writes/day is the tightest KV limit** — a write per search would cap us at 1,000 searches/day. Cache licence lookups, batch usage writes into D1, or count in memory per Worker and flush hourly. Eventually consistent (writes take up to 60 s to propagate) — never use KV for anything that must be instantly true (e.g. a just-bought licence should also be checked against D1) |
| **R2** | 10 GB-month storage/mo; 1 M Class A (write/list) ops/mo; 10 M Class B (read) ops/mo; **zero egress fees** | **Evidence packs:** per-search export bundles (CSV/JSONL/HTML + replay links + hash manifest) stored as objects, downloadable via signed URL. Also stores user-uploaded watchlists (batch input files) | 10 GB is ~100k evidence packs at 100 KB each. Class A 1 M/mo is plenty. Watch the $0.015/GB-mo overage *after* the free tier — cheap, but set a billing alert |
| **Queues** | 10,000 operations/day free (one message ≈ 3 ops: write + read + delete, so ~3,300 messages/day); $0.40/M after | **Batch jobs:** Pro/Studio batch (25–250 handles) goes in a queue; a consumer Worker drains it, runs CDX queries, writes results to R2 + D1, emails/notifies "your batch is ready". Keeps the browser from waiting 60 s on archive.org | 10k ops/day ≈ 3,300 batch handles/day. A viral batch day hits this before Workers does. Paid adds $0.40/M — trivial |
| **Browser Rendering ("Browser Run")** | **10 minutes of browser time/day; 3 concurrent browsers; 5 crawl jobs/day, 100 pages per crawl** (Workers Free). Paid: 10 h/mo included, then $0.09/browser-hour | **Live checks of JS-heavy pages:** render x.com / instagram.com / tiktok.com post pages that return blank shells to plain HTTP, and screenshot the live page for the deleted-diff ("this is what the live page shows now"). Also renders archive.today snapshots that need JS | **10 min/day is tiny** — ~20–30 page renders/day at ~20–30 s each. Studio-only, hard-capped per user per day, queue the rest. This is the most expensive primitive per use — never put it on the free tier |
| **Cron Triggers** | 5 triggers on Workers Free | Daily jobs: reset usage counters (or use date-keyed rows instead), drain the batch queue, run `scripts/seo_check.py` equivalent as a Worker, purge expired R2 packs (free 30 days / paid 12 months per `storage-auth-plan.md`) | 5 triggers is enough (daily + hourly + weekly). Each trigger invocation counts against Workers 100k/day |
| **Turnstile** | Unlimited challenges; 20 widgets; free | **Bot protection** on the search form and the licence/signup form. Invisible, no CAPTCHA friction, no cookies. Verify the token server-side in a Pages Function (never trust the client) | 20 widgets — one per form is fine; don't put a widget on every subdomain page separately |
| **Web Analytics** | Free, unlimited sites (no published per-site price); cookieless, no JS required | Traffic + referrer stats for the marketing pages and SEO monitoring (see `docs/seo-monitor.md`). Privacy-clean — fits the trust story | No custom events — page views only. For event data (searches by network) use Analytics Engine |
| **Analytics Engine** | 100,000 data points/day; Cloudflare says it is not billing for it yet | Custom events from the Worker: `search{network, plan, captures}`, `export{format}`, `checkout{provider}`. SQL read API for a small internal dashboard | 100k points/day is generous; sampling needed only at real scale |
| **Durable Objects** | 100k requests/day; 13,000 GB-s/day; SQLite backend only on Free; 5 GB total | **Per-user rate limiting + live state:** one DO per licence key holds its counters in SQLite — stronger than KV for "has this key hit its cap?" because writes are strongly consistent. Optional at v1; use when KV's eventual consistency bites | Complexity. Start with D1 + KV; add DOs only if licence checks race |
| **Workers AI** | 10,000 neurons/day free | **Optional, not v1:** summarise a fetched replay's text, or classify a capture ("is this a 404 page? a login wall? a real post?"). 10k neurons/day ≈ a few hundred short summaries | Neurons depend on model + input length — easy to burn. Keep it Studio-only if built at all |
| **Email Sending / Email Routing** | Email Sending has a free allowance (verify current limits); Routing is free | Licence-key delivery email and "your batch is ready" mail, without a third-party email service. Paddle already emails keys at v1 — this is the v2 alternative | Verify the current free allowance before depending on it; deliverability of a new domain needs SPF/DKIM/DMARC (see DNS Doctor) |

## 2. Reference architecture (free tier, v1 → v2)

```
Browser / CLI ──► Pages (static site, 5 subdomains, hostname routing)
                      │  (in-browser CDX calls at v1 — no server)
                      ▼
              Worker "api" (v2, when caps must be enforced)
                 ├─► CDX proxy → web.archive.org (cache in KV, 1 h)
                 ├─► Bluesky / Mastodon live checks (no auth)
                 ├─► D1: licences, usage ledger
                 ├─► KV: licence cache + plan caps
                 ├─► Queue: batch jobs (25–250 handles)
                 │      └─► consumer Worker → CDX → R2 evidence pack
                 ├─► R2: evidence packs (signed-URL download)
                 ├─► Browser Rendering: JS-heavy live checks (Studio, capped)
                 ├─► Turnstile: search + signup forms
                 └─► Cron: daily counter reset, R2 purge, SEO check
Paddle webhook ──► Pages Function → verify signature → D1 + KV (licence)
Web Analytics + Analytics Engine ──► traffic + search events
```

**v1 stays static** (browser calls CDX directly, Paddle emails licence
keys, no Worker) — that is the privacy story and the $0 bill. Add the
Worker layer only when a cap must be enforced server-side (paid tiers,
batch queue, Browser Rendering). Do not build the Worker before the
first paying user.

## 3. Package mapping (Cloudflare costs per tier)

| Tier | Cloudflare primitives it may use | Cost driver |
|---|---|---|
| **Free $0** | Pages + Web Analytics only. No Worker, no D1 writes, no R2 | $0. The browser does the work |
| **Starter $19** | + Worker CDX proxy (cached), D1 licence row, KV licence cache | A few hundred Worker req/day. $0 |
| **Pro $29** | + Queue (batch 25), R2 evidence packs, Analytics Engine events | Queue ~3,300 msgs/day free ceiling; R2 within 10 GB. $0 |
| **Studio $99** | + Browser Rendering (hard-capped: ~20 renders/day account-wide at free tier), Durable Objects rate limiting, Cron-driven batch | **Browser Rendering is the cost.** 10 min/day free = the whole account's budget. If Studio sells, the first paid upgrade is Workers Paid ($5/mo, 10 h browser time included) — not a per-user charge |
| **Bundle** | Studio + top-ups | — |

**First paid upgrade, in order:** 1) Workers Paid $5/mo (10 M req/mo,
30 M CPU ms, 10 h Browser Rendering) — buy this the week Browser
Rendering or Workers requests approach their free caps. 2) R2 overage
$0.015/GB-mo — only when evidence packs pass 10 GB. 3) Queues overage
$0.40/M — only on viral batch days. Set billing alerts at 80% of each
free allowance; never let a cap fail silently — the UI must say
"daily limit reached, try tomorrow" instead of erroring.

## 4. Must-work test plan (Cloudflare side)

| Check | Test | Pass |
|---|---|---|
| Pages deploy | `npx wrangler pages deploy web/ --project-name deletedproof` (or GitHub push → auto-deploy) | Site live on `deletedproof.pages.dev` + test subdomain on northforgelabs.dev; `_headers` served (`curl -I` shows CSP + nosniff) |
| Worker CDX proxy | `GET /api/cdx?url=twitter.com/jack/status/*` | 200 JSON, same rows as direct CDX; `Access-Control-Allow-Origin` present; second identical call served from KV cache (faster, no upstream call) |
| Licence check | Valid key → tier; bogus key → 401; key just bought → works within 60 s (KV propagation) or D1 fallback answers | No false "invalid" after purchase |
| Queue batch | Submit 25-handle batch | All 25 complete; R2 pack exists; "ready" state visible; a second batch while the first runs queues, doesn't drop |
| Browser Rendering | Render one JS-heavy X post page | Screenshot/text returned in <30 s; daily counter decremented; 21st render in a day → honest "daily render budget used" |
| Turnstile | Submit search form without solving | Rejected server-side; with valid token, accepted |
| Cron | Daily purge job | Free-tier R2 packs older than 30 days deleted; paid packs kept |
| Over-quota behaviour | Force Workers 100k/day (or simulate with a low test cap) | UI shows "daily limit reached, try tomorrow" — never a raw Error 1027 to the user |
