// POST /api/paddle-webhook — Paddle Billing webhook -> licence minting.
// Paddle -> D1 (licences + webhook_events) -> Resend email with the key.
//
// Flow (see docs/storage-auth-plan.md §2c and docs/paddle-webhook.md):
//   1. Verify Paddle-Signature: HMAC-SHA256 over "ts:rawBody" with the
//      notification-destination secret (PADDLE_WEBHOOK_SECRET, or the
//      sandbox one for sandbox events). Paddle Billing, NOT Classic
//      (Classic uses p_signature + RSA — a different scheme).
//   2. transaction.completed -> map price_id -> tier, mint a DP2
//      (Ed25519) licence key, store its hash in D1, email the key.
//      Email NEVER blocks the purchase: the licence is minted and
//      stored first, and an email failure (no RESEND_API_KEY, or
//      Resend 4xx/5xx) returns 200 with email_sent:false + a logged
//      warning. A Paddle retry cannot re-send the key — the full key
//      is never stored, only its SHA-256 hash — so a failed email
//      needs a manual re-issue (new key, see docs/email-setup.md §5).
//   3. transaction.refunded / adjustment.created (refund) -> revoke.
//   4. Idempotent: event_id in webhook_events + UNIQUE
//      paddle_transaction_id. A duplicate delivery never mints twice
//      and never re-emails (the key is not stored, so a retry cannot
//      re-send it — see step 2).
//   5. Paddle wants 200 within 5s — every branch answers fast and
//      never throws (errors are logged + 500 so Paddle retries).
//
// Env (Pages secrets / vars — never in the repo):
//   PADDLE_WEBHOOK_SECRET, PADDLE_WEBHOOK_SECRET_SANDBOX (optional),
//   PADDLE_API_KEY (to fetch the buyer email by customer_id),
//   PADDLE_PRICE_IDS (JSON: {"pri_...": "starter", ...}),
//   LICENCE_ED25519_PRIVATE_KEY (PKCS#8 PEM),
//   RESEND_API_KEY, RESEND_FROM (e.g. "ArchiveCheck <licences@deletedproof.northforgelabs.dev>"),
//   APP_URL (e.g. https://app.deletedproof.northforgelabs.dev — the "verify it" link).
// D1 binding: DB (wayback-social-licences).
import { createHmac, timingSafeEqual } from "node:crypto";
import { mintKey, keyHash } from "../_lib/dp2.js";
import { sendLicenceEmail } from "../_lib/licence-email.js";

const PRICE_TO_TIER_FALLBACK = {}; // price IDs live in PADDLE_PRICE_IDS env, not here

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Verify Paddle Billing's Paddle-Signature header. Returns {ok, reason}. */
export function verifyPaddleSignature(rawBody, header, secrets) {
  if (!header) return { ok: false, reason: "missing Paddle-Signature header" };
  let ts = "";
  const h1s = [];
  for (const part of header.split(";")) {
    const [k, v] = part.split("=");
    if (k === "ts") ts = v || "";
    if (k === "h1" && v) h1s.push(v);
  }
  if (!ts || h1s.length === 0) return { ok: false, reason: "malformed Paddle-Signature header" };
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "stale timestamp — possible replay" };
  for (const secret of secrets.filter(Boolean)) {
    const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
    for (const h1 of h1s) {
      if (h1.length === expected.length &&
          timingSafeEqual(Buffer.from(h1, "utf8"), Buffer.from(expected, "utf8"))) {
        return { ok: true, reason: "valid" };
      }
    }
  }
  return { ok: false, reason: "signature mismatch" };
}

function priceMap(env) {
  try {
    return { ...PRICE_TO_TIER_FALLBACK, ...JSON.parse(env.PADDLE_PRICE_IDS || "{}") };
  } catch {
    return { ...PRICE_TO_TIER_FALLBACK };
  }
}

/** Buyer email: custom_data, then the payload, then the Paddle API. */
export async function buyerEmail(data, env) {
  const fromCustom = data?.custom_data?.email;
  if (typeof fromCustom === "string" && fromCustom.includes("@")) return fromCustom;
  const fromPayload = data?.customer?.email || data?.billing_details?.email;
  if (typeof fromPayload === "string" && fromPayload.includes("@")) return fromPayload;
  const customerId = data?.customer_id;
  if (customerId && env.PADDLE_API_KEY) {
    const res = await fetch(`https://api.paddle.com/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${env.PADDLE_API_KEY}`, "Content-Type": "application/json" },
    });
    if (res.ok) {
      const body = await res.json();
      const email = body?.data?.email;
      if (typeof email === "string" && email.includes("@")) return email;
    }
  }
  return null;
}

function tierSeats(tier) {
  return tier === "studio" ? 5 : 1;
}

export async function handlePaddleEvent(event, env, db) {
  const eventId = event?.event_id || event?.id;
  const eventType = event?.event_type;
  if (!eventId || !eventType) return { status: 400, body: { error: "missing event_id / event_type" } };
  const seen = await db.prepare("SELECT event_id FROM webhook_events WHERE event_id = ?")
    .bind(eventId).first();
  if (seen) return { status: 200, body: { ok: true, duplicate: true, event_id: eventId } };

  const data = event?.data || {};
  if (eventType === "transaction.completed") {
    const txnId = data?.id;
    const items = Array.isArray(data?.items) ? data.items : [];
    const priceId = items[0]?.price?.id || null;
    const tier = priceMap(env)[priceId] || null;
    if (!txnId || !tier) {
      return { status: 500, body: { error: !txnId ? "missing transaction id" : `unmapped price_id: ${priceId || "none"} — set PADDLE_PRICE_IDS` } };
    }
    const existing = await db.prepare(
      "SELECT key_prefix, tier FROM licences WHERE paddle_transaction_id = ?").bind(txnId).first();
    if (existing) {
      await db.prepare("INSERT OR IGNORE INTO webhook_events (event_id, event_type, received_at) VALUES (?, ?, ?)")
        .bind(eventId, eventType, new Date().toISOString()).run();
      return { status: 200, body: { ok: true, duplicate: true, event_id: eventId, key_prefix: existing.key_prefix, tier: existing.tier } };
    }
    const email = await buyerEmail(data, env);
    if (!email) return { status: 500, body: { error: "buyer email not found — check PADDLE_API_KEY / custom_data" } };
    if (!env.LICENCE_ED25519_PRIVATE_KEY) {
      return { status: 500, body: { error: "LICENCE_ED25519_PRIVATE_KEY secret not configured" } };
    }
    const key = mintKey(tier, env.LICENCE_ED25519_PRIVATE_KEY);
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO licences (key_prefix, key_hash, scheme, tier, email,
        paddle_transaction_id, paddle_customer_id, paddle_price_id,
        seats, reports_used, status, created_at)
       VALUES (?, ?, 'DP2', ?, ?, ?, ?, ?, ?, 0, 'active', ?)`)
      .bind(key.slice(0, 24), await keyHash(key), tier, email, txnId,
        data?.customer_id || null, priceId, tierSeats(tier), now).run();
    await db.prepare("INSERT INTO webhook_events (event_id, event_type, received_at) VALUES (?, ?, ?)")
      .bind(eventId, eventType, now).run();
    const mail = await sendLicenceEmail(env, { email, tier, key, appUrl: env.APP_URL });
    // Email never blocks the purchase: the licence is minted and
    // stored above, and Paddle retries cannot re-send the key (only
    // its hash is stored). So a failed send is 200 + a logged
    // warning, and the buyer is re-issued a key manually
    // (docs/email-setup.md §5). Never 500 here: a retry would find
    // the existing licence row and return duplicate:true without
    // ever delivering the key.
    if (!mail.sent) {
      console.warn(`[paddle-webhook] licence ${key.slice(0, 24)} minted for ${email} (${tier}) but email NOT sent: ${mail.reason}`);
    }
    return { status: 200, body: { ok: true, event_id: eventId, tier, key_prefix: key.slice(0, 24), email_sent: mail.sent, email_id: mail.id || null, ...(mail.sent ? {} : { email_error: mail.reason }) } };
  }

  if (eventType === "transaction.refunded" || eventType === "adjustment.created") {
    const txnId = data?.transaction_id || data?.id;
    const action = data?.action;
    if (txnId && (eventType === "transaction.refunded" || action === "refund")) {
      await db.prepare("UPDATE licences SET status = 'revoked', revoked_at = ? WHERE paddle_transaction_id = ? AND status = 'active'")
        .bind(new Date().toISOString(), txnId).run();
    }
    await db.prepare("INSERT OR IGNORE INTO webhook_events (event_id, event_type, received_at) VALUES (?, ?, ?)")
      .bind(eventId, eventType, new Date().toISOString()).run();
    return { status: 200, body: { ok: true, event_id: eventId, revoked_transaction: txnId || null } };
  }

  await db.prepare("INSERT OR IGNORE INTO webhook_events (event_id, event_type, received_at) VALUES (?, ?, ?)")
    .bind(eventId, eventType, new Date().toISOString()).run();
  return { status: 200, body: { ok: true, ignored: eventType, event_id: eventId } };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "could not read request body" }, 400);
  }
  const check = verifyPaddleSignature(rawBody, request.headers.get("Paddle-Signature"),
    [env.PADDLE_WEBHOOK_SECRET, env.PADDLE_WEBHOOK_SECRET_SANDBOX]);
  if (!check.ok) return json({ error: `invalid signature: ${check.reason}` }, 401);
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!env.DB) return json({ error: "D1 binding DB not configured" }, 500);
  try {
    const result = await handlePaddleEvent(event, env, env.DB);
    return json(result.body, result.status);
  } catch (err) {
    return json({ error: `webhook failed: ${err?.message || err}` }, 500);
  }
}
