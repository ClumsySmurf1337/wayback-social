// End-to-end tests for the Paddle webhook pipeline (issue #4).
// Run: node --test tests/test_paddle_webhook.mjs
// No network, no real Paddle/Resend/D1: the harness stubs D1 (in-memory,
// same prepare/bind/first/run shape) and fetch (Resend + Paddle API),
// and signs simulated webhook payloads with a test secret, exactly
// as Paddle does (HMAC-SHA256 over "ts:rawBody").
// Writes one minted DP2 key + its test public key to
// /tmp/paddle_webhook_e2e.json for the Python cross-check
// (tests/test_paddle_webhook.py verifies it with licence2.py).
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

import { onRequest as webhook, verifyPaddleSignature } from "../functions/api/paddle-webhook.js";
import { onRequest as licenceCheck } from "../functions/api/licence-check.js";
import { mintKey } from "../functions/_lib/dp2.js";

const require = createRequire(import.meta.url);
const WEB_LICENCE = require("../web/licence.js");

const WEBHOOK_SECRET = "pdl_ntfset_testsecret";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const PUBLIC_SPKI_B64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

const PRICE_IDS = {
  pri_starter: "starter", pri_pro: "pro", pri_studio: "studio", pri_bundle: "studio",
};

function makeStubDB() {
  const licences = new Map(); // key_hash -> row
  const byTxn = new Map(); // txn id -> row
  const events = new Set();
  return {
    licences, byTxn, events,
    prepare(sql) {
      const s = sql.replace(/\s+/g, " ");
      return {
        bind(...args) {
          return {
            async first() {
              if (s.includes("FROM webhook_events")) return events.has(args[0]) ? { event_id: args[0] } : null;
              if (s.includes("FROM licences WHERE paddle_transaction_id")) {
                const r = byTxn.get(args[0]);
                return r ? { key_prefix: r.key_prefix, tier: r.tier } : null;
              }
              if (s.includes("FROM licences WHERE key_hash")) {
                const r = licences.get(args[0]);
                return r ? { tier: r.tier, status: r.status, reports_used: r.reports_used, seats: r.seats } : null;
              }
              return null;
            },
            async run() {
              if (s.includes("INSERT INTO licences")) {
                const [key_prefix, key_hash, tier, email, txn, cust, price, seats] = args;
                const row = { key_prefix, key_hash, tier, email, txn, cust, price, seats, reports_used: 0, status: "active" };
                licences.set(key_hash, row);
                byTxn.set(txn, row);
              } else if (s.includes("INSERT INTO webhook_events") || s.includes("INSERT OR IGNORE INTO webhook_events")) {
                events.add(args[0]);
              } else if (s.includes("UPDATE licences SET status")) {
                const row = byTxn.get(args[1]);
                if (row && row.status === "active") row.status = "revoked";
              }
              return { success: true };
            },
            async all() { return { results: [] }; },
          };
        },
      };
    },
  };
}

function makeEnv(db, fetchCalls) {
  return {
    DB: db,
    PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    PADDLE_API_KEY: "pdl_test_api_key",
    PADDLE_PRICE_IDS: JSON.stringify(PRICE_IDS),
    LICENCE_ED25519_PRIVATE_KEY: PRIVATE_PEM,
    LICENCE_ED25519_PUBLIC_KEY: PUBLIC_SPKI_B64,
    RESEND_API_KEY: "re_test_key",
    RESEND_FROM: "ArchiveCheck <licences@example.com>",
    APP_URL: "https://app.example.com",
    __fetchCalls: fetchCalls,
  };
}

function signPayload(rawBody) {
  const ts = String(Math.floor(Date.now() / 1000));
  const h1 = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}:${rawBody}`).digest("hex");
  return `ts=${ts};h1=${h1}`;
}

function installFetchStub(fetchCalls) {
  globalThis.fetch = async (url, opts = {}) => {
    fetchCalls.push({ url: String(url), body: opts.body || null });
    if (String(url).includes("api.resend.com/emails")) {
      return { ok: true, status: 200, json: async () => ({ id: "re_test123" }), text: async () => "{}" };
    }
    if (String(url).includes("api.paddle.com/customers/")) {
      return { ok: true, status: 200, json: async () => ({ data: { email: "buyer@example.com" } }), text: async () => "{}" };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "not found" };
  };
}

// Same as installFetchStub, but Resend fails (rate limit / bad key /
// down) so the email-failure path can be tested.
function installFetchStubResendFails(fetchCalls, status = 429) {
  globalThis.fetch = async (url, opts = {}) => {
    fetchCalls.push({ url: String(url), body: opts.body || null });
    if (String(url).includes("api.resend.com/emails")) {
      return { ok: false, status, json: async () => ({ message: "rate limited" }), text: async () => "rate limited" };
    }
    if (String(url).includes("api.paddle.com/customers/")) {
      return { ok: true, status: 200, json: async () => ({ data: { email: "buyer@example.com" } }), text: async () => "{}" };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "not found" };
  };
}

function transactionEvent(eventId, txnId, priceId, email) {
  return {
    event_id: eventId, event_type: "transaction.completed",
    data: {
      id: txnId, customer_id: "ctm_123",
      items: [{ price: { id: priceId }, quantity: 1 }],
      custom_data: email ? { email } : {},
    },
  };
}

async function postWebhook(env, event, headerOverride) {
  const rawBody = JSON.stringify(event);
  const req = new Request("https://example.com/api/paddle-webhook", {
    method: "POST",
    headers: { "Paddle-Signature": headerOverride ?? signPayload(rawBody), "Content-Type": "application/json" },
    body: rawBody,
  });
  const res = await webhook({ request: req, env });
  return { status: res.status, body: await res.json() };
}

test("verifyPaddleSignature: valid, wrong secret, stale ts", () => {
  const raw = JSON.stringify({ a: 1 });
  const header = signPayload(raw);
  assert.equal(verifyPaddleSignature(raw, header, [WEBHOOK_SECRET]).ok, true);
  assert.equal(verifyPaddleSignature(raw, header, ["wrong"]).ok, false);
  assert.equal(verifyPaddleSignature(raw, "", [WEBHOOK_SECRET]).ok, false);
  const oldTs = String(Math.floor(Date.now() / 1000) - 3600);
  const oldH1 = createHmac("sha256", WEBHOOK_SECRET).update(`${oldTs}:${raw}`).digest("hex");
  assert.equal(verifyPaddleSignature(raw, `ts=${oldTs};h1=${oldH1}`, [WEBHOOK_SECRET]).ok, false);
});

test("transaction.completed mints a DP2 key, stores it, emails it", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  const { status, body } = await postWebhook(env, transactionEvent("evt_1", "txn_1", "pri_pro", "buyer@example.com"));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.tier, "pro");
  assert.equal(db.byTxn.size, 1);
  assert.equal(db.events.size, 1);
  const resend = fetchCalls.find((c) => c.url.includes("resend.com"));
  assert.ok(resend, "Resend was called");
  const mail = JSON.parse(resend.body);
  assert.deepEqual(mail.to, ["buyer@example.com"]);
  assert.match(mail.subject, /Pro Pack/);
  const key = mail.html.match(/DP2-[A-Za-z0-9\-_]+/)?.[0];
  assert.ok(key, "email contains the licence key");
  assert.match(mail.text, /DP2-PRO-/);
  // The minted key verifies against the test public key (Node side).
  const { verifyKey } = await import("../functions/_lib/dp2.js");
  assert.equal(verifyKey(key, PUBLIC_SPKI_B64).valid, true);
  // Cross-check artefact for the Python test.
  writeFileSync("/tmp/paddle_webhook_e2e.json", JSON.stringify({ key, public_key_spki_b64: PUBLIC_SPKI_B64 }));
});

test("duplicate event and duplicate transaction never mint twice", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  const evt = transactionEvent("evt_2", "txn_2", "pri_starter", "buyer@example.com");
  const first = await postWebhook(env, evt);
  assert.equal(first.status, 200);
  const again = await postWebhook(env, evt);
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  const newEventSameTxn = transactionEvent("evt_3", "txn_2", "pri_starter", "buyer@example.com");
  const third = await postWebhook(env, newEventSameTxn);
  assert.equal(third.body.duplicate, true);
  assert.equal(db.byTxn.size, 1);
  assert.equal(fetchCalls.filter((c) => c.url.includes("resend.com")).length, 1);
});

test("licence email contains key, tier, caps and lost-key line", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  const { status, body } = await postWebhook(env, transactionEvent("evt_10", "txn_10", "pri_pro", "buyer@example.com"));
  assert.equal(status, 200);
  assert.equal(body.email_sent, true);
  assert.equal(body.email_id, "re_test123");
  const resend = fetchCalls.find((c) => c.url.includes("resend.com"));
  const mail = JSON.parse(resend.body);
  assert.equal(mail.from, "ArchiveCheck <licences@example.com>");
  assert.match(mail.text, /2,500 captures per search, all 14 networks/);
  assert.match(mail.text, /reply to this email/);
  assert.match(mail.text, /https:\/\/app\.example\.com\/dashboard\.html/);
  assert.match(mail.html, /2,500 captures per search/);
  assert.match(mail.html, /Verify my key/);
});

test("no RESEND_API_KEY: purchase still succeeds, email skipped, licence row intact", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  delete env.RESEND_API_KEY; // email never configured
  const { status, body } = await postWebhook(env, transactionEvent("evt_11", "txn_11", "pri_starter", "buyer@example.com"));
  assert.equal(status, 200, "email must never block the purchase");
  assert.equal(body.ok, true);
  assert.equal(body.email_sent, false);
  assert.match(body.email_error, /RESEND_API_KEY not configured/);
  assert.equal(db.byTxn.size, 1, "licence row is stored");
  assert.equal(db.byTxn.get("txn_11").status, "active");
  assert.equal(fetchCalls.filter((c) => c.url.includes("resend.com")).length, 0, "no Resend call without a key");
});

test("Resend 4xx/5xx: purchase still succeeds, failure logged, licence row intact", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStubResendFails(fetchCalls, 429);
  const env = makeEnv(db, fetchCalls);
  const { status, body } = await postWebhook(env, transactionEvent("evt_12", "txn_12", "pri_pro", "buyer@example.com"));
  assert.equal(status, 200, "a Resend failure must not fail the purchase");
  assert.equal(body.ok, true);
  assert.equal(body.email_sent, false);
  assert.match(body.email_error, /429/);
  assert.equal(db.byTxn.size, 1, "licence row is stored");
  assert.equal(db.byTxn.get("txn_12").status, "active");
  assert.equal(fetchCalls.filter((c) => c.url.includes("resend.com")).length, 1);
});

test("bundle maps to studio; unmapped price fails 500; bad signature 401", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  const bundle = await postWebhook(env, transactionEvent("evt_4", "txn_4", "pri_bundle", "buyer@example.com"));
  assert.equal(bundle.status, 200);
  assert.equal(bundle.body.tier, "studio");
  const unmapped = await postWebhook(env, transactionEvent("evt_5", "txn_5", "pri_unknown", "buyer@example.com"));
  assert.equal(unmapped.status, 500);
  assert.match(unmapped.body.error, /unmapped price_id/);
  const badSig = await postWebhook(env, transactionEvent("evt_6", "txn_6", "pri_pro", "buyer@example.com"), "ts=1;h1=deadbeef");
  assert.equal(badSig.status, 401);
});

test("refund revokes the licence; licence-check sees it", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  await postWebhook(env, transactionEvent("evt_7", "txn_7", "pri_studio", "buyer@example.com"));
  const row = db.byTxn.get("txn_7");
  assert.equal(row.status, "active");
  const refund = { event_id: "evt_8", event_type: "transaction.refunded", data: { id: "txn_7", transaction_id: "txn_7" } };
  const res = await postWebhook(env, refund);
  assert.equal(res.status, 200);
  assert.equal(row.status, "revoked");
  // licence-check: revoked -> valid false
  const mail = fetchCalls.find((c) => c.url.includes("resend.com"));
  const key = JSON.parse(mail.body).html.match(/DP2-[A-Za-z0-9\-_]+/)?.[0];
  const checkReq = new Request("https://example.com/api/licence-check", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  const check = await licenceCheck({ request: checkReq, env });
  const checkBody = await check.json();
  assert.equal(checkBody.valid, false);
  assert.equal(checkBody.status, "revoked");
});

test("licence-check: active key valid, DP1 refused, unknown key honest", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  await postWebhook(env, transactionEvent("evt_9", "txn_9", "pri_pro", "buyer@example.com"));
  const mail = fetchCalls.find((c) => c.url.includes("resend.com"));
  const key = JSON.parse(mail.body).html.match(/DP2-[A-Za-z0-9\-_]+/)?.[0];
  async function check(k) {
    const req = new Request("https://example.com/api/licence-check", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: k }),
    });
    const res = await licenceCheck({ request: req, env });
    return res.json();
  }
  const active = await check(key);
  assert.equal(active.valid, true);
  assert.equal(active.tier, "pro");
  assert.equal(active.reports_included, 0);
  const dp1 = await check("DP1-PRO-ABCDEFGHIJKLMNOP-12345678");
  assert.equal(dp1.valid, false);
  assert.match(dp1.reason, /dev\/demo/);
  const orphan = mintKey("pro", PRIVATE_PEM); // valid sig, no D1 row
  const orphanCheck = await check(orphan);
  assert.equal(orphanCheck.valid, true);
  assert.equal(orphanCheck.status, "unknown");
});

test("web licence.js verifies DP2 keys (WebCrypto Ed25519)", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  // Web licence.js uses the baked-in PRODUCTION public key; for this
  // test, verify the parse path with the production JWK by minting
  // against it is impossible (no private key) — so assert the shape:
  // a key minted with the test keypair must NOT verify against the
  // production JWK, and a malformed key fails closed.
  const wrong = await WEB_LICENCE.verifyKeyDP2(key);
  assert.equal(wrong.valid, false);
  assert.match(wrong.reason, /signature mismatch/);
  const malformed = await WEB_LICENCE.verifyKeyDP2("DP2-PRO-ABC");
  assert.equal(malformed.valid, false);
  // Positive path: temporarily point the JWK at the test keypair.
  const testJwk = publicKey.export({ format: "jwk" });
  const orig = WEB_LICENCE.DP2_KEY.jwk;
  WEB_LICENCE.DP2_KEY.jwk = { kty: "OKP", crv: "Ed25519", x: testJwk.x };
  try {
    const ok = await WEB_LICENCE.verifyKeyDP2(key);
    assert.equal(ok.valid, true);
    assert.equal(ok.tier, "studio");
    assert.equal(ok.scheme, "DP2");
    const viaDispatcher = await WEB_LICENCE.verifyAnyKey(key);
    assert.equal(viaDispatcher.valid, true);
  } finally {
    WEB_LICENCE.DP2_KEY.jwk = orig;
  }
});
