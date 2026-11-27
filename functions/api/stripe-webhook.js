// POST /api/stripe-webhook — Stripe webhook -> licence minting.
// Stripe -> D1 (licences + webhook_events) -> Resend email with the key.
//
// Flow (see docs/stripe-vs-clerk.md §7 and docs/stripe-webhook.md):
//   1. Verify Stripe-Signature: HMAC-SHA256 over "t.rawBody" with
//      the endpoint secret (STRIPE_WEBHOOK_SECRET, or the sandbox
//      one for sandbox events). Stripe's scheme, NOT Paddle's
//      (Paddle signs "ts:rawBody" and uses a different header) and
//      NOT RSA (that is Paddle Classic). Header:
//      "t=<unix ts>,v1=<hex>[,v1=<hex>]"; 5-minute tolerance;
//      constant-time compare; never accept an unsigned event.
//      Deviation from the Paddle webhook, deliberate: a bad
//      signature is 400 here (Paddle returns 401). Stripe retries
//      any non-2xx the same way, so the code is the same either way.
//   2. checkout.session.completed -> resolve the tier, mint a DP2
//      (Ed25519) licence key, store its hash in D1, email the key.
//      Email NEVER blocks the purchase (shared helper in
//      functions/_lib/licence-email.js — same as Paddle): a missing
//      RESEND_API_KEY or a Resend 4xx/5xx returns 200 with
//      email_sent:false + a logged warning. A Stripe retry cannot
//      re-send the key — only its hash is stored — so a failed
//      email needs a manual re-issue (new key, see
//      docs/email-setup.md §5).
//   3. Tier resolution, in order (never a guessed tier):
//      a. session.metadata.tier — the Payment Link's metadata is
//         copied onto the Checkout Session by Stripe, and all five
//         live links carry it (docs/stripe-vs-clerk.md §7).
//         "bundle" maps to "studio" (a bundle purchase mints a
//         Studio key, same as Paddle); "topup" is a text-fetch
//         top-up, NOT a licence — it is answered 200 + ignored
//         (credits have no ledger yet; see docs/stripe-webhook.md).
//      b. Line items via the Stripe API (GET /v1/checkout/sessions/
//         {id}/line_items, STRIPE_SECRET_KEY) -> price id ->
//         STRIPE_PRICE_IDS env map. Only used when the metadata
//         tier is missing or unknown.
//      c. Neither yields a tier -> 400 with the price id in the
//         log, never a minted key for the wrong pack.
//   4. charge.refunded -> revoke by stripe_payment_intent;
//      checkout.session.async_payment_failed -> revoke by
//      stripe_session_id. A refund with no matching licence (a
//      purchase made before the webhook, or a non-ArchiveCheck
//      charge) is 200 + revoked:0, never an error — Stripe would
//      retry a 500 forever and there is nothing to retry.
//   5. Idempotent: event_id in webhook_events + UNIQUE
//      stripe_session_id. A duplicate delivery never mints twice
//      and never re-emails.
//   6. Stripe wants 200 within ~5s — every branch answers fast
//      and never throws (errors are logged + 500 so Stripe retries).
//
// Env (Pages secrets / vars — never in the repo):
//   STRIPE_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET_SANDBOX (optional),
//   STRIPE_SECRET_KEY (to fetch line items / the buyer email when
//     the session payload lacks them; test key for sandbox proof,
//     live key for production),
//   STRIPE_PRICE_IDS (JSON: {"price_...": "starter", ...}),
//   LICENCE_ED25519_PRIVATE_KEY (PKCS#8 PEM),
//   RESEND_API_KEY, RESEND_FROM (e.g. "ArchiveCheck <licences@deletedproof.northforgelabs.dev>"),
//   APP_URL (e.g. https://app.deletedproof.northforgelabs.dev — the "verify it" link).
// D1 binding: DB (wayback-social-licences).
//
// Migration tolerance: the Stripe columns (stripe_customer_id
// from 0004; stripe_session_id / stripe_payment_intent /
// stripe_price_id from 0005) may not exist yet — the insert falls
// back to the 0001 column set and the refund lookups answer
// honestly instead of crashing. Purchases keep working; refunds
// cannot be linked until the migrations are applied (the row is
// still stored, just without the Stripe identifiers).
import { mintKey, keyHash } from "../_lib/dp2.js";
import { sendLicenceEmail } from "../_lib/licence-email.js";
import { verifyStripeSignature } from "../_lib/stripe-signature.js";
import { resolveTier, tierSeats } from "../_lib/stripe-tier.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Buyer email: session payload first, then the Stripe API. */
export async function buyerEmail(session, env) {
  const fromDetails = session?.customer_details?.email;
  if (typeof fromDetails === "string" && fromDetails.includes("@")) return fromDetails;
  const fromSession = session?.customer_email;
  if (typeof fromSession === "string" && fromSession.includes("@")) return fromSession;
  const customerId = session?.customer;
  const secret = env.STRIPE_SECRET_KEY || "";
  if (customerId && secret) {
    try {
      const res = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}`, {
        headers: { Authorization: "Basic " + btoa(secret + ":") },
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        const email = body?.email;
        if (typeof email === "string" && email.includes("@")) return email;
      }
    } catch {
      // fall through to null — the caller reports the missing email
    }
  }
  return null;
}

function isNoSuchColumn(err) {
  return /no such column/i.test(err?.message || "");
}

async function insertLicence(db, row) {
  const now = row.createdAt;
  try {
    await db.prepare(
      `INSERT INTO licences (key_prefix, key_hash, scheme, tier, email,
        stripe_session_id, stripe_customer_id, stripe_payment_intent, stripe_price_id,
        seats, reports_used, status, created_at)
       VALUES (?, ?, 'DP2', ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?)`)
      .bind(row.keyPrefix, row.keyHash, row.tier, row.email, row.sessionId,
        row.customerId, row.paymentIntent, row.priceId, row.seats, now).run();
    return { stripeColumns: true };
  } catch (e) {
    if (!isNoSuchColumn(e)) throw e;
    // Migrations 0004/0005 not applied yet — store the core row
    // (refunds cannot be linked until they are; logged by caller).
    await db.prepare(
      `INSERT INTO licences (key_prefix, key_hash, scheme, tier, email,
        seats, reports_used, status, created_at)
       VALUES (?, ?, 'DP2', ?, ?, ?, 0, 'active', ?)`)
      .bind(row.keyPrefix, row.keyHash, row.tier, row.email, row.seats, now).run();
    return { stripeColumns: false };
  }
}

async function revokeWhere(db, column, value) {
  let rows;
  try {
    rows = await db.prepare(
      `SELECT key_prefix, tier FROM licences WHERE ${column} = ? AND status = 'active'`)
      .bind(value).all();
  } catch (e) {
    if (isNoSuchColumn(e)) {
      return { attempted: false, revoked: 0, reason: `licences.${column} column missing — apply migrations/0004_stripe_customer.sql + migrations/0005_stripe_purchase.sql` };
    }
    throw e;
  }
  const found = rows?.results || [];
  if (found.length > 0) {
    await db.prepare(
      `UPDATE licences SET status = 'revoked', revoked_at = ? WHERE ${column} = ? AND status = 'active'`)
      .bind(new Date().toISOString(), value).run();
  }
  return { attempted: true, revoked: found.length, keyPrefixes: found.map((r) => r.key_prefix) };
}

async function recordEvent(db, eventId, eventType) {
  await db.prepare("INSERT OR IGNORE INTO webhook_events (event_id, event_type, received_at) VALUES (?, ?, ?)")
    .bind(eventId, eventType, new Date().toISOString()).run();
}

export async function handleStripeEvent(event, env, db) {
  const eventId = event?.id;
  const eventType = event?.type;
  if (!eventId || !eventType) return { status: 400, body: { error: "missing event id / type" } };
  const seen = await db.prepare("SELECT event_id FROM webhook_events WHERE event_id = ?")
    .bind(eventId).first();
  if (seen) return { status: 200, body: { ok: true, duplicate: true, event_id: eventId } };

  const object = event?.data?.object || {};

  if (eventType === "checkout.session.completed") {
    const sessionId = object?.id;
    if (!sessionId) return { status: 400, body: { error: "missing checkout session id" } };
    const resolved = await resolveTier(object, env);
    if (!resolved.tier) {
      console.warn(`[stripe-webhook] ${eventId}: ${resolved.error}`);
      return { status: 400, body: { error: resolved.error, price_id: resolved.priceId || null } };
    }
    if (resolved.tier === "topup") {
      // Text-fetch top-up: credits, not a licence — there is no
      // credits ledger yet (see docs/stripe-webhook.md). The buyer
      // still gets Stripe's receipt; nothing is minted or stored.
      await recordEvent(db, eventId, eventType);
      return { status: 200, body: { ok: true, ignored: "text-fetch top-up — credits are not licences (no ledger yet)", event_id: eventId } };
    }
    const tier = resolved.tier;
    let existing = null;
    try {
      existing = await db.prepare(
        "SELECT key_prefix, tier FROM licences WHERE stripe_session_id = ?").bind(sessionId).first();
    } catch (e) {
      if (!isNoSuchColumn(e)) throw e;
      // Migration 0005 not applied: the session check is
      // unavailable (the webhook_events check above still covers
      // redelivery of the same event id).
      console.warn("[stripe-webhook] licences.stripe_session_id column missing — apply migrations/0005_stripe_purchase.sql");
    }
    if (existing) {
      await recordEvent(db, eventId, eventType);
      return { status: 200, body: { ok: true, duplicate: true, event_id: eventId, key_prefix: existing.key_prefix, tier: existing.tier } };
    }
    const email = await buyerEmail(object, env);
    if (!email) return { status: 500, body: { error: "buyer email not found — check the Checkout Session customer_details / STRIPE_SECRET_KEY" } };
    if (!env.LICENCE_ED25519_PRIVATE_KEY) {
      return { status: 500, body: { error: "LICENCE_ED25519_PRIVATE_KEY secret not configured" } };
    }
    const key = mintKey(tier, env.LICENCE_ED25519_PRIVATE_KEY);
    const now = new Date().toISOString();
    const inserted = await insertLicence(db, {
      keyPrefix: key.slice(0, 24), keyHash: await keyHash(key), tier, email,
      sessionId, customerId: object?.customer || null,
      paymentIntent: object?.payment_intent || null,
      priceId: resolved.priceId || object?.metadata?.price_id || null,
      seats: tierSeats(tier), createdAt: now,
    });
    if (!inserted.stripeColumns) {
      console.warn("[stripe-webhook] licence stored WITHOUT Stripe columns (migrations 0004/0005 not applied) — refunds cannot be linked until they are");
    }
    await recordEvent(db, eventId, eventType);
    const mail = await sendLicenceEmail(env, { email, tier, key, appUrl: env.APP_URL });
    // Email never blocks the purchase: the licence is minted and
    // stored above, and Stripe retries cannot re-send the key (only
    // its hash is stored). So a failed send is 200 + a logged
    // warning, and the buyer is re-issued a key manually
    // (docs/email-setup.md §5). Never 500 here: a retry would find
    // the existing licence row and return duplicate:true without
    // ever delivering the key.
    if (!mail.sent) {
      console.warn(`[stripe-webhook] licence ${key.slice(0, 24)} minted for ${email} (${tier}) but email NOT sent: ${mail.reason}`);
    }
    return { status: 200, body: { ok: true, event_id: eventId, tier, key_prefix: key.slice(0, 24), email_sent: mail.sent, email_id: mail.id || null, stripe_session_id: sessionId, ...(mail.sent ? {} : { email_error: mail.reason }) } };
  }

  if (eventType === "charge.refunded") {
    const paymentIntent = object?.payment_intent || null;
    if (!paymentIntent) {
      await recordEvent(db, eventId, eventType);
      return { status: 200, body: { ok: true, event_id: eventId, revoked: 0, reason: "charge has no payment_intent — nothing to revoke" } };
    }
    const result = await revokeWhere(db, "stripe_payment_intent", paymentIntent);
    await recordEvent(db, eventId, eventType);
    return { status: 200, body: { ok: true, event_id: eventId, revoked: result.revoked, ...(result.attempted ? { key_prefixes: result.keyPrefixes } : { reason: result.reason }) } };
  }

  if (eventType === "checkout.session.async_payment_failed") {
    const sessionId = object?.id;
    if (!sessionId) {
      await recordEvent(db, eventId, eventType);
      return { status: 200, body: { ok: true, event_id: eventId, revoked: 0, reason: "session has no id — nothing to revoke" } };
    }
    const result = await revokeWhere(db, "stripe_session_id", sessionId);
    await recordEvent(db, eventId, eventType);
    return { status: 200, body: { ok: true, event_id: eventId, revoked: result.revoked, ...(result.attempted ? { key_prefixes: result.keyPrefixes } : { reason: result.reason }) } };
  }

  await recordEvent(db, eventId, eventType);
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
  const secrets = [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_WEBHOOK_SECRET_SANDBOX];
  if (!secrets.some(Boolean)) {
    return json({ error: "STRIPE_WEBHOOK_SECRET not configured — set the Pages secret (test endpoint secret for sandbox, live endpoint secret for production)" }, 503);
  }
  const check = verifyStripeSignature(rawBody, request.headers.get("Stripe-Signature"), secrets);
  if (!check.ok) return json({ error: `invalid signature: ${check.reason}` }, 400);
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!env.DB) return json({ error: "D1 binding DB not configured" }, 500);
  try {
    const result = await handleStripeEvent(event, env, env.DB);
    return json(result.body, result.status);
  } catch (err) {
    return json({ error: `webhook failed: ${err?.message || err}` }, 500);
  }
}
