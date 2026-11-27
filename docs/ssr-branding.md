# Server-side brand injection (SSR branding)

**Date:** 2026-11-26. **Status:** BUILT + TESTED LOCALLY — not yet live
(needs the next push + the live check in §4). Closes GitHub issue #20
once verified live; local-only verification never closes an issue
(push discipline, 2026-11-26).

## 1. The problem it fixes

Per-subdomain branding was applied by `web/branding.js` at page load:
the static `index.html` said "wayback-social" (later the apex brand)
and a no-JS crawler — Googlebot without JS rendering, any link
previewer, `curl` — saw the wrong title/meta on every subdomain.
`verify.` should serve "HandleHistory — Is this a catfish? …" in the
raw HTML, not after JavaScript runs.

## 2. Architecture — one source of truth, two consumers

```
web/brands.json ──(scripts/sync_brands.py)──> web/branding.js      (client fallback)
                                  └────────> functions/_lib/brands.js (server)
web/index.html, web/dashboard.html  ── static fallback: apex brand
functions/_middleware.js ── HTMLRewriter ──> served HTML per hostname
```

- **`web/brands.json`** is the ONLY place brand copy lives: 5 brands
  (apex/app/verify/osint/legal) with name, wordmarkHtml, tagline,
  hero, accent, preset, seoTitle, metaDescription, jsonLdName,
  canonical, footer, dashboardTitle, plus `umbrella` and `limitsLine`.
- **`scripts/sync_brands.py`** regenerates the `BRANDS` literal in
  `web/branding.js` (between the `GENERATED BRANDS` markers) and the
  `functions/_lib/brands.js` ES module (same data + `resolveBrand` /
  `getBrand`, behaviour-identical to `branding.js`). `--check` exits 1
  on drift; `tests/test_brands_sync.py` runs it in CI. Never edit the
  generated blocks by hand — a hand edit inside the markers is silently
  overwritten by the next sync (this already happened once, 2026-11-26:
  a copy edit to `branding.js` was reverted by sync; the fix was to
  put the copy in `brands.json`).
- **`functions/_middleware.js`** (Pages Function middleware, runs on
  every request): calls `context.next()`, and for `GET` `200`
  `text/html` responses to `/`, `/index.html` or `/dashboard.html`
  only, rewrites via `HTMLRewriter`. Everything else (API routes,
  JS/CSS, POST, 404s) passes through byte-identical.
- **`web/branding.js`** stays as the client-side fallback: accent
  colour (`--brand-accent`), default preset click, `body[data-brand]`,
  and the same title/meta/wordmark swap for environments where the
  middleware does not run (localhost dev servers that bypass it,
  `file://`). Client and server apply the same brand from the same
  JSON, so they cannot disagree.

### What the middleware rewrites

| Element | Index (`/` `/index.html`) | Dashboard (`/dashboard.html`) |
|---|---|---|
| `<title>` | brand `seoTitle` | brand `dashboardTitle` ("Dashboard — \<Brand\>") |
| `meta[name=description]` | brand `metaDescription` | brand `metaDescription` |
| `og:title` / `twitter:title` | brand `seoTitle` | — (tag absent, no-op) |
| `og:description` / `twitter:description` | brand `metaDescription` | — |
| `og:site_name` | brand `name` | — |
| `link[rel=canonical]` + `og:url` | brand `canonical`, **production hosts only** | same rule |
| JSON-LD `name` / `description` | brand `jsonLdName` / `metaDescription`, other fields (offers…) kept | — (tag absent, no-op) |
| `h1` / `.sub` / `footer` | brand wordmark / tagline / footer | NOT rewritten server-side (dashboard keeps its own h1/copy; client JS still swaps the wordmark) |

Unknown hosts, `localhost`, `127.0.0.1` and `*.pages.dev` fall back
to the apex ArchiveCheck brand (`getBrand`). Canonical + `og:url`
are only rewritten on `deletedproof.northforgelabs.dev` hosts
(canonical option b, 2026-11-27), exactly like `branding.js` does
client-side — non-production hosts keep the static apex canonical
(`https://deletedproof.northforgelabs.dev/`). If the JSON-LD script will
not parse, it is left untouched rather than rewritten broken.

### Static files = apex fallback

`web/index.html` and `web/dashboard.html` carry the apex brand in
their static copy (title, meta, og, JSON-LD, canonical, h1 wordmark,
`.sub` tagline). A visitor with no middleware and no JS still sees
"ArchiveCheck", never "wayback-social". The static dashboard footer
keeps the live "Respect robots, terms of service and people's
privacy." line; the served footer is the brand footer (the middleware
and `branding.js` both replace it) — the static footer is only the
no-JS fallback.

## 3. SEO copy trims (why the served copy differs from branding.js v1)

`scripts/seo_check.py` enforces title 30–70 chars and meta
description 50–160 chars on the served page. The v1 brand copy
broke both gates, so the copy in `brands.json` is trimmed (meaning
kept, words cut) and the sync script enforces the caps:

- app `seoTitle`: was 79 chars → "DeletedProof — ArchiveCheck
  console: deleted posts, batch, evidence" (67).
- All five `metaDescription`s: were 163–207 chars → ≤160 each.
- Apex `metaDescription` (160 chars, exactly at the cap) also
  carries the issue #22 multi-source framing: "Search archived posts
  from X, Instagram, TikTok, YouTube, Reddit and more — Wayback
  Machine, Arquivo.pt, Common Crawl and live APIs. Free search;
  packs from $9." The product is never called "Wayback"; the Wayback
  Machine is named as one source among several. The other four
  descriptions never said "Wayback" as the product name, so they
  only needed the length trim.

## 4. How to verify

### Local (no deploy needed)

```bash
# Unit: middleware logic + resolver agreement + static files
node functions/middleware.test.mjs          # 486/486
node web/branding.test.js                   # 121/121
python scripts/sync_brands.py --check       # drift gate
python -m pytest tests/test_brands_sync.py  # 6/6
# Over real HTTP, through the real middleware:
node scripts/dev-server.mjs 8931 &
curl -s -H "X-Test-Host: verify.deletedproof.northforgelabs.dev" \
  http://127.0.0.1:8931/ | grep "<title>"
# → <title>HandleHistory — Is this a catfish? Check a dating profile's past posts</title>
python3 scripts/seo_check.py http://127.0.0.1:8931/   # 12/12 (apex)
# Playwright raw-HTML checks (no JS runs — what a crawler sees):
python -m pytest tests/e2e/test_ssr_branding.py -v       # 11/11
```

`X-Test-Host` is consumed by the dev server only (translated into
the request hostname the middleware sees). It never reaches the
deployed middleware, which reads the real `Host`.

### Live — the one step still needed (after the next push)

The middleware only exists on Cloudflare after a push to `main`
(Pages auto-deploys). Then, for each host, fetch the raw HTML and
check the title — no browser, no JS:

```bash
for h in deletedproof.northforgelabs.dev \
         app.deletedproof.northforgelabs.dev \
         verify.deletedproof.northforgelabs.dev \
         osint.deletedproof.northforgelabs.dev \
         legal.deletedproof.northforgelabs.dev; do
  echo "== $h"; curl -s "https://$h/" | grep -o "<title>[^<]*</title>"
done
# Expect: ArchiveCheck — Find deleted posts… / DeletedProof — ArchiveCheck
# console… / HandleHistory — Is this a catfish?… / PostTrace — OSINT… /
# PastProof — Archived social media evidence…
curl -s "https://verify.deletedproof.northforgelabs.dev/dashboard.html" \
  | grep -o "<title>[^<]*</title>"
# → <title>Dashboard — HandleHistory</title>
python3 scripts/seo_check.py https://deletedproof.northforgelabs.dev/  # 12/12
python tests/e2e/run_e2e.py --live -k ssr   # Playwright raw-HTML, live hosts
```

Also confirm in a real browser that each subdomain still shows its
wordmark/tagline/accent/preset (the client fallback must agree with
the server — `tests/e2e/test_branding_modes.py` covers this locally).
When all five live titles are right, close issue #20 with the curl
output pasted in the comment.

## 5. Known limits

- **No `wrangler pages dev` in this VM** (wrangler is not
  installable here — npm registry unreachable). The middleware is
  verified three other ways instead: the Node shim test
  (`functions/htmlrewriter-shim.mjs`, test-only, implements the
  `HTMLRewriter` subset the middleware uses), the dev server above,
  and the Playwright raw-HTML test. The first live deploy is still
  the real proof — see §4.
- **The shim is not the real HTMLRewriter.** It is regex-based and
  only supports the selectors the middleware registers. If the
  middleware ever registers a new selector shape, extend the shim
  the same day or the node test will throw "unsupported selector".
- **Dashboard h1 / `.sub` / footer are client-only.** With JS
  disabled on `dashboard.html`, the heading stays "My dashboard"
  and the footer stays the static line, on every host. The dashboard
  is `noindex`, so this is a cosmetic gap, not an SEO one.
- **A hand edit inside the `GENERATED BRANDS` markers in
  `branding.js` will be overwritten** by the next sync — edit
  `web/brands.json` instead.
- **JSON-LD rewrite is best-effort:** unparsable JSON-LD is left
  untouched (safer than emitting broken JSON).
