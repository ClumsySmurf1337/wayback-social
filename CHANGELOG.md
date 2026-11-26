# Changelog — wayback-social

## v1.3.0 — 2026-11-26

Pricing v1.3 (John's corrections) + licence keys. Tests 51/51, live
CDX smoke verified — see README "Verified live".

- **Studio is a finite pack.** Studio = 10 evidence-pack reports
  included, batch 200, 25,000 captures/search, 10,000 text fetches,
  5 seats. Every no-cap claim about a tier is removed from plans.py,
  config.js, index.html and README (a test enforces it). Nothing in
  any tier is uncapped.
- **Launch vs regular pricing.** Launch (first 90 days or 500
  buyers): Starter $9 / Pro $19 / Studio $49 / Bundle $59. Regular:
  $19 / $29 / $99 / Bundle $147. Top-up $15 per 500 text-fetch
  credits. **Bundle math corrected:** regular total is $147
  ($19+$29+$99), so the $59 launch bundle is 60% off — v1.2 said
  $137 / 57%, which was wrong arithmetic, now fixed everywhere.
- **Feature chart.** A real comparison table (13 rows × 5 tiers) on
  the web page (rendered from `FEATURE_CHART` in config.js) and in
  README — every cell comes from the same caps in pricing.yaml.
- **Single source of truth.** New `pricing.yaml` + `scripts/sync_pricing.py`
  (stdlib only, own mini YAML parser) regenerates
  `wayback_social/plans.py` caps/features/labels and `web/config.js`
  PRICING + FEATURE_CHART + fee math. `sync_pricing.py --check`
  fails loudly on drift; `tests/test_pricing_sync.py` asserts yaml,
  plans.py and config.js agree (incl. a Decimal fee-math fix: the
  $15 top-up Stripe net is $14.27, not $14.26).
- **Licence keys (v1, offline-verifiable).** New
  `wayback_social/licence.py`: keys look like
  `DP1-PRO-<16 base32>-<8 hex HMAC>`; `wayback-social licence make
  --tier pro --email a@b.c` (dev-only, needs
  `WAYBACK_SOCIAL_LICENCE_SECRET`) and `licence check KEY`;
  `archive` / `find` / `batch` / `diff` accept `--licence KEY` to
  unlock that tier's caps (overrides `--plan`). A Bundle purchase
  mints a Studio key. Production minting stays Ed25519 via the
  Paddle webhook (see docs/storage-auth-plan.md addendum) — the HMAC
  scheme is the dev/offline equivalent, and the secret must never
  ship to buyers. 11 new tests in tests/test_licence.py.
- **Known gap, unchanged:** export-format gating (Free = CSV only)
  and feature gating (deleted-diff needs Starter+) are policy in
  the chart, not yet enforced in the CLI — they close with licence
  enforcement (see docs/pricing-features.md §5). The evidence-pack
  ZIP exporter itself is still unbuilt (the 10-report cap is the
  entitlement; `diff --only deleted` is the current evidence export).

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
  (Correction in v1.3: the regular total is $147 ($19+$29+$99), so
  the bundle is 60% off. The $137 figure above is what v1.2 shipped
  with — wrong arithmetic, kept here as history.)
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
