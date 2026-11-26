# SEO plan — wayback-social (v1.2, 2026-11-26)

Goal: rank for people searching for deleted posts, not for "Wayback
Machine" itself (archive.org owns that). The money keywords are the
ones with a problem behind them.

## Primary keywords (one page / section each)

| Keyword | Intent | Where it lands |
|---|---|---|
| wayback machine social media search | tool | homepage |
| find deleted tweets | tool | homepage + CLI docs |
| deleted instagram posts archive | tool | homepage |
| catfish check archived posts | tool | verify preset section |
| find deleted posts | tool | homepage |
| deleted tweet finder | tool | homepage |
| check if someone deleted their tweets | question | FAQ / guide |
| archive social media posts | tool | homepage |

## Long-tail (blog / guide pages — build these next)

- "how to find deleted tweets from [handle]" (template page per network)
- "how to check if a dating profile is fake using archived posts"
- "deleted instagram post still on wayback machine?"
- "how to prove a deleted post existed in court" (legal preset)
- "waybacktweets alternative all networks"
- "find old usernames someone used on twitter"
- "is [handle] deleted or just protected"

## Page structure (when the site grows past one page)

- `/` — tool + pricing (now, single page)
- `/verify/` — dating/catfish verify landing (planned subdomain verify.)
- `/osint/` — researchers / journalists landing
- `/legal/` — evidence-pack landing (FCRA + admissibility notes)
- `/guides/find-deleted-tweets/` — first guide, then one per network
- `/changelog/` — every release (fresh content signals)

Each landing page needs its own title/description/OG/JSON-LD — copy the
pattern from `web/index.html` (title 30–70 chars, description 50–160).

## Content plan (first 10)

1. Guide: find deleted tweets (X) with the CLI — screenshots, real jack example
2. Guide: deleted Instagram posts — what CDX can/can't do, --url mode
3. Guide: catfish check in 5 minutes (find + diff + Lens/TinEye links)
4. Guide: evidence pack for lawyers (diff export + timestamps + caveats)
5. Comparison: wayback-social vs waybacktweets vs Deleted Tweet Finder
6. Comparison: wayback-social vs Social Catfish ($27.48/mo vs $19 once)
7. Changelog v1.2 post (deleted diff, replay text, capped free tier)
8. "What the archive can't tell you" — honest limits post (builds trust)
9. Journalist use: tracking a deleted claim (case study, anonymised)
10. Brand monitoring: deleted announcements and what they mean

## Free tools (no paid SEO stack)

- Google Search Console — submit sitemap, watch queries + clicks (free)
- Bing Webmaster Tools — same for Bing/DuckDuckGo (free)
- Cloudflare Web Analytics — free, privacy-friendly, no cookie banner
- Plausible free alternative: use Cloudflare Analytics instead of
  Plausible (Plausible's free tier is self-hosted only)
- Google Trends — check keyword seasonality before writing a guide

## How to win (vs the competition)

1. **Be the answer, not a directory.** Every rival page lists tools;
   ours is the tool, live on the page, free search in one click.
2. **Honest limits rank.** "Not found ≠ not real" and per-network
   coverage notes are the content Google rewards for YMYL-adjacent
   queries — and they stop refund requests.
3. **One-time price is the hook.** "$19 once vs $27.48/month" belongs
   in every comparison page's title and meta description.
4. **Freshness.** Ship a changelog entry per release; update the
   homepage `lastmod` in sitemap.xml on every deploy.
5. **Backlinks from where the users are:** GitHub README (done),
   Product Hunt launch, r/OSINT, Bellingcat community, journalism
   Discords, Wayback-related Hacker News threads. No bought links.
