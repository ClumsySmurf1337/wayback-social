# Paddle webhook → licence minting → D1 → Resend email

**Status:** built + tested locally 2026-11-26 (GitHub issue #4).
**Not yet live:** no Paddle account, no Resend key, and the private
key is not yet a Pages secret — see §5 for the exact human steps.
Nothing here moves money or creates accounts.

## 1. Architecture (one picture)

```
Buyer clicks Buy (Paddle checkout link, web/config.js)
  -> Paddle charges (merchant of record, tax/VAT handled)
  -> POST /api/paddle-webhook  (functions/api/paddle-webhook.js)
       1. verify Paddle-Signature (HMAC-SHA256 over "ts:rawBody")
       2. transaction.completed: price_id -> tier (PADDLE_PRICE_IDS)
       3. mint DP2 licence key (Ed25519, Node crypto)
       4. INSERT licences row in D1 (hash only, never the full key)
       5. INSERT webhook_events row (idempotency)
       6. Resend email: the key + a "verify it" link
  -> buyer pastes the key in the licence box (web) or --licence (CLI)
  -> offline verify with the baked-in PUBLIC key (no server round-trip)
  -> POST /api/licence-check re-verifies + checks D1 for revocation
```

Files:

| File | What it does |
|---|---|
| `functions/api/paddle-webhook.js` | The webhook: signature, price mapping, mint, D1, Resend, refunds |
| `functions/api/licence-check.js` | Server-side verify + D1 revocation/usage lookup |
| `functions/_lib/dp2.js` | Shared Node crypto: mint/verify DP2, key hash (no deps) |
| `wayback_social/ed25519.py` | Pure-Python Ed25519 verify (+ test-only sign), stdlib only |
| `wayback_social/licence2.py` | DP2 keys in the CLI: parse/verify, baked-in public key |
| `web/licence.js` | DP2 verify in the browser (WebCrypto Ed25519) |
| `migrations/0001_licences.sql` | D1 schema: `licences` + `webhook_events` (applied) |
| `scripts/gen_licence_keys.mjs` | Generate/rotate the Ed25519 keypair |
| `tests/test_paddle_webhook.mjs` + `.py` | Node suite (7 tests) + Python cross-check |
| `tests/test_ed25519.py`, `tests/test_licence2.py` | RFC 8032 vectors, DP2 round trips |

## 2. The DP2 key format

`DP2-<TIER>-<16 random base32>-<86 base64url Ed25519 signature>`

The signature is over the bytes `DP2:<TIER>:<RANDOM>`. The base64url
signature alphabet includes `-`, so parsers must split the key with
maxsplit=3 (the signature is always last and may contain dashes) —
the first version of this bug split on every `-` and produced 7 parts.

DP1 (`licence.py`, HMAC) still works for dev/demo and is untouched.
`resolve_plan` tries DP2 first (no secret needed), then DP1.

**Keypair (generated 2026-11-26, rotated 2026-11-27, `scripts/gen_licence_keys.mjs`):**

- Public key (SPKI DER base64, safe to commit — it verifies, it
  cannot mint): `MCowBQYDK2VwAyEARKv2d0s14DXxgqIm4SbtMN1uUmK/+4CHVF5SaCe89Vs=`
- Baked into `wayback_social/licence2.py` (`PUBLIC_KEY_B64`),
  `web/licence.js` (`DP2_PUBLIC_KEY_JWK`), and
  `functions/api/licence-check.js` (via env var, see §5).
- **Rotation 2026-11-27:** the first keypair's private key was lost —
  its single copy lived in `/tmp/keygen.txt` and the VM rebooted
  (2026-11-27 00:56 UTC), wiping `/tmp`. No licence was ever minted
  with the old pair (no Paddle account, secret never set), so the
  rotation has zero blast radius — the old public key is retired, not
  kept alongside. Lesson: never keep a sole secret copy in `/tmp`;
  the new private key lives in `.licence-keygen.txt` (chmod 600,
  gitignored, `*.pem` in `.gitignore`) until it is set as the
  Pages secret `LICENCE_ED25519_PRIVATE_KEY` — then shred that file.
  Never paste the private key in chat, files, or GitHub.

## 3. Paddle details (verified against Paddle's docs, 2026-11-26)

- **Signature:** Paddle Billing sends `Paddle-Signature:
  ts=<unix>;h1=<hex>`. Verify with HMAC-SHA256 over the string
  `ts:rawBody`, keyed with the notification-destination secret
  (`pdl_ntfset_...`). Compare with `timingSafeEqual`; reject
  timestamps older than 300s (replay protection). The plan doc's
  earlier claim of "RSA" was wrong — Paddle Billing is HMAC; RSA
  belongs to Paddle Classic, which we do not use. Both the live and
  sandbox secrets are tried (env `PADDLE_WEBHOOK_SECRET` and
  `PADDLE_WEBHOOK_SECRET_SANDBOX`).
- **Events handled:** `transaction.completed` (mint + email),
  `transaction.refunded` and `adjustment.created` with
  `action=refund` (revoke in D1). Everything else: 200 + ignored.
- **Price → tier:** env `PADDLE_PRICE_IDS`, JSON like
  `{"pri_01j...": "starter", "pri_01k...": "pro",
  "pri_01l...": "studio", "pri_01m...": "bundle"}`. Bundle maps to
  `studio` (bundle caps are Studio-level). An unmapped price_id
  returns 500 so Paddle retries while the mapping is fixed — never
  silently drops a sale.
- **Buyer email:** `custom_data.email` first, then
  `data.customer.email` / `data.billing_details.email`, then the
  Paddle API `GET /customers/{customer_id}` with `PADDLE_API_KEY`.
  If no email is found anywhere, the webhook returns 500 (Paddle
  retries) rather than minting a key nobody can receive.
- **Idempotency:** `webhook_events.event_id` is checked first; the
  `licences.paddle_transaction_id` UNIQUE column is the second
  guard. A duplicate delivery returns 200 without re-minting or
  re-emailing. **Correction (2026-11-26):** the earlier claim that
  "a retry after a failed email re-sends the same key" was wrong.
  The full key is never stored (only its SHA-256 hash), so a retry
  cannot re-send it — the duplicate path returns before the email
  step. A failed email needs a manual re-issue (new key), see
  docs/email-setup.md §5.
- **Email (Resend):** `POST https://api.resend.com/emails`,
  `Authorization: Bearer $RESEND_API_KEY`, `from` from `RESEND_FROM`
  (production: an address on a domain verified in Resend; unset
  falls back to the sandbox sender `ArchiveCheck
  <onboarding@resend.dev>`, which delivers only to the Resend
  account owner's email). The email contains the key, the tier,
  the caps line, a "Verify my key" link
  (`$APP_URL/dashboard.html`), and the "reply if you lose it"
  line. **Email never blocks the purchase:** a missing key or a
  Resend 4xx/5xx returns 200 with `email_sent: false` +
  `email_error`, logged, licence row stays active. Resend free
  tier: 100 emails/day, 3,000/mo — the first paid wall on a big
  launch day. Full comparison + setup: docs/email-setup.md.
- **Paddle wants 200 within 5 seconds.** The Function answers fast
  and never throws; every error path returns a JSON error (401 bad
  signature, 400 bad JSON, 500 config/DB/email failure so Paddle
  retries).

## 4. D1 licence store (live)

Database `wayback-social-licences`, uuid
`38a206cb-5256-4ff0-b8b7-d5a06c2d4d22`, created 2026-11-26 via the
Cloudflare API. Schema `migrations/0001_licences.sql` is applied
(tables `licences`, `webhook_events` verified by a live query).
Bound in `wrangler.toml` as `DB`. The wrangler.toml also sets
`compatibility_flags = ["nodejs_compat"]` (the Functions import
`node:crypto`).

`licences` stores: `key_prefix` (first 24 chars, for support
lookup), `key_hash` (SHA-256 of the full key — the key itself is
never stored), `scheme` (DP2), `tier`, `email`,
`paddle_transaction_id` (UNIQUE), `paddle_customer_id`,
`paddle_price_id`, `seats`, `reports_used`, `status`
(active/revoked/refunded), `created_at`, `revoked_at`. The join
with the Clerk `users` table (issue #6) is the key hash.

D1 free tier: 5M rows read/day, 100k written/day, 5 GB. Licence
lookups are one indexed row read each — the cap binds only on a
huge launch spike.

## 5. Human steps to go live (in order)

1. **Paddle account** (https://www.paddle.com — vendor signup;
   sandbox is a separate account at sandbox-vendors.paddle.com).
   Create one product per tier (Starter / Pro Pack / Studio /
   All-in Bundle + $15 top-up) with the launch prices from
   `pricing.yaml` (Starter $9, Pro $19, Studio $49, Bundle $59).
   Copy each price ID (`pri_...`).
2. **Webhook destination:** Paddle Dashboard → Developer Tools →
   Notifications → create a destination pointing at
   `https://<your-pages-domain>/api/paddle-webhook`, subscribe to
   `transaction.completed`, `transaction.refunded`,
   `adjustment.created`. Copy the destination secret
   (`pdl_ntfset_...`). Sandbox first, then live (separate secrets).
3. **Resend account** — full comparison, setup steps, sandbox
   limits and the re-issue procedure: docs/email-setup.md.
   Short version: create the account at https://resend.com,
   make a Sending-access API key, verify a sender domain
   (until then `onboarding@resend.dev` only delivers to the
   account owner's email), set `RESEND_API_KEY` + `RESEND_FROM`
   as Pages secrets.
4. **Set the Pages secrets** (dashboard: Workers & Pages →
   deletedproof → Settings → Variables and Secrets, or wrangler):
   ```
   npx wrangler pages secret put LICENCE_ED25519_PRIVATE_KEY --project-name deletedproof
   # paste the PEM from .licence-keygen.txt (read it, paste it, then shred the file)
   npx wrangler pages secret put LICENCE_ED25519_PUBLIC_KEY --project-name deletedproof
   # value: MCowBQYDK2VwAyEARKv2d0s14DXxgqIm4SbtMN1uUmK/+4CHVF5SaCe89Vs=
   npx wrangler pages secret put PADDLE_WEBHOOK_SECRET --project-name deletedproof
   npx wrangler pages secret put PADDLE_WEBHOOK_SECRET_SANDBOX --project-name deletedproof
   npx wrangler pages secret put PADDLE_API_KEY --project-name deletedproof
   npx wrangler pages secret put PADDLE_PRICE_IDS --project-name deletedproof
   # value: {"pri_...": "starter", "pri_...": "pro", "pri_...": "studio", "pri_...": "studio"}
   npx wrangler pages secret put RESEND_API_KEY --project-name deletedproof
   npx wrangler pages secret put RESEND_FROM --project-name deletedproof
   # value: ArchiveCheck <licences@deletedproof.northforgelabs.dev>
   ```
   NOTE: setting a Pages secret via the Cloudflare REST API was
   attempted and failed (PUT/POST to `/pages/projects/.../secrets`
   both return 405) — wrangler or the dashboard is the working path.
   `PADDLE_PRICE_IDS` and `RESEND_FROM` are plain env vars, not
   secrets, but setting them as secrets is harmless.
5. **Paste the real checkout links** into `web/config.js`
   (replace the `REPLACE_PADDLE_*` placeholders, issue #3) and push.
6. **Sandbox test purchase ($1):** buy the cheapest pack in the
   Paddle sandbox on `app.deletedproof.northforgelabs.dev`, confirm
   the licence email arrives, paste the key in the licence box,
   confirm the tier badge + caps unlock, then check D1:
   `SELECT key_prefix, tier, status FROM licences;`
7. **Then go live** with the live destination secret + live price IDs.

## 6. Key rotation

1. `node scripts/gen_licence_keys.mjs` → new pair.
2. Update the public key in `wayback_social/licence2.py`
   (`PUBLIC_KEY_B64`), `web/licence.js` (`DP2_PUBLIC_KEY_JWK`),
   and the `LICENCE_ED25519_PUBLIC_KEY` secret.
3. Update the `LICENCE_ED25519_PRIVATE_KEY` secret.
4. Redeploy. Keys minted with the OLD key keep verifying only if
   the old public key is kept alongside — today there is no
   multi-key support, so rotation invalidates unredeemed old keys:
   rotate only before launch, or re-issue affected buyers' keys
   from D1 (email is stored per licence).

## 7. Test evidence (2026-11-26, local)

- `node --test tests/test_paddle_webhook.mjs`: **10/10 pass** —
  signature valid/wrong/stale; transaction.completed mints a DP2
  key, writes the D1 row, emails the key (Resend stub captured the
  HTML + text bodies, incl. the caps line and lost-key line);
  duplicate event and duplicate transaction never mint twice (1
  licence, 1 email); **no RESEND_API_KEY → 200, email_sent:false,
  licence row active, no Resend call; Resend 429 → 200,
  email_sent:false, email_error mentions 429, licence row active**;
  bundle → studio; unmapped price → 500; bad signature → 401;
  refund → revoked, and `/api/licence-check` reports `valid:false,
  status:revoked`; licence-check on an active key, a DP1 key
  (refused), and a valid signature with no D1 row (valid, status
  unknown); web `licence.js` verifies DP2 via WebCrypto Ed25519
  (Node's subtle crypto — Chrome 137+ / Safari 17+ in browsers).
- Python cross-check (`tests/test_paddle_webhook.py`): the key the
  Node harness minted verifies with the pure-Python Ed25519 code —
  server mint and CLI verify agree.
- `pytest tests/test_ed25519.py tests/test_licence2.py
  tests/test_licence.py tests/test_web_tiers.py`: **38 passed**.
  Full suite (2026-11-26, after the email track): **141 passed,
  1 skipped**.
- Live D1 smoke test (Cloudflare API): INSERT a test licence row →
  SELECT reads it back → DELETE → 0 rows remain. Real database,
  real schema.
- NOT yet verified live: the Function on Cloudflare (needs the push
  + secrets), a real Paddle sandbox purchase, a real Resend email.
  Those are steps 6–7 above.
