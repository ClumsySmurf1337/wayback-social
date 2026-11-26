# DeletedProof — Branding, Pricing & SEO Plan

**Product:** wayback-social (Python CLI + single-page web app; 14 networks,
Wayback CDX, CSV/JSON/JSONL/HTML export, batch, broad `find`).
**Date:** 2026-11-26. **Status:** recommendation for John's approval — no code
or prices changed yet. **Sources:** competition report
`~/workspace/research_notes/wayback-social-competition-20261126-1841/report.md`
(all competitor prices verified/indexed 26 Nov 2026; re-check at launch).

## 1. Name — 5 candidates, availability checked live 2026-11-26

Method: PyPI JSON endpoint (`pypi.org/pypi/<name>/json`, 404 = free —
validated against `requests` = 200 and a fake name = 404); GitHub repo
search (`api.github.com/search/repositories?q=<name>+in:name`) and
`github.com/<name>` profile page (404 = free username); domains via
RDAP (`rdap.org/domain/<name>.<tld>`, 404 = unregistered). Note: the VM's
DNS resolver is a sinkhole (even google.com resolves to 198.18.x.x), so
DNS results were discarded and RDAP used instead.

| # | Name | PyPI | GitHub repos | GitHub user | .com | .app | .io | Verdict |
|---|------|------|--------------|-------------|------|------|-----|---------|
| 1 | **DeletedProof** | free (404) | 0 | free (404) | **free** | free | free | ✅ Clean sweep |
| 2 | ArchiveSleuth | free (404) | 0 | free (404) | free* | free | free | ✅ Clean sweep (*.com RDAP timed out once, 404 on retry — re-check before buying) |
| 3 | GhostPost | free (404) | 323 | **taken** | **taken** | free | free | ❌ Crowded + .com gone |
| 4 | PostEcho | free (404) | 14 | free (404) | **taken** | **taken** | free | ❌ .com + .app gone |
| 5 | Undeleted | free (404) | 20 | **taken** | **taken** | **taken** | free | ❌ .com + .app gone |

Trademark screen: a web search for "DeletedProof" on 2026-11-26 found no
existing product of that name (only generic trademark-database noise).
That is **not** a formal clearance — run a USPTO TESS search (or counsel)
before printing the name on a paid product.

### Recommendation: **DeletedProof** — deletedproof.com

Why it wins over ArchiveSleuth (runner-up): it says the value in one
word — *proof that a deleted post existed* — which is exactly the pitch
for journalists, lawyers, OSINT and daters alike. "Sleuth" narrows the
product to investigators and scares the dating market; "Proof" sells to
everyone. It is pronounceable, spellable after hearing once, works as a
CLI (`deletedproof`), a PyPI package, and a GitHub org
(`github.com/deletedproof`), and the .com + .app + .io are all free.

### Trademark warning — do NOT brand on "Wayback"

"Wayback" / "Wayback Machine" are Internet Archive marks, and IA's
2014 Terms of Use grant access "for scholarship and research purposes
only" / "noncommercial" — a commercial tool built on CDX already sits
in tension with that wording (see report §4). Using "Wayback" in the
brand name invites a takedown and implies IA endorsement. Rename the
product to DeletedProof; keep `wayback-social` only as the legacy repo
name / GitHub alias, and credit "Data: Internet Archive Wayback Machine
(CDX API)" in the footer without claiming endorsement. Get counsel on
the CDX commercial-use question before launch copy claims compliance.

## 2. Branding — DeletedProof

**Tagline:** *"Deleted doesn't mean gone. Prove it."*
Alt for dating: *"Check the profile before you meet them."*

**Positioning (one paragraph):** DeletedProof finds what social media
tried to erase. Type one handle and it searches the Wayback Machine's
public archive across 14 networks — X, Instagram, Facebook, TikTok,
YouTube, Reddit and more — and shows you the posts that were captured
before they were deleted, with the date each one existed and a link to
the original archive replay. No account, no login, no subscription:
buy once, keep it forever. It proves a post existed on a date. It does
not prove who wrote it, why it was deleted, or what anyone intended —
and it says so on every report.

**Logo concept (describe, don't generate):** a document/page glyph with
a clock face inside it, the clock's hand pointing backwards, and a
small checkmark stamped over the fold — "a receipt from the past".
Wordmark in a bold grotesque (e.g. Inter / Archivo Black), "Deleted"
in ink-navy, "Proof" in evidence-green. Favicon: the clock-check mark
alone on navy. No magnifying glass (every OSINT tool uses one), no
ghost, no duck.

**Palette:**
- Ink navy `#0F1E33` (primary, headers, wordmark)
- Evidence green `#1F9D63` (CTAs, "found" states, checkmarks)
- Paper `#F7F4EC` (backgrounds — archive-paper feel)
- Alert amber `#E8A13D` (warnings, "not found ≠ not real")
- Slate `#5A6B7F` (secondary text)
- Red `#C0392B` sparingly (deleted / gone states only)

**Voice/tone:** plain, forensic, calm. Short sentences. Dates on
everything. Never hype ("catch a cheater!"), never verdicts ("scammer"),
never "AI-powered". The trust line appears on every surface:
*"Public archived posts only. Found ≠ guilty. Not found ≠ not real."*

### Subdomain plan — one codebase, one Paddle backend

One Cloudflare Pages deployment, version selected by hostname in JS
(see `docs/cloudflare-hosting.md`). Every version shares the same
Paddle products/checkout links; a licence key bought on any subdomain
unlocks all of them (key stored in a `.deletedproof.com` cookie set
from `app.deletedproof.com/account`).

| Subdomain | Audience | Shows | Hides / changes |
|---|---|---|---|
| `deletedproof.com` | Everyone (marketing + free search) | Hero, live free search (counts + dates), pricing, trust page | Batch, evidence pack (paywalled) |
| `app.deletedproof.com` | Paying users / CLI users | Full console: broad find, batch, exports, licence entry | Marketing hero, dating-specific copy |
| `verify.deletedproof.com` | Daters / catfish checkers | One-handle verify flow, old bios/handles, Lens/TinEye outbound links, "what this does/doesn't prove" box | Batch, multi-handle, legal/jargon copy, any monitoring language |
| `osint.deletedproof.com` | Researchers / journalists / investigators | Batch, deleted-only diff, evidence pack, date ranges, CLI download | Dating copy, consumer pricing emphasis |
| `legal.deletedproof.com` | Lawyers / paralegals / triage | Evidence pack, citation format, replay links, "triage, not court-ready" disclaimer | Dating copy, consumer funnel |

Shared checkout: one Paddle account, one product per tier (not per
subdomain). `?checkout=paddle|stripe|gumroad|email` and
`?ab=paddle-stripe` overrides work identically on every subdomain.

## 3. Pricing — 4 tiers, options-based, beats the subscriptions

Design rule: one-time packs (buy once, keep forever) + optional
credit top-ups. Free tier shows counts/dates but paywalls full export
(the honest funnel — mirrors Social Catfish / Deleted Tweet Finder).

| Tier | Price | Caps (exact) | What unlocks |
|---|---|---|---|
| **Free** | $0 forever | 3 searches/mo; counts + dates + first 10 rows visible; 1 CSV export/mo; max 100 captures/search | Try it, self-check your own handle |
| **Starter** | **$19 one-time** | Unlimited single-handle searches; deleted-only diff; max 500 captures/search; CSV + JSON export; 25 replay-text fetches/search; 1 seat | The dating/catfish impulse buy |
| **Pro** | **$29 one-time** | Everything in Starter; batch up to 25 handles/run; max 2,000 captures/search; all exports (CSV/JSON/JSONL/HTML); 100 text fetches/search; keyword search over fetched captures; archive.today/Ghostarchive fallback links | The journalist / researcher workhorse |
| **Studio** | **$99 one-time** | Everything in Pro; batch up to 250 handles/run; unlimited captures; unlimited text fetch (fair use); full evidence pack (HTML + hash + replay links); 5 seats; priority support; commercial use | OSINT / legal triage / newsroom |
| **Credit top-up** (optional) | $15 per 500 text-fetch credits | Adds to any paid tier, never expires | For Starter/Pro users who hit fetch caps |

### The math vs competitors (Paddle net = price × 0.95 − $0.50; Stripe net = price × 0.971 − $0.30)

| Tier | Price | Paddle keeps | Stripe keeps |
|---|---|---|---|
| Free | $0 | — | — |
| Starter | $19 | **$17.55** | $18.15 |
| Pro | $29 | **$27.05** | $27.86 |
| Studio | $99 | **$93.55** | $95.83 |
| Top-up | $15 | **$13.75** | $14.27 |

**Why this beats them (say this on the pricing page):**
- Social Catfish: $5.73 trial then $27.48/mo = **$33.21 first month,
  $329.76/year**. Starter ($19 once) is 43% cheaper than their *first
  month* and 94% cheaper than a year — for the one question archives
  answer that they can't (deleted posts with dates).
- Spokeo $19.95/mo = $239.40/yr. Pro ($29 once) is 88% cheaper than
  a year of Spokeo and only $9 more than *one month*.
- Hunchly $169/yr. Studio ($99 once) is 41% cheaper in year 1 and
  free every year after — Hunchly also can't retrieve anything
  already deleted.
- Page Vault $199–349 *per capture*. Studio ($99) costs less than
  half of one Page Vault capture, for unlimited captures.
- Brand24 $199/mo = $2,388/yr. Pro is a historical add-on at 1.2%
  of that.

**Launch recommendation:** ship Free / Starter $19 / Pro $29 /
Studio $99 exactly as above. Do **not** launch with a subscription —
the one-time price *is* the differentiator. Test later (A/B via
`?ab=`): Starter $19 vs $24, Pro $29 vs $39 — but only after the
deleted-diff ships, since that feature is what justifies any increase.

## 4. SEO + how to win

### Keyword targets

Primary (high intent, winnable — the incumbents are subscriptions or
single-network): `find deleted tweets`, `find deleted instagram posts`,
`deleted tweet finder`, `search deleted posts`, `wayback machine social
media search`, `find old deleted tweets`, `check deleted posts`.
Long-tail (blog + landing pages): `how to find deleted tweets from
[year]`, `how to see deleted instagram posts without following`,
`find deleted reddit posts by username`, `did [handle] delete tweets`,
`verify dating profile username`, `is [handle] a catfish check`,
`find deleted tiktok videos`, `deleted facebook posts archive`,
`username search across social media`, `how to prove a tweet existed`.

### Site structure (one Page per intent — this is how you rank)

| URL | Title (≤60 chars) | Meta description |
|---|---|---|
| `/` | DeletedProof — Find deleted posts, prove they existed | Search the Wayback archive across 14 networks. One handle, every deleted post with its date and replay link. Free preview, buy once. |
| `/verify/` | Verify a dating profile — check their deleted posts | Before you meet or send money, check what the archive holds on a username. Public posts only, no face search, no monitoring. |
| `/deleted-tweets/` | Find deleted tweets — DeletedProof | Search archived X/Twitter posts by handle and date range. Deleted-only diff, CSV export, replay links. |
| `/deleted-instagram-posts/` | Find deleted Instagram posts | Archived Instagram posts by handle, with capture dates and honest coverage notes. |
| `/osint/` | Deleted-post search for OSINT & journalists | Batch 14-network archive search, deleted-only diff, evidence pack export. One-time $99 Studio. |
| `/legal/` | Deleted social posts as evidence — triage tool | Locate archived posts for a matter, export citable replay links. Triage, not court-ready evidence. |
| `/pricing/` | Pricing — buy once, keep it forever | Free preview. Starter $19, Pro $29, Studio $99 — one-time, no subscription. |
| `/trust-and-safety/` | What DeletedProof does and doesn't do | Public archived posts only. No DMs, no location, no monitoring, no face recognition, no verdicts. |
| `/how-it-works/` | How archive search works | CDX explained in plain English: what the Wayback Machine holds, what it misses, and why. |
| `/faq/` | FAQ | Caps, refunds, coverage per network, licence terms. |

### Content plan — first 10 pages/posts

1. "How to find a deleted tweet (4 methods, ranked)" — target
   `find deleted tweets`; honest comparison incl. Wayback manual method.
2. "How to find deleted Instagram posts" — coverage honesty is the hook.
3. "I checked my own handle — what the archive knows about you" —
   self-check lead magnet, zero third-party risk.
4. "Deleted vs never posted: what 'not found' actually means."
5. "How journalists prove a deleted post existed" — citation format,
   replay links, evidence pack.
6. "How to verify a dating profile before you meet" — safety framing,
   no face search, no verdicts.
7. "X/Twitter's API now costs $0.005/post — why archives are what's left"
   — the snscrape/Twint death story.
8. "Wayback vs archive.today vs Ghostarchive — which archive has it?"
9. "What the archive holds per network (X good, TikTok patchy, stories absent)"
   — the honest coverage table; builds trust + backlinks.
10. Launch post: "DeletedProof — one handle, 14 networks, deleted-only
    diff" (Product Hunt + Hacker News same day).

### Backlink / launch plan

- **GitHub first:** rename repo to DeletedProof, great README with the
  coverage table + live demo GIF; pin the repo; the CLI is the free
  marketing engine (every `pip install deletedproof` is distribution).
- **Product Hunt launch** (Tuesday–Thursday, 00:01 PT) + **Hacker News
  "Show HN"** same week — lead with the free search, not the paywall.
- **OSINT/journalism communities:** r/OSINT, r/Journalism, Bellingcat
  Discord, Henk van Ess's Digital Digging audience (he built Deleted
  Tweet Finder — pitch the multi-network angle), SANS OSINT Summit
  community. Never spam; answer real "how do I find a deleted post?"
  questions with the free tool.
- **Dating-safety angle:** guest posts / quotes for dating-safety and
  romance-scam prevention blogs and subreddits (r/dating, r/catfish) —
  safety framing only, never "catch a cheater".
- **Directories:** AlternativeTo (list vs waybacktweets, Hunchly),
  Product Hunt, BetaList, startup directories, "OSINT tools" listicles.

### The 5 gaps that win (prioritised — build in this order)

1. **Deleted-only diff** — one handle → 14 networks → which captured
   posts are gone from the live platform. The single most valuable
   output; no free tool does it across networks. Ship first.
2. **Replay text fetch** — fetch post text from the `id_` replay, not
   just CDX rows. Cap per tier; label blank-shell networks honestly.
3. **Evidence pack export** — CSV/JSONL + HTML pack, every row linked
   to its replay with capture timestamp. This is what justifies $99.
4. **archive.today / Ghostarchive fallback links** per result — one
   click checks the archives that cover what Wayback misses. Cheap,
   visibly more complete.
5. **Trust & safety page + in-product guardrails** — public-archives-only
   pledge, FCRA disclaimer (not a consumer report, not for hiring/
   credit/housing), "not found ≠ not real / found ≠ guilty" on every
   report, no-monitoring / no-minors / no-face-recognition rules,
   takedown + report-abuse route, local-first privacy statement.
   This is what lets the dating market be served without the product
   becoming stalkerware.

## 5. Live smoke test (26 Nov 2026, real CDX)

`find clumsysmurf --networks x --limit 2` → **2 captures** on X,
saved to `x_clumsysmurf_20261126185409.json`. `find johnmakesapps
--networks x` → **0 captures** — the honest "0 found" case the UI
must explain ("not captured" ≠ "never posted" ≠ "no account").
Both usernames are John's; use them in the demo, not a stranger's.

## 6. What still needs a human (not done here)

- Buy deletedproof.com (+ .app/.io) — ~$10–15/yr each at Cloudflare
  Registrar; re-run the RDAP check at purchase time, then register
  the GitHub org `deletedproof` and reserve the PyPI name
  (`pip install deletedproof` placeholder) before announcing.
- USPTO TESS clearance for "DeletedProof" (or counsel).
- Counsel on IA Terms (2014) commercial CDX use — before launch copy
  claims compliance.
- Approve this plan → then rename in code (`config.js`, README,
  `pyproject.toml`, web copy) and push the repo (blocked on the
  GitHub App install — see parent agent).
- Re-verify all competitor prices at launch; they move fast.
