# Push readiness — issues #20 / #21 / #22 (+ #1 rename prep)

Date: 2026-11-27 ~02:40 UTC. Status: **verified locally, needs push.**
Nothing in this doc closes an issue — per push discipline, local-only
verification never closes an issue. Each section ends with the exact
live checks the push must run.

Canonical decision is DECIDED (b) 2026-11-27 10:10 EST (John, main chat)
— retarget to deletedproof.northforgelabs.dev, then deploy. The retarget
was applied the same morning (docs/canonical-decision.md, "Application
notes"): the SSR matrix below (§1) was run against the
northforgelabs.dev test hosts, where canonical + og:url are deliberately
NOT rewritten (production-hosts-only rule) — live pages now carry
northforgelabs.dev canonicals. That was the known gate; it is closed.

## §1 — #20 SSR branding matrix (raw HTML, no JS)

Commands (dev server runs the real middleware; X-Test-Host is
dev-only and never reaches the deployed middleware):

```bash
node scripts/dev-server.mjs 8931 &
python3 /tmp/ssr_matrix.py 8931   # /tmp script — see note below
node functions/middleware.test.mjs   # 490/490
node web/branding.test.js            # 121/121
python scripts/sync_brands.py --check  # exit 0
python -m pytest tests/test_brands_sync.py  # 6/6
python -m pytest tests/e2e/test_ssr_branding.py  # 11/11
```

Note: the matrix script lives in /tmp and will not survive a VM
restart — the durable record is the table below + the e2e test above
(which covers the same assertions in the repo).

Result — 6 hosts × 2 paths (`/` and `/dashboard.html`), raw HTML:

| Host | Brand | title | meta desc | og/twitter | JSON-LD | h1 | .sub | footer |
|---|---|---|---|---|---|---|---|---|
| deletedproof.northforgelabs.dev | apex ArchiveCheck | ✓ | ✓ | ✓ | ✓ name+desc | ✓ | ✓ | ✓ |
| app.… | DeletedProof | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| verify.… | HandleHistory | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| osint.… | PostTrace | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| legal.… | PastProof | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| deletedproof.pages.dev | apex (fallback) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

All injected fields match the expected brand per host. Two
documented behaviours, both by design (docs/ssr-branding.md §2/§5):
- **Canonical + og:url NOT rewritten on test hosts.** The middleware
  only rewrites them on production `archivecheck.com` hosts
  (`isProductionHost`, functions/_middleware.js:84-88). On every test
  host the served canonical stays the static apex value
  `https://archivecheck.com/` (dashboard:
  `https://archivecheck.com/dashboard.html`). On production hosts the
  dashboard canonical would become the brand canonical (subdomain
  root) — the dashboard is noindex, so this is cosmetic.
- **Dashboard h1 / .sub / footer NOT server-rewritten.** They stay
  "My dashboard" / the localStorage line / "ArchiveCheck · Local-first
  dashboard…" on every host. Client JS swaps them (cosmetic, noindex).

Also observed (not a bug): in a browser, `branding.js` re-applies the
brand from `location.hostname` after the middleware has run. On any
real host they agree. Under X-Test-Host in the dev server they
disagree (server says the test host, client says 127.0.0.1 → apex) —
the h1 flips back to apex after load. The in-browser brand tests
drive `window.ArchiveBranding.applyBranding(document, host)` for this
reason (tests/e2e/test_branding_modes.py). If a future subdomain is
ever added to brands.json but not to the client resolver, the client
would overwrite the server's correct brand with apex — keep the two
resolvers in sync (tests/test_brands_sync.py guards the data, not the
hostname lists).

**Live checks for the push (#20):** the curl loop in
docs/ssr-branding.md §4 — title on all 5 hosts + apex, dashboard
title on verify. (`Dashboard — HandleHistory`), `seo_check.py` 12/12
on the apex, `run_e2e.py --live -k ssr`. Paste the curl output in the
issue comment, then close #20.

## §2 — #21 exact-case re-verification (juliawalterz, app., free)

Test: `tests/e2e/test_issue21.py` (new) — John's exact live case
(2026-11-26 15:18 EST): app. subdomain, signed out, free tier, From
20200101 To 20231231, juliawalterz on X, through the dev-server proxy
(real `/api/cdx` Function, real archive.org).

Attempts (all 2026-11-27 UTC):
- 02:24:28 — failed on a test assertion (tier badge has no brand name;
  my assertion, not the product).
- 02:24:38 — failed on a test assertion (h1 flips to apex in the
  browser under X-Test-Host — see §1 observation; fixed by driving
  `applyBranding(document, host)` like test_branding_modes.py).
- **02:25:03 — PASSED in 36.45s.**

Per-item result (attempt 3):
| Acceptance item | Result |
|---|---|
| Date picker present; From/To applied to the CDX query | PASS — flatpickr loaded, `#from`=20200101 `#to`=20231231, the proxied CDX request URL contains `from=20200101&to=20231231` |
| Free search works end-to-end via /api/cdx, real rows | PASS — status "Found N capture(s)", N>0 rows, every row dated 2020–2023, no 2006 |
| Sample outside the range labelled / not shown as a result | PASS — no 2006 in the status, no "Verified sample" text, the 2006 jack sample row is not among the results |
| No CLI fallback text anywhere | PASS — body contains none of: pipx, "command line", "use the CLI", "Prefer the command line", "Verified sample", "wayback-social archive" |
| Progress + Pause / Stop / Resume present | PASS — `#job-progress` visible during the run, Pause and Stop enabled |

Archive flakiness during the same hour (recorded, not a product
failure): at ~02:26–02:28 UTC, direct curls to the same proxied CDX
query returned HTTP 503 with the Internet Archive "Temporarily
Offline" page, then HTTP 500. The passing run at 02:25 UTC caught a
recovery window. CDX flapping is the documented behaviour
(docs/data-sources.md) — it is why the failure UI (retry + direct
link + labelled sample) exists, and why the failure-path test in §3
matters.

**Live checks for the push (#21):** reproduce on
app.deletedproof.northforgelabs.dev after the push with the same
inputs (juliawalterz, 20200101–20231231, signed out, free): date
picker present, real rows in range, no demo-as-result, no CLI text,
progress + Pause/Stop/Resume. Then close #21 with the live evidence.

## §3 — #22 CLI-bleed + copy audit

### Grep audit (2026-11-27 ~02:30 UTC, all of web/ incl. guides)
- `pipx`, `"command line"`, `"use the CLI"`, `"Prefer the command
  line"`, `"wayback-social archive"`, `"wayback-social batch"`,
  `"$ wayback"`, `pip install` / `npm install` — **0 hits** in any
  user-facing file (HTML/JS, excluding vendor + `*.test.js`).
- `"CLI"` — 12 hits, 11 in code comments (not rendered) and **1
  user-facing string — punch-list P1 below**.
- `"wayback-social"` in user-facing HTML — **0 hits** (excluding the
  GitHub link). The two comparison guide URL slugs were renamed by
  Track G during this audit from `wayback-social-vs-*` to
  `archivecheck-vs-*` (on-page titles already said "ArchiveCheck vs
  …"); the audit's earlier `ls` caught the old slugs, the final
  `ls` + sitemap confirm the new ones. No redirect needed — the
  guides have never been live.
- `"terminal"` / `"pip"` / `"python -m"` in guides — **0 hits**.
- `"Wayback"` — every user-facing mention names the Wayback Machine
  as ONE source among several (meta/OG/JSON-LD, the sources line,
  trust.html, guides). The product is never called "Wayback".
  `window.WAYBACK_*` globals and `wayback_social` in comments are
  code, not copy.

### Failure-path browser probe
New test file `tests/e2e/test_failure_paths.py` (6 tests — in the repo
so it survives restarts): failed search (aborted /api/cdx), deleted
diff on free tier, evidence pack on free tier (mocked CDX rows),
batch with bad lines, checkout placeholder dialog. Each asserts the
exact user-facing text has no CLI bleed.
Status: **re-run 2026-11-27 ~03:10 UTC (Track J, stable tree) —
6/6 passed in 10.77s.** The earlier 3/6 (02:33 UTC) and the 6/6
page-load failure were both the moving tree (parallel tracks
mid-edit); the fixes are in the punch list below. The test file is
in the repo (per the parent's steer — /tmp does not survive
restarts); the throwaway /tmp probe script was deleted.

### Punch list — FIXED 2026-11-27 ~03:10 UTC (Track J)
Five items, all fixed on the stable tree. Original wording kept
below each item for the record; the new wording follows it.
- **P1 — "the CLI pack" in the evidence-pack report — FIXED**
  (`web/evidence-pack.js:95` — line moved since the audit, in the
  `report.html` template the user downloads). Was: "Post text is
  not fetched in the browser — the CLI pack includes recovered text
  where available." Now: "Post text is not fetched in the browser —
  recovered text is included where the archive captured it."
  (Same rewording applied to the doc that quoted it,
  `docs/osint-tools.md`.)
- **P2 — Sources line overclaims the web search — FIXED**
  (`web/index.html:104`). Track I had already landed Arquivo.pt as
  a web source, so the first clause is now true; the second clause
  still overclaimed ("ArchiveCheck also checks …"). Was:
  "…ArchiveCheck also checks multi-archive TimeMaps (MemGator),
  Common Crawl, and live Bluesky, Mastodon and YouTube posts." Now:
  "…Other sources — multi-archive TimeMaps (MemGator), Common
  Crawl, and live Bluesky, Mastodon and YouTube posts — are covered
  by the full ArchiveCheck product, not by this page."
- **P3 — Checkout dialog leaks internal jargon — FIXED**
  (The dialog had moved: `web/pricing-ui.js:49`, extracted from
  `console.js` by Track I — `console.js` itself was NOT touched and
  stays at 492 lines, so no split was needed.) Was: "…the checkout
  link isn't connected yet. The seller replaces the REPLACE_* link
  in web/config.js, then this button goes straight to secure
  checkout." Now: "…checkout isn't connected yet. Please check back
  soon." (Title kept: "Checkout not connected yet".)
- **P4 — Batch skipped-line report is overwritten — FIXED**
  (`web/batch.js`, now 274 lines). Two changes: `parseTargets`
  echoes the skipped line itself (truncated to 60 chars) in every
  error — e.g. `line 1: unknown network 'not' — "not a valid
  line"` — and `runBatch` carries the skipped-line notice through
  to the final status (`skippedNote`, re-attached by `renderBatch`),
  so progress text no longer swallows it. The mixed-batch
  failure-path test now asserts the skipped line survives to the
  final status.
- **P5 — Honest-limits line promises a feature that doesn't exist
  — FIXED (copy only)** (`web/index.html:266`). Was: "…can't be
  listed per-user — search a single post URL directly instead."
  Now: "…can't be listed per-user — check a single post URL on
  web.archive.org directly instead." (Same rewording applied to
  the quote in `docs/web-search-ux.md`.) The single-post-URL web
  mode itself was NOT built — that is a follow-up option, recorded
  in TEST-REPORT.md (Track J), not a fix in this track.

### Live checks for the push (#22)
- Grep the DEPLOYED pages (not just the local tree) for the banned
  strings, including a forced-failure search and the blocked-tier
  dialogs, on all 5 subdomains + apex.
- Confirm the P1–P4 fixes (once built) are in the deploy: download a
  Studio evidence pack and read its report.html; read the sources
  line; click a Buy button; run a batch with a bad line + a good line.
- Then close #22 with the live evidence.

## §4 — #1 rename dry-run (prep only, nothing renamed)

`scripts/rename-dry-run.py` (read-only, stdlib only) + the ordered
runbook in `docs/rename-runbook.md`. Last run 2026-11-27 ~02:45 UTC:
counts move while parallel tracks land — re-run at rename time for
the fresh baseline. Latest: `wayback-social` 277, `wayback_social`
116, `deletedproof` 262, `DP1`/`DP2` 285, `WAYBACK_*` globals 26,
D1 name 29, `DeletedProof` 87 (KEEPS its name — the app. brand),
`archivecheck.com` 177 (already the target).
Proven read-only (tree checksums unchanged across two runs) and
deterministic (two runs identical). Open decisions (John): licence
prefix (keep DP1/DP2 or AC1/AC2 — live keys must keep verifying),
Python import name, Pages project rename, GitHub org. (Guide slugs
were already renamed to `archivecheck-vs-*` by Track G during this
audit, so that decision is closed.) The rename waits on the
canonical decision option (a) — domain purchase first, rename
second.
