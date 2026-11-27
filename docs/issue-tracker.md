# Issue tracker — all GitHub issues, live state

Last reconciled: **2026-11-27 ~10:54 EST (15:54 UTC)** against the live GitHub list
(30 open, 1 closed) and the local tree — Track S round. New since 10:35 EST:
**Track N COMPLETE** (live Stripe products/links/portal config, all HTTP 200);
9 new issues filed via the connector (#23–#31); deploy flow LOCKED (develop →
preview, main → production, PR merge); `develop` branch created (942f6b0);
clumsysmurf34 invite sent (pending John's acceptance); Muse-email member plan
tried-and-blocked (closed). Source of truth for statuses: `docs/issues.md` (detail per
issue), `docs/push-readiness.md` (§1–§4), `TEST-REPORT.md` (per-track proof).
This file is the summary — update it every round; do not let it drift from
`docs/issues.md`.

## Priority order — what goes first (Track S, 2026-11-27)

Bar (John): keep building till prod-ready — the full setup test green on
the deployed prod build with zero errors. Sequence: issues → features →
verification.

**Deploy sequence (every push, docs/deploy-prep.md §6):** push to develop
→ preview deploy + regression (§4 live validation + auth E2E slice +
runtime-config check) → PR merge develop → main → production deploy +
regression → update the known-good line in deploy-prep.md §6.
Known-good right now: b522080d (production, main, 942f6b0, success,
2026-11-26 19:27 UTC). If a post-deploy check fails: roll back via the
API (POST /accounts/9ea150e75aa3812cbaea8ae80bfe2f8d/pages/projects/deletedproof/deployments/<known-good-id>/rollback),
verify the site serves the known-good build on all 6 domains, report the
same turn. Deploy-flow end-to-end verification (push → preview; merge →
production) is PENDING the batched push.

1. **#11 GitHub App install (John click)** — unblocks connector pushes;
   until then pushes go via browser web-upload. The batched push carries
   everything DONE-LOCAL.
2. **#23 Stripe webhook (build)** — top live risk: live buyers pay, get
   no key. Waits on #27 + #4 secrets + the batched push. Prove with a
   sandbox purchase first; no live payments at volume until proven.
3. **#27 Licence private-key storage route (John decision)** — connector
   set vs Drive + Mac wrangler. Unblocks #4's secret step, the $1
   sandbox tests, and #23. NOTE: the PUBLIC key
   (LICENCE_ED25519_PUBLIC_KEY) was **SET 2026-11-27 ~10:52 EST by the
   parent** (batched PATCH, both envs, verified by read-back);
   CLERK_SECRET_KEY survived the PATCH intact — the API retains secret
   values sent back type-only.
4. **#28 Stripe sales-tax decision (John)** — gates live payments at
   volume; links already live with no tax.
5. **#29 sales@example.com real address (John)** — one-line fix, rides
   the next push (develop first).
6. **#30 clumsysmurf34 invite acceptance (John)** — open the invite,
   accept, set a password. Dashboard-access fallback; also unblocks Web
   Analytics (or connector re-auth with account-settings.write scope —
   API creation of the RUM site is 403, not possible). Muse-email plan
   tried-and-blocked (closed) — do not retry, do not invite anyone.
7. **#3 Paddle links + $1 sandbox test (John)** — Paddle account /
   products / secrets. Waits on #27.
8. **#31 MemGator timer after second reboot** — reinstall approvals
   timed out twice; reinstall units (sudo, session with fresh proxy
   creds), verify public URL stays 200. Independent of the push.
9. **#24 / #25 / #26 Track R B1/B2/N1 (Track R owns the fix)** — code
   fixes for the next push; B1 needs a policy call (gate CLI diff vs
   declare it free); #25 unblocks dev-server verification of
   licence-check / packs-upload.
10. **#6 Clerk close-out** — Turnstile keys (John to supply), migration
    0002 (approval tap), test users + live email-code flow (waits on
    deploy live; create in the Dashboard or via John's Gmail + aliases),
    production instance (John).
11. **#5 R2 secrets + lifecycle + live upload test (John)** — waits on
    the push.
12. **#15 migrations 0003/0004 (approval taps) + live checks** — waits
    on the push.
13. **#1 / #2 rename + name lock (John decisions)** — deferred by the
    canonical decision (b); blocks nothing launch-critical.
14. **#10 / #14 SEO human steps** — Search Console, Bing, Web Analytics
    (see #30); wait on John's sign-in.
15. **#33 Customer dashboard + billing management (NEW, filed
    2026-11-27)** — licence tied to the Clerk account, account-first
    dashboard, billing portal live, zero-paste linking after purchase.
    **Clarified 2026-11-27: the key is hidden from the website
    dashboard entirely** (receipt for a one-time purchase + the CLI
    credential only). **Open decision for John: one-time packs vs
    Stripe subscriptions** (pricing-model change — not decided here).
    Next-round build after the push lands; depends on #23, #4, #6, #3,
    #32. Licence model agreed: Clerk = identity only, D1 hash = record,
    raw key never stored (full-key re-display needs John's call on
    encrypted storage).

**Cloudflare setup state (Track S, 2026-11-27 — zero live calls made this
round; all values parent-verified cached):** deploy flow locked and
verified live; `develop` branch created; D1 (DB → wayback-social-licences)
+ R2 (PACKS) bindings on both envs; CLERK_SECRET_KEY set both envs;
CLERK_PUBLISHABLE_KEY in Preview only (no prod instance yet);
LICENCE_ED25519_PUBLIC_KEY set both envs 2026-11-27 ~10:52 EST (secret
survived the PATCH intact). Still open: RESEND_* / PADDLE_* /
STRIPE_SECRET_KEY / TURNSTILE_* — need John's values/decisions; RUM/Web
Analytics — 403, blocked on #30 or re-auth scope.
2 deployments exist: production `b522080d` (main, `942f6b0`, success) +
preview `6b1317d4` (develop, `942f6b0`, success, 2026-11-27 15:49 UTC) —
zero failed, nothing to delete. The develop→preview leg is proven live
(branch creation triggered the preview deploy; the URL serves 200).

Status legend: **DONE-LOCAL** = built + verified locally, needs the batched
push + live verification (push discipline: local-only never closes an issue).
**IN PROGRESS** = a track is actively working it. **BLOCKED-JOHN** = needs a
human step only John can do. **OPEN-REMAINING** = work left that no track
has closed yet.

## Closed

| # | Issue | State |
|---|---|---|
| 7 | app. cert stuck pending | **CLOSED** (all 5 custom domains ACTIVE) |

## Open — done locally, needs push + live verification

| # | Issue | Local state | Live check still needed |
|---|---|---|---|
| 9 | Trust & safety page + FCRA + honest limits | DONE-LOCAL (Track A) | trust.html live on all hosts |
| 12 | Split cli.py | DONE-LOCAL (Track A, 7 modules) | CI green on new HEAD |
| 13 | Subdomain routing + osint/legal web UI | DONE-LOCAL (Track A + Track E) | per-host preset + Batch/Diff/Citations live |
| 16 | Remove CLI box | DONE-LOCAL | no CLI text live |
| 17 | Live browser search fails / CORS | DONE-LOCAL (CDX proxy) | /api/cdx end-to-end live |
| 18 | All-network search in web console | DONE-LOCAL | broad search live |
| 19 | Dynamic per-subdomain branding | DONE-LOCAL | brand per host live |
| 20 | SSR per-subdomain titles + meta | DONE-LOCAL, verified (Track H matrix 6×2) | curl title loop, all 5 hosts + apex (docs/ssr-branding.md §4) |
| 21 | Live free search fails (juliawalterz) | DONE-LOCAL, verified (Track H exact case PASSED 02:25 UTC, 36.45s) | replay live on app. with same inputs |
| 22 | Copy says "Wayback" everywhere + CLI bleed | Audit DONE (0 hits); P1–P5 fixes DONE-LOCAL (Track J) + **independently verified: failure-paths 6/6, full E2E 109/109 (2026-11-27 ~03:43 UTC)** — the one failure was a test race (batch wait matched progress text), fixed by the verifier, product proven correct. P5 CLOSED by Track K (single-post-URL mode built, live probe real captures). Host-alias dedup DONE (Track K). Sources line now lists all 4 archives (Track L). **E2E update (Track M round): independent full run on the retargeted tree 131/132 — the 1 failure was a STALE TEST (sitemap host assertion predated the (b) retarget), fixed by Track M, re-run 1/1 green → effective 132/132.** | grep deployed pages incl. failure paths; P1–P5 fixes in deploy |

## Open — done locally, needs push + human follow-up

| # | Issue | Local state | Still needed (human / live) |
|---|---|---|---|
| 3 | Real Paddle links + sandbox test | Stripe TEST link verified 200; **Track N COMPLETE 2026-11-27** (live products/prices/Payment Links + live portal config in acct_1TqN1vGW6yc5Tf5G, REPLACE_STRIPE_* → live links, Stripe = live default, Paddle stays alternative; all 5 links HTTP 200; full record docs/stripe-vs-clerk.md §7, TEST-REPORT.md Track N). Paddle links still REPLACE_*. Stripe portal test side PROVEN (Track L 2026-11-27: test customer + real portal session in test mode; runbook docs/stripe-vs-clerk.md §5). | Remaining: live STRIPE_SECRET_KEY decision (endpoint refuses sk_live_... by design) + Stripe webhook (NEW #23 — live Stripe buyers get no key automatically) + sales-tax answer (NEW #28). John: Paddle account + products + webhook destination + secrets; then $1 sandbox purchase test. |
| 4 | Paddle webhook → Ed25519 → D1 → Resend | DONE-LOCAL (webhook 10/10, Resend wired, email never blocks purchase). **Key ROTATED 2026-11-27** (old private key lost in VM reboot; new pair proven Node-mint → Python-verify) | John: set Pages secrets LICENCE_ED25519_PRIVATE_KEY (new, at .licence-keygen.txt) + PUBLIC_KEY + PADDLE_* + RESEND_*; create Resend account + verified domain; $1 sandbox purchase test. |
| 5 | R2 buckets + presigned PUT + retention | DONE-LOCAL (packs-upload.js 14/14). Buckets **VERIFIED live 2026-11-27** (deletedproof-packs + -staging) | John: R2 S3 API token + R2_* Pages secrets; lifecycle rules (free 30d / paid 365d); live upload test after push. |
| 6 | Clerk login (Phase 2) | DONE-LOCAL (auth.js, link-licence.js, migrations/0002) + **Clerk app EXISTS: "Socialz" (app_3MhAJrLNopBlL17AH8OOXywPnPs, beloved-gazelle-4678.clerk.accounts.dev, Development only), verified 2026-11-27 10:19 EST. Test publishable key IS in web/config.js (enabled: true).** Email (code) + Google (shared creds) + Username + Password ON; Phone/Passkeys/MFA/Web3 OFF; 0 users. | **CLERK_SECRET_KEY SET 2026-11-27 ~10:42 EST** (Cloudflare API; verified live as secret_text in Production + Preview — Track P records the API set at 10:27 EST). **Turnstile DONE 2026-11-27 (Track R): widget "ArchiveCheck — deletedproof" created via API (invisible, site key 0x4AAAAAAGV8UGE-2rGL9e1L), TURNSTILE_SECRET_KEY + TURNSTILE_SITE_KEY set both envs (verified by independent read-back), config.js wired (site key + enabled: true).** Still to close: apply migration 0002, bot sign-up protection toggle, test accounts (docs/clerk-auth.md §6 step 8), production Clerk instance later. FLAG: app is named "Socialz", not "ArchiveCheck" — sign-in UI will show that name; rename in the Clerk Dashboard if the brand should match. |
| 8 | Archives: Common Crawl + MemGator + Ghostarchive + YouTube | Ghostarchive + Common Crawl DONE as web sources (Track L 2026-11-27: /api/ghostarchive 12/12 + web 38/38 + E2E 5/5, live probe jack/status/20 → 7 rows; /api/commoncrawl 15/15 + web 39/39 + E2E 5/5, live probe example.com → 50 rows, CC-MAIN-2026-47). Arquivo.pt web source DONE (Track I). **MemGator: DOWN 07:55 UTC (VM restart wiped /etc units) — RECOVERED 2026-11-27 10:26 EST by Track M (reinstall + stack restart, all five up, public URL 200, TimeMap 80 mementos for jack/status/20). Third recovery this window — the pattern is VM restarts wiping /etc; the 15-min healthcheck timer is back. Known weakness: timer-run relay restarts defer without proxy creds (see healthcheck.log 07:12–07:43).** **YouTube PARKED by John 2026-11-26 22:00 EST** (key stays valid) | Push + live checks (/api/ghostarchive, /api/commoncrawl, /api/arquivo, MemGator URL). MemGator tunnel-token rotation needs John's explicit call. |
| 10 | SEO: Search Console + Bing + Web Analytics + content | Content DONE-LOCAL (Track G: 10 guides + index, seo_check 12/12, guides E2E 24/24). First weekly SEO report done (next due 2026-12-03) | Web Analytics: dashboard browser task ERRORED/ended 2026-11-27 05:15 UTC with no token (sign-in card never completed) — needs a fresh browser task when John is ready to sign in. Search Console + Bing + Product Hunt/Show HN: human steps. |
| 14 | Weekly SEO/analytics report | First report DONE (docs/seo-report-2026-11-26.md) | Recurring: next due 2026-12-03; needs live analytics once Web Analytics is on. |
| 15 | Evidence-report usage counting | Local-first DONE (Track A) + server endpoint DONE (Track F) + dashboard wiring DONE (Track L 2026-11-27: dashboard-server.js, GET /api/evidence-usage with local fallback, node 26/26 + E2E 5/5) | Apply migration 0003 (needs John's approval tap); push + live check. |

## Open — filed by Track S (2026-11-27, live #23–#31) + Track R (#32) + dashboard (#33)

Filed via the connector `issue_write` (verified by a live `list_issues`
re-check: 30 open, 1 closed). Drafts + filing record:
`docs/track-s-new-issues.md`.

| # | Issue | State |
|---|---|---|
| 23 | Stripe webhook — live buyers pay, get no key | **BUILT LOCALLY 2026-11-27 (Track T)** — `functions/api/stripe-webhook.js` (286 lines) + `_lib/stripe-signature.js` + `_lib/stripe-tier.js` + shared `_lib/licence-email.js`; Node suite 13/13 + Python cross-check 2/2; migration 0005; docs/stripe-webhook.md. Needs #27 private key + `STRIPE_WEBHOOK_SECRET` (+ sandbox) + apply 0004/0005 + push + sandbox proof (docs/stripe-webhook.md §6). No live payments at volume until proven. |
| 24 | `--limit` help reword (Track R N1) | **FIXED by Track R 2026-11-27** — help text now "Max CDX results per URL pattern" (archive/diff/batch); verified live in the CLI (free `--limit 2` → 4 captures across the two X patterns, no cap bypass). Needs the push + live check to close. |
| 25 | Dev-server routes licence-check + packs-upload (Track R B2) | **FIXED by Track R 2026-11-27** — dev-server.mjs routes /api/licence-check + /api/packs-upload (callFunction helper, 296 lines) + /api/stripe-webhook (Track T follow-up; real header-forwarding bug found + fixed — Stripe-Signature now forwarded). Probed on port 8919: GET 405, no secret 503, bad sig 400, good sig → honest 500 no-D1. Needs the push to close. |
| 26 | CLI diff tier gate (Track R B1) | **FIXED by Track R 2026-11-27** — CLI diff now refuses free with "Deleted diff needs the Starter plan or higher" before any fetch (mirrors the web gate); local export comparison deliberately NOT gated. Tests 8/8 in tests/test_diff.py. Needs the push + live check to close. |
| 27 | Licence private-key storage route | BLOCKED-JOHN (connector set vs Drive + Mac wrangler). Unblocks #4, $1 sandbox tests, #23. |
| 28 | Stripe sales-tax decision | BLOCKED-JOHN. Gates live payments at volume. |
| 29 | sales@example.com real address | BLOCKED-JOHN. One-line fix; next push. |
| 30 | clumsysmurf34 invite acceptance | BLOCKED-JOHN — invite SENT ~10:45 EST, pending. Accept + set password; unblocks Web Analytics (or re-auth with account-settings.write scope). Muse-email plan tried-and-blocked (closed). |
| 31 | MemGator health-check timer after 2nd reboot | Reinstall approvals timed out twice. Reinstall units (sudo, fresh proxy creds); verify public URL 200. |
| 32 | Text-fetch credits ledger — top-up purchases are unfulfilled (manual only) | **FILED by Track R 2026-11-27** (issue #32). Track T's webhook deliberately ignores top-ups (no key, no row, no email); no credits ledger exists anywhere. Acceptance: top-up credits 500 text-fetch credits to the buyer's licence/account, balance visible on the dashboard, text-fetch draws it down; idempotent; refunds debit back. Depends on #23 + #4. Do not sell top-ups at volume until it lands. |
| 33 | Customer dashboard + billing management — licence tied to the Clerk account | **FILED 2026-11-27** (issue #33, John's ask 12:51 EST). Dashboard exists (tier/usage/paste-key/test-only billing portal/link-a-key) and the linked tier already auto-applies on sign-in AFTER the first link (GET /api/link-licence). Missing: zero-paste linking after purchase (checkout captures Clerk user id → webhooks write users.clerk_user_id at mint), account-first dashboard rework (key hidden from the website entirely — CLI credential only), billing LIVE (lift sk_live refusal, #3), Clerk metadata mirror (display only), stale Paddle copy fix. **Clarified 2026-11-27 (John 12:58 EST): the key is the receipt for a one-time purchase + the CLI credential — website customers never see or paste it.** **DECIDED 2026-11-27 13:24 EST (John): full subscription via Stripe is the main model, PLUS one-time packs as well (both offered).** Plan in #33 (comment) + docs/pricing-features.md §6: Starter $9/mo, Pro $19/mo, Studio $49/mo, annual 2 months free, Bundle one-time-only; portal flips sub cancel/plan-change ON; webhook gains sub events; migration 0006; lapse = tier to end of paid period, 7-day grace. **Open decision: one-time packs vs Stripe subscriptions — DECIDED (above).** Next-round build after the push lands. Depends on #23, #4, #6, #3, #32. |

## Open — blocked on John (no buildable work until he decides)

| # | Issue | What is ready | What John must do |
|---|---|---|---|
| 1 | Lock final name + rename everywhere | Rename dry-run DONE (scripts/rename-dry-run.py, read-only, verified; docs/rename-runbook.md). **Fresh counts 2026-11-27 ~10:30 EST (Track M): 247 files scanned, 181 with hits — wayback-social 298, wayback_social 144, deletedproof 418, ClumsySmurf1337/wayback-social 9, WAYBACK_* globals 40, env var 12, DP1/DP2 308, D1 34, DeletedProof 86 (KEEPS its name), canonical host 77 (already the target).** **Canonical decision MADE 2026-11-27 10:10 EST: option (b), retarget to deletedproof.northforgelabs.dev — no domain purchase needed first.** | Decide: licence prefix (DP1/DP2 vs AC1/AC2 — issued keys must keep verifying), Python import name, Pages project rename, GitHub org. |
| 2 | Buy production domain + GitHub org + PyPI + USPTO | **DEFERRED by the (b) decision, 2026-11-27: archivecheck.com NOT bought; the umbrella name is still NOT formally locked.** archivecheck.com appeared available (re-checked 2026-11-26 ~21:54 UTC; re-confirm at purchase). Naming v2 doc complete. | When John locks the umbrella name: buy archivecheck.com (+.app/.io); register GitHub org + reserve PyPI; USPTO/EUIPO clearance + counsel on IA terms. |
| 11 | Install Muse GitHub App on repo | Direct link known (github.com/apps/meta-muse-ai/installations/new) | Install the app (John sees no popup; needs his click). Until then pushes go via browser web-upload. |

## The gate that holds everything

**Canonical decision — DECIDED (b), 2026-11-27 10:10 EST (John, main chat).
Deploy authorized.** Canonicals retargeted to
deletedproof.northforgelabs.dev and applied 2026-11-27 (see
docs/canonical-decision.md, "Application notes"). archivecheck.com NOT
bought; umbrella name still NOT formally locked (issue #2, deferred).

**Stripe LIVE checkout — Track N COMPLETE 2026-11-27 (John, main chat).**
Live products/prices/Payment Links + live portal config in
acct_1TqN1vGW6yc5Tf5G, no real-money purchases, tax replicated from the
test recipe (none) and flagged to John (#28). Follow-ups: Stripe webhook
#23, live-secret decision, sales-tax answer #28. No domain purchase
without his explicit purchase go-ahead (unchanged).

**Deploy flow — LOCKED 2026-11-27 10:35 EST (John): develop → preview/dev
deploys ONLY; main → production; other branches → no deploys**
(preview_deployment_setting custom, includes [develop];
production_branch main; production_deployments_enabled true; source
github ClumsySmurf1337/wayback-social). The batch push goes to develop
first, then PR merge develop → main. `develop` branch CREATED
2026-11-27 (refs/heads/develop at 942f6b0). End-to-end flow verification
(push → preview deploy; merge → production deploy) is PENDING the
batched push. Known-good deployment: b522080d (production, main,
942f6b0, success, 2026-11-26 19:27 UTC) — rollback target per
docs/deploy-prep.md §6.
