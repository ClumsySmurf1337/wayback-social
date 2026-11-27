# Free email for licence delivery — Resend (chosen 2026-11-26)

**Winner: Resend.** One line on the name confusion first:
**Resend** is a transactional-email API (send mail from code);
**Recraft** is an AI image-generation tool — a different product
entirely, not email. The user said "recraft or resend"; the email
read is Resend.

Status: wired in `functions/api/paddle-webhook.js` (licence email
after every `transaction.completed`), tested locally 10/10 node
tests. No account exists yet, no key, no domain verified — §4 is
the exact human steps. Nothing here creates an account or moves
money.

## 1. Free-tier comparison (checked live 2026-11-26)

All figures read from the vendors' own pricing/docs pages (or
their FAQ) on 2026-11-26, except where a secondary source is
named. Prices change — re-check before committing.

| | Resend ✅ | Mailgun | SendGrid (Twilio) | Amazon SES |
|---|---|---|---|---|
| Free allowance | 3,000/mo, **100/day** | 100/day (~3,000/mo) | 100/day for **60 days only** | 3,000/mo free, first 12 months* |
| Permanent free? | **Yes — free-forever plan** (resend.com/pricing FAQ: "we provide a free-forever plan") | Yes, permanent | **No** — permanent free plan retired July 2025; now a 60-day trial, then sending stops unless you upgrade | Free tier is 12 months, then pay-as-you-go |
| Credit card to start free? | No | No — **but** without a card, sending is limited to the sandbox domain + 5 verified addresses; a card unlocks the custom domain | No (trial) | **Yes** — AWS account + card on file, plus IAM setup |
| Sandbox sender without a verified domain? | Yes: `onboarding@resend.dev`, delivers **only to the Resend account owner's email** (403 for anyone else — resend.com/docs/knowledge-base/403-error-resend-dev-domain) | Sandbox domain + 5 verified addresses only (no card) | Trial account, no domain needed for the trial | Sandbox: 200 msgs/24h, 1/sec, verified recipients only |
| What happens past the free limit? | Sends fail (429) until the UTC day / month resets. **No overage, never bills you** on Free (pay-as-you-go is paid plans only) | No overage on Free; upgrade to Basic to lift the daily cap | Trial ends → sending stops until you upgrade | Pay-as-you-go $0.10–0.16/1,000 after the free tier |
| Cheapest paid step | Pro $20/mo — 50,000 emails, no daily limit | Basic $15/mo — 10,000 emails | Essentials $19.95/mo — 50,000 emails | ~$0.10/1,000 (no monthly fee on a-la-carte) |
| Integration shape | One HTTP POST, Bearer key. No SDK needed — works from a Cloudflare Pages Function as-is | REST API or SMTP | REST API or SMTP | AWS SDK / SigV4 signing or SMTP — no plain API-key HTTP call |
| Verdict | **Best fit.** Permanent, no card, biggest honest free monthly quota, simplest wiring, already the plan in docs/paddle-webhook.md | Loser: free without a card cannot email licence keys to real buyers (5 verified addresses only) | Loser: the free tier expires after 60 days, then $19.95/mo or silence | Loser for this job: cheapest at volume, but needs an AWS account, a card, and a manual production-access request to escape the sandbox; overkill for ~1 email per sale |

\* SES free-tier note: the AWS FAQ (aws.amazon.com/ses/faqs,
crawled 2026-11-26) still states "up to 3,000 message charges for
free each month for the first 12 months". One secondary source
(hivebook.wiki, Aug 2026) claims the intro tier was replaced by
$200 in AWS credits. The discrepancy does not change the verdict:
SES loses on setup, not on price.

Sources:
- Resend pricing: https://resend.com/pricing (crawled 2026-11-27
  00:25 UTC) — Free $0, 3,000/mo, 100/day, 3 domains, 3 inboxes,
  30-day retention; Pro $20/50,000; FAQ: free-forever, no trial.
- Resend sandbox sender: https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
- Mailgun pricing: https://www.mailgun.com/pricing (checked
  Oct–Nov 2026 by multiple trackers) — Free 100/day, 1 domain,
  1-day logs; no-card sends limited to sandbox domain + 5
  verified addresses; Basic $15/10,000.
- SendGrid pricing: https://www.twilio.com/en-us/pricing/email-api
  (checked Oct–Nov 2026) — free plan retired 2025, 60-day trial
  100/day, Essentials $19.95/50,000.
- Amazon SES FAQ/pricing: https://aws.amazon.com/ses/faqs/ and
  https://aws.amazon.com/ses/pricing/ — sandbox 200/24h,
  verified recipients only; 3,000/mo free 12 months; $0.10/1,000
  a-la-carte (Essentials plan $0.16/1,000 is the new default).

### Why Resend wins for licence keys specifically
- Volume fits with huge headroom: one email per sale. Even a
  100-sale launch day is exactly the daily cap; a normal day is
  a handful. The first paid wall is 100 sales in one UTC day —
  at that point $20/mo for 50,000 is a rounding error against
  revenue.
- The wiring already exists and is one HTTP call — no SDK, no
  SMTP handshake, no signing.
- No card, no trial clock, no sandbox-recipient trap for the
  *account setup* itself. The one trap is the sender domain
  (§3) — and it is explicit, not hidden.

## 2. What is wired now

`functions/api/paddle-webhook.js` → `sendLicenceEmail()`:

- After `transaction.completed` mints the DP2 key and stores its
  hash in D1, the webhook POSTs to `https://api.resend.com/emails`
  with `Authorization: Bearer $RESEND_API_KEY`.
- The email contains: the key, the tier, **what the pack
  unlocks in one line** (caps from `pricing.yaml` /
  `wayback_social/plans.py` — Starter 250 captures/search, 7
  networks; Pro 2,500 captures, all 14 networks; Studio 25,000
  captures, 10 evidence reports, 5 seats), a "Verify my key"
  button linking to `$APP_URL/dashboard.html`, and the
  "If you lose it, reply to this email" line.
- **Email never blocks the purchase.** If `RESEND_API_KEY` is
  not set, or Resend returns 4xx/5xx, the webhook still returns
  200, the licence row stays `active`, and the response carries
  `email_sent: false` + `email_error`. The failure is logged
  (`console.warn` in the Function logs) — nothing is silently
  dropped, and Paddle is not asked to retry a delivery that
  cannot succeed.
- **Why no retry:** the full key is never stored — only its
  SHA-256 hash. A Paddle retry after a failed email finds the
  existing licence row and returns `duplicate: true` without
  re-sending, because there is nothing to re-send. A failed
  email therefore needs a manual re-issue (§5), not a retry.
  (The old docs/paddle-webhook.md claim "a retry after a failed
  email re-sends the same key" was wrong and is corrected.)
- Sender: `RESEND_FROM` env. If unset, the fallback is the
  Resend sandbox sender `ArchiveCheck <onboarding@resend.dev>`
  — **labelled sandbox in code**: it delivers only to the
  Resend account owner's email. It exists so a sandbox
  purchase still sends to the owner; it cannot reach real
  buyers. Production MUST set `RESEND_FROM` to an address on a
  verified domain (§4 step 3).

## 3. Free-tier limits to respect in production

- **100 emails/day (UTC day), 3,000/month.** The 101st send in
  a day gets a 429 and fails — the webhook logs it and the
  buyer is re-issued manually (§5). At >100 sales/day, upgrade
  to Pro ($20/mo, 50,000, no daily cap) — do not queue and
  retry blindly; a licence email delayed past the buyer's
  patience is a support ticket either way.
- **3 sending domains, 30-day data retention, 1 webhook
  endpoint** on Free. Enough for one brand.
- **Inbound replies count against the quota** (each received
  email counts as one). The "reply to this email if you lose
  your key" line means lost-key replies consume quota — at
  this volume, negligible.
- **Deliverability:** shared IPs on Free. Licence emails are
  plain text+HTML, no attachments, no marketing language —
  the lowest-risk shape for spam filters. Verify the sending
  domain (SPF/DKIM in §4) before going live; an unverified
  domain is the #1 reason licence mail lands in spam or
  bounces.

## 4. Exact human steps (John — nothing here is done yet)

1. **Create the Resend account** — https://resend.com/signup.
   Sign up with the email that should receive test mail
   (the sandbox sender only delivers to this address). No
   credit card is required for the Free plan.
2. **Create an API key** — Resend dashboard → API Keys →
   Create API key → Permission: **Sending access** (not Full
   access), optionally restricted to your sending domain once
   it exists. Copy the key (`re_...`). It is shown once.
3. **Verify a sending domain (production)** — Resend dashboard
   → Domains → Add Domain → enter the domain (e.g.
   `deletedproof.northforgelabs.dev` — owned; canonical option b,
   2026-11-27). Add the DNS records Resend shows at your registrar (SPF / DKIM — copy
   exactly what the dashboard shows; newer domains may get
   CNAME records instead of TXT). Wait until the domain shows
   **Verified**. Until this is done, real buyers cannot
   receive mail — the sandbox sender refuses anyone but the
   account owner with a 403.
4. **Set the Pages secrets** (dashboard: Workers & Pages →
   deletedproof → Settings → Variables and Secrets, or
   wrangler — the REST API returns 405 for Pages secrets,
   use wrangler or the dashboard):
   ```
   npx wrangler pages secret put RESEND_API_KEY --project-name deletedproof
   # paste the re_... key from step 2
   npx wrangler pages secret put RESEND_FROM --project-name deletedproof
   # value: ArchiveCheck <licences@deletedproof.northforgelabs.dev>
   # (use the verified domain from step 3; until then leave
   #  RESEND_FROM unset and the sandbox sender is used)
   ```
   `RESEND_FROM` is a plain env var, not a secret, but
   setting it as a secret is harmless.
5. **Sandbox test purchase ($1)** — buy the cheapest pack in
   the Paddle sandbox on `app.deletedproof.northforgelabs.dev`
   with **your own email** (the Resend account email if the
   domain is not verified yet, otherwise any address).
   Confirm: the licence email arrives; the key in it is a
   `DP2-<TIER>-...` key; pasting it in the licence box flips
   the tier badge + caps; D1 has the row:
   `SELECT key_prefix, tier, status FROM licences;`
   Check the Function logs for the send (`email_sent: true`,
   Resend id `re_...`).
6. **Then go live** with the live Paddle destination + live
   price IDs (docs/paddle-webhook.md §5). Re-run step 5 with
   a real $1 purchase and confirm the email arrives from the
   verified domain.

## 5. If an email fails (re-issue procedure)

Symptoms: Function logs show `email NOT sent: ...`, or a buyer
says the key never arrived. The licence row in D1 is still
`active` — the purchase is not lost, only the delivery.

1. Find the row: `SELECT key_prefix, tier, email FROM licences
   WHERE email = '<buyer email>';`
2. The original key cannot be recovered (only its hash is
   stored). Mint a **new** DP2 key for the same tier with the
   production private key — Node one-liner from the repo root
   (the key is never printed to a shared log; send it straight
   to the buyer):
   ```
   node -e "import('./functions/_lib/dp2.js').then(async m => {
     const fs = await import('node:fs');
     const pem = fs.readFileSync(process.env.HOME + '/.secrets/licence-private.pem', 'utf8');
     console.log(m.mintKey('pro', pem)); })"
   ```
   (Put the PEM in a 0600 file first; never paste it in chat.
   Replace `'pro'` with the buyer's tier.)
3. Update the D1 row with the new key's hash + prefix, or
   insert a fresh row for the same transaction (keep the old
   row's `status` — a re-issued key supersedes it; note it in
   a support log, not in D1):
   ```
   npx wrangler d1 execute wayback-social-licences --command \
     "UPDATE licences SET key_hash='<sha256 of new key>', key_prefix='<first 24 chars of new key>' WHERE paddle_transaction_id='<txn id>'"
   ```
   The SHA-256 is `node -e "import('./functions/_lib/dp2.js').then(m=>m.keyHash('DP2-...').then(h=>console.log(h)))"`.
4. Email the new key to the buyer from Resend (dashboard →
   Emails → Send, or the same `POST /emails` call) with the
   same subject/body shape as §2.
5. Fix the cause before the next sale: no key → step 4 of §4;
   429 → daily cap hit, wait for UTC midnight or upgrade to
   Pro; 403 → `RESEND_FROM` is the sandbox sender or an
   unverified domain, do §4 step 3.

**Follow-up (not built):** a `licence reissue` CLI/Function
command that does steps 2–4 in one call, and an `email_sent`
column on `licences` so failed deliveries are visible in D1
instead of only in Function logs. Both are small; neither
blocks launch.
