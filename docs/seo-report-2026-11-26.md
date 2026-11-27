# SEO / analytics report — 2026-11-26 (first weekly report)

**Routine:** `docs/seo-monitor.md` (15-minute weekly routine, all free).
**Checks re-run:** 2026-11-27 00:58 UTC (2026-11-26 19:58 EST) — live + local.
**Standing rule (John, 2026-11-26):** free sources and free tiers only
until there are paying customers. No paid rank tracker, no paid
analytics — Search Console + Cloudflare Web Analytics answer every
question that matters at this stage (see `docs/seo-monitor.md`:
"Never pay for rank tracking before the site earns $500").

## 1. seo_check.py — live + local

Command (curl-backed runner, because Python `urllib` cannot get through
this VM's egress proxy):

```bash
python3 /tmp/seo_live.py https://deletedproof.pages.dev \
  https://deletedproof.northforgelabs.dev \
  https://app.deletedproof.northforgelabs.dev \
  https://verify.deletedproof.northforgelabs.dev \
  https://osint.deletedproof.northforgelabs.dev \
  https://legal.deletedproof.northforgelabs.dev \
  http://127.0.0.1:8931/
```

| Host | Result |
|---|---|
| deletedproof.pages.dev | **12/12** |
| deletedproof.northforgelabs.dev | **12/12** |
| app.deletedproof.northforgelabs.dev | **12/12** |
| verify.deletedproof.northforgelabs.dev | **12/12** |
| osint.deletedproof.northforgelabs.dev | **12/12** |
| legal.deletedproof.northforgelabs.dev | **12/12** |
| Local dev server (current tree, port 8931) | **12/12** |

Checks covered: title length, meta description length, Open Graph tags,
Twitter card, canonical link, JSON-LD parses + ≥4 offers, robots.txt
reachable, sitemap.xml reachable + valid. Zero FAILs anywhere.

**Honesty note:** the live hosts still serve the **old v1.3 deploy** —
the 12/12 above is the v1.3 build passing, not the new tree. The local
12/12 is the current tree (trust.html, SSR per-subdomain branding,
analytics wiring, no CLI text). **After the batch push, re-run this
check against all 6 live hosts** — the push discipline requires it
before any issue is closed as live-verified.

## 2. Sitemap

- `web/sitemap.xml` `lastmod` = **2026-11-26** on every URL — matches
  the last edit date. ✅
- `web/trust.html` is in the sitemap (added with issue #9). ✅
- Sitemap + robots.txt point at `deletedproof.pages.dev` (fixed from
  the nonexistent `wayback-social.pages.dev` in the UX pass). The
  canonical tags point at `archivecheck.com` — **unresolved**: the
  domain is not bought yet and the umbrella name is not formally
  locked. Do NOT push without the canonical decision (see
  `docs/issues.md` #1/#2); the sitemap/canonical split is flagged
  there, not fixed here.

## 3. Cloudflare Web Analytics — NOT enabled yet (human step)

- **Wiring is built:** `web/analytics.js` injects the Cloudflare beacon
  only when enabled + a token is present (never double-injects, never
  breaks the page); `web/analytics.test.js` **10/10**; loaded on
  `index.html`, `dashboard.html`, and `trust.html` after `config.js`.
- **Status:** `web/config.js` `ANALYTICS` = `{provider:
  "cloudflare-web-analytics", token: "", enabled: false}`. No beacon
  fires on any live page today — **we have zero traffic data**.
- **API attempt (2026-11-26):** `GET /accounts/…/rum/site_info`
  returned **HTTP 405 "Method not allowed for this authentication
  scheme"** — the API route is not usable with this account's auth.
  No purchase is involved (Web Analytics is free, unlimited sites).
- **Human step:** Cloudflare dashboard → Web Analytics → Add a site →
  paste the token into `web/config.js` `ANALYTICS` (`enabled: true`).
  Then verify the beacon loads on a live page and the first page view
  appears in the dashboard.

## 4. Search Console + Bing — NOT connected (human steps)

- **Google Search Console:** not set up. No queries, impressions, or
  clicks to report; no coverage data; no rank tracking yet (Search
  Console *is* the rank tracker — see `docs/seo-monitor.md`).
  Human step: verify ownership of `deletedproof.pages.dev` (and the
  northforgelabs.dev subdomains once the canonical decision lands),
  submit `sitemap.xml`, check Coverage.
- **Bing Webmaster Tools:** not set up (Bing feeds DuckDuckGo).
  Human step: same — verify + submit sitemap.
- **Manual rank check:** not run this week — the live site is the stale
  v1.3 build and the canonical question is open; a manual position
  check now would measure the wrong build. Run it after the push.

## 5. Paddle sales — none yet

No sales to report: checkout links are still `REPLACE_*` placeholders
in `web/config.js` (issue #3 — Paddle account + real links + sandbox
purchase test are human steps). Stripe test-mode Pro Pack link exists
and verified HTTP 200, but it is test-only and has taken no money.

## 6. Content / launch (issue #10 — open)

- First 10 content pieces from `docs/seo-plan.md`: **not published**.
- Product Hunt + Show HN launch: **not done** (same week as the
  content, after the push).
- Nothing in this report changes the launch order: push → live
  verification → Search Console/Bing submission → content → launch.

## Next report

**Due 2026-12-03** (weekly). Must include: seo_check re-run on all 6
live hosts after the batch push, Web Analytics status (enabled or
still a human step), Search Console/Bing submission status, first
queries/impressions if Search Console is connected.
