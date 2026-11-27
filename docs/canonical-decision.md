# Canonical decision — ready to apply once John picks

Status: **DECIDED — option (b), 2026-11-27 10:10 EST (John, main chat).
Retarget canonicals to deletedproof.northforgelabs.dev, then deploy.
Applied 2026-11-27 (see "Application notes" at the end). archivecheck.com
NOT bought; the ArchiveCheck umbrella name is still NOT formally locked —
the name/repo rename stays open, it just no longer blocks the deploy.

## The mismatch (verified 2026-11-26)

- Canonicals point at `archivecheck.com`, which John does **not** own yet:
  - `web/brands.json` — all five brands: apex `https://archivecheck.com/`,
    app `https://app.archivecheck.com/`, verify `https://verify.archivecheck.com/`,
    osint `https://osint.archivecheck.com/`, legal `https://legal.archivecheck.com/`
    (these feed the server-side brand injection, so they'd be injected on every
    subdomain page, not just the apex).
  - `web/index.html:15` canonical + `:20` og:url → `https://archivecheck.com/`
  - `web/dashboard.html:9` canonical → `https://archivecheck.com/dashboard.html`
- Sitemap + robots point at the live host instead:
  - `web/sitemap.xml`, `web/robots.txt` → `https://deletedproof.pages.dev/`
- Why it matters: if this ships as-is, search engines are told the canonical
  home of every page is a domain John doesn't own. If someone else registers
  `archivecheck.com`, they hold canonical authority for his pages.
- Availability (last check 2026-11-26 ~21:54 UTC): `archivecheck.com` appears
  available (Verisign 404, no such domain); `.app` / `.io` also look available.
  **Re-confirm at purchase** — do not present the domain as still free.

## Option (a) — Buy archivecheck.com now, keep canonicals as-is

This also locks the ArchiveCheck umbrella name (still NOT formally locked —
John approved the subdomain brands and wiring, not the repo/PyPI/Pages rename).

Human steps (John):
1. Re-check availability at purchase (registrar of choice; Cloudflare
   Registrar is at-cost, no markup).
2. Buy `archivecheck.com` (+ `.app` / `.io` if he wants the full set).
3. Add the domain + 4 subdomains (`app`, `verify`, `osint`, `legal`) as
   custom domains on the Cloudflare Pages project `deletedproof`
   (CNAME → `deletedproof.pages.dev`, proxied) — or let the builder do it
   via the Cloudflare API once the domain exists.

Builder steps after purchase:
1. `web/sitemap.xml` + `web/robots.txt` host → `https://archivecheck.com/`
   (canonicals stay exactly as they are).
2. Re-run: `scripts/seo_check.py` against the live URLs, node branding tests,
   middleware tests, Playwright SSR branding tests.
3. Live-check all 5 new hosts once DNS propagates.
4. Batch push (with everything else) + full validation per push discipline.

Later, separate (not part of this decision): register GitHub org `archivecheck`,
reserve PyPI name `archivecheck`, USPTO clearance check (tmsearch.uspto.gov)
+ counsel on Internet Archive terms, optional Pages project rename
(`deletedproof` → `archivecheck`).

## Option (b) — Retarget canonicals to the live host until the name is locked

No purchase. The canonicals move to `deletedproof.northforgelabs.dev`
(+ subdomains `app.` / `verify.` / `osint.` / `legal.`).

Builder steps (exact, verified against the files):
1. `web/brands.json` — change all five `canonical` values:
   - apex → `https://deletedproof.northforgelabs.dev/`
   - app → `https://app.deletedproof.northforgelabs.dev/`
   - verify → `https://verify.deletedproof.northforgelabs.dev/`
   - osint → `https://osint.deletedproof.northforgelabs.dev/`
   - legal → `https://legal.deletedproof.northforgelabs.dev/`
2. `scripts/sync_brands.py` — update the production-host pattern
   (lines ~80-83: `archivecheck.com` / `^([a-z]+)\.archivecheck\.com$`)
   to `deletedproof.northforgelabs.dev` / `^([a-z]+)\.deletedproof\.northforgelabs\.dev$`,
   and the apex check on the next line. This is the template for the
   generated brand files — never hand-edit the generated blocks.
3. Run `python scripts/sync_brands.py` (regenerates `web/branding.js` +
   `functions/_lib/brands.js`), then `python scripts/sync_brands.py --check`
   (must be clean).
4. `functions/_middleware.js` lines ~85-86 — update the production-host
   check (`hostname === "archivecheck.com" || hostname.endsWith(".archivecheck.com")`)
   to the northforgelabs.dev equivalents. The middleware only rewrites
   canonical + og:url on production hosts, so without this step the retarget
   would silently not apply server-side.
5. Static apex values (not generated): `web/index.html:15` canonical +
   `:20` og:url → `https://deletedproof.northforgelabs.dev/`;
   `web/dashboard.html:9` canonical →
   `https://deletedproof.northforgelabs.dev/dashboard.html`.
6. `web/sitemap.xml` + `web/robots.txt` host →
   `https://deletedproof.northforgelabs.dev/`.
7. Re-run: `scripts/sync_brands.py --check`, node branding tests,
   middleware tests (`functions/middleware.test.mjs`), `tests/test_brands_sync.py`,
   `tests/e2e/test_ssr_branding.py`, `scripts/seo_check.py`.
8. Batch push (with everything else) + full validation per push discipline.
   After the push, live-check the canonical + og:url on all 6 domains.

Reversal: if John later buys `archivecheck.com`, apply option (a) steps 1-3
in reverse (canonicals back to archivecheck.com, production-host pattern
back, sitemap/robots host back) — same files, same commands.

## Application notes (option b, applied 2026-11-27)

- **Two catches beyond the 8 steps above.** (1) `web/trust.html:13/:18`
  also carried an archivecheck.com canonical + og:url — not listed in
  the mismatch section; retargeted to
  `https://deletedproof.northforgelabs.dev/trust.html`. (2) The plain
  `archivecheck.com` grep MISSES the escaped regex forms
  (`\.archivecheck\.com` in `web/branding.js` resolver + canonical
  gate and in the `sync_brands.py` RESOLVER_TEMPLATE) — those needed
  hand edits, and the verification grep must use bare `archivecheck`
  (lowercase), not `archivecheck\.com`. `web/branding.js`'s resolver
  is hand-maintained (only the BRANDS literal is generated), so it
  was edited directly; the template fix was re-synced into
  `functions/_lib/brands.js`.
- **Tests updated with the retarget:** `web/branding.test.js` +
  `functions/middleware.test.mjs` host matrices (production entries
  now the northforgelabs.dev hosts; the old test/production split is
  gone, duplicates removed), `tests/e2e/test_osint_tools.py`
  routing dict. `tests/e2e/test_ssr_branding.py` reads the brands
  from source — no edit needed.
- **App URL defaults moved too:** `functions/api/paddle-webhook.js`
  `APP_URL` default → `https://app.deletedproof.northforgelabs.dev`
  (the licence-email "verify it" link); `RESEND_FROM` examples in
  `docs/email-setup.md` + `docs/paddle-webhook.md` →
  `licences@deletedproof.northforgelabs.dev` (domain still needs
  Resend verification — human step, unchanged).
  `functions/api/billing-portal.js` RETURN_URL was already
  northforgelabs.dev (only its comment mentioned the decision).
- **Untouched on purpose:** the brand NAME stays ArchiveCheck
  everywhere (only the canonical host moved); download filenames
  (`archivecheck-captures.csv` etc.) keep the product name; the
  `archivecheck-vs-*` guide slugs are unchanged; `docs/issues.md`
  historical notes keep their wording.
