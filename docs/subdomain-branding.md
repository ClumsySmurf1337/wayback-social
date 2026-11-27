# Dynamic per-subdomain branding — one web app, five brands

**Date:** 2026-11-26. **Status:** WIRED 2026-11-26, verified (see §6) —
branding.js is loaded by index.html + dashboard.html, the approved
brands are live in the page, and the wiring snippet in §5 is applied.
**Server-side (2026-11-26, issue #20):** titles/meta are now ALSO
injected by a Pages Function middleware (`functions/_middleware.js`,
docs/ssr-branding.md) from the shared `web/brands.json` — the static
files carry the apex brand, and a no-JS crawler sees the right brand
per subdomain. **Umbrella brand:** ArchiveCheck (docs/naming-v2.md —
only shortlisted name with a free .com, PyPI and GitHub). **Nothing
renamed, no domains bought.**

## 1. The five brands

One Cloudflare Pages deployment, one Paddle backend, one licence cookie
on the parent domain. The brand swaps by hostname at load time
(`web/branding.js`). Subdomain brands do NOT need their own .com —
they live at `<sub>.archivecheck.com` (production) and
`<sub>.deletedproof.northforgelabs.dev` (test). The umbrella owns the
.com; the subdomains borrow it.

| Subdomain | Display brand | Tagline | Hero line | Accent (one shift) | Default preset | SEO title |
|---|---|---|---|---|---|---|
| apex `archivecheck.com` | **ArchiveCheck** | Check the archive before you trust the profile. | What did they post — and what did they delete? | `#1F9D63` evidence green (umbrella default) | none (preset picker) | ArchiveCheck — Find deleted posts & check any profile in the archive |
| app. | **DeletedProof** — by ArchiveCheck | Every capture. Every deletion. One console. Proof a post existed, dated and sourced. | The full console — broad search, batch, deleted-only diff and evidence packs. | `#E8A13D` alert amber (power console) | none | DeletedProof — the ArchiveCheck console \| Deleted posts, batch & evidence packs |
| verify. | **HandleHistory** — by ArchiveCheck | Is your match who they say they are? Read their handle's history before you meet. | Check their past before you meet them — old posts, old bios, old handles. | `#E85D75` warm rose (dating, human) | `catfish` | HandleHistory — Is this a catfish? Check a dating profile's past posts |
| osint. | **PostTrace** — by ArchiveCheck | Trace their posts across 14 networks — what they said, when, and what vanished. | For researchers and journalists — batch, date ranges, deleted-only diff, evidence packs. | `#3E7CB1` steel blue (newsroom) | `journalist` | PostTrace — OSINT archive search for journalists & researchers |
| legal. | **PastProof** — by ArchiveCheck | Proof from the past — archived posts, dated and sourced, ready to cite. | For lawyers and paralegals — evidence packs, citation format, replay links. Triage, not court-ready. | `#C9A227` deep gold (law, exhibits) | `legal` | PastProof — Archived social media evidence for lawyers & paralegals |

Base palette (v1, unchanged everywhere): ink navy `#0F1E33`, evidence
green `#1F9D63`, paper `#F7F4EC`, alert amber `#E8A13D`, slate
`#5A6B7F`, deleted red `#C0392B` (deleted states only). Each subdomain
shifts exactly ONE accent; the rest stays, so the five sites still read
as one family. JSON-LD `name` per subdomain is "`<Brand> by
ArchiveCheck`" (apex: just `ArchiveCheck`); meta descriptions are in
`web/branding.js` (one entry per brand, full text there).

**Honest limits, every subdomain, no exceptions.** Every brand's footer
ends with: *"Public archived posts only. Found ≠ guilty. Not found ≠
not real."* Legal adds *"Triage, not court-ready."* A brand swap never
swaps the honesty out — `applyBranding()` writes the limits line with
the footer on every host.

## 2. Why these names — fit per audience

- **apex / ArchiveCheck.** The umbrella. "Archive" is the searched word,
  "check" is the action every market uses; broad enough for all five
  audiences, ownable everywhere (.com + PyPI + GitHub free, naming-v2).
- **app / DeletedProof.** The v1 name, clean sweep everywhere, and the
  console's signature feature is the deleted-only diff — the name says
  what the console does. Licence keys are already `DP1-…`, so the
  continuity is free. It failed as the *umbrella* (too narrow) but is
  exactly right for the power console.
- **verify / HandleHistory.** The dating namespace is a minefield (see
  §3) — every "XCheck" name collides. HandleHistory says literally
  what the tool does (a handle's history: old posts, old bios, old
  handles), a dater gets it in two seconds, and the hero line does the
  dating work ("Is your match who they say they are?"). SEO title/meta
  carry the dating keywords ("is this a catfish", "verify dating
  profile") — the display name doesn't have to be the search term.
- **osint / PostTrace.** Best name in the shortlist (shortest, most
  active verb). "Trace their posts" is exactly the researcher workflow:
  batch, date ranges, diff. No product named PostTrace exists.
- **legal / PastProof.** "Proof from the past" is evidence language —
  dated, sourced, citable. The dating connotation that hurt it as an
  umbrella name (a "PAST PROOF" jealousy self-help book) is irrelevant
  to lawyers. No legal-space collision.

## 3. Collision checks — all live, 2026-11-26

Method: web search for the exact name + "product/app/verification" in
that space; PyPI `pypi.org/pypi/<name>/json` (404 = free) and GitHub
user page (404 = free) only where noted. Subdomain brands need no .com
— that column is marked n/a on purpose.

| Name | Assigned to | Collision? | Verdict |
|---|---|---|---|
| ArchiveCheck | apex (umbrella) | None (naming-v2 §2/§4: only an unrelated filing-register plugin + a SanctionsKit schema field) | USE |
| DeletedProof | app | None (v1: .com/.app/.io + PyPI + GitHub all free) | USE |
| PostTrace | osint | None named PostTrace; "trace" space crowded (SocialTrace, Trace, Tracee) — adjacent, not a collision | USE |
| PastProof | legal | None exact; near-neighbours PasteProof (Chrome ext), PatchProof (dev tools), "PAST PROOF" jealousy book — none in legal | USE |
| HandleHistory | verify | **None found.** PyPI 404 (free), GitHub 404 (free) — checked 2026-11-26 even though a subdomain brand needs neither | USE |
| HandleCheck | — | **COLLISION (naming-v2):** handlecheck.io (brand-name checker, $19/report) + handlecheck.online (trust-score product) | DO NOT USE |
| SocialTrace | — | **COLLISION (naming-v2):** SocialTrace on Product Hunt (social-to-revenue attribution); GitHub user + .com + .app taken | DO NOT USE |
| CatfishCheck | — (verify candidate) | **COLLISION:** Cray app's CatfishCheck™ feature (dating safety, $1.99, live at cray.app) + CortiCorp's CatfishCheck investigation tool | DO NOT USE |
| DateCheck | — (verify candidate) | **COLLISION:** Intelius DateCheck (background-check app, 2009) + datecheck.ca (live dating-safety app, face recognition) | DO NOT USE |
| RealCheck | — (verify candidate) | **COLLISION:** tryrealcheck.com (live scam checker; "RealCheck ID" is a romance-scam feature — the exact use case) + Bitdefender RealCheck (deepfake detector app) + Payhip RealCheck dating-scam reports | DO NOT USE |
| TrustCheck | — (verify candidate) | **COLLISION:** TrustMatch's "TrustCheck" (identity verification, $6.99/report, dating use case) + TrustCheck AI app | DO NOT USE |
| ProfileCheck | — (verify candidate) | **COLLISION:** fakeprofilechecker.com is literally named "ProfileCheck" (free catfish checker, same use case) + profilecheck.net (CV credential agency) + ProfileCheckr (2017 dating profile checker) | DO NOT USE |
| PostHistory | — (verify candidate) | **NEAR-COLLISION:** bnbot.ai "PostHistory for X" (iOS app saving X post history) — different function, same X-history space | DO NOT USE as primary |

**Lesson from the checks:** the dating/identity "Check" namespace is
saturated — seven plausible verify names all collided. That is why
verify. uses HandleHistory (a *history* name, not a *check* name) and
why the dating keywords live in the SEO copy, not the brand.

## 4. How it works — one source of truth, two consumers

**Source of truth: `web/brands.json`.** The brand table lives there
and nowhere else. `scripts/sync_brands.py` regenerates the `BRANDS`
literal in `web/branding.js` (between the `GENERATED BRANDS` markers)
and the `functions/_lib/brands.js` ES module for the server; `--check`
exits 1 on drift and `tests/test_brands_sync.py` enforces it in CI.
Never edit the generated blocks by hand — edit the JSON and sync.
The sync script also enforces the SEO gates the served page must
pass (seoTitle 30–70 chars, metaDescription 50–160 chars); the 2026-11-26
trims that made the v1 copy fit are recorded in `docs/ssr-branding.md` §3.

- **Server-side — `functions/_middleware.js` (issue #20).** A Pages
  Function middleware: for `GET` `200` `text/html` responses to `/`,
  `/index.html` and `/dashboard.html` it rewrites, via `HTMLRewriter`,
  `<title>`, meta description, og/twitter tags, JSON-LD name +
  description, and on the index page the h1 wordmark, `.sub` tagline
  and footer — per request hostname, from `functions/_lib/brands.js`.
  Canonical + `og:url` only on production hosts. Everything else
  (API routes, assets, POST, 404s) passes through untouched. This is
  what crawlers and link previewers see. Full detail:
  `docs/ssr-branding.md`.
- **Client-side — `web/branding.js` (fallback).** `BRANDS` map keyed by
  subdomain (`apex`, `app`, `verify`, `osint`, `legal`), one entry per
  brand with name, wordmark HTML, tagline, hero, accent, default
  preset, SEO title, meta description, JSON-LD name, canonical,
  footer, dashboardTitle. `resolveBrand(hostname)`: strips port/`www.`,
  lowercases, then matches production (`<sub>.archivecheck.com`), test
  (`<sub>.deletedproof.northforgelabs.dev`), `*.pages.dev`, localhost /
  `127.0.0.1`, and a generic first-label fallback. Unknown host → apex.
  `applyBranding(doc, hostname)`: swaps `document.title`, meta
  description, og/twitter tags, canonical (production hosts only),
  JSON-LD name + description, `h1` wordmark, `.sub` tagline,
  `#search-hero` hero line, footer, `--brand-accent` on `:root`,
  `body[data-brand]` / `body[data-default-preset]`, and clicks the
  default preset control (`[data-preset="<id>"]`) if the page has one.
  Every lookup is guarded — a missing element is skipped, never an
  error — so the file is safe on dashboard.html or any future page.
  Exposes `window.ArchiveBranding` (`BRANDS`, `resolveBrand`,
  `getBrand`, `applyBranding`, `UMBRELLA`, `LIMITS_LINE`); in Node it
  exports the same API via `module.exports` for testing.
- **Static fallback.** `web/index.html` and `web/dashboard.html`
  carry the apex brand in their static copy, so a visitor with no
  middleware and no JS still sees "ArchiveCheck", never the repo slug.

## 5. Wiring snippet — APPLIED 2026-11-26 (was "merge after v1.5")

In `web/index.html`, in `<head>` after the `<style>` block, add:

```html
<style>h1 span{color:var(--brand-accent,#1F9D63)}</style>
<script src="branding.js"></script>
```

In the search section, give the section headline an id so the hero line
can swap (the `h2` currently reads "Search the archive"):

```html
<h2 style="margin-top:0" id="search-hero">Search the archive</h2>
```

Nothing else: `branding.js` auto-applies on `DOMContentLoaded` and
guards every hook, so the page works unchanged if a hook is missing.
Optional, for the preset picker (v1.5): give each preset button
`data-preset="<id>"` (`catfish`, `relationship`, `brand`, `hiring`,
`legal`, `journalist`, `researcher`) so `applyBranding()` can
pre-select `catfish` on verify., `journalist` on osint., `legal` on
legal. No `config.js` change is needed — pricing, checkout and licence
config are brand-agnostic by design.

## 6. Test plan + results (2026-11-26)

**Node (done):** `node web/branding.test.js` — **121/121 checks pass.**
Covers: all 5 production hosts + all 5 test hosts resolve to the right
brand; `www.`, uppercase, `:443` port, localhost (+`:8000`),
`127.0.0.1`, `*.pages.dev`, unknown host → apex fallback; every brand
has a valid hex accent, a valid preset (or null), the limits line and
the umbrella name in its footer; `applyBranding()` on a fake DOM swaps
title, h1 wordmark, tagline, hero, footer, `--brand-accent`,
`body[data-brand]`, JSON-LD name, and clicks the right default preset
for verify/osint/legal. Re-run after any brand edit:
`node web/branding.test.js` (exit 0 = pass).

**Browser (done locally 2026-11-26, Playwright + node harness):**
`tests/e2e/test_branding_modes.py` (5 tests) drives the real page in
Chromium: applyBranding per hostname (all 5 test hosts + production
hosts via evaluate), preset auto-select (verify → catfish, osint →
journalist, legal → legal), aria-pressed + broad checkbox, footer
limits line on every brand. A node harness fetched the served files
and resolved all 9 hostnames (5 test + 2 production + localhost +
unknown → apex fallback) with the right title/hero/accent/preset.
**Still to do:** open each of the 5 northforgelabs.dev hosts in a real
browser and check title/wordmark/tagline/hero/accent/default preset
after the next Pages deploy; repeat on archivecheck.com once bought.
Also confirm the pricing/checkout/licence behaviour is identical
across hosts (one backend — branding must never change a cap or a
price).

**Server-side (done locally 2026-11-26, issue #20):** the
JS-applied-title gap is closed — `functions/_middleware.js` rewrites
the served HTML per hostname (docs/ssr-branding.md). Verified:
`node functions/middleware.test.mjs` **486/486** (all 5 subdomains +
apex + unknown host, index + dashboard, passthrough cases, static
files carry the apex brand); `tests/e2e/test_ssr_branding.py` **11/11**
(raw HTML over real HTTP via `scripts/dev-server.mjs`, no JS runs);
`scripts/seo_check.py` **12/12** against the middleware-served apex
page. The remaining step is the live check after the next push
(curl each subdomain, grep `<title>` — commands in
docs/ssr-branding.md §4); local-only verification never closes
issue #20.

## 7. Open questions (for John)

- Umbrella name is still unapproved (naming-v2: ArchiveCheck
  recommended, decision pending). If John picks PostTrace or keeps
  DeletedProof as the umbrella, only `BRANDS.apex` + `UMBRELLA` change;
  the subdomain assignments stand.
- HandleHistory is the riskiest pick (new name, weakest searchability
  of the five). Alternative: verify. shows "ArchiveCheck Verify" with
  no distinct name. The SEO copy is identical either way — the choice
  is branding only.
- Accent colours are proposals: rose for dating, steel blue for OSINT,
  gold for legal, amber for the console. If any feels off-brand, change
  one hex value in `BRANDS` — no code change.
