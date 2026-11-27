# Changelog — wayback-social

## Unreleased — Free email for licence delivery: Resend (2026-11-26)

Resend chosen as the free email provider for licence-key delivery
(issue #4) after a live free-tier comparison: Resend Free is
3,000 emails/mo, 100/day, no card, free-forever, one HTTP POST —
Mailgun's no-card free tier can only email 5 verified addresses,
SendGrid's free plan expired after 60 days, SES needs an AWS
account + manual production access. Full comparison + sources in
`docs/email-setup.md`. Wiring in `functions/api/paddle-webhook.js`:
the licence email now carries the key, tier, a caps line per tier
(from `pricing.yaml` / `plans.py`), a "Verify my key" link and the
lost-key reply line; **email never blocks the purchase** — a missing
`RESEND_API_KEY` or a Resend 4xx/5xx returns 200 with
`email_sent: false` + `email_error`, logged, licence row active
(previously 500); the sender defaults to the sandbox
`onboarding@resend.dev` (owner's inbox only, labelled in code) and
production must set `RESEND_FROM` to a verified domain. Also
corrected a wrong claim in `docs/paddle-webhook.md`: a Paddle retry
after a failed email does NOT re-send the key (only its hash is
stored) — failed deliveries need a manual re-issue, procedure in
`docs/email-setup.md` §5. Node webhook suite 10/10 (3 new email
tests), pytest 141/1. No account exists yet — human steps in
`docs/email-setup.md` §4.

## Unreleased — Clerk auth + Turnstile (2026-11-26)

Clerk sign-in/sign-up (issue #6, moved up by John) + Cloudflare
Turnstile bot check on the search form. Auth is optional: free
search works signed out; paid features work with a licence key OR
a signed-in linked account. No Clerk account exists yet — keys are
placeholders in `web/config.js` until the human steps in
`docs/clerk-auth.md` §6 are done. Full unit suite **117 passed,
1 skipped**; node auth + turnstile tests pass; SEO 12/12; 5 new
Playwright auth tests pass locally. New: `web/auth.js`,
`web/auth-ui.js`, `web/turnstile.js`, `functions/api/link-licence.js`
(D1 `users` table, DP1 HMAC verify now, DP2 answers 501 until the
Paddle webhook agent lands its verifier), Turnstile verification in
`functions/api/cdx.js` (open when unconfigured; token params never
forwarded to archive.org), "My account" card in
`web/dashboard.html`, `docs/clerk-auth.md` (architecture, exact
dashboard steps, D1 schema + merge point with the Paddle webhook
agent's `licences` table, Better Auth escape hatch). DP2 link
verification is wired to the webhook agent's shared
`functions/_lib/dp2.js` verifier (real Ed25519 test in the suite),
and the `users` table ships as `migrations/0002_users.sql` against
the already-existing D1 `wayback-social-licences`. Also fixed two
pricing drift failures found during wiring: the launch note now
reads "Launch pricing — early-bird offer …" (clear wording + the
sync test's required phrase, fixed in `pricing.yaml` and re-synced)
and a Turnstile comment no longer uses the banned word "unlimited"
in `web/config.js`. Also fixed five stale e2e test expectations
found while verifying (test-only, product behaviour proven
correct by a live debug run): the licence-verify wait strings
("Licence active" → "Demo key active" after the lockdown copy
change) in `tests/e2e/test_licence.py` +
`tests/e2e/test_dashboard.py`, and the sitemap domain
(`wayback-social.pages.dev` → `deletedproof.pages.dev`) in
`tests/e2e/test_pricing.py`. Still failing for environmental
reasons, not code: broad search (archive.org unreachable from
this VM — direct CDX curl times out at 60s) and SSR branding ×4
(the SSR middleware is the wiring agent's area; live deploy is
stale). See TEST-REPORT.md for the full analysis.

Paddle webhook → licence minting → D1 → Resend (issue #4, same day):
`functions/api/paddle-webhook.js` (Paddle-Signature HMAC verify,
price_id → tier, DP2 Ed25519 mint, D1 insert, Resend email, refund
revoke, idempotent on event_id + transaction_id),
`functions/api/licence-check.js` (server verify + D1 revocation),
`functions/_lib/dp2.js`, `wayback_social/ed25519.py` (pure-Python
Ed25519, RFC 8032 vectors pass), `wayback_social/licence2.py`, DP2
verify in `web/licence.js` (WebCrypto Ed25519). D1 database
`wayback-social-licences` created + `migrations/0001_licences.sql`
applied (verified live). The DP2 verifier has now landed, so
`link-licence.js` verifies DP2 keys for real (the earlier "answers
501" note is obsolete). Node webhook suite **7/7 pass**; full unit
suite **134 passed, 1 skipped**. Not yet live: no Paddle account, no
Resend key, private key not yet a Pages secret — exact human steps
in `docs/paddle-webhook.md` §5.

## v1.5.0 — 2026-11-26

Live crawling, the remaining free archives, web tier enforcement,
dashboard + analytics, and the CDX proxy that makes the live web
search actually work on the deployed site. Full unit suite **109
passed, 1 skipped** (`pytest tests/`); Playwright e2e **31/31
passed in 45.61s** (`E2E_BASE_URL=http://127.0.0.1:8901
.venv-e2e/bin/python -m pytest tests/e2e`); live CDX +
live Bluesky/Mastodon/oEmbed smoke verified. Browser binaries for
e2e did NOT come from `playwright install chromium` — that failed
twice in this VM (download failure through the egress proxy); the
headless shell was downloaded directly with curl from
chrome-for-testing and unpacked into Playwright's cache
(`~/.cache/ms-playwright/chromium_headless_shell-1255/`), and the
full chromium-1255 binary was also present. First e2e run was
27 passed / 4 failed — all four were stale test expectations
(old "wayback-social" title, old auto-demo-row failure UX), not
product bugs; fixed in the tests, re-run green.

- **Live crawling (`wayback-social live`, `live_crawl.py` + `rss.py`).**
  Bluesky AT Protocol + Mastodon public API/RSS (no key, live
  profile + latest posts), YouTube oEmbed + channel RSS, X/TikTok
  oEmbed existence checks, everything else honestly labelled
  login-walled (Reddit re-verified dead: old.reddit.com JSON
  302/connection-failed). `live NETWORK HANDLE [--export FILE]`
  cross-checks an archive export against the live site — with one
  fix found by live testing: bare listing rows with no post id are
  skipped, because oEmbed 404s on them and would fake "deleted"
  verdicts (4 such rows in the jack export, now correctly skipped).
  Live-verified: Bluesky bsky.app (did:plc:z72i7hdynmk6r22z27h6tvur,
  928 posts), Mastodon @Mastodon (id 13179, 568 posts), X oEmbed
  jack/status/20 ("just setting up my twttr").
- **Remaining free archives (`archives.py` + `cc_jobs.py`).**
  Uniform `search_archive(source, query)`: Wayback CDX (baseline),
  Arquivo.pt full-text + CDX (delegates to v1.4 arquivo.py),
  Ghostarchive search-page parse (experimental — verified
  /archive/<id> links present), MemGator via MEMGATOR_URL (public
  Memento aggregator re-verified dead), Common Crawl as async jobs
  only (`wayback-social cc URL` queues, `--check` fetches; index
  404s on single posts — job reports "empty", honestly).
  `wayback-social sources` probes every archive + live source and
  reports working/down/not-configured/async-only. Arquivo.pt
  textsearch is flaky ("Response ended prematurely" on a live
  keyword run) — the CLI falls back to the Wayback result instead
  of inventing one.
- **Web tiers that actually work (`web/licence.js`, `web/index.html`,
  `web/dashboard.html`, `web/config.js`).** Licence-key input stored
  in localStorage, never sent anywhere; tier badge; per-tier caps
  enforced in the browser search (Free 25 captures/search, 3
  networks in broad search, CSV only; JSON gated to Starter+).
  Offline HMAC-SHA256 verification in JS (Web Crypto) mirroring
  `licence.py` — Python-minted keys verify in JS and JS-minted keys
  verify in Python (tested both ways). Demo secret only; the page
  says so — production keys verify server-side. JS caps are asserted
  equal to `plans.py` for every tier. Dashboard: usage this month,
  evidence reports used vs plan (hand-logged until the licence
  server exists), search history (localStorage, clear button, re-run
  links), licence box, analytics policy. Cloudflare Web Analytics
  token placeholder in config.js, off by default.
- **CDX proxy (`functions/api/cdx.js`) — fixes a live-site bug.**
  The deployed page's live search failed on archive.org CORS
  (verified 2026-11-26 on deletedproof.northforgelabs.dev) and fell
  back to demo data. The Pages Function proxies CDX same-origin
  (allowlisted params, CORS headers, 5-min edge cache); the page
  uses it on any non-localhost host and talks to CDX directly on
  localhost. Proxy logic tested with a stubbed fetch; the target
  URL it builds verified live via curl. End-to-end on Cloudflare
  still needs the next deploy to confirm.
- **Analytics (`docs/analytics.md`).** Cloudflare Web Analytics
  (free, cookieless) + Paddle sales + Search Console; never track
  searched handles, results, or keys; weekly report format; SEO
  monitoring via `scripts/seo_check.py` (12/12).
- **Tests.** New: `test_live_crawl.py` (14), `test_archives.py`
  (11), `test_web_tiers.py` (11, incl. Node licence round-trip and
  a local-server render check). `tests/e2e/conftest.py` now skips
  gracefully when Playwright is not installed, so `pytest tests/`
  no longer breaks on collection in the default venv.
- **File-size rule:** `live_crawl.py` (337) and `archives.py` (331)
  were split — RSS moved to `rss.py`, Common Crawl jobs to
  `cc_jobs.py`; every module is now under 300 lines.

## v1.4.0 — 2026-11-26

Built by a sibling agent in parallel (live.py, arquivo.py,
evidence.py, cmdutil.py, extra_commands.py): Bluesky/Mastodon live
checks with feed-completeness verdicts, Arquivo.pt keyword + CDX,
evidence-pack ZIP (report.html + captures + SHA-256 manifest,
Studio-only), shared plan/licence CLI options, format gating in
export.py, Playwright e2e suite in tests/e2e. Tests 73 passed
with v1.4 included. **Live E2E (TEST-REPORT.md, 2026-11-26):**
all four export formats verified on live `archive x jack`
(6 rows each); diff exports kept 1 / removed 1 + added 1;
evidence pack verified with `sha256sum -c manifest.sha256`
(6/6 OK). Two bugs found by live testing and fixed: (1)
`diff --url` passed the full URL to the Mastodon lookup, faking
a "deleted" verdict for a live post — fixed by
`live.handle_from_url` (regression test added); (2) README.txt
told users to run `sha256sum -c manifest.json`, but manifest.json
is JSON — the pack now ships `manifest.sha256` in plain checksum
format. Full suite now 108 passed, 1 skipped.

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
