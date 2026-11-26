# DeletedProof — Cloudflare Hosting Plan

**Decision (John, 26 Nov 2026): Cloudflare hosts it.** Static first,
no server to babysit. One deployment serves all five subdomains (see
`docs/branding-seo-plan.md` §2); the version is selected by hostname
in JS, so there is one build, one deploy, one set of Paddle links.

## 1. Cloudflare Pages project

| Setting | Value |
|---|---|
| Project name | `deletedproof` (Pages project; URL `deletedproof.pages.dev`) |
| Production branch | `main` |
| Framework preset | None (static HTML) |
| Build command | `cp -r web/* dist/ && cp web/.headers dist/ 2>/dev/null; true` — or no build command with **output directory `web/`** (simplest; start here) |
| Output directory | `web/` |
| Root directory | `/` (repo root) |
| Environment variables | None needed at v1 (checkout links live in `web/config.js`) |
| Deploy hook | Push to `main` auto-deploys (GitHub integration) |

Start with **output directory `web/`, no build command**. Only add a
build step when a version needs different files per subdomain (see §3).

**Repo layout it deploys:** `web/index.html` (app + marketing),
`web/config.js` (pricing + checkout links — the single source of
truth for Buy buttons), plus `_headers` / `_redirects` below (put them
in `web/` so Pages picks them up).

## 2. Custom domain + subdomains (Cloudflare DNS)

Buy `deletedproof.com` at Cloudflare Registrar (~$10–15/yr, renews at
cost, no markup), then add it as a custom domain on the Pages project.
Cloudflare auto-creates the DNS. Add the subdomains as CNAMEs to the
Pages project (each custom domain on the same project):

| Host | Points to | Serves |
|---|---|---|
| `deletedproof.com` | Pages project | Marketing + free search (default version) |
| `www.deletedproof.com` | Pages project | Redirect → apex (see `_redirects`) |
| `app.deletedproof.com` | Pages project | Full console |
| `verify.deletedproof.com` | Pages project | Dating/catfish verify flow |
| `osint.deletedproof.com` | Pages project | Researcher / batch / evidence pack |
| `legal.deletedproof.com` | Pages project | Legal triage / citations |

All get free automatic HTTPS (Cloudflare Universal SSL). Turn on
**"Always Use HTTPS"** and **HSTS** in SSL/TLS → Edge Certificates.

**Hostname routing in JS** (in `web/index.html`, at load): read
`location.hostname`; `verify.*` → verify mode, `osint.*` → OSINT
mode, `legal.*` → legal mode, `app.*` → full console,
apex/`www` → marketing + free search. Unknown host (e.g.
`deletedproof.pages.dev`) → default marketing version. This keeps
one deploy for all five versions — no per-subdomain builds to drift.

## 3. `wrangler.toml` (only needed if you outgrow the dashboard)

For a static Pages project you do **not** need wrangler at v1 — the
dashboard + GitHub integration is enough. Keep this file in the repo
anyway so a deploy can be reproduced from the CLI:

```toml
# wrangler.toml — DeletedProof static site (Cloudflare Pages)
name = "deletedproof"
pages_build_output_dir = "web"

# No build command: web/ is deployed as-is.
# If per-subdomain files are ever needed, add:
# [build]
# command = "cp -r web/* dist/"
```

Deploy from CLI when needed: `npx wrangler pages deploy web/
--project-name deletedproof`. (Requires a Cloudflare account + API
token; John creates the account — no credentials are stored here.)

## 4. `_redirects` and `_headers` (in `web/`)

`web/_redirects` — plain text, one rule per line:

```
# www -> apex, keep the path
https://www.deletedproof.com/* https://deletedproof.com/:splat 301
# Legacy product name -> new brand (keep old links working)
/wayback-social/* https://deletedproof.com/:splat 301
```

`web/_headers` — security + caching (Pages serves these automatically):

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.paddle.com https://js.stripe.com; connect-src 'self' https://web.archive.org https://cdn.paddle.com https://api.stripe.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'
  Cache-Control: public, max-age=300
/*.js
  Cache-Control: public, max-age=3600
```

Note: the CSP must allow the CDX API (`web.archive.org`) because the
in-browser search calls it directly, and Paddle/Stripe checkout
scripts. Tighten `unsafe-inline` later if the page drops inline JS.

## 5. Paddle webhooks + licence delivery — keep it simple

**V1 (launch): no webhook, no server.** Paddle is merchant of record
and already does licence delivery: create each tier as a Paddle
product with a licence key (Paddle → Products → Licence management),
and Paddle emails the buyer their key at checkout. The web app
accepts the key in a licence box (stored in a `.deletedproof.com`
cookie so it works on every subdomain) and unlocks the tier's caps
client-side. No Pages Function, no Worker, nothing to maintain.

**V2 (only if needed): Pages Function for webhook verification.**
If you later want server-side key generation or usage counting, add
`functions/api/paddle-webhook.js` to the repo (Pages Functions run on
the same project, no separate Worker):

- Paddle sends `transaction.completed` → Function verifies the
  Paddle signature (Paddle docs: `Paddle-Signature` header, HMAC) →
  writes `{email, tier, licence_key}` to Cloudflare KV (free tier:
  100k reads/day, 1k writes/day — plenty) → licence key emailed
  via Paddle's built-in delivery or a transactional email service.
- Never trust an unsigned webhook; never store search targets
  server-side (local-first is a selling point — see trust page).

**Do not build:** user accounts, a database of searches, or a
server-side search proxy at v1. The browser calls the CDX API
directly; the CLI runs locally. That is the privacy story.

## 6. Costs (Cloudflare free tier covers v1)

| Item | Cost |
|---|---|
| Cloudflare Pages (unlimited static requests, 500 builds/mo) | $0 |
| Custom domain + 5 subdomains, Universal SSL | $0 (domain ~$10–15/yr at Registrar) |
| Cloudflare DNS | $0 |
| Pages Functions (if added later) | $0 up to 100k requests/day |
| KV (if added later) | $0 up to 100k reads/day |
| Paddle | 5% + 50¢ per sale, no monthly fee |
| Total fixed monthly cost at launch | **$0 + domain renewal** |

## 7. Launch checklist (hosting)

1. Buy `deletedproof.com` (+ `.app`, `.io`) at Cloudflare Registrar.
2. Create Pages project `deletedproof` → connect GitHub repo
   `ClumsySmurf1337/wayback-social` (rename repo to DeletedProof
   first, or after — Pages follows renames) → output `web/`.
3. Add custom domains (apex + 4 subdomains); confirm HTTPS on each.
4. Add `_redirects` + `_headers` to `web/`, push, verify headers
   with `curl -I https://deletedproof.com`.
5. In Paddle: create 4 products (Starter $19 / Pro $29 / Studio $99 /
   Top-up $15), enable licence keys, paste checkout links into
   `web/config.js` (replace the `REPLACE_*` placeholders).
6. Test a $1 Paddle sandbox purchase end-to-end on `app.`, `verify.`
   and `osint.` subdomains; confirm the licence key unlocks on all
   three (shared `.deletedproof.com` cookie).
7. Test the free search on the apex with `clumsysmurf` (2 archived X
   captures — known-good) and `johnmakesapps` (0 — known "not found"
   case) before announcing.
