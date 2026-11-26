# DeletedProof — Pricing & Feature Matrix

**Date:** 2026-11-26. **Status:** recommendation — reconciles the naming
research prices with John's cheap-pack + 50%-off bundle ask. No code
changed here; `web/config.js` + `wayback_social/plans.py` (v1.2, local)
already implement the launch prices below — one arithmetic fix needed
(see §3). Sources: branding doc `docs/branding-seo-plan.md`,
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
| Studio | **$49** one-time | $99 | $46.05 (reg $93.55) | $47.27 (reg $95.83) |
| All-in Bundle (all three packs) | **$59** one-time | $147 | $55.55 | $56.99 |
| Text-fetch top-up (500 credits) | $15 | $15 | $13.75 | $14.27 |

Nets: Paddle = price × 0.95 − $0.50; Stripe = price × 0.971 − $0.30.
Bundle math: $19 + $29 + $99 = **$147** regular, so $59 is **60% off**.

**⚠️ Fix before launch:** `web/config.js` says the bundle regular is
$137 / 57% off. $19 + $29 + $99 = $147, not $137. Change it to $147 /
60% off — the bundle story gets *better* and the arithmetic is true.

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
| Exports | CSV only, 1/mo | CSV + JSON | CSV/JSON/JSONL/HTML | All + evidence pack |
| archive.today / Ghostarchive fallback links | ✓ | ✓ | ✓ | ✓ |
| Evidence pack (ZIP + SHA-256 manifest) | — | — | — | ✓ |
| Cloud-saved packs (R2, see storage plan) | — | — | — | ✓ |
| Seats | 1 | 1 | 1 | 5 |
| Commercial use | — | personal | personal | ✓ |
| Priority support | — | — | — | ✓ (human inbox) |
| Credit top-up ($15/500) | — | ✓ | ✓ | ✓ |

## 3. What Studio actually does that lower tiers don't — can we do it?

Status checked against the local v1.2 code on 2026-11-26 (30 tests pass).

| Studio-only feature | Status | Evidence / reason |
|---|---|---|
| Batch 200 targets/run | ✅ Already do it | `batch` command + `cap_batch_targets` in `plans.py` |
| 25,000 captures/search | ✅ Already do it | Cap in `plans.py`; honest limit is archive.org itself (slow/flaky CDX, some networks thin) |
| 10,000 replay-text fetches | ✅ Already do it | `fetch_replay_text` in `oembed.py`; some networks replay as blank JS shells — labelled honestly |
| Evidence pack (ZIP + SHA-256 manifest) | 🟡 Can build — small | HTML export + diff already exist; ZIP via stdlib `zipfile` + `hashlib`, one new exporter, ~1 day. This is the last build before Studio is real |
| Cloud-saved packs (R2) | 🟡 Can build — Phase 2 | Needs login + a Pages Function issuing presigned R2 URLs (see `docs/storage-auth-plan.md`). Cost ≈ $0 to ~3,300 packs stored |
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

- **Starter $9 launch:** 73% cheaper than Social Catfish's first month
  ($33.21); cheaper than one month of Spokeo ($19.95) — for the one
  question archives answer that they can't (deleted posts, with dates).
- **Pro $19 launch:** less than one month of Social Catfish ($27.48);
  about one Spokeo month, kept forever.
- **Studio $49 launch:** 71% cheaper than one year of Hunchly ($169);
  under a quarter of one Page Vault capture ($199).
- **Bundle $59 launch:** every pack for 65% less than a year of
  Hunchly — and Hunchly can't retrieve anything already deleted.
- **Regular prices (after launch):** Starter $19 is 43% cheaper than
  Social Catfish's first month; Pro $29 is 88% cheaper than a year of
  Spokeo ($239.40); Studio $99 is 41% cheaper than a year of Hunchly.
- The free tier is the funnel: counts + dates visible, full export
  paywalled — the same honest funnel Social Catfish and Deleted Tweet
  Finder use.

## 5. Recommendation

1. **Launch at the launch prices** ($9 / $19 / $49 / $59 bundle,
   $15 top-up), regular prices struck through beside them, with a
   stated end ("launch pricing ends after 90 days or 500 buyers").
2. **Fix the bundle arithmetic** ($147 / 60% off) in `config.js`.
3. **Ship the evidence-pack ZIP** before announcing Studio — it is
   the one Studio feature not yet built.
4. **Do not launch a subscription.** The one-time price *is* the
   differentiator. Test price rises later via `?ab=` (Starter $19 vs
   $24, Pro $29 vs $39) only after the deleted-diff is live.
5. **Enforcement gaps to close before paid launch:** web monthly cap
   for Free (3 searches/mo) and export-format gating (Free = CSV only)
   are currently policy only — the CLI enforces per-run caps, the web
   app does not yet. Both close once the licence-key check lands
   (see `docs/storage-auth-plan.md` §3).
