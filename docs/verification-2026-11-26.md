# Full live verification pass — 2026-11-26 (evening)

**Scope:** domains, dynamic branding resolution, all feature tests,
user-account/email/recovery audit, billing state. Run against the
on-disk state (v1.5.0, unpushed) AND the live deploy. The two differ
— see §1. Every number below was produced by a command or a real
Chromium run in this pass, not copied from an earlier report.

## 1. Domains — all 6 up (live deploy)

Method: DNS via Cloudflare DoH (the VM resolver is a sinkhole), then
`curl --resolve` with the real IPs. Pages domain status also checked
via the Cloudflare API (all 5 custom domains: `active`).

| URL | HTTP | Title | Notes |
|---|---|---|---|
| https://deletedproof.pages.dev | 200 | wayback-social — Find deleted tweets & posts in the Wayback Machine | 18,581 bytes |
| https://deletedproof.northforgelabs.dev | 200 | same | apex |
| https://app.deletedproof.northforgelabs.dev | 200 | same | |
| https://verify.deletedproof.northforgelabs.dev | 200 | same | |
| https://osint.deletedproof.northforgelabs.dev | 200 | same | |
| https://legal.deletedproof.northforgelabs.dev | 200 | same | |

**Caveat — the live deploy is STALE.** The deployed HTML (18,581
bytes) contains no `branding.js` and still contains the CLI command
box (2× "wayback-social archive"). `/branding.js` and `/api/cdx` on
the live host return the SPA fallback HTML, not the files. The local
tree has the new build (branding wired, CLI box removed, CDX proxy,
all-network search); it has not been pushed to GitHub yet, and Pages
auto-deploys only on push. **Unblocker: the GitHub push (parent's
job), then re-check these URLs.** Issue #7 (app. domain pending) is
already closed — all domains active.

## 2. Dynamic branding resolution — PASS (local build, real Chromium)

`node web/branding.test.js` re-run: **121/121 pass** (all 5 test +
5 production hosts, fallbacks, fake-DOM swaps).

Real-Chromium check (Playwright, route interception serving local
web/ files, page URL kept as each subdomain — `/tmp/brand-check.py`):

| Host | Title / h1 | Accent | Default preset | Footer limits line |
|---|---|---|---|---|
| deletedproof.northforgelabs.dev (apex) | ArchiveCheck — Find deleted posts & check any profile in the archive / ArchiveCheck | #1F9D63 green | none | yes |
| app. | DeletedProof — the ArchiveCheck console / DeletedProof | #E8A13D amber | none | yes |
| verify. | HandleHistory — Is this a catfish? / HandleHistory | #E85D75 rose | catfish (pre-selected, aria-pressed) | yes |
| osint. | PostTrace — OSINT archive search / PostTrace | #3E7CB1 steel blue | journalist (pre-selected) | yes |
| legal. | PastProof — Archived social media evidence / PastProof | #C9A227 gold | legal (pre-selected) | yes |
| deletedproof.pages.dev | ArchiveCheck (apex fallback) | #1F9D63 | none | yes |

Taglines and hero lines also swap per host (verified in the same
run). **Branding is resolved correctly in the browser — but only in
the local build.** It is not live until the push (§1). The wiring
agent (9d91e475) was still editing web files at 20:03 (modes.js);
this pass did not edit any web file.

## 3. Feature tests — all green

| Suite | Result |
|---|---|
| pytest (unit, `.venv/bin/python -m pytest -q`) | **109 passed, 1 skipped** |
| Node branding (`node web/branding.test.js`) | **121/121 pass** |
| SEO (`scripts/seo_check.py` vs local server) | **12/12 pass** |
| Playwright E2E (`tests/e2e`, local server) | **36 passed** (was 31 — 5 new branding/modes tests) |

CLI smoke tests (live data, `/tmp/wbs-verify/`, throwaway secret
`verify-throwaway-20261126`):

| Command | Result |
|---|---|
| `archive x jack --limit 3 --plan pro --format all` | PASS — 6 rows, all formats agree |
| `find clumsysmurf --networks x --plan pro` | PASS — found 1/1 networks |
| `batch` (1 target) | PASS — 198 captures, summary written |
| `diff --url <mastodon post> --limit 5` | PASS — 1 post, verdict **live 1, deleted 0** |
| `arquivo jack --limit 3` | PASS — 3 results (CDX mode) |
| `licence make --tier pro --email verify@example.test` | PASS — minted `DP1-PRO-M3J6S5OLV2XAGIXG-9219cedd` |
| `licence check <key>` | PASS — "Valid licence key — tier: pro" |
| `archive --licence <key>` | PASS — Pro caps applied from the key |
| `evidence <export.json> --plan studio` | PASS — pack 7 files, `sha256sum -c manifest.sha256` **all OK** |

Corrections to my own first attempts (not product bugs):
`diff` has no `--live-check` flag — live checking is built into
`diff` itself. `licence make` requires `--email`. `evidence` takes
`--out`, not `--out-dir`. `archive` without `--format all` saves
CSV only by default.

## 4. User creation / email / recovery audit

Full findings in docs/gaps-user-accounts-email.md. Short version:

- **User creation: does not exist.** No signup/login/password field
  anywhere in web/ (grep + Chromium check). By design — v1 is
  licence-key only. Issue #6 (Clerk Phase 2).
- **Email sent: none, anywhere.** No Resend/SMTP/webhook code;
  `functions/` holds only `api/cdx.js`. The only email touchpoint
  is `mailto:sales@example.com` (placeholder) in config.js.
  Issue #4.
- **Recovery: no passwords to recover** (consequence of no
  accounts). Licence-key loss has no recovery path today — Issue #4's
  D1 store is the unblocker.
- **What works:** the "My licence" panel (already built in
  index.html `#licence` + dashboard.html — no duplicate
  `web/licence-panel.js` was created). Chromium test with a
  demo-minted Pro key: verify → badge flips to Pro Pack (2,500
  captures/search, 14 networks, all exports), persists in
  localStorage across reload, Remove clears it, bad key rejected
  with a clear checksum message. No signup/password fields present.

## 5. Billing state

- `web/config.js` still has all ten `REPLACE_*` placeholders
  (5 Paddle + 5 Stripe). **No real checkout link exists; no money
  can move.**
- Pro Buy button clicked in Chromium: dialog opens —
  **"Checkout not connected yet — Pro Pack ($19 one-time) via
  Paddle — the checkout link isn't connected yet. The seller
  replaces the REPLACE_* link in web/config.js, then this button
  goes straight to secure checkout."** No dead links, no void
  payments. Free tier button correctly says "you're already in".
- Human steps (Issue #3): Paddle account
  https://www.paddle.com/ (vendors: https://vendors.paddle.com/,
  sandbox: https://sandbox-vendors.paddle.com/), one product per
  pack, paste the five links into config.js. Stripe alternative:
  https://dashboard.stripe.com/ → Payment Links. Then Issue #4
  (webhook → key → D1 → Resend, resend.com) to close the email gap.

## 6. CDX proxy (Issue #17) — code-tested, not live yet

`functions/api/cdx.js` tested in Node with a stubbed fetch:
missing `?url=` → 400; normal call → 200 with
`Access-Control-Allow-Origin: *` and `cache-control: public,
max-age=300`; allowlisted params forwarded, unlisted params
(`evil=1`) dropped. **Not live** — the deployed site has no
`/api/cdx` yet (returns SPA fallback HTML); it goes live with the
push (§1). Wrangler is not installed, so no local Pages Functions
runtime test was possible.

## 7. Top 5 gaps (what unblocks each)

1. **Live deploy is stale** (no branding, CLI box still live, no
   proxy, no all-network search on the real URLs) — unblocked by
   the GitHub push + auto-deploy. Re-verify §1/§2 live after.
2. **No checkout, no email, no licence delivery** (Issues #3 + #4)
   — unblocked by John's Paddle account (~30 min) + Resend + D1.
   This is the only gap that stops the first sale.
3. **Lost licence key = lost purchase** (Issue #4) — same build as
   gap 2 (D1 store + "resend my key").
4. **No accounts / no cloud packs / no cross-device usage**
   (Issues #5, #6, #15) — Phase 2 by decision; Clerk + R2 when
   paid users ask.
5. **`sales@example.com` placeholder** (config.js email provider)
   — one-line human fix: John's real sales address before the
   email provider is enabled.
