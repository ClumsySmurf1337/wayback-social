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
| Text recovery | Twitter oEmbed only | oEmbed where it exists (X, YouTube, TikTok, Reddit) + archived-snapshot `<title>` / `og:description` fallback for the rest |
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
| Free | $0 forever | 1 search at a time, up to 100 results, CSV + JSON |
| **Pro Pack** | **$29 one-time** | Unlimited searches, batch watchlists, HTML reports + JSONL, date-range + resumption paging |
| Studio | $99 one-time | Everything in Pro, 5 seats, shared watchlists, commercial licence |

## Deleted-only diff (new in v1.1.0)

Which archived posts are gone from the live site — the evidence pack:

```bash
wayback-social diff x jack --limit 20
wayback-social diff x jack --limit 20 --only deleted
wayback-social diff --url https://twitter.com/jack/status/20
```

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
licence delivery are handled; 5% + 50¢, you keep $27.05 on $29 and
$93.55 on $99). Swap without editing code:

- `?checkout=stripe` (or `paddle` / `gumroad` / `email`) — test one provider
- `?ab=paddle-stripe` — split visitors 50/50, sticky per session

One switch changes every Buy button. Replace the `REPLACE_*` links
with real Paddle / Stripe / Gumroad links; until then buttons
explain checkout isn't connected yet. See `web/config.js` for fees.

**Do not use Lemon Squeezy** (corrected 2026-11-26, verified live):
it closed to new sign-ups 16 Nov 2026 and stops processing 31 Mar
2027. Stripe Payment Links are the margin-maximising alternative
(2.9% + 30¢, you keep $27.86 / $95.83, but tax + delivery are yours).

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
archived_digest, archived_length, resumption_key`.

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

## Credits / licence

Based on [waybacktweets](https://github.com/claromes/waybacktweets)
by Claromes (GPL-3.0), idea credited to Tristan Lee (Bellingcat).
This generalised version is also GPL-3.0-or-later. If you publish it,
credit the original and keep the licence.
