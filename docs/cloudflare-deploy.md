# Cloudflare deploy — wayback-social

**Status 2026-11-27 (Track R): this doc predates the live project —
most of it is DONE, and the names/URLs below are stale. The live
project is `deletedproof` (NOT `wayback-social`): Pages URL
`https://deletedproof.pages.dev`, canonical
`https://deletedproof.northforgelabs.dev` (+ `app.` / `verify.` /
`osint.` / `legal.` subdomains, all live). Deploy flow is LOCKED in
`docs/deploy-prep.md` §0: `develop` → preview, `main` → production via
PR. Checkout default is now **Stripe** (live 2026-11-27), Paddle is the
alternative. Web Analytics is still open (issue #10, blocked on #30).
The setup steps below are kept for reference — do not follow them
as if the project still needs creating.**

Host: **Cloudflare Pages** (free tier is enough: static site, no server).
Payment backend is **Stripe** (live default since 2026-11-27 — checkout
links live in `web/config.js`, so every version shares them; Paddle is
the `?checkout=paddle` alternative).

## What the user must do (needs a Cloudflare account — not done here)

1. Sign in at dash.cloudflare.com (free account is fine).
2. Workers & Pages → Create → Pages → Connect to Git.
3. Pick GitHub repo **ClumsySmurf1337/wayback-social**, branch `main`.
4. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **`web/`**
   - Root directory: `/` (repo root — `wrangler.toml` already says this)
5. Deploy. The site goes live at
   `https://deletedproof.pages.dev` (the canonical host is
   `https://deletedproof.northforgelabs.dev` — that URL is the canonical +
   sitemap URL in `web/index.html` / `web/sitemap.xml`).
6. Custom domain — DONE 2026-11-26/27: `deletedproof.northforgelabs.dev`
   + `app.` / `verify.` / `osint.` / `legal.` are live custom domains
   on the `deletedproof` project (CNAME → `deletedproof.pages.dev`,
   proxied). Do not add another custom domain without a name decision
   (issue #2). If the canonical host ever changes, update the canonical
   URL, `og:url`, and sitemap `loc` to the new domain and re-run
   `python3 scripts/seo_check.py https://<custom-domain>/`.
7. Turn on **Cloudflare Web Analytics** (free, no cookie banner) —
   STILL OPEN (issue #10): the connector cannot create the RUM site
   (403, missing `account-settings.write` scope); the dashboard route
   needs the secondary-member login (issue #30, invite to
   clumsysmurf34@gmail.com pending John's acceptance) or a connector
   re-authorization with that scope. Do not retry the broken Google
   SSO dashboard sign-in (OIDC callback rejected 5x).

## Subdomains — one payment backend, several front doors

Same Pages project, same `web/config.js` checkout. Each subdomain is a
Custom Domain on the same Pages project and opens its own brand +
preset via `web/branding.js` (client) and `functions/_middleware.js`
(server-side titles/meta) — NOT anchor redirects (the `_redirects`
anchor plan below is superseded):

| Subdomain | Audience | Lands on |
|---|---|---|
| `app.` | main search tool | `/#search` |
| `verify.` | catfish / dating checks | `/#presets` (catfish preset) |
| `osint.` | researchers / journalists | `/#presets` (researcher preset) |
| `legal.` | legal evidence | `/#presets` (legal preset) |

To make a subdomain a *different* page instead of an anchor, add a
Pages Function or a second static file (e.g. `web/verify/index.html`)
and a `_redirects` rule — do not duplicate `config.js`.

## After every deploy

```bash
python3 scripts/seo_check.py https://deletedproof.northforgelabs.dev/
```

All 12 checks must pass. If the canonical domain changed, update
`web/index.html` (canonical + og:url), `web/sitemap.xml`,
`web/robots.txt`, then re-deploy.

## CDX proxy — the one server-side piece (v1.5)

`functions/api/cdx.js` is a Pages Function that proxies the Wayback
CDX API same-origin. It exists because archive.org sends no CORS
headers: a live search from the deployed page failed in the browser
(verified 2026-11-26 on deletedproof.northforgelabs.dev) and the page
fell back to demo data. The page uses `/api/cdx` on any non-localhost
host; on localhost the dev server (`scripts/dev-server.mjs`) routes
`/api/cdx` to the same Function, so local searches use the proxy too.
Allowlisted query params only, no credentials, no POST,
5-minute edge cache. It deploys automatically with the Pages project
— no extra setup — and shares the Pages Functions free budget
(100k requests/day). The Free-tier cap (25 captures/search) keeps one
visitor from hammering archive.org through it. (Since v1.5 there are
more same-origin proxies — `/api/arquivo`, `/api/ghostarchive`,
`/api/commoncrawl`, `/api/live-check`, `/api/evidence-usage`,
`/api/billing-portal`, `/api/licence-check`, `/api/packs-upload`,
`/api/config` — all routed by the dev server too.)

## What is NOT needed

- No other Worker / server code: the rest of the app is static.
- No secrets in the repo: Paddle checkout links are public URLs.
- No Lemon Squeezy: closed 16 Nov 2026, processing stops 31 Mar 2027.
