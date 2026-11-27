# Deploy prep — batched push, ready to run

Status: **PREP — canonical (b) DECIDED 2026-11-27 10:10 EST, retarget
APPLIED locally. No push made yet.** The push is gated on final validation
of the final tree (Track R's fixes + Track S's sweep land first; re-verify
the file states before applying, and re-run the full local validation on
the final tree first).

## Deploy flow (John, 2026-11-27 10:35 EST — LOCKED, set live via API)

- **`develop` branch → preview/dev deploys ONLY.** All work lands on
  `develop` first; every push to it builds a preview.
- **`main` branch → production.** Merges to main are prod. The batch goes
  to `develop`, gets validated on the preview, then merges to `main` via
  pull request.
- **Other branches → no deploys at all.**
- Verified live via API 2026-11-27: `preview_deployment_setting` custom,
  `preview_branch_includes: ["develop"]`, `production_branch: main`,
  `production_deployments_enabled: true`, source GitHub
  `ClumsySmurf1337/wayback-social`, `deployments_enabled: true`.
- `develop` branch CREATED 2026-11-27 from main's HEAD `942f6b0`
  (refs/heads/develop). Before this, only `main` existed.
- **Flow PROVEN live 2026-11-27 ~10:49 EST:** creating `develop`
  triggered a preview deployment automatically — `6b1317d4`,
  preview, branch `develop`, commit `942f6b0`, stage `deploy`, status
  `success`, created 2026-11-27 15:49 UTC. `develop.deletedproof.pages.dev`
  serves HTTP 200, 18,581 bytes — byte-identical to production (same
  v1.3 build, no branding.js). The develop→preview leg works end to
  end; the new build arrives with the batched push to `develop`. The
  main→production leg is proven by the existing production deployment
  (`b522080d`, `942f6b0`, success); the merge leg is proven when the
  batch PR merges.
- Deployments list, verified 2026-11-27: exactly 2 deployments in total
  (the preview above + the production `b522080d`). No failed
  deployments exist — nothing to clean up.

## 1. Pre-push gate (run on the final tree)

- `pytest` green (baseline **148 passed** after Track P — confirm no new
  tests were added/removed by Tracks R/S).
- All node suites green (run every `*.test.js` / `*.test.mjs` — CI runs them
  all; the list is in `.github/workflows/ci.yml`).
- `scripts/sync_brands.py --check` + `scripts/sync_pricing.py --check` clean.
- `scripts/seo_check.py` against a local server: 12/12 homepage.
- `tests/e2e/test_guides.py` 24/24; `tests/e2e/test_failure_paths.py` 7/7
  (Track N — live Stripe checkout test); full E2E `tests/e2e/run_e2e.py`
  green — **132/132 effective on the retargeted tree** (isolated re-runs
  allowed only for proven-transient archive.org flakiness, both attempts
  recorded).
- CLI-bleed grep over `web/` = 0 hits (pipx / "command line" / "$ wayback" /
  install text), including guides.
- `web/console.js` line count — 478 (under the 500 hard cap, over the ~300
  ceiling — next edit must split it, not grow it). Confirm the final count
  before pushing.

## 2. Canonical pick — apply first, then push

### If John picks (a) — buy archivecheck.com

Human (John): re-check availability at purchase, buy archivecheck.com
(+ .app/.io if wanted), add the domain + 4 subdomains (app, verify, osint,
legal) as custom domains on Pages project `deletedproof` (CNAME →
`deletedproof.pages.dev`, proxied) — or the builder does it via the
Cloudflare API once the domain exists. **His pick in the main chat IS the
purchase go-ahead for archivecheck.com only.**

Builder steps after purchase:
1. `web/sitemap.xml` + `web/robots.txt` host → `https://archivecheck.com/`
   (canonicals stay exactly as they are — brands.json, index.html:15/:20,
   dashboard.html:9, and all 11 guide pages already point at archivecheck.com).
2. Re-run: seo_check, node branding tests, middleware tests, SSR E2E tests.
3. Live-check all 5 new hosts once DNS propagates.
4. Push ( §3 ) + full validation ( §4 ).

### If John picks (b) — retarget canonicals to deletedproof.northforgelabs.dev

No purchase. Apply in this order (verified against the files 2026-11-27):
1. `web/brands.json` — all five `canonical` values → apex
   `https://deletedproof.northforgelabs.dev/`, app
   `https://app.deletedproof.northforgelabs.dev/`, verify
   `https://verify.deletedproof.northforgelabs.dev/`, osint
   `https://osint.deletedproof.northforgelabs.dev/`, legal
   `https://legal.deletedproof.northforgelabs.dev/`.
2. `scripts/sync_brands.py` lines ~80-83 — production-host pattern
   `archivecheck.com` / `^([a-z]+)\.archivecheck\.com$` →
   `deletedproof.northforgelabs.dev` /
   `^([a-z]+)\.deletedproof\.northforgelabs\.dev$` + apex check. Never
   hand-edit the generated blocks.
3. Run `python scripts/sync_brands.py`, then `--check` (must be clean).
4. `functions/_middleware.js` lines ~85-86 — production-host check →
   northforgelabs.dev equivalents. Without this the retarget silently does
   not apply server-side.
5. Static apex values: `web/index.html:15` canonical + `:20` og:url →
   `https://deletedproof.northforgelabs.dev/`; `web/dashboard.html:9`
   canonical → `https://deletedproof.northforgelabs.dev/dashboard.html`.
6. **Guide pages (the canonical doc predates them — do not miss these):**
   all 11 files under `web/guides/` (`index.html` + 10 guide pages) —
   each has a canonical + og:url (+ JSON-LD url) pointing at
   archivecheck.com (4 mentions per file). Retarget every one to the
   matching `deletedproof.northforgelabs.dev/guides/<slug>/` URL.
7. `web/sitemap.xml` + `web/robots.txt` host →
   `https://deletedproof.northforgelabs.dev/`.
8. Re-run: `scripts/sync_brands.py --check`, node branding + middleware
   tests, `tests/test_brands_sync.py`, `tests/e2e/test_ssr_branding.py`,
   `scripts/seo_check.py`, guides E2E.
9. Push ( §3 ) + full validation ( §4 ).

Reversal: if John later buys archivecheck.com, reverse steps 1–7
(canonicals back, pattern back, sitemap/robots back) — same files.

## 3. The push — to `develop` first, then merge to `main` (flow §0)

The workspace is NOT a git repo; the browser-upload push does NOT honor
`.gitignore`. Upload folder by folder from `~/workspace/wayback-social/`,
one commit per folder, **targeting the `develop` branch**, in this order:
`wayback_social/` (Python package), `tests/`, `scripts/`, `functions/`,
`web/`, `migrations/`, `docs/`, `CHANGELOG.md`, `TEST-REPORT.md`,
`pricing.yaml`, `pyproject.toml`, `wrangler.toml`, `.github/`.
**Never push while any agent is editing the tree** (the v1.1 CI lesson: a
mid-edit upload shipped a missing module).

**Manually EXCLUDE on every upload:** `ops/memgator/memgator`,
`ops/memgator/cloudflared`, `ops/memgator/tunnel-token`, `*.log`, `*.pid`,
**`.licence-keygen.txt` (Ed25519 private key — NEVER push/commit)**,
`.venv/`, `.venv-e2e/`, `__pycache__/`.

After each folder commit, record the HEAD in
`~/workspace/wayback-social.muse-github-snapshot-sync.json`. After the last
commit, verify CI goes green on the new HEAD via the GitHub API (read-only
`list_workflow_runs` / check-runs); a red CI blocks the preview validation.
Then verify the **preview deploy** appeared for `develop` (Cloudflare
connector: list deployments — expect a new preview deployment on the
`develop` branch), and run the live validation adapted to the preview URL
(§4 with the preview host; the SSR per-subdomain title check does NOT
apply to the preview — no custom domains on it).

**Then merge to `main` for production:** open a pull request
`develop` → `main` (GitHub connector `create_pull_request`, or the web UI),
merge it, and verify the **production deploy** appeared on `main`
(§4 in full). A failed preview build means the tree is broken — fix
locally, re-upload the changed folder to `develop`, do NOT merge to main.

## 4. Post-push full validation (live — the push discipline)

Cloudflare deploys automatically: pushes to `develop` → preview,
merges to `main` → production. Run all of these; paste the outputs into
`docs/push-readiness.md` and the issue comments:

1. **All 6 domains up, new build:** `deletedproof.pages.dev`,
   `deletedproof.northforgelabs.dev`, `app.` / `verify.` / `osint.` /
   `legal.` — index.html must contain `branding.js`, the licence UI, and
   NO CLI box (the live site still serves stale v1.3 as of 2026-11-27).
2. **Per-subdomain SSR titles (#20):** curl loop in `docs/ssr-branding.md`
   §4 — title on all 5 hosts + apex; dashboard title on verify.
   (`Dashboard — HandleHistory`). Then `run_e2e.py --live -k ssr`.
3. **#21 live replay:** on app.deletedproof.northforgelabs.dev, signed out,
   free, juliawalterz on X, 20200101–20231231 — date picker present, real
   rows in range, no demo-as-result, no CLI text, progress + Pause/Stop/Resume.
4. **CDX proxy end-to-end live (#17):** a free search must hit `/api/cdx`
   on the deployed host (not a direct archive.org call from the browser).
5. **Arquivo web source (#8):** a live Arquivo search on app. with the
   source selector (Wayback / Arquivo / Both), rows labelled per source.
6. **/api/live-check end-to-end (#13):** a deleted-diff run on the deployed
   host returns live/deleted/unknown verdicts.
7. **Evidence pack live (#15):** download a Studio evidence-pack ZIP from
   the deployed site; verify `manifest.sha256` + report contents.
8. **SEO live:** `scripts/seo_check.py` against the live URLs — 12/12 on
   the apex + guides; sitemap lists all 11 guide URLs.
9. **Failure paths live (#22):** forced-failure search + blocked-tier
   dialogs on all 5 subdomains + apex — no CLI text anywhere; P1–P5 fixes
   present in the deploy.
10. **Full Playwright E2E against live** (`run_e2e.py --live`).

Only after §4 passes do the issues close — one comment per issue with the
live evidence (see docs/issue-tracker.md for which check closes which issue).

## 6. Rollback + regression on every deploy (John, 2026-11-27 10:37 EST)

**Known-good deployment (record before every push; this is the rollback
target):** production `b522080d` — `main`, commit `942f6b0`, stage
`deploy`, status `success`, created 2026-11-26 19:27 UTC. Preview
known-good: `6b1317d4` — `develop`, commit `942f6b0`, status `success`,
created 2026-11-27 15:49 UTC. After each successful production deploy,
update the production line to the new deployment id + commit; same for
preview after each successful preview deploy.

**Regression — before AND after every deploy:**
- Before the push: full local validation (§1) on the final tree — pytest,
  all node suites, sync checks, SEO 12/12, guides 24/24, failure-paths
  7/7, full E2E 132/132 (isolated re-runs only for proven-transient
  archive.org flakiness, both attempts recorded), CLI-bleed 0.
- After the push (preview, then production): §4 in full on the deployed
  host, plus the auth E2E slice (Clerk key enabled; signed-out search
  still works, auth UI does not error) and the runtime-config check
  (`GET /api/config` returns the right key per environment — a production
  host with no prod key set must NOT silently use the dev key).

**Rollback — if the post-deploy check fails:**
1. Do NOT leave the broken deploy live. Roll back via the Cloudflare
   connector (API route, no dashboard):
   `POST /accounts/9ea150e75aa3812cbaea8ae80bfe2f8d/pages/projects/deletedproof/deployments/<known-good-id>/rollback`
   (endpoint verified in the connector spec 2026-11-27).
2. Verify the rollback deployment appears and the site serves the
   known-good build again (index.html check on all 6 domains).
3. Report it to John the same turn: what failed, what was rolled back
   to, and what the fix is. The broken tree stays on `develop` until
   fixed and re-validated — never re-push it to `main`.

**Fewer approval prompts (John, 2026-11-27 10:37 EST — standing rule).**
Cut prompts wherever legitimately possible: prefer API/connector/CLI
routes over browser dashboard tasks (no sign-in cards — the Cloudflare
API route is the model); batch related changes into single pushes and
single validations so one prompt covers more work; use preapproval where
the system supports it for a recurring action; never ask John the same
decision twice — park open questions and keep building around them;
surface blockers in batches, not one by one. **Cloudflare batching
(John, 2026-11-27 ~10:52 EST — HARD RULE): batch every Cloudflare call
into a SINGLE exec invocation per round — one JS program doing multiple
API requests, or multiple CLI calls joined in one shell command = ONE
approval, not one per call. Never one exec per API call again (a roles
lookup alone cost 3 prompts). Minimize Cloudflare reads: prefer local
state / GitHub / cached values, and only call Cloudflare when the value
actually changes or needs live verification. Report per round how many
Cloudflare calls were made and how many prompts that cost.** The
durable fix is his one-time tap: "Always allow" on the next Cloudflare
card (the connector's `execute` action is not durably allowed — only
`account.read` is — which is why every Cloudflare call prompts); the
same applies to the GitHub connector's write actions. **Cannot be
removed:** payments, sign-ins only he can do, and destructive actions —
those still need him. Say plainly in reports which prompts remain
and why.

**Keep building till prod-ready (John, 2026-11-27 10:37 EST).** The bar
is the full setup test green on the deployed prod build with zero
errors. The pipeline keeps going: each side-chat round lands, the next
starts — issues, then features, then verification. Check GitHub
Discussions too for anything needing an answer (the connector has no
discussions tool — use the browser for that check). No invites to
anyone until John confirms the address in the main chat.

## 5. Branch-preview deploy — SUPERSEDED by the deploy flow (§0)

The old `preview/v1.6` branch idea (John, 2026-11-26 23:52 EST — "can
deploy from gh branch too") is replaced by the locked flow: **`develop`
IS the preview branch.** Every push to `develop` builds a preview at
`https://develop.deletedproof.pages.dev`; merges to `main` are production.
No separate preview branch, no DNS change, no canonical change — the
preview is not a production host.

**Known preview limits (by design, not bugs):** canonical + og:url point
at deletedproof.northforgelabs.dev (canonical option b, 2026-11-27 — the
preview is not the production host, but the values are the live ones now);
preview env vars are the Preview set (dev Clerk publishable key, no prod
key — production auth stays at the dev fallback until the prod Clerk
instance exists); Web Analytics is not wired yet (token outstanding —
the connector lacks the `account-settings.write` scope to create the RUM
site; the fix is the secondary-member dashboard login — **invite SENT
2026-11-27 ~10:45 EST to clumsysmurf34@gmail.com, Administrator, member
id 4a4fc78f7fa751726c86465dbae8cd6e, status pending; acceptance is John's
step** — or a connector re-authorization with that scope). None of these
block the free-search validation.
