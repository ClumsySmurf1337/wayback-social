# SEO monitor — how to run it (free)

## The check (run after every deploy)

```bash
python3 scripts/seo_check.py https://wayback-social.pages.dev/
```

It fetches the live homepage and checks: title length, meta
description length, Open Graph tags, Twitter card, canonical link,
JSON-LD parses + has ≥4 offers, robots.txt reachable, sitemap.xml
reachable + valid. Exit code 0 = all pass, 1 = something failed.
Run it against a local server first when testing changes:

```bash
cd web && python3 -m http.server 8000
python3 scripts/seo_check.py http://localhost:8000/
```

## Weekly routine (15 minutes, all free)

1. Run `seo_check.py` against the live URL; fix any FAIL.
2. Google Search Console → Performance: which queries brought
   clicks? Any new query in the top 20 gets a guide or a homepage
   tweak. Check Coverage for errors.
3. Bing Webmaster Tools → same, quick glance (Bing feeds DuckDuckGo).
4. Cloudflare Web Analytics → top pages, top referrers, any 404 spike
   (a 404 spike usually means a preset anchor link broke).
5. Check the sitemap `lastmod` matches the last deploy date.

## Free rank tracking (no paid tool)

- Search Console *is* the rank tracker: Performance → average
  position per query, filtered by page. Export weekly to CSV and
  keep the files in `docs/seo/` (not in this repo — private).
- For a quick manual check, search in a private window for the
  primary keywords in `docs/seo-plan.md` and note the position.
- Never pay for rank tracking before the site earns $500 — Search
  Console + Analytics answer every question that matters at this
  stage.

## What "good" looks like (first 90 days)

- All seo_check.py checks green on every deploy.
- Sitemap submitted + indexed in Search Console (no errors).
- ≥5 queries in Search Console with impressions, ≥1 with clicks.
- Homepage in the top 10 for "wayback machine social media search"
  or "find deleted tweets" is a stretch goal, not a promise.
