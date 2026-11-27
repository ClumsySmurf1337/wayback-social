// Shared harness for the Stripe webhook test suites
// (stripe-webhook.test.mjs + stripe-webhook-refunds.test.mjs).
// No tests here — this file only builds the stub D1, the stub
// fetch (Resend + Stripe API), the throwaway Ed25519 keypair +
// webhook secret, and the Stripe-signed request helper.
//
// The keypair and secret below are THROWAWAY test values
// generated per run — never the production keypair in
// .licence-keygen.txt (which no test ever reads).
import { createHmac, generateKeyPairSync } from "node:crypto";

import { onRequest as webhook } from "./stripe-webhook.js";

export const WEBHOOK_SECRET = "whsec_testsecret_stripe_webhook";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
export const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" });
export const PUBLIC_SPKI_B64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

// Live launch price ids (docs/stripe-vs-clerk.md §7) — used ONLY as
// the STRIPE_PRICE_IDS env example in these tests, never as
// hardcoded behaviour in the endpoint.
export const LIVE_PRICE_PRO = "price_1UgR0MGW6yc5Tf5GljpjGLoH";
export const PRICE_IDS = {
  price_1UgR0MGW6yc5Tf5GOIXgIXQv: "starter",
  [LIVE_PRICE_PRO]: "pro",
  price_1UgR0MGW6yc5Tf5GyoH2O7zj: "studio",
  price_1UgR0NGW6yc5Tf5GEsSd39VR: "studio", // bundle mints studio
  price_1UgR0MGW6yc5Tf5G9nfyhfkd: "topup",
};

export function makeStubDB(opts = {}) {
  const stripeColumns = opts.stripeColumns !== false;
  const licences = new Map(); // key_hash -> row
  const bySession = new Map(); // session id -> row
  const events = new Set();
  return {
    licences, bySession, events, stripeColumns,
    prepare(sql) {
      const s = sql.replace(/\s+/g, " ");
      return {
        bind(...args) {
          return {
            async first() {
              if (s.includes("FROM webhook_events")) return events.has(args[0]) ? { event_id: args[0] } : null;
              if (s.includes("FROM licences WHERE stripe_session_id")) {
                if (!stripeColumns) throw new Error("no such column: licences.stripe_session_id");
                const r = bySession.get(args[0]);
                return r ? { key_prefix: r.key_prefix, tier: r.tier } : null;
              }
              if (s.includes("FROM licences WHERE key_hash")) {
                const r = licences.get(args[0]);
                return r ? { tier: r.tier, status: r.status, reports_used: r.reports_used, seats: r.seats } : null;
              }
              return null;
            },
            async all() {
              if (s.includes("FROM licences WHERE stripe_payment_intent")) {
                if (!stripeColumns) throw new Error("no such column: licences.stripe_payment_intent");
                const out = [...licences.values()].filter((r) => r.paymentIntent === args[0] && r.status === "active");
                return { results: out.map((r) => ({ key_prefix: r.key_prefix, tier: r.tier })) };
              }
              if (s.includes("FROM licences WHERE stripe_session_id")) {
                if (!stripeColumns) throw new Error("no such column: licences.stripe_session_id");
                const out = [...licences.values()].filter((r) => r.sessionId === args[0] && r.status === "active");
                return { results: out.map((r) => ({ key_prefix: r.key_prefix, tier: r.tier })) };
              }
              return { results: [] };
            },
            async run() {
              if (s.includes("INSERT INTO licences")) {
                if (s.includes("stripe_session_id")) {
                  if (!stripeColumns) throw new Error("no such column: licences.stripe_session_id");
                  const [key_prefix, key_hash, tier, email, sessionId, customerId, paymentIntent, priceId, seats] = args;
                  const row = { key_prefix, key_hash, tier, email, sessionId, customerId, paymentIntent, priceId, seats, reports_used: 0, status: "active" };
                  licences.set(key_hash, row);
                  bySession.set(sessionId, row);
                } else {
                  const [key_prefix, key_hash, tier, email, seats] = args;
                  const row = { key_prefix, key_hash, tier, email, sessionId: null, customerId: null, paymentIntent: null, priceId: null, seats, reports_used: 0, status: "active" };
                  licences.set(key_hash, row);
                }
              } else if (s.includes("INSERT INTO webhook_events") || s.includes("INSERT OR IGNORE INTO webhook_events")) {
                events.add(args[0]);
              } else if (s.includes("UPDATE licences SET status")) {
                const [revokedAt, value] = args;
                for (const r of licences.values()) {
                  const match = s.includes("stripe_payment_intent") ? r.paymentIntent === value : r.sessionId === value;
                  if (match && r.status === "active") { r.status = "revoked"; r.revoked_at = revokedAt; }
                }
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
}

export function makeEnv(db, fetchCalls, overrides = {}) {
  return {
    DB: db,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_SECRET_KEY: "sk_test_dummy_for_line_items",
    STRIPE_PRICE_IDS: JSON.stringify(PRICE_IDS),
    LICENCE_ED25519_PRIVATE_KEY: PRIVATE_PEM,
    LICENCE_ED25519_PUBLIC_KEY: PUBLIC_SPKI_B64,
    RESEND_API_KEY: "re_test_key",
    RESEND_FROM: "ArchiveCheck <licences@example.com>",
    APP_URL: "https://app.example.com",
    __fetchCalls: fetchCalls,
    ...overrides,
  };
}

export function signPayload(rawBody, secret = WEBHOOK_SECRET) {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

export function installFetchStub(fetchCalls, lineItemsPriceId = LIVE_PRICE_PRO) {
  globalThis.fetch = async (url, opts = {}) => {
    fetchCalls.push({ url: String(url), headers: opts.headers || {}, body: opts.body || null });
    if (String(url).includes("api.resend.com/emails")) {
      return { ok: true, status: 200, json: async () => ({ id: "re_test123" }), text: async () => "{}" };
    }
    if (String(url).includes("/v1/checkout/sessions/") && String(url).includes("/line_items")) {
      return { ok: true, status: 200, json: async () => ({ data: [{ price: { id: lineItemsPriceId } }] }), text: async () => "{}" };
    }
    if (String(url).includes("/v1/customers/")) {
      return { ok: true, status: 200, json: async () => ({ email: "buyer@example.com" }), text: async () => "{}" };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "not found" };
  };
}

// Same as installFetchStub, but Resend fails (rate limit / bad key /
// down) so the email-failure path can be tested.
export function installFetchStubResendFails(fetchCalls, status = 429) {
  globalThis.fetch = async (url, opts = {}) => {
    fetchCalls.push({ url: String(url), headers: opts.headers || {}, body: opts.body || null });
    if (String(url).includes("api.resend.com/emails")) {
      return { ok: false, status, json: async () => ({ message: "rate limited" }), text: async () => "rate limited" };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "not found" };
  };
}

export function sessionCompletedEvent(eventId, sessionId, overrides = {}) {
  return {
    id: eventId, type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId, customer: "cus_test123", payment_intent: "pi_test123",
        customer_details: { email: "buyer@example.com" },
        metadata: { tier: "pro", pricing: "launch", product: "archivecheck" },
        ...overrides,
      },
    },
  };
}

export async function postWebhook(env, event, headerOverride, method = "POST") {
  const rawBody = JSON.stringify(event);
  const req = new Request("https://example.com/api/stripe-webhook", {
    method,
    headers: { "Stripe-Signature": headerOverride ?? signPayload(rawBody), "Content-Type": "application/json" },
    body: method === "POST" ? rawBody : undefined,
  });
  const res = await webhook({ request: req, env });
  return { status: res.status, body: await res.json() };
}
