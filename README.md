# wayback-social

Retrieve **archived social-media posts from the Wayback Machine**, for all
social networks — not just Twitter.

A generalised version of
[claromes/waybacktweets](https://github.com/claromes/waybacktweets)
(Twitter-only, GPL-3.0). Same idea, same CDX API, same field naming
(`archived_*` / `parsed_*` / `available_*`): a network registry turns a
handle into CDX `url` patterns, one generic client/parser/exporter does
the rest, and a CLI takes the network as an argument.

## What changed vs waybacktweets

| | waybacktweets | wayback-social |
|---|---|---|
| Networks | X/Twitter only | 14: X, Instagram, Facebook, TikTok, YouTube, Reddit, LinkedIn, Threads, Bluesky, Mastodon, Pinterest, Tumblr, Twitch, Medium |
| Query | `twitter.com/{user}/status/*` | per-network patterns; X queries `twitter.com` **and** `x.com`, merged + de-duplicated |
| Text recovery | Twitter oEmbed only | oEmbed where it exists (X, YouTube, TikTok, Reddit) + archived-snapshot `<title>` / `og:description` fallback + replay visible-text extraction (`id_` replay, stdlib HTML parser) |
| Export | CSV / JSON / HTML (pandas) | CSV / JSON / JSONL / HTML, stdlib only — no pandas |
| Input | username only | `NETWORK HANDLE`, `--url <full post url>` (auto-detects network), `r/<subreddit>` for Reddit, `--instance` for Mastodon |
| Library | `WaybackTweets`, `TweetsParser`, `TweetsExporter` | `query_cdx` / `query_many`, `PostsParser`, `export_all`, `get_network` |

## Install

```bash
pipx install .            # from this folder, or
pip install -e .          # dev install
# needs Python 3.10+, click, requests, rich (no pandas)
```

## CLI

```bash
wayback-social networks
wayback-social archive x jack
wayback-social archive tiktok @tiktok --from 20220101 --to 20231231 --limit 100
wayback-social archive instagram nasa --limit 50 --no-fetch-text
wayback-social archive youtube @NASA --no-fetch-text
wayback-social archive reddit spez --format json
wayback-social archive reddit r/technology --limit 20
wayback-social archive mastodon gargron --instance mastodon.social
wayback-social archive bluesky nasa.bsky.social --limit 20
wayback-social archive --url https://www.instagram.com/p/C-a6bDVy7hz/
```

Options (mirroring the original where they apply):

```
-c, --collapse urlkey|digest|timestamp:XX   collapse duplicates
-f, --from DATE        --to DATE            YYYYmmdd date range
-l, --limit INTEGER    -rk, --resumption-key TEXT
-mt, --matchtype exact|prefix|host|domain
--format csv|json|jsonl|html|all   (repeatable, default: all)
--out-dir DIR          --fetch-text / --no-fetch-text   (default: on)
--workers N            -v, --verbose
--plan free|starter|pro|studio     (default: free — enforces caps)
--live-check           (archive only, experimental: live/deleted/unknown per post)
```

Output files land in the current directory (or `--out-dir`):
`{network}_{identifier}_{YYYYmmddHHMMSS}.csv|.json|.jsonl|.html`

Large queries: use `--limit` + the printed **Resumption Key** with
`--resumption-key` to page through, exactly like the original.

## Web app (single page — host it anywhere)

`web/index.html` + `web/config.js` is a self-contained single-page app:
live CDX search in the browser (network picker, handle, date range,
results table, CSV/JSON download in-page), plus pricing packs with
buy buttons. Host it on GitHub Pages, Netlify, or any static host —
no server needed.

```bash
# GitHub Pages from this repo: Settings → Pages → deploy from /web
```

Pricing is **draft** and lives in one place, `web/config.js`
(`PRICING` + `CHECKOUT_LINKS` — Stripe Payment Links). Until real
links replace the `REPLACE_*` placeholders, Buy buttons explain that
checkout isn't connected yet instead of taking money.

| Pack | Price | What's in it |
|---|---|---|
| Free | $0 forever | 25 captures/search, 3 networks per broad search, 3 targets/batch, text for 5 posts, CSV export |
| Starter | $9 one-time | 250 captures/search, 7 networks, 10 targets/batch, text for 100 posts, all export formats |
| **Pro Pack** | **$19 one-time (launch, reg. $29)** | 2,500 captures/search, all 14 networks, 50 targets/batch, deleted-only diff + live check, text for 1,000 posts |
| Studio | $49 one-time (launch, reg. $99) | 25,000 captures/search, all 14 networks, 200 targets/batch, evidence pack, text for 10,000 posts, 5 seats, commercial licence |
| **All-in Bundle** | **$59 one-time** | Every pack, Studio-level caps. Regular total $137 (Starter $9 + Pro $29 + Studio $99) — the bundle is 57% off. |

Cheaper than the subscription rivals, on purpose: Social Catfish is
$27.48/mo after a $5.73 trial, Spokeo $19.95/mo, Hunchly $169/yr,
Pagefreezer from $1,500/yr. Pro launch ($19) costs less than one
month of Social Catfish — and never bills again. Net kept after fees:
Paddle 5%+50¢ keeps $8.05 / $17.55 / $46.05 / $55.55 on
$9 / $19 / $49 / $59; Stripe 2.9%+30¢ keeps $8.44 / $18.15 / $47.28 /
$56.99. See `web/config.js` for the full fee math.

## Plans — capped free tier (new in v1.2.0)

Every command takes `--plan free|starter|pro|studio` (default `free`).
Caps are enforced, not just printed:

| Plan | captures/archive | networks/find | targets/batch | text fetch |
|---|---|---|---|---|
| free | 25 | 3 | 3 | 5 posts |
| starter | 250 | 7 | 10 | 100 posts |
| pro | 2,500 | 14 | 50 | 1,000 posts |
| studio | 25,000 | 14 | 200 | 10,000 posts |

The plan and its caps are printed at the start of every run, and a
clamped `--limit` is reported ("capped to 25 on the free plan").
Paid plans are one-time licences; `--plan` is the honour-system
selector until licence keys land (Paddle webhook → key file, planned).

## Deleted-only diff (new in v1.1.0, export diff + live check in v1.2.0)

Which archived posts are gone from the live site — the evidence pack:

```bash
wayback-social diff x jack --limit 20
wayback-social diff x jack --limit 20 --only deleted
wayback-social diff --url https://twitter.com/jack/status/20
# compare two exports instead (no network):
wayback-social diff old.json new.json --format json
wayback-social diff old.csv new.csv --only deleted
# or live-check right inside archive (experimental, best-effort):
wayback-social archive x jack --live-check --limit 20
```

`diff OLD NEW` lists posts in the old export missing from the new
one ("removed", with first/last archived dates), plus added/kept.
Listing/profile rows with no post ID are skipped — they are not posts.
`archive --live-check` adds `live_verdict` / `live_http_status` /
`live_final_url` / `live_checked_at` to every exported row: `live`,
`deleted` (404/410, or X oEmbed 404), or `unknown` (login wall /
rate-limit / error — never counted as deleted). Rows with no post ID
are marked `not-a-post` and not checked.

Archives the account, dedupes to the latest capture per post, checks
each post live, and reports `live` / `deleted` / `unknown` per post,
with the Wayback snapshot link kept on every row so a deleted post
is still viewable. `unknown` (401/403/429/5xx, login redirect,
timeout) is **never** counted as deleted — login-walled networks
would otherwise fake deletions. Non-post captures (profile/listing
pages with no post ID) are skipped and counted separately.

Live-tested 2026-11-26: `diff x jack --limit 20` → 40 captures,
23 non-post rows skipped, 9 posts: 5 live, 4 deleted (incl. the
sequential placeholder IDs 1 / 10 / 1000 / 0123456789, which 404 —
a 404 means "not live now", not proof it was ever a real post);
`diff --url …/jack/status/20` → 1 post, live. Two bugs the live
test caught are fixed and covered by tests: doubled slashes in CDX
URLs (`//jack//status//20`) are now normalised, and the X oEmbed
tie-breaker only runs on 401/403/429 or a login redirect, never on
a 5xx (it 404s on malformed URLs too).

## Broad search + market presets

One handle, every network at once — plus a preset for what you're
actually trying to do:

```bash
wayback-social find jack                    # all 14 networks
wayback-social find jack --preset catfish --fetch-text
wayback-social find someone --preset relationship
wayback-social find acme --preset brand --keyword launch --fetch-text
wayback-social presets                      # catfish, relationship, brand, hiring, legal, journalist, researcher
```

`find` writes one export set per network where the handle exists, plus
`find_<handle>.json` (which networks, oldest/newest capture). Presets
narrow the networks, set the export formats, and print a checklist —
catfish and relationship presets also print their limits in the
output: **public archived posts only, no DMs, no location, no account
access.** A match proves a public post existed; it does not prove who
is messaging you, or what happened off the record. For catfish, also
reverse-image the profile photo separately (Google Lens / TinEye) —
Wayback has no image search.

## Checkout: swappable, testable

Buy buttons in `web/` read `web/config.js` → `CHECKOUT.provider`
(`paddle` by default — Paddle is merchant of record, so tax/VAT and
licence delivery are handled; 5% + 50¢, you keep $17.55 on the $19 Pro
launch price and $46.05 on the $49 Studio launch price). Swap without editing code:

- `?checkout=stripe` (or `paddle` / `gumroad` / `email`) — test one provider
- `?ab=paddle-stripe` — split visitors 50/50, sticky per session

One switch changes every Buy button. Replace the `REPLACE_*` links
with real Paddle / Stripe / Gumroad links; until then buttons
explain checkout isn't connected yet. See `web/config.js` for fees.

**Do not use Lemon Squeezy** (corrected 2026-11-26, verified live):
it closed to new sign-ups 16 Nov 2026 and stops processing 31 Mar
2027. Stripe Payment Links are the margin-maximising alternative
(2.9% + 30¢, you keep $18.15 / $47.28 on $19 / $49, but tax + delivery are yours).

## SEO + hosting (Cloudflare Pages)

- `web/index.html` — title (67 chars), meta description (147 chars),
  Open Graph + Twitter card, canonical, JSON-LD `SoftwareApplication`
  with offers for all 4 paid tiers.
- `web/robots.txt`, `web/sitemap.xml` — submitted to Google Search
  Console + Bing Webmaster Tools after deploy (free).
- `scripts/seo_check.py <url>` — 12-point SEO health check (stdlib
  only); run after every deploy. 12/12 pass on local server 2026-11-26.
- `docs/seo-plan.md` — keywords, page structure, first 10 content
  pieces, free tools, how to win.
- `docs/seo-monitor.md` — the 15-minute weekly routine (Search
  Console is the free rank tracker).
- `docs/cloudflare-deploy.md` — exact Cloudflare Pages steps (connect
  GitHub repo, build output `web/`, no build command), custom domain +
  subdomains (`app.` / `verify.` / `osint.` / `legal.`) sharing the one
  Paddle backend, free Cloudflare Web Analytics.
- `wrangler.toml`, `web/_headers`, `web/_redirects` — Pages config,
  security headers, subdomain-ready redirects.

Cloudflare is **not connected yet** — the account connection is a
human step (see `docs/cloudflare-deploy.md`). Nothing in this repo
talks to Cloudflare on its own.

## Batch mode (Pro workflow)

Archive a whole watchlist from one file, one `NETWORK IDENTIFIER` per line:

```bash
# watchlist.txt
x jack
instagram nasa
mastodon gargron mastodon.social
reddit r/technology

wayback-social batch watchlist.txt --limit 100 --out-dir out/
# → one export set per account + batch_summary.json
```

## Library

```python
from wayback_social import query_many, PostsParser, export_all, get_network
from pathlib import Path

net = get_network("x")
rows, resume_key = query_many(net.cdx_urls("jack"), limit=100)
records = PostsParser(rows, net, "jack").parse(fetch_text=False)
export_all(records, "x", "jack", Path("."), ["csv", "json", "html"])
```

Fields per record: `network, identifier, post_id, archived_urlkey,
archived_timestamp, parsed_archived_timestamp, archived_post_url,
parsed_archived_post_url, original_post_url, parsed_post_url,
available_post_text, available_post_title, available_post_author,
available_post_is_repost, archived_mimetype, archived_statuscode,
archived_digest, archived_length, resumption_key,
fallback_archive_today_url, fallback_ghostarchive_url`
(plus `live_verdict, live_http_status, live_final_url, live_checked_at`
when `--live-check` is used). The fallback links point at
archive.today (`/newest/<url>`) and Ghostarchive search for the same
post — the two archives that cover what Wayback misses.

## Honest limits — read this before trusting a result

Wayback archiving is **very uneven by network**, and this tool cannot
fix that. It reports what CDX has; empty / text-less results are usually
the archive, not a bug.

- **Good:** X, Reddit, Bluesky, Mastodon — post URLs embed the user, captures are plentiful.
- **Moderate:** Instagram, Facebook, TikTok, Threads, YouTube, Tumblr, Twitch — archived, but JS / login walls mean many snapshots are shells with no text.
- **Poor:** LinkedIn, Pinterest, Medium — thin, login-walled archives.
- **Post URLs that don't contain the username can't be listed per-user
  via CDX** — YouTube `watch?v=`, Instagram `/p/<code>`, Pinterest
  `/pin/<id>`. For those, the tool returns channel/profile snapshots;
  use `--url <full post url>` for a specific post.
- **CDX is slow.** archive.org queries can take 20–60s and occasionally
  time out. Start with `--limit 20 --no-fetch-text`, then widen.
- **`available_post_text` is best-effort.** oEmbed only exists for
  X / YouTube / TikTok / Reddit; Instagram/Facebook oEmbed is deprecated
  or needs a token. When live text can't be recovered, the CDX row
  (URL + timestamp + archived snapshot link) is still saved — that
  record is the point.
- Deleted posts stay deleted in the live check, but their archived
  snapshot link still works. Respect robots / ToS and people's privacy;
  this is an OSINT/research tool, same as the original.

## Testing against live CDX

Offline smoke tests (no network):

```bash
python -m pytest tests/ -q
```

Live (slow — archive.org, ~30–60s per query):

```bash
wayback-social archive x jack --limit 5 --no-fetch-text -v
wayback-social archive instagram nasa --limit 5 --no-fetch-text -v
wayback-social archive --url https://www.instagram.com/p/C-a6bDVy7hz/ --no-fetch-text -v
```

Verified live 2026-11-26 (this machine, CDX `--no-fetch-text` unless noted):
- `archive instagram nasa --limit 5` → 15 captures, all 4 formats saved.
  (3 patterns × 5; CDX also returns an empty `[]` row per query — the
  tool skips it. A live-test bug: that row used to crash the merge sort.)
- `archive x jack --limit 5` → 10 captures (twitter.com + x.com, merged).
  Earliest rows are bare `/status` redirects (post_id empty) — CDX
  returns oldest first; use `--from` / `--collapse urlkey` for real tweets.
- `archive --url https://twitter.com/jack/status/20` → 1,928 captures
  for that one tweet. With `--limit 1` + fetch-text (default on), the
  oEmbed path recovered the text: **"just setting up my twttr"**,
  author `jack (@jack) March 21, 2006`.
- Earlier raw probes in the same session: Instagram `nasa/p/*` returned
  captures (e.g. `20250815162239 …/p/0DaRQFIaDG/`, 301;
  `20251228182904 …/p/5HTXKMoaFL/`, 200); Twitter / TikTok / Reddit
  probes timed out empty at 20s — CDX flakiness, not a pattern error;
  retry with a longer timeout.

Verified live 2026-11-26 (v1.2, this machine):
- `archive x jack --limit 2 --no-fetch-text` (free plan) → 4 captures
  (all bare `/status` listing rows — CDX returns oldest first), plan
  note + resumption key printed, JSON saved with fallback links.
- `find clumsysmurf --networks x --limit 1` → 1 capture, "found on
  1/1 networks: x". (`find johnmakesapps` = 0 captures on X, per the
  naming research — handle has no archived X posts.)
- `diff x clumsysmurf --limit 2 --no-fetch-text` → 2 posts, both
  classified **deleted** (X oEmbed 404). Caveat: oEmbed also 404s for
  protected/unavailable accounts, so "deleted" means "not publicly
  retrievable", not proof of a deliberate delete.
- `archive x jack --live-check` → live fields written; listing rows
  marked `not-a-post`.
- Replay text: `fetch_replay_text(twitter.com/jack/status/20,
  20060321212430)` → **"just setting up my twttr"** recovered from the
  2006 replay (first attempt hit a proxy disconnect; retry succeeded —
  archive.org is flaky, retry once before concluding).
- `scripts/seo_check.py` against a local server → 12/12 checks pass.
  Live Cloudflare URL not checked — Cloudflare is not connected yet.

## Credits / licence

Based on [waybacktweets](https://github.com/claromes/waybacktweets)
by Claromes (GPL-3.0), idea credited to Tristan Lee (Bellingcat).
This generalised version is also GPL-3.0-or-later. If you publish it,
credit the original and keep the licence.
