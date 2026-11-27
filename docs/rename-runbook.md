# Rename runbook — wayback-social → ArchiveCheck (issue #1)

Status: **PREP ONLY — do not rename anything until John locks the
umbrella name.** The name ArchiveCheck is the naming-v2 recommendation
(docs/naming-v2.md, 22/25) and the subdomain brands are approved, but
the umbrella name itself is NOT formally locked — John approved the
subdomain brands and wiring, not the repo/PyPI/Pages rename.

## Dry-run (what the rename touches)

`scripts/rename-dry-run.py` (read-only, stdlib only, deterministic —
two runs produce identical output, tree checksums unchanged). Last run
2026-11-27 ~02:45 UTC. **Counts move while parallel tracks land —
re-run at rename time for the fresh baseline; the table below is the
latest snapshot, not a frozen count.**

| String | Hits | What it is |
|---|---|---|
| `wayback-social` | 277 | GitHub repo, PyPI name, CLI script, docs, guide URL slugs |
| `wayback_social` | 116 | Python package dir, imports, pyproject entry point, docs |
| `deletedproof` | 262 | Pages project, `*.pages.dev` host, sitemap/robots, wrangler.toml |
| `ClumsySmurf1337/wayback-social` | 8 | README, docs, wrangler.toml comment, CI |
| `WAYBACK_SOCIAL_CONFIG` / `WAYBACK_LICENCE` | 26 | web/config.js, web/licence.js, every page script |
| `WAYBACK_SOCIAL_LICENCE_SECRET` | 12 | CLI `licence make`, docs, Pages secrets list |
| `DP1` / `DP2` | 285 | Licence-key prefixes (DP = DeletedProof) — see §3 |
| `wayback-social-licences` | 29 | D1 database name, docs, migration commands |
| `DeletedProof` | 87 | **KEEPS its name** — the app. subdomain brand. Listed so a blind sed doesn't destroy it |
| `archivecheck.com` | 177 | Already the target in canonicals — the rename makes them true instead of aspirational |

Biggest single files: README.md (42× `wayback-social`), functions/_lib/verify-key.js (19× DP1/DP2), wrangler.toml (9× deletedproof), web/sitemap.xml (13× deletedproof).

## Ordered steps (once John locks the name)

### 0. Decide first — the canonical decision and the rename are the same gate
The rename only makes sense with option (a) of docs/canonical-decision.md:
buy `archivecheck.com` (+ `.app` / `.io`). Re-check availability at
purchase (last check 2026-11-26 ~21:54 UTC: `.com` looks available,
Verisign 404 — re-confirm, never present as still free). If John picks
option (b) instead (retarget canonicals to northforgelabs.dev), the
rename waits: renaming the repo while the canonicals point at a domain
he doesn't own would repeat the mismatch. Order: **domain purchase →
rename**, never the reverse.

### 1. Reserve the names (human steps, in this order)
1. Buy `archivecheck.com` (+ `.app` / `.io` if wanted). Cloudflare
   Registrar is at-cost, no markup.
2. GitHub org `archivecheck` (free — re-checked 2026-11-26, see
   docs/naming-v2.md §"availability"). Create the org, then transfer
   the repo into it (or rename in place — see open decision 5).
3. PyPI name `archivecheck` (free — 404 re-checked 2026-11-26).
   Reserve by publishing the first release under the new name.
4. Social handles: X `@ArchiveCheck` (looks free), YouTube
   `@ArchiveCheck` (looks free), Instagram `@archivecheck` is taken —
   use `@archivecheckapp`; TikTok inconclusive (returns 200 for
   missing profiles — verify in-app). See docs/naming-v2.md.
5. USPTO clearance (tmsearch.uspto.gov) + EUIPO + counsel on
   Internet Archive terms (commercial CDX use is in tension with IA's
   2014 noncommercial terms) — before launch, not after.

### 2. Answer the open decisions (John) — four open, one closed
1. **Licence prefix:** keep `DP1`/`DP2` or move to `AC1`/`AC2`?
   See §3 — this is the only decision with live-key consequences.
2. **Python import name:** keep `wayback_social` (import name ≠ PyPI
   name is legal and common) or rename the package dir to
   `archivecheck` (110 hits, touches every import + the CLI entry
   point + all tests)?
3. **Pages project:** rename `deletedproof` → `archivecheck`
   (changes `deletedproof.pages.dev` → `archivecheck.pages.dev`;
   custom domains unaffected) or keep the project name?
4. **Guide URL slugs — CLOSED during the 2026-11-27 audit:** Track G
   already renamed them to `archivecheck-vs-*` (on-page titles said
   "ArchiveCheck vs …" from the start). No redirects needed — the
   guides have never been live, so the old slugs were never served.
5. **GitHub org:** new org `archivecheck` (transfer = new clone URLs
   everywhere, incl. the Pages source binding) or rename the repo in
   place under `ClumsySmurf1337`?

### 3. Licence keys — the one dangerous part
`DP1`/`DP2` appear 263 times (code, tests, docs). The prefix is part
of the key format (`DP1-<TIER>-<16 base32>-<8-char HMAC>` /
`DP2-<TIER>-<16 base32>-<86 base64url sig>`), and keys are already
issued — including John's admin Studio key
(`DP1-STUDIO-372HNQ5XFCL23X5T-1817d678`, demo secret) and any demo
keys users hold. Rules:
- **Never break an issued key.** If the prefix changes, the verifiers
  (Python `licence.py`/`licence2.py`, JS `web/licence.js`,
  `functions/_lib/verify-key.js`, `functions/_lib/dp2.js`) must accept
  BOTH prefixes for at least one release cycle, and the Paddle
  webhook must mint the new prefix only. Old-prefix keys keep
  verifying until their owners replace them.
- If John keeps `DP1`/`DP2` (simplest, recommended unless branding
  demands otherwise): the prefix stays, and the rename touches only
  comments/docs that explain what DP stands for.
- The D1 `licences` table stores key hashes only — a prefix change
  does not invalidate stored rows, but the `key_hash` is computed over
  the full key string, so a re-issued key is a new row either way.

### 4. Apply the rename (builder, one batch, full validation)
1. Re-run `scripts/rename-dry-run.py` and diff against the 2026-11-27
   baseline above — any new hits since then are new code to include.
2. Rename in this order (each step verified before the next):
   a. GitHub repo/org + Pages source binding (update the Pages
      project's connected repo, or the deploy breaks).
   b. `pyproject.toml` (name, entry point), package dir (only if
      decision 2 says so), README, CHANGELOG.
   c. `wrangler.toml` (project name only if decision 3 says so,
      D1 database name, repo comment), `web/config.js` (JS globals
      — rename `WAYBACK_SOCIAL_CONFIG`/`WAYBACK_LICENCE` together
      with every reader, or the page breaks), `WAYBACK_SOCIAL_LICENCE_SECRET`
      → new env name (and the Pages secret itself — old name deleted
      after the new one is set).
   d. `web/brands.json` canonicals stay `archivecheck.com` (already
      correct); `web/sitemap.xml` + `web/robots.txt` host →
      `archivecheck.com`. (Guide slugs are already `archivecheck-vs-*`.)
   e. Docs sweep (docs/, TEST-REPORT.md, docs/issues.md) — keep the
      history docs (naming-v2, subdomain-branding) as the record;
      update only live references.
3. Full validation: pytest, all node suites, `sync_brands.py --check`,
   `sync_pricing.py --check`, SEO check, Playwright E2E (local), then
   the batched push + the full live validation (all 6 domains, live
   free search, CDX proxy end-to-end, per-subdomain titles).
4. **Do NOT rename the subdomain brands.** DeletedProof,
   HandleHistory, PostTrace, PastProof stay. Do NOT rename the
   `wayback_social` CLI in user-facing web copy (it never appears
   there anyway — CLI is internal only).

### 5. Verify live after (before calling it done)
- All 5 subdomain hosts + apex serve the right brand title (curl,
  docs/ssr-branding.md §4) and the right canonical
  (`archivecheck.com` hosts).
- Old `deletedproof.pages.dev` URLs redirect or still serve (Pages
  project rename changes the `.pages.dev` host — confirm the old one
  404s cleanly and nothing links to it).
- Licence verification: an old DP1 demo key still verifies on the
  site and in the CLI; a newly minted key verifies everywhere.
- Paddle webhook still mints + emails (sandbox $1 purchase).
- SEO check 12/12 on the new canonical host; sitemap submitted to
  Search Console + Bing under the new domain.
- PyPI `pip install archivecheck` works; `archivecheck --help` works.

## What stays OUT of the rename
- `web/brands.json` brand names (DeletedProof etc.).
- History docs (naming-v2, subdomain-branding, this runbook's record
  of the old names).
- `ops/memgator/` binaries, tunnel-token, `*.log`, `*.pid` — never
  committed, never renamed.
- The MemGator tunnel name (`memgator.northforgelabs.dev`) — infra,
  not product.
