# OSINT research tools — web UI (issue #13 follow-up, 2026-11-27)

The subdomain routing (issue #13) already sent each host to the right
mode, but the mode *substance* for osint. (batch / diff / evidence)
and legal. (citations) was CLI-only. This build puts those flows in
the web console as a "Research tools" section on `index.html`
(`#osint-tools`, tabs Batch / Deleted diff / Citations), reusing the
existing search machinery — no second search path, no CLI text on any
public page.

## What each mode does

### Batch (`web/batch.js` — `runBatch`)
- Paste `NETWORK @handle` lines, one per line (`x jack`,
  `instagram nasa`); `#` lines are comments. Bad lines are reported
  and skipped, not fatal.
- Each target is one `SearchJob` step (progress + Pause / Stop /
  Resume reuse `web/search-job.js`). Tier cap enforced up front:
  free 3, Starter 10, Pro 50, Studio 200 targets per run; extra
  lines wait for the next run and the status line says so.
- Results are grouped per target (network @handle — N captures,
  first 5 rows shown, snapshot link on every row) with CSV/JSON
  download. JSON follows the same tier gate as the main console
  (free exports CSV only).

### Deleted diff (`web/diff.js` — `runDiff`, `web/live-check.js`,
`functions/api/live-check.js`)
- One handle, one network (optional From/To). CDX rows are deduped
  to one row per post (latest capture kept, earliest remembered) and
  each post is live-checked through the same-origin Pages Function
  `POST /api/live-check` (the browser cannot HEAD a live post URL
  directly — no CORS on x.com / instagram.com / …).
- Verdicts mirror the CLI `diff` (`wayback_social/diff.py` →
  `classify_live`): 200 → live, 404/410 → deleted, anything else
  (401/403/429/5xx, login redirect, timeout, error) → **unknown,
  never deleted**. X 401/403/429 consults oEmbed (404 → deleted,
  200 → live); oEmbed is never consulted on 5xx.
- Non-post captures (profile / listing pages) are skipped and
  counted — a 404 on a profile page is not a deleted post. The
  "Only deleted" checkbox re-renders from the stored rows.
- **Tier gate (pricing.yaml `features.deleted_diff`): free has no
  deleted diff** — the free tier can search and download captures,
  but verdicts need Starter ($9 launch) or above. The gate is
  enforced in `runDiff()` and in the panel copy. `deleted_diff` is
  exposed on `licence.js` `PLAN_CAPS` / `BUNDLE_CAPS` (mirroring
  `plans.py` `PLAN_FEATURES`); the six numeric caps are unchanged
  and still sync-checked by `test_js_caps_match_python_caps`.
- The Function caps at 25 URLs per request; the client chunks
  longer lists. A failed chunk marks its URLs unknown, never deleted.
  10s per-URL timeout server-side.

### Citations (`web/citations.js`)
- Builds a citable list from the results already on screen — a diff
  run's verdicts win, otherwise the plain search's captures.
  Per post: archived URL, Wayback timestamp, snapshot link, live
  verdict, retrieval date. Copy-pasteable text + downloadable
  `.md` / `.csv`. "Include live verdicts" checks each post live
  first (through `/api/live-check`).
- The triage disclaimer is part of every list, on screen and in
  every download: **"Triage, not court-ready. Found ≠ guilty. Not
  found ≠ not real."** A citation proves a post existed on the
  archived date — not who wrote it, why it was deleted, or intent.
- Citations dedupe by URL (latest capture wins) — a citation cites
  the newest snapshot of a post, not a duplicate of it. (This fixed
  a real bug in the first version of `recordsFromRows`, which kept
  both captures.)

### Evidence pack (`web/evidence-pack.js`)
- Studio-gated button (in `#actions` and in the batch/diff panels).
  Builds the pack **client-side from the rows on screen** — the same
  pack the CLI builds (`wayback_social/evidence.py`): `report.html`,
  `captures.csv` / `.json` / `.jsonl`, `manifest.json`,
  `manifest.sha256`, `README.txt`; same manifest fields
  (tool, tool_version, generated_at, network, identifier, date_range,
  source, counts, files, ethics).
- The ZIP is written here (stored entries, no compression library —
  nothing vendored to fetch); CRC32 is table-driven; SHA-256 comes
  from WebCrypto and is never faked — if `crypto.subtle` is
  unavailable the button says so honestly instead of building an
  unverifiable pack. Post text is **not** fetched in the browser, and
  the report says so (recovered text is included where the archive
  captured it).
- Gating reuses the local-first counting (`web/evidence-usage.js`,
  issue #15): the log happens **before** the pack is built, so a
  blocked 11th report never downloads. Free/Starter/Pro include 0
  reports. `evidence-usage.js` is now loaded on `index.html` too —
  it was dashboard-only, which the E2E suite caught (the free-tier
  block fell through to the fallback branch until the script tag
  was added).

## Routing

`initOsintTools()` (in `batch.js`) reads the brand from
`body[data-brand]` when branding.js already ran, otherwise resolves
it from the hostname via `ArchiveBranding.resolveBrand` — it never
depends on listener ordering. osint. opens with the section as the
primary mode (Batch tab); legal. opens with the Citations tab; app.
opens it too (Batch). Other hosts keep the panels collapsed behind
the toggle — same tool, same caps, same archive, one click away.

## Files

| File | Lines | What |
| --- | --- | --- |
| `functions/api/live-check.js` | 151 | Pages Function: POST {urls ≤ 25} → verdicts |
| `web/live-check.js` | 64 | Client: chunked POST, unknown-on-failure |
| `web/batch.js` | ~250 | Batch mode, shared state, tabs, routing |
| `web/diff.js` | ~200 | Deleted-diff mode (split from batch.js — one job per file) |
| `web/citations.js` | 196 | Citation builders + UI |
| `web/evidence-pack.js` | 296 | ZIP + SHA-256 manifest pack builder |
| `web/live-check.test.js` | — | 13 checks (chunking, unknown-on-failure) |
| `web/osint-tools.test.js` | — | 73 checks (batch/diff/citations/pack/caps) |
| `tests/e2e/test_osint_tools.py` | — | 13 Playwright tests (real browser) |
| `scripts/dev-server.mjs` | — | + `/api/live-check` route (real Function) |

`web/console.js` gained one getter (`window.WS_CONSOLE.getRows()` —
the rows on screen for citations/evidence); `web/modes.js` needed
no change (`fetchPatternTimed` was already exported). `web/index.html`
gained the `#osint-tools` section, one evidence-pack button in
`#actions`, and the script tags (incl. `evidence-usage.js`).

## Proof (local, 2026-11-27)

- `node functions/api/live-check.test.mjs` — 6/6 (verdicts, oEmbed
  tie-breaker, guards).
- `node web/live-check.test.js` — 13/13.
- `node web/osint-tools.test.js` — 73/73 (incl. a real ZIP round-trip:
  all 7 files extracted, CRCs verified, manifest.json hashes recompute
  correctly, `sha256sum -c manifest.sha256` format).
- `node web/*.test.js` + `node functions/*.test.mjs` — all green
  (branding 121/121, search-job 54, modes 19, evidence-usage 31,
  analytics 10, console-timeout 17, auth, turnstile, middleware
  490/490, packs-upload 14/14).
- `pytest tests/` — **144 passed, 1 skipped** (baseline, unchanged).
- Playwright `tests/e2e/test_osint_tools.py` — **13/13** (mocked CDX
  + mocked live-check, real dev server + real middleware): section
  collapsed on apex, routing per brand (osint→Batch, legal→Citations,
  app→Batch, apex→collapsed), batch with tier cap (4 lines → first 3,
  grouped counts, snapshot links), batch CSV + JSON-gate on free,
  diff verdicts (live 1 / deleted 1 / unknown 1) + only-deleted filter
  + non-post skip, diff free-tier block, evidence free-blocked /
  Studio ZIP download (PK header, manifest files inside), citations
  disclaimer + contents + .md/.csv downloads.
- `scripts/sync_brands.py --check` + `scripts/sync_pricing.py --check`
  — clean. CI now runs every node suite (`.github/workflows/ci.yml`
  was missing modes / evidence-usage / analytics / console-timeout /
  live-check / osint-tools / live-check Function — all added).

## Still CLI-only (and why)

- **Text fetch / replay text** (`archive --fetch-text`, keyword
  search over fetched text): the browser pack's CSV/JSON carry the
  archived URLs and verdicts, but no recovered post text — fetching
  replay text in-browser means fetching archived HTML through the
  proxy and parsing it client-side, which is a bigger build (and a
  bigger rate-limit surface on archive.org). CLI only for now.
- **Batch watchlists / scheduled re-runs**: no background jobs on a
  static Pages site; the web batch is one-shot. A watchlist needs
  the Paddle go-live + D1 job store first.
- **Arquivo.pt / Common Crawl / Ghostarchive as web sources**: the
  web console searches Wayback CDX only (via `/api/cdx`). The CLI
  already queries the other archives; wiring them into the web
  console is a separate track (new proxy endpoints + tier rules).
- **Server-side evidence counting**: the web gate is local-first
  (issue #15); the D1 endpoint lands with the Paddle go-live.
- **Live check on the deployed site**: the Function ships with the
  batched push; end-to-end live proof (`POST /api/live-check` on
  app.deletedproof.northforgelabs.dev) is still to run after the
  deploy — local-only verification never closes an issue.
