# DeletedProof — Other Data Sources

**Date:** 2026-11-26. **Status:** research for the build queue — no code
changed. Companion docs: `docs/branding-seo-plan.md` (name/pricing),
`docs/cloudflare-hosting.md` (Pages plan), `docs/data-sources-cloudflare.md`
(Cloudflare primitives). Auth/storage detail lives in
`docs/storage-auth-plan.md` (sibling research, read it before building
login). Competition context:
`~/workspace/research_notes/wayback-social-competition-20261126-1841/report.md`.

**Verification method:** every "verified" claim below was probed live from
this VM on 2026-11-26 (curl, public endpoints, no auth, no account) unless
marked "cited" (taken from a named source, not re-probed). Star counts are
from the GitHub API the same day; where the shared-IP rate limit blocked
the API, the count is marked "unverified".

**Ethics lines (non-negotiable, apply to every source here):** public posts
only. No account access, no DMs, no location, no monitoring/alerts, no face
recognition, no verdicts/scores, no minors. A source that needs *your* login
to someone else's account is out — see §2 X/Twitter.

## 1. Other archive sources (besides Wayback CDX, our baseline)

| Source | What it covers | Access / limits | Can it find what Wayback missed? |
|---|---|---|---|
| **archive.today** (archive.ph/.is/.md/.fo) | Any URL a human chose to save; renders JS in a real browser, so X/IG posts often read where Wayback replays are blank shells | **No official API.** Memento TimeMap `archive.ph/timemap/<url>` works; save via `POST archive.ph/submit/`. Aggressively 429s + CAPTCHAs. **Verified 2026-11-26: timemap request timed out after 25 s from this VM.** Community libs: `archivetoday` (npm), `archive-is-pp-cli` | Yes, often — but only as an **outbound link** (user clicks through). Never fetch it server-side in bulk; never use it for legal evidence — Wikipedia blacklisted it 21 Feb 2026 after DDoS/tampering evidence (cited: printingpress.dev) |
| **Ghostarchive** | YouTube, X, Instagram, Facebook posts; saves playable video (≤360p, 100 MB) | No API. Search page only. **Verified: `ghostarchive.org/search?term=<url>` returns 200**; result parsing not yet verified — treat as outbound link first | Yes for video + social posts other archives miss. Small volunteer project — no bulk use, no SLA |
| **Arquivo.pt** | Portuguese web since 1996, ~23 B files; **only archive with real full-text search** (phrase, date range, `site:`) | Free public API, no key. Full-text + URL search: **250 req/60 s/IP**; CDX: 250/60 s; Memento: 400/60 s. **Verified: CDX query for `twitter.com/jack/status/20` returned 200 with a 2010 capture.** **Embargo ≥1 year** — nothing recent. PT-centric; international pages only if linked from PT pages | Yes for **keyword search** — the one thing CDX cannot do. Best as the Pro-tier keyword fallback, labelled "Arquivo.pt (≥1 yr old, PT-weighted)" |
| **Common Crawl** | Monthly broad crawl since 2008, hundreds of TB; URL-indexed (CDX server + columnar/Parquet index on Hugging Face since Apr 2026) | Free, no key. CDX index API `index.commoncrawl.org/<crawl>-index?url=<pattern>&output=json`. **Verified: `collinfo.json` 200 (latest crawl CC-MAIN-2026-47, 6–19 Nov 2026). Index query for `twitter.com/jack/status/20` → 504 gateway timeout; retry also failed.** Keep <10 req/s (expect 503 SlowDown). Respects robots.txt — JS-heavy social pages are thin | Sometimes: captures from crawl months Wayback missed, and WARC byte-range fetch gives raw HTML. Slow/flaky — **async background job only**, never in the live search path |
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
| Common Crawl | `collinfo.json` 200; index query `reddit.com/r/dataisbeautiful/*` | Rows returned, or honest 504/timeout surfaced as "degraded" | Async retry once; never block the search on it |
| archive.today | Timemap for jack/status/20 | Returns mementos, or honest "didn't answer in 25 s" | Outbound link only; never a fake "0 snapshots" |
| Ghostarchive | Search page for jack/status/20 | 200; parse results only if result links present | Outbound link only |
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
