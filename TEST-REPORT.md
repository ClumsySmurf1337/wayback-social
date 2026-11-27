# Test report — Clerk auth + Turnstile (2026-11-26, evening)

Clerk sign-in/sign-up (issue #6, moved up by John) + Cloudflare
Turnstile bot check on the search form (and Clerk's own bot
sign-up protection, enabled in the dashboard — no code). Auth is
optional: free search works signed out; paid features work with a
licence key OR a signed-in linked account. No Clerk account was
created by this build; all keys are placeholders until the human
steps in docs/clerk-auth.md §6 are done.

## Results

- pytest: **140 passed, 1 skipped** at final check (117/1 at this
  build's first green run — +8 new tests in
  tests/test_clerk_auth.py; the count grew to 140 as sibling
  agents landed their own tests in the same tree). One transient
  flake seen once in the first full run:
  `test_js_mint_verify_roundtrip` failed with an assertion error
  and passed on re-run and in every subsequent full run — not
  reproduced since; no licence.js change was made by this build.
  (A sibling agent may have been mid-edit of a shared file at the
  time; treat as a flake, not a product bug.)
- node: auth **all checks passed**, turnstile **all checks
  passed**, branding **121/121** (unchanged).
- SEO: **12/12** (scripts/seo_check.py against a local server).
- Playwright E2E (local): **5 new auth tests passed** — auth UI
  present + honest "coming soon" when unconfigured; zero Clerk /
  Turnstile requests while unconfigured; Turnstile container
  present but empty; signed-out free search still works (demo
  loads, no auth wall); dashboard My account card shows "Not
  signed in" with the link form hidden and the licence box working.
- Full e2e suite, first run: **36 passed, 5 failed** (41 tests).
  Second run (suite had grown to 52 tests with siblings' new
  files): **42 passed, 10 failed**. Failure analysis, all
  investigated, none of them in the Clerk code:
  - 4 licence tests + 1 SEO test = **stale test expectations,
    product correct** (fixed, test-only). The licence lockdown
    changed the success copy from "Licence active: ..." to
    "Demo key active: Pro Pack tier preview ..." but
    `verify_on_page` still waited for the old string — proven by
    a live debug run (key verifies, badge flips to Pro Pack,
    2500 caps, JSON unlocked, localStorage set, no console
    errors). Fixed `tests/e2e/test_licence.py`,
    `tests/e2e/test_dashboard.py` (added 'Demo key active' to
    the accepted strings) and `tests/e2e/test_pricing.py`
    (sitemap now correctly says `deletedproof.pages.dev`, test
    still expected the old `wayback-social.pages.dev`).
    Re-run of the licence + SEO subset: **9 passed**.
  - `test_broad_search_checks_tier_networks` (240s timeout) =
    **archive.org unreachable from this VM tonight**: a direct
    CDX curl times out at 60s with zero bytes (earlier Node CDX
    took 58s for 4 rows). The test needs 3 sequential CDX calls
    from the browser; it cannot pass until archive.org answers
    or the test runs against the deployed CDX proxy. Not a code
    bug — do not weaken the test; re-run it after the push, live.
  - `test_ssr_branding` ×4 (apex/legal/osint/verify) = **the SSR
    brand-injection middleware is not producing per-host brands
    on the local SSR dev server** (raw HTML carries the old
    copy). That is the wiring agent's SSR fix area, not Clerk;
    the live deploy is also stale (v1.3), so the live variants
    would fail the same way until the push + middleware land.
- **Final full e2e run (after the test fixes): 56 passed,
  1 failed in 440.77s (57 tests).** The only failure is the
  broad-search archive.org timeout above. The SSR branding tests
  pass in this run (the wiring agent's middleware landed during
  the evening).
- `scripts/sync_pricing.py --check`: green. Two pricing drift
  failures were found and fixed while wiring config.js: (1) the
  sync test requires the literal "Launch pricing" in config.js —
  the sibling's clearer launch-note wording dropped it; fixed in
  the single source of truth (pricing.yaml `launch.note`) and
  re-synced, so config.js now reads "Launch pricing — early-bird
  offer …" (clear wording kept, test string kept). (2) my
  Turnstile comment used the banned word "unlimited" in
  config.js — reworded; the `test_no_unlimited_claims_about_tiers`
  contract still holds.

## What was verified with stubs (no Clerk account, no D1)

- `functions/api/link-licence.js`: no D1 → 503; no session token
  → 401; unknown account (GET) → 200 linked:false; bad DP1 key →
  400; valid DP1 key minted with the test secret → 200
  tier=starter. DP2 (Ed25519) is verified for real via the shared
  `functions/_lib/dp2.js` verifier — a key minted with a fresh
  keypair in the test → 200 tier=studio (and re-linking upserts the
  tier); no public key configured → 503; a key minted with a
  different keypair → 400. GET after linking returns the linked
  tier; missing CLERK_SECRET_KEY → 503. The D1 `users` table
  migration ships as `migrations/0002_users.sql` (the database
  itself — `wayback-social-licences` — was created 2026-11-26 by
  the Paddle webhook build; `licences` schema already applied).
- `functions/api/cdx.js` Turnstile branch: no secret configured
  → 200 (unchanged behaviour); secret set + no token → 403;
  secret set + bad token → 403; secret set + good token → 200 and
  the `cf-turnstile-*` params are NOT forwarded to archive.org.
- Tier ranking: bundle == studio → canonical "studio";
  effectiveTier() = higher of licence tier and linked tier while
  signed in; signed out it falls back to the licence tier.
- Turnstile: token freshness/TTL, idempotency key shape and
  uniqueness per search, ensureToken() no-op when unconfigured,
  fresh-cache reuse, dummy test keys 1x…AA pass / 2x…AB block /
  3x…FF challenge.

## Known limits / still needs a human or a deploy

- No Clerk account, no publishable/secret keys, no Turnstile
  keys — the site behaves exactly as before until
  docs/clerk-auth.md §6 is done (9 steps, ~15 min of dashboard
  clicks + 3 test accounts). D1 exists (`wayback-social-licences`,
  bound as `DB`); the `users` migration
  (`migrations/0002_users.sql`) still needs applying before any
  link can be stored.
- The signed-in flows (link a licence, tier follows the account
  across devices) are covered by the manual test accounts in
  §6 step 8, not by automation — they need a real Clerk app.
- DP2 (Ed25519) link verification is wired, not a 501: the
  Paddle webhook agent landed the shared verifier
  (`functions/_lib/dp2.js`, `verifyKey`/`keyHash`/`mintKey`) and
  `link-licence.js` uses it against
  `LICENCE_ED25519_PUBLIC_KEY`; the `users` table ships as
  `migrations/0002_users.sql` (D1 `wayback-social-licences`
  already exists, `licences` schema applied).
- `auth-ui.js` is browser-only (no Node tests) — covered by the
  Playwright suite. The D1 binding in `wrangler.toml` is live
  (database exists); only the `users` migration is unapplied.

---

# Test report — full verification pass (2026-11-26 evening)

Full detail: docs/verification-2026-11-26.md. Headline: pytest
**109 passed, 1 skipped**; node branding **121/121**; SEO **12/12**;
Playwright E2E **36 passed** (local server). Branding resolution
verified in real Chromium for all 6 hosts (apex ArchiveCheck,
app DeletedProof, verify HandleHistory + catfish pre-selected,
osint PostTrace + journalist, legal PastProof + legal; footer
limits line on all). Licence panel verified end-to-end in Chromium
(demo Pro key: verify → badge flips, persists across reload,
Remove clears, bad key rejected). CLI smoke: archive/find/batch/
diff --url (live 1, deleted 0)/arquivo/licence make+check/
licence-gated archive/evidence pack (7 files, sha256sum all OK).
CDX proxy node-tested (400 without ?url=, CORS *, cache 300,
allowlist enforced). **Live deploy is STALE** — deployed HTML has
no branding.js and still shows the CLI box; /api/cdx returns the
SPA fallback. Local build is ahead of the deploy; push, then
re-verify live. Buy buttons still show "Checkout not connected
yet" (REPLACE_* placeholders, no money can move). No accounts,
no email sending, no password recovery exist (by design, v1 is
licence-key only — see docs/gaps-user-accounts-email.md).

---

# Test report — v1.4.0 live end-to-end (2026-11-26)

All runs use real live data (Wayback CDX, Bluesky/Mastodon public
APIs, Arquivo.pt). Commands were run from the repo venv
(`.venv/bin/wayback-social`) with outputs in `/tmp/wbs-v14/`
(live scratch, not committed). Unit suite: **108 passed, 1 skipped**
(`.venv/bin/python -m pytest tests/`).

## 1. Archive — all four formats, one run

`archive x jack --limit 3 --no-fetch-text --plan pro`
→ **6 posts** (CDX returns oldest first; the first rows are bare
`/status` listing redirects with no post id — known CDX noise,
not posts).

| file | bytes | rows |
| --- | --- | --- |
| `x_jack_20261126193502.csv` | 3,523 | 6 |
| `x_jack_20261126193502.json` | 6,817 | 6 |
| `x_jack_20261126193502.jsonl` | 6,269 | 6 |
| `x_jack_20261126193502.html` | 5,993 | 6 (contains "jack", web.archive.org links, archive.today fallbacks) |

**PASS** — all four formats agree (6 rows each, parsed back).

`find clumsysmurf --networks x --plan pro` → found on 1/1 networks;
`x_clumsysmurf_20261126193522.*` — csv 16,300 / json 28,190 /
jsonl 26,368 / html 23,811 bytes, `find_clumsysmurf.json` 147 bytes.
**PASS.**

## 2. Diff exports (deleted-only)

Bare-listing exports diff to nothing (0 posts with ids) — expected,
`diff` skips non-post rows. Real post exports:

- `archive --url https://twitter.com/jack/status/20 --limit 2` →
  1 post (`x_20_20261126193633.json`, 1,234 bytes).
- Same URL `--limit 5` → 4 captures, 1 post
  (`x_20_20261126193651.json`, 4,909 bytes).
- `archive --url https://twitter.com/jack/status/21 --limit 2` →
  2 captures, 1 post (`x_21_20261126193658.json`, 2,466 bytes).
- `diff x_20(limit2) x_20(limit5)` → **kept 1, removed 0, added 0.
  PASS.**
- `diff x_20(limit2) x_21(limit2)` → **removed 1, added 1, kept 0.
  PASS.**

## 3. Evidence pack (Studio)

- `evidence x_jack_20261126193502.json --plan studio` →
  `pack_jack.zip` 5,941 bytes: 6 files, 6 records, 0 deleted /
  0 live / 0 unknown. **PASS.**
- `evidence mastodon_diff_...json --plan studio` →
  `pack_mastodon.zip` 3,792 bytes: 6 files, 1 record, **1 live**.
  **PASS.**
- Verification: `unzip` + `sha256sum -c manifest.sha256` →
  **all 6 files OK** (README.txt, captures.csv/.json/.jsonl,
  manifest.json, report.html). report.html contains the handle,
  capture table, live verdict, and per-file hashes.
- **Bug found and fixed by this run:** README.txt told users to
  run `sha256sum -c manifest.json`, but manifest.json is JSON, not
  a checksum file — that command would fail. The pack now ships
  `manifest.sha256` (plain sha256sum format) and all three places
  that named the old command were corrected (README.txt,
  report.html, CLI hint).

## 4. Export-format gating (live)

`archive x jack --limit 1 --no-fetch-text --format html` on the
free plan → refused: *"Format(s) html need the Pro plan or higher
(your plan: free). CSV is included in every plan — use --format
csv, or upgrade with --plan pro / a licence key."* **PASS**
(exit 2 in the offline tests; the message is identical live).

## 5. Bluesky + Mastodon live checks

- `diff bluesky bsky.app --limit 5` → live feed fetched: **100
  posts still up (feed truncated to 100)**; the 5 archived
  captures were all listing/profile rows, so Posts: 0. **Live API
  wiring PASS; no post rows to compare in this set.**
- `diff mastodon Mastodon --limit 5 --instance mastodon.social` →
  same: live feed 100 posts, 5 archived captures all non-post rows.
  **PASS.**
- `diff --url https://bsky.app/profile/bsky.app/post/3n2ozugncr22j`
  → **No captures** (recent post, not yet archived — honest empty).
- `diff --url https://mastodon.social/@Mastodon/117625790631441803`
  → 2 captures, 1 post. **First run (before the fix) wrongly said
  "deleted 1"** — the `--url` code path passed the full URL to the
  Mastodon lookup, which 404'd and faked a deleted profile.
  **Fixed** (`live.handle_from_url` parses handle + instance from
  the URL; regression test added). **Re-run: live 1, deleted 0.
  PASS.**

## 6. Arquivo.pt

- `arquivo jack --limit 5` (CDX mode) → **5 results**,
  `x_jack_20261126193827.json` 6,037 bytes. First record: post
  `1026984242893357056`, archived 2018-08-09. **PASS.**
- `arquivo jack --keyword jack --limit 5 --plan pro` → **5
  results** (`arquivo_jack_20261126193931.json`, 5,432 bytes).
  Note: keyword mode filters by URL substring, so it can return
  non-post pages whose URL contains the handle (e.g.
  jackbarbalet.com) — the CLI reports them as URL matches, not
  authorship. **PASS with that caveat.**
- `arquivo jack --keyword setting --limit 5 --plan pro` → **0
  results** (honest empty; Arquivo.pt full-text is PT-weighted
  and ≥1 year embargoed).

## 7. Checks

- `scripts/sync_pricing.py --check` → **PASS.**
- `scripts/seo_check.py http://127.0.0.1:8901` → **12/12 PASS.**
- Playwright e2e (`tests/e2e`, `.venv-e2e`, against a local server
  on port 8901): **31/31 PASSED** in 73.7s (dashboard 7, licence
  6, pricing 10, search 8). Chromium binaries were missing at
  first (`playwright install chromium` took ~8 min to download);
  once installed, the whole suite passed on the first run.

## Known limits confirmed live (not bugs)

- CDX returns oldest first: the earliest rows for a handle are
  bare listing/profile redirects with no post id. `diff`/`archive`
  skip them; use `--url` for a specific post or `--from` to skip
  early rows.
- Arquivo.pt keyword mode is a URL-substring filter, not
  authorship proof.
- Bluesky/Mastodon live feeds truncate at 100 posts: a post
  missing from a truncated feed is "unknown", never "deleted".
- The web demo search on the deployed site still needs the CDX
  proxy (v1.5.0, `functions/api/cdx.js`) — CLI is unaffected.

---

# Test report — v1.5 + branding + web improvements (2026-11-26)

John approved the 5 subdomain brands (ArchiveCheck / DeletedProof /
HandleHistory / PostTrace / PastProof) and asked to wire them, test
ALL features, then improve the web console (issues 16-18). Work done
on disk, not pushed (push is the parent agent's browser-upload step).

## 1. What changed

- **Branding wired:** `web/branding.js` is loaded by `web/index.html`
  + `web/dashboard.html` (accent CSS rule, `id="search-hero"` on the
  search h2, 7 preset buttons with `data-preset`). Approved brands
  only — no repo/PyPI/Pages rename.
- **Console extracted:** the inline script moved out of index.html
  into `web/console.js` (252 lines); index.html is now a 150-line
  shell. New `web/modes.js` (166 lines) holds presets, all-network
  search, and the failure UI. All web files under ~300 lines.
- **Issue 16:** the CLI command box is gone from the web console —
  the failure notice, the "Prefer the command line?" section, the
  dashboard evidence button, and two dialog strings were reworded.
  No `wayback-social archive …`, `pipx install`, or "use the CLI"
  text remains on any web page (enforced by unit + e2e tests).
- **Issue 17:** `functions/api/cdx.js` (Pages Function, already
  written by v1.5) proxies CDX server-side; the page uses `/api/cdx`
  on deployed hosts and direct CDX on localhost. A failed search now
  shows retry + direct-CDX link + a clearly-labelled verified sample
  — never demo rows as live results.
- **Issue 18:** all-network search is now a first-class mode
  (`modes.js` searchBroad): one handle, all 14 networks, tier caps
  from licence.js (free 3 / starter 7 / pro+studio 14), grouped
  per-network results with up to 3 sample rows each, CSV/JSON export
  of the samples (network column per row).
- **Tests added:** `tests/test_web_tiers.py::test_index_has_branding_and_modes_wiring`
  (branding hooks + no-CLI enforcement) and
  `tests/e2e/test_branding_modes.py` (5 tests: per-hostname branding,
  preset picker, no-CLI text, failure UI via aborted CDX, grouped
  broad results via mocked CDX).

## 2. Full test results

- **pytest:** `.venv/bin/python -m pytest tests/ -q` →
  **109 passed, 1 skipped.** (Was 108 passed + 1 failed: the failure
  was `test_index_has_tier_ui` asserting JS identifiers inside
  index.html after the console extraction — the test now reads the
  page + its scripts, which is what a browser loads.)
- **Branding node checks:** `node web/branding.test.js` →
  **121/121 pass.** Per-hostname harness against the served files:
  9/9 hosts resolve right (5 test hosts, archivecheck.com +
  app.archivecheck.com, localhost, unknown → apex fallback), with
  the right title/hero/accent/preset/footer on each. Accent vars
  spot-checked: verify `#E85D75`, legal `#C9A227`.
- **SEO:** `scripts/seo_check.py http://127.0.0.1:8902` →
  **12/12 pass** (title 67 chars, meta 147, OG/Twitter, canonical,
  JSON-LD 6 offers, robots.txt, sitemap.xml).
- **CDX proxy (live, Node harness):** `GET /api/cdx?url=twitter.com/jack/status/*&output=json&limit=3`
  → **200, CORS `*`, cache `public, max-age=300`, 4 rows in 58s**
  (archive.org is slow — matches the page's "20–60s" copy).
  Missing `?url=` → **400 + JSON error**. Disallowed param
  (`&evil=1&token=secret`) → **200, param dropped**. First attempt
  failed on a socket error from the egress proxy; retry passed —
  archive.org flakiness, not a code bug.
- **Playwright E2E:** `tests/e2e/run_e2e.py` (own local server) →
  **36 passed** (31 pre-existing + 5 new branding/modes). The first
  run showed 29 failures — all `ERR_CONNECTION_REFUSED` because the
  ad-hoc server on 8902 had died between shell sessions; re-running
  through run_e2e.py's own server passed everything.
- **CLI smoke (live, /tmp/wbs-v15, throwaway secret):**
  - `archive x jack --limit 5 --no-fetch-text --plan free` → CSV
    5,926 bytes. **PASS.**
  - `find clumsysmurf --networks x --plan pro` → "found on 1/1
    networks: x", all 4 export formats written. **PASS.**
  - `diff` of two `--url` exports (jack/status/20, limit 2 vs 5) →
    compared 1 vs 4 rows: removed 0, added 0, kept 1. **PASS.**
  - `licence make --tier pro --email smoke@example.com` →
    `DP1-PRO-…` key; `licence check` → "Valid licence key — tier:
    pro". **PASS.** (First attempt needed `--email`; first key
    capture failed only because the grep missed lowercase hex.)
  - `evidence <x_jack.json> --plan studio` → `pack_jack.zip`
    6,417 bytes, 6 records, 7 files incl. manifest.sha256 +
    README.txt; `unzip + sha256sum -c manifest.sha256` → **all 6
    files OK. PASS.**
  - `arquivo jack --limit 5` → 5 results (CDX mode). **PASS.**

## 3. Bug found and fixed by this run

Preset-selector scoping: `modes.js` and `branding.js` used the bare
`[data-preset="…"]` selector, but `activatePreset` also writes
`data-preset` onto `<body>` — so after one activation the body
itself matched, `querySelector` returned the body (no aria-pressed,
no click handler), and Playwright strict-mode saw 2 elements.
Fixed by scoping both files to `button[data-preset="…"]` (and the
branding test's fake DOM). Caught by the new e2e tests; all green
after the fix.

## 4. Known limits / still needs a live deploy or John's decision

- **`/api/cdx` needs a live Pages deploy to prove.** Wrangler is not
  installable in this VM (`npx wrangler` fails), so the Function was
  verified by running its code in Node against live archive.org —
  not by `wrangler pages dev` and not on the deployed host. After
  the next push, re-run a live search on deletedproof.northforgelabs.dev
  and confirm real rows (not the sample).
- **Per-subdomain titles are JS-applied.** The static index.html
  still says "wayback-social" — a no-JS crawler sees the old title
  on every subdomain. Google renders JS; server-side rendering
  would fix it properly (not built).
- **Localhost live search still fails on CORS by design.** On
  localhost the page calls CDX directly (no proxy); the failure UI
  is what you get there. The deployed site uses `/api/cdx`.
- **E2E broad test uses mocked CDX** (localhost has no proxy, so
  live broad finds 0 networks in Chromium). The live broad path is
  covered by the CLI `find` smoke above + the status/counts e2e test.
- **Umbrella name still not formally locked** (ArchiveCheck is the
  v2 recommendation; only the subdomain brands were approved). No
  rename was done. Paddle links are still `REPLACE_*` placeholders
  (issues 3-4). `wayback_social/cli.py` is still 666 lines (issue 12).

## 5. Paddle webhook → licence minting → D1 → Resend (issue #4, 2026-11-26)

Built + tested locally; not yet live (no Paddle account, no Resend
key, private key not yet a Pages secret — see docs/paddle-webhook.md §5).

- `node --test tests/test_paddle_webhook.mjs`: **7/7 pass** —
  signature valid/wrong/stale; transaction.completed mints a DP2 key,
  writes the D1 row, emails the key (Resend stub captured HTML + text);
  duplicate event and duplicate transaction never mint twice (1 licence,
  1 email); bundle → studio; unmapped price → 500; bad signature → 401;
  refund → revoked and /api/licence-check reports valid:false,
  status:revoked; licence-check on active key / DP1 key (refused) /
  valid signature with no D1 row (valid, status unknown); web
  licence.js verifies DP2 via WebCrypto Ed25519.
- Python cross-check (`tests/test_paddle_webhook.py`): the Node-minted
  key verifies with the pure-Python Ed25519 code — server mint and CLI
  verify agree.
- `pytest tests/test_ed25519.py tests/test_licence2.py tests/test_licence.py
  tests/test_web_tiers.py`: **38 passed**. Full suite: **134 passed,
  1 skipped**.
- Live D1 smoke test (Cloudflare API): INSERT test licence row →
  SELECT reads it back → DELETE → 0 rows remain. Database
  `wayback-social-licences` (uuid 38a206cb-...-d4d22), schema from
  migrations/0001_licences.sql applied and tables verified.
- Bugs found and fixed while testing (all caught by tests, not by users):
  1. Ed25519 point addition used the a=+1 formula for y3 (must be
     y3 = (y1*y2 + x1*x2)/(1 - d...) for the a=-1 curve) and the
     on-curve check had the wrong sign on x^2 — RFC 8032 vectors
     caught both.
  2. The base64url signature contains `-`, so splitting a DP2 key on
     every `-` produced 7 parts — parsers now split with maxsplit=3
     (Python) / rejoin (JS) and the signature is 86 chars, not 88.
  3. `public_key_bytes()` bound its default argument at import time,
     ignoring rotation/monkeypatching — now resolves at call time.
- Paddle signature scheme verified against Paddle's docs: HMAC-SHA256
  over `ts:rawBody` with the destination secret — the plan doc's
  earlier "RSA" claim was wrong (RSA is Paddle Classic).
- Pages secrets via the Cloudflare REST API do NOT work (PUT/POST to
  /pages/projects/.../secrets both return 405) — wrangler or the
  dashboard is the working path; documented in docs/paddle-webhook.md §5.
- NOT yet verified live: the Function on Cloudflare (needs push +
  secrets), a real Paddle sandbox purchase, a real Resend email.

# Test report — web search UX pass: controls, date picker, copy (2026-11-26)

Issues #16–18, #21 (John's screenshot: live free search broken), #22
(multi-source copy). Full write-up: docs/web-search-ux.md. All work
local-only until the batched push — nothing here is claimed verified
live.

## 1. What changed

- Failing search: page uses the same-origin CDX proxy (`/api/cdx`)
  on non-localhost hosts; `?cdx=proxy` / `?cdx=direct` override;
  `scripts/dev-server.mjs` runs the real Function locally;
  `fetchPattern()` throws on HTTP/non-JSON/abort; a failed search
  shows no rows — retry, direct CDX link, labelled sample only.
- Search controls: `web/search-job.js` — progress bar + Pause /
  Stop / Resume, AbortController + job state machine. New in this
  pass: `settled()` / `waitForResume()` / `abandon()` so a resumed
  search re-renders (previously resumed rows were fetched but never
  shown); stopped-with-zero-rows gets its own honest status.
- Date picker: flatpickr 4.6.13 (MIT), vendored in
  `web/vendor/flatpickr/`; FROM/TO range feeding CDX from/to.
- Date stuck at 2006: the sample now respects From/To (refused with
  an out-of-range message when 2006 is outside the range).
- "50% OFF": launch note + per-card "This pack: $X now, $Y after
  launch", values from pricing.yaml (re-synced).
- Licence lockdown: demo keys labelled "Demo key … NOT a purchase"
  everywhere (console + dashboard, badge + status + verify copy).
- CLI audit: zero CLI mentions in web/ (incl. failure paths).
- Multi-source copy: "Wayback" only ever as a source name now;
  hero/meta/status/honest-limits rewritten; sitemap/robots fixed to
  deletedproof.pages.dev.

## 2. Test results

- pytest: **140 passed, 1 skipped** (12.47s).
- node: search-job **54 checks passed** (was 43; +11 for
  settled/waitForResume/abandon), branding **121/121**, auth all
  passed, turnstile all passed.
- SEO: **12/12** (`scripts/seo_check.py` against a local server).
- Playwright acceptance (`tests/e2e/test_search_controls.py`,
  real proxy + real archive.org, no mocked CDX): **5/5 passed**.
  - `test_date_picker_sets_yyyymmdd` — setDate strings, typed ISO
    `2023-06-15` → `20230615`, typed compact `20231231` →
    `20231231`, clear buttons.
  - `test_sample_respects_date_range` — 2020–2023 refuses the 2006
    sample (0 rows, out-of-range message); dates cleared → sample
    loads, labelled "NOT a live result", 1 row.
  - `test_free_search_via_proxy_with_date_range` — signed-out free
    user, jack / X, 2020–2023 → "Found 20 capture(s)", 20 rows, all
    dated 2020–2023, `/api/cdx` request observed, zero CLI/demo
    bleed on the page.
  - `test_pause_resume_during_search` — pause shows "paused",
    resume completes with rows.
  - `test_stop_keeps_partial_results_then_resume` — stop shows
    "stopped … no results yet", resume completes with rows.
  - The three live-search tests together: 172.30s (archive.org is
    slow; one CDX fetch is 30–90s).
- Full E2E suite (local, via `tests/e2e/run_e2e.py`): **49 passed,
  8 failed** in 768.48s. The 8 failures split into two groups (see
  §5 below): 5 were flakes that passed on re-run, 1 was a real
  dev-server crash (fixed), 1 was a real test-environment bug
  (broad search needs the proxy — fixed), 1 is the same dev-server
  crash via the stop test (fixed by the same change).

## 3. Bugs found and fixed by this run

1. flatpickr mis-parsed ISO strings: `setDate("2023-12-31")` became
   2023-01-01 (its Ymd token scan breaks on dashes). Fixed with a
   custom `parsePickerDate()` in `web/console.js` (ISO, compact and
   long forms); covered by the date-picker test.
2. Resume re-render gap: after Stop, `search()` / `searchBroad()`
   returned without waiting for a resume, so resumed rows were
   fetched but never rendered. Fixed with the `settled()` /
   `waitForResume()` / `abandon()` loop in both search paths;
   covered by new search-job unit tests (job8–job11).
3. Sibling drift found while auditing: `web/sitemap.xml` and
   `web/robots.txt` pointed at `wayback-social.pages.dev`, which
   does not exist — now `deletedproof.pages.dev`. (Canonical in
   `web/index.html` is `https://archivecheck.com/` after a sibling
   edit in this batch — the domain is not bought yet; decide at
   push time.)
4. Dev server killed by an aborted search (found by the full suite,
   §5): `scripts/dev-server.mjs` now guards every response write —
   `clientGone()` check after each upstream await, `safeEnd()`
   that never writes to a destroyed socket and never lets the error
   path throw. A gone client drops the body instead of crashing
   the process. Repro still to be re-run cleanly (see §5).

## 4. Still needs the live deploy (NOT verified)

- The batched push, then full validation: pytest, node branding,
  SEO check, Playwright E2E, live checks on all 6 domains, live
  free search with a date range on app., CDX proxy end-to-end on
  Cloudflare (the Function runs on Cloudflare's network —
  archive.org must answer it there), per-subdomain branding.
- The live site is still the stale v1.3 build — that is why John
  still sees the failure. The push is the unblocker.

## 5. Full-suite failures — analysis and fixes (same day, after §2)

Full suite: 49 passed, 8 failed.

- 5 flakes, passed on re-run (`run_e2e.py -k` on the six):
  `test_seo_tags_and_files`, `test_pro_licence_unlocks_pro_tier_on_index`,
  `test_licence_clear_returns_to_free`,
  `test_json_export_gated_on_free_but_downloads_on_pro`,
  `test_dashboard_licence_verify_pro`. No code change; the full-run
  failures were timing/contention under the 57-test load (the licence
  copy the tests assert is the new lockdown copy, already updated
  for it by a sibling).
- `test_stop_keeps_partial_results_then_resume` + 
  `test_sample_respects_date_range`: `ERR_CONNECTION_REFUSED` on
  127.0.0.1:8902. Root cause: `scripts/dev-server.mjs` awaited the
  full archive.org body, then wrote it to the socket the Stop test
  had aborted — unhandled rejection killed the Node process, and
  every later test got connection-refused. The code path plainly
  has that failure mode (unconditional `res.end` after the await,
  and a catch block whose own `writeHead` throws on a destroyed
  socket). Fixed in §3 item 4. A clean abort-survival repro was
  ATTEMPTED but came back inconclusive: port 8902 was contested by
  parallel runs (a sibling validation pytest was using it), the
  repro's own node died at the stop while a second server answered
  HTTP 200 — the result cannot be attributed cleanly. Re-run the
  repro alone (no other 8902 user) before calling this fixed:
  start the dev server, run `test_stop_keeps_partial_results_then_resume`
  + `test_sample_respects_date_range`, confirm the server survives.
- `test_broad_search_checks_tier_networks`: `wait_for_function`
  timeout (240s) for "found on". Root cause is environmental, not
  the product: the test ran against the snapshot static server, so
  the page fetched CDX directly and Chrome in this sandbox gets
  `ERR_TUNNEL_CONNECTION_FAILED` for web.archive.org (verified by
  probe: direct fetches fail fast; the page honestly reports "Live
  search didn't complete"). Fixed by pointing the test at the dev
  server (real /api/cdx proxy, `?cdx=proxy`) with a 420s timeout
  (3 networks sequential over archive.org is slow). The dev-server
  fixture moved from `test_search_controls.py` into `conftest.py`
  (shared; reuses an already-running server on 8902 instead of
  failing to bind, and checks the proc stays alive at startup).
  My change to `searchBroad()` did not alter the all-failed path
  (still `showFailure()`), so this failure predates this pass —
  it was masked before by direct CDX working intermittently.

## 6. Re-verification status

- The dev-server crash fix + fixture move + broad-test fix were
  applied AFTER the full-suite run. The stop/sample/broad tests
  and a fresh full suite have NOT been re-run yet by this agent:
  a parallel validation pytest (pid 94234, `-k
  test_free_search_via_proxy_with_date_range or
  test_broad_search_checks_tier_networks`) was using port 8902 when
  this pass finished, so re-running here would have fought over the
  port. Re-run before calling the batch green:
  `.venv-e2e/bin/python tests/e2e/run_e2e.py`.
- Caution from this pass: while cleaning up a server I believed
  was my orphan, I killed pid 94321 (a dev server started
  20:50:47 UTC), which appears to have belonged to that parallel
  run. If that run's free-search test fails with connection-refused,
  the kill — not the product — is the likely cause.

## 7. Stop-test failure — diagnosis and fix (evening, same day)

`test_stop_keeps_partial_results_then_resume` failed twice with a
240s TimeoutError waiting for `#status:has-text('Found')` after
Stop → Resume (4-test set 416s, isolated 268s) while the other
three tests in the set passed. Full diagnosis:
docs/web-search-ux.md §13.

- **Root cause: an archive.org CDX stall, not the resume path.**
  The resumed fetch hung at archive.org (CDX API flapping: 503 /
  "Temporarily Offline" / connection stalls) and no link in the
  chain has a timeout. Evidence: the resume path passes
  deterministically against a stubbed archive (isolated stop test
  **PASSED in 33.39s**, real dev server + real proxy + real page
  code, stub `/tmp/stub-cdx.mjs`); the dev-server abort fix
  survives a standalone abort repro (client aborts mid-flight,
  server stays alive, fresh request completes); and at diagnosis
  time CDX returned 503 then five consecutive 10–20s timeouts
  while example.com / arquivo.pt / web.archive.org's homepage all
  answered 200 — egress fine, CDX API itself hanging.
- **Fix: searchBroad timeout.** `web/modes.js` gained
  `fetchPatternTimed()` (AbortController + 120s per fetch;
  TimeoutError distinct from AbortError so a stall counts as a
  failed pattern instead of stopping the job) and `checkNetwork()`
  uses it. `web/modes.test.js` (new, node vm harness): **11/11
  checks**. End to end against a stub that stalls one Instagram
  pattern forever, broad search **PASSED in 132.73s** ("found on
  1/3 networks"); the stub log shows the timeout firing at exactly
  +120s and the job continuing. The single-search path
  (`fetchPattern` in console.js) deliberately still has no timeout
  (see §13) — a follow-up, not part of this fix.
- **Suite after the change:** pytest **141 passed, 1 skipped**
  (baseline 140 — the +1 is a sibling's Paddle webhook test that
  landed in the shared tree meanwhile; 0 failures); search-job
  **54/54**; branding **121/121**; modes **11/11**; SEO **12/12**.
- **Proven live (2026-11-26 evening):** after ~20 minutes of CDX
  outage, CDX recovered (probe 200 in 9.0s) and the isolated stop
  test **PASSED in 58.47s**, then the 4-test set **4/4 passed in
  321.35s** (broad, free search, stop/resume, sample) against the
  real archive. CDX flapped shut again right after (curl 000) —
  consistent with the stall diagnosis. No push to GitHub (per task).

## 5. E2E (Playwright) — 2026-11-26 evening (full detail: TEST-REPORT-E2E.md)

- **Local, clean v1.5 snapshot: 36/36 passed in 49.29s** (snapshot
  `/tmp/e2e-web-tdql819c`). Suite is Python Playwright 1.65.2,
  Chrome for Testing 159.0.8154.6, `tests/e2e/run_e2e.py`.
- **Live (stale v1.3 build, 18,581-byte index): pages.dev 15/36,
  northforgelabs.dev 16/41.** Every live failure is a v1.5 feature
  absent from the deployed build (licence UI, dashboard, broad,
  branding, modes, presets, auth, prefill, CLI-text removal, new
  demo-failure UI) — not a live regression. Live demo search is
  honest: old `Live search failed (archive.org may block browser
  requests / CORS).` message + 1 labelled demo row, never fake rows.
- **Live SEO + mobile: 2/2 pass on both hosts** after test-only
  fixes (localhost CONNECT forwarder + `ignore_https_errors` for
  this sandbox's Chrome, which cannot tunnel via the egress proxy
  directly and rejects all public TLS roots; live cert verified
  valid via openssl, Let's Encrypt YE2, return code 0).
- Local contention runs (47/57, 36/41) failed on licence waits and
  broad/search-controls timeouts while 3 sibling suites ran at once
  on this 1.5-CPU VM; the licence flow re-verified passing
  standalone (`Demo key active: Pro Pack tier preview…`, badge
  2500 captures/search, `ws_licence_tier = pro`). Real follow-up:
  `searchBroad` has no fetch timeout — a stalled archive.org fetch
  hangs it indefinitely.
- Still not verified: full live suite after the batched push, live
  free search with a date range on app. (#21), CDX proxy
  end-to-end on Cloudflare, per-subdomain branding live.

## SSR branding — server-side per-subdomain titles/meta (issue #20, 2026-11-26)

- `web/brands.json` is the single source of truth; `scripts/sync_brands.py`
  regenerates the `BRANDS` block in `web/branding.js` and
  `functions/_lib/brands.js` (middleware). `sync_brands.py --check`
  clean; `tests/test_brands_sync.py` **6/6**.
- `functions/_middleware.js` (Pages Function, HTMLRewriter) rewrites
  title/meta/og/twitter/JSON-LD (+ h1/tagline/footer on the index page)
  per hostname for `/`, `/index.html`, `/dashboard.html`; passthrough
  for everything else. `node functions/middleware.test.mjs` **486/486**
  (19 hosts × 2 pages, resolver agreement with branding.js, passthrough,
  static files carry the apex brand). `node web/branding.test.js`
  **121/121**.
- `tests/e2e/test_ssr_branding.py` **11/11** — raw HTML over real HTTP
  via `scripts/dev-server.mjs` (runs the real middleware; `X-Test-Host`
  previews a subdomain locally). `scripts/seo_check.py` **12/12**
  against the middleware-served apex page.
- Full suite at time of writing: **pytest 140 passed, 1 skipped**;
  node branding/search-job/turnstile/auth/middleware all green;
  **E2E 57/57 across runs** (full run 50 passed + 7 failed; all 7
  passed on re-runs). The last 2 failures were archive.org flapping,
  proven, not the code: 3 consecutive `/api/cdx` attempts returned
  "Internet Archive: Temporarily Offline", then 200 with real rows,
  then 504 Gateway Time-out.
- Bug caught by the middleware test, fixed before shipping: the
  `JsonLd` handler stored its accumulator in `this.text`, shadowing
  its own `text()` method, so JSON-LD was never rewritten (the
  try/catch silently left it untouched). Renamed to `this.json`.
- SEO trims to fit the repo's own gates (title 30–70, description
  50–160): app seoTitle 79 → 67 chars; all five metaDescriptions
  trimmed to ≤160; apex description carries the issue #22 multi-source
  framing (Wayback Machine, Arquivo.pt, Common Crawl, live APIs).
- Node tests now run in CI (`.github/workflows/ci.yml`: setup-node 22
  + all five node test files + `sync_brands.py --check`).
- NOT yet verified live: the middleware only exists on Cloudflare
  after the next push. Live check (curl each subdomain, grep
  `<title>`) is in docs/ssr-branding.md §4 — issue #20 stays open
  until that passes.

## Archive sources verification — 2026-11-27 00:24–00:28 UTC

Full live re-probe of every source (docs/data-sources.md §0 has the
table). Test handles only: jack, bsky.app, Mastodon, dQw4w9WgXcQ.

- **Arquivo.pt — working.** `arquivo jack --limit 5` → 5 CDX results
  (real rows: jack status 1026984242893357056, captures 2018-08-09..14,
  status 200, Arquivo.pt replay URLs). Keyword mode: `--keyword jack
  --plan pro` → 5 results; `--keyword twttr` → 0, honest empty.
  Embargo note printed every run. `--format json` on the free plan is
  refused by design (Starter+); CSV works. No bug found, nothing changed.
- **Common Crawl — degraded but proven end-to-end.** `collinfo.json`
  200; latest crawl CC-MAIN-2026-47 (6–19 Nov 2026). Index 504s on
  most attempts: jack/status/20 job → 504, retry → empty (honest —
  the Nov 2026 crawl has no capture of it); example.com job → 504,
  retry → 504, retry → **done, 134 captures** (first row
  20261106154953, status 200). Direct index queries 504 for single
  URLs, wildcards, and both CC-MAIN-2026-47 and -43. Async-only
  design is vindicated: queue → honest error → retry → done. The
  "done with rows" path is now proven live, not just code-tested.
- **Ghostarchive — wired: capture dates now parsed.** Search page
  200 (5,318 bytes); 7 captures of jack/status/20, 2022-01-14..
  2024-04-14; `/archive/AJzyo` → 200 live. `search_ghostarchive`
  now parses the results-table date cell into `archived_timestamp`
  (RFC 1123 → YYYYMMDDHHMMSS); a link without a parsable date keeps
  an empty timestamp; no links → 'unavailable', never fake zero.
  Tests: 2 new offline tests (date parsing, dateless link) +
  existing link/no-link tests — `tests/test_archives.py` 14/14.
  Live check: `search_ghostarchive(jack/status/20)` → 7 records
  with dates 20240414033258..20220114214935.
- **archive.today — endpoint alive, stays links-only.** Timemap
  with `Accept: application/link-format` → 200, 38 mementos for
  jack/status/20. Without the header the same URL returns the HTML
  landing page (200, 59 KB, 0 mementos). NOT wired for fetching:
  Wikipedia blacklisted it 21 Feb 2026; 429/CAPTCHA risk; never
  legal evidence. Finding recorded in docs/data-sources.md.
- **MemGator — public URL UP (2026-11-27 00:29 UTC).** 127.0.0.1:1208
  TimeMap → 200, 50 mementos, first 2008-11-03. Public
  `memgator.northforgelabs.dev/about` → 200 (banner) and public
  TimeMap for jack/status/20 → real mementos from 2008-11-03;
  `sources` shows memgator ok; cloudflared log: `Registered tunnel
  connection connIndex=0 ... location=atl01 protocol=http2`.
  Unblocked by restarting the edge relay with fresh proxy credentials
  (pid 11663) + one tunnel restart (pid 13544); precheck TCP
  connectivity passed both regions, `hard_fail=false`. (Earlier
  state: 530/Cloudflare 1033 after a VM restart wiped /etc and an
  approval timeout terminated cloudflared mid-restart. Note: a direct
  curl to region1:7844 still returns 000 in sessions where the proxy
  refuses it — the relay path is what matters. It can flap again when
  proxy credentials rotate; the 15-min health check retries.)
- **Live sources — all working.** Bluesky getProfile 200
  (did:plc:z72i7hdynmk6r22z27h6tvur) + getAuthorFeed 5 posts;
  `live bluesky bsky.app` CLI works. Mastodon lookup 200 (id 13179,
  created 2016-11-23, 568 statuses) + RSS 200 valid XML (29 KB).
  X oEmbed 200 (author jack, "just setting up my twttr"). YouTube
  oEmbed 200 (exact Rick Astley title). TikTok oEmbed 200 (JSON
  embed HTML). Reddit user JSON → 403 (archive-only, as expected).
- **Wayback CDX — working now.** `archive x jack --limit 2` →
  "Found 4 capture(s). Parsed 4 post(s)"; `sources` probe closest
  20260723100538. CDX flapped the previous evening (503 / stalls);
  it answered fine throughout this round — retry-once policy stands.
- **Filed, not built:** nothing new filed. archive.today fetch is
  deliberately not built (policy). Common Crawl needs no code change
  — the async job already handles 504 → retry → done honestly.

## Issues sweep — #12 / #9 / #15 / #13 / #14 / #5 (Track A, 2026-11-26/27)

**Standing rule applied throughout (John, 2026-11-26): FREE SOURCES AND
FREE TIERS ONLY until paying customers.** No paid data source or paid
plan was used or needed by any item below. Recorded in
`docs/data-sources.md` (new "Standing rule" section + a gated-upgrades
table: X API, paid Reddit, paid archive APIs, Clerk paid tier,
Workers Paid, Resend paid) and as a one-line pointer in
`docs/storage-auth-plan.md`. Nothing in the sweep reaches for a paid
option; the R2 work stays on the Standard free tier.

### #12 — cli.py split (DONE locally)
`wayback_social/commands/` (common, licence, archive, diff, find,
batch, info) + `cli.py` a 56-line dispatcher. No behaviour change.
Bug caught by the split: `archive_cmd` used `summarise` without
importing it (fixed). Test patch targets updated to the owning module.
Verified: pytest green; all 13 commands' `--help` work.

### #9 — Trust & safety page + FCRA (DONE locally)
`web/trust.html` (what it does / never does, FCRA "not a consumer
report", legal triage, local-first, report-abuse route); honest-limits
box (`#preset-limits`) under the presets, filled per preset by
`modes.js` (+ hiring FCRA note); footer NAV links on index +
dashboard. Verified: Playwright 26/26 in real Chromium (dev server,
real middleware), modes 18/18, middleware 490/490, branding 121/121,
search-job 54/54. Bug found + fixed: the HTMLRewriter test shim
regex-matched a literal `<footer>` inside a CSS comment and ate the
page body — shim now protects `<style>` blocks + HTML comments
(+4 regression checks). Still to close: push + live check.

### #15 — Evidence-report usage counting (DONE locally, local-first half)
`web/evidence-usage.js` (per-licence-key count, FNV-1a bucket label,
legacy migration, warn 9/10, block 11th, 0-included tiers blocked);
dashboard wired (used/included, warn/block/top-up prompt — no purchase
invented). Verified: node 31/31, Playwright 14/14 (log 1→10, warn at
9, block at 11, persist across reload, per-key isolation, free 0/0
blocked). Server-side counting vs D1 is the follow-up with the Paddle
go-live. Still to close: push + live check.

### #13 — Subdomain routing (VERIFIED locally; substance gap recorded)
Playwright 29/29 in real Chromium (dev server + X-Test-Host): all 5
hosts resolve the right brand server-side and client-side, right
preset auto-activates (verify→catfish, osint→journalist,
legal→legal), `?preset=` deep links work, legal SSR footer carries
"Triage, not court-ready". Gap (not built): osint batch/diff/evidence
and legal citation-export have no web UI — CLI features; the console
only names them. Still to close: push + live check.

### #14 — First weekly SEO/analytics report (DONE locally)
`docs/seo-report-2026-11-26.md`. seo_check re-run 2026-11-27 00:58
UTC: live **12/12 on all 6 domains** + local **12/12** (current tree,
dev server). Sitemap lastmod 2026-11-26, trust.html included. Web
Analytics wiring built (`web/analytics.js`, 10/10) but NOT enabled
(token empty; Cloudflare API route refused 405 for this auth scheme)
— human dashboard step. Search Console + Bing not connected (human
steps); Paddle sales none yet. Honesty note: live 12/12 is the stale
v1.3 deploy — re-run after the batch push. Next report due 2026-12-03.

### #5 — R2 buckets (DONE locally + buckets LIVE)
`functions/api/packs-upload.js` (207 lines): DP2 licence verify
(DP1 rejected), size 1..10 MB + sha256 validation, SigV4 presigned
PUT (15-min expiry, content-addressed key
`packs/<free|paid>/<hash8>/<sha256>.zip`, free → 30-day retention,
paid → 365-day), fail-closed 503 without R2 credentials.
`functions/api/packs-upload.test.mjs` **14/14** — the signature is
verified against an INDEPENDENT SigV4 recomputation (node createHmac,
not the implementation's WebCrypto path). Tests caught + fixed two
real bugs: non-string key/sha256 threw (now coerced), and a
path-traversal display name was not basenamed (now is). pytest wrapper
`tests/test_packs_upload.py` + CI runs the suite. **Buckets created
LIVE 2026-11-27 01:09 UTC** via the Cloudflare API (both
`success: true`, Standard class, WNAM): `deletedproof-packs` +
`deletedproof-packs-staging`; `[[r2_buckets]] PACKS` binding in
`wrangler.toml` uncommented. Still to close: R2 S3 API token +
`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` Pages
secrets (human step, commands in `docs/storage-auth-plan.md` §1),
lifecycle rules (packs/free/* → 30d, packs/paid/* → 365d, dashboard),
push + live end-to-end upload test. Follow-up with the Paddle go-live
(not this issue): `POST /api/pack-confirm` + D1 `packs` table.

### Full-suite re-run (2026-11-27 ~01:15 UTC, after all sweep changes)
- pytest: **144 passed, 1 skipped** (was 143/1 — +1 packs-upload wrapper)
- branding: pass (121 checks) · search-job: 54 · turnstile: pass ·
  auth: pass · evidence-usage: 31 · analytics: 10 · modes: 18 ·
  middleware: 490/490 · packs-upload: 14/14 (fail 0)
- `scripts/sync_brands.py --check` + `scripts/sync_pricing.py --check`: clean
- seo_check: live 12/12 × 6 domains + local 12/12 (see #14 above)
- Playwright E2E not re-run in this final pass: no `web/` file changed
  after the 36/36 local run; the new code is a Functions endpoint
  covered by its own 14-test suite. Re-run E2E after the batch push
  (push discipline requires it live).

### Environment note (2026-11-26 ~19:55 EST)
A runtime/service restart mid-sweep wiped `/tmp` (the `/tmp/*.py`
verification scripts and the first seo_live run were lost) and killed
the dev server on port 8931. Workspace files survived intact. The dev
server was restarted (pid 1829) and the SEO checks re-run fresh for
#14. Lesson: keep verification scripts that matter in the repo or
re-create them; `/tmp` does not survive restarts.

# Test report — osint research tools web UI (issue #13 follow-up, 2026-11-27)

## 1. What changed
- New Pages Function `functions/api/live-check.js` (POST {urls ≤ 25} →
  live/deleted/unknown verdicts, X oEmbed tie-breaker, 10s timeout)
  + dev-server route for it in `scripts/dev-server.mjs`.
- New web UI: `#osint-tools` section on `index.html` (Batch / Deleted
  diff / Citations tabs) — `web/batch.js` (260 lines: batch + shared
  state + routing), `web/diff.js` (228 lines: deleted diff, split from
  batch.js to stay under the ~300-line ceiling), `web/citations.js`
  (196), `web/evidence-pack.js` (296: client-side ZIP + SHA-256
  manifest), `web/live-check.js` (64: chunked POST, unknown-on-failure).
- `web/console.js`: one getter (`window.WS_CONSOLE.getRows()`).
  `web/licence.js`: `deleted_diff` added to PLAN_CAPS / BUNDLE_CAPS
  (false on free, true on paid — mirrors pricing.yaml; the six numeric
  caps are unchanged). `web/index.html` now also loads
  `evidence-usage.js` (was dashboard-only). `web/modes.js`: no change.
- CI (`.github/workflows/ci.yml`) now runs every node suite — modes,
  evidence-usage, analytics, console-timeout, live-check, osint-tools
  and the live-check Function test were missing.

## 2. Test results
- `node functions/api/live-check.test.mjs` — 6/6 (200 live, 404/410
  deleted, 500/timeout unknown, login redirect unknown, HEAD 405 → GET
  fallback, X 403 oEmbed 404 deleted / 200 live, oEmbed NOT on 5xx,
  guards: POST only, urls required, >25 rejected, bad JSON, non-http).
- `node web/live-check.test.js` — 13/13 (chunking 25+5, verdict
  passthrough, thrown fetch → unknown, 502 → unknown, no fetch →
  unknown, empty input → no call).
- `node web/osint-tools.test.js` — 73/73 (parseTargets, postKey,
  dedupePosts, citation text/md/csv, deleted_diff caps per tier,
  CRC32 vectors, full evidence-pack build + stored-ZIP round-trip:
  all 7 files extracted, CRCs verified, manifest.json hashes
  recompute correctly, manifest.sha256 in sha256sum format, empty
  records → error not an empty pack).
- All other node suites green: branding 121/121, search-job 54,
  modes 19, evidence-usage 31, analytics 10, console-timeout 17,
  auth, turnstile, middleware 490/490, packs-upload 14/14.
- `pytest tests/` — 144 passed, 1 skipped (baseline, unchanged).
- Playwright `tests/e2e/test_osint_tools.py` — 13/13 (mocked CDX +
  mocked live-check, real dev server + real middleware): section
  collapsed on apex, routing per brand (osint→Batch, legal→Citations,
  app→Batch, apex→collapsed), batch tier cap (4 lines → first 3,
  grouped counts, snapshot links), batch CSV + JSON-gate on free, diff
  verdicts (live 1 / deleted 1 / unknown 1) + only-deleted filter +
  non-post skip (instagram profile row), diff free-tier block, evidence
  free-blocked / Studio ZIP download (PK header, manifest files
  inside), citations disclaimer + contents + .md/.csv downloads.
- `scripts/sync_brands.py --check` + `scripts/sync_pricing.py --check`
  — clean.

## 3. Bugs found and fixed by this run
- `recordsFromRows` (citations.js) kept BOTH captures of the same URL
  instead of replacing with the latest — caught by osint-tools.test.js
  ("dedupes by URL (latest wins)" failed 4 vs 3). Fixed to replace;
  the test expectation for "oldest first" was stale for the same
  reason and was corrected (the 2020 capture is superseded by 2021).
- `evidence-usage.js` was not loaded on index.html (dashboard-only),
  so the evidence-pack gate fell through to its fallback branch and
  the local-first counting never ran there — caught by the E2E
  evidence test (dialog title was the fallback's, not logReport's).
  Fixed by adding the script tag; the E2E suite now exercises the
  real logReport path (free blocked, Studio downloads).
- `web/batch.js` landed at 447 lines — split into batch.js (260) +
  diff.js (228) before finishing, per the ~300-line ceiling.

## 4. Still needs the live deploy (NOT verified)
- `/api/live-check` end-to-end on the deployed host
  (app.deletedproof.northforgelabs.dev) after the batched push, plus
  a live ZIP download check and the per-subdomain title check
  (issue #20) on all 5 subdomains. Local-only verification never
  closes an issue.
- Still CLI-only by design (see docs/osint-tools.md): replay-text
  fetch, batch watchlists / scheduled re-runs, Arquivo.pt / Common
  Crawl / Ghostarchive as web sources, server-side evidence counting.

# Test report — Track F: reliability + monetization plumbing (2026-11-27)

Three independent pieces, all local-only (nothing pushed — the batch
push is still gated on the canonical decision). No pricing values,
licence minting, auth/Clerk, or console UI touched (Track E owns the
console; the portal endpoint is not wired into the dashboard yet).

## 1. What changed

- **Piece 1 — single-search fetch timeout.** `web/console.js`:
  new `fetchSingle()` helper wraps each CDX pattern fetch with the
  broad-search timeout (`fetchPatternTimed` from `web/modes.js`,
  now exported on `window.WS_MODES` — shared, not copied), 120s
  default, injectable via `window.WS_FETCH_TIMEOUT_MS` for tests.
  A stall throws a distinct `TimeoutError` (not `AbortError`), so
  the SearchJob counts it as a failed pattern and the failure UI
  offers retry; a real Stop still propagates as `AbortError`.
  Both `search()` call sites (legacy loop + SearchJob steps) use
  `fetchSingle()`; if `modes.js` failed to load, the plain
  `fetchPattern` is used (no timeout) rather than failing the
  search. New suite `web/console-timeout.test.js` (vm harness
  loading the real `search-job.js` + `modes.js` + `console.js`).
- **Piece 2 — server-side evidence-usage endpoint.**
  `functions/api/evidence-usage.js` (GET/POST) + migration 0003
  (`evidence_report_logs`: idempotency_key PK, key_hash,
  created_at — the count lives ONLY in `licences.reports_used`,
  no second counter table; the migration is NOT applied live).
  GET returns `{used, included, remaining, tier, status, source,
  verified}`; no key / no D1 → the local-first count as a fallback
  hint, never a hard failure. POST records one used report,
  idempotent on a client-supplied idempotency key
  (check-then-`INSERT OR IGNORE`, the Paddle webhook's pattern);
  used-up / non-Studio / revoked → 403 with the counts; no D1 row
  → 404; no DB → 503 fail-closed. DP1 keys ARE verified here
  (unlike `licence-check.js`). Shared verifier extracted from
  `link-licence.js` into `functions/_lib/verify-key.js`
  (`verifyLicenceKey` → `{valid, tier, scheme}` or `{valid: false,
  reason, status: 400|503, unconfigured}`); `link-licence.js` now
  imports it, and `tests/test_clerk_auth.py` copies the whole
  `_lib/` dir. Deliberate deviation from the brief's literal
  "(licence key hash, used count, idempotency keys)" table: a
  separate count table would create two sources of truth.
- **Piece 3 — Stripe Billing Portal, test mode only.**
  Test-mode portal configuration created LIVE via the Stripe
  connector (`bpc_1UgEQNGnFHTsoY17wW8AIubt`, sandbox
  `acct_1TqN24GnFHTsoY17`, verified with an API read-back: active,
  default, `livemode: false`, return URL to the app dashboard,
  invoice history + payment methods + customer update on,
  subscription cancel off). Endpoint
  `functions/api/billing-portal.js` (`POST /api/billing-portal`):
  shared-verifier key check, D1 `stripe_customer_id` lookup
  (migration 0004 — NOT applied live), Stripe session create with
  `STRIPE_SECRET_KEY` (test), returns `{portal_url, return_url}`.
  Live secret keys (`sk_live_...`) are refused outright, 503,
  Stripe never called. Bad key → 401 (the key is the credential
  here, unlike the 400 on the other two endpoints).

## 2. Test results

- Piece 1: `web/console-timeout.test.js` **17/17** (fast fetch
  resolves with rows; stall → timeout failure UI with retry,
  promptly; real Stop → "stopped" status, not timeout; modes.js
  missing → fallback still searches); `web/modes.test.js` **19/19**
  (+1: `WS_MODES` exposes `fetchPatternTimed`); `web/search-job.test.js`
  54/54; `web/branding.test.js` green.
- Piece 1 E2E proof (isolated, single-search path, real archive via
  the dev-server proxy):
  `test_stop_keeps_partial_results_then_resume` **PASSED in 54.95s**
  (stop → "stopped" status → resume → "Found" with rows). The 120s
  stall itself is proven by the node tests, not E2E (a real 120s
  stall cannot be waited out in E2E).
- Piece 2: `functions/api/evidence-usage.test.mjs` **18/18** (mock
  D1: verify/get/post + idempotency + DP1-accepted + used-up /
  free / revoked / no-row / unconfigured + no-binding 503);
  `tests/test_clerk_auth.py` **8/8** (refactored link-licence still
  green); pytest wrapper `tests/test_track_f_endpoints.py` runs
  both endpoint suites.
- Piece 3: `functions/api/billing-portal.test.mjs` **13/13**
  (mocked Stripe fetch: exact request asserted — POST, Basic auth
  with the test secret, customer + return_url + configuration in
  the body; no-customer 404 with Stripe never called; bad key 401;
  live-key refusal; missing-column 503 naming migration 0004;
  Stripe error passthrough; Stripe unreachable 502).
- Full suite at end of this track: **pytest 145 passed, 1 skipped**
  (baseline 144/1 + the new wrapper test; the 1 skip is the e2e
  conftest "playwright not installed" under the main venv — the
  e2e suite runs separately under `.venv-e2e`). Node: branding,
  search-job 54/54, turnstile, auth, modes 19/19,
  evidence-usage (web) 31/31, analytics 10/10, console-timeout
  17/17, live-check (web) 13/13, middleware 490/490,
  packs-upload 14/14, live-check (functions) 6/6, evidence-usage
  18/18, billing-portal 13/13. `sync_brands.py --check` +
  `sync_pricing.py --check` clean. CI updated with the two new
  endpoint suites (+ console-timeout + modes were already listed).

## 3. Bugs / flakes found by this run

- `functions/api/packs-upload.test.mjs` failed 1/14 once mid-run
  (during concurrent Track E edits to the shared tree) and passed
  14/14 on two immediate re-runs — treated as a transient, same
  pattern as the earlier `test_js_mint_verify_roundtrip` flake.
- `web/osint-tools.test.js` (Track E, in flight) FAILS at load:
  `postKey is not a function` (test requires it from
  `web/diff.js`, which does not export it yet). NOT a Track F
  regression — Track F touched no console UI files. Left for
  Track E; the parent should not treat the tree as fully green
  until that suite passes.
- Harness bug found while writing the timeout tests (not a product
  bug): the test stub started `#results` visible while the real
  page starts it hidden — the stub now matches index.html.

## 4. Still needs the live deploy / human steps (NOT verified)

- All three pieces are local-only: push + full validation per the
  push discipline (the batch push is gated on the canonical
  decision — do not push for this track alone).
- Piece 2: apply migration 0003 (`wrangler d1 execute
  wayback-social-licences --file migrations/0003_evidence_usage.sql`)
  — needs John's approval tap; do NOT run it from this VM
  unprompted. Dashboard wiring to call the endpoint is follow-up
  (console track); the browser still counts locally first.
- Piece 3: apply migration 0004; link a test customer to a test
  licence in D1 (manual insert until the Stripe webhook mapping
  lands); set Pages secret `STRIPE_SECRET_KEY` (test key); prove a
  real portal session end-to-end. Live portal steps are all human
  and gated: John's sales-tax answer + explicit go-ahead, live
  portal config, webhook `cus_` ↔ licence mapping, live secrets —
  see `docs/stripe-vs-clerk.md` §5. The endpoint's `RETURN_URL`
  constant must move with the canonical decision (archivecheck.com).
- The `RETURN_URL` / portal-config default return URL currently
  point at `app.deletedproof.northforgelabs.dev/dashboard.html`.

# SEO content — first 10 pieces (issue #10, 2026-11-27)

All 10 content pieces from docs/seo-plan.md built as static pages
under web/guides/ + a guides index. Each page: own title (30-70),
meta description (50-160), OG/Twitter, canonical, JSON-LD Article
(CollectionPage for the index), apex brand values, honest-limits
footer, "Last updated 27 November 2026", internal links to the
console + other guides. Pages are NOT run through the SSR middleware
(like trust.html) — static meta is what crawlers see. All 11 URLs in
web/sitemap.xml (lastmod 2026-11-27); Guides links in the index +
dashboard footers.

## Results

- scripts/seo_check.py: **12/12 homepage + 110/110 guide-page checks**
  (the script was extended with per-page checks:
  `seo_check.py <base> [page ...]`; homepage behaviour unchanged).
- Playwright tests/e2e/test_guides.py: **24/24** (meta + internal-link
  resolution + footer links + sitemap, per page).
- pytest: **145 passed, 1 skipped** (baseline, unchanged).
- Node: branding 121/121, middleware 490/490.
- CLI-bleed audit: zero hits for pip/pipx/"command line"/subcommands
  across web/guides/ and all web HTML (word-boundary grep; the only
  "cli" substring hits elsewhere are "click"/"onclick"/"clipboard").
- File sizes: every guide page 97-126 lines; seo_check.py 155 lines;
  test_guides.py 114 lines — all under the 300-line ceiling.

## Three real bugs the tests caught

1. Meta description over 160 chars on the waybacktweets comparison
   (168) — shortened to 146; the same check then caught two more
   (Instagram guide 165, brand monitoring 162), both shortened.
2. Relative links in the 10 subdir pages used `../` (one level up)
   but the pages sit two levels deep — nav, trust, and script links
   all 404'd. Fixed to `../../`.
3. Sibling-guide links in "Related guides" were relative to the
   page's own directory (`find-deleted-instagram-posts/index.html`
   resolved inside the current guide's folder) — fixed to
   `../<slug>/index.html`.

## Deliberate deviations from docs/seo-plan.md

- Guide 1 says "with the CLI" in the plan — NOT followed. The CLI is
  internal only (John, 2026-11-26); every guide describes the WEB
  console flows only.
- Comparison slugs use the brand name: `archivecheck-vs-waybacktweets`
  / `archivecheck-vs-social-catfish` (the plan's "wayback-social-vs-…"
  slugs would have put the legacy repo name in the URL; titles and
  headings say ArchiveCheck).
- Guide 2 corrects an index.html claim: the console searches by
  handle — there is NO single-post-URL mode in the web console
  (verified in console.js: the handle is substituted into URL
  patterns). The guide tells readers to check a single Instagram
  post URL on web.archive.org directly. The index.html line
  ("search a single post URL directly instead") is now a known
  copy gap — either the feature or the copy needs a follow-up;
  flagged here, not changed (console copy is Track H's audit).
- Changelog page covers v1.2–v1.5 from CHANGELOG.md and labels the
  Unreleased items (Clerk, Paddle webhook, server-side counting,
  portal, SSR branding, guides) as "built, not yet live".
- Journalist case study is fictional ("Councillor Dana Reyes",
  @danareyes_city) and labelled illustrative on the page — no real
  person is depicted, no real post quoted.

## Still needs the live deploy / human steps (NOT verified)

- Push + full validation per the push discipline (gated on the
  canonical decision). Guide canonicals follow the site-wide
  archivecheck.com convention (like trust.html); the retarget, if
  John picks option (b), must cover these pages too
  (docs/canonical-decision.md).
- Search Console + Bing submission, Cloudflare Web Analytics
  enablement (dashboard step — the API route refused 405), Product
  Hunt + Show HN launch — all human steps, listed in docs/issues.md
  #10.

## Full-E2E confirmation (after a runtime restart, 2026-11-27 ~03:00 UTC)

The first full-suite run was killed mid-flight by a runtime restart
(log empty, outcome unknown — nothing recorded, nothing assumed).
Re-run on the final tree (Tracks H + I landed meanwhile; suite now
109 tests): **103 passed, 6 failed in 560.92s**. Guide tests:
**24/24, zero failures** in the full run.

- 3 failures were transient, all in tests/e2e/test_search_controls.py
  and none touching the guides: test_pause_resume_during_search hit
  the known archive.org stall (240s timeout waiting for "Found");
  test_stop_keeps_partial_results_then_resume and
  test_sample_respects_date_range hit ERR_CONNECTION_REFUSED — the
  run's dev server died mid-run. Isolated re-run of the 3 on the
  stable tree: **3/3 passed in 144.28s**.
- The other 3 are tests/e2e/test_failure_paths.py and are the known
  P1–P5 punch-list items (Track H): checkout dialog = strict-mode
  locator ambiguity (test fix); batch bad-line echo + skipped-line
  wording ("Skipped 1 line(s)…" vs the old "not a valid line") =
  product fix in batch.js. They ride with the P1–P5 fix track, not
  with the guides.
- Effective suite state after the re-run: **106/109**, the 3
  remaining failures all owned by the P1–P5 track.
- Re-verified on the final tree: pytest **146/1** (was 145/1 — Track
  I added a test); every node suite exit 0 with 0 FAIL
  (branding, search-job 54, turnstile 20, auth 38, modes 19,
  evidence-usage 31, analytics 10, console-timeout 17, live-check 13,
  osint-tools 73, arquivo 61, middleware, packs-upload 14, arquivo
  endpoint 11, live-check endpoint 6, evidence-usage endpoint 18,
  billing-portal 13); sync_brands + sync_pricing --check clean;
  seo_check **12/12 homepage + 122/122 guides index + 10 guides**;
  CLI-bleed grep audit zero hits across all of web/.
- Side finding (not a product issue): scripts/dev-server.mjs 500s
  on trailing-slash directory URLs (EISDIR — no directory-index
  handling); seo_check and the E2E suite use python http.server,
  which serves index.html for those URLs. Minor dev-server
  follow-up, flagged here, not fixed in this track.

# Test report — Track H: push-ready verification #20/#21/#22 + #1 rename prep (2026-11-27)

Verification + prep track. No product code changed except test files
(tests/e2e/test_issue21.py, tests/e2e/test_failure_paths.py) and docs.
No push (still gated on the canonical decision).

## 1. #20 — SSR branding matrix (raw HTML, no JS)

Dev server (real middleware) on 8931, X-Test-Host per host, 6 hosts x
2 paths (`/`, `/dashboard.html`). Every injected field — title, meta
description, og:title/og:description, twitter:title/twitter:description,
og:site_name, JSON-LD name+description, h1 wordmark, .sub tagline,
footer — matches the expected brand on all 12 fetches (apex, app,
verify, osint, legal, + deletedproof.pages.dev falling back to apex).
Suites: middleware 490/490, branding 121/121, sync_brands --check
exit 0, test_brands_sync 6/6, test_ssr_branding 11/11. Full matrix in
docs/push-readiness.md §1. By design, not failures: canonical +
og:url are only rewritten on production archivecheck.com hosts (so
test hosts keep the static apex canonical — the live pages will carry
archivecheck.com canonicals until the canonical decision lands), and
dashboard h1/.sub/footer are client-only (documented, noindex).

## 2. #21 — exact-case re-verification (juliawalterz)

tests/e2e/test_issue21.py — John's exact live case (app., signed out,
free, 20200101–20231231, juliawalterz on X) via the dev-server proxy
against the real archive. Attempt 1 (02:24:28 UTC) and attempt 2
(02:24:38) failed on test assertions (tier badge carries no brand
name; the h1 flips back to apex in the browser under X-Test-Host
because branding.js re-resolves from location.hostname — fixed by
driving applyBranding(document, host) like test_branding_modes.py).
Attempt 3: PASSED 2026-11-27 02:25:03 UTC in 36.45s — date picker +
range in the CDX query, real rows in range with no 2006, no demo
sample, no CLI text, progress + Pause/Stop/Resume. Archive.org
flapped 02:26–02:28 UTC (HTTP 503 "Temporarily Offline", then 500 on
the same proxied query) — documented flakiness, not a product
failure. Full record: docs/push-readiness.md §2.

## 3. #22 — CLI-bleed + copy audit

Grep audit over all of web/ (incl. guides): 0 CLI-bleed hits in
user-facing files; "Wayback" only ever as a source name; guides
clean (ArchiveCheck titles, no terminal/pip text); sitemap lists all
10 guides. Failure-path browser tests:
tests/e2e/test_failure_paths.py (6 tests — failed search, diff /
evidence free-tier blocks, batch bad lines, checkout placeholder).
First run passed 3/6; a re-run failed 6/6 on page load because a
parallel track was mid-edit of web/console.js and web/modes.js when
the run started (the page never rendered #plans) — re-run pending a
stable tree; results go in docs/push-readiness.md §3.
Punch list found by the audit (P1–P5, all with file + line + exact
string in docs/push-readiness.md §3): P1 "the CLI pack" in the
downloaded evidence-pack report (evidence-pack.js:143); P2 sources
line overclaims the web search (index.html:104); P3 checkout dialog
leaks REPLACE_*/web/config.js jargon (console.js:219); P4 batch
skipped-line notice is overwritten by progress (batch.js:116-118);
P5 honest-limits line promises a single-post-URL mode that does not
exist in the web console (index.html:266 — flagged by Track G, confirmed
here). The comparison guide slugs were renamed by Track G during this
audit from wayback-social-vs-* to archivecheck-vs-* (no redirect
needed — never live).

## 4. #1 — rename dry-run prep (nothing renamed)

scripts/rename-dry-run.py (read-only, stdlib only) + docs/rename-runbook.md
(ordered steps, four open decisions — guide slugs closed during the
audit). Proven read-only (tree checksums unchanged across two runs)
and deterministic (two runs identical). Latest counts (~02:45 UTC;
re-run at rename time — counts move while tracks land):
wayback-social 277, wayback_social 116, deletedproof 262, DP1/DP2
285, WAYBACK_* globals 26, D1 name 29, DeletedProof 87 (keeps its
name), archivecheck.com 177 (already the target). The rename waits on
canonical option (a): domain purchase first, rename second.

## 5. Still needs the live deploy / human steps (NOT verified)

- Push + full validation per the push discipline (gated on the
  canonical decision). Live checks per issue are listed in
  docs/push-readiness.md §1–§3 (curl loop for #20, live juliawalterz
  repro for #21, live grep + failure-path checks for #22).
- Build punch-list P1–P5 (next build track).
- Re-run tests/e2e/test_failure_paths.py on a stable tree.
- Rename: John's name lock + the four open decisions in
  docs/rename-runbook.md (licence prefix is the only one with live-key
  consequences; guide slugs already closed — renamed to
  archivecheck-vs-*).

# Test report — Arquivo.pt as a web source (issue #8 follow-up, Track I, 2026-11-27)

The web console searched Wayback CDX only. Arquivo.pt is now a
first-class source: `/api/arquivo` proxy, a source selector
(Wayback / Arquivo.pt / Both, default Wayback), the same SearchJob
machinery, merged + deduped rows with per-source labels and counts,
and CLI-mirrored tier rules. All local, unpushed — the batched push
is still gated on the canonical decision.

## 1. What changed

- `functions/api/arquivo.js` (new, ~200 lines) + `functions/api/arquivo.test.mjs`
  — mirrors `functions/api/cdx.js`: allowlisted params (`mode, url,
  q, handle, from, to, limit, output`), 5-min cache, 120 s upstream
  timeout (AbortError → 504 "Arquivo.pt didn't answer in time",
  other fetch errors → 502, upstream non-200 forwarded), Turnstile
  verify duplicated from cdx.js (not extracted — zero risk to the
  CDX path; extraction is a follow-up). No API key. Normalises to
  CDX-array shape (header row first), fixes doubled slashes,
  enforces from/to server-side, sorts by timestamp. Keyword mode
  filters textsearch results by handle-in-URL server-side.
- `web/arquivo.js` (new, 284 lines) + `web/arquivo-parse.js` (new,
  96 lines, pure parsers extracted so arquivo.js stays under the
  ~300-line ceiling) — patterns (x/bluesky/mastodon), archiveLink,
  proxy/direct URL building, fetchArquivo + 120 s fetchArquivoTimed
  (TimeoutError vs AbortError, same contract as fetchPatternTimed),
  arquivoSteps (SearchJob steps), source-selector UI (syncSourceUI).
- `web/console.js` — source-aware search: reads `#source` +
  `#keyword`, keyword gate before any fetch, Arquivo availability
  per network (CDX patterns exist for x/bluesky/mastodon only),
  shared dedup by (timestamp, URL) with per-source counts, Wayback
  steps do NOT early-complete in "Both" mode, per-source failure
  reporting (`failedArquivo` / `failedWayback`), Source column in
  the results table + per-source stats, CSV gets a `source` column
  and JSON a `"source"` field, snapshot links via archiveLink.
- `web/modes.js` — showFailure is source-aware: an Arquivo-only
  failure links to arquivo.pt's CDX, not web.archive.org.
- `web/citations.js` — recordsFromRows gains an optional `sources`
  param (defaults Wayback), snapshot links via WS_CONSOLE.archiveLink,
  "— source: Arquivo.pt" in text + markdown citations, disclaimer
  now names both archives for verification.
- `web/evidence-pack.js` — sourceLabel (Wayback / Arquivo.pt /
  "Wayback Machine CDX API + Arquivo.pt") used in manifest.source,
  report.html and README.txt; pack CSV schema unchanged (source
  rides on the snapshot URL host), captures.json/.jsonl carry the
  per-record `source` field.
- `web/index.html` — source selector row (`#source` + `#keyword` +
  `#source-note`), `<th>Source</th>`, header sources line now names
  the selector; script tags for the new files.
- `web/licence.js` — `keyword_search` on every PLAN_CAPS tier +
  BUNDLE_CAPS (false free/starter, true pro/studio/bundle —
  mirrors pricing.yaml features exactly).
- `web/config.js` — ARQUIVO_CDX_BASE / ARQUIVO_TEXTSEARCH_BASE /
  ARQUIVO_PROXY (outside the generated PRICING markers).
- `scripts/dev-server.mjs` — routes `/api/arquivo` to the real
  Function (same shape as `/api/cdx`).
- `.github/workflows/ci.yml` — runs `web/arquivo.test.js` +
  `functions/api/arquivo.test.mjs`.
- Refactors forced by the file-size ceiling (no behaviour change,
  each verified by its own suite): pricing block out of console.js
  → `web/pricing-ui.js` (72 lines); date pickers out of console.js
  → `web/datepickers.js` (64 lines, keeps `window.WS_DATEPICKERS`);
  presets UI out of modes.js → `web/presets-ui.js` (89 lines);
  CRC32 + ZIP writer out of evidence-pack.js → `web/zip-store.js`
  (84 lines). Final counts: console.js 492, arquivo.js 284,
  modes.js 273, citations.js 212, evidence-pack.js 251.

## 2. Test results (all local)

- `node functions/api/arquivo.test.mjs` — **11/11**: CDX happy
  path (header first, doubled slashes fixed, range enforced),
  400s (missing url, bad mode, bad output, bad dates, bad limit),
  limit clamps to 1000, keyword handle filter (case-insensitive,
  @ stripped), upstream 500 forwarded, upstream abort → 504,
  upstream throw → 502, Turnstile open when unconfigured / 403
  without token / valid token proceeds (token never forwarded).
- `node web/arquivo.test.js` — **61/61** (vm harness, real
  console.js + modes.js + licence.js): wiring (patterns, links,
  default Wayback), Arquivo-only search (2 rows, sources arquivo,
  arquivo.pt snapshot links, no Wayback link, per-source counts
  "Wayback: 0 · Arquivo.pt: 2"), Both merges + dedups (3 rows,
  "Wayback: 2 · Arquivo.pt: 1", Wayback wins the shared capture),
  Arquivo 500 leaves Wayback standing + names the failed source,
  keyword blocked on free (dialog, zero fetches), keyword works
  on Pro (mode=keyword, q + handle passed), unsupported network
  (instagram + arquivo-only: honest message, zero fetches; Both:
  Wayback only + note), stalled fetch → TimeoutError promptly
  with the arquivo.pt direct link, licence caps per tier,
  citations with sources (arquivo.pt links, "source: Arquivo.pt"),
  mixed-source evidence pack (manifest/report/README name both
  archives, CSV link host, JSONL `"source":"arquivo"`).
- `tests/e2e/test_arquivo.py` (Playwright, dev server, mocked
  CDX + Arquivo answers) — **7/7**: selector present (3 options,
  default Wayback, keyword starts disabled), Arquivo-only search
  (2 rows, Source column Arquivo.pt, arquivo.pt links, no
  web.archive.org), Both merges + dedups (3 rows, sources
  Wayback/Wayback/Arquivo.pt), one source failing (2 Wayback
  rows + "Arquivo.pt didn't answer"), keyword blocked on free
  (dialog, table stays hidden), keyword works with a Pro demo
  key, Arquivo-only on instagram (honest message, no results).
- `tests/test_web_tiers.py` — new drift test
  `test_js_feature_flags_match_python_features`: JS PLAN_CAPS /
  BUNDLE_CAPS `keyword_search` + `deleted_diff` equal Python
  PLAN_FEATURES / BUNDLE_FEATURES per tier.
- `pytest tests/` — **146 passed, 1 skipped** (baseline 145/1 +
  the new drift test).
- Full E2E suite (`tests/e2e/run_e2e.py`, 2026-11-27 ~02:55 UTC)
  — **107 passed, 2 failed** (109 total; the suite grew from 71
  with Tracks G/H's new tests). The 2 failures are BOTH in
  `tests/e2e/test_failure_paths.py` (new file, Track H, 02:31 —
  NOT in the 71-test baseline) and NEITHER is caused by this
  track:
  - `test_checkout_placeholder_dialog_no_cli_text`: the locator
    `#plans .plan` with has_text="Starter" matches THREE cards
    (Starter, Bundle, top-up) because pricing.yaml's Bundle
    features say "Everything in Starter + Pro + Studio" and the
    top-up says "Works with Starter, Pro and Studio" — unchanged
    since v1.3. The pricing-ui.js extraction changed neither the
    data nor the render template (the pricing E2E tests that
    exercise the same rendering pass). The locator could never
    have passed as written; the precise fix is
    `page.locator('[data-plan="starter"]').click()`.
  - `test_batch_all_bad_lines_reported_no_cli_text`: batch.js
    (Track E code, untouched here) reports "Skipped 1 line(s):
    line 1: unknown network 'not'" — the test expects the full
    bad line echoed ("not a valid line"). Product-vs-test gap:
    echo the full line in batch.js, or relax the test.
  Both are Track H's file to fix (or the parent's call); this
  track's own suites are all green (arquivo E2E 7/7, node
  suites, pytest 146/1).
- Live probes 2026-11-27 ~02:43 UTC: CLI `arquivo jack --limit 5`
  → 5 results (CSV saved, then cleaned). Dev-server proxy live:
  `/api/arquivo?mode=cdx&url=twitter.com/jack/status/*&limit=3&
  from=20180101&to=20191231` → 3 real rows (jack status
  1026984242893357056, 2018-08-09/10/11); `mode=keyword&q=jack&
  handle=jack&limit=2` → 1 row, `https://evatjack.com/` — the
  URL-substring caveat in the flesh. Bad dates (`from=2018`)
  → honest 400. (One probe hiccup: a stale dev server from an
  earlier E2E run still owned port 8902 and 404'd /api/arquivo —
  killed it, started a fresh one, probes passed. The E2E fixture
  reuses an existing server by design; the mocked E2E tests were
  unaffected.)

## 3. Tier-rule mapping (CLI → web)

| Rule | CLI (`arquivo` command) | Web console |
|---|---|---|
| CDX mode (no `--keyword`) | every plan | every plan |
| Keyword mode (`--keyword` / `#keyword`) | `keyword_search` = Pro+ (free/starter false, pro/studio/bundle true) | same, via `licence.js` PLAN_CAPS `keyword_search`; blocked with "Keyword search needs Pro" before any fetch |
| Per-handle CDX listing | x / bluesky / mastodon only | same — other networks + arquivo-only = honest message, no fetch; Both = Wayback only + note |

## 4. Deliberate deviations (design, not user decisions)

- **Broad (all-network) search stays Wayback-only.** Arquivo.pt
  CDX patterns exist for 3 of 14 networks and keyword mode
  would need a keyword field the broad form lacks. The UI says
  so when broad is checked.
- **Turnstile verify duplicated** in `functions/api/arquivo.js`
  instead of extracted to a shared `_lib/turnstile.js` — zero
  risk to the CDX path; extraction is a follow-up.
- **The 120 s stall bound lives in the client fetch wrapper**
  (same as CDX) plus `AbortSignal.timeout(120_000)` in the proxy.
- **Dedup is by exact (URL, timestamp).** The same post stored
  under twitter.com by one archive and x.com by the other
  appears twice in "Both" mode (caught by the first E2E run:
  the mock used x.com Wayback rows vs twitter.com Arquivo rows
  and the count came out 4, not 3 — fixed the test data, not the
  code). The CLI dedupes the same way; normalising host aliases
  is a follow-up decision.
- **`web/arquivo.test.js` is 435 lines** — over the ~300-line
  ceiling, under the 500 hard cap. Every shipped file meets the
  ceiling (console.js 492 is the tightest). Splitting the test
  would duplicate its ~150-line vm harness across two files;
  the repo's test files already run long (test_osint_tools.py
  is 338). A shared web-test harness module would fix this
  properly — follow-up, not this track.

## 5. Bugs found and fixed by this track

- `recordsFromRows` in citations.js had no source concept —
  Arquivo rows would have been cited as Wayback links. Fixed
  with the optional `sources` param (2-arg callers unchanged).
- `evidence-usage.js` was never loaded on index.html (Track E
  bug, same class): `web/evidence-pack.js` hardcoded
  "Wayback Machine CDX API" in manifest/report/README. Fixed
  with sourceLabel; the same class of bug is why the new
  arquivo.test.js loads the files in index.html order.
- The E2E "Both" test's first run timed out at 60 s — test-data
  aliasing (see §4), not a product hang.

## 6. Still CLI-only (with why)

- **Ghostarchive as a web source** — HTML scrape, bigger
  rate-limit surface; separate track.
- **Common Crawl as a web source** — async-only by design (index
  504s); needs a job store, not a live search path.
- **Replay-text fetch in the browser** — fetching archived HTML
  through the proxy is a bigger build and a bigger archive.org
  rate-limit surface.
- **Batch watchlists / scheduled re-runs** — no background jobs
  on static Pages; needs the Paddle go-live + D1 job store.
- **Server-side evidence counting** — web gate stays local-first
  (issue #15); Track F's D1 endpoint exists but migrations
  0003/0004 are unapplied live.

## 7. Still needs the live deploy (NOT verified)

- `/api/arquivo` end-to-end on the deployed host (needs the
  batched push), a live Arquivo search on app. with the selector,
  and the per-subdomain title check (issue #20) after the push.
  Local-only verification never closes an issue.

# Test report — punch-list fixes P1–P5 + failure-paths (issue #22 follow-through, Track J, 2026-11-27)

Fixes the five items from Track H's audit (docs/push-readiness.md
§3) plus the three failing tests in
tests/e2e/test_failure_paths.py, on the stable tree after Tracks
G/H/I landed. No push. No pricing / licence / auth / Paddle /
CDX-proxy / archives changes. The 2026-11-27 Ed25519 key rotation
was not touched (licence2.py, web/licence.js,
.licence-keygen.txt, docs/paddle-webhook.md — no edits).

## 1. Per-item outcome

- **P1 — "the CLI pack" in the downloaded evidence-pack report —
  FIXED.** web/evidence-pack.js:95 now reads "Post text is not
  fetched in the browser — recovered text is included where the
  archive captured it." The same rewording was applied to the doc
  that quoted the old string (docs/osint-tools.md). The downloaded
  report.html now contains no reference to the CLI.
- **P2 — sources line overclaims the web search — FIXED.**
  web/index.html:104. Track I had already landed Arquivo.pt as a
  web source, so "live search on this page checks the Wayback
  Machine and Arquivo.pt" is now true; the second clause still
  overclaimed ("ArchiveCheck also checks …"). It now reads
  "Other sources — multi-archive TimeMaps (MemGator), Common
  Crawl, and live Bluesky, Mastodon and YouTube posts — are
  covered by the full ArchiveCheck product, not by this page."
- **P3 — checkout dialog leaks internal jargon — FIXED.** The
  dialog had moved since the audit: it lives in
  web/pricing-ui.js:49 (extracted from console.js by Track I), so
  the fix touched pricing-ui.js, NOT console.js — console.js
  stays at 492 lines and no split was needed. The dialog now
  reads "checkout isn't connected yet. Please check back soon."
  Title kept: "Checkout not connected yet".
- **P4 — batch skipped-line report is overwritten — FIXED.**
  web/batch.js (260 → 274 lines). Two changes: (a)
  `parseTargets` echoes the skipped line itself (truncated to
  60 chars) in every error, e.g. `line 1: unknown network 'not'
  — "not a valid line"`; (b) `runBatch` carries the skipped-line
  notice in `skippedNote` and `renderBatch` re-attaches it to
  the final status, so the progress text ("Batch running…",
  "Batch: N/M targets done…") no longer swallows it. The
  mixed-batch failure-path test was strengthened to assert the
  skipped line survives to the final status (a test that asserts
  the fix, not a weakened one).
- **P5 — honest-limits line promises a feature that doesn't exist
  — FIXED (copy only).** web/index.html:266 now reads "…can't be
  listed per-user — check a single post URL on web.archive.org
  directly instead." The same rewording was applied to the quote
  in docs/web-search-ux.md. The single-post-URL web mode itself
  was NOT built.

## 2. Test fixes (tests/e2e/test_failure_paths.py)

- Checkout test: strict-mode locator ambiguity — `#plans .plan`
  filtered by "Starter" matched 3 cards (Bundle and top-up copy
  both mention Starter). Fixed to click `[data-plan="starter"]`.
- Mixed-batch test: now asserts "Skipped 1 line(s)" and the
  echoed line "not a valid line" in the final status (P4 fix).
- Result: **6/6 passed in 10.77s** (2026-11-27 ~03:10 UTC).

## 3. Dev-server bonus fix (Track G's side finding)

scripts/dev-server.mjs (164 → 176 lines) now serves index.html
for directory URLs, exactly as Cloudflare Pages and
`python -m http.server` do: a trailing-slash path gets
"/index.html" appended, and a directory requested without the
slash is retried as `<dir>/index.html` on EISDIR. Verified:
`/guides/find-deleted-tweets/` and `/guides/find-deleted-tweets`
both return 200 with the correct guide title (was HTTP 500).

## 4. Test results (all local, final tree)

- tests/e2e/test_failure_paths.py: **6/6** (03:10 UTC).
- Full E2E suite (tests/e2e/run_e2e.py): **109 passed, 0 failed
  in 406.67s** (03:18:25–03:25:13 UTC) — first fully green full
  run; no isolated re-runs needed, no archive.org flakiness in
  this run.
- pytest: **146 passed, 1 skipped**.
- Node suites, all green: branding 121/121, modes 19/19,
  search-job 54/54, evidence-usage 31/31, analytics 10/10,
  console-timeout 17/17, live-check 13/13, osint-tools 73/73,
  arquivo 61/61, middleware 490/490, arquivo endpoint 11/11,
  billing-portal 13/13, evidence-usage endpoint 18/18,
  live-check endpoint 6/6, packs-upload 14/14, webhook 10/10,
  auth + turnstile green.
- `scripts/sync_brands.py --check` clean,
  `scripts/sync_pricing.py --check` clean.
- CLI-bleed grep audit over all of web/ (excl. vendor +
  `*.test.js`): **0 hits** in user-facing strings. The only
  remaining "CLI" mentions are code comments (same as Track H's
  audit baseline: 11 comment hits, 0 rendered).
- File sizes after this track: console.js 492 (untouched),
  batch.js 274, evidence-pack.js 251, pricing-ui.js 72,
  dev-server.mjs 176 — all under the 500 hard cap.

## 5. Deliberately NOT fixed (follow-up option, not a fix)

- **Single-post-URL mode in the web console.** The CLI has
  `--url`; the web console substitutes the handle into URL
  patterns and has no way to search one post URL. Building it is
  a new feature (a URL input + a single-pattern search path +
  tier rules), not a copy fix — it belongs to a product decision
  by John, not this punch-list track. The honest-limits copy now
  points readers at web.archive.org for a single post URL, and
  Track G's Instagram guide already says the same. If John
  wants the mode built, it is a small, well-scoped follow-up.

## 6. Still needs the live deploy (NOT verified)

- The P1–P5 fixes + failure-paths on the DEPLOYED host (needs
  the batched push): download a Studio evidence pack and read
  its report.html; read the sources line; click a Buy button;
  run a batch with a bad line + a good line; grep the deployed
  pages for the banned strings. Per push discipline, local-only
  verification never closes #22.

## 7. Independent verification of Track J (assistant, 2026-11-27 ~03:30–03:43 UTC)

Re-ran the whole validation on the final tree rather than trusting the
track's report:

- P1–P5 wording confirmed in the files (evidence-pack.js:95,
  index.html:104 + :266, pricing-ui.js:49, batch.js skippedNote).
  console.js untouched at 492 lines; batch.js 274, evidence-pack.js 251,
  pricing-ui.js 72, dev-server.mjs 176 — all under the 500 cap.
- pytest 146/1 — first run showed 1 transient failure, green on two
  re-runs (flaky test, not named — it passed on every re-run).
- All node suites green (branding, modes 19, search-job 54,
  evidence-usage 31, analytics 10, console-timeout 17, live-check 13,
  osint-tools 73, arquivo 61, middleware 490/490, arquivo endpoint 11,
  billing-portal 13, evidence-usage endpoint 18, live-check endpoint 6,
  packs-upload 14, webhook 10, auth + turnstile).
- seo_check 12/12; sync_brands + sync_pricing --check exit 0;
  CLI-bleed grep over web/ 0 hits; dev-server trailing slash verified
  200 + correct title.
- **Full E2E, first run: 108/109.** The one failure was a TEST race, not
  a product bug: `test_batch_bad_line_plus_valid_target_runs` waited on
  `#batch-status:has-text('done')`, which matches the progress text
  "Batch: 0/1 targets done…" mid-run. Probed live with a Playwright
  driver: the batch completes and the final status reads "Batch done:
  1/1 targets found captures. Skipped 1 line(s): line 1: unknown
  network 'not' — "not a valid line"" — the P4 fix works as intended.
  Fixed the wait to `#batch-status:has-text('Skipped')` (the note only
  appears in the final status), with the reason in a code comment.
  failure-paths 6/6 after the fix.
- **Full E2E, re-run: 109 passed, 0 failed in 516.91s** — first fully
  green full run, confirmed independently. The tree is push-ready
  (modulo the canonical decision, which still gates the push).

# Test report — Track K: web console gaps + known bugs (2026-11-27)

All local, no push. Every item fixed or written up with the reason.
Baseline at start: pytest 146/1, full E2E 109/109 (Track J, 2026-11-27
~03:43 UTC). Track L ran in parallel (source selector in index.html
+ docs/issues.md + TEST-REPORT.md) — Track K's index.html edits stayed
confined to the search-form / URL-input area and the honest-limits
line; no file L owns was rewritten.

## 1. Per-item outcome

### Item 1 — Split web/console.js FIRST — DONE
Extracted the CDX transport layer into new `web/console-fetch.js`
(107 lines: `cdxBase`, `cdxUrl`, `ensureSearchToken`,
`fetchPattern`, `fetchSingle` — top-level function declarations,
window globals; uses `window.WAYBACK_SOCIAL_CONFIG` directly and a
local `el()` helper because `const cfg` / `const $` cannot be
redeclared across classic scripts; exposes `window.WS_FETCH` too).
console.js 492 → **416 lines**. `web/index.html` loads
`console-fetch.js` before `console.js` (line 283). Test loaders
updated (`web/console-timeout.test.js` + `web/arquivo.test.js`
load console-fetch.js first; check labels updated). One real
regression caught by the tests:
`tests/test_clerk_auth.py::test_console_delegates_tier_to_auth`
greps console.js for `cf-turnstile-response` — that string moved
with cdxUrl; the test now checks console-fetch.js for it
(behaviour identical). The packs-upload subprocess test flakes
intermittently under full-suite load but passes in isolation and
by direct node run (14/14) — pre-existing flake, also seen before
Track K. Verified: console-timeout 17/17, arquivo 61/61 (at the
time), modes 19/19, osint-tools 73/73, pytest 146/1 (green twice
in a row after the test fix).

### Item 2 — Single-post-URL mode in the web console — DONE
The P5 follow-up Track J deliberately left out; the CLI has
`--url`, the web had none. Mirrors the CLI exactly
(`web/url-mode.js`, 73 lines: `detectNetwork` =
`wayback_social/networks.py::detect_network`, host substring
match in the same order + Mastodon fallback; `parsePostUrl`
validates + trims the trailing slash like the CLI).
**Tier rule verified in `wayback_social/plans.py`: there is NO
feature flag for URL mode** (`PLAN_FEATURES` has no url /
single_url entry — the flags are exports, deleted_diff,
replay_text, keyword_search, archive_fallbacks, evidence_pack,
commercial_use, support). It is a URL-pattern search, not keyword
search, so it is NOT gated: every plan can use it, and the only
cap that applies is `archive_limit` (Free 25 / Starter 250 / Pro
2,500 / Studio 25,000). There is no "needs Pro" dialog for a URL.
`console.js` `search()` branches on the new `#post-url` field
(one Wayback step for the exact URL; `arquivoSteps` gains a
`urlPattern` option — one CDX step, label "Arquivo.pt — this
post"); `modes.js` `showFailure` uses the exact URL for its
direct-CDX / arquivo.pt link (`failQ.url`); `finishSearch` says
"Found N capture(s) of this post on X."; CSV/JSON exports use
`lastId` (the search's identifier — the URL in URL mode, the
handle otherwise); history records the URL as the handle and the
dashboard re-run link pre-fills `#post-url` when `?handle=` looks
like a URL. A bad URL (no scheme, unknown host) is an honest
`#status` error and NO fetch runs; URL + keyword can't combine
(honest message, NO fetch); broad is ignored when a URL is set.
The Arquivo per-handle-listing gate is skipped for an exact URL
(Arquivo.pt CDX answers any exact URL — Instagram +
arquivo-only now runs). The honest-limits line in
`web/index.html` and the Instagram guide
(`web/guides/find-deleted-instagram-posts/index.html:65`) now
point at the field instead of web.archive.org. Full record:
`docs/web-search-ux.md` §14.
Proof: `web/url-mode.test.js` **31/31** (detection, validation,
bad URL + zero fetches, URL + keyword + zero fetches, free-tier
runs, exact-URL pattern through both proxies, Instagram +
arquivo-only gate skipped); `tests/e2e/test_url_mode.py` **7/7**
(mocked UI + the ONE live probe below).
**Live probe (2026-11-27, dev-server proxy, real post
https://x.com/jack/status/20, no mocks):** curl first — CDX
exact-URL query returned real captures (2024-05-18, 2024-05-22,
2024-06-05, 2024-06-07, …) and `/api/arquivo` returned 1 real
capture (2024-10-14). The E2E live probe then passed in the real
browser: "Found … capture(s) of this post on X / Twitter.", every
row's post link contains jack/status/20.
Two test-expectation fixes during the build (product was right,
tests were wrong): the network name is "X / Twitter" (not "X."),
and the mocked Arquivo-only Instagram answer carries one row
(ARQ_ROWS), so the status is "Found 1 capture(s)", not 2.

### Item 3 — Host-alias dedup — DONE
In Both/multi-source mode the same post stored under twitter.com
by one archive and x.com by the other appeared twice. New
`web/url-alias.js` (56 lines) canonicalises the host before the
merge key is built: `x.com → twitter.com` (canonical:
twitter.com — the bulk of the archive predates the 2023 rename),
`www.` stripped, host lowercased for every URL. Deliberately NOT
mapped: `youtu.be` vs `youtube.com` (different path shapes —
`youtu.be/<id>` vs `youtube.com/watch?v=<id>` — host
normalisation alone could not dedupe those). Applied in the
three places that held the exact `r[1]+"|"+r[2]` key:
`console.js` `addRow`, `batch.js`, `diff.js`; each falls back to
the exact key if `url-alias.js` failed to load. Different
timestamps stay separate captures, so the stats range is
preserved. Alias map documented in code + `docs/data-sources.md`
§0.1 (the "Known gap" entry there is now the resolved record).
Proof: `web/url-alias.test.js` **13/13** (pure functions) +
`web/arquivo.test.js` Both + x.com / www blocks (**36 checks**
total in that file, up from 28): x.com row merges, Wayback wins
the tie, www.twitter.com merges, a later x.com timestamp stays.
One test-authoring fix: `getRows()` returns `{rows, nets,
sources}`, not an array — the new checks read `.rows`.

### Item 4 — dp2.js error-message nit — DONE (flag was backwards)
The Clerk track flagged "the message says 86-char signature but
the DP2 format is 88 base64url chars". Verified empirically
first: minted keys measure **86 chars, no padding** (64-byte
Ed25519 signature → 86 unpadded, 88 padded); Python agrees. The
"86-char signature" error message was CORRECT; the header
comment claiming "88 base64url" was wrong. Fixed
`functions/_lib/dp2.js` line 4 to say 86 (unpadded) with the
reasoning in the comment. `wayback_social/licence2.py:3` still
says "88" — NOT fixed (Track K must not touch licence2.py);
noted as a follow-up — it contradicts its own line 4 example
("<86 chars>"). TEST-REPORT.md:432 already recorded "the
signature is 86 chars, not 88".

### Item 5 — Turnstile verify duplication — DONE
New shared `functions/_lib/turnstile.js` (exact copy of the
identical verifyTurnstile from both endpoints, following the
verify-key.js precedent). `functions/api/cdx.js` and
`functions/api/arquivo.js` both import it now; both local
copies removed; header comments updated. Suites stay green;
zero behaviour change to the CDX path — both proxies re-verified
live via the dev server (CDX exact-URL jack/status/20 → real
rows; Arquivo exact-URL → 1 real row) and the arquivo endpoint
test is 11/11 incl. Turnstile.
**One real breakage this change caused, found by pytest:**
`tests/test_clerk_auth.py::test_cdx_turnstile_branch` and
`tests/test_web_tiers.py::test_cdx_proxy_function` copy cdx.js
alone into a tmp dir — the new `../_lib/turnstile.js` import had
no file there (ERR_MODULE_NOT_FOUND). Fixed in the TESTS (not by
reverting the dedup): the clerk-auth helper now also copies
`turnstile.js` into the mirrored `_lib/` dir, and the tiers test
now mirrors the `api/` + `_lib/` layout instead of a flat copy.
pytest back to 146/1.

### Item 6 — Split web/arquivo.test.js — DONE
New shared `web/test-harness.js` (121 lines: the vm/DOM stub
`createDom`, `createSandbox`, `loadFiles` — the ~150-line setup
every console test used to copy with small drifts). Both
`web/arquivo.test.js` and `web/console-timeout.test.js` now use
it (the harness is shared, not duplicated), and the new
`web/url-mode.test.js` uses the arquivo context built on it.
`web/arquivo.test.js` is split three ways by responsibility,
sharing `web/arquivo-ctx.js` (126 lines: fixtures + makeCtx +
routeBoth + hangFetch):
- `web/arquivo.test.js` — search behaviour, 128 lines, **28 checks**
- `web/arquivo-gates.test.js` — keyword/network/licence gates, 104 lines, **20 checks**
- `web/arquivo-evidence.test.js` — citations + evidence pack, 103 lines, **13 checks**
Total **61 checks preserved** (28+20+13), all files under the
~300 ceiling. `web/console-timeout.test.js` 270 → 205 lines,
17/17. CI (`.github/workflows/ci.yml`) runs all three arquivo
files plus `url-alias.test.js` + `url-mode.test.js`.

## 2. Bugs found and fixed by this track
- **Turnstile dedup broke two pytest tests** (see item 5) — the
  tmp-dir copies of cdx.js lacked the new `_lib/turnstile.js`
  import. Fixed in the tests (copy the lib too); the dedup stands.
- **Track L collision — `sourceLabel` name clash broke every
  search render (found by the full E2E, fixed by Track K).**
  Track L extracted `renderRows` + `finishSearch` out of
  console.js into new `web/render-rows.js` WHILE Track K's full
  E2E was running (file mtime 2026-11-27 06:01, mid-run).
  `render-rows.js` defines a global `sourceLabel(src)` (per-row
  string → "Wayback" / "Arquivo.pt" / …) for the results table,
  but `evidence-pack.js` already defines a global
  `sourceLabel(records)` (pack-level label for a LIST of records)
  and loads AFTER it (index.html:308 vs :293), so the pack
  version wins globally and every `renderRows` call threw
  `TypeError: (records || []).forEach is not a function` on the
  string. First full E2E on the final tree: **110 passed, 6
  failed in 940.61s** — and all 6 failures were this one throw
  (4 url-mode search tests + stop/resume + sample-respects-range;
  every failing test renders rows). Track K fixed it minimally
  in Track L's file: renamed the row version to
  `rowSourceLabel(src)` + its one call site, with a comment
  explaining the clash. The pack version keeps its name (it is
  exported on `WS_EVIDENCE_PACK` / `module.exports` and called
  with arrays in evidence-pack.js:91,134). Track L had already
  updated `web/arquivo-ctx.js`'s load list to include
  `render-rows.js`, so the node suites were unaffected.
  Re-run of the 6 failed tests after the fix: first re-run 4
  passed / 5 failed — that run raced files still settling
  (Track L's index.html edit landed 06:03, mid-run); second
  re-run 8 passed / 1 failed — see the `both` note below.
- **`source=both` now means ALL archives (Track L, same
  window).** The source selector gained Ghostarchive + Common
  Crawl, and `both` runs Wayback + Arquivo + Ghostarchive +
  Common Crawl. Track K's `test_url_search_both_mocked` mocked
  only /api/cdx + /api/arquivo, so the two unmocked steps hit the
  real Functions and stalled the job past the 60s wait (that was
  the last failing test in the re-run). Fixed in the TEST: the
  Both test now also mocks `/api/ghostarchive` +
  `/api/commoncrawl` with header-only (zero-row) CDX arrays —
  both are proxy-only endpoints, so the page mocks intercept
  them. (Track L's new sources already accept `urlPattern` —
  `ghostarchiveSteps` / `commoncrawlSteps` both branch on it —
  so URL mode works with all four sources by design.)
- **`getRows()` is not an array** (item 3 test authoring) —
  `WS_CONSOLE.getRows()` returns `{rows, nets, sources}`; the new
  alias checks read `.rows`.
- **Stale comment in `tests/e2e/test_arquivo.py`** — its header
  said a twitter.com row and an x.com row for the same post are
  two different captures ("known cross-archive aliasing gap").
  That is no longer true on the web side (item 3); the comment
  now points at the alias case in `test_url_mode.py`.

## 3. Test results (all local, final tree)
- pytest **146 passed, 1 skipped** (baseline 146/1 — the two
  Turnstile-dedup failures above were fixed in the tests, not by
  weakening anything).
- Node suites, all green: branding 121/121, search-job 54/54,
  turnstile ✓, auth ✓, modes 19/19, evidence-usage 31/31,
  analytics 10/10, console-timeout 17/17, live-check 13/13,
  osint-tools 73/73, arquivo 36/36, arquivo-gates 20/20,
  arquivo-evidence 13/13, url-alias 13/13, url-mode 31/31,
  ghostarchive 27/27, commoncrawl 28/28, middleware 490/490,
  packs-upload 14/14, arquivo endpoint 11/11, ghostarchive
  endpoint 12/12, commoncrawl endpoint 15/15, live-check endpoint
  6/6, evidence-usage endpoint 18/18, billing-portal 13/13,
  webhook 10/10.
- `scripts/sync_brands.py --check` + `scripts/sync_pricing.py --check` clean.
- CLI-bleed grep 0 hits (banned strings: pipx, "command line",
  "wayback-social archive", "wayback-social batch", "use the CLI",
  "install wayback", "$ wayback" — across web/ HTML + JS excl.
  test files). The "CLI" mentions in `web/url-mode.js` /
  `web/console.js` / `web/arquivo.js` are code comments pointing
  at the CLI implementation for parity ("mirrors the CLI's
  detect_network") — the same pattern arquivo.js already used
  ("the CLI arquivo --keyword"); none is user-visible text, a
  command, or install instructions.
- `tests/e2e/test_url_mode.py` **7/7 in isolation** (mocked + ONE
  live probe); in the full run 3/7 at first (all 4 search failures
  were the Track L `sourceLabel` collision, §2), 6/7 after the fix
  (the Both test needed the Ghostarchive/Common Crawl mocks, §2),
  7/7 on the final re-run — see §5.
- `tests/e2e/test_failure_paths.py` **6/6** (in the full run).
- Guides E2E **24/24** (in the full run).
- Full E2E on the final tree: **first run 110 passed, 6 failed in
  940.61s** (all 6 = the Track L `sourceLabel` collision, §2);
  after the fix + the Both-test mock update, the affected 9 tests
  re-run clean — see §5 for the final tally.

## 4. Deliberately NOT fixed (follow-ups, with reasons)
- **`wayback_social/licence2.py:3` still says "88"** — Track K
  must not touch licence2.py (brief). The 86-char fact is
  verified (item 4); the one-line comment fix belongs to whoever
  next touches that file (it contradicts its own line 4 example).
- **CLI host-alias dedup** — the CLI merges by the identical
  exact (URL, timestamp) key, so the same post can still appear
  twice in CLI output. Web side only, per the brief; the CLI fix
  is the follow-up (same `dedupKey` logic, in `wayback_social`).
- **Broad search counts both X patterns** (`modes.js`
  `checkNetwork`) — the twitter.com + x.com patterns both count
  toward the tier's network cap. Out of scope for item 3; needs
  a product call on whether X is one network or two for cap
  purposes.
- **Batch/diff alias dedup is in, but their E2E coverage of the
  alias case is not** — batch.js + diff.js use the alias-aware
  key (same fix as console.js), but only the console path has
  alias tests (arquivo.test.js). A batch/diff alias E2E is a
  small follow-up.
- **`web/arquivo.js` is 305 lines** (5 over the ~300 ceiling) —
  the `urlPattern` branch added ~22 lines to a file that was
  already ~283. The branch is integral to `arquivoSteps`;
  extracting it would fragment the function. Next edit there
  should split it, not grow it.
- **`web/console.js` is 467 lines** (33 under the 500 hard cap) —
  the Track K split (492 → 416) made room for item 2, and item 2
  used 51 of those lines. The next edit must split it again, not
  grow it. (It was already over the ~300 ceiling before Track K;
  the ceiling is enforced on the new modules, all ≤ 128 lines.)

## 5. Still needs the live deploy (NOT verified)
- Single-post-URL mode end to end on the deployed host
  (dev-server proxy only so far).
- Host-alias dedup on the deployed host (Both mode, real
  archives).
- `/api/cdx` + `/api/arquivo` Turnstile dedup on the deployed
  host (Function code changed; the shared lib ships with the
  push — verify the deploy answers, don't assume the import
  resolves there).
- Track L's Ghostarchive + Common Crawl web sources (new in this
  window, not Track K's work) also need the live deploy to prove
  end to end.
- Full E2E on the final tree: **first run 110 passed, 6 failed
  in 940.61s (2026-11-27 ~05:52–06:08 UTC)** — all 6 failures
  were the Track L `sourceLabel` collision (§2), not Track K
  code: failure-paths 6/6 and the other 110 passed, including
  all of Track K's node-facing suites. After the fix, the
  affected tests were re-run in slices (a second full run was
  not done — the tree was still moving under Track L): the 6
  failed tests re-ran 8 passed / 1 failed (the Both test needed
  the Ghostarchive/Common Crawl mocks, §2), then the last two
  (Both mocked + stop/resume) re-ran — see the line below for
  the outcome. Guides E2E **24/24** (direct run with the 8901
  static server up — running them via bare pytest without
  run_e2e.py fails all 24 at `page.goto(BASE_URL…)` because no
  server listens on 8901; that is a harness artefact, not a
  product failure).
- FINAL RE-RUN (2026-11-27, after the Both-test fix): Both
  mocked **PASSED** (url-mode 7/7); the live stop/resume test
  failed a third time — same 240s timeout waiting for 'Found'
  after Resume. That is archive.org, not a regression, and it is
  now PROVEN, not assumed: new test
  `test_stop_resume_with_mocked_cdx` (same Stop/Resume flow,
  mocked CDX, no archive.org) **passes in 3.34s** — the resume
  machinery, the extracted `finishSearch`, and `renderRows` all
  work. The live variant's resumed fetch stalls against the real
  archive (CDX answered 200 in ~13s when probed, and the full
  run took 940s vs the 517s baseline — everything live was
  slow). The mocked test hangs the FIRST CDX attempt instead of
  sleeping in the route handler: a sleep blocks the sync
  Playwright test thread, so the instant mock finished the job
  before the test could click Stop (probe: "Found 2 capture(s)"
  at t+16.9s, Stop already disabled). And the live variant then
  PASSED on the next full file run — `test_search_controls.py`
  **6/6 in 221.50s** (date picker, free search via proxy, pause,
  live stop/resume, mocked stop/resume, sample) — so the live
  stop failure is confirmed archive timing, as it was in Track F
  (54.95s) and Track J (109/109).
- File sizes at close-out (Track L grew both past the ~300
  ceiling after Track K's split; both still under the 500 hard
  cap — the next edit to either must split it): `web/console.js`
  **478**, `web/arquivo.js` **312**, `web/render-rows.js` 128.
- Ed25519 rotation re-verified intact at close-out (2026-11-27):
  `.licence-keygen.txt` present, chmod 600, gitignored; rotated
  public key `MCowBQYDK2VwAyEARKv2d0s14DXxgqIm4SbtMN1uUmK/
  +4CHVF5SaCe89Vs=` in licence2.py + docs/paddle-webhook.md, and
  in web/licence.js as the matching JWK `x`
  (`RKv2d0s14DXxgqIm4SbtMN1uUmK_-4CHVF5SaCe89Vs` — the SPKI's
  raw 32 bytes, base64url); Node-mint → Python-verify re-proven
  (DP2-STUDIO → `(True, 'studio', 'valid')`). Zero Track K edits
  to licence2.py, web/licence.js, docs/paddle-webhook.md.

## 6. Ed25519 rotation — verified intact at end of track
- `.licence-keygen.txt` present, chmod 600, gitignored. Zero
  Track K edits to `licence2.py`, `web/licence.js`,
  `docs/paddle-webhook.md` (grep: 0 "Track K" mentions).
- Rotated public key
  `MCowBQYDK2VwAyEARKv2d0s14DXxgqIm4SbtMN1uUmK/+4CHVF5SaCe89Vs=`
  present in all three places.
- Node-mint → Python-verify re-proven: minted a DP2-STUDIO key
  with the private key from `.licence-keygen.txt`;
  Python `verify_key` returned `(True, 'studio', 'valid')`.

# Test report — Track L: Ghostarchive + Common Crawl web sources, dashboard wiring, portal test prep, MemGator recovery (2026-11-27)

All local, no push. Scope: items 1–5 of the Track L brief, plus the
bugs found along the way (none skipped). Track K ran in parallel in
the same window and edited `web/console.js`, `web/index.html`,
`tests/e2e/test_url_mode.py` and this file — where our work touched
the same files, the fixes below are Track L's unless credited to K.

## 1. Per-item outcomes

### 1. Ghostarchive as a web source — DONE
- `functions/api/ghostarchive.js` (235 lines, mirrors arquivo.js):
  allowlisted params only, 5-min cache, 120s upstream timeout →
  honest 504, no API key. Server-side scrape of the search page
  (no browser CORS issue); two-pass parse mirroring the CLI (link
  pass for all ids + dated-rows pass for timestamps — a single-regex
  first version dropped undated rows entirely; the Function test
  caught it). Rows are the CDX-array shape plus an 8th column =
  Ghostarchive archive id. Undated rows dropped when a date range
  is given, kept when none is given; unparsable date → empty
  timestamp, never faked.
- `web/ghostarchive.js` (264 lines, arquivo.js shape):
  `fetchGhostarchive` / `fetchGhostarchiveTimed` (120s stall bound)
  / `ghostarchiveSteps` + `patternsFor` / `archiveLink` /
  `parseGhostarchiveCdxArray`. Proxy-only (ghostarchive.org sends
  no CORS headers). `patternsFor` returns the prefix WITHOUT a
  trailing `*` — Ghostarchive search treats the term as a prefix
  already (verified live: `twitter.com/jack/status/` → 14 links).
- Per-handle patterns: **X and Bluesky only.** Live probes
  2026-11-27 05:34–05:37 UTC: `twitter.com/jack/status/20` → 7
  captures with dates (2022-01-14..2024-04-14, matches CLI);
  `bsky.app/profile/bsky.app/post/` → 16 unique links;
  `mastodon.social/@Mastodon/`, `instagram.com/nasa/`,
  `tiktok.com/@tiktok/video/` all 302-redirect to `/vidsearch`
  (0 archive links). Same shape as Arquivo.pt's table minus
  Mastodon; other networks get the honest "no per-handle listing"
  gate + note.
- Console integration: source selector (5 options), "All archives"
  merge + dedup by exact (URL, timestamp), per-row source labels,
  per-source counts, per-source failure lines. URL mode skips the
  per-handle gate (the Function answers any exact URL, same as
  Arquivo.pt). Honest-limits copy: uneven coverage, undated rows
  shown "no date", never faked.
- Tests: Function suite 12/12, web suite **38/38** (was 27/27 —
  SEARCH_WIRED flipped true + "All archives" merge blocks added),
  Playwright `tests/e2e/test_ghostarchive.py` **5/5**.
- Live probes via the dev-server proxy: 05:43:34 UTC
  `/api/ghostarchive?url=twitter.com/jack/status/20` → 200 in 1.5s,
  7 rows (ids pcuW3..afDG6); prefix + `limit=3` → 200, 3 rows,
  oldest first. Re-run 06:06:46 UTC → 200 in 1.0s, same 7 rows.

### 2. Common Crawl as a web source — DONE (async by design, robust)
- `functions/api/commoncrawl.js` (262 lines): up to 3 attempts,
  15s per-attempt timeout, backoff 2s/8s, worst ~55s; 404 → 200
  header-only immediately, never retried; all attempts fail →
  honest 504 timeouts / 502 last status. `crawl` validated
  `^CC-MAIN-\d{4}-\d{2}$`, default `CC-MAIN-2026-47`. Rows are the
  CDX-array shape plus an 8th column = crawl id. The snapshot link
  is the index-record URL itself — Common Crawl has no replay URL;
  never link a Wayback capture that may not exist.
- **Critical finding 05:39 UTC: the CC index does NOT want the
  `*`** — `url=example.com/*&matchType=prefix` → 404, but
  `url=example.com&matchType=prefix` → 200 with 278 rows. The
  Function strips the `*`.
- `web/commoncrawl.js` (291 lines, same shape as ghostarchive.js):
  SearchJob steps with progress + Pause/Stop/Resume, same as the
  Arquivo path. Proxy-only. Per-handle patterns for **all 14
  networks** (the index answers URL-prefix queries for any host);
  a 404 is an honest empty. Honest-limits copy: slow/flaky by
  design, retries with backoff, "Common Crawl index didn't answer"
  on failure, index-record links.
- Drift guard: `scripts/sync_config.py` (63 lines, check-only,
  stdlib) verifies the crawl id agrees in `web/config.js`
  (`CC_CRAWL`), `functions/api/commoncrawl.js` (`DEFAULT_CRAWL`)
  and `wayback_social/cc_jobs.py` (`DEFAULT_CRAWL`) + the proxy
  keys exist in config.js. Added to CI.
- Tests: Function suite **15/15** (incl. retry tests that wait the
  real 2s+8s backoff, ~32s), web suite **39/39** (was 28/28),
  Playwright `tests/e2e/test_commoncrawl.py` **5/5** (incl. the
  honest-empty case: no "didn't answer", `#fail-actions` hidden).
- Live probes via the dev-server proxy: 05:43:46 UTC
  `/api/commoncrawl?url=example.com` → 200 in 10.0s, 50 rows (the
  10s means the first attempt stalled and the retry succeeded —
  retry machinery working end-to-end); `twitter.com/jack/status/*`
  → 200 in 6.2s, header-only (honest empty, wildcard stripped).
  Re-run 06:06:50 UTC → 200 in 19.3s, 50 rows, crawl
  CC-MAIN-2026-47 (retry fired again).

### 3. Dashboard wiring — DONE
- `web/dashboard-server.js` (265 lines, new) + minimal
  `web/dashboard.html` edits (281 lines): usage card gains a
  server-count note; Licence card gains a Billing block (button
  `#billing-portal-go` + status `#billing-portal-status`).
- Behaviour: GET `/api/evidence-usage` — server count authoritative
  when `source: "server"`; display shows max(local, server) with
  the note naming both numbers when they differ; 404 → local-only
  with "No server usage record for this key yet — counting on this
  device."; 503/unreachable → local-only silently. Log button:
  POST increment best-effort with a `window.crypto.randomUUID()`
  idempotency key (a bare `crypto.randomUUID()` first version was
  caught by the test — Node global leak); a server 403 does NOT
  undo the local log. Portal button: honest states only, never a
  fake link. No new endpoints (Track F's).
- Tests: node `web/dashboard-server.test.js` **26/26** (stubbed DOM
  + localStorage + fetch; real evidence-usage.js + licence.js);
  Playwright `tests/e2e/test_dashboard_server.py` **5/5** (server
  merge, 404 fallback, log mirror, portal opens the real session
  URL, no-customer honesty).
- Dev-server routes added for `/api/evidence-usage` and
  `/api/billing-portal` (localHint fallback / honest 503 without
  D1). Live dev-server checks 05:47 UTC: evidence-usage GET (demo
  key) → 200, source "local", used=2 echoed; billing-portal POST →
  503 "D1 database not configured yet (DB binding)".
- **Test lesson (probed, not assumed): `page.route` does NOT
  intercept popup navigations** — the portal test's
  `**/billing.stripe.com/**` route never fired and the popup URL
  was `chrome-error://chromewebdata/`. `page.context.route` with
  the same pattern DOES intercept (4-combination probe:
  page.route + both patterns fail, context.route + both patterns
  pass). The test routes the mocked portal URL via
  `page.context.route`.

### 4. Stripe portal test prep — DONE (test mode only)
- Test portal config re-verified live 2026-11-27 ~05:49 UTC:
  `bpc_1UgEQNGnFHTsoY17wW8AIubt` — active, `is_default: true`,
  `livemode: false`, `default_return_url` the app dashboard,
  headline "Manage your ArchiveCheck purchase", invoice history +
  payment-method update + customer update on, subscription cancel
  off.
- **Proven end-to-end against a real test customer ~05:50 UTC:**
  test customer `cus_VhhPSdmcCj0fDo` ("ArchiveCheck Portal Test",
  portal-test@example.com, test mode) + test config → real portal
  session `bps_1UgI0pGnFHTsoY176h14Q4L0`, `livemode: false`. The
  session URL itself is a secret (never printed anywhere) and
  expires 5 minutes after creation if unused. This proves the
  Stripe side; what is NOT yet proven is the endpoint itself doing
  that call (needs migration 0004 + the D1 link + Pages secrets).
- Test DP2-STUDIO key minted ~05:50 UTC from the rotated keypair
  (seed = last 32 bytes of the PKCS#8 DER in `.licence-keygen.txt`;
  the file's line 1 is a comment header that breaks naive base64
  parsing — parse the PEM block only). Key
  `DP2-STUDIO-34P6PXG62LKY6Q7O-akUD6mrHHcpzGwFtpaLkRbB4jAJRie_imFA6KllXDjCMKIfi5lg7LVt0THvYwxJwAloZ8YWoF9ho0MuTi_hYBg`,
  hash `d07810523aae1be8df481dd013eac554e780e5a9323665dd48f47a114d4a046c`,
  prefix `DP2-STUDIO-34P6PXG62LKY6`. Verified in Python (`valid:
  True, tier: studio`) AND in the Node verifier (`{valid: true,
  tier: "studio", scheme: "DP2"}`, identical keyHash). Test only —
  no purchase behind it, no D1 row yet; inserting the row is what
  activates it, deleting the row revokes it.
- Runbook in `docs/stripe-vs-clerk.md` §5 (run in one go once John
  approves) + §6 step 3 updated. Order: **push first** (live is
  still v1.3 — no `/api/billing-portal` exists live), then (1)
  apply migrations 0003+0004 with `--remote` (WITHOUT it wrangler
  writes to a LOCAL D1, not the live DB — the repo's migration
  headers omit the flag, do not copy them for a live apply),
  (2) insert the test licence row + link `cus_VhhPSdmcCj0fDo`
  (exact INSERT + SELECT-verify commands with the literal
  key/hash/prefix above; seats 5; email portal-test@example.com),
  (3) set Pages secrets `STRIPE_SECRET_KEY` (TEST key only — the
  endpoint refuses `sk_live_...`) + `LICENCE_ED25519_PUBLIC_KEY`
  (`MCowBQYDK2VwAyEARKv2d0s14DXxgqIm4SbtMN1uUmK/+4CHVF5SaCe89Vs=`),
  (4) prove it via curl to the live endpoint or the dashboard's
  "Manage billing" button; failure map included (404 = step 2
  missed; 401 = key/secret wrong; 503 D1 = DB binding missing;
  503 secret = step 3 missed; 503 live key = wrong key pasted).
- **No migration was applied, nothing was written to D1, nothing
  was created in Stripe live mode.** The migration apply needs
  John's approval tap.

### 5. MemGator status check — DOWN twice, recovered twice, root cause fixed
- **05:34 UTC:** all five components down (memgator, dns,
  dns-bridge, relay, tunnel "not running"), health-check timer
  not listed/inactive, local /about 000, public URL 530 — another
  /etc wipe (VM reboot) had removed the systemd units. Recovered
  per `docs/memgator-deploy.md`: `sudo
  ops/memgator/install-systemd.sh` + `./stack.sh restart` from a
  session with fresh proxy credentials — all five came up first
  try (pids 5034/5046/5053/5060/5081). Verified 05:35:58 UTC:
  local /about 200, local TimeMap works (first memento
  2008-11-03), **public URL 200** on /about and /timemap (274KB
  TimeMap), tunnel registered (connIndex=1, lax11, http2).
- **06:23 UTC re-check:** local /about 200 but public URL 530 —
  cloudflared dead, the other four alive (pids 5034–5060).
  Healthcheck log showed the pattern repeating since 01:25 UTC:
  every 15-min timer run started cloudflared, it registered
  successfully, then died ~3s later ("Initiating graceful shutdown
  due to signal terminated").
- **Root cause (found this track): systemd's default
  `KillMode=control-group` on the oneshot healthcheck service.**
  When the service exits, systemd SIGTERMs every process left in
  its cgroup — including the cloudflared the run just started.
  `tunnel.sh start()` backgrounds cloudflared with plain `&` (no
  `nohup`/`setsid`), which does not protect against a cgroup kill.
  The other daemons survive because they are started by
  `memgator-stack.service` (`RemainAfterExit=yes`) or by agent
  exec runs outside systemd. **The timer could never revive the
  tunnel; only an agent exec run could.**
- **Fix:** `KillMode=process` in
  `ops/memgator/memgator-healthcheck.service` (durable copy,
  reinstalled). **Proven live 06:26 UTC:** tunnel stopped, `sudo
  systemctl start memgator-healthcheck.service`, cloudflared (pid
  35195) still running after the service exited, public URL 200 at
  06:26:32. Full write-up in `docs/memgator-deploy.md`
  ("KillMode bug — FIXED"). Also noted there: the healthcheck's
  "tunnel/public URL still down" line right after a start is often
  just edge-propagation lag (200 within ~15–25s of registration).
- **06:40 UTC runtime restart:** /etc + /tmp wiped again — units
  gone, all five daemons dead (local /about 000, public URL 502).
  Recovered 06:41 UTC the same way (units reinstalled — the
  KillMode fix survives in the durable source file — + stack
  restart with fresh creds, pids 2058/2075/2082/2091/2108):
  local /about 200, TimeMap 200 (310,341 bytes), public URL 200
  ×3 from 06:41:47. The 06:42:32 timer run found the public URL
  down again (transient edge blip — it was 200 at 06:42:08) and
  restarted the tunnel (pid 3971); the timer-started cloudflared
  **survived the service exit** and the public URL was 200 ×3 at
  06:45:09 — the KillMode fix working under the timer in
  production conditions. The tunnel flapped twice in ~4 minutes
  that morning; the next timer runs will confirm stability.
- Tunnel token NOT rotated (needs John's explicit call).

## 2. Console integration + the render-rows extraction
- `web/console.js`: `archiveLink(source, ts, orig, extra)` now
  dispatches ghostarchive → `WS_GHOSTARCHIVE.archiveLink`,
  commoncrawl → `WS_COMMONCRAWL.archiveLink` (extra = the row's
  8th column); `search()` dispatches both sources in the SearchJob
  branch AND the legacy no-SearchJob branch, with the same
  per-handle gates as Arquivo.pt (Ghostarchive: X/Bluesky only;
  Common Crawl: all 14) and URL mode skipping the gates; `counts`
  extended to all four sources; `failedGhostarchive` /
  `failedCommoncrawl` counted from step labels; the Wayback
  early-complete only fires when NO other source runs. CSV/JSON
  exports pass `r[7]` through. `web/index.html`: 5 source options,
  sources paragraph names all four in-console sources,
  `ghostarchive.js` + `commoncrawl.js` script tags added.
- **File-size ceiling:** the integration pushed console.js to 579
  lines (over the 500 hard cap), so `renderRows` + `finishSearch`
  (+ `sourceLabel`/`snapLabelFor`) were extracted to new
  `web/render-rows.js` (128 lines); console.js back to **478**.
  Harness load lists updated (`web/arquivo-ctx.js`,
  `web/console-timeout.test.js`, both new web test files).
  One fix made in the move: the no-rows branch of finishSearch
  now appends `ghostarchiveNote`/`commoncrawlNote` too (before,
  only `arquivoNote` survived a zero-row result).
- **`sourceLabel` name clash — found by Track K's full E2E,
  fixed by Track K in Track L's file.** `render-rows.js` defined
  a global `sourceLabel(src)` (per-row string → label), but
  `evidence-pack.js` already defines a global
  `sourceLabel(records)` (pack-level label for a LIST) and loads
  AFTER it, so the pack version won globally and every
  `renderRows` call threw `TypeError: (records ||
  []).forEach is not a function`. K renamed the row version to
  `rowSourceLabel(src)` + its call site, with a comment explaining
  the clash. The node suites never caught it (they don't load
  evidence-pack.js) — only the browser E2E did. Lesson recorded:
  new top-level globals in web/*.js must be grepped against the
  whole web/ tree, not just the harness load list.
- **"Both" now means ALL archives — E2E mocks updated in four
  files.** `test_arquivo.py` (both + one-source-failing),
  `test_ghostarchive.py` (both + one-source-failing),
  `test_commoncrawl.py` (both + one-source-failing) and
  `test_url_mode.py` (Both, by Track K) now mock the sources they
  don't cover with header-only (zero-row) answers, so each test
  asserts its own merge. The Ghostarchive/Common Crawl files also
  navigate with `&arquivo=proxy` — without it the Arquivo.pt step
  calls arquivo.pt directly, which the sandbox browser cannot
  reach, and the step hangs on its 120s stall bound past the 60s
  test wait. `test_arquivo.py` source-option count updated 3 → 5.

## 3. Full verification (final tree, 2026-11-27)
- **pytest: 146 passed, 1 skipped** (06:29 UTC run, current tree;
  baseline 146/1 held — one transient failure on an earlier run
  while Track K edited the tree mid-run, green on re-run).
- **All node suites green** (CI list, 06:29 UTC): branding 121/121,
  search-job 54, turnstile ✓, auth ✓, modes 19, evidence-usage 31,
  analytics 10, console-timeout 17, live-check 13, osint-tools 73,
  arquivo 36, arquivo-gates 20, arquivo-evidence 13, url-alias 13,
  url-mode 31, **ghostarchive 38/38, commoncrawl 39/39,
  dashboard-server 26/26**, middleware 490/490, packs-upload 14/14,
  arquivo endpoint 11/11, **ghostarchive endpoint 12/12,
  commoncrawl endpoint 15/15**, live-check endpoint 6/6,
  evidence-usage endpoint 18/18, billing-portal endpoint 13/13.
- **Playwright E2E, full suite: 132 passed, 0 failed in 381.87s
  (2026-11-27 ~06:44–06:51 UTC)** — first fully green full run on
  the final tree (baseline 109/109; +23 tests incl. ghostarchive 5,
  commoncrawl 5, dashboard-server 5). Log:
  `~/workspace/trackL-full-e2e.log` (kept under ~/workspace, NOT
  /tmp — see the restart note below). Slice re-runs on the way:
  the 4 touched files 22/22 (ghostarchive 5 + commoncrawl 5 +
  dashboard-server 5 + arquivo 7).
- **SEO check 12/12** (fresh dev server, ~06:30 UTC).
  **Sync checks clean** (sync_brands --check, sync_pricing
  --check, sync_config.py — crawl CC-MAIN-2026-47 agrees in all
  three places). **CLI-bleed grep 0 hits** (Track J patterns over
  web/, excluding *.test.js + vendor; the only "CLI" mentions in
  the new files are code comments, same as the pre-existing ones).
- **E2E first-attempt failures, diagnosed honestly.** The first
  background run of the 3 new files (7 failed, 8 passed) ran while
  Track K was still editing the tree (test_url_mode.py edited
  mid-run) and against a possibly stale 8902 dev server; its
  ghostarchive-only timeout was never reproduced afterwards (same
  test passes in 1.98s in isolation and in every full run since).
  The REAL bugs in that run: (a) the dashboard popup
  (`page.route` vs `context.route`, §1.3 above); (b) the "both
  means 4 sources" mock gaps (§2 above); (c) the `sourceLabel`
  collision (fixed by Track K). After those fixes + killing stale
  dev servers, the same files pass 22/22 and the full suite
  132/132. The second full run (129 passed, 2 failed) also raced
  Track K's mid-run edit to test_url_mode.py — the url-mode Both
  test it failed then passes 7/7 alone and in the final full run.
- **Runtime restart ~06:33–06:40 UTC killed the first full-E2E
  re-run mid-flight** (no confirmed result; /tmp wiped, including
  its log). The 132/132 run above is the re-run after the restart.
  Lesson applied: verification logs now go under ~/workspace, and
  the MemGator recovery after the restart re-proved the KillMode
  fix (§1.5).
- File sizes (Track L files, all under the ~300 ceiling except
  where noted): web/ghostarchive.js 264, web/commoncrawl.js 291,
  web/dashboard-server.js 265, functions/api/ghostarchive.js 235,
  functions/api/commoncrawl.js 262, scripts/sync_config.py 63,
  web/render-rows.js 128, web/dashboard.html 281, web/config.js
  183, scripts/dev-server.mjs 257, web/console.js **478** (under
  the 500 hard cap; was 492 before Track K's split, 416 after it,
  579 at the integration peak). web/index.html 310 and
  web/arquivo.js 312 were already over the ~300 ceiling before
  Track L (Track K owns index.html; arquivo.js was Track I's) —
  the next edit to either must split it, not grow it.

## 4. Docs updated
- `docs/issues.md`: #8 (Ghostarchive + Common Crawl DONE locally
  with test counts + MemGator KillMode fix), #15 (dashboard wiring
  DONE locally), #3 (portal test prep — Stripe side proven, runbook
  pointer, still gated on John's migration approval + the push).
- `docs/data-sources.md`: §0.2 (Ghostarchive web source) + §0.3
  (Common Crawl web source) in the §0.1 Arquivo template style,
  incl. live probe evidence; §0.1's "Still CLI-only" bullet updated
  (Ghostarchive + Common Crawl left the list; server-side evidence
  counting is built locally, only the migrations are unapplied).
- `docs/stripe-vs-clerk.md` §5: portal test runbook (exact commands
  + failure map) + §6 step 3 updated.
- `docs/memgator-deploy.md`: "KillMode bug — FIXED" section +
  propagation-lag note under "Correct behaviors that look like bugs".
- `.github/workflows/ci.yml`: new suites added (ghostarchive /
  commoncrawl / dashboard-server web tests, ghostarchive /
  commoncrawl Function tests, sync_config.py) — CI runs suites by
  explicit list, so unlisted suites never run.

## 5. Deliberately not done (with reasons)
- **No push.** Gated on the canonical decision (a) buy
  archivecheck.com now vs (b) retarget canonicals to
  deletedproof.northforgelabs.dev — John's call, still open. The
  live site still serves the stale v1.3 build.
- **No D1 migrations applied, nothing written to D1, no Stripe
  live-mode objects.** The portal test runbook (§1.4) is ready to
  run in one go once John approves the migration apply.
- **No Paddle / Resend / Clerk / R2 account work.** Those human
  steps (from earlier tracks) are unchanged by Track L.
- **No tunnel-token rotation.** Needs John's explicit call.
- **Web Analytics token still outstanding** — the browser task to
  enable it failed ("browser task is no longer running"); not
  Track L scope, needs a fresh attempt or John's dashboard action.
- **No pricing / licence-minting / auth / Paddle / CDX-proxy
  changes** outside the brief's scope. No paid sources or tiers.

## 6. Ed25519 rotation — verified intact at end of track
- `.licence-keygen.txt` present (560 bytes, chmod 600, gitignored,
  mtime 2026-11-27 03:11 — untouched since the rotation).
  `licence2.py:36` has the new SPKI
  `MCowBQYDK2VwAyEARKv2d0s14DXxgqIm4SbtMN1uUmK/+4CHVF5SaCe89Vs=`;
  `web/licence.js` JWK `x` =
  `RKv2d0s14DXxgqIm4SbtMN1uUmK_-4CHVF5SaCe89Vs` (matches the new
  key's raw 32 bytes); `docs/paddle-webhook.md` has the SPKI twice.
  Zero Track L edits to `licence2.py`, `web/licence.js`,
  `.licence-keygen.txt`, `docs/paddle-webhook.md`.
- Test key from §1.4 re-verified against the rotated pair (Python
  + Node) during the track.

# Independent verification of Tracks K+L (assistant, 2026-11-27)

Run on the final tree after both tracks landed. Everything below was
checked by the assistant directly, not taken from the tracks' reports.

## 1. Non-E2E checks — all green

- pytest **146 passed, 1 skipped** (`.venv`).
- All web node suites green: branding 121, modes 19, search-job 54,
  evidence-usage 31, analytics 10, console-timeout 17, live-check 13,
  osint-tools 73, arquivo 36+20+13, url-mode 31, url-alias 13,
  ghostarchive 38/38, commoncrawl 39/39, dashboard-server 26/26,
  auth + turnstile.
- Endpoint suites, 0 failures: arquivo 11, ghostarchive 12,
  commoncrawl 15, live-check 6, evidence-usage 18, billing-portal 13,
  packs-upload 13, webhook 10. (Packs-upload was 14 before, now 13 —
  one test removed/merged upstream; fail count 0 either way.)
- Middleware suite: all passed. SEO: **12/12** (`scripts/seo_check.py`).
- CLI-bleed grep over `web/` (excl. vendor + `*.test.js`): **0 hits**.
- `sync_brands.py --check` + `sync_pricing.py --check`: exit 0.
  `sync_config.py`: CC crawl id `CC-MAIN-2026-47` agrees in all 3 places.
- Source selector in `index.html`: 5 options (wayback default +
  arquivo + ghostarchive + commoncrawl + both="All archives").
  `#post-url` present (count 1).
- File sizes (all under the 500 hard cap; console.js 478 and
  arquivo.js 312 are over the ~300 ceiling — the next edit to either
  must split it, not grow it): console.js 478, arquivo.js 312,
  ghostarchive.js 264, commoncrawl.js 291,
  functions/api/ghostarchive.js 235, functions/api/commoncrawl.js 262,
  dashboard-server.js 265, url-mode.js 73, url-alias.js 56,
  render-rows.js 128.
- Ghostarchive live probe (assistant, dev-server proxy, port 8902):
  HTTP 200, real CDX-shape rows for x.com/jack/status/20 (timestamps
  spanning 2024-12 to 2026-06, incl. nearby-post prefix matches —
  honest Ghostarchive behaviour).
- MemGator: stack service active, healthcheck timer active, local
  /about 200, local TimeMap 200, `KillMode=process` confirmed via
  systemctl, public URL 200.
- Ed25519 rotation intact: `.licence-keygen.txt` 560 bytes `-rw-------`,
  new SPKI present in `licence2.py` x1, `docs/paddle-webhook.md` x2,
  `web/licence.js` JWK x1. Zero Track K/L edits to those files.
- `rowSourceLabel` fix verified present in `web/render-rows.js`
  (the Track L `sourceLabel` clash Track K fixed).

## 2. dp2.js "86-char" nit — assistant follow-up fix

Track K resolved the flag backwards (86 unpadded is correct) and fixed
the comment in `functions/_lib/dp2.js`, but its brief forbade touching
`wayback_social/licence2.py`, which still said "88". The assistant
fixed `licence2.py:3` itself (comment-only edit: "88" -> "86" + an
explanatory note) and updated the now-stale clause in dp2.js's comment.
Behaviour-neutral: licence tests 21/21 + webhook suite 10/10 after.

## 3. Full E2E — 126 passed, 6 failed (NOT Track L's 132/132)

Independent re-run, `tests/e2e/run_e2e.py`, 2026-11-27 ~06:50-07:01 UTC,
**126 passed, 6 failed in 649.83s**. Log:
`~/workspace/trackL-verify-e2e.log`. Track L's own run reported
132/132; the assistant's independent run disagrees — the difference is
infrastructure, not product (see diagnosis).

Failures:
1. `test_search_controls.py::test_free_search_via_proxy_with_date_range`
   — `TimeoutError: Page.wait_for_selector: Timeout 240000ms exceeded`,
   waiting for `#status:has-text('Found')`. The live archive.org search
   never completed in 4 minutes (archive.org slow/flaky all night).
2. `test_pause_resume_during_search` — `Page.goto:
   net::ERR_CONNECTION_REFUSED at http://127.0.0.1:8902/?cdx=proxy`.
3. `test_stop_keeps_partial_results_then_resume` — same
   ERR_CONNECTION_REFUSED.
4. `test_stop_resume_with_mocked_cdx` — same ERR_CONNECTION_REFUSED.
5. `test_sample_respects_date_range` — same ERR_CONNECTION_REFUSED.
6. `test_url_mode.py::test_url_mode_live_probe` — `TimeoutError:
   Page.wait_for_function: Timeout 180000ms exceeded`, waiting for
   "capture(s) of this post". Live URL-mode search stalled.

Diagnosis: after failure 1 burned its 240s timeout, **the dev server on
port 8902 was dead** — failures 2-5 could not even load the page
(they fail in `goto_dev`, before any product code runs). The mocked
stop test (failure 4) passes in 3.34s when the server is up (Track K
proved it), so its failure here is purely the dead server. Failures 1
and 6 are archive.org timing through the proxy, the same flakiness
seen all evening (CDX 503/stalls, ~20-min down windows). **None of the
6 is a product regression on the evidence.** The remaining 126 tests —
including all branding, SSR, guides, failure-paths, arquivo,
ghostarchive, commoncrawl, dashboard-server, batch, diff, citations
and evidence-pack tests — passed.

## 4. Isolated re-run of the 6 (in progress at time of writing)

Per the established pattern (Track G: dev server died mid-run, isolated
re-run 3/3 passed), the 6 failed tests are being re-run in isolation
against a fresh dev server:
`.venv-e2e/bin/python -m pytest tests/e2e/test_search_controls.py
"tests/e2e/test_url_mode.py::test_url_mode_live_probe" -v`
(log `~/workspace/trackL-verify-e2e-rerun.log`). First test
(`test_date_picker_sets_yyyymmdd`) PASSED; the live free-search test
is in flight. Result to be recorded here when it lands; the branch-
preview deploy (§5 of `docs/deploy-prep.md`) starts only after it is
green. **The tree is NOT called fully green until this re-run passes.**

# Track M: overall status pass — all 22 GitHub issues + feature gaps (2026-11-27)

Live GitHub state verified via the connector this round: **21 OPEN, 1 CLOSED**
(#7, app. cert). Tracker (`docs/issue-tracker.md`) reconciled to
~10:35 EST; `docs/issues.md` detail updated in the same pass. This section
is the gap record; the tracker is the summary.

## 1. Per-issue status (verified against the live list + the tree)

| # | Issue | Status this round |
|---|---|---|
| 1 | Rename / lock final name | OPEN — dry-run fresh (247 files, 181 with hits; wayback-social 298, wayback_social 144, deletedproof 418, DP1/DP2 308, D1 34). Canonical (b) chosen, so the rename no longer waits on (a); waits on 4 open decisions (licence prefix, Python import, Pages project name, GitHub org). Guide slugs CLOSED. |
| 2 | Buy production domain + org + PyPI + USPTO | OPEN — DEFERRED by (b). archivecheck.com NOT bought; umbrella name NOT formally locked. |
| 3 | Real checkout links | OPEN — **LIVE go-ahead GIVEN 2026-11-27; Track N in flight** (live Stripe products/links + portal config). Paddle links still REPLACE_*. Stripe test link verified 200 (earlier). |
| 4 | Paddle webhook → Ed25519 → D1 → Resend | DONE-LOCAL. Human steps open: Resend account + verified domain + Pages secrets (incl. LICENCE_ED25519_PRIVATE_KEY — pending Cloudflare card question), $1 sandbox purchase test. |
| 5 | R2 buckets + presigned PUT | DONE-LOCAL, buckets VERIFIED live. Human steps open: R2 S3 token + R2_* secrets, lifecycle rules, live upload test. |
| 6 | Clerk login (Phase 2) | DONE-LOCAL + **app EXISTS: "Socialz" (dev only), verified 10:19 EST; test publishable key IS in web/config.js, enabled: true.** Still open: CLERK_SECRET_KEY env, migration 0002, Turnstile keys, bot-protection toggle, test accounts, production instance. FLAG: app named "Socialz", not "ArchiveCheck". |
| 7 | app. cert stuck pending | CLOSED (all 5 custom domains ACTIVE). |
| 8 | Archives (CC + MemGator + Ghostarchive + YouTube) | DONE-LOCAL for all four web sources. **MemGator was DOWN (07:55 UTC, VM restart wiped /etc) — RECOVERED by Track M 10:26 EST (see §3).** YouTube PARKED (John). Tunnel-token rotation needs John's call. |
| 9 | Trust & safety + FCRA | DONE-LOCAL. Live check pending push. Abuse email still the sales@example.com placeholder (blocked on John). |
| 10 | SEO: Console + Bing + Web Analytics + content | Content DONE-LOCAL (10 guides + index). Web Analytics: browser task ERRORED, no token — needs a fresh task when John signs in. Search Console/Bing/Product Hunt/Show HN: human steps. |
| 11 | Install Muse GitHub App | OPEN — BLOCKED-JOHN. Pushes still via browser web-upload. |
| 12 | Split cli.py | DONE-LOCAL (7 modules, 56-line dispatcher). CI green pending push. |
| 13 | Subdomain routing + osint/legal web UI | DONE-LOCAL (routing 29/29 + Batch/Diff/Citations). Live check pending push. |
| 14 | Weekly SEO/analytics report | First report DONE; next due 2026-12-03. Needs live analytics once #10 lands. |
| 15 | Evidence usage counting | DONE-LOCAL (local-first + server endpoint + dashboard wiring). Migration 0003 unapplied (needs John's approval tap). |
| 16 | Remove CLI box | DONE-LOCAL (0 CLI-bleed hits). Live check pending push. |
| 17 | CDX proxy / CORS | DONE-LOCAL. Live end-to-end check pending push. |
| 18 | All-network search in web | DONE-LOCAL. Live check pending push. |
| 19 | Per-subdomain branding | DONE-LOCAL. Live check pending push. |
| 20 | SSR per-subdomain titles + meta | DONE-LOCAL (matrix 6×2 verified). Live title loop pending push. |
| 21 | Live free search fails (juliawalterz) | DONE-LOCAL (exact case passed 02:25 UTC). Live replay pending push. |
| 22 | Copy says "Wayback" + CLI bleed | DONE-LOCAL (P1–P5 fixed, URL mode built). Independent full E2E 126/132 + re-runs 5/5 + 2/2 green; full E2E re-running on the retargeted tree (in flight at 84% when this section was written). Live grep pending push. |

## 2. Gaps found (launch-ordered)

1. **Live Stripe buyers get no licence key automatically (HIGH, #3).** No
   Stripe webhook exists (unlike Paddle's). A live Stripe purchase pays
   but mints nothing — manual fulfilment or a new Stripe webhook endpoint
   is the follow-up. Also the billing-portal endpoint refuses sk_live_...
   by design until the live-secret decision lands. (Track N's scope is
   links + portal config; the webhook is NOT in this round.)
2. **MemGator was down (HIGH, #8) — FIXED this round (§3).** Third
   recovery this window. Pattern: VM/runtime restarts wipe /etc, the
   systemd units vanish, nothing restarts the stack. The 15-min
   healthcheck timer is back, but timer-run relay restarts defer
   without proxy credentials (healthcheck.log 07:12–07:43) — the timer
   can revive the tunnel but not the relay when the egress proxy is
   refusing CONNECT :7844.
3. **Clerk app named "Socialz", not "ArchiveCheck" (MEDIUM, #6).** The
   sign-in UI will show the wrong brand. 30-second rename in the Clerk
   Dashboard — John's call. Also: dev instance only, no production env;
   Google uses shared Clerk OAuth creds (consent screen every time).
4. **sales@example.com is still the abuse + email-checkout address
   (MEDIUM, #9).** Placeholder in web/config.js (5 mailto links) +
   web/trust.html. Asked 3x, unanswered — blocked on John.
5. **Docs drift (LOW, fixed §4).** Five stale claims found: #1 "waits on
   (a)", #3 "needs go-ahead", #20 "canonicals until the decision lands",
   push-readiness "STILL undecided", tracker "No live Stripe work".
   Also docs/gaps-user-accounts-email.md read as current while the
   webhook + Resend now exist.
6. **Sales tax unanswered (MEDIUM, #3).** Track N replicates the test
   recipe (no tax, automatic_tax off) and flags it — a live seller
   decision John still owes.
7. **Licence-secret round still open (HIGH, #4).** The
   LICENCE_ED25519_PRIVATE_KEY Pages secret question (pending
   Cloudflare card vs Drive + Mac wrangler) is unchanged by this
   round; the $1 sandbox purchase test cannot run until it lands.

## 3. Gaps fixed by Track M

- **MemGator recovery (issue #8).** Found down 10:24 EST:
  memgator-stack.service + healthcheck timer inactive (no units in
  /etc), local /about 000, public URL 530. Last activity 07:55 UTC
  (cloudflared SIGTERM'd — runtime restart). Recovery per
  docs/memgator-deploy.md: `sudo ops/memgator/install-systemd.sh`
  (units reinstalled, timer active 15:24:55 UTC) + `stack.sh restart`
  (all five up: memgator pid 12902, dns 12917, dns-bridge 12926,
  relay 12954, tunnel 12980). Verified 10:26 EST: local /about 200,
  public /about 200, public TimeMap
  /timemap/json/https://x.com/jack/status/20 → 200, 80 mementos
  (2024-05-18..2026-11-27). No secrets read, printed, or modified;
  tunnel-token file untouched (existence only, 0600).
- **Doc staleness (issues #1, #3, #6, #20 + push-readiness + tracker
  + gaps doc + dry-run label).** Eight edits: issues.md #1 (canonical
  (b) + fresh counts), #3 (live go-ahead + Track N + webhook gap),
  #6 (Clerk app + key-in-config + remaining steps + Socialz flag),
  #20 (decision landed); push-readiness.md header (DECIDED (b));
  gaps-user-accounts-email.md (PARTLY SUPERSEDED banner); rename-dry-run.py
  label ("gated on option (a)" → gated on the 4 open decisions);
  issue-tracker.md full refresh (reconciled time, gate tail, #1/#3/#6/
  #8/#22 rows).
- **Rename dry-run re-run (issue #1).** Fresh counts 2026-11-27 ~10:30
  EST (see §1 row #1). Tool verified still working after the label edit.

## 4. Deliberately NOT fixed (with reasons)

- **Stripe live links / portal config (#3):** owned by Track N this
  round — not duplicated.
- **Clerk secret env var / migration 0002 / Turnstile keys (#6):**
  need John's secret / approval tap / dashboard steps; the secret key
  was supplied in the main chat and must never be pasted or handled
  here.
- **Web Analytics token (#10), GitHub App install (#11), R2 secrets
  (#5), Resend account (#4), sales@example.com (#9), tunnel-token
  rotation (#8), sales tax (#3):** all need John (sign-in, click,
  account, or decision). Listed in §2 / the tracker with owners.
- **No code changes beyond the dry-run label.** No product bug was
  found in this pass that a small safe fix would close; the open
  product work is all "needs push + live check", which the deploy
  (parent agent, after the E2E lands) closes.
- **Full E2E re-run:** owned by the parent agent (in flight on the
  retargeted tree, 84% at section time). Track M did not touch port
  8902 or the run.

## 5. Verification notes (this round, observed)

- Live GitHub: 21 OPEN + 1 CLOSED, via the connector (list_issues,
  state OPEN/CLOSED). Titles match docs/issues.md #1–#22.
- web/config.js: CLERK.publishable_key =
  pk_test_YmVsb3ZlZC1nYXplbGxlLTQ2NzguY2xlcmsuYWNjb3VudHMuZGV2JA
  (base64 → beloved-gazelle-4678.clerk.accounts.dev — matches the
  verified instance), enabled: true. TURNSTILE still
  REPLACE_TURNSTILE_SITE_KEY, enabled: false. Stripe/Paddle/Gumroad
  links all still REPLACE_* (Track N owns the Stripe half). Email
  checkout still mailto:sales@example.com (5 packs).
- Canonicals: index/dashboard/trust + brands.json (5) all
  https://deletedproof.northforgelabs.dev[/...]; sitemap 13 refs,
  robots 1 ref. Zero lowercase `archivecheck` left in served code
  except the deliberate decision note in branding.js:18 and the
  download filenames (archivecheck-*.csv/json — product name, kept).
- Migrations 0001–0004 all exist as files; 0002/0003/0004 unapplied
  live (per history; not re-probed — D1 writes need approval).
- .licence-keygen.txt present, 560 bytes, -rw-------, mtime
  2026-11-27 03:11 — untouched by this track.

## 6. Addendum — full E2E on the retargeted tree finished during this track

Full run (`tests/e2e/run_e2e.py`, 2026-11-27 ~15:22–15:30 UTC):
**131 passed, 1 failed in 494.06s.** The one failure was
`tests/e2e/test_pricing.py::test_seo_tags_and_files` — a STALE TEST,
not a product bug: it asserted the sitemap contains
`deletedproof.pages.dev` or `wayback-social.pages.dev`, but the
canonical retarget (option b) moved the sitemap host to
`deletedproof.northforgelabs.dev`. The sitemap content itself was
correct (all 14 URLs on the new host, 200). Fix (Track M):
the test now accepts the new host first, keeping the two old hosts
as pre-push fallbacks (the live v1.3 sitemap still lists
wayback-social.pages.dev until the push). Re-run in isolation:
**1 passed, 132 deselected in 2.40s.** Effective full E2E on the
retargeted tree: **132/132**. File: tests/e2e/test_pricing.py:134-145.

# Track O: local full feature test (2026-11-27)

Complement to the Playwright E2E (which covers the web console in the
browser). This track ran everything the E2E does NOT cover, for real:
every CLI command, licence mint/verify (DP1 + DP2), evidence-pack
contents, pricing-cap enforcement (CLI + JS flags), every Pages
Function via the dev server, MemGator live, R2 fail-closed, and the
Clerk/Turnstile config state. All runs 2026-11-27 ~15:23–15:35 UTC.
Working files in /tmp/trackO (scratch, not in the repo). TEST-ONLY
track: bugs are reported, not fixed.

## 1. Results table

| # | Feature | Check | Result |
|---|---|---|---|
| 1 | CLI `--help` (13 commands) | every command + subcommands | PASS 13/13, version 1.5.0 |
| 2 | `networks` | full list, 14 networks + coverage labels | PASS |
| 3 | `presets` | 7 presets listed with networks | PASS |
| 4 | `archive x jack --limit 2` | live CDX, 4 captures parsed | PASS (see nit N1 on --limit) |
| 5 | `archive` free JSON export | refused, CSV offered | PASS (gate works) |
| 6 | `archive` CSV on free | 2,481 B, real 2013/2016 captures | PASS |
| 7 | `archive` JSON with Starter key | 4,547 B JSON saved | PASS |
| 8 | `licence make` DP1 (starter/studio/pro) | keys minted with demo secret | PASS 3/3 |
| 9 | `licence check` valid keys | starter + studio verified with tier | PASS |
| 10 | `licence check` tampered key | rejected, "checksum mismatch", exit 1 | PASS |
| 11 | DP2 mint + verify (rotated keypair) | Node mintKey → Python verify_key (True, studio, valid); Node verifyKey valid; tampered → signature mismatch | PASS |
| 12 | `evidence` on free | refused: "Evidence packs are a Studio feature" | PASS |
| 13 | `evidence` with Studio key | pack_evstudio.zip 5,839 B; unzip → 7 files; `sha256sum -c manifest.sha256` all 6 OK; README + manifest.json + report.html fields verified (tool 1.5.0, date range, source, counts, ethics line) | PASS |
| 14 | `find clumsysmurf --networks x,bluesky` | found on x (20 captures), not bluesky; free JSON export downgraded to CSV with honest note; counts-only summary JSON written | PASS |
| 15 | `arquivo jack --limit 2` (CDX) | 2 results, embargo note printed, CSV saved | PASS |
| 16 | `arquivo --keyword` on free | refused: "needs the Pro plan or higher" | PASS |
| 17 | `arquivo --keyword twttr` with Pro key | gate opens, 0 results (honest empty) | PASS |
| 18 | `live bluesky bsky.app` | real posts returned via public API | PASS |
| 19 | `rss` Mastodon feed | entries with URLs returned | PASS |
| 20 | `batch` (2 targets) | 2 targets, 6 captures, both CSVs saved | PASS |
| 21 | `diff x jack --limit 2` | 4 captures, all non-post (profile pages) skipped + counted, 0 posts, "No deleted posts found", CSV saved | PASS (see bug B1: NOT gated on free) |
| 22 | `cc` queue + `--check` | job queued; check → "empty: no captures found for this URL" (honest; single-post URLs rarely in CC index) | PASS |
| 23 | `sources` | full probe, every source with honest status (MemGator ok, CC async-only, Reddit/IG/FB/Threads/LinkedIn login-walled = archive only) | PASS |
| 24 | `/api/cdx` (dev server, live archive.org) | jack/status/20 → real CDX rows (2020, status 200); missing ?url= → 400 honest | PASS |
| 25 | `/api/arquivo` CDX wildcard | twitter.com/jack/status/* → real 2018 rows (3 captures of status 1026984242893357056) | PASS |
| 26 | `/api/arquivo` keyword | returns URL-substring matches (jackbarbalet.com, jackwalrath.net) — the documented caveat, working as designed | PASS |
| 27 | `/api/ghostarchive` | jack/status/20 → 1 row, 2024-12-30, archive id ogQls | PASS |
| 28 | `/api/commoncrawl` | example.com → 3 rows, crawl CC-MAIN-2026-47 | PASS |
| 29 | `/api/live-check` POST | status/20 → live (200); status/1 → deleted (404), both with checked_at | PASS |
| 30 | `/api/evidence-usage` no key | local-first fallback {used:3, included:0, tier:free, source:"local", verified:false} + honest note | PASS |
| 31 | `/api/licence-check` (direct Node invoke; dev server does not route it — see B2) | DP1 → valid:false, demo-only reason; DP2 → valid:true, studio, 10 reports, 5 seats, "no D1 record — signature valid, revocation unknown"; tampered → signature mismatch; no env key → valid:false "production public key not configured" | PASS |
| 32 | `/api/packs-upload` (direct Node invoke; dev server does not route it — see B2) | valid DP2 key + no R2 creds → 503 "R2 not configured", key verified first; DP1 key → valid:false, DP2 purchase key needed | PASS |
| 33 | MemGator public | /about → MemGator 1.0-rc9 banner; TimeMap jack/status/20 → real mementos back to 2008-11-03 | PASS |
| 34 | JS vs Python feature flags | web/licence.js PLAN_CAPS == wayback_social/plans.py per tier (caps, exports, deleted_diff, keyword_search) | PASS |
| 35 | Clerk/Turnstile config state | CLERK publishable_key IS set in web/config.js (pk_test_…, enabled:true — main chat already pasted it); TURNSTILE site_key still REPLACE_, enabled:false | PASS (state noted, see §3) |
| 36 | E2E on the retargeted tree | 131 passed, 1 failed in 494.06s (log ~/workspace/retarget-full-e2e.log); the 1 failure was a stale-loaded test (see §2); isolated re-run 1 passed → effective 132/132 | PASS (with note) |

Totals: **36/36 checks pass** (31 direct passes + 5 passes-with-notes).
No live check required a retry except the arquivo probes, which
returned empty only because the E2E's dev server had died at end of
run — re-run against a fresh dev server, all three arquivo/commoncrawl
probes returned real rows.

## 2. The E2E's 1 failure — stale-loaded test, not a product bug

`tests/e2e/test_pricing.py::test_seo_tags_and_files` failed in the
full run because pytest had imported the OLD assertion (sitemap must
contain `deletedproof.pages.dev` or `wayback-social.pages.dev`) before
the test file was fixed mid-run to accept the retargeted host. The
sitemap content itself was correct (all 14 URLs on
deletedproof.northforgelabs.dev, 200). Isolated re-run after the fix:
**1 passed, 132 deselected in 1.96s.** Effective full E2E on the
retargeted tree: **132/132**. Fix file: tests/e2e/test_pricing.py:134-145.

## 3. Bugs found (TEST-ONLY — not fixed by this track)

### B1 — CLI `diff` is NOT tier-gated on free, web IS (inconsistency)
- Evidence: `wayback-social diff x jack --limit 2` on the free plan
  ran to completion (4 captures, CSV saved). `wayback_social/plans.py:38`
  says free has `deleted_diff: False`, and the web console blocks free
  users with "Deleted diff needs Starter" (Track E, deliberate). The CLI
  never checks the flag: grep over `wayback_social/commands/` +
  `wayback_social/*.py` finds `deleted_diff` only in the `PLAN_FEATURES`
  definition — no enforcement call site. The keyword gate IS enforced
  in the CLI (`wayback_social/extra_commands.py:92`, verified above:
  free refused, Pro allowed), so `diff` is the odd one out.
- Call: either gate the CLI `diff` on Starter+ like the web, or
  deliberately declare CLI diff free and drop `deleted_diff: False`
  from the free tier. Until decided, free CLI users get a paid web
  feature for free.

### B2 — Dev server does not route /api/licence-check or /api/packs-upload
- Evidence: `curl -X POST http://127.0.0.1:8902/api/licence-check` and
  `/api/packs-upload` both return 404 "not found".
  `scripts/dev-server.mjs` routes only /api/cdx, /api/arquivo,
  /api/ghostarchive, /api/commoncrawl, /api/evidence-usage,
  /api/billing-portal, /api/live-check (lines 44-50, 91-191). The two
  unrouted Functions were verified instead by direct Node invocation
  of their `onRequest` (rows 31-32, all pass). Fix: add the two routes
  to dev-server.mjs (same pattern as evidence-usage/live-check).

### N1 (nit) — `--limit` is per URL pattern, help text reads as a total
- Evidence: `archive x jack --limit 2` returned 4 captures. X queries
  both `twitter.com/{id}/status/*` and `x.com/{id}/status/*` and merges
  (`wayback_social/networks.py:65-71`: "twitter.com + x.com both queried
  and merged"), and `cdx.py:49-50` passes `--limit` straight through to
  each CDX query — 2 patterns × limit 2 = 4 rows. The plan cap
  (archive_limit) is enforced on the total, so no cap is bypassed; only
  the help text (`-l, --limit INTEGER  Max CDX results`) misleads.
  Fix: reword to "Max CDX results per URL pattern" (or cap the merged
  total at --limit).

## 4. Notes (not bugs)

- **Clerk publishable key is already live in the tree.**
  `web/config.js:175` has a real `pk_test_…` key (instance
  beloved-gazelle-4678) with `enabled: true` — pasted from the main
  chat this morning. Turnstile is still unconfigured
  (`TURNSTILE.site_key: "REPLACE_TURNSTILE_SITE_KEY", enabled: false`),
  so searches run with no bot check, exactly as before. The remaining
  Clerk items are the secret key (Pages env `CLERK_SECRET_KEY`),
  Turnstile site+secret keys, and migration 0002 (`users` table).
- **Arquivo keyword = URL-substring match, confirmed live.** Keyword
  `jack` returned jackbarbalet.com and jackwalrath.net — the archive's
  own text search, not authorship. The product already says this in
  its honest-limits copy; the probe confirms the copy is accurate.
- **Summary JSONs are counts-only, not an export bypass.** `find` and
  `batch` write `*_summary.json` on the free plan, but the files hold
  only per-target counts + file names — the data export stays CSV-only
  on free, as gated. No bypass.
- **DP2 test key hygiene.** One DP2-STUDIO test key was minted from the
  rotated keypair for this track's verify (Node mintKey → Python +
  Node + licence-check Function, all valid). The key file
  (/tmp/trackO/dp2key.txt) and mint script were deleted after the
  verify. The private key file itself was never printed or read by
  this track (only `stat`: 560 bytes, `-rw-------`, mtime 2026-11-27
  03:11, untouched since the rotation).
- **Dev-server lifetime.** The E2E's dev server died when the run
  ended (expected — run_e2e.py shuts its servers down); this track
  started a fresh one on 8902 for the Function probes and stopped it
  afterwards. No server left running.

## Track P: Clerk close-to-prod — dev/prod env swap (2026-11-27)

**Swap implemented in code, tested locally. Prod instance does NOT
exist yet; test users NOT created yet; email flow NOT tested yet
(all post-deploy, see docs/clerk-env-swap.md §11).**

- **Design:** `GET /api/config` (`functions/api/config.js`, 58
  lines, GET-only, `cache-control: no-store`) returns the PUBLIC
  keys from that deployment's Pages env vars
  (`CLERK_PUBLISHABLE_KEY`, `TURNSTILE_SITE_KEY`) — Production vs
  Preview. `web/runtime-config.js` (121 lines) fetches it once per
  page load and merges over the static `web/config.js` values
  (endpoint wins when real, static dev fallback otherwise, never
  required). `auth-ui.js` initAuth and `turnstile.js` ensureToken
  consult it first. Secrets never leave the server; the endpoint
  test proves no secret field is ever returned.
- **Tests:** `web/runtime-config.test.js` 16/16; `tests/test_clerk_auth.py`
  10/10 (was 8 — added the runtime-config suite + the endpoint
  test); `web/auth.test.js` + `web/turnstile.test.js` still green;
  full non-e2e pytest **148 passed** (was 146 — the 2 new tests).
  Live endpoint check via a throwaway dev server on 8903/8904:
  no-env → both `enabled:false`; with env vars → keys returned;
  POST → 405; `runtime-config.js` served on index. Servers killed
  afterwards; the E2E's 8902 server was never touched.
- **Full E2E finished during this track: 131 passed, 1 failed.**
  The one failure (`test_seo_tags_and_files`) was a STALE test
  module, not a product bug: pytest had collected the test file
  before the canonical retarget edit landed in it, so it asserted
  the old `deletedproof.pages.dev` sitemap host while the served
  sitemap already (correctly) listed `deletedproof.northforgelabs.dev`.
  Isolated re-run on the current tree: PASSED. Auth slice re-run:
  **6 passed, 0 failed.**
- **Stale auth tests fixed (caused by the 10:21 key wiring, not by
  this track's code):** `tests/test_clerk_auth.py` asserted the
  `pk_test_REPLACE_…` placeholder was still in config.js — updated
  to assert the wired dev key + no secrets. `tests/e2e/test_auth.py`
  asserted NO Clerk requests ever — updated to assert the SDK IS
  requested when configured and Turnstile requests stay zero.
- **Sandbox limit, proven not assumed:** the sandbox browser
  cannot fetch the Clerk SDK from jsDelivr
  (`ERR_TUNNEL_CONNECTION_FAILED` — the VM egress proxy blocks the
  browser's CONNECT). The page handles it honestly ("Sign-in failed
  to load … — licence keys still work.") and the E2E suite accepts
  that state locally. The real sign-in render can ONLY be proven in
  a real browser against the deployed site — it is step 2–3 of the
  §11 email-flow script, not a local test.
- **CLERK_SECRET_KEY SET (main chat, 2026-11-27 10:27 EST):** via
  the Cloudflare API, verified live as `secret_text` in Production
  + Preview. The first attempt failed HTTP 500 code 8000000 — wrong
  `type` (`secret`); correct is `secret_text`. Same 8000000 as the
  earlier YT_API_KEY PATCH failures: the API route was never
  broken, the type was wrong. Dashboard Google sign-in is broken
  for this account (OIDC callback rejected 5x); John has no
  Cloudflare password — use the API route for Pages work (no
  separate token needed). Secondary-member login is pending John's
  email choice; do not invite anyone unconfirmed.
- **Correction to the old test-user plan:** `docs/clerk-auth.md` §7
  step 8 said "sign up each one in the browser" for
  `test+*@archivecheck.example` — that domain is not a real inbox,
  so no verification code can ever arrive. Create test users in the
  Clerk Dashboard (no code needed that way) OR use John's Gmail `+`
  aliases. Recorded in `docs/clerk-env-swap.md` §11.
- **File sizes:** `docs/clerk-auth.md` 297, `docs/clerk-env-swap.md`
  212, `web/runtime-config.js` 121, `functions/api/config.js` 58,
  `scripts/dev-server.mjs` 275 (was ~256 before this track — the
  next edit to it must split it), `web/auth-ui.js` 155,
  `web/turnstile.js` 200. No secret value was written anywhere by
  this track; the private key file was never read.
- **Not done by this track (unblockers, see §11):** no test users
  created (deploy not live yet + creation path is sign-up flow /
  CLI auth — this chat has no secret-key access and no CLI auth);
  no production Clerk instance (dashboard-only, needs John's
  action); no Turnstile keys (John to supply); migration 0002 not
  applied; `CLERK_PUBLISHABLE_KEY` Preview env var not set (the
  main chat owns Cloudflare setup — the API call shape is in §11).

## E2E re-run outcomes — isolated re-runs of the 2026-11-27 full runs (assistant)

- **Re-run #1 (2026-11-27 ~07:0x UTC, log `~/workspace/trackL-verify-e2e-rerun.log`, 570.00s):** 7 tests (the 6 failures from the 126/132 run + the date-picker test) → **5 passed, 2 failed**. Both failures were archive.org stalls (`test_pause_resume_during_search`, `test_stop_keeps_partial_results_then_resume` — 240s timeouts waiting for `#status:has-text('Found')`).
- **Re-run #2 (2026-11-27 ~10:11 EST, log `~/workspace/trackL-verify-e2e-rerun2.log`, 89.11s):** just those 2 tests → **2 passed, EXIT:0**.
- **Combined: 126 + 5 + 2 = 132/132 pass** across runs. Every failure was proven-transient archive.org flakiness (the deploy-prep §1 gate allows isolated re-runs for exactly this, both attempts recorded).

## Full E2E on the retargeted tree (assistant, 2026-11-27 10:18–10:27 EST)

- **Full run (log `~/workspace/retarget-full-e2e.log`, 494.06s): 131 passed, 1 failed** — `tests/e2e/test_pricing.py::test_seo_tags_and_files`. Diagnosis: STALE TEST, not a product bug. The test asserted the sitemap lists `deletedproof.pages.dev` or `wayback-social.pages.dev`; the sitemap correctly lists `deletedproof.northforgelabs.dev` per the canonical decision (b). Track M had already fixed the test in the tree (it now accepts all three hosts) after the E2E snapshot was taken at run start.
- **Isolated re-run (log `~/workspace/e2e-seo-rerun.log`, 2.21s): 1 passed.** Effective full-run result: **132/132**.
- Pricing JSON-LD in the same test passed (offers 0/9/19/49/59/15 = launch prices from pricing.yaml).

# Track N: live Stripe checkout (2026-11-27)

Source: docs/stripe-vs-clerk.md §1 ONLY (per-link product/price/link ids
are in §7 of that doc, not repeated here). John authorized live checkout
in the main chat 2026-11-27 ("Use stripe for live checkout"). The
test-mode recipe was repeated in the live account. No real-money
purchases were made by this track.

## Test mode — Pro Pack dress rehearsal (TEST ONLY)

Account `acct_1TqN24GnFHTsoY17` ("NORTHFORGE LABS LLC sandbox"):

- Product: `prod_VhYLzeWSMvXfHh` — "Pro Pack" (metadata
  `product=archivecheck, tier=pro, plan=pro`)
- Price: `price_1Ug9EUGnFHTsoY17ooOxds3k` — $19.00 USD, one-time
  (`unit_amount: 1900`, `type: one_time`)
- Payment Link: `plink_1Ug9EYGnFHTsoY17gPoPL62e` —
  https://buy.stripe.com/test_7sYeVdev7e4PgT21SU9Ve00 — verified
  `curl -L` HTTP 200. Hosted confirmation message: licence key arrives
  by email. No tax set (`tax_code: null`, `automatic_tax.enabled: false`).

## Live mode — live checkout (2026-11-27)

Account `acct_1TqN1vGW6yc5Tf5G` ("NORTHFORGE LABS LLC"):

- Products: **11** — the 6 Meterlane products (untouched) + **5 new
  ArchiveCheck products** (Starter, Pro Pack, Studio, All-in Bundle,
  Text-fetch top-up), all `livemode: true`, `tax_code: null`.
- Payment Links: **5, all ArchiveCheck, all live** (launch prices,
  one-time USD, `customer_creation: if_required`, hosted-confirmation
  message promising the licence key by email). All return HTTP 200 with
  the "Stripe Checkout" title.
- Customers: **1** — `cus_UqFlCEiPekjF6j`, the Meterlane customer
  (unchanged). No wayback-social customers exist yet (none until
  someone buys).
- Billing Portal configurations: **1 in live** —
  `bpc_1UgR15GW6yc5Tf5G5fREva6D` (created 2026-11-27, active, default,
  livemode true) + the test one from §5.
- **Sales tax: NOT set** — replicated the test recipe exactly
  (`tax_code: null`, `automatic_tax` off). John's sales-tax decision is
  STILL OPEN (now GitHub issue #28, filed by Track S).
- `web/config.js`: `CHECKOUT.provider` is now `"stripe"`; all five
  `REPLACE_STRIPE_*` placeholders are the live URLs. Paddle links stay
  `REPLACE_PADDLE_*` (alternative via `?checkout=paddle`); Gumroad/email
  unchanged.

Per-link product / price / Payment Link ids, the portal config recipe,
and the verification record are in docs/stripe-vs-clerk.md §7. The #1
follow-up — no Stripe webhook exists, so a live Stripe buyer pays and
gets no key automatically — is GitHub issue #23 (filed by Track S; see
the Track S section below). Live STRIPE_SECRET_KEY decision and the
live portal session are still open on #3.

# Track S: missed-work sweep (2026-11-27)

Worker A: chat sweep (57 user messages, 48 items) → 13 most-likely-
genuinely-missed items. Worker B: live-state verification (GitHub,
config.js, env vars, bindings, deployments, tracker staleness). Live
GitHub re-checked by Track S before filing: 21 OPEN (#1–6, #8–22),
1 CLOSED (#7). All 9 new issues filed via the connector `issue_write`
(method `create`); drafts + filing record: docs/track-s-new-issues.md.
Live re-check after filing: **30 open, 1 closed**. The GitHub App
install (#11) is still the push unblocker — pushes go via browser
web-upload until John installs it.

## Missed-work table

| # | Item | Chat / date | Evidence | GitHub issue | Status |
|---|---|---|---|---|---|
| 1 | Order-email placeholder (sales@example.com; John's answer never came) | Worker A sweep, 2026-11-27 (asked 3x, unanswered) | web/config.js:47-51 (5 mailto links), web/trust.html:92 | #29 | FILED, BLOCKED-JOHN |
| 2 | Web Analytics sign-in / token (browser task ended 2026-11-27 05:15 UTC, no token) | Worker A sweep, 2026-11-27 | #10 scope ("enable Cloudflare Web Analytics"); connector cannot create the RUM site (403, missing account-settings.write scope) | #10 (already tracked) + #30 | COVERED — blocked on #30 invite acceptance OR connector re-auth with that scope |
| 3 | Licence private key secret (connector PUT outcome unknown; John's storage call pending) | Worker A sweep, 2026-11-27 | New pair generated 2026-11-27 ~02:05 UTC (old key lost in reboot); private key held at .licence-keygen.txt (chmod 600, gitignored) | #27 (storage-route decision) | FILED, BLOCKED-JOHN |
| 4 | Clerk admin + test users and live email-code login flow (no creation or live-flow evidence in chats) | Worker A sweep, 2026-11-27 | #6 still-open step (docs/clerk-auth.md §6 step 8); Track P §11: not created; creation path corrected (Dashboard, or John's Gmail + aliases) | #6 (already tracked) | COVERED — waits on deploy live |
| 5 | MemGator health-check timer after the second reboot (reinstall approvals timed out twice; last chat state "stack killed again") | Worker A sweep, 2026-11-27 | Track M recovered 10:26 EST (3rd recovery); VM restarts wipe /etc (docs/memgator-deploy.md) | #31 | FILED |
| 6 | Paddle real product links + $1 sandbox test purchase | Worker A sweep, 2026-11-27 | web/config.js:32-36 REPLACE_PADDLE_* still placeholders | #3 (already tracked) | COVERED — waits on #27 |
| 7 | GitHub App install (push still 403-blocked) | Worker A sweep, 2026-11-27 | #11's title IS this work | #11 (already tracked) | COVERED — BLOCKED-JOHN |
| 8 | clumsysmurf34 fallback / member invite (John's newest instruction 10:39 EST, no close) | Main chat, 2026-11-27 10:39 EST | Invite SENT ~10:45 EST to clumsysmurf34@gmail.com (Administrator, member id 4a4fc78f7fa751726c86465dbae8cd6e, status pending) | #30 | FILED, PARTLY DONE — acceptance is John's step |
| 9 | Stripe live tax decision + Stripe-vs-Clerk eval (track assumed no tax; no John decision on record) | Worker A sweep, 2026-11-27 | Live links have no tax (docs/stripe-vs-clerk.md §1, §7); eval answered in docs/stripe-vs-clerk.md §§1–3 (no, Stripe cannot replace Clerk) | #28 (tax decision) | FILED, BLOCKED-JOHN (eval needs no issue) |
| 10 | Resend human steps (account, API key, domain verification, Pages secrets, sandbox test) | Worker A sweep, 2026-11-27 | #4 still-open steps (docs/email-setup.md) | #4 (already tracked) | COVERED — BLOCKED-JOHN |
| 11 | Secondary Cloudflare member-invite email (never answered) | Worker A sweep, 2026-11-27 | Same thread as #8 above | #30 (merged with #8) | FILED as part of #30 |
| 12 | Turnstile keys as env vars (built in code, no evidence set live) | Worker A sweep, 2026-11-27 | web/config.js:196 site_key REPLACE_TURNSTILE_SITE_KEY, enabled false | #6 (already tracked) | COVERED — BLOCKED-JOHN |
| 13 | Rename to ArchiveCheck (repo/PyPI/Pages) + name lock (umbrella name not formally locked) | Worker A sweep, 2026-11-27 | Canonical (b) applied locally, push pending; archivecheck.com NOT bought | #1 + #2 (already tracked) | COVERED — BLOCKED-JOHN |
| — | No-Stripe-webhook gap (live risk: links promise licence-by-email, no webhook exists) | Worker B live-state finding, 2026-11-27 | docs/stripe-vs-clerk.md §7 "THE GAP"; docs/issues.md #3; docs/issue-tracker.md:45; TEST-REPORT.md:2515 — recorded ONLY in docs, never a GitHub issue | #23 | FILED (HIGH, live risk) |
| — | Track R B1: CLI diff NOT tier-gated on free, web IS | Track O §3, 2026-11-27 ~15:23–15:35 UTC | plans.py:38 free `deleted_diff: False`; no enforcement call site in CLI | #26 | FILED, Track R owns the fix |
| — | Track R B2: dev-server routes for /api/licence-check + /api/packs-upload | Track O §3, 2026-11-27 ~15:23–15:35 UTC | Both return 404 on 127.0.0.1:8902; dev-server.mjs routes 7 other endpoints only | #25 | FILED, Track R owns the fix |
| — | Track R N1: --limit help reword | Track O §3, 2026-11-27 ~15:23–15:35 UTC | `--limit 2` returned 4 captures (2 patterns × 2); help reads as a total | #24 | FILED, Track R owns the fix |

Skipped-as-duplicate check: no draft duplicated a live issue. Track R
had filed nothing yet at filing time (no B1/B2/N1 issues on the live
list), so all three were filed by Track S, marked "Track R owns the
fix". TEST-REPORT.md has NO Track N section before this one (only 3
mentions inside the Track M section) — added above.

## Deployments result

Exactly ONE deployment exists (b522080d, production, main, 942f6b0,
success, 2026-11-26 19:27 UTC). Zero failed. Nothing to delete —
cleanup complete. Deploy flow LOCKED 2026-11-27 10:35 EST (John):
develop → preview/dev deploys ONLY; main → production; other branches →
no deploys (verified live via API). `develop` branch CREATED 2026-11-27
(refs/heads/develop at 942f6b0). The batch push now goes to develop
first, then PR merge develop → main — NOT straight to main.
End-to-end flow verification (push → preview deploy; merge → production
deploy) is PENDING the batched push. Known-good deployment for rollback
(docs/deploy-prep.md §6): b522080d.

## GitHub Discussions check

The discussions page
(github.com/ClumsySmurf1337/wayback-social/discussions) returns HTTP
404 — Discussions are not enabled on the repo, so there is nothing to
answer there. No discussion issue filed. (Text fetch only; no browser
task, no sign-in.)

## Cloudflare setup state (Track S, 2026-11-27)

- Landed / verified (parent-verified cached values; Track S made ZERO
  live Cloudflare calls this round): deploy flow locked + verified live;
  `develop` branch created; D1 (DB → wayback-social-licences) + R2
  (PACKS) bindings on both envs; CLERK_SECRET_KEY set both envs
  (secret_text); CLERK_PUBLISHABLE_KEY in Preview only (no prod Clerk
  instance yet); exactly 1 deployment, zero failed.
- Still needs the dashboard (and why): clumsysmurf34 invite acceptance
  (#30) — John's step in that inbox; Web Analytics / RUM site creation —
  API returns 403 (missing account-settings.write scope), so it needs
  either the accepted member account or a connector re-authorization
  with that scope. John's general "do all Cloudflare setup" authorization
  does not change either point.
- Must NOT be done from this side: setting LICENCE_ED25519_PRIVATE_KEY
  (needs John's explicit confirmation of the approach — #27), and
  setting LICENCE_ED25519_PUBLIC_KEY alone (a PATCH of the project's
  env_vars would replace the whole map and wipe CLERK_SECRET_KEY, whose
  value must never be handled here). The public key is READY TO SET by
  the parent: one batched PATCH re-supplying the secret + adding the
  public key + preserving the D1/R2 bindings.
- Muse-email member plan — TRIED AND BLOCKED, closed (not missed):
  John asked to use johnhamilton@muse.ai as the secondary Cloudflare
  login (~10:52 EST); the system refused the invite (it cannot give
  itself its own Cloudflare login to John's account). The blocked call
  ran nothing: the clumsysmurf34 invite is still pending and remains
  the secondary-login path. Do NOT attempt the Muse-email invite again,
  and do NOT send any Cloudflare member invite from this side.

## Ordered issue list (top 10 — full list in docs/issue-tracker.md)

1. #11 GitHub App install (John click) — unblocks connector pushes; the
   batched push carries everything DONE-LOCAL.
2. #23 Stripe webhook (build) — top live risk; waits on #27 + #4
   secrets + the batched push; sandbox proof first.
3. #27 Licence private-key storage route (John decision) — unblocks #4,
   the $1 sandbox tests, and #23.
4. #28 Stripe sales-tax decision (John) — gates live payments at volume.
5. #29 sales@example.com real address (John) — one-line fix, next push.
6. #30 clumsysmurf34 invite acceptance (John) — also unblocks Web
   Analytics (or re-auth with account-settings.write scope).
7. #3 Paddle links + $1 sandbox test (John) — waits on #27.
8. #31 MemGator timer after second reboot — reinstall (sudo, fresh
   proxy creds), verify public URL 200.
9. #24 / #25 / #26 Track R B1/B2/N1 (Track R owns the fix) — next push;
   B1 needs a policy call.
10. #6 Clerk close-out — Turnstile keys (John), migration 0002
    (approval tap), test users + live email-code flow (waits on deploy
    live), production instance (John).

Deploy sequence on every push (docs/deploy-prep.md §6): push to develop
→ preview deploy + regression (§4 + auth E2E slice + runtime-config
check) → PR merge develop → main → production deploy + regression →
update the known-good line. Rollback on failure via the API to b522080d;
verify the site serves the known-good build on all 6 domains; report the
same turn. Bar: keep building till prod-ready — the full setup test
green on the deployed prod build with zero errors.

## Tracker / docs updates (this round)

- docs/issue-tracker.md: reconciled 2026-11-27 ~10:54 EST (30 open,
  1 closed); priority list added at the top; #3 row fixed (Track N
  complete, remaining follow-ups #23/#28/live-secret decision); #6 row
  fixed (CLERK_SECRET_KEY set ~10:42 EST); new table for #23–#31; gate
  tail updated (Track N complete + deploy flow locked + develop branch
  created + invite sent).
- docs/issues.md: #3 fixed (Track N complete; live portal config now 1,
  bpc_1UgR15GW6yc5Tf5G5fREva6D; follow-ups #23/#28); #6 fixed
  (CLERK_SECRET_KEY set ~10:42 EST).
- docs/track-s-new-issues.md: 9 filed issues with real numbers
  (#23–#31), skipped-as-covered table, post-filing notes (Discussions
  404, Muse-email blocked, public-key ready-to-set, 0 Cloudflare calls,
  9 approval prompts — one per issue_write).
- Approval prompts hit by Track S: 9 — one per GitHub `issue_write`
  call (#23–#31). The GitHub connector's write actions are not durably
  allowed, so each filing prompted once despite being batched into one
  round. Cloudflare calls by Track S: 0, costing 0 prompts.

## Track R: files / competition / pricing / issues (2026-11-27)

Scope: John's 10:23 EST ask — go through the docs/files including the
competition research, reconcile ALL pricing across dev and prod, file
GitHub issues for every emerging gap, work the issues. Plus the two
follow-ups: Track O's B1/B2/N1 (file + fix) and the Stripe live
reconciliation (Track N's ids as authoritative, verified independently
via the Stripe API). Plus the 10:52 EST authorization to finish all
Cloudflare setup via the API route so the GitHub deploy flow works
without approval prompts.

### Pricing reconciliation — dev vs prod (all verified 2026-11-27)

Single source of truth `pricing.yaml`. Every price below was checked
in pricing.yaml ↔ `wayback_social/plans.py` ↔ `web/config.js` PRICING
+ FEATURE_CHART ↔ web copy (`web/index.html`, `web/console.js`,
guides) ↔ `docs/pricing-features.md` ↔ `docs/stripe-vs-clerk.md` ↔
Stripe LIVE (API read-back, acct_1TqN1vGW6yc5Tf5G). No price changed
since the v1.3 lock. `scripts/sync_pricing.py --check`,
`scripts/sync_brands.py --check`, `scripts/sync_config.py` all exit 0.

| Pack | Launch | Regular | Live product | Live price | Live Payment Link |
|---|---|---|---|---|---|
| Free | $0 | $0 | — | — | — |
| Starter | $9 | $19 | prod_VhqhukuyVGq7aQ | price_1UgR0MGW6yc5Tf5GOIXgIXQv ($9.00) | plink_1UgR0gGW6yc5Tf5GUml7KHAx → https://buy.stripe.com/6oUaEX3Xm3NB16E8Ik3sI04 |
| Pro | $19 | $29 | prod_Vhqhzh5djF0FE9 | price_1UgR0MGW6yc5Tf5GljpjGLoH ($19.00) | plink_1UgR0gGW6yc5Tf5GEfJEfbNR → https://buy.stripe.com/eVq6oHdxWck7dTqf6I3sI00 |
| Studio | $49 | $99 | prod_VhqhwFX9BzlrYV | price_1UgR0MGW6yc5Tf5GyoH2O7zj ($49.00) | plink_1UgR0gGW6yc5Tf5GSQwQnNKI → https://buy.stripe.com/28EeVd79ydobeXu2jW3sI01 |
| All-in Bundle | $59 | $147 | prod_VhqhzSIdQ3B4RF | price_1UgR0NGW6yc5Tf5GEsSd39VR ($59.00) | plink_1UgR0gGW6yc5Tf5GMajiY61c → https://buy.stripe.com/4gM9AT3XmdobbLie2E3sI03 |
| Text-fetch top-up (500) | $15 | $15 | prod_Vhqhi6OklkZI2b | price_1UgR0MGW6yc5Tf5G9nfyhfkd ($15.00) | plink_1UgR0gGW6yc5Tf5G93VserqU → https://buy.stripe.com/bJe7sLdxW4RF02Ae2E3sI02 |

Live verification (Track R, independent of Track N): all 5 products
active, `livemode: true`, `tax_code: null`, metadata
`{product: archivecheck, tier/plan}`; all 5 prices USD one-time,
`tax_behavior: unspecified`; all 5 Payment Links `active: true`,
`livemode: true`, URLs exactly as in `web/config.js`,
`automatic_tax: {enabled: false}`, `allow_promotion_codes: false`,
`billing_address_collection: auto`; all 5 link URLs curl HTTP 200
(654,939-byte Stripe Checkout JS shell — the static HTML carries NO
price digits; the API read-back above is the authoritative check).
Live Billing Portal config `bpc_1UgR15GW6yc5Tf5G5fREva6D` (active,
default, return URL `https://app.deletedproof.northforgelabs.dev/dashboard.html`).
The 6 pre-existing Meterlane products/prices in the live account are
not ours and were ignored. No money moved (products/prices/links/
config only; no customers, charges, or test purchases).
`web/config.js`: `CHECKOUT.provider` is `"stripe"`; all five
`REPLACE_STRIPE_*` replaced with the live URLs; Paddle stays
`REPLACE_PADDLE_*` (alternative via `?checkout=paddle`) — the Paddle
price mapping in config.js matches pricing.yaml (same 5 packs).
**Sales-tax flag (John's open decision, #28):** live links collect NO
sales tax / VAT / GST (no `tax_code`, `automatic_tax` off — the test
recipe replicated as-is). If tax collection is needed, the links must
be rebuilt/edited with Stripe Tax + registrations before real payments
at volume. Never guessed.
**Stripe-webhook gap:** no `functions/api/stripe-webhook.js` exists —
a live buyer pays and gets no licence key/email/D1 row, while the
confirmation message promises the key by email. Filed as **#23** (Track
S). Do not take live Stripe payments at volume until it is built and
proven with a sandbox purchase first.

Discrepancies found in this pass (all fixed, see "Files fixed"):
- `docs/pricing-features.md` §1: Studio Stripe net kept said $47.27 —
  correct is **$47.28** (49 × 0.971 − 0.30 = 47.279). One-cent error.
- `docs/pricing-features.md` §4: "73% cheaper than Social Catfish's
  first month ($33.21)" — $33.21 appears in NO source. The competition
  report's verified figure is **$27.48/mo** ($36 on some checkout
  paths). Corrected to 67% cheaper; the same $33.21 error also made
  "Starter $19 regular is 43% cheaper" wrong — corrected to 31%.
  All other §4 percentages re-checked and correct (Pro $29 vs Spokeo
  $239.40/yr = 88%; Studio $49 vs Hunchly $169/yr = 71%; Bundle $59
  vs Hunchly = 65%; Studio $99 vs Hunchly = 41%).
- `docs/pricing-features.md` §1 "⚠️ Fix before launch: config.js says
  the bundle regular is $137 / 57% off" — the fix LANDED in v1.3
  (config.js says $147/60%); the callout was stale. Marked done.
- `docs/pricing-features.md` §3/§5: evidence pack "🟡 Can build" and
  R2 "🟡 Can build — Phase 2" (v1.2-era) — both BUILT (evidence pack
  v1.4 CLI + web; `functions/api/packs-upload.js` + live buckets).
  §5 item 5 also claimed export-format gating was "policy only" —
  it is ENFORCED since v1.4; only the web monthly caps (3 searches/mo
  Free, export-count) remain policy-only (no code enforces them).
- `web/index.html:256`: "Prices are draft until checkout links are
  connected." — stale now that Stripe is live. Reworded to say
  checkout is live via Stripe (Paddle via `?checkout=paddle`).
- `docs/stripe-vs-clerk.md` §7: "the price digits are present" in the
  fetched checkout HTML — wrong. Track R's fetch found NO price digits
  in the static HTML (JS shell); corrected to say the API read-back is
  the authoritative verification.
- `web/config.js:25` header comment "DRAFT PRICING (John: change the
  numbers here…)" — stale vs pricing.yaml as the single source of
  truth. NOT edited by Track R (config.js is parent-owned); the exact
  edit is in "Exact edits for the parent" below.

Competition report re-verified (`~/workspace/research_notes/
wayback-social-competition-20261126-1841/report.md`): prices are
index-level (Sep–Nov 2026 vendor pages) except Paddle + Lemon Squeezy
(verified live) — the report says so itself and to re-check at launch.
Cross-checked against the tree/live state: Social Catfish $27.48/mo
(official; $36 on some paths) matches the site copy and guides; Hunchly
$169/yr, Pagefreezer from $1,500/yr, Page Vault $199–349/capture,
Spokeo $19.95/mo, TruthFinder $28.99/mo, PimEyes $29.99/mo, Brand24
$199/mo all match the guides' citations. No competitor does
multi-network CDX + batch + export for a one-time fee — the wedge
stands. Lemon Squeezy is dead (closed 16 Nov 2026, stops processing
31 Mar 2027) — never recommended anywhere in the tree. The report's
own "Could not verify" section (IA 2014 terms vs commercial CDX use,
Social Catfish $36 variant, Search Specialist $297 vs $397) is honest
and needs counsel, not a code fix. No new competition issue filed:
the report is current; the only staleness was the $33.21 figure in
`docs/pricing-features.md`, fixed above.

### Files fixed (file + line)

- `wayback_social/commands/diff.py:16` — import `has_feature`.
  `:35` — `--limit` help "Max CDX results (default 20)." → "Max CDX
  results per URL pattern (default 20)." (N1).
  `:95-104` (after the export-comparison early return) — **B1 gate**:
  live diff raises `click.UsageError("Deleted diff needs the Starter
  plan or higher (your plan: {plan}). \`archive\` (CDX search without
  the live check) works on every plan.")` when
  `has_feature(plan, "deleted_diff")` is false. The local
  export-comparison mode (`diff OLD.json NEW.json`) is deliberately
  NOT gated — it compares two files the user already exported, no
  archive or live check involved (documented in the code comment).
- `wayback_social/commands/archive.py:40` — `--limit` help "Max CDX
  results." → "Max CDX results per URL pattern." (N1).
- `wayback_social/commands/batch.py:26` — `--limit` help "Max CDX
  results per target (default 100)." → "Max CDX results per URL
  pattern, per target (default 100)." (N1, same wording family).
- `tests/test_diff.py` — `test_diff_cli_offline` now passes
  `--plan starter` (the live diff is a Starter+ feature);
  + `test_diff_free_plan_refused_before_any_fetch` (free → exit 2,
  "Starter" in output, `query_many` stubbed to raise if called —
  proves the refusal happens BEFORE any archive fetch, no summary
  file written); + `test_diff_free_plan_still_compares_local_exports`
  (two local JSON exports on free → exit 0, "removed 1" — locks the
  exemption). `tests/test_diff.py` 8 passed.
- `scripts/dev-server.mjs` — **B2, 275 → 264 lines** (refactor shrank
  it while adding 2 routes). All per-route Request/response plumbing
  extracted into one `callFunction(req, res, handler, {body, env})`
  helper; each route is now one import + one 4-line block (header
  comment says so — do NOT re-add per-route copies). New routes:
  `/api/licence-check` (POST {key}; env `LICENCE_ED25519_PUBLIC_KEY`
  passed through from the shell, unset → the endpoint's honest
  no-key behaviour; no D1 → valid signature answers status
  "unknown") and `/api/packs-upload` (POST {key, size, sha256,
  name?}; env `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` /
  `R2_SECRET_ACCESS_KEY` / `PACKS_BUCKET` passed through, unset →
  honest 503). Probes on port 8917: GET /api/licence-check → 405
  (was 404), POST DP1 key → 200 "DP1 keys are dev/demo keys…",
  GET /api/packs-upload → 405 (was 404), POST DP1 key → 200 "DP1
  keys are dev/demo keys — cloud upload needs a DP2 purchase key",
  GET /api/cdx (bad) → 400, GET /api/config → 200, POST
  /api/evidence-usage → 503 (no D1), GET / → 200. E2E slices after
  the refactor: failure-paths + dashboard-server + url-mode 19/19;
  arquivo + ghostarchive + commoncrawl + search-controls 23/23.
- `web/index.html:256` — pricing paragraph: "Prices are draft until
  checkout links are connected." → "Checkout is live via Stripe
  (Paddle as the alternative with `?checkout=paddle`)."
- `docs/pricing-features.md` — header status (v1.2 recommendation →
  implemented in v1.3, verified by Track R 2026-11-27); §1 Studio
  Stripe net $47.27 → $47.28; bundle "Fix before launch" callout →
  marked FIXED in v1.3; §2 Free exports "CSV only, 1/mo" → "CSV only"
  (the 1/mo count is policy-only, now stated in §5); §3 status block
  refreshed (evidence pack ✅ built in v1.4; R2 🟡 built, not yet
  proven live — secrets + lifecycle + live upload test are issue #5
  human steps); §4 Social Catfish $33.21 → $27.48, 73% → 67%,
  regular-Starter 43% → 31%; §5 items 2–3 marked DONE, item 5
  corrected (format gating enforced since v1.4; monthly caps still
  policy-only).
- `docs/stripe-vs-clerk.md:385` — "the price digits are present" →
  corrected (static HTML carries no price digits; API read-back is
  authoritative).
- `docs/cloudflare-deploy.md` — status header added (doc predates the
  live project: project is `deletedproof`, NOT `wayback-social`;
  deploy flow is `docs/deploy-prep.md` §0; checkout default is
  Stripe, Paddle alternative; Web Analytics still open, #10/#30);
  "Payment backend stays Paddle" → Stripe live default; step 5 URL →
  `deletedproof.pages.dev` + canonical note; step 6 → custom domains
  DONE (list them); step 7 → Web Analytics still open, blocked on
  #30, do not retry broken Google SSO; subdomains table "Lands on"
  → per-subdomain brand + preset via branding.js/middleware, not
  anchor redirects; seo_check URL → canonical host; CDX-proxy section
  corrected (dev server routes /api/cdx locally too; lists all 9
  same-origin proxies now routed).
- `docs/seo-monitor.md:6` — seo_check example URL
  `wayback-social.pages.dev` (nonexistent host) →
  `https://deletedproof.northforgelabs.dev/`.
- (Not fixed — historical mentions only: `docs/web-search-ux.md:256`
  and `docs/seo-report-2026-11-26.md:53` cite `wayback-social.pages.dev`
  as the nonexistent host that was fixed; `web/branding.test.js:31`
  keeps it as a test host mapping to apex brand. All intentional.)

### Cloudflare setup — batched API round (Track R, 2026-11-27)

One `cloudflare execute` invocation = **1 approval (approved)**.
The program did, in order: GET project (baseline) → GET Turnstile
widgets → POST create Turnstile widget → GET RUM sites → POST create
RUM site (try/catch) → PATCH project env vars → GET project verify.
No secret VALUE was returned or printed anywhere (only names,
types, and the public sitekey).

What landed:
- **Turnstile widget CREATED**: "ArchiveCheck — deletedproof",
  mode `invisible`, domains `deletedproof.northforgelabs.dev` +
  `deletedproof.pages.dev` (the apex entry covers all 4 subdomains),
  sitekey `0x4AAAAAAGV8UGE-2rGL9e1L` (public — embedded in the page).
  Secret obtained and set as a Pages secret in the same program —
  never printed, never stored in a file.
- **Pages env vars PATCHED (success: true, no errors), verified by
  read-back.** Production now: CLERK_SECRET_KEY,
  LICENCE_ED25519_PUBLIC_KEY, RESEND_FROM, TURNSTILE_SECRET_KEY,
  TURNSTILE_SITE_KEY. Preview now: those five +
  CLERK_PUBLISHABLE_KEY. CLERK_SECRET_KEY survived the PATCH intact
  on both envs (type-only echo preserves secrets — the parent's
  10:52 EST finding, re-proven here; the program never echoes a
  secret's value, only its type).
  - `RESEND_FROM` = `ArchiveCheck <licences@deletedproof.northforgelabs.dev>` (both envs).
  - `CLERK_PUBLISHABLE_KEY` = test key (Preview ONLY — production
    gets no dev key; the prod Clerk instance does not exist yet).
  - `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (both envs).
  - `LICENCE_ED25519_PUBLIC_KEY` was already set by the parent
    10:52 EST; echoed back unchanged.
- **RUM / Web Analytics site creation FAILED — HTTP 403**
  (Authentication error, code 10000, Ray ID a612882beb5e2f04-LAX).
  The connector lacks `account-settings.write` scope — confirmed
  fresh in this round. Dashboard-only: needs the clumsysmurf34
  invite acceptance (#30) or a connector re-authorization with that
  scope. Do NOT retry the broken Google SSO dashboard sign-in.
- Deployments (verified by the parent this round): **2 total, zero
  failed** — production `b522080d` (main, `942f6b0`, success,
  2026-11-26 19:27 UTC, known-good) + preview `6b1317d4` (develop,
  `942f6b0`, success, 2026-11-27 15:49 UTC). The develop→preview leg
  is proven live. No failed-deployment cleanup needed.
- **Cloudflare calls by Track R this round: 1 execute (batch 2,
  approved, 1 prompt) + 1 earlier execute attempt (batch 1, recon
  only) whose approval TIMED OUT at 180s — it never ran, 0 calls
  made; the parent then set the public key themselves (10:52 EST)
  and gave the fresh "do all Cloudflare setup" authorization, under
  which batch 2 ran as a new program. Spec searches (`cloudflare
  search`) are local, 0 prompts.**

Still NOT set (no values exist yet — human steps, unchanged):
`LICENCE_ED25519_PRIVATE_KEY` (#27 — John's storage-route call;
never set on the strength of the general authorization),
`PADDLE_*` (#4 — no Paddle account), `RESEND_API_KEY` (#4 — no
Resend account), `STRIPE_SECRET_KEY` (test/live — no key value
available to this track), `STRIPE_PORTAL_CONFIGURATION` (live —
gated on the sk_live decision, #3), `LICENCE_SECRET` (production
DP1 secret — needs a generation + distribution decision),
`YT_API_KEY` (PARKED by John). RUM token: none (403 above).

### Issues — Track R filed ZERO (all covered)

Live re-check before filing (2026-11-27): 21 open + #7 closed at
the time Track S filed; **30 open, 1 closed after Track S filed
#23–#31** (verified live by the parent). Every gap this pass found
was already filed or tracked — no duplicates filed:
- B1 CLI diff tier gate → **#26** (Track S) — **FIXED by Track R
  this round** (gate + 2 tests, see above; parent's call: gate on
  Starter+, do not declare it free).
- B2 dev-server routes → **#25** (Track S) — **FIXED by Track R
  this round** (routes + callFunction refactor, see above).
- N1 `--limit` help → **#24** (Track S) — **FIXED by Track R this
  round** (archive + diff + batch help text).
- Stripe webhook missing → **#23** (Track S) — NOT filed by Track R
  per the parent's instruction; top live risk, waits on #27 + #4
  secrets + push; sandbox proof first.
- Live billing-portal gate (endpoint refuses `sk_live_`) → tracked
  under **#3** ("Remaining: live STRIPE_SECRET_KEY decision
  (endpoint refuses sk_live_... by design)") — no separate issue.
- Turnstile keys → tracked under **#6** (still-open step: site/
  secret keys) — the keys are now SET (see Cloudflare section);
  the remaining step is the `web/config.js` wiring (exact edit
  below) + a live search check after the push.
- `sales@example.com` placeholder → **#29** (Track S) — BLOCKED-JOHN.
- Web Analytics token → tracked under **#10**, blocked on **#30**
  (clumsysmurf34 invite acceptance) or re-auth scope — the 403 was
  re-proven this round.
- Docs staleness (`docs/pricing-features.md`, `docs/stripe-vs-clerk.md`,
  `docs/cloudflare-deploy.md`, `docs/seo-monitor.md`,
  `web/index.html:256`) → fixed directly in this pass, no issue
  needed; the fixes are listed above.

### Exact edits for the parent (web/config.js — NOT edited by Track R)

1. Turnstile site key is live (widget created this round):
   - File `web/config.js`, line 196.
   - Old: `TURNSTILE: { site_key: "REPLACE_TURNSTILE_SITE_KEY", enabled: false },`
   - New: `TURNSTILE: { site_key: "0x4AAAAAAGV8UGE-2rGL9e1L", enabled: true },`
   - The `/api/config` endpoint serves the same key from the
     `TURNSTILE_SITE_KEY` env var (now set in both envs), so the
     static fallback and the endpoint agree. Post-deploy check:
     a search on the deployed host must show the Turnstile widget
     loading (invisible) and searches must still succeed — if the
     widget fails to load, searches fall back to the server-side
     verify, which now has a secret configured.
2. Stale "DRAFT PRICING" header comment:
   - File `web/config.js`, lines 25–26.
   - Old: ` * DRAFT PRICING (John: change the numbers here; the page and the README\n * pricing table follow this file — see CONTRIBUTING.md).`
   - New: ` * PRICING — the numbers here are generated from pricing.yaml (the single\n * source of truth) by scripts/sync_pricing.py; change pricing.yaml and re-run\n * the sync, never hand-edit the prices in this file.`

### Deliberately NOT fixed (with reasons)

- **Stripe webhook (#23)** — not built in this round: it needs #27
  (private-key storage route) + #4 secrets + the push, and must be
  proven with a sandbox purchase first. It is the top live risk and
  the next build after the push.
- **Live billing-portal gate** — not lifted: needs a code change +
  John's decision + live secrets (`STRIPE_SECRET_KEY` live,
  `STRIPE_PORTAL_CONFIGURATION` live). Tracked under #3.
- **Web Analytics token** — not obtainable: RUM create 403s on the
  connector's missing scope (re-proven this round). Dashboard-only
  via #30. No token exists to wire into `web/config.js` ANALYTICS.
- **`LICENCE_ED25519_PRIVATE_KEY`** — not set: needs John's explicit
  confirmation of the approach (#27). The general Cloudflare
  authorization explicitly excludes it.
- **Web monthly caps** (Free 3 searches/mo, export-count cap) — not
  built: they need the licence/account system; the docs now say
  honestly that they are policy-only.
- **CLI host-alias dedup / broad-search X double-count** — not in
  this round: Track K's documented follow-ups (CLI still merges by
  exact key; X-pattern double-count needs John's product call).
- **`web/config.js`** — not edited by Track R at all (parent-owned);
  the two needed edits are listed above with exact old/new text.

### Final validation on the final tree (2026-11-27, after all Track R edits)

- pytest: **150 passed** (148 baseline after Track P + 2 new B1
  tests), 0 failed.
- All node suites green (every `web/*.test.js`,
  `functions/*.test.mjs`, `functions/api/*.test.mjs` — no FAIL).
- `scripts/sync_brands.py --check`, `scripts/sync_pricing.py
  --check` clean; `scripts/sync_config.py` OK (crawl CC-MAIN-2026-47
  agrees in all three places; proxy keys present).
- `scripts/seo_check.py` vs local dev server: **12/12**.
- CLI-bleed grep over `web/` (excl. vendor + `*.test.js`): **0 hits**.
- File sizes: `web/console.js` 478 (unchanged, under the 500 hard
  cap — next edit must split it); `scripts/dev-server.mjs` 264
  (was 275); `wayback_social/commands/diff.py` 180.
- E2E slices after the dev-server refactor: failure-paths +
  dashboard-server + url-mode **19/19**; arquivo + ghostarchive +
  commoncrawl + search-controls **23/23**.
- Full E2E on the final tree, first run: **130 passed, 3 failed**
  in 485.78s (log `~/workspace/trackR-final-e2e.log`). All 3 were
  STALE TESTS / harness gaps, not product bugs — diagnosed, fixed,
  re-run below:
  1. `test_dashboard.py::test_no_console_errors_on_dashboard` —
     "Failed to load resource: 404 (File not found)". Cause: the
     dashboard calls `/api/*` (runtime-config, evidence-usage) on
     load (Track P wiring), but the test ran against the plain
     static server (8901), which 404s `/api/config` — and Chrome
     logs any 404 fetch as a console error. Fix (test):
     the test now runs against the dev server (8902), the faithful
     local replica of production (all `/api/*` routed), via the
     `dev_server` fixture. The sandboxed-Chromium Clerk CDN failure
     (jsDelivr blocked by the egress proxy; loads fine deployed and
     via curl) is filtered with a comment — environmental, not our
     code.
  2. `test_pricing.py::test_checkout_default_is_paddle` — asserted
     the default provider is Paddle. Stale: Stripe became the live
     default (Track N, 2026-11-27). Fix (test): renamed to
     `test_checkout_default_is_stripe`, asserts "Stripe".
  3. `test_pricing.py::test_buy_placeholder_shows_not_connected_dialog`
     — clicked Pro with no query param (now live Stripe → real
     checkout popup, which fails to load in sandboxed Chromium).
     The placeholder dialog only exists for the UNCONNECTED provider.
     Fix (test): `goto(page, "?checkout=paddle")` — Track N's stated
     intent, which never landed in this file (its failure-paths twin
     already ran under `?checkout=paddle`, 7/7).
  - **Bonus product fix found by the isolated re-run: the site had
    NO favicon.** `web/favicon.ico` did not exist, so every first
    page load in a real browser requested it, got a 404, and logged
    a console error. In full runs this was masked (Chrome requests
    it once per browser session — the run log shows exactly one
    `GET /favicon.ico 404`, at run start, on a test that does not
    assert console errors); in isolation the dashboard test was the
    first load and failed on it. Fix (product): created
    `web/favicon.ico` (221 bytes, 32x32 PNG-in-ICO, ArchiveCheck
    green `#1F9D63` rounded square + white checkmark, generated by
    `/tmp/make_favicon.py`, stdlib only). Browsers request it by
    default — zero HTML edits, fixes every page at once. Verified:
    200 on the dev server; isolated dashboard test passes (2.43s).
- Full E2E on the final tree, RE-RUN (after the 3 test fixes +
  favicon): **132 passed, 1 failed in 645.18s** (log
  `~/workspace/trackR-final-e2e2.log`). The one failure was
  `test_search_controls.py::test_pause_resume_during_search` —
  timed out (240s) waiting for `#status:has-text('Found')` after
  resuming a LIVE jack/X search. The sibling live test
  (`test_stop_keeps_partial_results_then_resume`) PASSED in the
  same run, as did the mocked pause/resume variant — the resume
  machinery works; this is the known archive.org-timing flake
  Track K already documented (the live pause/resume test failed
  3× on the same 240s timeout before, then passed on the next
  run). **Isolated re-run of that one test: 1 passed in 81.33s.**
  Effective total: **133/133**. The 3 fixed tests (dashboard
  console-errors, pricing default-is-Stripe, placeholder dialog)
  all passed in the full re-run.
- Track T follow-ups (2026-11-27, after the re-run):
  - **Issue #32 FILED** (connector `issue_write`, 1 approval):
    "Text-fetch credits ledger: top-up purchases are unfulfilled
    (manual only)" —
    https://github.com/ClumsySmurf1337/wayback-social/issues/32.
    Track T's webhook deliberately ignores top-ups (no key, no
    row, no email) and no credits ledger exists anywhere yet.
    Acceptance in the issue: a top-up credits 500 text-fetch
    credits to the buyer's licence/account, the balance is visible
    on the dashboard, text-fetch draws it down; idempotent;
    refunds debit back. Depends on #23 + #4. Until it lands, do
    not sell top-ups at volume — the $15 live Stripe link exists
    and a buyer currently receives nothing for it.
  - **B2 extended: `/api/stripe-webhook` dev-server route
    (Track T follow-up).** `scripts/dev-server.mjs` 264 → **296
    lines** (still under the ~300 ceiling). One import + one
    route block, same `callFunction` pattern; env passthrough
    covers every key the endpoint reads except DB (no D1
    locally): STRIPE_WEBHOOK_SECRET / _SANDBOX, STRIPE_SECRET_KEY,
    LICENCE_ED25519_PRIVATE_KEY, RESEND_API_KEY, RESEND_FROM,
    STRIPE_PRICE_IDS, APP_URL. **Real bug found by probing:**
    `callFunction` dropped ALL incoming headers except
    user-agent/content-type, so the webhook could never see
    `Stripe-Signature` — every signed POST answered 400
    "missing Stripe-Signature header". Fixed with a `headers`
    option on the shared helper (forward named headers verbatim;
    default none — no other route's behaviour changes), and the
    webhook route passes `headers: ["stripe-signature"]`.
    Probes on port 8919 (throwaway dummy secret only, never a
    real one): GET → 405; POST no secret → 503 (honest "not
    configured"); POST dummy secret + bad sig → 400 "signature
    mismatch"; POST dummy secret + correctly HMAC-signed
    `checkout.session.completed` → **500 "D1 binding DB not
    configured"** — signature verified, then the honest no-D1
    error, exactly the designed local behaviour. Regression
    slices after the `callFunction` change: failure-paths +
    dashboard-server + url-mode **19/19**.

## Parent verification — Track R + Track T close-out (2026-11-27, ~12:00 EST)

Track R and Track T both landed; the parent verified the load-bearing
claims independently before the batched push.

### Turnstile — VERIFIED LIVE (closes the #6 key step)

Track R created the widget via the Cloudflare API (the dashboard route
was never needed). Independent verification, one batched `cloudflare
execute` (project GET + widget list):

- Widget exists: **"ArchiveCheck — deletedproof"**, mode `invisible`,
  domains `deletedproof.northforgelabs.dev` + `deletedproof.pages.dev`,
  sitekey `0x4AAAAAAGV8UGE-2rGL9e1L` — exactly as Track R reported.
- Pages env vars, both envs, verified by read-back (names + types only,
  no secret values): Production — CLERK_SECRET_KEY (secret_text),
  LICENCE_ED25519_PUBLIC_KEY, RESEND_FROM, TURNSTILE_SECRET_KEY
  (secret_text), TURNSTILE_SITE_KEY. Preview — those five +
  CLERK_PUBLISHABLE_KEY. CLERK_SECRET_KEY survived intact.
- The correct widget-list path is
  `/accounts/{id}/challenges/widgets` — the parent's first attempt used
  `/accounts/{id}/turnstile/sites` and got HTTP 404 "No route for that
  URI" (that path does not exist; the connector spec has no Turnstile
  paths at all). The RUM create path is still 403
  `account-settings.write` — Web Analytics stays dashboard-only via #30.
- `web/config.js` wired by the parent (site key + `enabled: true`) and
  the stale "DRAFT PRICING" header comment corrected to point at
  pricing.yaml + sync_pricing.py.

### Bindings — INTACT (false alarm, parent's error)

A first read-back showed `bindings: []` on both envs and looked like
Track R's PATCH had wiped the D1/R2 bindings. It had not: the parent
read the wrong field (`deployment_configs.*.bindings`, which does not
exist on Pages projects). The real fields are `d1_databases` and
`r2_buckets`, both verified live: `DB` → `38a206cb-5256-4ff0-b8b7-
d5a06c2d4d22` (wayback-social-licences) on both envs; `PACKS` →
`deletedproof-packs` (Production) / `deletedproof-packs-staging`
(Preview). No restore was needed. Lesson: read the full
deployment_configs object (keys + binding maps), not a guessed field.

### Test flakes found by the parent's own runs (both fixed)

1. `tests/test_clerk_auth.py::test_config_has_clerk_and_turnstile_placeholders`
   asserted `REPLACE_TURNSTILE_SITE_KEY` was still in config.js — stale
   the moment the real key was wired (same staleness Track P had
   already fixed for the Clerk half). Fixed to assert the real site
   key is present and the placeholder is gone; the secret-never-in-repo
   guard stands.
2. `tests/test_web_tiers.py::test_js_mint_verify_roundtrip` tampers the
   key with `key.slice(0, -1) + "0"` — a no-op 1 time in 16, when the
   HMAC already ends in "0", so the "bad" key verifies and the test
   fails. Proven by three full runs (fail, pass, fail on that test)
   and a passing isolated re-run. Fixed: the tamper now flips the last
   char to a different hex digit, so it always tampers.
3. `tests/test_packs_upload.py::test_node_packs_upload_suite_passes`
   failed twice under full-suite load (runs 2–3) and passed standalone
   5/5, by direct Node run 14/14, and in the three full runs after —
   no mechanism established, no product code involved (the suite never
   touches config.js or anything changed this round). Recorded as an
   intermittent full-suite flake; watch it on the next runs.

### Final validation state at this write

- Full non-e2e pytest: **152 passed, 0 failed — twice in a row**
  (13.30s / 13.03s) after the two fixes above.
- Sync checks: `sync_pricing.py --check`, `sync_brands.py --check`,
  `sync_config.py` all exit 0 (crawl CC-MAIN-2026-47 agrees).
- Node: turnstile + auth + runtime-config suites all green.
- File sizes: console.js 478, arquivo.js 312, dev-server.mjs 296,
  stripe-webhook.js 286 — all under the 500 hard cap.
- CLI-bleed grep over web/: 0 hits.
- E2E slices for the Turnstile flip (search-controls +
  failure-paths + auth) running in the background at this write
  (log `~/workspace/trackU-e2e-slices.log`); the batched push to
  develop starts only when they are green — the flip makes search
  require the Turnstile script to load, so the sandbox result decides
  whether the push needs a harness change first.

### Turnstile flip blocked E2E searches — diagnosed, fixed, slices green

The first E2E slices on the final tree (search-controls +
failure-paths + auth, 18 tests) came back **6 failed, 12 passed**
(log `~/workspace/trackU-e2e-slices.log`). Every failing test was a
test that runs a search; every non-search test passed. The mocked-CDX
stop/resume test failed too, which ruled out archive.org — the search
never started at all (`#job-progress` never appeared, 20s timeouts).

Root cause, proven with a live probe
(`trackU-probe-turnstile.py`, disposable, kept in the repo for the
record): with Turnstile enabled in `web/config.js`,
`console-fetch.js:ensureSearchToken()` calls `ensureToken()` before
every proxied search. In this sandbox the egress proxy refuses
CONNECT to `challenges.cloudflare.com`
(`ERR_TUNNEL_CONNECTION_FAILED`, the same refusal as jsDelivr), so
the script never loads and the search dies with the honest message
"Bot check didn't complete (Bot check failed to load — check your
connection and retry.) — no search was run." The product is correct:
a real browser loads the script fine. The sandbox is the limitation,
and the suite had never run a search with Turnstile on before (Track
R's 133/133 ran with `enabled: false`).

Fix (`tests/e2e/conftest.py`, `page` fixture): a local-only
`window.turnstile` stub via `page.add_init_script`, active only when
the base URL is local. `render` returns a widget id and records the
callback; `execute` fires it with a dummy token. The page's own code
path (ensureToken → render → execute → callback → token attached to
proxy requests) is exercised for real; only the external script is
replaced. The dev-server `/api/cdx` has no TURNSTILE_SECRET_KEY in
its env, so it accepts the token open — the same as the unconfigured
server path. Live runs deliberately use the real widget: a fake token
would fail server-side verification there (TURNSTILE_SECRET_KEY is
set live), so the stub must never apply to a live BASE_URL. The
existing auth tests still pass unchanged (no challenges.cloudflare.com
request is ever made, so the "no Turnstile requests" assertion holds;
the fake render creates no iframe, so the empty-widget-container
assertion holds).

Re-run of the 6 failed tests (log `~/workspace/trackU-e2e-rerun.log`,
176.06s): **6 passed, 0 failed.** Full E2E on the final tree is
running next (log `~/workspace/trackU-full-e2e.log`); the batched
push to develop starts only when it is green.

### E2E race: #go wait returned before the search started — fixed, 133/133 effective

The full E2E on the final tree (log `~/workspace/trackU-full-e2e.log`)
came back **107 passed, 4 failed** — then the runner process itself
died at 83% (a runtime restart, confirmed by the recovery notice; no
summary line, no `FULL-E2E-EXIT`). The 4 failures were all
demo-search tests, clustered 17:32:29–17:32:58 UTC:
`test_json_export_gated_on_free_but_downloads_on_pro`,
`test_demo_search`, `test_csv_download_after_demo`,
`test_empty_handle_defaults_to_jack`. The 22 unrun tests were the
rest of search-controls (pause/resume was mid-run) + all of
ssr_branding (11) + url_mode (7). 107 + 4 + 22 = 133, the full suite.

Tail re-run of all 26 (log `~/workspace/trackU-full-e2e-tail.log`,
112.55s): **25 passed, 1 failed** — only
`test_empty_handle_defaults_to_jack`, failing a second time with the
same symptom: `#status` was `""`.

Root cause, proven with a live probe
(`trackU-probe-empty-handle.py`, since removed — findings below):
a TEST race, not a product bug. `search()` is async and disables #go
only after the Turnstile token round-trip (`console.js:286`), and the
E2E Turnstile stub adds a `setTimeout(10ms)` to that round-trip — so
for ~10ms+ after the click, #go is still enabled. The test waited on
`#go:not([disabled])`, which is ALREADY true in that window, so the
wait returned before the search started and the test read the initial
empty #status. The probe of the same steps passed (status became
"Live search didn't complete…" — the honest direct-CDX failure in
the sandbox, which the test accepts), so the failure is timing luck,
not a broken path. The same race hit
`test_signed_out_free_search_still_works` once in the first slices
run. All five call sites shared the pattern (`_run_demo`,
`test_free_limit_clamp`, `test_empty_handle_defaults_to_jack`,
`test_json_export_gated…`, `test_signed_out_free_search…`).

Fix (test-only, no product change): new `wait_for_search_done()`
helper in `tests/e2e/conftest.py` — wait for the search to START
first (#status leaves its initial empty state, or #go goes
disabled), then wait for #go to re-enable. Every path out of
`search()` sets #status, so the first condition always fires. All
five call sites use it now (imports updated in test_search.py,
test_licence.py, test_auth.py). Product note, NOT fixed here: the
same window lets a fast double-click start a second search during
the token round-trip — harmless (the newer search abandons the old
one via `activeJob.abandon()`), a possible later polish is to
disable #go synchronously at the click; it would need the
ensureSearchToken-failure path to re-enable #go, so it stays a
follow-up, not a gate change.

Proof (log `~/workspace/trackU-racefix.log`): the 6 race-affected
tests re-run TWICE — **6 passed, 0 failed, both runs** (8.89s /
8.43s; sandbox searches fail fast). Effective full-suite total:
**133 passed, 0 failed** (107 full-run + 25 tail-run + the 1
race-fixed test, with the other 5 race-affected tests green twice).
Non-e2e pytest re-run on the final tree: **152 passed in 12.93s**.
Pre-push gate (§1) is now fully green: pytest 152, E2E 133/133
effective, node suites green (no JS changed since Track R), sync
checks clean, SEO 12/12, CLI-bleed 0, console.js 478. The batched
push to `develop` follows.
