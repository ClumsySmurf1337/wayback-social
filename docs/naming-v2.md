# Naming v2 — a better name than DeletedProof

**Date:** 2026-11-26. **Status:** recommendation for John's approval — no code,
config, repo, or domain changed. **Supersedes:** `docs/branding-seo-plan.md`
§1 (DeletedProof), which stays as the v1 record. **Why v2:** John says
DeletedProof is too narrow — the name must be searchable and instantly
understood across ALL uses (catfish/dating, relationship trust, journalists,
OSINT, legal triage, brand, hiring), not just deleted posts.

## 1. Brainstorm — 14 candidates (before checking)

Search words people actually type: deleted, archive, proof, check, verify,
find, history, posts, social, truth, trace, uncover, past, handle.

| # | Name | Idea | Killed / kept, and why |
|---|---|---|---|
| 1 | PostTrace | "Trace their posts" — active verb, all markets | SHORTLIST |
| 2 | HandleCheck | "Check a handle" — the catfish verb | SHORTLIST |
| 3 | SocialTrace | "Trace them across social" | SHORTLIST |
| 4 | PastProof | "Proof from the past" | SHORTLIST |
| 5 | ArchiveCheck | "Check the archive" — the action + the source | SHORTLIST |
| 6 | DeletedCheck | Most literal search match ("check deleted posts") | Killed — leads with "deleted", fails the breadth brief; .com taken |
| 7 | PostCheck | Short, plain | Killed — .com + .app taken, 80 GitHub repos, generic |
| 8 | ProfileCheck | "Check a profile" — dating-perfect | Killed — .com taken, .app taken, GitHub user taken |
| 9 | CheckProfile | Same, verb-first | Killed — .com taken, GitHub user taken |
| 10 | PastCheck | "Check the past" | Killed — .com taken (GitHub/PyPI free, 0 repos) |
| 11 | HandleTrace | "Trace a handle" | Killed — .com taken (GitHub/PyPI free, 0 repos) |
| 12 | PostProof | "Proof of a post" | Killed — .com + .app taken; too close to DeletedProof |
| 13 | VerifyProfile | "Verify a profile" | Killed — .com taken; "verify" invites identity-verification regulation |
| 14 | SocialProof | The obvious one | Killed before checking — "social proof" is a huge marketing term; unownable |

## 2. Shortlist — live availability checks, 2026-11-26

Method (same as v1, re-validated): PyPI `pypi.org/pypi/<name>/json`
(404 = free, validated against `requests` = 200); GitHub user/org page
(404 = free) + repo search `api.github.com/search/repositories?q=<name>+in:name`;
domains via RDAP — `rdap.verisign.com` for .com (200 = registered,
404 = free), `rdap.org` (follows to Google registry) for .app/.io.
The VM's DNS resolver is a sinkhole, so no DNS result was used.
Web search per name for an existing product. Verisign RDAP is flaky
from this VM (000 = connection failed, retried until a 200/404 landed).

| Name | PyPI | GitHub user | GitHub repos | .com | .app | .io | Web search — existing product? |
|---|---|---|---|---|---|---|---|
| **ArchiveCheck** | free (404) | free (404) | 5 | **free (404)** | free (404) | free (404) | **None.** Only a `dsh-archive-check` plugin (Chinese filing-register checker, unrelated), a SanctionsKit API schema field (sanctions screening, unrelated), generic "archive tools" |
| PostTrace | free (404) | free (404) | 0 | **taken (200)** | free (404) | free (404) | No product named PostTrace. But "trace" is crowded: SocialTrace (Product Hunt, attribution), Trace (Whop), Tracee, Postcard "trace every post" |
| HandleCheck | free (404) | free (404) | 18 | **taken (200)** | free (404) | free (404) | **Direct collision:** handlecheck.io — brand-name availability checker ($19 report, $49/yr monitoring); handlecheck.online — "trust score" accountability product. Same trust/verification space |
| PastProof | free (404) | free (404) | 1 | **taken (200)** | free (404) | free (404) | No exact product. Near-neighbours: PasteProof (Chrome ext), PatchProof (dev tools), "PAST PROOF" self-help book about retroactive jealousy — bad connotation for a dating-check tool |
| SocialTrace | free (404) | **taken (200)** | 8 | **taken (200)** | **taken (200)** | free (404) | **Direct collision:** SocialTrace on Product Hunt — social-to-revenue attribution tool |

**The decisive fact:** ArchiveCheck is the only shortlisted name with a
free **.com** — every other candidate lost it, and two (HandleCheck,
SocialTrace) also collide with live products in adjacent trust/verification
spaces. DeletedProof (v1) also had a clean .com sweep, but fails the new
brief on searchability/breadth (see §3).

## 3. Scores (1–5) and recommendation

| Name | Searchable | Understood in 2s | Broad | Brandable | Available | Total |
|---|---|---|---|---|---|---|
| **ArchiveCheck** | 4 | 5 | 4 | 4 | 5 | **22** |
| PostTrace | 4 | 4 | 4 | 4 | 2 | 18 |
| HandleCheck | 5 | 5 | 3 | 3 | 1 | 17 |
| SocialTrace | 4 | 4 | 4 | 3 | 1 | 16 |
| PastProof | 2 | 3 | 3 | 3 | 2 | 13 |
| DeletedProof (v1) | 3 | 4 | 2 | 4 | 5 | 18 |

Why ArchiveCheck wins: "archive" is a real word people search
("archive search", "find archived posts", "wayback machine archive"),
and "check" is the action every market already uses ("check their
posts", "check a profile", "check the record"). A dating user gets it
in two seconds — *check what they posted before* — and so does a
journalist, a lawyer's assistant, or a brand manager. It is the only
name that is both ownable (.com + PyPI + GitHub + .app + .io) and
broad: the archive holds deleted posts, old posts, old bios, old
handles — the whole past, not just the deletions. It works as a verb
("run an ArchiveCheck"), a noun ("the ArchiveCheck report"), a CLI
(`archivecheck`), and a PyPI package. Its one weakness — "archive"
sounds dry to a dating user — is fixed by the tagline and the
`verify.` subdomain, which speak dating while the brand stays
trustworthy for everyone.

### Recommendation: **ArchiveCheck** — archivecheck.com

**Tagline:** *"Check the archive before you trust the profile."*
Short alt: *"What they posted. What they deleted. Check the archive."*

**Positioning (one paragraph):** ArchiveCheck finds what people posted
before — and what they deleted since. Type one handle and it searches
the public web archives across 14 networks — X, Instagram, Facebook,
TikTok, YouTube, Reddit and more — and shows you the posts that were
captured, the date each one existed, and whether it is still live.
Checking a date, verifying a profile, researching a story, or building
a case file all start the same way: one handle, one check, one report.
No account, no login, no subscription: buy once, keep it forever.
It proves a post existed on a date. It does not prove who wrote it,
why it was deleted, or what anyone intended — and it says so on every
report. *"Public archived posts only. Found ≠ guilty. Not found ≠ not real."*

**Logo concept:** keep the v1 direction — a document glyph with a
backwards clock face and a checkmark stamped over the fold, "a receipt
from the past" — it fits ArchiveCheck even better than DeletedProof.
Wordmark in a bold grotesque, "Archive" in ink-navy, "Check" in
evidence-green. Favicon: the clock-check mark alone on navy.

**Palette:** unchanged from v1 (it was designed around archive-paper +
evidence, which is this name): ink navy `#0F1E33`, evidence green
`#1F9D63`, paper `#F7F4EC`, alert amber `#E8A13D`, slate `#5A6B7F`,
red `#C0392B` sparingly for deleted states only.

### Backups, in order

1. **PostTrace** — the best *name* (shortest, most active, great verb),
   the worst *domain* (.com taken; would live on posttrace.io/.app).
   Pick it only if John accepts a non-.com primary domain.
2. **DeletedProof** — the v1 winner: clean sweep everywhere, but fails
   this brief (says "deleted" only, "proof" is abstract, weak on
   catfish/OSINT search intent). Keep as the fallback if ArchiveCheck
   fails clearance or the .com is gone at purchase time.

## 4. Winner checks — social handles + trademark (preliminary)

Checked 2026-11-26 by HTTP status on the profile URLs (no accounts
created; a platform's status code is a signal, not proof — handles can
be held, suspended, or unclaimable for other reasons):

| Handle | Result | Read |
|---|---|---|
| X @ArchiveCheck | 404 | Appears free |
| Instagram @archivecheck | 200 | Taken (profile exists) — use @archivecheckapp or @checkthearchive |
| TikTok @archivecheck | 200 | Inconclusive — TikTok returns 200 for missing profiles too; verify in-app |
| YouTube @ArchiveCheck | 404 | Appears free |

**Trademark (preliminary, NOT clearance):** a Justia mirror search for
"archivecheck" on 2026-11-26 returned **zero results** (its "page
number higher than results count" error on an empty set) — no
conflicting federal mark surfaced. TESS was retired Nov 2023; the
USPTO's current system is Trademark Search at tmsearch.uspto.gov.
Before launch: run the name there (exact + "archive check" variants,
class 42 software / class 45 information services), check EUIPO, and
get counsel. The SanctionsKit "ArchiveCheck" schema field and the
`dsh-archive-check` plugin are different fields/products and are not
trademark conflicts on their face, but note them for counsel.

**Also clear:** no "Wayback", no platform names, nothing implying a
consumer-reporting agency or background-check company (no "background
check", "people search", "checkr"-style wording) — the FCRA line from
v1 still holds.

## 5. Subdomain plan under archivecheck.com

Same five hosts as v1, domain swapped. One Cloudflare Pages deployment,
version by hostname in JS, one Paddle backend, licence key in a
`.archivecheck.com` cookie.

| Subdomain | Audience | Shows |
|---|---|---|
| `archivecheck.com` | Everyone (marketing + free search) | Hero, live free search, pricing, trust page |
| `app.archivecheck.com` | Paying users / CLI users | Full console: broad find, batch, exports, licence entry |
| `verify.archivecheck.com` | Daters / catfish checkers | One-handle verify flow, old bios/handles, Lens/TinEye links, "what this does/doesn't prove" box |
| `osint.archivecheck.com` | Researchers / journalists | Batch, deleted-only diff, evidence pack, date ranges, CLI download |
| `legal.archivecheck.com` | Lawyers / paralegals | Evidence pack, citation format, replay links, "triage, not court-ready" disclaimer |

## 6. Rename checklist (do NOT execute yet — approval first)

- [ ] Buy archivecheck.com (+ .app + .io) at Cloudflare Registrar
      (~$10–15/yr each); **re-run the RDAP .com check at purchase time**
- [ ] Register GitHub org `archivecheck`; rename repo
      `wayback-social` → `archivecheck` (GitHub keeps redirects from
      the old name; keep `wayback-social` as an alias in the README)
- [ ] Reserve PyPI name `archivecheck`
- [ ] Cloudflare Pages: create project `archivecheck` (project names
      can't be renamed — new project, same GitHub repo); move the five
      custom domains from `deletedproof.*` to `archivecheck.*`;
      keep the `deletedproof.pages.dev` + northforgelabs.dev test
      deploys until the swap is verified, then redirect them
- [ ] Claim X @ArchiveCheck + YouTube @ArchiveCheck; Instagram/TikTok
      under @archivecheckapp (or @checkthearchive) if @archivecheck is
      really taken
- [ ] Code/config: `web/config.js` (brand strings, canonical URL),
      `web/index.html` (title, meta, JSON-LD, hero copy),
      `pyproject.toml` (name + CLI script), `wayback_social/__init__.py`
      (version note), README, CHANGELOG, `pricing.yaml` (no price
      change — pricing is name-agnostic), `wrangler.toml` (project name)
- [ ] Docs: mark `docs/branding-seo-plan.md` superseded by this doc;
      update `docs/cloudflare-hosting.md` domain references
- [ ] SEO: set canonical to archivecheck.com, 301 the deletedproof.*
      test hosts to archivecheck.com, update sitemap.xml
- [ ] USPTO Trademark Search + EUIPO check, or counsel, before launch

## 7. SEO keyword fit for ArchiveCheck

The brand itself matches: "archive check", "archive search", "check
archived posts", "wayback machine archive search", "find archived
tweets/posts". The landing pages (unchanged from v1 §4) carry the
high-volume phrases the brand doesn't contain: `/deleted-tweets/`
("find deleted tweets"), `/deleted-instagram-posts/`, `/verify/`
("is this a catfish", "verify dating profile", "check deleted posts"),
`/osint/`, `/legal/`. That split is the point: the brand is the
trustworthy umbrella; the pages do the keyword work. "Check" also
matches the rising "check" query family ("check someone's social
media", "check a username") better than "proof" ever did.
