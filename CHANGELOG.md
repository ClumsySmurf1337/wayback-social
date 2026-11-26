# Changelog — wayback-social

## v1.2.0 — 2026-11-26

Top-8 competition improvements, implemented + tested (30 tests pass,
live CDX smoke verified — see README "Verified live").

- **Deleted-only diff, two ways.** `diff OLD.json NEW.json` compares
  two exports (removed/added/kept, with first/last archived dates;
  listing rows with no post ID are skipped). `archive --live-check`
  adds `live_verdict` / `live_http_status` / `live_final_url` /
  `live_checked_at` per row (`live` / `deleted` / `unknown` /
  `not-a-post`; unknown is never counted as deleted).
- **Replay text fetch.** `fetch_replay_text()` pulls visible text
  from the `id_` replay (stdlib HTML parser, toolbar stripped) as the
  third fallback after oEmbed and snapshot meta. Live-verified on
  jack/status/20: "just setting up my twttr".
- **Archive fallback links.** Every record now carries
  `fallback_archive_today_url` and `fallback_ghostarchive_url`.
- **Capped free tier.** `--plan free|starter|pro|studio` (default
  free) enforces caps in archive/find/batch/diff: free 25 captures,
  3 networks, 3 targets, text for 5 posts; starter 250/7/10/100;
  pro 2,500/14/50/1,000; studio 25,000/14/200/10,000. Caps are
  printed on every run.
- **New pricing.** Free $0 / Starter $9 / Pro $19 launch (reg. $29) /
  Studio $49 launch (reg. $99) / All-in Bundle $59 one-time.
  Bundle math: regular total $137 (9+29+99), bundle is 57% off.
  Paddle default, Stripe/Gumroad/email alternatives, `?checkout=` /
  `?ab=` switching kept. Fee math in `web/config.js`.
- **SEO.** Title/description/OG/Twitter card/canonical/JSON-LD
  (5 offers) in `web/index.html`; `web/robots.txt`,
  `web/sitemap.xml`; `scripts/seo_check.py` (12 checks, 12/12 pass
  locally); `docs/seo-plan.md`, `docs/seo-monitor.md`.
- **Cloudflare hosting.** `wrangler.toml` (Pages, output `web/`),
  `web/_headers`, `web/_redirects` (subdomain-ready), and
  `docs/cloudflare-deploy.md` (exact steps; account connection is a
  human step, not done here).

## v1.1.0 — 2026-11-26

- Deleted-only live diff (`diff NETWORK HANDLE`, `--only deleted`),
  broad search (`find HANDLE` across 14 networks), market presets
  (catfish, relationship, brand, hiring, legal, journalist,
  researcher), batch mode, web app with swappable checkout
  (Paddle default; Lemon Squeezy removed — closed 16 Nov 2026).

## v1.0.0 — 2026-11-26

- Initial release: 14-network CDX archiver CLI (`archive`, `batch`,
  `networks`), CSV/JSON/JSONL/HTML exports (stdlib, no pandas),
  oEmbed + snapshot text recovery, GPL-3.0-or-later. Generalisation
  of claromes/waybacktweets.
