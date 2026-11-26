# Cloudflare deploy — wayback-social

Host: **Cloudflare Pages** (free tier is enough: static site, no server).
Payment backend stays **Paddle** (one backend for every subdomain —
checkout links live in `web/config.js`, so every version shares them).

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
   `https://wayback-social.pages.dev` (that URL is the canonical +
   sitemap URL in `web/index.html` / `web/sitemap.xml` — update both
   if the project name changes).
6. Custom domain (optional, after a name is locked): Pages → Custom
   domains → set up `wayback-social.com` (or the chosen name) → add
   the DNS records Cloudflare shows. Then update the canonical URL,
   `og:url`, and sitemap `loc` to the custom domain and re-run
   `python3 scripts/seo_check.py https://<custom-domain>/`.
7. Turn on **Cloudflare Web Analytics** (free, no cookie banner):
   Analytics → Web Analytics → enable for the site.

## Subdomains — one payment backend, several front doors

Same Pages project, same `web/config.js` checkout. Add each subdomain
as a Custom Domain on the same Pages project, then point it at the
matching section (real per-subdomain landing pages are a later step;
for now the redirects in `web/_redirects` send them to anchors):

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
python3 scripts/seo_check.py https://wayback-social.pages.dev/
```

All 12 checks must pass. If the canonical domain changed, update
`web/index.html` (canonical + og:url), `web/sitemap.xml`,
`web/robots.txt`, then re-deploy.

## What is NOT needed

- No Worker / server code: CDX calls happen in the visitor's browser.
- No secrets in the repo: Paddle checkout links are public URLs.
- No Lemon Squeezy: closed 16 Nov 2026, processing stops 31 Mar 2027.
