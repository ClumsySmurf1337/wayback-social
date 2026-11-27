# Track S — new issues: drafts + filing record (2026-11-27)

Missed-work sweep (Worker A: chat sweep, 57 user messages, 48 items;
Worker B: live-state verification). Live GitHub re-checked 2026-11-27
~10:48 EST before filing: **21 OPEN (#1–6, #8–22), 1 CLOSED (#7)**.
No draft below duplicates a live issue — see "Already tracked, not filed"
at the end for the items skipped as covered.

Filing method: GitHub connector `issue_write` (method `create`), NOT the
browser. Filed numbers are filled in below as each issue lands. This file
is the record/backup of what was filed.

Status legend: **BLOCKED-JOHN** = needs a human step only John can do.

---

## S-1 — Replace the sales@example.com placeholder with John's real address

- Filed as: #29
- Proposed label: `enhancement`
- Related: #9 (trust page notes the same placeholder for the abuse address)
- Missed item: Worker A #1

### Body (as filed)

John's real support / order email was asked for 3 times and never
answered (Track M, TEST-REPORT.md §2.4). The placeholder is still live
in the tree and will ship in the next push:

- `web/config.js:47-51` — checkout `email:` links, all five packs
  (`mailto:sales@example.com?subject=ArchiveCheck ...`)
- `web/trust.html:92` — report-abuse / takedown address

### Acceptance

- John's real address is in `web/config.js` (all five email links) and
  in `web/trust.html`; zero `sales@example.com` hits left in `web/`.
- Lands in the next push (develop first, then PR merge to main).

---

## S-2 — Decide the storage route for LICENCE_ED25519_PRIVATE_KEY

- Filed as: #27
- Proposed label: `enhancement`
- Related: #4 (the secret-setting step lives there)
- Missed item: Worker A #3
- Status: **BLOCKED-JOHN** (storage-route decision)

### Body (as filed)

The first DP2 private key was lost in the 2026-11-27 00:56 UTC VM reboot
(single copy in `/tmp/keygen.txt`). A new pair was generated
2026-11-27 ~02:05 UTC and proven Node-mint → Python-verify. The new
private key is held at `.licence-keygen.txt` (chmod 600, gitignored)
until it is set as a Pages secret — but the connector PUT outcome is
unknown and John's storage call is still pending: Cloudflare card
vs Drive + Mac wrangler. This blocks #4's secret step, the $1 sandbox
purchase test, and the Stripe webhook proof (S-6).

NEVER paste the key value in chat, in an issue, or in the repo.

### Acceptance

- John picks a storage route; `LICENCE_ED25519_PRIVATE_KEY` (+
  `LICENCE_ED25519_PUBLIC_KEY`) is set as Pages secrets (Production +
  Preview).
- `.licence-keygen.txt` is shredded after the secret is confirmed set.
- The $1 sandbox purchase test is unblocked.

---

## S-3 — MemGator health-check timer: verify/repair after the second reboot

- Filed as: #31
- Proposed label: `bug`
- Related: #8 (the stack / public URL lives there)
- Missed item: Worker A #5

### Body (as filed)

Track M recovered the MemGator stack a third time 2026-11-27 10:26 EST
(all five components up, public URL 200, TimeMap 80 mementos). Since
then the reinstall approvals timed out twice and the last chat state
was "stack killed again". Pattern (docs/memgator-deploy.md): VM/runtime
restarts wipe `/etc`, the systemd units vanish, nothing restarts the
stack. The 15-min health-check timer is a best-effort fallback — timer
runs have no proxy credentials, so a relay restart there defers
(healthcheck.log 07:12–07:43).

### Acceptance

- Units reinstalled via `ops/memgator/install-systemd.sh` (sudo, from a
  session with fresh proxy creds); timer active; stack survives a
  reboot check.
- Public URL `memgator.northforgelabs.dev/about` returns 200 and a
  TimeMap query returns 200 with mementos.
- Do NOT rotate the tunnel token without John's explicit call.

---

## S-4 — Secondary Cloudflare member login: clumsysmurf34 invite sent, acceptance pending

- Filed as: #30
- Proposed label: `enhancement`
- Related: #10 (Web Analytics half — see below)
- Missed item: Worker A #8 + #11 (merged — same thread)
- Status: **BLOCKED-JOHN** (invite acceptance)

### Body (as filed)

John has no Cloudflare password (Google SSO only) and dashboard Google
sign-in is broken for this account (OIDC callback rejected 5x), so the
connector API route is the primary way in — with a secondary member
login as the fallback.

Invite SENT 2026-11-27 ~10:45 EST to `clumsysmurf34@gmail.com`
(Administrator role, member id `4a4fc78f7fa751726c86465dbae8cd6e`,
status pending). Acceptance is John's step: open the invite in the
clumsysmurf34 inbox, accept, set a password. That account then signs
in to the dashboard with email+password.

Web Analytics is blocked on EITHER the invite acceptance OR a connector
re-authorization with the `account-settings.write` scope — the connector
cannot create the RUM site itself (403, missing that scope). It is NOT
a missing API endpoint.

### Acceptance

- Invite accepted; member status active; dashboard sign-in with
  email+password verified.
- Web Analytics unblocked via that account (or via the re-authorized
  connector scope).

---

## S-5 — Stripe sales-tax decision for the live links (no tax set)

- Filed as: #28
- Proposed label: `enhancement`
- Related: #3 (tracked there today as an open line item)
- Missed item: Worker A #9 (tax half)
- Status: **BLOCKED-JOHN** (decision)

### Body (as filed)

Track N created the live Stripe products / prices / Payment Links
2026-11-27 (docs/stripe-vs-clerk.md §7) by replicating the test recipe
exactly: no `tax_code`, `automatic_tax` off, `tax_behavior:
unspecified`. Stripe therefore collects NO sales tax / VAT / GST on
these purchases. The live go-ahead did not answer the tax question —
John's sales-tax decision is STILL OPEN (docs/stripe-vs-clerk.md §1,
§7 flag).

### Acceptance

- John answers: collect tax (enable Stripe Tax + registrations, then
  rebuild/edit the links before real payments at volume) or confirm
  no-tax.
- Decision recorded in docs/stripe-vs-clerk.md and on #3.

---

## S-6 — Stripe webhook: a live Stripe buyer pays and gets no licence key

- Filed as: #23
- Proposed label: `bug`
- Related: #3
- Missed item: Worker B live-state finding (recorded only in docs, never a GitHub issue)
- Priority: HIGH — live risk, #1 follow-up for the live checkout

### Body (as filed)

Every live Payment Link's hosted-confirmation message promises the
licence key "on its way by email". Nothing sends it: no
`functions/api/stripe-webhook.js` exists (`functions/api/paddle-webhook.js`
handles Paddle only). Until one lands, a live Stripe purchase creates a
Stripe Customer + a charge and NO licence key, NO D1 row, NO email, NO
linked customer for the portal — the buyer would have to email support
and be fulfilled by hand.

Evidence: docs/stripe-vs-clerk.md §7 ("THE GAP"), docs/issues.md #3,
docs/issue-tracker.md:45, TEST-REPORT.md:2515.

### Acceptance

- Build `functions/api/stripe-webhook.js` (verify `Stripe-Signature`,
  mint DP2, D1 `licences` row, Resend email, `cus_` mapping); set Pages
  secret `STRIPE_WEBHOOK_SECRET`; prove with a sandbox purchase first.
- Do not take live Stripe payments at volume until the webhook is built
  and proven.
- Depends on S-2 / #4 secrets (private key + `RESEND_*`) and on the
  batched push (develop first, then PR merge to main).

---

## S-7 — [Track R] CLI diff is NOT tier-gated on free, web IS

- Filed as: #26
- Proposed label: `bug`
- Missed item: Track R B1 (TEST-REPORT.md Track O §3)
- Owner: Track R owns the fix

### Body (as filed)

Found by Track O (local full feature test, 2026-11-27 ~15:23–15:35 UTC):
`wayback-social diff x jack --limit 2` on the free plan ran to
completion (4 captures, CSV saved). `wayback_social/plans.py:38` says
free has `deleted_diff: False`, and the web console blocks free users
with "Deleted diff needs Starter" (Track E, deliberate). The CLI never
checks the flag: grep over `wayback_social/commands/` +
`wayback_social/*.py` finds `deleted_diff` only in the `PLAN_FEATURES`
definition — no enforcement call site. The keyword gate IS enforced in
the CLI (`wayback_social/extra_commands.py:92`, verified: free refused,
Pro allowed), so `diff` is the odd one out.

### Acceptance

- Either gate the CLI `diff` on Starter+ like the web, or deliberately
  declare CLI diff free and drop `deleted_diff: False` from the free
  tier. Until decided, free CLI users get a paid web feature for free.

---

## S-8 — [Track R] Dev server does not route /api/licence-check or /api/packs-upload

- Filed as: #25
- Proposed label: `bug`
- Missed item: Track R B2 (TEST-REPORT.md Track O §3)
- Owner: Track R owns the fix

### Body (as filed)

Found by Track O (2026-11-27 ~15:23–15:35 UTC): `curl -X POST
http://127.0.0.1:8902/api/licence-check` and `/api/packs-upload` both
return 404 "not found". `scripts/dev-server.mjs` routes only /api/cdx,
/api/arquivo, /api/ghostarchive, /api/commoncrawl, /api/evidence-usage,
/api/billing-portal, /api/live-check (lines 44-50, 91-191). The two
unrouted Functions were verified instead by direct Node invocation of
their `onRequest` (all pass).

### Acceptance

- Add both routes to `scripts/dev-server.mjs` (same pattern as
  evidence-usage / live-check); curl proves meaningful responses.
- Note: `scripts/dev-server.mjs` is 275 lines — the next edit to it
  must split it (file-size ceiling).

---

## S-9 — [Track R] --limit help text reads as a total but applies per URL pattern

- Filed as: #24
- Proposed label: `enhancement`
- Missed item: Track R N1 (TEST-REPORT.md Track O §3)
- Owner: Track R owns the fix

### Body (as filed)

Found by Track O (2026-11-27 ~15:23–15:35 UTC): `archive x jack
--limit 2` returned 4 captures. X queries both `twitter.com/{id}/status/*`
and `x.com/{id}/status/*` and merges (`wayback_social/networks.py:65-71`),
and `cdx.py:49-50` passes `--limit` straight through to each CDX query —
2 patterns × limit 2 = 4 rows. The plan cap (`archive_limit`) is enforced
on the total, so no cap is bypassed; only the help text
(`-l, --limit INTEGER  Max CDX results`) misleads.

### Acceptance

- Reword the help to "Max CDX results per URL pattern" (or cap the merged
  total at `--limit`).

---

## Already tracked, not filed (live GitHub re-checked 2026-11-27 ~10:48 EST)

| Missed item (Worker A) | Existing issue | Note |
|---|---|---|
| #2 Web Analytics sign-in / token | #10 | "Enable Cloudflare Web Analytics" is #10's scope; the failed 05:15 UTC browser task is a retry step there. Now blocked on EITHER the clumsysmurf34 invite acceptance (S-4) OR a connector re-authorization with `account-settings.write` scope — the connector cannot create the RUM site itself (403). Not a missing API endpoint. |
| #4 Clerk admin + test users + live email-code login flow | #6 | Test accounts are #6's still-open step (docs/clerk-auth.md §6 step 8). Track P §11: not created; creation path corrected — Clerk Dashboard (no code needed) OR John's Gmail `+` aliases (`test+*@archivecheck.example` has no inbox, so no code can arrive). Live email-code flow needs the deploy live first. |
| #6 Paddle real product links + $1 sandbox test | #3 | #3's title IS this work (Paddle half still REPLACE_*; Stripe half done by Track N). |
| #7 GitHub App install (push still 403-blocked) | #11 | #11's title IS this work (direct install link in the issue). |
| #10 Resend human steps | #4 | Account + Sending-access key + verified domain + `RESEND_*` Pages secrets + $1 sandbox test are #4's still-open steps (docs/email-setup.md). |
| #12 Turnstile keys as env vars | #6 | Site/secret keys are #6's still-open step (config.js still `REPLACE_TURNSTILE_SITE_KEY`, enabled: false; secret lives in Pages env `TURNSTILE_SECRET_KEY` only). |
| #13 Rename to ArchiveCheck + name lock | #1 (+ #2) | #1 is the rename; #2 (domain/org/PyPI) is deferred by the canonical decision (b) — archivecheck.com NOT bought, umbrella name NOT formally locked. |
| #9 Stripe-vs-Clerk eval (half) | — (answered) | Answered in docs/stripe-vs-clerk.md §§1–3: no, Stripe cannot replace Clerk (Stripe = billing records, Clerk = identity/sessions). No issue needed; the tax half is S-5. |

## Post-filing notes (2026-11-27 ~10:54 EST)

- All 9 drafts filed live via the connector `issue_write`: #23–#31
  (verified by a live `list_issues` re-check: 30 open, 1 closed).
  GitHub Discussions check: the discussions page
  (`github.com/ClumsySmurf1337/wayback-social/discussions`) returns
  HTTP 404 — Discussions are not enabled on the repo, so there is
  nothing to answer there. No discussion issue filed.
- Muse-email member plan — TRIED AND BLOCKED, closed (not missed):
  John asked to use johnhamilton@muse.ai as the secondary Cloudflare
  login (2026-11-27 ~10:52 EST); the system refused the invite — it
  cannot give itself its own Cloudflare login to John's account. The
  blocked call ran nothing: the clumsysmurf34@gmail.com invite is still
  pending and remains the secondary-login path. Do NOT attempt the
  Muse-email invite again, and do NOT send any Cloudflare member invite
  from this side.
- LICENCE_ED25519_PUBLIC_KEY — **SET 2026-11-27 ~10:52 EST by the parent
  (batched PATCH, Production + Preview, verified by read-back) — this
  bullet is SUPERSEDED.** The PATCH sent the secret back type-only and
  CLERK_SECRET_KEY survived intact on both envs: the API retains secret
  values when no value is supplied. The private key itself still needs
  John's explicit confirmation of the approach (S-2 / #27) — do NOT set
  it on the strength of the general Cloudflare-setup authorization.
- RUM / Web Analytics token via the API is NOT possible — the connector
  gets a 403 (missing account-settings.write scope). It stays blocked on
  either the clumsysmurf34 invite acceptance (#30) or a connector
  re-authorization with that scope.
- Cloudflare calls made by Track S this round: ZERO (all live values
  used were parent-verified cached values; no live Cloudflare read was
  needed). Approval prompts hit by Track S: 9, one per GitHub
  `issue_write` call (#23–#31) — the GitHub connector's write actions
  are not durably allowed, so each filing prompted once.
