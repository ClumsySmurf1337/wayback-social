# DeletedProof — Other Data Sources

**Date:** 2026-11-26. **Status:** research for the build queue — no code
changed. Companion docs: `docs/branding-seo-plan.md` (name/pricing),
`docs/cloudflare-hosting.md` (Pages plan), `docs/data-sources-cloudflare.md`
(Cloudflare primitives). Auth/storage detail lives in
`docs/storage-auth-plan.md` (sibling research, read it before building
login). Competition context:
`~/workspace/research_notes/wayback-social-competition-20261126-1841/report.md`.

## Standing rule — FREE SOURCES AND FREE TIERS ONLY (John, 2026-11-26)

**Until there are paying customers: no paid data sources, no paid service
plans. Free sources only:** Wayback CDX, Arquivo.pt, Ghostarchive,
Common Crawl, Bluesky/Mastodon live APIs, oEmbed, MemGator. **Free tiers
only:** Resend free (3,000 emails/mo), Clerk free (50k retained users),
R2 free tier (10 GB-mo), Cloudflare Web Analytics (free), YouTube Data
API free (10k units/day).

- **Never buy or subscribe to anything** for this project while the rule
  stands — no X API tier, no paid Reddit access, no paid archive APIs,
  no paid enrichment, no paid plan upgrades.
- If a feature needs a paid source or plan to work, **build the free
  path and log the paid option below as a later upgrade gated on
  customers** — do not reach for the paid option.
- This rule applies to every track and every future change, not just
  this doc. It supersedes any earlier "evaluate paid option" language
  in this repo; where this doc previously suggested a paid path, the
  paid path is now a gated upgrade, not a build item.

### Paid options — LATER UPGRADES, gated on paying customers (do not build)

| Paid option | What it would unlock | Gate |
|---|---|---|
| X API (Basic $100/mo / Pro $5,000/mo) | Live X lookups, higher rate limits, full-archive search | Paying customers; only if free CDX/oEmbed path stops working for the tier that needs it |
| Reddit API (paid data access) | Live Reddit user/subreddit checks (currently dead without OAuth) | Paying customers; archive-only until then |
| Paid archive APIs / enrichment (e.g. commercial CDX mirrors, entity enrichment) | Faster/broader coverage, structured enrichment | Paying customers; free sources cover v1 |
| Clerk paid tier (>$1,025/mo cliff after 50k retained users) | >50k retained users | Auth spend passes ~$100/mo — then evaluate Better Auth (MIT, D1-native, $0/user) first; see `docs/cloudflare-auth-options.md` §7–8 |
| Cloudflare Workers Paid ($5/mo) | >100k Functions req/day | Traffic exceeds the free tier |
| Resend paid / Paddle paid tiers | Higher email volume, lower fees at scale | Paying customers + volume need |

**Verification method:** every "verified" claim below was probed live from
this VM on 2026-11-26 (curl, public endpoints, no auth, no account) unless
marked "cited" (taken from a named source, not re-probed). Star counts are
from the GitHub API the same day; where the shared-IP rate limit blocked
the API, the count is marked "unverified".

## 0. Live verification 2026-11-27, 00:24–00:28 UTC (fresh round)

Every source re-probed live from this VM; exact commands in
TEST-REPORT.md ("Archive sources verification"). No stale claims —
anything that changed since 2026-11-26 is corrected in §1/§2 below.

| Source | Verdict | Live evidence (2026-11-27) |
|---|---|---|
| Wayback CDX | **working** | `archive x jack --limit 2` → "Found 4 capture(s). Parsed 4 post(s)"; `sources` probe closest snapshot 20260723100538 |
| Arquivo.pt CDX | **working** | `arquivo jack --limit 5` → 5 results; real rows: jack status 1026984242893357056, captures 2018-08-09..14, status 200. Embargo note printed every run |
| Arquivo.pt keyword | **working** | `arquivo jack --keyword jack --plan pro` → 5 results (full-text, URL-filtered to the handle). `--keyword twttr` → 0 results, honest empty. JSON export needs Starter+ (free gets CSV — tier gating works) |
| Ghostarchive | **working, now with dates** | Search page 200 (5,318 bytes); 7 captures of jack/status/20, 2022-01-14..2024-04-14; `/archive/AJzyo` → 200 live. Parser now extracts capture dates into `archived_timestamp` (`archives.py`, 2 new tests) |
| Common Crawl | **degraded but proven end-to-end** | `collinfo.json` 200; latest crawl CC-MAIN-2026-47 (6–19 Nov 2026). Index 504s on most attempts (single URL, wildcard, CC-MAIN-2026-47 and -43). Async job flow proven: queue → 504 (honest error) → retry → **done, 134 captures for example.com** (first row 20261106154953, status 200). `jack/status/20` → empty, honest (Nov 2026 crawl has no capture of it). Async-only is the right design — never in the live path |
| archive.today | **links-only (by policy), endpoint alive** | Timemap with `Accept: application/link-format` → 200, 38 mementos for jack/status/20. Without that header the same URL returns the HTML landing page (200, 59 KB, 0 mementos). Stays links-only: Wikipedia blacklisted it 21 Feb 2026, it 429s/CAPTCHAs — never fetched server-side in bulk, never legal evidence |
| MemGator (local) | **working** | 127.0.0.1:1208 TimeMap for jack/status/20 → 200, 50 mementos, first 2008-11-03 |
| MemGator (public URL) | **down** | `memgator.northforgelabs.dev` → 530 (Cloudflare 1033); egress proxy refuses CONNECT :7844. Tunnel restart is another track's job — `sources` reports it honestly as unavailable |
| Bluesky live | **working** | getProfile `bsky.app` → 200, `did:plc:z72i7hdynmk6r22z27h6tvur`; getAuthorFeed → 5 posts; `live bluesky bsky.app` CLI returns latest posts with dates/links |
| Mastodon live | **working** | lookup `Mastodon` → 200, id 13179, created 2016-11-23, 568 statuses; RSS → 200, valid XML (29 KB) |
| X oEmbed | **working** | 200 (after redirect); author jack, HTML contains "just setting up my twttr" |
| YouTube oEmbed | **working** | 200; title "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)" |
| TikTok oEmbed | **working** | 200; JSON with embed HTML |
| Reddit live | **dead (as expected)** | user JSON → 403. Archive-only label stays |

CDX flakiness: CDX answered fine throughout this round (00:24–00:28
UTC), after flapping the previous evening (503 / "Temporarily
Offline" / stalls, ~20 min down at a time). Retry-once policy stands.

**Ethics lines (non-negotiable, apply to every source here):** public posts
only. No account access, no DMs, no location, no monitoring/alerts, no face
recognition, no verdicts/scores, no minors. A source that needs *your* login
to someone else's account is out — see §2 X/Twitter.

## 0.1 Arquivo.pt as a web source (issue #8 follow-up, 2026-11-27)

The web console used to search Wayback CDX only. Arquivo.pt is now a
first-class source there (Track I, local only, unpushed):

- **Endpoint `POST/GET /api/arquivo`** (`functions/api/arquivo.js`,
  mirrors `functions/api/cdx.js`): `mode=cdx` proxies
  `arquivo.pt/wayback/cdx` for a URL pattern + `from`/`to`/`limit`;
  `mode=keyword` proxies `arquivo.pt/textsearch` (`q` + `handle`,
  URL-filtered server-side). Allowlisted params only; `limit`
  clamps to 1000; `from`/`to` must be YYYYMMDD (4-digit years get
  an honest 400 — arquivo.pt itself accepts years, the proxy does
  not). 5-min cache, 120 s upstream timeout → 504 "Arquivo.pt
  didn't answer in time", other fetch errors → 502, upstream
  non-200 forwarded. No API key — Arquivo.pt is free. The proxy
  normalises to CDX-array shape (header row first) so the client
  parses both archives identically; it also fixes doubled slashes
  and enforces the date range server-side.
- **Console selector** (`web/index.html` `#source`, `web/arquivo.js`):
  Wayback CDX (default) / Arquivo.pt / Both. Same SearchJob
  machinery (progress + Pause/Stop/Resume). Rows merge with dedup
  by exact (URL, timestamp), each row labelled with its source
  (Wayback / Arquivo.pt), per-source counts in the status line and
  the stats. A failure in one source never kills the other — the
  job reports per-source status honestly. Snapshot links point at
  arquivo.pt for Arquivo rows, web.archive.org for Wayback rows
  (CSV/JSON exports, citations, evidence packs all carry the
  right link and a `source` field).
- **Tier rules mirror the CLI exactly** (`licence.js` PLAN_CAPS
  `keyword_search`, drift-tested against `plans.py` PLAN_FEATURES
  in `tests/test_web_tiers.py`): CDX mode works on every plan;
  keyword search is Pro+ (free/starter blocked with the "Keyword
  search needs Pro" dialog before any fetch runs). Broad
  (all-network) search stays Wayback-only — Arquivo.pt CDX
  patterns exist for X, Bluesky and Mastodon only, and keyword
  mode would need a keyword field the broad form lacks (deliberate
  deviation, documented in TEST-REPORT.md).
- **Honest-limits copy** (the `#source-note` under the selector +
  the status line): ≥1-year embargo (nothing recent),
  Portuguese-weighted coverage, keyword = URL-substring match
  (not authorship — a match proves the URL contains the text, not
  that the handle wrote it), per-handle listing covers X /
  Bluesky / Mastodon only.
- **Live probes 2026-11-27 ~02:43 UTC:** CLI `arquivo jack
  --limit 5` → 5 results (jack status 1026984242893357056,
  2018-08-09..14, status 200). Dev-server proxy live:
  `/api/arquivo?mode=cdx&url=twitter.com/jack/status/*&limit=3&
  from=20180101&to=20191231` → 3 rows, same post, 2018-08-09/
  10/11; `/api/arquivo?mode=keyword&q=jack&handle=jack&limit=2`
  → 1 row, `https://evatjack.com/` — the URL-substring caveat
  in the flesh (the domain contains "jack"; it is not jack's
  post). **CORS: arquivo.pt sends `Access-Control-Allow-Origin:
  *`** on both endpoints, so direct browser calls work — the
  proxy is still primary on the deployed site (same-origin,
  Turnstile-checked, cached).
- **Rate-limit caveat:** 250 req/60 s per IP on both endpoints.
  Through the proxy every visitor shares the Pages Function's
  egress IP, so heavy site-wide use can hit the cap — the proxy
  surfaces that as an honest 502/504, never fake rows. If the cap
  bites in production, the fix is per-IP queueing or a second
  egress, not a paid plan (free sources only until customers).
- **Host-alias dedup (Track K item 3, 2026-11-27 — web side DONE):**
  the merge step no longer dedupes by exact (URL, timestamp).
  `web/url-alias.js` canonicalises the host before the key is
  built, so the same post stored under twitter.com by one archive
  and x.com by the other renders once in Both mode (Wayback wins
  the tie — it runs first). Different timestamps stay separate
  captures, so the stats range is preserved. Applied in the three
  places that held the exact key: `console.js` `addRow`, `batch.js`,
  `diff.js`; each falls back to the exact key if `url-alias.js`
  failed to load. Alias map (host-level only — two hostnames are
  aliases only when the same path means the same post):
  `x.com → twitter.com` (canonical: twitter.com — the bulk of the
  archive predates the 2023 rename); `www.` stripped and the host
  lowercased for every URL. Deliberately NOT mapped: `youtu.be` vs
  `youtube.com` (different path shapes — `youtu.be/<id>` vs
  `youtube.com/watch?v=<id>` — host normalisation alone could not
  dedupe those). Tests: `web/url-alias.test.js` 13/13 +
  `web/arquivo.test.js` Both + x.com / www blocks (36 checks total).
  **Still open (follow-up):** the CLI dedupes the same exact way
  (`wayback_social` merge — identical (URL, timestamp) key), so the
  same post can still appear twice in CLI output; and broad search
  (`modes.js` `checkNetwork`) counts both X patterns (twitter.com
  + x.com) — see TEST-REPORT.md Track K follow-ups.
- **Still CLI-only (next follow-ups):** replay-text fetch in
  the browser, batch watchlists / scheduled re-runs. Server-side
  evidence counting is BUILT locally (endpoint + dashboard wiring,
  Track F + Track L) but not live — migrations 0003/0004 are
  unapplied (need John's approval tap) and the live site is still
  v1.3. Ghostarchive + Common Crawl as web sources are DONE
  (Track L, §0.2/§0.3 below) — they left this list 2026-11-27.

## 0.2 Ghostarchive as a web source (issue #8 follow-up, 2026-11-27)

Ghostarchive is now a third source in the web console (Track L,
local only, unpushed), after Arquivo.pt (§0.1):

- **Endpoint `GET /api/ghostarchive`** (`functions/api/
  ghostarchive.js`, mirrors `functions/api/arquivo.js`): proxies
  `ghostarchive.org/search?term=<url>` for a URL or prefix +
  `from`/`to`/`limit`. Allowlisted params only; `limit` clamps
  to 1000; `from`/`to` must be YYYYMMDD. 5-min cache, 120 s
  upstream timeout → 504 "Ghostarchive didn't answer in time",
  other fetch errors → 502, upstream non-200 forwarded. No API
  key — Ghostarchive is free. The Function scrapes the search
  page server-side (a server fetch has no browser CORS issue)
  and parses the results table exactly like the CLI does
  (`wayback_social/archives.py` `search_ghostarchive`): one row
  per capture, an `/archive/<id>` link plus a capture date in
  the next cell (RFC 1123 → YYYYMMDDHHMMSS). Rows return in
  CDX-array shape (header row first) plus a Ghostarchive-only
  8th column: the `/archive/<id>` id — a Ghostarchive snapshot
  link cannot be built from (timestamp, URL) the way
  Wayback/Arquivo.pt links can. Rows without a parsable date
  keep an empty timestamp, never a faked one; when a date range
  is given, undated rows are dropped server-side (they cannot
  be proven in range).
- **Console selector** (`web/index.html` `#source`,
  `web/ghostarchive.js`): Wayback CDX (default) / Arquivo.pt /
  Ghostarchive / Common Crawl / All archives. Same SearchJob
  machinery (progress + Pause/Stop/Resume). Rows merge with the
  console's shared dedup (alias-aware since Track K — a
  Ghostarchive row for a twitter.com URL and a Wayback row for
  the same post under x.com render once), each row labelled with
  its source, per-source counts in the status line and the stats.
  A failure in one source never kills the other. Snapshot links
  point at `ghostarchive.org/archive/<id>` for Ghostarchive rows
  (CSV/JSON exports, citations, evidence packs all carry the
  right link and a `source` field).
- **Per-handle patterns: X and Bluesky only.** Ghostarchive
  treats the term as a prefix: `twitter.com/jack/status/`
  returns captures under that prefix; `bsky.app/profile/<handle>
  /post/` the same. Mastodon / Instagram / TikTok prefixes
  redirect to Ghostarchive's video search (`/vidsearch`), which
  has no results table — so those networks have no per-handle
  Ghostarchive listing and the console says so honestly instead
  of running a doomed query. Broad (all-network) search stays
  Wayback-only (deliberate, same as Arquivo.pt).
- **Honest-limits copy** (the `#source-note` under the selector
  + the status line): Ghostarchive coverage is uneven by
  network — it holds captures Wayback and Arquivo.pt missed,
  and misses plenty they hold. An empty result here is an
  honest "not in this archive", never a bug. Dates come from
  the results table; an undated row is shown undated.
- **Live probes 2026-11-27 05:34–05:43 UTC:** direct search
  page `twitter.com/jack/status/20` → 7 captures with dates
  (2022-01-14..2024-04-14, matches the CLI); prefix
  `twitter.com/jack/status/` → 14 archive links;
  `bsky.app/profile/bsky.app/post/` → 16 unique links;
  `mastodon.social/@Mastodon/`, `instagram.com/nasa/`,
  `tiktok.com/@tiktok/video/` → all 302 to `/vidsearch`
  (0 archive links). Dev-server proxy live:
  `/api/ghostarchive?url=twitter.com/jack/status/20` → 200 in
  1.5 s, 7 rows, 2022-01-14..2024-04-14; prefix + `limit=3` →
  200, 3 rows, oldest first.
- **Rate-limit caveat:** Ghostarchive is a small volunteer
  project with no published limit and no SLA. The proxy sends
  one request per search with a `wayback-social/1.0` UA; a 429
  surfaces as an honest error, never fake rows. No bulk use.

## 0.3 Common Crawl as a web source (issue #8 follow-up, 2026-11-27)

Common Crawl is now a fourth source in the web console (Track L,
local only, unpushed). Async by design — the index is slow and
flaky, and the web path respects that instead of pretending
otherwise:

- **Endpoint `GET /api/commoncrawl`** (`functions/api/
  commoncrawl.js`, mirrors `functions/api/arquivo.js`): proxies
  `index.commoncrawl.org/<crawl>-index?url=<pattern>&output=json`
  for a URL pattern + `from`/`to`/`limit` + `crawl` (validated
  `^CC-MAIN-\d{4}-\d{2}$`, default `CC-MAIN-2026-47` — the same
  default as the CLI; `scripts/sync_config.py` checks the web
  config, the Function default and the CLI default agree).
  Allowlisted params only; `limit` clamps to 1000; `from`/`to`
  must be YYYYMMDD. 5-min cache. No API key — Common Crawl is
  free. **The `*` is stripped before the query:** with
  `matchType=prefix` the index wants the bare prefix, not the
  wildcard (verified live 2026-11-27:
  `url=example.com/*&matchType=prefix` → 404,
  `url=example.com&matchType=prefix` → 200, 278 rows). A bare
  URL is queried exact (no `matchType`). Rows return in
  CDX-array shape (header row first) plus a Common-Crawl-only
  8th column: the crawl id.
- **Retry (the async design):** up to 3 attempts, 15 s per
  attempt, backoff 2 s then 8 s (worst ~55 s — inside the
  client's 120 s SearchJob bound; a Pages Function waiting on
  I/O does not burn CPU). A 404 is definitive ("no captures")
  and returns header-only immediately — not retried, not an
  error. After all attempts fail, the answer is an honest 504
  (timeouts) or 502 (last upstream status), never fake rows.
  The client wires it into the existing SearchJob machinery
  (progress + Pause/Stop/Resume, same as the Arquivo path).
- **Console selector** (`web/index.html` `#source`,
  `web/commoncrawl.js`): same five-way selector as §0.2.
  Common Crawl runs last in "All archives" mode (it is the
  slowest source). Rows merge with the console's shared dedup,
  each row labelled, per-source counts in the status line. A
  failure in one source never kills the other.
- **The index has no replay URL.** A Common Crawl capture is a
  WARC record, not a browsable snapshot: the archive link for a
  row points at the index record itself
  (`index.commoncrawl.org/<crawl>-index?url=<orig>&output=json`),
  honestly labelled in the UI. Never link a Wayback capture
  that may not exist. Per-handle patterns exist for all 14
  networks (the index answers URL-prefix queries for any host);
  a 404 for a network is an honest empty, not a failure. Broad
  search stays Wayback-only (deliberate, same as the others).
- **Live probes 2026-11-27 05:37–05:43 UTC:** direct index
  `example.com` → 200, 134 rows (third attempt 200 in 6.7 s,
  only 36 rows — nondeterministic sharding/pagination);
  `example.com&matchType=prefix` → 200, 278 rows;
  `twitter.com/jack/status/20` → 404, honest empty (the Nov
  2026 crawl has no capture of it). Dev-server proxy live:
  `/api/commoncrawl?url=example.com` → 200 in 10.0 s, 50 rows
  (the default limit), crawl `CC-MAIN-2026-47` — the 10 s
  means the first attempt stalled and the retry succeeded, the
  retry machinery working end-to-end;
  `/api/commoncrawl?url=twitter.com/jack/status/*` → 200 in
  6.2 s, header-only (honest empty, wildcard stripped
  correctly).

## 1. Other archive sources (besides Wayback CDX, our baseline)

| Source | What it covers | Access / limits | Can it find what Wayback missed? |
|---|---|---|---|
| **archive.today** (archive.ph/.is/.md/.fo) | Any URL a human chose to save; renders JS in a real browser, so X/IG posts often read where Wayback replays are blank shells | **No official API.** Memento TimeMap `archive.ph/timemap/<url>` works **only with `Accept: application/link-format`** — without it the same URL returns the HTML landing page (verified 2026-11-27: with header 200 + 38 mementos for jack/status/20; without header 200 HTML, 0 mementos). Save via `POST archive.ph/submit/`. Aggressively 429s + CAPTCHAs. Community libs: `archivetoday` (npm), `archive-is-pp-cli` | Yes, often — but only as an **outbound link** (user clicks through). Never fetch it server-side in bulk; never use it for legal evidence — Wikipedia blacklisted it 21 Feb 2026 after DDoS/tampering evidence (cited: printingpress.dev) |
| **Ghostarchive** | YouTube, X, Instagram, Facebook posts; saves playable video (≤360p, 100 MB) | No API. Search page only. **Verified live 2026-11-27: search 200; 7 captures of jack/status/20 (2022-01-14..2024-04-14), `/archive/<id>` links resolve 200; parser extracts capture dates into `archived_timestamp`** (archives.py) | Yes for video + social posts other archives miss. Small volunteer project — no bulk use, no SLA |
| **Arquivo.pt** | Portuguese web since 1996, ~23 B files; **only archive with real full-text search** (phrase, date range, `site:`) | Free public API, no key. Full-text + URL search: **250 req/60 s/IP**; CDX: 250/60 s; Memento: 400/60 s. **Verified live 2026-11-27: CDX `arquivo jack` → 5 results (jack status 1026984242893357056, Aug 2018, status 200); keyword `jack` (Pro) → 5 results; keyword `twttr` → 0, honest empty.** **Embargo ≥1 year** — nothing recent. PT-centric; international pages only if linked from PT pages | Yes for **keyword search** — the one thing CDX cannot do. Best as the Pro-tier keyword fallback, labelled "Arquivo.pt (≥1 yr old, PT-weighted)" |
| **Common Crawl** | Monthly broad crawl since 2008, hundreds of TB; URL-indexed (CDX server + columnar/Parquet index on Hugging Face since Apr 2026) | Free, no key. CDX index API `index.commoncrawl.org/<crawl>-index?url=<pattern>&output=json`. **Verified live 2026-11-27: `collinfo.json` 200 (latest crawl CC-MAIN-2026-47, 6–19 Nov 2026). Index 504s on most attempts (single URL, wildcard, CC-MAIN-2026-47 and -43) but answers in windows: async job queue → 504 → retry → done, 134 captures for example.com; jack/status/20 → empty, honest.** Keep <10 req/s (expect 503 SlowDown). Respects robots.txt — JS-heavy social pages are thin | Sometimes: captures from crawl months Wayback missed, and WARC byte-range fetch gives raw HTML. Slow/flaky — **async background job only**, never in the live search path |
| **Memento Time Travel** (timetravel.mementoweb.org) | Aggregator across archives (Wayback, archive.today, UKWA…) via RFC 7089 | **DEAD. Verified 2026-11-26: connection fails (curl 52, empty reply).** Project concluded 5 Sep 2025 (Wikipedia). Do not call it from any code path | No — replace with **MemGator** (see §3): self-hosted Go aggregator that queries each archive's own TimeMap |
| **UK Web Archive** | UK websites, British Library | **Offline — cyber-attack** (Archive Query Log list, 2026). **Verified: `webarchive.org.uk` returns 403 "Under Maintenance".** No usable API right now | No, until it returns. Fallback: **UK Government Web Archive** (nationalarchives.gov.uk, gov.uk sites back to ~2003, Wayback-style viewer, no API) |
| **perma.cc** (Harvard Library Innovation Lab) | Pages preserved as legal/academic citations; short perma links, replayable | Free public API for lookups (api.perma.cc). **Verified attempt: API unreachable from this VM (curl 52)** — status unverified, re-probe before building on it | Niche: only helps when a perma link already exists (court papers, articles). Outbound-link tier only |
| **WebCite** | Old citation archiving (webcitation.org) | **Dead.** No new captures since ~2019–2021; old snapshots may still resolve. Do not build on it | No |
| **Bibliotheca Alexandrina Web Archive** | Historic IA mirror (pre-2007) + regional material | No API; mirror reported broken since ~2018, holdings unclear | No |
| **Conifer / Rhizome** (ex-Webrecorder) | High-fidelity interactive captures, user collections | No public search API. **Winding down: capture/editing stopped May 2026, read-only from Jun 2026** | No |
| **Library of Congress Web Archives** | 100+ curated thematic collections, petabyte scale | No general API; browse collections on the site | No (manual research only) |
| **Wayback Save Page Now** | Capture a live page *now* (not history) | Availability API `archive.org/wayback/available?url=…` **verified 200** (closest snapshot of jack/status/20: 2008-11-03). Save via `POST web.archive.org/save/<url>` (rate-limited, needs no key for basic use) | Complements history: Studio "capture this post now before it disappears" — with a clear "captured by you, on this date" label |

## 2. Live sources (what a free, no-login check can actually return)

Live checks power the **deleted-diff**: archive says a post existed on
date D; live says whether it is still up *now*. A live 404 + an archived
capture = deleted. A login wall = "unknown", never "deleted".

| Source | No-login live check | Verified 2026-11-26 | Pairs with archive how |
|---|---|---|---|
| **Bluesky (AT Protocol)** | **Best live source in the product.** `public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=<handle>` and `app.bsky.feed.getAuthorFeed?actor=<handle>&limit=50` — no key, generous limits (no number published). `searchPosts` needs auth (403 on public host — cited, tested Oct–Nov 2026). DID is the stable key when handles change. Jetstream (`wss://jetstream2.us-east.bsky.network`) streams new posts as JSON | **Verified 200**: getProfile `bsky.app` → `did:plc:z72i7hdynmk6r22z27h6tvur`; getAuthorFeed → posts with text, counts, `at://` URIs | Live author feed vs archived post URIs = the cleanest deleted-diff of any network. Free tier |
| **Mastodon** | `GET /api/v1/accounts/lookup?acct=<user>` then `/api/v1/accounts/:id/statuses` — no auth for public accounts. 300 req/5 min per IP (docs.joinmastodon.org). Native RSS `/@user.rss` | **Verified 200**: lookup `Mastodon` → id `13179`, created 2016-11-23; **RSS 200**, valid XML | Same diff pattern as Bluesky. Free tier. Note: instance varies — the CLI already takes `--instance` |
| **Reddit** | Public JSON (`/user/<u>.json`, `/r/<s>/.rss`) is **blocked without OAuth**: **verified 403** on user JSON, **429** on subreddit RSS from this VM. Official API needs an OAuth app (post-2023, paid at volume). Redlib (Libreddit fork) instances exist but depend on Reddit's API too | 403 / 429 verified | **Archive-only for Reddit.** Label live checks "Reddit live needs sign-in — archive only". Do not scrape logged-in sessions |
| **YouTube** | oEmbed `youtube.com/oembed?url=<watch-url>` — no key, title/author/thumbnail. Data API v3: free, key needed; **10,000 units/day + 100 `search.list`/day + 100 uploads/day** (separate buckets since 1 Jun 2026, Google quota calculator, checked Nov 2026). `videos.list`/`channels.list`/`playlistItems.list` cost 1 unit; use the uploads playlist, not search. **30-day rule:** stored API data must be refreshed/deleted within 30 days | **Verified 200**: oEmbed for `dQw4w9WgXcQ` → "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)" | oEmbed = free "is this video still up" check (404/401 = gone/private). Data API = Pro/Studio channel video lists; mind the 100-search/day shared bucket |
| **TikTok** | oEmbed `tiktok.com/oembed?url=<video-url>` — no key. Profile/video pages otherwise need login or scraping; ProxiTok (privacy frontend) is fragile | **Verified 200**: oEmbed returns embed HTML + metadata | oEmbed = free existence check per video URL. No profile listing without login |
| **X / Twitter** | oEmbed `publish.twitter.com/oembed?url=<status-url>` — no key (follows a 301). A single post loads logged-out; **search, timelines and most profiles are login-walled** (verified by multiple Nov 2026 tests). Nitter: **repo archived 9 Oct 2026 after X Corp C&D letters 24 Aug + 8 Sep 2026**; a few community instances still load (best 28/29 days in a 29-day test, rssly.io Oct–Nov 2026) but they run on real X accounts and can vanish or be sued — **do not depend on them** | **Verified 200** (after redirect): oEmbed jack/status/20 → text "just setting up my twttr" | oEmbed = free existence check per post URL. That is the *only* sanctioned live X check in this product |
| **X scrapers (twikit / twscrape) — DO NOT INTEGRATE** | twscrape v0.21.0 (6 Nov 2026) is maintained; twikit is stalled (last code Apr 2025; fork `twifork` 2.4.0, 2026). Both work by logging in with **your** X accounts; X's automation rules call that a suspendable offence, and Feb 2026 X posts warn associated accounts get suspended too. 5–12% of their GitHub issues mention suspensions | Cited (scrapersocial.com, twitterapi.io, Nov 2026) | **Excluded from every tier.** The archive *is* the answer to dead X scraping — say so in the copy |
| **Instagram / Facebook / Threads / LinkedIn** | All login-walled for live reads. No free route: a 29-day test (rssly.io, 8 Oct–5 Nov 2026) found **nothing free that works for Facebook (1/29 days) or LinkedIn (0/29)**. Instagram works only via third-party Open RSS (`openrss.org/feed/www.instagram.com/<handle>`, 29/29 days but ~2 days stale) | Cited (rssly.io) | Archive-only, plus optional Open RSS link on verify pages (labelled third-party, stale). Never promise live IG/FB |
| **Native RSS (still alive)** | Bluesky `/profile/<handle>/rss` (302 — follow redirect), Mastodon `/@user.rss`, Tumblr `/rss`, Medium `/@user/feed`, YouTube channel `feeds/videos.xml?channel_id=<id>` | **Verified 200**: Mastodon RSS (valid XML), Tumblr staff RSS (428 KB), Medium @nasa RSS. Bluesky 302. YouTube test used a wrong channel ID → 404, **unverified, re-test with a real ID** | Free-tier live freshness: "latest public posts" sidebar next to archived ones. RSS-Bridge (self-hosted PHP, 200+ bridges) as the fragile fallback for IG/TikTok/FB — public instances mostly fail (RSS-Bridge Twitter bridge 2/29 days, rssly.io) |

## 3. GitHub repos — how others do it (steal the technique, not the risk)

| Repo | Stars / licence (GitHub API, 26 Nov 2026) | Technique to steal | Limits / warning |
|---|---|---|---|
| `claromes/waybacktweets` | 212 ★, GPL-3.0, pushed 2025-05-26 | The original: one CDX query + Twitter oEmbed + pandas exports. Our fork point | X-only; pandas dependency (we dropped it) |
| `bellingcat/auto-archiver` | 1,160 ★, MIT, pushed 2026-11-26 | Live-capture pipeline: URLs in via Sheets/CSV → headless/API/yt-dlp capture → hash + screenshot + transcript + manifest, Wayback as fallback | Captures the present, not the past. **Steal: its hash + manifest evidence format for our evidence pack** |
| `JustAnotherArchivist/snscrape` | 5,472 ★, GPL-3.0, last push 2023-11-15 | HTML/JSON scraping patterns per network; clean module-per-network layout | **Dead for X.** Non-X modules may still work; treat as reference, not a dependency |
| `sherlock-project/sherlock` | 118,021 ★, MIT, pushed 2026-11-26 | Site registry: per-site URL template + "exists" check strings, run in parallel. The pattern for a **username-reuse check** (same handle, other networks) | Presence only — it cannot prove identity. Our copy must say "same handle, not necessarily same person" |
| `soxoj/maigret` | 41,312 ★, MIT, pushed 2026-11-26 | 6,000-site dossier engine + report format. Steal the report structure | "Dossier on a person" is the opposite of our ethics line — use presence checks only, never a dossier |
| `yt-dlp/yt-dlp` | 210,937 ★, Unlicense, pushed 2026-11-24 | Extractor architecture: one extractor per site, all behind one interface. The model for our network registry | Live-only (downloads the present). Huge dependency — use as a CLI call, never vendored |
| `mikf/gallery-dl` | GPL-2.0 (stars unverified — GitHub API rate-limited on shared IP) | 200+ site image extractors, cookie/OAuth support per extractor | Live-only; needs cookies for IG/X. Reference for extractor design only |
| `zedeus/nitter` | ~14,455 ★, **archived 9 Oct 2026** (cited: twitterapi.io) | Privacy frontend + per-account RSS — the *idea* is good | **Do not copy.** X Corp C&D Aug–Sep 2026; repo archived; main instances dead |
| `vladkens/twscrape` | ~2,976 ★, MIT (cited Nov 2026) | Account-pool rotation + GraphQL calls; maintained (v0.21.0, 6 Nov 2026) | Needs your X accounts; ban risk. **Excluded — see §2** |
| `d60/twikit` | ~4,785 ★, MIT (cited Nov 2026) | Logged-in X client library; fork `twifork` 2.4.0 (2026) fixes it | Stalled upstream; same ban risk. **Excluded** |
| `oduwsdl/MemGator` | 83 ★, MIT, pushed 2026-04-09 | **Self-hosted Memento aggregator (Go): one query → TimeMaps from many archives.** The replacement for dead timetravel.mementoweb.org | You run it yourself (binary/Docker). Small project — pin a release |
| `rss-bridge/rss-bridge` | PHP, GPL (cited) | Bridge pattern: one small class per site turns a login-walled page into RSS/Atom | Public instances flaky (2/29 days for X); self-host or treat as best-effort |
| `internetarchive/cdx-toolkit` | Cited in Common Crawl docs (skeptric.com) — **not re-verified here** | One client that queries IA CDX *and* Common Crawl CDX with the same API | Verify version/licence before depending on it |

## 4. Package mapping (tiers from `docs/branding-seo-plan.md` §3)

**Prices:** this mapping uses the regular prices (Starter $19 / Pro $29 /
Studio $99). Launch prices are $9 / $19 / $49 + $59 bundle — see
`docs/pricing-features.md`; the mapping applies to both sets.

**Must stay free (the demo — these cost us nothing):** Wayback CDX
preview (counts, dates, first 10 rows); Bluesky + Mastodon live profile
check; oEmbed existence checks (X / YouTube / TikTok); archive.today +
Ghostarchive **outbound links** (not fetched); native RSS (Bluesky,
Mastodon, Tumblr, Medium).

| Tier | New sources / capabilities from this doc | Why it costs us (or doesn't) |
|---|---|---|
| **Free $0** | As above, plus Wayback availability API (`available?url=`) for "closest snapshot" | All no-key, no-quota, client-side. $0 |
| **Starter $19** | Deleted-diff (Bluesky/Mastodon live vs archive + oEmbed checks); replay text fetch (25/search); **Arquivo.pt** full-text + CDX fallback | Arquivo.pt is free (250 req/60 s) — cost is our code + rate-limit care, not money |
| **Pro $29** | Batch 25; keyword search over fetched captures; **Common Crawl** fallback (async, capped — it 504s); YouTube Data API channel check (shared 100-search/day bucket — server key, strict budget); Ghostarchive/archive.today fetched checks (capped, 429-aware); RSS-Bridge/Open RSS live feeds | Common Crawl + YouTube quota are shared server resources — caps protect the budget |
| **Studio $99** | Batch 250; evidence pack with **multi-archive citations** (Wayback + Arquivo.pt + Common Crawl + Ghostarchive); **MemGator** TimeMap aggregation; Save Page Now "capture now"; Cloudflare Browser Rendering live checks (see companion doc — 10 min/day free budget, so ~20 checks/day, hard-capped) | Browser Rendering + Save Page Now + queue time are the only real compute costs — hence Studio-only |
| **Bundle** | Studio + credit top-ups | — |

**Never in any tier:** logged-in X scraping (twikit/twscrape), Nitter
scraping, face recognition, monitoring/alerts, DMs, location, minors.

## 5. Must-work test plan (per source — run before shipping it)

| Source | Test (real handle / URL) | Pass | On failure |
|---|---|---|---|
| Wayback CDX | `archive x jack --limit 2` | ≥1 capture; oEmbed text "just setting up my twttr" | Retry once (archive.org is slow/flaky); then "archive.org didn't answer" |
| Arquivo.pt CDX | `curl arquivo.pt/wayback/cdx?url=twitter.com/jack/status/20` | 200 + ≥1 row (verified: 2010 capture) | Label "Arquivo.pt unavailable", keep Wayback result |
| Common Crawl | `collinfo.json` 200; `cc <url>` queue → `--check` | Job ends done (rows) or empty (honest), or error on 504; retry once catches a good window (verified 2026-11-27: example.com → done, 134 captures) | Async retry once; never block the search on it |
| archive.today | Timemap for jack/status/20 with `Accept: application/link-format` | 200 + mementos (38 verified 2026-11-27); without the header it returns HTML, not a TimeMap | Outbound link only; never a fake "0 snapshots" |
| Ghostarchive | Search page for jack/status/20 | 200; 7 captures with dates parsed (verified 2026-11-27); `/archive/<id>` resolves 200 | Outbound link only until a capture is verified by opening it |
| Bluesky live | getProfile `bsky.app` → `did:plc:z72i7hdynmk6r22z27h6tvur`; getAuthorFeed → ≥1 post | 200 both | "Bluesky didn't answer" — diff shows "unknown", not "deleted" |
| Mastodon live | lookup `Mastodon` → id `13179`; RSS → valid XML | 200 both | Same as Bluesky |
| Reddit live | user JSON | **Expect 403** — test asserts the honest label, not data | Label stays "archive only" |
| YouTube oEmbed | `dQw4w9WgXcQ` | Title "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)" | "YouTube didn't answer" |
| TikTok oEmbed | Any public video URL | 200 JSON with embed HTML | Outbound link only |
| X oEmbed | jack/status/20 | Text "just setting up my twttr" | Outbound link only |
| RSS | Mastodon / Tumblr / Medium feeds | 200 + valid XML (verified) | Drop the feed, keep the archive |
| Memento aggregator | `timetravel.mementoweb.org/api/json/…` | **Expect failure** — assert the code never calls it | Remove the call; use MemGator |
| Save Page Now | availability API for jack/status/20 | 200, closest snapshot 2008-11-03 (verified) | Hide "capture now" until it answers |

**Build order (cheapest wins first):** 1) Bluesky/Mastodon live diff (free,
verified, no key) → 2) Arquivo.pt keyword fallback → 3) oEmbed existence
checks everywhere → 4) Ghostarchive/archive.today outbound links →
5) Common Crawl async fallback → 6) MemGator TimeMap → 7) YouTube Data
API (needs a Google key — human step) → 8) Browser Rendering live checks
(Studio, capped). Re-probe every source in §5 before launch; archives
die quietly (Memento did).
