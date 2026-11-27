# Web search UX — diagnosis, controls, date picker, copy

The web console (`web/index.html` + `web/console.js` + `web/modes.js`)
is the public face of ArchiveCheck. This page records the work done
on it in the 2026-11-26 pass: the failing search, search controls,
the date picker, the 2006 date bug, the 50%-off copy, the licence
lockdown, the CLI-bleed audit, and the multi-source copy rewrite.
GitHub issues: #16 (remove CLI box), #17 (live search fails — CORS),
#18 (all-network search), #21 (live free search broken — John's
screenshot), #22 (multi-source copy).

Related code: `web/search-job.js` (job state machine),
`web/vendor/flatpickr/` (vendored date picker),
`functions/api/cdx.js` (CDX proxy), `scripts/dev-server.mjs`
(local server that runs the real Function).

## 1. The failing search — diagnosis and fix

**Symptom (live v1.3 build, John's screenshot 2026-11-26 15:18 EST):**
"Live search failed (archive.org may block browser requests / CORS)",
plus the yellow CLI fallback text, plus the 2006 demo sample shown
as the result.

**Root cause, reproduced locally:** the page fetched CDX directly
from `web.archive.org`, which sends no CORS headers — the browser
blocks it. The page then fell back to the built-in demo sample and
showed it as if it were a result. The proxy (`functions/api/cdx.js`)
existed and worked when invoked directly in Node (HTTP 200, real CDX
rows), but the page only used it on non-localhost hosts, and the
local test server had no Function — so the proxy path was never
exercised before deploy.

**Fix:**
- `cdxBase()` (`web/console.js`) uses the same-origin proxy
  (`/api/cdx`) on every non-localhost host, and `?cdx=proxy` /
  `?cdx=direct` forces either path for testing.
- `scripts/dev-server.mjs` serves `web/` and routes `/api/cdx`
  through the real Function handler, so the proxy path is testable
  locally.
- `fetchPattern()` throws on HTTP errors / non-JSON / abort — a 504
  used to look exactly like "no captures found".
- A failed search shows NOTHING as a result: plain failure text, a
  Retry button, a direct `web.archive.org/cdx` link for the same
  query, and a clearly-labelled verified sample (`modes.js`
  `showFailure()`). There is no CLI fallback anywhere — see §7.
- Turnstile: the proxy requires a token only when
  `TURNSTILE_SECRET_KEY` is set (`functions/api/cdx.js`). It is not
  set, and `web/config.js` has Turnstile disabled with a placeholder
  site key — so the free search is open and the bot check is a no-op
  until the human step in `docs/clerk-auth.md` §6. Nothing in the
  free-search path depends on Turnstile being configured.

## 2. Search controls — progress, Pause / Stop / Resume

`web/search-job.js` (~250 lines, DOM-free core + thin DOM binding):

- `SearchJob` runs one step per CDX pattern (single search) or per
  network (broad search). States: idle / running / paused / stopped /
  done / failed. A step that throws is recorded, not fatal — the job
  is `failed` only when every attempted step failed.
- `pause()` halts between steps; `stop()` aborts the in-flight
  request and keeps partial results, labelled "stopped, partial
  results"; `resume()` continues with the remaining steps only (an
  aborted step is retried — it never finished).
- `complete()` ends the job early as DONE when the row limit is
  reached.
- `settled()` / `waitForResume()` / `abandon()`: after a stop, the
  console (`search()` in `console.js`, `searchBroad()` in
  `modes.js`) renders the partial results, then waits for a resume
  and re-renders when the resumed run settles. A newer search
  abandons the old job so it can never overwrite the new results.
  Without this loop, resumed rows were fetched but never rendered.
- `bindSearchControls()` wires the progress bar (`#job-progress`,
  `#job-fill`, `#job-text`) and the Pause / Stop / Resume buttons
  (`#job-pause`, `#job-stop`, `#job-resume`). Buttons read the
  current job off `btn._wsJob`, so re-binding is safe.
- `inRange(ts, from, to)` checks a CDX timestamp against the
  YYYYMMDD window.
- Toasts are in-house (`showToast()` in `search-job.js`, 6s, no
  dependency) — no toast library was added; see §9.

The status line names the current step and the captures found so
far ("Searching X / Twitter — pattern 1/2 — 12 capture(s) so far
(0/2 patterns)"), and `finishSearch()` labels stopped / partial /
incomplete results honestly, including the stopped-with-zero-rows
case ("Search stopped before any captures were found — no results
yet. Resume to continue with the remaining patterns.").

## 3. Date picker — flatpickr 4.6.13 (MIT), vendored

- Component: **flatpickr 4.6.13**, MIT licence, source
  https://github.com/flatpickr/flatpickr (jsDelivr:
  https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/). Vendored locally
  in `web/vendor/flatpickr/` (`flatpickr.min.js`,
  `flatpickr.min.css`, `dark.css`, `LICENSE.md`) — no CDN, no
  tracker, works offline. No alternative was needed: the vendored
  files fetched cleanly (HTTP 200, version/licence confirmed).
- Wiring (`initDatePickers()` in `web/console.js`): FROM/TO are a
  date range; `dateFormat: "Ymd"` feeds the CDX from/to params as
  YYYYMMDD, the visible alt input shows a human date ("January 1,
  2020"), `allowInput` keeps manual typing, min/max cross-constraints
  (From sets To's minDate, To sets From's maxDate), clear buttons
  (`#from-clear`, `#to-clear`) empty the field and lift the
  constraint. Exposed as `window.WS_DATEPICKERS` for tests. If the
  vendored file fails to load, the plain YYYYMMDD inputs keep working
  and the clear buttons still clear them.
- **Bug found by the E2E test, fixed in this pass:** flatpickr's
  built-in string parser reads a string with `dateFormat: "Ymd"`, so
  `setDate("2023-12-31")` was mis-parsed as **2023-01-01** (the
  dashes break its token scan; a `Date` object parsed fine).
  `parsePickerDate()` in `console.js` is now the pickers' custom
  parser: it handles ISO (`2023-12-31`), compact (`20231231`) and
  long (`December 31, 2023`) input, so a typed date or a `setDate()`
  string can never silently land on the wrong day. Covered by
  `test_date_picker_sets_yyyymmdd` (setDate strings + typed ISO +
  typed compact).

## 4. Date stuck at 2006 — the sample must respect the range

Cause: the live search failed (CORS) and the page fell back to the
built-in demo sample — ONE fixed capture, jack's first post
2006-03-21 — which ignored the date inputs entirely. The form said
From 20200101 / To 20231231 and the results said "1 captures, 2006
earliest, 2006 latest".

Fix (`loadSample()` in `web/modes.js`): the sample is checked against
From/To via `inRange()`. If 2006 falls outside the range, no rows are
shown and the page says so: "The verified sample is from 2006-03-21,
outside your Jan 1, 2020 – Dec 31, 2023 range — so it isn't shown as
a result. Clear the dates or widen the range to see it." In range,
it loads and is labelled "Verified sample — NOT a live result".
The real search applies from/to to the CDX query (`fetchPattern()`
sets `from`/`to` params) — verified end to end via the proxy, §10:
20 rows, all in 2020–2023. No row outside the user's range is ever
shown as a result without labelling why.

## 5. "50% OFF" — why + how long

The launch discount had no explanation. The fix is copy, not a
timer: there is no backend buyer count, and a live countdown would
be invented.

- `pricing.yaml` launch note (single source of truth, re-synced with
  `scripts/sync_pricing.py` into `web/config.js` LAUNCH_NOTE and
  `wayback_social/plans.py`): *"Early-bird launch offer for our
  first buyers: launch prices end after the first 90 days or the
  first 500 buyers, whichever comes first — then regular prices
  apply."*
- `renderPlans()` in `web/console.js`: each paid card shows the
  launch note plus "This pack: $X now, $Y after launch" next to the
  struck-through regular price. Values come from `pricing.yaml` —
  no new numbers are hardcoded. Regular prices: Starter $19,
  Pro $29, Studio $99, Bundle $147.

## 6. Licence lockdown — demo keys are never "verified"

The web demo verification uses a well-known public demo secret
(`LICENCE.demo_secret` in `web/config.js`, `DEMO_SECRET` in
`web/licence.js`). The page previously said "Licence verified" with
no distinction. Now, in `web/console.js` (`verifyLicence()`,
`applyTier()`, `isDemoKey()`) and `web/dashboard.html` (render +
verify handler):

- Accepting a key says: *"Demo key accepted — [tier] tier preview
  unlocked on this device only. This is NOT a purchase: demo keys
  are checked locally against a public demo secret and prove nothing
  about payment. Real licence keys are verified server-side and
  arrive by email after purchase."*
- The tier badge shows "(demo key)" and the licence status reads
  "Demo key active: … Not a purchase."
- The demo flag is stored as `ws_licence_demo=1` in localStorage and
  cleared with the key. A signed-in linked account (`WS_AUTH`) is
  not a demo key.
- The production flow (Ed25519 keys from the Paddle webhook, issue
  #4) is NOT invented — the distinction is UI copy + code comments
  only. The licence section copy also states the tier benefit
  honestly: caps, networks, exports, deleted-diff, and more archive
  sources (Arquivo.pt, Common Crawl, multi-archive evidence packs
  in Studio).

## 7. CLI-bleed audit — final, all public surfaces

John's rule: the CLI is internal-only. The public web must never
mention the command line. The audit (2026-11-26, after all edits in
this pass) greps `web/*.html`, `web/*.js`, `web/*.txt`, `web/*.xml`
for `pipx`, `pip install`, `command line`, `use the CLI`, `prefer
the command`, and CLI invocations (`wayback-social archive|find|
batch|diff|live|evidence|licence`):

- **Zero hits.** No CLI text remains anywhere in the web tree.
- **Failure-notice paths covered explicitly** (that is where the
  bleed lived): `showFailure()` in `modes.js`, the `fail()` fallback
  in `console.js`, the `#fail-actions` block (Retry search / Load a
  verified sample / Open this query on web.archive.org), the demo
  button, the sample text, the checkout dialog, the licence section,
  the dashboard, and the preset descriptions. All clean — a failed
  search offers retry, a direct CDX link, and the labelled sample.
  Nothing tells the visitor to run a command.
- **What stays (deliberate):** the footer GitHub link +
  GPL-3.0 + "Based on waybacktweets (Twitter-only)" credit line;
  the honest-limits copy; the words "click" (false positives in
  John's grep — these are ordinary UI verbs, not CLI references).
- The live site still shows the old CLI block because live is the
  v1.3 build — it ships with the batched push, not before. The
  removal is verified in the local tree (zero hits) and by the
  Playwright acceptance test, which asserts the rendered page
  contains none of `pipx`, `command line`, `use the CLI`, `Prefer
  the command line`, `Verified sample` after a successful search.

## 8. Multi-source copy rewrite (issue #22)

The product searches more than the Wayback Machine, but the pages
said "Wayback" everywhere. Rewritten to multi-source framing:

- Title / OG / Twitter / JSON-LD: "ArchiveCheck — Find deleted
  posts across the web archives". Meta/OG/Twitter/JSON-LD
  descriptions: "Search archived posts from X, Instagram, TikTok,
  YouTube, Reddit and more — across the Wayback Machine, Arquivo.pt,
  Common Crawl and live social APIs. Find deleted posts — free
  search; one-time packs from $9."
- Hero: the sibling's title ("Find deleted posts & check any profile
  in the archive") was kept. New sources line under the tagline:
  "Sources: live search on this page checks the Wayback Machine's
  archive. ArchiveCheck also checks Arquivo.pt, multi-archive
  TimeMaps (MemGator), Common Crawl, and live Bluesky, Mastodon and
  YouTube posts."
- Honest limits, reworded for all sources: "archiving is uneven by
  network and by archive — some networks are barely saved anywhere,
  and live sources only know about posts that are still up. Post
  URLs that don't contain the username (YouTube watch URLs,
  Instagram /p/ codes, Pinterest pins) can't be listed per-user —
  check a single post URL on web.archive.org directly instead. Deleted posts keep
  their archived snapshot link."
- Search status: "Searching the archives — this can take 20–60s…"
  (was "Searching the Wayback Machine — …").
- Apex brand `metaDescription` in `web/branding.js`: same
  multi-source wording. The other four subdomain brands never
  mentioned Wayback.
- **Honesty note:** the web console's live search queries the
  Wayback Machine CDX via the proxy — that is the only archive the
  browser calls today (`fetchPattern()` → `/api/cdx`). Arquivo.pt,
  MemGator, Common Crawl and the live Bluesky/Mastodon/YouTube APIs
  are checked by the product (CLI: `arquivo.py`, `archives.py`,
  `cc_jobs.py`, `live.py`; tier mapping in `docs/data-sources.md`:
  Arquivo.pt Starter, Common Crawl Pro, MemGator Studio). The page
  says "ArchiveCheck also checks …" (the product), and "live search
  on this page checks the Wayback Machine's archive" (this page) —
  it does not claim the browser queries sources it doesn't.
  Wiring those sources into the browser search is future work, not
  copy.
- Keywords: kept one "wayback machine social media search" phrase
  (that is what people search for — SEO, not the product name) and
  added "web archive search, arquivo.pt, common crawl social media
  search".
- `web/sitemap.xml` + `web/robots.txt`: pointed at
  `wayback-social.pages.dev`, which does not exist — now
  `deletedproof.pages.dev`. The sibling's canonical is now
  `https://archivecheck.com/` (production domain, not yet bought —
  flag for the push checklist; the sitemap/robots use the live
  Pages host until the domain is bought).
- "Wayback" remaining in user copy is only ever the source name
  ("the Wayback Machine's archive", "across the Wayback Machine,
  Arquivo.pt, …") plus the waybacktweets credit. The product name is
  never "Wayback". Code identifiers (`WAYBACK_SOCIAL_CONFIG`,
  `WAYBACK_LICENCE`) and file header comments still carry the legacy
  repo name — internal only, not user copy.

## 9. Third-party components

| Component | Version | Licence | Where | Notes |
|---|---|---|---|---|
| flatpickr | 4.6.13 | MIT | `web/vendor/flatpickr/` (vendored JS+CSS+LICENSE) | Date range picker; no CDN, no tracker |
| (none other) | — | — | — | Toasts are in-house (`showToast`, `search-job.js`); no toast/notification library was added — the page did not need one |

Every addition is MIT, vendored, tracker-free. No other third-party
component was added in this pass.

## 10. Acceptance verification — John's screenshot flow

The screenshot (live v1.3, app. subdomain, 2026-11-26 15:18 EST)
is the acceptance test: a signed-out free user must be able to
pick dates, run a free search that works via `/api/cdx`, have the
range applied, see no CLI text, and see progress + Pause/Stop/Resume.

**What was run locally (real proxy path, real archive.org, no
mocked CDX):**

- Dev server: `node scripts/dev-server.mjs 8902` (serves `web/`,
  routes `/api/cdx` through the real `functions/api/cdx.js`).
  Page: `http://127.0.0.1:8902/?cdx=proxy`.
- Manual end-to-end (before the resume-loop + `parsePickerDate`
  fixes): search jack / X, From 20200101 / To 20231231 → "Found 20
  capture(s) for @jack on X / Twitter", 20 rows, all years 2023 —
  all inside 2020–2023.
- Playwright acceptance suite
  (`tests/e2e/test_search_controls.py`, `.venv-e2e`):
  `test_date_picker_sets_yyyymmdd`, `test_free_search_via_proxy_with_date_range`,
  `test_pause_resume_during_search`,
  `test_stop_keeps_partial_results_then_resume`,
  `test_sample_respects_date_range`.
  Each search test uses a fresh signed-out context (no licence key),
  sets the range through the picker, and asserts real rows in range,
  proxy usage (a `/api/cdx` resource request), progress visibility,
  pause/stop/resume behaviour, and zero CLI/demo bleed on the page.
  The pause/stop tests delay the first `/api/cdx` request by 25s so
  the controls can be exercised while the search is in flight.
- Results: **5/5 passed, 2026-11-26** (full run in TEST-REPORT.md):
  - `test_date_picker_sets_yyyymmdd`: PASSED (including the
    `parsePickerDate` regression: typed ISO `2023-06-15` →
    `20230615`, typed compact `20231231` → `20231231`).
  - `test_sample_respects_date_range`: PASSED (2020–2023 → sample
    refused with the out-of-range message and 0 rows; dates cleared
    → sample loads, labelled "NOT a live result", 1 row).
  - `test_free_search_via_proxy_with_date_range`: PASSED — free,
    signed-out, jack / X, 2020–2023 → "Found 20 capture(s)", 20
    rows, every row dated 2020–2023, a `/api/cdx` resource request
    observed, zero CLI/demo bleed on the page.
  - `test_pause_resume_during_search`: PASSED — pause shows
    "paused", resume completes with rows.
  - `test_stop_keeps_partial_results_then_resume`: PASSED — stop
    shows "stopped … no results yet", resume completes with rows.
  - The three live-search tests ran together in 172.30s
    (archive.org is slow; each CDX fetch is 30–90s).

**What still needs the live deploy to prove (NOT claimed done):**

- The batched push itself (this work ships with branding wiring,
  SSR titles, Clerk, Paddle webhook, MemGator wiring — one push,
  then full validation; John's push discipline, MEMORY.md).
- After the push: live checks on all 6 domains
  (`deletedproof.pages.dev`, `deletedproof.northforgelabs.dev`,
  `app.` / `verify.` / `osint.` / `legal.`), live free search with
  a date range on `app.`, CDX proxy end-to-end on Cloudflare
  (the Function runs on Cloudflare's network — archive.org must
  answer it there, not just from this VM's Node), per-subdomain
  branding, and the screenshot flow re-run live. Local-only
  evidence never closes #21/#22.
- The live site being stale is why John still sees the failure —
  the push is the unblocker, not a code fix.

## 11. How to verify (commands)

```bash
cd ~/workspace/wayback-social
.venv/bin/python -m pytest -q            # Python suite (140 passed, 1 skipped)
node web/search-job.test.js              # search-job state machine (54 checks)
node web/modes.test.js                   # broad-search fetch timeout (11 checks)
node web/branding.test.js                # per-subdomain branding (121 checks)
.venv/bin/python scripts/seo_check.py    # SEO checks against a local server (12/12)
.venv-e2e/bin/python -m pytest tests/e2e/test_search_controls.py -v   # acceptance (~5 min)
```

## 12. Known gaps / open items

- Canonical in `web/index.html` is now `https://archivecheck.com/`
  (sibling's change in this batch) — the domain is not bought yet.
  The sitemap/robots use `deletedproof.pages.dev` (live now).
  Decide the canonical at push time.
- Turnstile is not configured (no site key, no secret) — the proxy
  is open by design until the human step in `docs/clerk-auth.md`
  §6. That is the correct state for launch, not a bug.
- MemGator: no self-hosted instance — the code reports
  not-configured honestly; the copy names it as a product source.
- Paddle webhook → licence minting → D1 → Resend is not built
  (issue #4) — production keys do not exist yet, which is why the
  demo/production licence distinction in §6 matters.
- YouTube Data API key exists (Google Cloud project `archivecheck`)
  and is being stored as Pages env var `YT_API_KEY`; the API PATCH
  returned HTTP 500 twice — dashboard UI task.
- `web/console.js` / `web/modes.js` / `web/index.html` were edited
  concurrently by sibling agents in this batch — re-read before
  editing; prefer surgical edits.

## 13. Stop-test failure (2026-11-26 evening) — diagnosis: CDX stall, not the resume path

**Symptom:** `test_stop_keeps_partial_results_then_resume`
(`tests/e2e/test_search_controls.py`) timed out after 240s waiting
for `#status:has-text('Found')` after Stop → Resume. Reproduced
twice: once in the 4-test set (416s, the other three passed), once
isolated (268s).

**Root cause, one line:** the resumed CDX fetch stalled at
archive.org — the CDX API was flapping (503 / "Temporarily
Offline" / connection stalls) — and no link in the chain has a
timeout, so the fetch hung until the test's 240s wait expired.

**Evidence (each checked, not assumed):**

- *The resume path works.* Deterministic repro with a stubbed
  archive: the real `scripts/dev-server.mjs` + real
  `functions/api/cdx.js` + real page code, only the upstream
  archive replaced by a stub returning canned CDX rows after a 2s
  delay (`/tmp/stub-cdx.mjs`, not in the repo). The isolated stop
  test **PASSED in 33.39s**. The stub log shows the aborted first
  request *did* reach the server (Playwright's route handler
  continues it at T+25s even though the browser aborted the fetch)
  and the resumed request arrived 0.2s later; both completed with
  20 rows. Stop → Resume → "Found" is sound.
- *The dev-server abort fix works.* Standalone repro
  (`/tmp/repro-abort.sh`): start the server, fire `/api/cdx`,
  abort the client at 3s while the upstream fetch is still pending
  (15s stub delay). The server stayed alive (GET / → 200
  immediately after, process alive), the aborted upstream fetch
  completed server-side, and a fresh `/api/cdx` returned 200 with
  rows. The original crash mode — unhandled rejection writing the
  full archive.org body to the destroyed socket — is gone.
  (`clientGone()` / `safeEnd()` in `scripts/dev-server.mjs`.)
- *The stall is real and current.* At diagnosis time the CDX API
  returned 503, then five consecutive 10–20s timeouts (curl 000),
  while example.com answered 200 in 0.7s, arquivo.pt 200 in 1.4s,
  and web.archive.org's homepage 200 in 1.0s — general egress fine,
  archive.org's front fine, the CDX API itself hanging. Earlier
  the same evening CDX answered 200 in 1.5s right after a failed
  run: it flaps on a minutes timescale. The free-search and broad
  tests passed in the same run 1 because CDX happened to answer
  during their windows.

**Fix in this pass — searchBroad timeout (`web/modes.js`):**
`searchBroad` had no fetch timeout at all (verified by grep: no
`timeout` / `AbortSignal` / `setTimeout` in `modes.js`). New
`fetchPatternTimed()` wraps each pattern fetch in an
AbortController + 120s timer (normal CDX is 30–90s, so 120s is
above the healthy range with headroom and bounds every stall).
The timeout error is a distinct `TimeoutError`, not an
`AbortError` — `checkNetwork()` re-throws AbortError (a real Stop)
but counts any other error as a failed pattern, so a stalled
pattern is recorded and the job continues with the next pattern /
network instead of stopping the whole job as if the user hit Stop.
`timeoutMs` is injectable on `fetchPatternTimed()` /
`checkNetwork()` for tests (production default 120s). Worst-case
bound for a broad search is now 3 networks × 3 patterns × 120s
≈ 18 min pathological; the healthy case is unaffected.

**Verification of the timeout:**
- `web/modes.test.js` (new, node `vm` harness with stubbed browser
  globals — `modes.js` is a browser script): **11/11 checks** —
  120s default, fast fetch resolves, stalled fetch throws
  TimeoutError promptly, a real job abort still propagates as
  AbortError, a timed-out pattern is counted while the next pattern
  runs, all-stalled returns a failed network without hanging.
  (Test-writing note: a stub fetch that ignores its signal never
  settles, and Node then exits when the timer fires instead of
  rejecting — the stubs must reject AbortError on abort, like real
  `fetch()` does.)
- End to end: broad search against the stub with one Instagram
  pattern stalled forever — **PASSED in 132.73s** ("found on 1/3
  networks"). Stub log shows the stalled fetch timing out at
  exactly +120s and the job continuing to the next pattern.
- Full suite after the change: pytest **140 passed, 1 skipped**;
  search-job **54/54**; branding **121/121**; modes **11/11**.

**Not changed (deliberate):** the single-search path
(`fetchPattern()` in `console.js`) still has no timeout — a stalled
CDX fetch there hangs until the caller gives up. The stop test
passes when CDX answers (proven by the stub run); adding a timeout
there would only change the failure mode (fast honest failure
instead of a 240s hang), not make the test pass while CDX is down.
Follow-up if wanted: apply the same `fetchPatternTimed` wrapper in
`console.js` `search()`.

**Proof status — real runs vs the live archive (DONE 2026-11-26 evening):**
CDX recovered after ~20 minutes down (probe: 200 in 9.0s) and both
real runs passed while it was up — the isolated stop test **PASSED
in 58.47s**, then the 4-test set **4/4 passed in 321.35s** (broad,
free search, stop/resume, sample). CDX flapped shut again right
after the set (curl 000), which is consistent with the stall
diagnosis: the tests pass when CDX answers and hang when it
doesn't. Full suite after the change: pytest **141 passed, 1
skipped** (baseline was 140 — the +1 is a sibling's Paddle webhook
test that landed in the shared tree meanwhile; 0 failures),
search-job **54/54**, modes **11/11**, branding **121/121**, SEO
**12/12**. No push to GitHub (per task); the stop-test fix is
proven against the live archive.

## 14. Single-post-URL mode (Track K item 2, 2026-11-27)

The console had no equivalent of the CLI's `--url`: post URLs
that don't contain the username (YouTube watch URLs, Instagram
`/p/` codes, Pinterest pins) can't be listed per-user, and the
honest-limits copy told readers to check the URL on
web.archive.org directly instead. The mode now exists, so the
workaround wording is gone from `web/index.html` (honest-limits
line) and the Instagram guide
(`web/guides/find-deleted-instagram-posts/index.html`).

- **UI:** a "single post URL" field in the search form
  (`#post-url`, next to the network/handle row). Paste a full post
  URL to check that one post instead of a whole handle; leave it
  empty to search by handle. The network is detected from the link.
- **Tier rule (verified in `wayback_social/plans.py`):** there is
  NO feature flag for URL mode — `PLAN_FEATURES` has no url /
  single_url entry. It is a URL-pattern search, not keyword search,
  so it is NOT gated: every plan can use it, and the only cap that
  applies is `archive_limit` (Free 25 / Starter 250 / Pro 2,500 /
  Studio 25,000 captures per search). There is no "needs Pro"
  dialog for a URL.
- **Detection mirrors the CLI** (`web/url-mode.js`,
  `detectNetwork` = `wayback_social/networks.py::detect_network`):
  host substring match in the same order (twitter.com/x.com →
  x, instagram.com, facebook.com, tiktok.com, youtube.com/youtu.be,
  reddit.com, linkedin.com, threads.net, bsky.app, pinterest.com,
  tumblr.com, twitch.tv, medium.com) + the Mastodon fallback
  ("mastodon" in the URL, or a `/@handle/<digits>` path).
- **Behaviour:** the pattern is the exact URL — no wildcard, no
  `{id}` substitution (`fetchSingle`'s replace is a no-op on it).
  The Arquivo per-handle-listing gate is skipped for a URL
  (Arquivo.pt CDX answers any exact URL — so Instagram +
  arquivo-only now runs, where a handle search would have been
  refused). Broad search and keyword search don't combine with a
  URL (both are handle/text searches): a URL + keyword shows an
  honest "can't be searched together" message and runs NO fetch;
  broad is ignored when a URL is set. A bad URL (no scheme,
  unknown host) is an honest `#status` error and NO fetch runs.
- **Plumbing:** `console.js` `search()` branches on `#post-url`
  (one Wayback step for the exact URL; `arquivoSteps` gains a
  `urlPattern` option — one CDX step, label "Arquivo.pt — this
  post"); `modes.js` `showFailure` uses the exact URL for its
  direct-CDX / arquivo.pt link (`failQ.url`); `finishSearch`
  says "Found N capture(s) of this post on X." and the no-rows
  message is post-URL-aware. CSV/JSON exports use `lastId` (the
  search's identifier — the URL in URL mode, the handle otherwise)
  instead of the handle box, which still holds "jack" after a URL
  search. History records the URL as the handle; the dashboard
  re-run link pre-fills `#post-url` when `?handle=` looks like a
  URL (console.js init + dashboard.html cell, which drops the
  `@` prefix for URL entries).
- **Files:** `web/url-mode.js` (73 lines, detection + validation),
  `web/console.js` (URL branch; 467 lines — 33 under the 500 cap
  after the Track K split made room; the next edit must split it,
  not grow it), `web/arquivo.js` (`urlPattern` branch; 305 lines),
  `web/modes.js` (`showFailure` override), `web/index.html`
  (field + helper text + honest-limits line), `web/dashboard.html`
  (history cell).
- **Proof:** `web/url-mode.test.js` **31/31** (detection, validation,
  bad URL + zero fetches, URL + keyword + zero fetches, free-tier
  runs, exact-URL pattern through both proxies, Instagram +
  arquivo-only gate skipped); `tests/e2e/test_url_mode.py` **7/7**
  (mocked UI + the ONE live probe: real jack/status/20 through the
  dev-server proxy, both proxies answering — CDX 4+ captures,
  Arquivo.pt 1 capture, verified by curl through the dev-server
  proxy before the E2E run, 2026-11-27). Live-probe evidence is in
  TEST-REPORT.md (Track K).
