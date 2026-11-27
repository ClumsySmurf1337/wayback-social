# DeletedProof — Pricing & Feature Matrix

**Date:** 2026-11-26. **Status:** implemented in v1.3 (launch prices in
`pricing.yaml`, `wayback_social/plans.py`, `web/config.js`); verified
by Track R 2026-11-27 — pricing.yaml ↔ plans.py ↔ config.js agree,
and the bundle arithmetic is $147 / 60% off (the v1.2 $137 figure is
corrected below). Sources: branding doc `docs/branding-seo-plan.md`,
competition report `~/workspace/research_notes/wayback-social-competition-20261126-1841/report.md`.

## 1. Reconciled price table — launch vs regular

The naming research recommended Free / Starter $19 / Pro $29 / Studio $99
+ $15 top-up. John asked for a cheap pack and a 50%-off bundle. Both
are right: **the research prices become the regular prices; the cheap
pack + bundle become the launch offer** (first 90 days or first 500
buyers, then prices rise to regular — say so on the page).

| Tier | Launch price | Regular price | Paddle net kept (5% + 50¢) | Stripe net kept (2.9% + 30¢) |
|---|---|---|---|---|
| Free | $0 | $0 | — | — |
| Starter | **$9** one-time | $19 | $8.05 (reg $17.55) | $8.44 (reg $18.15) |
| Pro | **$19** one-time | $29 | $17.55 (reg $27.05) | $18.15 (reg $27.86) |
| Studio | **$49** one-time | $99 | $46.05 (reg $93.55) | $47.28 (reg $95.83) |
| All-in Bundle (all three packs) | **$59** one-time | $147 | $55.55 | $56.99 |
| Text-fetch top-up (500 credits) | $15 | $15 | $13.75 | $14.27 |

Nets: Paddle = price × 0.95 − $0.50; Stripe = price × 0.971 − $0.30.
Bundle math: $19 + $29 + $99 = **$147** regular, so $59 is **60% off**.

**~~Fix before launch~~ — FIXED in v1.3 (Track R verified 2026-11-27):**
`web/config.js` now says the bundle regular is $147 / 60% off.
$19 + $29 + $99 = $147, not $137. The bundle story got *better* and
the arithmetic is true.

## 2. Full feature matrix

Caps are per command run in the CLI (`plans.py`, enforced) and per
search on the web. "Web monthly cap" (Free: 3 searches/mo) is policy
until the licence/account system exists — see §4 notes.

| Feature | Free $0 | Starter $9 | Pro $19 | Studio $49 |
|---|---|---|---|---|
| Searches | 3/mo (web) | unlimited | unlimited | unlimited |
| Captures per search | 25 | 250 | 2,500 | 25,000 |
| Networks per `find` | 3 | 7 | 14 | 14 |
| Batch targets per run | 3 | 10 | 50 | 200 |
| Replay-text fetches | 5/search | 100/search | 1,000/search | 10,000/search |
| Deleted-only diff | — | ✓ | ✓ | ✓ |
| Replay text fetch | 5 posts | ✓ | ✓ | ✓ |
| Keyword search (over fetched text) | — | — | ✓ | ✓ |
| Exports | CSV only | CSV + JSON | CSV/JSON/JSONL/HTML | All + evidence pack |
| archive.today / Ghostarchive fallback links | ✓ | ✓ | ✓ | ✓ |
| Evidence pack (ZIP + SHA-256 manifest) | — | — | — | ✓ |
| Cloud-saved packs (R2, see storage plan) | — | — | — | ✓ |
| Seats | 1 | 1 | 1 | 5 |
| Commercial use | — | personal | personal | ✓ |
| Priority support | — | — | — | ✓ (human inbox) |
| Credit top-up ($15/500) | — | ✓ | ✓ | ✓ |

## 3. What Studio actually does that lower tiers don't — can we do it?

Status checked against the local code on 2026-11-27 (Track R): the
evidence pack shipped in v1.4 and the R2 upload endpoint is built —
see the two rows below. (The v1.2-era "Can build" wording is kept in
the table history by the dates in this paragraph.)

| Studio-only feature | Status | Evidence / reason |
|---|---|---|
| Batch 200 targets/run | ✅ Already do it | `batch` command + `cap_batch_targets` in `plans.py` |
| 25,000 captures/search | ✅ Already do it | Cap in `plans.py`; honest limit is archive.org itself (slow/flaky CDX, some networks thin) |
| 10,000 replay-text fetches | ✅ Already do it | `fetch_replay_text` in `oembed.py`; some networks replay as blank JS shells — labelled honestly |
| Evidence pack (ZIP + SHA-256 manifest) | ✅ Built in v1.4 | CLI `evidence` command + `archive --evidence` (Studio-gated, `wayback_social/evidence.py`); web evidence-pack builder in `web/evidence-pack.js` (Studio-gated, client-side ZIP) |
| Cloud-saved packs (R2) | 🟡 Built, not yet proven live | `functions/api/packs-upload.js` (DP2 licence verify, presigned PUT, 15-min expiry) + buckets `deletedproof-packs` / `-staging` verified live; R2 S3 secrets + lifecycle rules + a live upload test are still human steps (issue #5) |
| 5 seats | ✅ Can do it | Licence payload carries `seats: 5`; enforcement is honour-system + optional online check. No code needed beyond the key format |
| Commercial-use licence | ✅ Can do it | Licence-terms text only; no code |
| Priority support | ✅ Can do it | Human: a dedicated inbox + a 48h reply promise. No code |

### Cannot do — at any tier (say so on the trust page)

- **Real-time monitoring / alerts** — CDX is historical snapshots, not
  a live feed; also ethically barred (no monitoring, ever).
- **Face / reverse-image search** — CDX's digest is a whole-capture
  SHA-1, not a perceptual hash. Link out to Lens/TinEye instead.
- **Private accounts, DMs, stories** — never archived, never accessible.
- **Court-ready evidence** — no vendor affidavit, no qualified
  timestamp (that is Page Vault / ProofSnap territory, $199–349 per
  capture). DeletedProof is **triage**: locate the capture, export the
  citation, then re-capture forensically.
- **Certain "deleted" verdicts** — live-check is best-effort; X/IG
  login walls make "deleted" unprovable from a HEAD request. The diff
  reports `deleted / live / unknown` and never hides the unknowns.

## 4. Launch pricing — why it wins (put this on the pricing page)

- **Starter $9 launch:** 67% cheaper than one month of Social Catfish
  ($27.48 — the competition report's verified figure; an earlier draft
  of this doc used $33.21, which appears in no source and is wrong);
  cheaper than one month of Spokeo ($19.95) — for the one
  question archives answer that they can't (deleted posts, with dates).
- **Pro $19 launch:** less than one month of Social Catfish ($27.48);
  about one Spokeo month, kept forever.
- **Studio $49 launch:** 71% cheaper than one year of Hunchly ($169);
  under a quarter of one Page Vault capture ($199).
- **Bundle $59 launch:** every pack for 65% less than a year of
  Hunchly — and Hunchly can't retrieve anything already deleted.
- **Regular prices (after launch):** Starter $19 is 31% cheaper than
  one month of Social Catfish ($27.48); Pro $29 is 88% cheaper than a year of
  Spokeo ($239.40); Studio $99 is 41% cheaper than a year of Hunchly.
- The free tier is the funnel: counts + dates visible, full export
  paywalled — the same honest funnel Social Catfish and Deleted Tweet
  Finder use.

## 5. Recommendation

1. **Launch at the launch prices** ($9 / $19 / $49 / $59 bundle,
   $15 top-up), regular prices struck through beside them, with a
   stated end ("launch pricing ends after 90 days or 500 buyers").
2. **~~Fix the bundle arithmetic~~ — DONE in v1.3** ($147 / 60% off in
   `config.js`, verified by Track R 2026-11-27).
3. **~~Ship the evidence-pack ZIP~~ — DONE in v1.4** (CLI + web,
   Studio-gated). Announcing Studio no longer waits on it.
4. **Do not launch a subscription.** The one-time price *is* the
   differentiator. Test price rises later via `?ab=` (Starter $19 vs
   $24, Pro $29 vs $39) only after the deleted-diff is live.
5. **Enforcement gaps to close before paid launch:** the web monthly
   cap for Free (3 searches/mo) and the monthly export-count cap are
   still policy only — the CLI enforces per-run caps, the web app does
   not yet count searches or exports per month. Export-*format* gating
   (Free = CSV only) **is** enforced since v1.4, on CLI and web. The
   monthly caps close once the licence-key/account system lands
   (see `docs/storage-auth-plan.md` §3).

## 6. Subscriptions — DECIDED 2026-11-27 13:24 EST (John, main chat)

**Full subscription via Stripe is the main model, PLUS a one-time pack
purchase as well — both offered.** Competitor evidence + full build plan:
GitHub issue #33 (comment 2026-11-27). Build after the push round lands.
**Nothing here is built yet — the v1.3 lock below (§1–§5) is unchanged
until the subscription build lands; every recurring price in this
section is NEW, not a change to a locked price.**

- **Tier mapping (same tiers, two billing periods):** Free $0. Starter
  sub **$9/mo**, Pro sub **$19/mo**, Studio sub **$49/mo** — monthly
  rates equal the launch one-time prices: low entry, month-to-month for
  one-off needs (a single date check, one investigation); the one-time
  pack is the keep-forever buy for repeat users. Annual: 2 months free
  (Starter $90/yr, Pro $190/yr, Studio $490/yr). Bundle stays
  one-time-only ($59 launch / $147 regular). No trial at launch — the
  free tier (counts + dates visible) IS the trial.
- **What the sub adds over the one-time pack at the same tier:** same
  caps; plus cloud-saved packs, monthly text-fetch credits (feeds the
  #32 ledger), priority support on Studio. Evidence reports: one-time
  Studio = 10 total; Studio sub = **10/month while subscribed**.
- **Competitor anchor:** ProofSnap does the same hybrid in our niche
  ($8.99/$16.99/$28.99 per month + $4.99 one-time SnapPack, per
  account); Page Vault pairs annual software with one-time per-job
  captures ($199/$299/$349). Hunchly ($169/yr), Social Catfish
  ($27.48/mo) and Pagefreezer (from $1,500/yr) are subscription-only.
  A one-time *download* is not the model — nobody in this space sells
  one, and the web app has ongoing per-use server costs.
- **Tie-to:** account-first + email-claim (signed-in checkout links
  directly; guest checkout stores the purchase email in the licence
  row and the buyer claims it by signing in with that email — #33).
- **Build surface:** new recurring Stripe prices + Payment Links per
  tier (monthly + annual); Billing Portal flips subscription cancel /
  plan-change ON (live config currently has them OFF); webhook gains
  `customer.subscription.*` + `invoice.payment_*` events; migration
  0006 (`stripe_subscription_id`, status, `current_period_end`);
  lapse = tier kept to end of paid period, then Free (or the tier of
  any one-time pack owned — effective tier = max of the two);
  7-day grace on failed payment. `pricing.yaml` + `config.js` gain a
  billing-period dimension (one-time / monthly / annual); sync scripts
  need a period field. Sales tax (#28) matters more under recurring
  billing.
