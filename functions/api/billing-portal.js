// POST /api/billing-portal — open a Stripe Billing Portal session
// for the buyer behind a licence key.
//
// WHY: the portal is billing self-service (receipts, card updates)
// — it does NOT authenticate. The caller proves ownership with
// their licence key (DP2/DP1, same shared verifier as
// link-licence.js); the endpoint looks up the Stripe customer id
// linked to that licence in D1 and opens a portal session for
// them. The session URL is returned; the dashboard opens it in a
// new tab / full redirect. Portal sessions expire 5 minutes after
// creation if unused (1 hour after first activity) and cannot be
// iframed.
//
// TEST MODE ONLY for now: STRIPE_SECRET_KEY must be the test-mode
// secret key (sk_test_...). The endpoint REFUSES a live key
// (sk_live_...) outright — live portal sessions need the live
// portal configuration, the webhook cus_ ↔ licence mapping, John's
// sales-tax answer and his explicit go-ahead (see
// docs/stripe-vs-clerk.md §5). Never paste a live secret into a
// Pages env var for this endpoint until then.
//
// The Stripe customer link: migrations/0004 adds
// licences.stripe_customer_id, written by the Stripe webhook when
// a purchase creates a customer (future work — see
// docs/stripe-vs-clerk.md §5). No customer ids are ever invented:
// a licence with no linked customer gets an honest 404, not a
// fake link. If the column does not exist yet (migration 0004 not
// applied), the lookup fails with a clear 503 "apply migration
// 0004" instead of crashing.
//
// The licence status is deliberately NOT checked here: the portal
// shows the buyer their own Stripe billing history, and a
// refunded buyer still has receipts to see. Blocking them from
// their own billing record would be wrong.
//
// Env: STRIPE_SECRET_KEY (test only), STRIPE_PORTAL_CONFIGURATION
// (optional — the test-mode config id; unset means Stripe uses the
// account default, which IS that config). D1 binding: DB
// (wayback-social-licences).
//
// Return URL: the portal config's default_return_url, passed
// explicitly per session so a session always lands back on the
// dashboard even if the config default changes. This constant
// moved with the canonical decision (b, 2026-11-27): canonicals now live on deletedproof.northforgelabs.dev —
// see docs/stripe-vs-clerk.md §5.
import { keyHash } from "../_lib/dp2.js";
import { verifyLicenceKey } from "../_lib/verify-key.js";

const STRIPE_API = "https://api.stripe.com/v1/billing_portal/sessions";
// Test-mode portal configuration (created 2026-11-27, verified live
// via the Stripe API read-back): bpc_1UgEQNGnFHTsoY17wW8AIubt,
// active + default, invoice history + payment methods + customer
// update (email, name) on, subscription cancel off (one-time packs).
const TEST_PORTAL_CONFIGURATION = "bpc_1UgEQNGnFHTsoY17wW8AIubt";
const RETURN_URL = "https://app.deletedproof.northforgelabs.dev/dashboard.html";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (request.method !== "POST") return json({ error: "POST only" }, 405);
    if (!env.DB) {
      return json({ error: "D1 database not configured yet (DB binding) — see docs/stripe-vs-clerk.md §5" }, 503);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const key = (body && body.key ? String(body.key) : "").trim();
    if (!key) return json({ error: "licence key is required" }, 400);
    // The key is the credential here (proof of ownership), so an
    // invalid key is 401 — unlike link-licence/evidence-usage,
    // where the key is a value being checked (400).
    const check = await verifyLicenceKey(key, env);
    if (!check.valid) {
      if (check.unconfigured) {
        return json({ error: check.reason + " — see docs/stripe-vs-clerk.md" }, 503);
      }
      return json({ error: "Invalid key: " + check.reason }, 401);
    }
    const secret = env.STRIPE_SECRET_KEY || "";
    if (!secret) {
      return json({ error: "Stripe secret key not configured (STRIPE_SECRET_KEY env var) — test-mode key only; see docs/stripe-vs-clerk.md §5" }, 503);
    }
    if (secret.startsWith("sk_live_")) {
      return json({ error: "live Stripe keys are refused by this endpoint until the live go-ahead (portal config in live, webhook mapping, sales-tax answer — see docs/stripe-vs-clerk.md §5)" }, 503);
    }
    const hash = await keyHash(key);
    let row;
    try {
      row = await env.DB.prepare(
        "SELECT tier, status, stripe_customer_id FROM licences WHERE key_hash = ?"
      ).bind(hash).first();
    } catch (e) {
      // Migration 0004 not applied yet: the column does not exist.
      // Say so plainly instead of a bare 500.
      if (e && /no such column/i.test(e.message || "")) {
        return json({ error: "licences.stripe_customer_id column missing — apply migrations/0004_stripe_customer.sql (wrangler d1 execute wayback-social-licences --file migrations/0004_stripe_customer.sql)" }, 503);
      }
      throw e;
    }
    if (!row) {
      return json({ error: "no server record for this key — the key has no D1 licences row (dev keys need one; see docs/paddle-webhook.md)" }, 404);
    }
    if (!row.stripe_customer_id) {
      return json({ error: "no Stripe customer is linked to this licence yet — the purchase was made before the Stripe mapping landed, or the licence was minted manually (see docs/stripe-vs-clerk.md §5)", tier: row.tier, status: row.status }, 404);
    }
    const params = new URLSearchParams({
      customer: row.stripe_customer_id,
      return_url: RETURN_URL,
    });
    const configuration = env.STRIPE_PORTAL_CONFIGURATION || TEST_PORTAL_CONFIGURATION;
    if (configuration) params.set("configuration", configuration);
    let sessionRes;
    try {
      sessionRes = await fetch(STRIPE_API, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(secret + ":"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
    } catch (e) {
      return json({ error: "could not reach Stripe — try again" }, 502);
    }
    const session = await sessionRes.json().catch(() => ({}));
    if (!sessionRes.ok) {
      const msg = (session && session.error && session.error.message) ||
        ("Stripe answered HTTP " + sessionRes.status);
      return json({ error: "Stripe error: " + msg }, sessionRes.status);
    }
    if (!session.url) {
      return json({ error: "Stripe answered without a portal URL — try again" }, 502);
    }
    return json({
      portal_url: session.url,
      return_url: RETURN_URL,
      note: "Portal sessions expire 5 minutes after creation if unused (1 hour after first activity) — open the URL promptly, in a new tab or a full redirect (not an iframe).",
    });
  } catch (e) {
    return json({ error: "billing-portal failed: " + (e && e.message ? e.message : String(e)) }, 500);
  }
}
