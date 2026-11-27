# wayback-social — open task list (2026-11-26)

Built from a full review of the conversation. Items marked DONE are shipped
and verified; the rest are GitHub issues to track. Pricing is launch vs
regular (launch first 90 days or 500 buyers): Starter $9/$19, Pro $19/$29,
Studio $49/$99 (10 evidence reports, 5 seats — NOT unlimited), Bundle
$59/$147 (60% off $147), top-up $15/500 credits. Checkout: Paddle default,
Stripe alternative. Lemon Squeezy is DEAD — never use it.

## DONE (verified)
- CLI: 14 networks, archive/batch/find/presets, deleted-diff, live-check,
  replay text fetch, archive.today + Ghostarchive fallback links, capped
  free tier, licence keys (DP1- format), plans + pricing.yaml single source.
- Tests: 51/51 pass (v1.3), 30/30 (v1.2), 11/11 (v1.1). CI green on main.
- GitHub: repo ClumsySmurf1337/wayback-social, 18 commits (v1.1/v1.2/v1.3),
  pushed via web upload (connector push is 403 — Muse GitHub App not
  installed on the repo).
- Cloudflare: Pages project "deletedproof" (deletedproof.pages.dev LIVE),
  GitHub-linked auto-deploy, 5 custom domains on northforgelabs.dev
  (4 active, app. pending cert validation), CNAMEs created.
- Research docs: competition report, branding/seo plan, pricing-features,
  storage-auth plan, data-sources + Cloudflare, SEO plan + monitor.
- Name v1: DeletedProof (deletedproof.com/.app/.io + PyPI + GitHub free).

## IN PROGRESS (agents running, do not duplicate)
- Playwright E2E suite: live site, all tiers, licence keys, pricing,
  dashboard, SEO, mobile — **36/36 pass locally (2026-11-26)**,
  incl. 5 new branding/modes tests; live-site run still to do after
  the next deploy.
- Naming v2: **ArchiveCheck recommended** (docs/naming-v2.md) —
  umbrella name itself still NOT formally locked; subdomain brands
  APPROVED 2026-11-26 14:49 EST and wired (see DONE below).
- Browser check: northforgelabs.dev subdomains after DNS fix (Env 2)
  — **DONE, both load** (see DEPLOY VERIFIED in MEMORY.md).

## DONE (verified, added 2026-11-26)
- Subdomain brands WIRED: branding.js in index.html + dashboard.html,
  console extracted to web/console.js (252 lines), new web/modes.js
  (166 lines: presets, all-network grouped search, failure UI);
  index.html 150 lines, dashboard 151, branding.js 267 — all under
  the ~300-line ceiling. Node branding checks 121/121; per-hostname
  harness 9/9 hosts resolve right.
- Issue 16 DONE: no CLI command text anywhere on the web pages
  (failure notice, "Prefer the command line?" section, dashboard
  evidence button all reworded; unit + e2e tests enforce it).
- Issue 17 DONE in code, needs live deploy to prove: Pages Function
  functions/api/cdx.js proxies CDX server-side (tested live from
  Node: 200 + CORS *, 400 without ?url=, disallowed params dropped);
  the page uses /api/cdx on deployed hosts, direct CDX on localhost.
  Failure UI shows retry + direct CDX link + labelled verified sample
  — never fake rows as results.
- Issue 18 DONE: all-network search in the web console (modes.js
  searchBroad, tier caps from licence.js, grouped per-network results
  with up to 3 sample rows each, CSV/JSON export of the samples).
- Issue 19 DONE: dynamic per-subdomain branding (docs/subdomain-branding.md).
- Full test pass 2026-11-26: pytest 109 passed / 1 skipped,
  Playwright 36/36, seo_check 12/12, CLI smoke all pass — see
  TEST-REPORT.md "v1.5 + branding" section.

## OPEN ISSUES (create on GitHub)
1. [rename] Lock the final product name (naming v2) and rename everywhere
   — repo alias, PyPI name, Pages project, domains, config.js, pricing.yaml,
   README, SEO. Depends on naming-v2 recommendation + John's approval.
   Do NOT rename until approved.
   DRY-RUN PREP DONE 2026-11-27 (Track H): scripts/rename-dry-run.py
   (read-only, stdlib, deterministic — two runs identical, tree
   checksums unchanged) + docs/rename-runbook.md (ordered steps).
   Last dry run: 212 files scanned, 162 with hits — wayback-social
   262, wayback_social 110, deletedproof 251, DP1/DP2 263, WAYBACK_*
   globals 22, D1 name 28, DeletedProof 80 (KEEPS its name — the app.
   brand), archivecheck.com 164 (already the target). Open decisions
   (John): licence prefix keep DP1/DP2 vs AC1/AC2 (issued keys must
   keep verifying), Python import name, Pages project rename, guide
   slugs, GitHub org. CANONICAL UPDATE 2026-11-27 10:10 EST: John picked
   option (b) — retarget to deletedproof.northforgelabs.dev, then deploy.
   The rename NO LONGER waits on option (a) (domain purchase, now
   deferred); it waits only on the 4 open decisions above (guide slugs
   CLOSED 2026-11-27 — already `archivecheck-vs-*`). Fresh dry-run
   counts 2026-11-27 ~10:30 EST (Track M): 247 files scanned, 181 with
   hits — wayback-social 298, wayback_social 144, deletedproof 418,
   ClumsySmurf1337/wayback-social 9, WAYBACK_* globals 40, env var 12,
   DP1/DP2 308, D1 34, DeletedProof 86 (KEEPS its name), canonical host
   deletedproof.northforgelabs.dev 77 (already the target).
2. [domains] Buy the production domain (DeletedProof winner or naming-v2
   winner) + register GitHub org + reserve PyPI name + USPTO clearance
   check. Human steps; counsel on Internet Archive terms (commercial CDX
   use is in tension with IA's 2014 noncommercial terms).
3. [checkout] Connect real Paddle checkout links (replace REPLACE_* in
   web/config.js) + Paddle sandbox test purchase on
   app.deletedproof.northforgelabs.dev. Paddle is merchant of record;
   Stripe Payment Links stay as the swappable alternative.
   STRIPE TEST DONE 2026-11-26: connected account NORTHFORGE LABS LLC
   (test acct_1TqN24GnFHTsoY17 + live acct_1TqN1vGW6yc5Tf5G). Test-mode
   Pro Pack $19 one-time created + link verified HTTP 200:
   product prod_VhYLzeWSMvXfHh, price price_1Ug9EUGnFHTsoY17ooOxds3k,
   link plink_1Ug9EYGnFHTsoY17gPoPL62e
   (https://buy.stripe.com/test_7sYeVdev7e4PgT21SU9Ve00 — TEST ONLY).
   Live read-only: 6 Meterlane products, 0 payment links, 1 Meterlane
   customer, 0 portal configs — no ArchiveCheck objects exist in live.
   Stripe cannot replace Clerk (see docs/stripe-vs-clerk.md): Clerk =
   identity, Stripe = money + billing portal for self-service. Live
   Stripe links need John's go-ahead — GIVEN 2026-11-27 (main chat,
   "Use stripe for live checkout"). Track N COMPLETE 2026-11-27 (full
   record docs/stripe-vs-clerk.md §7; TEST-REPORT.md Track N): created
   the live products/prices/Payment Links (launch prices, no tax,
   automatic_tax off) + live portal config in acct_1TqN1vGW6yc5Tf5G,
   replacing REPLACE_STRIPE_* in web/config.js, Stripe as the live
   default (Paddle stays the alternative); all 5 links verified HTTP
   200. Still open: sales-tax answer (NEW GitHub issue #28 — Track N
   replicates the test recipe as-is — no tax — and flags it to John),
   Stripe webhook (GitHub issue #23 — **BUILT LOCALLY 2026-11-27,
   Track T**: `functions/api/stripe-webhook.js` + shared
   `functions/_lib/stripe-signature.js` + `stripe-tier.js` +
   `licence-email.js` (also extracted from the Paddle webhook —
   still 10/10); Node suite 13/13 + Python cross-check 2/2;
   migration 0005 adds the Stripe purchase columns; full record
   docs/stripe-webhook.md. Still open: Pages secrets
   `STRIPE_WEBHOOK_SECRET` (+ sandbox) + `LICENCE_ED25519_PRIVATE_KEY`
   (issue #27) + apply migrations 0004/0005 + the sandbox purchase
   proof in docs/stripe-webhook.md §6 — no live payments at volume
   until it is green), **text-fetch credits ledger (NEW GitHub
   issue #32, filed 2026-11-27 by Track R)**: the webhook
   deliberately ignores $15 top-up purchases (credits, not a
   licence — no key, no row, no email) and no ledger exists yet, so
   top-ups are manual only. Acceptance: top-up credits 500
   text-fetch credits to the buyer's licence/account, balance
   visible on the dashboard, text-fetch draws it down. Depends on
   #23 + #4. Dev-server route for the webhook added the same day
   (`scripts/dev-server.mjs` `/api/stripe-webhook`, 296 lines —
   incl. a `callFunction` headers-forwarding fix so
   `Stripe-Signature` reaches the Function; probes: GET 405,
   no secret 503, bad sig 400, good sig 500 "D1 binding DB not
   configured"). Live STRIPE_SECRET_KEY Pages
   secret (the endpoint refuses sk_live_... by design until that
   decision lands).
   PORTAL UPDATE 2026-11-27 (Track F): test-mode portal config
   CREATED LIVE via the Stripe connector —
   bpc_1UgEQNGnFHTsoY17wW8AIubt (sandbox acct_1TqN24GnFHTsoY17,
   active + default, return URL to the app dashboard, invoice
   history + payment methods + customer update on, subscription
   cancel off) + endpoint POST /api/billing-portal built locally
   (shared DP2/DP1 verifier, D1 stripe_customer_id lookup via
   migration 0004, honest 404 when no customer is linked, live
   secret keys refused outright) + node suite 13/13 (mocked Stripe
   fetch). Live now 1 config (bpc_1UgR15GW6yc5Tf5G5fREva6D, created by
   Track N 2026-11-27 — see docs/stripe-vs-clerk.md §7). Still to close: apply migration
   0004, link a test customer in D1, set STRIPE_SECRET_KEY (test)
   Pages secret, prove a real portal session end-to-end; then the
   live steps in docs/stripe-vs-clerk.md §5 (needs John's sales-tax
   answer + explicit go-ahead — do NOT do any live step yet).
   PORTAL TEST PREP 2026-11-27 (Track L, test mode only — no live
   objects, no migration applied, nothing written to D1): the
   Stripe side is PROVEN end-to-end — test customer
   cus_VhhPSdmcCj0fDo ("ArchiveCheck Portal Test",
   portal-test@example.com, test mode) + real portal session
   bps_1UgI0pGnFHTsoY176h14Q4L0 via the test config above (session
   URL is a secret, never printed; expires 5 min after creation if
   unused). Test DP2-STUDIO key minted from the rotated keypair
   (prefix DP2-STUDIO-34P6PXG62LKY6, sha256
   d07810523aae1be8df481dd013eac554e780e5a9323665dd48f47a114d4a046c;
   verified in Python AND Node) — test only, no D1 row yet;
   inserting the row is what activates it, deleting the row revokes
   it. Full runbook in docs/stripe-vs-clerk.md §5 (run in one go
   once John approves): push FIRST (live is still v1.3 — no
   /api/billing-portal exists live), apply migrations 0003+0004
   with --remote (WITHOUT it wrangler writes to a LOCAL D1, not
   the live DB), insert the test licence row + link the customer
   (exact INSERT + SELECT-verify commands in §5), set Pages
   secrets STRIPE_SECRET_KEY (TEST key only — the endpoint refuses
   sk_live_...) + LICENCE_ED25519_PUBLIC_KEY, prove via curl to
   the live endpoint or the dashboard's "Manage billing" button
   (failure map in §5). Dashboard wiring for the portal button is
   done (see #15, Track L). LICENCE_ED25519_PRIVATE_KEY (Paddle
   webhook) is still to set — separate step, same secret round.
4. [licences] Paddle webhook -> licence minting (Ed25519-signed key) ->
   D1 -> Resend email, via a Cloudflare Pages Function. Licence check in
   web + CLI exists for the offline HMAC scheme; production minting is
   the missing piece. Test with a $1 sandbox purchase.
   EMAIL UPDATE 2026-11-26: Resend picked as the free email provider
   (free-forever 3,000/mo, 100/day, no card — beats Mailgun, whose
   no-card free tier can only email 5 verified addresses; SendGrid,
   whose free plan expired after 60 days; and SES, which needs an AWS
   account + manual production access). Full comparison + human steps:
   docs/email-setup.md. Wired: webhook emails the key + tier + caps
   line + verify link + lost-key line; email NEVER blocks the purchase
   (missing RESEND_API_KEY or Resend 4xx/5xx → 200, email_sent:false,
   logged, licence row active — a retry cannot re-send the key since
   only its hash is stored; failed deliveries need a manual re-issue,
   procedure in docs/email-setup.md §5). Sandbox sender default is
   onboarding@resend.dev (owner's inbox only). Node suite 10/10,
   pytest 141/1. Still human: Resend account + Sending-access key +
   verified sender domain + RESEND_API_KEY/RESEND_FROM Pages secrets,
   then the $1 sandbox purchase test.
   KEY ROTATION 2026-11-27 ~02:05 UTC: the first DP2 private key was
   lost — single copy in /tmp/keygen.txt, wiped by the 2026-11-27 00:56
   UTC VM reboot. No licence was ever minted with the old pair (no
   Paddle account, secret never set), zero blast radius. New pair
   generated; public key rotated in licence2.py, web/licence.js,
   docs/paddle-webhook.md; Node-mint → Python-verify proven
   (DP2-STUDIO valid); pytest 146/1, webhook suite 10/10. New private
   key held at .licence-keygen.txt (chmod 600, gitignored, NEVER push)
   until set as Pages secret LICENCE_ED25519_PRIVATE_KEY (+ PUBLIC_KEY
   secret, new value in docs/paddle-webhook.md), then shred it.
5. [storage] Create R2 buckets deletedproof-packs / -staging, presigned
   PUT upload via Pages Function, retention lifecycle (free 30 days,
   paid 12 months, 30-day grace, immediate delete on request).
   DONE LOCALLY + BUCKETS LIVE 2026-11-27 01:09 UTC: functions/api/packs-upload.js
   (207 lines — DP2 licence verify, size/sha validation, SigV4 presigned
   PUT, 15-min expiry, content-addressed key packs/<free|paid>/<hash8>/<sha256>.zip,
   free → 30-day retention, paid → 365-day; fail-closed 503 without R2
   credentials) + functions/api/packs-upload.test.mjs 14/14 (signature
   verified against an independent SigV4 recomputation; tests caught +
   fixed two real bugs: non-string key/sha256 threw, path-traversal name
   not basenamed) + tests/test_packs_upload.py wrapper + CI runs the
   suite + [[r2_buckets]] PACKS binding in wrangler.toml. Buckets created
   via the Cloudflare API (both success:true, Standard class, WNAM).
   VERIFIED live 2026-11-27 ~02:05 UTC via the Cloudflare connector
   (R2 list): deletedproof-packs + deletedproof-packs-staging present.
   Standing rule applied: R2 Standard free tier only (10 GB-mo) —
   never Infrequent Access, never a paid plan, until paying customers
   (recorded in docs/data-sources.md + docs/storage-auth-plan.md).
   Still to close: R2 S3 API token + R2_* Pages secrets (human step,
   commands in docs/storage-auth-plan.md §1), lifecycle rules
   (packs/free/* → 30d, packs/paid/* → 365d, dashboard), push + live
   end-to-end upload test. Follow-up with the Paddle go-live (not this
   issue): POST /api/pack-confirm + D1 packs table (dashboard
   "expires on …" visibility; lifecycle rules enforce retention
   without it).
6. [auth] Phase 2 login: Clerk (50k users free) once paid users ask for
   cloud-saved packs. Escape hatch: Better Auth + D1. Do NOT build login
   before then — v1 is licence-key only.
   CLERK UPDATE 2026-11-27 (Track M): the code was already built locally
   (web/auth.js, auth-ui.js, turnstile.js, functions/api/link-licence.js,
   migrations/0002_users.sql — see docs/clerk-auth.md), and John has now
   supplied the app: Clerk app **Socialz** (app_3MhAJrLNopBlL17AH8OOXywPnPs,
   instance beloved-gazelle-4678.clerk.accounts.dev, **Development only —
   no production env**), verified 2026-11-27 10:19 EST. The test
   publishable key is IN web/config.js (CLERK.publishable_key,
   enabled: true). Sign-in: Email (code only) + Google (shared creds —
   consent screen every time) + Username + Password (min 15) all ON;
   Phone/Passkeys/MFA/Web3 OFF; 0 users; secret key now set as the Pages
   env var (never in the repo). **CLERK_SECRET_KEY SET
   2026-11-27 ~10:42 EST** (Cloudflare API; verified live as secret_text
   in Production + Preview — Track P records the API set at 10:27 EST).
   Still to close: apply migration 0002, Turnstile site/secret keys (config.js still
   REPLACE_TURNSTILE_SITE_KEY, enabled: false), bot sign-up protection
   toggle in the Clerk Dashboard, test accounts per docs/clerk-auth.md
   §6 step 8, production Clerk instance later. FLAG: the Clerk app is
   named "Socialz", not "ArchiveCheck" — the sign-in UI will show that
   name; rename the app in the Clerk Dashboard if the brand should
   match (30-second fix, John's call).
7. [dns] app.deletedproof.northforgelabs.dev stuck "pending" (cert
   validation HTTP pending, verification active). Re-check; if still
   pending, remove + re-add the custom domain in Pages.
8. [archives] Common Crawl async job + self-hosted MemGator + Ghostarchive
   result parsing + YouTube Data API key (free, 10k units/day — human
   step: Google Cloud key). See docs/data-sources.md for the per-source
   test plan.
   MemGator UPDATE 2026-11-26: instance LIVE locally (127.0.0.1:1208,
   patched 1.0-rc9, real TimeMaps), tunnel `memgator` + DNS
   `memgator.northforgelabs.dev` + ingress configured, `MEMGATOR_URL`
   now defaults to the public URL in `archives.py` (see
   docs/memgator-deploy.md for the full write-up, incl. the DoH bridge
   + edge relay needed by this VM's sinkhole DNS / blocked UDP / proxied
   egress). BLOCKED: public URL not up yet — egress proxy inconsistently
   refuses/hangs `CONNECT :7844` (verified 200 in some sessions, 000 /
   timeout in others); health check retries each run. Common Crawl async
   + Ghostarchive parse + YouTube key remain open.
   ARQUIVO WEB SOURCE UPDATE 2026-11-27 (Track I, DONE locally,
   unpushed): Arquivo.pt is now a web source, not CLI-only —
   `/api/arquivo` Pages Function (mirrors the CDX proxy: allowlisted
   params, 5-min cache, 120s timeout → honest 504, no key),
   source selector in the console (Wayback / Arquivo.pt / Both,
   default Wayback), same SearchJob machinery, merged + deduped
   rows with per-source labels and counts, one source failing
   leaves the other standing. Tier rules mirror the CLI exactly
   (CDX every plan, keyword Pro+ via `keyword_search` in
   licence.js PLAN_CAPS, drift-tested against plans.py).
   Verified locally: node Function suite 11/11, web/arquivo.test.js
   61/61, Playwright tests/e2e/test_arquivo.py 7/7, pytest green;
   live probes: CLI `arquivo jack --limit 5` → 5 results, dev-server
   `/api/arquivo` CDX + keyword both return real rows.
   TRACK K UPDATE 2026-11-27 (DONE locally, unpushed): (a) host-alias
   dedup — `web/url-alias.js` canonicalises hosts (x.com →
   twitter.com, www. stripped) before the merge key is built, so one
   capture stored under two hostnames renders once in Both mode
   (Wayback wins the tie); applied in console.js `addRow`,
   batch.js and diff.js, each falling back to the exact key if the
   module fails to load. Tests: `web/url-alias.test.js` 13/13 +
   `web/arquivo.test.js` Both + x.com / www blocks (36 checks
   total). Alias map documented in `docs/data-sources.md` §0.1.
   (b) Turnstile verify dedup — the identical server-side verifier
   is now one shared `functions/_lib/turnstile.js`, used by both
   `/api/cdx` and `/api/arquivo`; zero behaviour change (both
   proxies re-verified live via the dev server). Still open on this
   issue: Ghostarchive as a web source (HTML scrape — next
   follow-up), Common Crawl as a web source, MemGator public URL
   (another track), YouTube API key env var (human step — PARKED
   per John 2026-11-26 22:00 EST, do not retry).
   NOTE (Track K close-out, 2026-11-27): the two "still open" web
   sources above have since LANDED locally via Track L in the same
   window — Ghostarchive + Common Crawl are now in the console
   source selector (`both` = all four archives),
   `web/ghostarchive.js` + `web/commoncrawl.js` +
   `functions/api/ghostarchive.js` + `functions/api/commoncrawl.js`
   exist with passing suites (ghostarchive 38/38, commoncrawl
   39/39 web; endpoint 12/12 + 15/15) and both accept `urlPattern`.
   This #8 entry needs a refresh from Track L's report; the
   remaining opens here are MemGator public URL + the PARKED
   YouTube env var. Track K did not touch those files beyond
   noting the landing.
   TRACK L UPDATE 2026-11-27 (DONE locally, unpushed — full record
   in TEST-REPORT.md "Track L"): Ghostarchive + Common Crawl are
   web sources now, not CLI-only. `/api/ghostarchive` (235 lines)
   scrapes the results table server-side (RFC 1123 dates, unparsable
   → empty timestamp, never faked; 8th column = archive id) and
   `/api/commoncrawl` (262 lines) retries the flaky index with
   backoff (up to 3 attempts, 15s each; 404 → honest empty, never
   retried; all attempts fail → honest 504/502). Both are proxy-only
   (no CORS direct mode), allowlisted params, 5-min cache, no key.
   Console: source selector now has 5 options (Wayback / Arquivo.pt
   / Ghostarchive / Common Crawl / All archives); "All archives"
   merges + dedupes by exact (URL, timestamp) with per-row source
   labels, per-source counts and per-source failure lines; one source
   failing never kills the other. Per-handle listing: Ghostarchive
   X + Bluesky only (Instagram/Mastodon/TikTok redirect to video
   search — honest gate, same shape as Arquivo.pt's); Common Crawl
   all 14 networks. Honest-limits copy per source (uneven coverage,
   undated rows, CC slow/flaky + index-record links, no replay URL).
   The sources paragraph (index.html:104) now names all four
   in-console sources (Track J's P2 qualification is superseded).
   `web/console.js` grew past the 500 hard cap in the integration
   (579) — `renderRows` + `finishSearch` extracted to new
   `web/render-rows.js` (128 lines); console.js back to 478.
   BUG found by Track K's full E2E mid-window and FIXED by Track K:
   the extraction's global `sourceLabel(src)` collided with
   evidence-pack.js's global `sourceLabel(records)` (loads later,
   wins) — every render threw TypeError; renamed to
   `rowSourceLabel`. Verified: Function suites 12/12 + 15/15,
   web suites 38/38 + 39/39 (incl. "All archives" merge blocks),
   Playwright tests/e2e/test_ghostarchive.py 5/5 +
   test_commoncrawl.py 5/5 + test_arquivo.py 7/7 (the "both" tests
   in all three files now mock the other sources empty — "both"
   runs four sources, so an unmocked step hits the real archive
   and stalls the job), test_url_mode.py 7/7, full E2E 132/132
   (2026-11-27 ~06:44–06:51 UTC). Live probes via the dev-server
   proxy: Ghostarchive jack/status/20 → 7 rows in ~1s (2022-01-14..
   2024-04-14, ids pcuW3..afDG6); Common Crawl example.com → 50
   rows in 19.3s (retry fired, crawl CC-MAIN-2026-47).
   MEMGATOR PUBLIC URL — UP 2026-11-27 06:42 UTC + ROOT CAUSE
   FIXED: the stack was found down twice in this window (all five
   components dead after VM reboots wiped /etc, 05:34 and 06:40
   UTC) and recovered both times per docs/memgator-deploy.md
   (`install-systemd.sh` + `./stack.sh restart` from a session
   with fresh proxy creds). Root cause found this track: the
   15-min healthcheck could NEVER revive the tunnel — systemd's
   default KillMode=control-group SIGTERMs every process left in
   the oneshot service's cgroup when it exits, killing the
   just-started cloudflared ~3s after it registered (log pattern
   01:25–06:20 UTC). Fix: KillMode=process in
   ops/memgator/memgator-healthcheck.service (durable copy,
   reinstalled) — PROVEN live 06:26 UTC (timer-started cloudflared
   pid 35195 survived the service exit, public URL 200) and again
   post-restart (timer-started pid 3971 alive, public URL 200
   06:45 UTC). Full write-up in docs/memgator-deploy.md
   ("KillMode bug — FIXED"). Tunnel token NOT rotated (needs
   John's explicit call). Still to close on this issue: push +
   live check of both new sources, MemGator public URL on the
   deployed host (the web console's MemGator path is still
   product-only), PARKED YouTube env var (do not retry).
9. [trust] Trust & safety page on the site + FCRA disclaimer + honest
   limits box on every preset (public posts only, no monitoring, no face
   recognition, no verdicts, no minors).
   DONE LOCALLY 2026-11-26: web/trust.html (what it does / never does /
   FCRA "not a consumer report" / legal triage / local-first privacy /
   report-abuse route); honest-limits box (#preset-limits) under the
   presets on index.html, filled per preset by modes.js (preset ethics +
   universal limits; hiring adds the FCRA note); Trust links in a footer
   NAV on index + dashboard (the footer element itself is rewritten by
   branding.js/middleware, so links must live outside it); trust.html in
   sitemap.xml. Verified: Playwright 26/26 in real Chromium against the
   dev server (real middleware), modes.test.js 18/18 (+7 new),
   middleware 490/490 (+4 new regression checks). BUG FOUND + FIXED
   along the way: the test-only HTMLRewriter shim regex-matched a
   literal `<footer>` inside a CSS comment in <style> and ate the whole
   page body — shim now protects <style> blocks + HTML comments as raw
   text (functions/htmlrewriter-shim.mjs; production HTMLRewriter parses
   properly and was never affected). Trust page intentionally does NOT
   load branding.js (it would overwrite the policy title/h1 with the
   brand SEO title). Still to close: push + live check. NOTE: the
   report-abuse email on the page is sales@example.com (the config.js
   placeholder) — needs John's real address confirmation.
10. [seo] Submit to Google Search Console + Bing Webmaster Tools, enable
    Cloudflare Web Analytics, publish the first 10 content pieces from
    docs/seo-plan.md, launch on Product Hunt + Show HN the same week.
    CONTENT DONE LOCALLY 2026-11-27: all 10 pieces live as static pages
    under web/guides/ (find-deleted-tweets, find-deleted-instagram-posts,
    catfish-check-5-minutes, evidence-pack-for-lawyers,
    archivecheck-vs-waybacktweets, archivecheck-vs-social-catfish,
    changelog-v1-2-to-v1-5, what-the-archive-cant-tell-you,
    journalist-deleted-claim, brand-monitoring-deleted-posts) + a guides
    index, each with its own title (30-70), meta description (50-160),
    OG/Twitter, canonical, JSON-LD Article, honest-limits footer and
    "Last updated 27 November 2026". Pages are NOT run through the SSR
    middleware (like trust.html) — their static meta is what crawlers
    see. All 11 URLs added to web/sitemap.xml; Guides links added to the
    index + dashboard footers. Prices cited from pricing.yaml (launch
    AND regular); competitor prices from the Sep-Nov 2026 research
    report, labelled index/re-check at launch. Journalist case study is
    fictional and labelled illustrative. Guides describe the WEB console
    only — the seo-plan's "with the CLI" line was NOT followed (CLI is
    internal only); grep audit proves zero CLI text in web/guides/ and
    in all web HTML. scripts/seo_check.py extended for per-page checks
    (12/12 homepage + 110/110 guide checks); tests/e2e/test_guides.py
    24/24; pytest 145/1; branding 121/121; middleware 490/490.
    FULL-E2E CONFIRMATION 2026-11-27 ~03:00 UTC (after a runtime
    restart killed the first run): full suite 103/109 in 560.92s;
    guides 24/24 with zero failures; the 3 search-controls failures
    were transient (archive.org stall + dev server dying mid-run) and
    re-passed 3/3 in isolation; the 3 remaining failures are all
    test_failure_paths.py P1–P5 items (checkout locator = test fix,
    batch bad-line echo = batch.js product fix), owned by the P1–P5
    fix track. Re-verified on the final tree: pytest 146/1, all node
    suites exit 0 / 0 FAIL, seo_check 12/12 + 122/122, CLI audit zero
    hits across all of web/.
    Still to close: push + live check; Search Console + Bing submission,
    Cloudflare Web Analytics enablement (dashboard step — API route
    refused 405), Product Hunt + Show HN launch — all human steps.
11. [github] Install the Muse GitHub App on the wayback-social repo
    (https://github.com/apps/meta-muse-ai/installations/new) so the
    connector can push directly instead of the browser-upload workaround.
    John sees no install popup — use the direct link.
12. [code] Split wayback_social/cli.py (553 lines, over the ~300-line
    ceiling) into thin command modules. No behaviour change; tests must
    stay green.
    DONE LOCALLY 2026-11-26: wayback_social/commands/ (common, licence,
    archive, diff, find, batch, info) + cli.py now a 56-line dispatcher.
    Largest module 200 lines (archive). Test patch targets updated to the
    owning module (cli_mod -> commands.<module>). pytest 141 passed /
    1 skipped; all 13 commands' --help verified + networks/presets run.
    Also fixed a stale sibling assertion (test_paddle_webhook.py "pass 7"
    -> count-agnostic "fail 0"; the Node suite had grown to 10 with the
    email track's tests). Still to close: push + live check (local-only
    verification never closes an issue).
13. [subdomains] Hostname routing in JS: verify./osint./legal./app.
    subdomains must each open the right mode (verify = single-handle
    catfish flow, osint = batch/diff/evidence, legal = citations +
    triage disclaimer, app = full console). One codebase, one Paddle
    backend, licence cookie on the parent domain.
    ROUTING VERIFIED 2026-11-26 (local, real Chromium + dev server):
    29/29 checks — all 5 hosts resolve the right brand server-side
    (title/meta) and client-side (body[data-brand], hero, footer), the
    right preset auto-activates (verify→catfish, osint→journalist,
    legal→legal; apex/app force none), presets enable all-network
    search, the limits box shows the preset ethics, ?preset= deep links
    work, and the legal SSR footer carries "Triage, not court-ready".
    GAP CLOSED LOCALLY 2026-11-27 (web UI for the CLI-only modes —
    docs/osint-tools.md): #osint-tools section on index.html with
    Batch / Deleted diff / Citations tabs. Batch (NETWORK @handle
    lines, tier caps, grouped results, CSV/JSON); deleted diff (one
    handle, per-post live/deleted/unknown via new Pages Function
    POST /api/live-check, non-post captures skipped + counted,
    --only deleted filter; Starter+ only — free tier blocked, matching
    pricing.yaml features.deleted_diff); evidence-pack button
    (Studio-gated, client-side ZIP + SHA-256 manifest mirroring the
    CLI pack, local-first counting); citations (archived URL, Wayback
    timestamp, snapshot link, live verdict, retrieval date; text +
    .md/.csv; "Triage, not court-ready" on screen and in every
    download). Routing: osint. opens Batch, legal. opens Citations,
    app. opens Batch, apex/other collapsed. Proof: node live-check
    6/6 + 13/13, osint-tools 73/73, Playwright
    tests/e2e/test_osint_tools.py 13/13 (mocked CDX + live-check),
    pytest 144/1 unchanged. Two real bugs caught by the tests: a
    recordsFromRows dedupe that kept both captures of one URL, and
    evidence-usage.js missing from index.html (the Studio gate fell
    through to its fallback branch). Still to close: push + live
    check on the real subdomains (incl. /api/live-check end-to-end
    on the deployed host) + a live ZIP download check.
14. [analytics] Weekly SEO/analytics report: Search Console + Bing +
    Cloudflare Web Analytics + Paddle sales, in the format in
    docs/seo-monitor.md. Run scripts/seo_check.py weekly.
    DONE LOCALLY 2026-11-26 (first report): docs/seo-report-2026-11-26.md.
    seo_check re-run 2026-11-27 00:58 UTC: live 12/12 on all 6 domains
    (pages.dev + apex/app/verify/osint/legal.northforgelabs.dev) and
    local 12/12 on the current tree (dev server port 8931). Sitemap
    lastmod 2026-11-26 matches the last edit; trust.html in sitemap.
    Web Analytics wiring built (web/analytics.js, 10/10 tests, loaded on
    index/dashboard/trust) but NOT enabled — token empty, enabled false;
    the Cloudflare API route refused (GET rum/site_info → HTTP 405 for
    this auth scheme), so enabling it is a human dashboard step (Web
    Analytics → Add a site → paste token into web/config.js ANALYTICS).
    Search Console + Bing NOT connected (human steps); Paddle sales none
    yet (checkout links still placeholders). Honesty note in the report:
    live 12/12 is the stale v1.3 deploy — re-run after the batch push
    before closing anything as live-verified. Next report due 2026-12-03.
15. [evidence] Studio evidence-report usage counting: reports used vs
    the 10 included, shown on the dashboard; top-up flow for extra
    reports. Depends on issue 4 (licence store in D1).
    DONE LOCALLY 2026-11-26 (local-first half): web/evidence-usage.js —
    count namespaced per licence key (FNV-1a hash; bucket label, not
    security), legacy shared-key count migrated once, warn at 9/10,
    block at 10/10 (count never passes the cap), 0-included tiers
    blocked from the first log; dashboard shows used/included, warns at
    9, blocks the 11th with a top-up prompt linking to pricing (no
    purchase invented — extra-report checkout opens with the Paddle
    go-live). Verified: node evidence-usage.test.js 31/31; Playwright
    14/14 in real Chromium (log 1→10, warn at 9, block at 11, persist
    across reload, per-key isolation, free tier 0/0 blocked). Server-side
    counting against D1 remains the follow-up with the Paddle go-live.
    SERVER HALF BUILT LOCALLY 2026-11-27 (Track F):
    functions/api/evidence-usage.js — GET returns {used, included,
    remaining, tier, status, source: "server"|"local", verified} for a
    licence key (DP2 via _lib/dp2.js, DP1 via the shared verifier in
    functions/_lib/verify-key.js — DP1 IS accepted here, unlike
    licence-check; no key / no D1 → the local-first count as a
    fallback hint, never a hard failure); POST records one used
    report, idempotent on a client-supplied idempotency key
    (check-then-INSERT OR IGNORE, the Paddle webhook's pattern),
    increments licences.reports_used (migration 0001) — the count
    lives ONLY there, no second counter table; migration 0003 adds
    the evidence_report_logs table (idempotency_key PK, key_hash,
    created_at). Fail-closed: POST with no D1 → 503; used up /
    non-Studio / revoked → 403 with the counts; no D1 row → 404.
    The shared verifier was extracted from link-licence.js into
    functions/_lib/verify-key.js (link-licence now imports it;
    clerk suite 8/8 still green). Node suite
    functions/api/evidence-usage.test.mjs 18/18 (mock D1) + pytest
    wrapper tests/test_track_f_endpoints.py. Migration 0003 NOT
    applied live (D1 apply needs John's approval tap — document the
    wrangler command, do not run it). Dashboard wiring to call the
    endpoint is follow-up (console track); the browser still counts
    locally first. Still to close: apply migration 0003, push + live
    check.
    DASHBOARD WIRING DONE LOCALLY 2026-11-27 (Track L): new
    web/dashboard-server.js (265 lines) + dashboard.html edits
    (281 lines) — the usage card now calls GET /api/evidence-usage
    and the Licence card has a Billing block calling POST
    /api/billing-portal. Server count is authoritative when
    source: "server"; display shows max(local, server) with the
    note naming both numbers when they differ; 404 → local-only
    with "No server usage record for this key yet — counting on
    this device."; 503/unreachable → local-only silently. The Log
    button mirrors the local count server-side (POST, idempotency
    key; a server 403 does NOT undo the local log). The portal
    button shows honest states only — no linked customer → message,
    never a fake link; bad key → the endpoint's own error; portal
    sessions expire 5 min after creation if unused. No new
    endpoints (Track F's). Verified: node
    web/dashboard-server.test.js 26/26 (stubbed DOM + fetch, real
    evidence-usage.js + licence.js); Playwright
    tests/e2e/test_dashboard_server.py 5/5 (server merge, 404
    fallback, log mirror, portal opens the real session URL,
    no-customer honesty). Test lesson recorded: page.route does
    NOT intercept popup navigations — the portal test routes
    billing.stripe.com via page.context.route (probed: page.route
    never fires for the popup, context.route does). Dev-server
    routes added for both endpoints (localHint / honest-503
    fallbacks without D1). Still to close: apply migration 0003
    (+ 0004 for the portal — see #3), push + live check.
16. [web] Remove the CLI command box from the web console. The site
    shows `$ wayback-social archive x <handle> --limit 20` with a Copy
    button when a live search fails — the CLI should not be on the web
    page at all. Replace it with a working in-browser path (issue 17).
    Screenshot from John's iPhone 2026-11-26 14:34 shows the box under
    "Load verified sample" on the search form.
17. [web] Live browser search fails (archive.org CORS). The demo search
    reports "Live search failed (archive.org may block browser
    requests / CORS)" and falls back to built-in demo data. Fix with a
    Cloudflare Worker/Pages Function CDX proxy so the web console does
    real searches, with a visible progress state and a retry button.
    Until then the failure message must say the search did not run —
    never show demo rows as if they were live results.
18. [web] All-network search in the web console. The web search form is
    one network at a time; add a "Search all networks" mode (same as
    CLI `find`): one handle, all 14 networks, grouped results, free
    tier capped at 3 networks, paid tiers up to 14. Same caps as
    plans.py.
19. [branding] Dynamic per-subdomain branding on ONE web app. Each
    subdomain (apex, app., verify., osint., legal.) shows its own
    brand name, tagline, hero copy, accent colour, default preset and
    SEO title/meta — same codebase, same Paddle backend, hostname
    routing in JS (see docs/subdomain-branding.md). Check the best
    name for each subdomain from the naming-v2 shortlist
    (ArchiveCheck, PostTrace, HandleCheck, PastProof, SocialTrace,
    DeletedProof) plus new candidates; verify no live-product
    collisions for any name used as a subdomain brand.
20. [web] Server-side per-subdomain titles + meta (fix static HTML).
    Created on GitHub 2026-11-26 15:15 EST as issue #20 (enhancement).
    Per-subdomain branding is JS-applied; static index.html still says
    "wayback-social", so no-JS crawlers see the wrong title/meta on
    every subdomain. Fix: Pages Function HTMLRewriter middleware
    rewriting title/meta/OG/JSON-LD per hostname from shared
    web/brands.json; branding.js stays as client fallback. DONE
    LOCALLY 2026-11-26: functions/_middleware.js + web/brands.json +
    scripts/sync_brands.py (single source of truth, drift-tested) +
    functions/middleware.test.mjs (486/486) + tests/e2e/
    test_ssr_branding.py (11/11 raw-HTML checks over HTTP) +
    tests/test_brands_sync.py (6/6) + node tests in CI +
    docs/ssr-branding.md. Static files now carry the apex brand.
    PUSH-READY MATRIX 2026-11-27 (Track H): raw-HTML matrix over the
    dev server, 6 hosts x 2 paths — every injected field (title,
    meta, OG, Twitter, JSON-LD, h1, .sub, footer) correct per brand;
    middleware 490/490, branding 121/121, sync --check clean.
    Documented by-design: canonical + og:url NOT rewritten on test
    hosts (production-hosts-only rule — CANONICAL UPDATE 2026-11-27:
    John picked option (b), canonicals retargeted to
    deletedproof.northforgelabs.dev and applied the same morning, so
    live pages now carry northforgelabs.dev canonicals);
    dashboard h1/.sub/footer client-only. Full record:
    docs/push-readiness.md §1. Still to close: push + live check on
    all 5 subdomains (see docs/ssr-branding.md §4) — local-only
    verification never closes an issue.
21. [web] Live free search fails on deployed site — date range ignored,
    demo shown as result, CLI fallback text. Created on GitHub
    2026-11-26 15:19 EST as issue #21 (bug). Repro: app. subdomain,
    signed out, juliawalterz, 20200101–20231231. Live deploy is old
    v1.3; fixes (CDX proxy, date picker, range-aware sample, CLI
    removal) are local-only until the next push. Acceptance: free
    signed-out search works end-to-end via /api/cdx with the range
    applied, no demo-as-result, no CLI text, date picker present.
    SINGLE-SEARCH TIMEOUT DONE LOCALLY 2026-11-27 (Track F): the
    broad-search path had a 120s per-fetch timeout (modes.js
    fetchPatternTimed) but the single-search path (fetchPattern in
    console.js) had none — a stalled CDX fetch hung the search
    until the caller gave up (the stop test proved a 240s hang).
    console.js now calls fetchSingle(), which reuses
    fetchPatternTimed via window.WS_MODES (exported for this; the
    wrapper is shared, not copied) with an injectable timeout
    (window.WS_FETCH_TIMEOUT_MS, production default 120s); a stall
    throws a distinct TimeoutError (not AbortError), so the job
    counts it as a failed pattern and the failure UI offers retry —
    a real Stop still propagates as AbortError. Falls back to the
    plain fetchPattern if modes.js failed to load. Node suite
    web/console-timeout.test.js 17/17 (fast fetch resolves; stall
    → timeout failure UI promptly with retry; real Stop → stopped
    status, not timeout; modes.js missing → fallback still
    searches) + modes.test.js 19/19 (new WS_MODES export check).
    E2E PROOF (isolated stop test, single-search path, real
    archive via the dev-server proxy):
    test_stop_keeps_partial_results_then_resume PASSED in 54.95s
    (stop → "stopped" status → resume → "Found" with rows). The
    120s stall itself is proven by the node tests, not E2E (a real
    120s stall cannot be waited out in E2E).
    EXACT-CASE RE-VERIFICATION 2026-11-27 (Track H):
    tests/e2e/test_issue21.py — juliawalterz, X, 20200101–20231231,
    signed out, free, app. brand, via the dev-server proxy against
    the real archive: PASSED 2026-11-27 02:25 UTC in 36.45s (attempt
    3; attempts 1–2 failed on test assertions, not the product).
    Per item: date picker + range in the CDX query ✓; real rows in
    range, no 2006 ✓; no demo-as-result ✓; no CLI text ✓; progress
    + Pause/Stop/Resume ✓. Archive flapped 02:26–02:28 UTC (503
    "Temporarily Offline" + 500) — documented flakiness, not a
    product failure. Full record: docs/push-readiness.md §2.
    Still to close: push + the live acceptance above.
22. [web] Page copy says "Wayback" everywhere but we search more than
    Wayback — fix copy + remove remaining CLI bleed. Created on GitHub
    2026-11-26 15:22 EST as issue #22 (enhancement). Title/meta/OG/
    JSON-LD/hero/status all frame the product as Wayback-only, but the
    search covers Wayback CDX + Arquivo.pt + MemGator + Common Crawl +
    live Bluesky/Mastodon/YouTube APIs. Fix: multi-source copy,
    reworded honest-limits line, audit of all public surfaces for
    Wayback-only framing and CLI bleed. Acceptance: no Wayback-only
    presentation, no CLI text, tests green, pushed AND live-verified
    (push + test each time).
    AUDIT 2026-11-27 (Track H): grep audit over all of web/ incl.
    guides — 0 CLI-bleed hits in user-facing files (pipx, "command
    line", "use the CLI", "$ wayback", install text); "Wayback" only
    ever as a source name; guides clean (ArchiveCheck titles, no
    terminal/pip text); sitemap lists all 10 guides. Failure-path
    browser tests: tests/e2e/test_failure_paths.py (6 tests — failed
    search, diff/evidence free-tier blocks, batch bad lines,
    checkout placeholder dialog) — results pending a stable tree
    (a parallel track's mid-edit broke one run; re-run after it
    lands). Punch list P1–P4 in docs/push-readiness.md §3:
    P1 "the CLI pack" in the downloaded evidence-pack report
    (web/evidence-pack.js:143); P2 sources line overclaims the web
    search (web/index.html:104); P3 checkout dialog leaks REPLACE_*
    / web/config.js jargon (web/console.js:219); P4 batch skipped-line
    notice is overwritten by progress (web/batch.js:116-118). Plus P5
    (added by Track H / Track G): honest-limits line promises a
    single-post-URL mode that doesn't exist in the web console
    (web/index.html:266).
    FIXED LOCALLY 2026-11-27 (Track J): P1 reworded ("recovered text
    is included where the archive captured it", evidence-pack.js:95
    — line moved since the audit); P2 qualified ("Other sources …
    are covered by the full ArchiveCheck product, not by this page");
    P3 dialog now reads "checkout isn't connected yet. Please check
    back soon." — no REPLACE_*/config.js (the dialog lives in
    web/pricing-ui.js:49 now, extracted from console.js by Track I;
    console.js itself untouched at 492 lines); P4: parseTargets
    echoes the skipped line (truncated to 60 chars) in every error
    and runBatch carries the skipped-line notice through to the
    final status via renderBatch (batch.js 274 lines); P5 reworded
    to "check a single post URL on web.archive.org directly
    instead" (copy fix only — the single-post-URL web mode is NOT
    built; it is a follow-up option, see TEST-REPORT.md Track J).
    tests/e2e/test_failure_paths.py: 6/6 (checkout locator fixed to
    [data-plan="starter"]; mixed-batch test now asserts the skipped
    line survives to the final status). Dev-server bonus fix:
    scripts/dev-server.mjs now serves index.html for directory
    URLs (was HTTP 500 EISDIR). Full E2E: see TEST-REPORT.md
    Track J.
    TRACK K UPDATE 2026-11-27 (DONE locally, unpushed): P5 is now
    CLOSED by building the mode instead of rewording around it —
    single-post-URL mode in the web console (`web/url-mode.js` +
    console.js branch + `arquivoSteps` `urlPattern`): paste a post
    URL, the network is detected from the link (mirrors the CLI's
    `detect_network`), the exact URL is the CDX pattern through
    both proxies, no tier gate (plans.py has no url flag — only
    `archive_limit` applies), bad URL / URL + keyword are honest
    errors with zero fetches, the Arquivo per-handle gate is skipped
    for an exact URL. The honest-limits line and the Instagram guide
    now point at the field instead of web.archive.org. Proof:
    `web/url-mode.test.js` 31/31 + `tests/e2e/test_url_mode.py` 7/7
    incl. the ONE live probe (real jack/status/20, both proxies).
    Full record: `docs/web-search-ux.md` §14 + TEST-REPORT.md
    Track K. Still to close: push + live grep + live failure-path
    checks (per push discipline, local-only never closes it).
23. [dashboard] Customer dashboard + billing management — licence
    tied to the Clerk account (GitHub issue #33, filed 2026-11-27,
    John's ask in the main chat 12:51 EST: "we need dashboard for
    costumers, billing management and all that too and not just using
    keys? use clerk/tied to account fields etc? keys should be
    managed via clerk system right and not stored if thats what you
    mean?"). EXISTS: dashboard.html (tier badge, usage, licence
    paste-key, Billing section with "Manage billing" → POST
    /api/billing-portal test-only, "My account" card with link-a-key
    form); auth.js fetchLinkedTier() — GET /api/link-licence with
    the Clerk session token returns the linked tier on sign-in, so
    the tier auto-applies on every device AFTER the first link;
    billing-portal.js proven in test mode, live refused by design;
    evidence-usage server endpoint + dashboard wiring. MISSING:
    (1) purchase → account linking with zero pasting — checkout
    must capture the Clerk user id (Payment Link / Checkout Session
    metadata or client_reference_id, when signed in) and the
    webhooks (#23 Stripe, #4 Paddle) must write
    users.clerk_user_id at mint time; (2) dashboard rework,
    account-first (plan/tier, linked licence, usage, billing) with
    the key input demoted to a fallback section for the CLI;
    (3) billing LIVE — lift the sk_live refusal in
    billing-portal.js (code change + live STRIPE_SECRET_KEY
    decision, #3); invoices/receipts/payment-method live inside
    the Stripe portal; (4) Clerk mirror (public_metadata, display
    only) at link/webhook time; (5) stale "Sales come from Paddle"
    copy in the dashboard Analytics card. LICENCE MODEL (agreed):
    Clerk = identity/sign-in only; the licence record lives in D1
    as a SHA-256 hash (never the raw key) with tier, usage, Stripe
    customer id — that is what validation, usage counting,
    revocation and webhook fulfilment need; Clerk fields mirror
    tier + licence reference for display only. Raw key emailed
    once + shown at purchase as the portable fallback; the
    dashboard reads licence state from the API using the Clerk
    session. HONEST LIMIT (needs John's call): the full key CANNOT
    be re-shown to a returning signed-in user from the hash-only
    store — showing it needs the key stored encrypted in D1 (new
    secret, new risk); otherwise the key lives in the purchase
    email + checkout-success view and the dashboard shows tier +
    key prefix only. ACCEPTANCE: signed-in dashboard shows
    plan/key/usage; billing portal wired for invoices + payment
    method in LIVE; licence auto-applies on sign-in with zero
    pasting after purchase; key shown as fallback; no raw key
    stored in D1 or Clerk. DEPENDS ON: #23, #4, #6 (migration
    0002), #3, #32. BUILD ORDER: next round, after the push
    round lands (develop → preview → main).
    CLARIFICATION 2026-11-27 (John's question, main chat 12:58
    EST — "idk what the keys are…"): the licence IS tied to the
    Clerk account, that is the design and it stays — sign in and
    the plan is there, no key paste on the website, ever. The key
    exists for exactly two reasons: (1) it is the RECEIPT for a
    one-time purchase — the packs are one-time payments, not
    subscriptions, so there is no subscription to check against;
    (2) it is how the command-line tool proves payment, because a
    terminal can't do a browser sign-in. Website customers never
    see it or paste it: **the key is hidden from the website
    dashboard entirely** — it surfaces only in a labelled
    "Command-line access" spot (and the purchase email), as the
    CLI credential. Licence on the website = Clerk account +
    database record. OPEN DECISION FOR JOHN (do NOT decide here):
    one-time packs vs Stripe subscriptions — a pricing-model
    change, not a dashboard tweak. One-time (current): key as
    receipt, no recurring revenue, no churn, simple; upgrades mean
    a new purchase. Subscription: recurring revenue, the website
    checks the Stripe subscription directly (no key on the web at
    all), key stays CLI-only — but recurring billing, churn/dunning
    and portal work. Until John decides, #33 builds on the current
    one-time model with the key hidden from the website. Issue #33
    body updated 2026-11-27 with this clarification.
    DECISION 2026-11-27 13:24 EST (John, main chat): **full
    subscription via Stripe is the main model, PLUS a one-time pack
    purchase as well — both offered.** Competitor research + build
    plan recorded in #33 (comment 2026-11-27) and
    docs/pricing-features.md §6. Plan: same tiers, two billing
    periods — Starter $9/mo, Pro $19/mo, Studio $49/mo (monthly =
    launch one-time prices), annual 2 months free, Bundle
    one-time-only; sub adds cloud-saved packs + monthly text-fetch
    credits + Studio 10 evidence reports/month; portal flips
    subscription cancel/plan-change ON; webhook gains
    customer.subscription.* + invoice.payment_* events; migration
    0006; lapse = tier kept to end of paid period, then Free (or
    owned one-time tier), 7-day grace on failed payment. Tie-to:
    account-first + email-claim. One-time download is NOT the
    model. Build after the push round lands.
