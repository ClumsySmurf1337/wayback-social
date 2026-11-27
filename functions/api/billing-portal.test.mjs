/* Node test for functions/api/billing-portal.js — no dependencies, no browser.
 *
 * Run:  node functions/api/billing-portal.test.mjs
 * Exit 0 = a valid licence key with a linked Stripe customer gets a
 * portal session URL (the exact Stripe request is asserted: POST,
 * Basic auth with the test secret, customer + return_url +
 * configuration in the body), a licence with no linked customer gets
 * an honest 404 (never a fake link), a bad key gets 401, a live
 * secret key is refused outright (the Stripe fetch is never called),
 * a missing migration-0004 column gets a clear 503, and Stripe
 * errors / outages pass through honestly.
 *
 * The test mints its own throwaway Ed25519 keypair at runtime and a
 * DP1 key with the test HMAC secret — no secrets, no D1, no network.
 * The Stripe API is a stubbed global fetch; nothing is created in
 * any Stripe account (the live portal config was created once, by
 * hand, in test mode only — see docs/stripe-vs-clerk.md §5).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, generateKeyPairSync } from "node:crypto";
import { mintKey } from "../_lib/dp2.js";
import { onRequest } from "./billing-portal.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const PUBLIC_B64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const SECRET = "test-licence-secret";
const STRIPE_TEST_KEY = "sk_test_51TestSecret";
const PORTAL_SESSION_URL = "https://billing.stripe.com/p/session/test_123";
const DASHBOARD_URL = "https://app.deletedproof.northforgelabs.dev/dashboard.html";
const TEST_CONFIG = "bpc_1UgEQNGnFHTsoY17wW8AIubt";
const BASE_ENV = {
  LICENCE_ED25519_PUBLIC_KEY: PUBLIC_B64,
  LICENCE_SECRET: SECRET,
  STRIPE_SECRET_KEY: STRIPE_TEST_KEY,
  STRIPE_PORTAL_CONFIGURATION: TEST_CONFIG,
};

function sha(key) { return createHash("sha256").update(key, "utf8").digest("hex"); }

/** Mint a DP1 key with the test secret (mirrors licence.py). */
function dp1Key(tier, random = "ABCDEFGH23456789") {
  const checksum = createHmac("sha256", SECRET)
    .update(`DP1:${tier.toUpperCase()}:${random}`).digest("hex").slice(0, 8);
  return `DP1-${tier.toUpperCase()}-${random}-${checksum}`;
}

function mockDb({ throwNoColumn = false } = {}) {
  const licences = new Map(); // key_hash -> {tier, status, stripe_customer_id}
  return {
    licences,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            first: async () => {
              if (throwNoColumn && sql.includes("stripe_customer_id")) {
                throw new Error("D1_ERROR: no such column: stripe_customer_id");
              }
              if (sql.includes("FROM licences WHERE key_hash")) {
                return licences.get(args[0]) || null;
              }
              throw new Error("unexpected SELECT in mock: " + sql);
            },
            run: async () => ({ success: true, meta: { changes: 1 } }),
          };
        },
      };
    },
  };
}

function envWithRow(key, customerId) {
  const db = mockDb();
  db.licences.set(sha(key), { tier: "studio", status: "active", stripe_customer_id: customerId });
  return { env: { ...BASE_ENV, DB: db }, db };
}

/** Stub global fetch for one call; returns the recorded Stripe calls. */
async function withStripe(stub, fn) {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return stub(url, opts);
  };
  try {
    const out = await fn();
    return { out, calls };
  } finally {
    globalThis.fetch = orig;
  }
}

function stripeOk() {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: "bps_test123", object: "billing_portal.session", url: PORTAL_SESSION_URL }),
  });
}

function postReq(body) {
  return { method: "POST", json: async () => body };
}
async function call(request, env) {
  const res = await onRequest({ request, env });
  return { status: res.status, body: JSON.parse(await res.text()) };
}

test("happy path: DP2 key + linked customer -> portal session URL, exact Stripe request", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env } = envWithRow(key, "cus_test123");
  const { out, calls } = await withStripe(stripeOk(), () => call(postReq({ key }), env));
  assert.equal(out.status, 200);
  assert.equal(out.body.portal_url, PORTAL_SESSION_URL);
  assert.equal(out.body.return_url, DASHBOARD_URL);
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.url, "https://api.stripe.com/v1/billing_portal/sessions");
  assert.equal(c.opts.method, "POST");
  assert.equal(c.opts.headers.Authorization,
    "Basic " + Buffer.from(STRIPE_TEST_KEY + ":").toString("base64"));
  const params = new URLSearchParams(c.opts.body);
  assert.equal(params.get("customer"), "cus_test123");
  assert.equal(params.get("return_url"), DASHBOARD_URL);
  assert.equal(params.get("configuration"), TEST_CONFIG);
});

test("configuration env unset: the test-mode config id is still sent", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env } = envWithRow(key, "cus_test123");
  delete env.STRIPE_PORTAL_CONFIGURATION;
  const { out, calls } = await withStripe(stripeOk(), () => call(postReq({ key }), env));
  assert.equal(out.status, 200);
  assert.equal(new URLSearchParams(calls[0].opts.body).get("configuration"), TEST_CONFIG);
});

test("DP1 key is accepted (same shared verifier as link-licence)", async () => {
  const key = dp1Key("studio");
  const { env } = envWithRow(key, "cus_test123");
  const { out } = await withStripe(stripeOk(), () => call(postReq({ key }), env));
  assert.equal(out.status, 200);
  assert.equal(out.body.portal_url, PORTAL_SESSION_URL);
});

test("no Stripe customer linked: honest 404, Stripe never called", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env } = envWithRow(key, null);
  const { out, calls } = await withStripe(stripeOk(), () => call(postReq({ key }), env));
  assert.equal(out.status, 404);
  assert.match(out.body.error, /no Stripe customer is linked/);
  assert.equal(calls.length, 0);
});

test("bad key: 401 (the key is the credential here)", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env } = envWithRow(key, "cus_test123");
  const { out, calls } = await withStripe(stripeOk(), () =>
    call(postReq({ key: "DP1-STUDIO-ABCDEFGH23456789-00000000" }), env));
  assert.equal(out.status, 401);
  assert.match(out.body.error, /Invalid key/);
  assert.equal(calls.length, 0);
});

test("no DB binding: 503", async () => {
  const { out, calls } = await withStripe(stripeOk(), () =>
    call(postReq({ key: mintKey("studio", PRIVATE_PEM) }), BASE_ENV));
  assert.equal(out.status, 503);
  assert.equal(calls.length, 0);
});

test("no Stripe secret key: 503, Stripe never called", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env } = envWithRow(key, "cus_test123");
  delete env.STRIPE_SECRET_KEY;
  const { out, calls } = await withStripe(stripeOk(), () => call(postReq({ key }), env));
  assert.equal(out.status, 503);
  assert.match(out.body.error, /STRIPE_SECRET_KEY/);
  assert.equal(calls.length, 0);
});

test("live secret key is refused outright, Stripe never called", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env } = envWithRow(key, "cus_test123");
  env.STRIPE_SECRET_KEY = "sk_live_51FakeLiveKey";
  const { out, calls } = await withStripe(stripeOk(), () => call(postReq({ key }), env));
  assert.equal(out.status, 503);
  assert.match(out.body.error, /live Stripe keys are refused/);
  assert.equal(calls.length, 0);
});

test("migration 0004 not applied: clear 503 naming the migration", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const db = mockDb({ throwNoColumn: true });
  db.licences.set(sha(key), { tier: "studio", status: "active", stripe_customer_id: "cus_test123" });
  const { out, calls } = await withStripe(stripeOk(), () =>
    call(postReq({ key }), { ...BASE_ENV, DB: db }));
  assert.equal(out.status, 503);
  assert.match(out.body.error, /0004_stripe_customer\.sql/);
  assert.equal(calls.length, 0);
});

test("valid key, no D1 row: 404", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { out, calls } = await withStripe(stripeOk(), () =>
    call(postReq({ key }), { ...BASE_ENV, DB: mockDb() }));
  assert.equal(out.status, 404);
  assert.match(out.body.error, /no server record/);
  assert.equal(calls.length, 0);
});

test("Stripe answers an error: status and message pass through honestly", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env } = envWithRow(key, "cus_deleted");
  const stub = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ error: { message: "No such customer: 'cus_deleted'", type: "invalid_request_error" } }),
  });
  const { out } = await withStripe(stub, () => call(postReq({ key }), env));
  assert.equal(out.status, 404);
  assert.match(out.body.error, /No such customer/);
});

test("Stripe unreachable: 502", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env } = envWithRow(key, "cus_test123");
  const stub = async () => { throw new Error("fetch failed"); };
  const { out } = await withStripe(stub, () => call(postReq({ key }), env));
  assert.equal(out.status, 502);
  assert.match(out.body.error, /could not reach Stripe/);
});

test("GET: 405", async () => {
  const { out } = await withStripe(stripeOk(), () =>
    call({ method: "GET", url: "https://example.com/api/billing-portal" }, BASE_ENV));
  assert.equal(out.status, 405);
});
