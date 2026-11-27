# Analytics — what we track, and the weekly report

**Rule:** we track the product, never the person. Page views only.
We never log searched handles, search results, licence keys, or
anything that identifies what a visitor looked for. That is both an
ethics line (public archived posts only — no monitoring) and a
selling point: the dashboard says so in plain language.

## Stack (all free at launch)

| Tool | What it measures | Free tier | Where it is wired |
|---|---|---|---|
| **Cloudflare Web Analytics** | Page views, visitors, referrers, countries — cookieless, no JS fingerprinting | Free, unlimited sites, 6-month retention | `web/config.js` → `ANALYTICS` (off by default; set `enabled: true` + `token` from the Cloudflare dashboard, Web Analytics > Add a site). The token is added to the page as a `<script>` tag by the deploy — it is not in this repo |
| **Paddle** (sales) | Purchases, refunds, revenue by pack, country | 5% + 50¢ per sale (no monthly fee) | Paddle dashboard — the only place money is counted |
| **Google Search Console** | Queries, clicks, impressions, position, index coverage | Free | Add the property, verify by DNS (Cloudflare) or HTML file |
| **Bing Webmaster Tools** | Same, for Bing/DuckDuckGo | Free | Same as above |
| **Local usage counters** | Searches this month, evidence reports used — per device, localStorage only | Free, $0 | `web/index.html` / `web/dashboard.html` — never uploaded |

PostHog (free 1M events/mo) is the *later* option, only when funnels
matter — keep users anonymous, never enable session replay on the
search console. Plausible has no free hosted tier ($9/mo); Umami
needs a host Pages cannot provide.

## What we deliberately do NOT track

- Searched handles, usernames, or post URLs — not in analytics, not
  in server logs, not in the licence database.
- Search results or export contents.
- Licence keys (verified locally in the browser / server-side on
  purchase; the key itself is never logged).
- IP addresses beyond Cloudflare's own edge logs (which we do not
  export).

## Weekly report (30 minutes, every Monday)

1. Cloudflare Web Analytics: visitors, top pages, top referrers,
   top countries. Any page with 0 views for 2 weeks gets fixed or
   cut.
2. Search Console: top 10 queries by clicks + any query where we
   rank 4–10 (one content push moves those to page 1). New queries
   go into `docs/seo-plan.md` as content ideas.
3. Paddle: sales by pack, conversion = sales / pricing-page views.
   Launch pricing ends at 90 days or 500 buyers — watch the count.
4. Dashboard usage (self-reported): searches this month per device
   is local-only, so this is qualitative — support emails + GitHub
   issues instead.
5. Source health: run `wayback-social sources` and note any source
   that flipped to down (archives die quietly — Memento did).

## SEO monitoring (free)

- `scripts/seo_check.py <url>` — 12 checks (title, description, OG,
  canonical, robots.txt, sitemap.xml, JSON-LD). Run after every
  deploy; it must stay 12/12.
- Search Console + Bing Webmaster: index coverage errors, Core Web
  Vitals (Pages is static, so this should stay green).
- Uptime: Cloudflare Pages has no built-in uptime alert on the free
  plan — check the deploy status in the Pages dashboard after each
  push, and use the free tier of UptimeRobot (50 monitors) if a
  public status page is ever needed.
