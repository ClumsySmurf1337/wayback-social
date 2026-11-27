/* Node test for functions/api/evidence-usage.js — no dependencies, no browser.
 *
 * Run:  node functions/api/evidence-usage.test.mjs
 * Exit 0 = GET returns the server count for a key with a D1 row (and
 * the local-first count as a fallback hint without a key / without
 * D1), POST records one used report, a retried POST with the same
 * idempotency key returns the current count without incrementing,
 * used-up / non-Studio / revoked / no-row / unconfigured cases fail
 * honestly, and DP1 keys ARE verified here (unlike licence-check,
 * which refuses them as demo-only).
 *
 * The test mints its own throwaway Ed25519 keypair at runtime and a
 * DP1 key with the test HMAC secret — no secrets, no D1, no network.
 * The D1 mock is in-memory and dispatches on the SQL the endpoint
 * actually issues (SELECT licences / SELECT logs / INSERT OR IGNORE
 * logs / UPDATE licences).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, generateKeyPairSync } from "node:crypto";
import { mintKey } from "../_lib/dp2.js";
import { verifyLicenceKey } from "../_lib/verify-key.js";
import { onRequest } from "./evidence-usage.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const PUBLIC_B64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const SECRET = "test-licence-secret";
const BASE_ENV = { LICENCE_ED25519_PUBLIC_KEY: PUBLIC_B64, LICENCE_SECRET: SECRET };

function sha(key) { return createHash("sha256").update(key, "utf8").digest("hex"); }

/** Mint a DP1 key with the test secret (mirrors licence.py). */
function dp1Key(tier, random = "ABCDEFGH23456789") {
  const checksum = createHmac("sha256", SECRET)
    .update(`DP1:${tier.toUpperCase()}:${random}`).digest("hex").slice(0, 8);
  return `DP1-${tier.toUpperCase()}-${random}-${checksum}`;
}

function mockDb() {
  const licences = new Map(); // key_hash -> {tier, status, reports_used}
  const logs = new Map();     // idempotency_key -> {key_hash, created_at}
  return {
    licences, logs,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            first: async () => {
              if (sql.includes("FROM licences WHERE key_hash")) {
                const row = licences.get(args[0]);
                if (!row) return null;
                if (sql.startsWith("SELECT reports_used")) return { reports_used: row.reports_used };
                return { tier: row.tier, status: row.status, reports_used: row.reports_used };
              }
              if (sql.includes("FROM evidence_report_logs WHERE idempotency_key")) {
                return logs.get(args[0]) || null;
              }
              throw new Error("unexpected SELECT in mock: " + sql);
            },
            run: async () => {
              if (sql.includes("INSERT OR IGNORE INTO evidence_report_logs")) {
                const [idem, hash, now] = args;
                if (logs.has(idem)) return { success: true, meta: { changes: 0 } };
                logs.set(idem, { key_hash: hash, created_at: now });
                return { success: true, meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE licences SET reports_used")) {
                const row = licences.get(args[0]);
                if (!row) return { success: true, meta: { changes: 0 } };
                row.reports_used += 1;
                return { success: true, meta: { changes: 1 } };
              }
              throw new Error("unexpected run() in mock: " + sql);
            },
          };
        },
      };
    },
  };
}

function envWithRow(key, tier, status = "active", used = 0) {
  const db = mockDb();
  db.licences.set(sha(key), { tier, status, reports_used: used });
  return { env: { ...BASE_ENV, DB: db }, db };
}

function getReq(key, localUsed) {
  const u = new URL("https://example.com/api/evidence-usage");
  if (key) u.searchParams.set("key", key);
  if (localUsed !== undefined) u.searchParams.set("local_used", String(localUsed));
  return { method: "GET", url: u.toString() };
}
function postReq(body) {
  return { method: "POST", json: async () => body };
}
async function call(request, env) {
  const res = await onRequest({ request, env });
  return { status: res.status, body: JSON.parse(await res.text()) };
}

// --- the shared verifier (functions/_lib/verify-key.js) ----------------
test("verifyLicenceKey: DP2 valid, DP1 valid, garbage 400, missing secret 503", async () => {
  const dp2 = await verifyLicenceKey(mintKey("studio", PRIVATE_PEM), BASE_ENV);
  assert.equal(dp2.valid, true);
  assert.equal(dp2.tier, "studio");
  assert.equal(dp2.scheme, "DP2");
  const dp1 = await verifyLicenceKey(dp1Key("starter"), BASE_ENV);
  assert.equal(dp1.valid, true);
  assert.equal(dp1.tier, "starter");
  assert.equal(dp1.scheme, "DP1");
  const bad = await verifyLicenceKey("DP1-STUDIO-ABCDEFGH23456789-00000000", BASE_ENV);
  assert.equal(bad.valid, false);
  assert.equal(bad.status, 400);
  const noPub = await verifyLicenceKey(mintKey("studio", PRIVATE_PEM), { LICENCE_SECRET: SECRET });
  assert.equal(noPub.valid, false);
  assert.equal(noPub.status, 503);
  assert.equal(noPub.unconfigured, true);
  const noSecret = await verifyLicenceKey(dp1Key("pro"), { LICENCE_ED25519_PUBLIC_KEY: PUBLIC_B64 });
  assert.equal(noSecret.valid, false);
  assert.equal(noSecret.status, 503);
  assert.equal(noSecret.unconfigured, true);
});

// --- GET -----------------------------------------------------------------
test("GET no key: local-first hint, free shape, unverified", async () => {
  const { status, body } = await call(getReq(null, 3), BASE_ENV);
  assert.equal(status, 200);
  assert.equal(body.used, 3);
  assert.equal(body.included, 0);
  assert.equal(body.remaining, 0);
  assert.equal(body.tier, "free");
  assert.equal(body.source, "local");
  assert.equal(body.verified, false);
});

test("GET DP2 studio key with a D1 row: server count", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env } = envWithRow(key, "studio", "active", 3);
  const { status, body } = await call(getReq(key), env);
  assert.equal(status, 200);
  assert.equal(body.used, 3);
  assert.equal(body.included, 10);
  assert.equal(body.remaining, 7);
  assert.equal(body.tier, "studio");
  assert.equal(body.status, "active");
  assert.equal(body.source, "server");
  assert.equal(body.verified, true);
});

test("GET valid key, no D1 row: 404 (not a free pass)", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { status, body } = await call(getReq(key), { ...BASE_ENV, DB: mockDb() });
  assert.equal(status, 404);
  assert.match(body.error, /no server record/);
});

test("GET invalid key: 400", async () => {
  const { status, body } = await call(
    getReq("DP1-STUDIO-ABCDEFGH23456789-00000000"), { ...BASE_ENV, DB: mockDb() });
  assert.equal(status, 400);
  assert.match(body.error, /Invalid key/);
});

test("GET valid key, no DB binding: local hint with the key's tier", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { status, body } = await call(getReq(key, 2), BASE_ENV);
  assert.equal(status, 200);
  assert.equal(body.source, "local");
  assert.equal(body.verified, true);
  assert.equal(body.tier, "studio");
  assert.equal(body.used, 2);
  assert.equal(body.included, 10);
  assert.equal(body.remaining, 8);
});

test("GET DP1 key, secret unconfigured: local hint, unverified", async () => {
  const { status, body } = await call(
    getReq(dp1Key("studio"), 2), { LICENCE_ED25519_PUBLIC_KEY: PUBLIC_B64 });
  assert.equal(status, 200);
  assert.equal(body.source, "local");
  assert.equal(body.verified, false);
  assert.match(body.note, /not configured/);
});

test("GET revoked row: counts still shown (read-only), status visible", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env } = envWithRow(key, "studio", "refunded", 5);
  const { status, body } = await call(getReq(key), env);
  assert.equal(status, 200);
  assert.equal(body.status, "refunded");
  assert.equal(body.used, 5);
});

// --- POST ----------------------------------------------------------------
test("POST happy path: one report recorded, then the same key is a duplicate", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env, db } = envWithRow(key, "studio", "active", 3);
  const first = await call(postReq({ key, idempotency_key: "r1" }), env);
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.used, 4);
  assert.equal(first.body.remaining, 6);
  assert.equal(first.body.duplicate, false);
  assert.equal(db.licences.get(sha(key)).reports_used, 4);
  assert.equal(db.logs.has("r1"), true);
  const retry = await call(postReq({ key, idempotency_key: "r1" }), env);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, true);
  assert.equal(retry.body.used, 4);
  assert.equal(db.licences.get(sha(key)).reports_used, 4);
});

test("POST DP1 studio key is accepted here (unlike licence-check)", async () => {
  const key = dp1Key("studio");
  const { env, db } = envWithRow(key, "studio", "active", 0);
  const { status, body } = await call(postReq({ key, idempotency_key: "d1" }), env);
  assert.equal(status, 200);
  assert.equal(body.used, 1);
  assert.equal(db.licences.get(sha(key)).reports_used, 1);
});

test("POST retry after success returns duplicate even when the pack is now used up", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env, db } = envWithRow(key, "studio", "active", 9);
  const first = await call(postReq({ key, idempotency_key: "r9" }), env);
  assert.equal(first.status, 200);
  assert.equal(first.body.used, 10);
  const retry = await call(postReq({ key, idempotency_key: "r9" }), env);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, true);
  assert.equal(retry.body.used, 10);
  assert.equal(db.licences.get(sha(key)).reports_used, 10);
});

test("POST used up: 403 with counts, and the idempotency key is NOT claimed", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env, db } = envWithRow(key, "studio", "active", 10);
  const { status, body } = await call(postReq({ key, idempotency_key: "full" }), env);
  assert.equal(status, 403);
  assert.match(body.error, /used up \(10\/10\)/);
  assert.equal(body.used, 10);
  assert.equal(body.remaining, 0);
  assert.equal(db.logs.has("full"), false);
  assert.equal(db.licences.get(sha(key)).reports_used, 10);
});

test("POST free tier: 403, evidence packs are Studio-only", async () => {
  const key = mintKey("free", PRIVATE_PEM);
  const { env } = envWithRow(key, "free", "active", 0);
  const { status, body } = await call(postReq({ key, idempotency_key: "f1" }), env);
  assert.equal(status, 403);
  assert.equal(body.included, 0);
  assert.match(body.error, /Studio pack only/);
});

test("POST revoked licence: 403", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env } = envWithRow(key, "studio", "revoked", 2);
  const { status, body } = await call(postReq({ key, idempotency_key: "v1" }), env);
  assert.equal(status, 403);
  assert.match(body.error, /revoked/);
});

test("POST valid key, no D1 row: 404", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { status, body } = await call(
    postReq({ key, idempotency_key: "n1" }), { ...BASE_ENV, DB: mockDb() });
  assert.equal(status, 404);
  assert.match(body.error, /no server record/);
});

test("POST no DB binding: 503 fail-closed (never silently drop a count)", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { status, body } = await call(postReq({ key, idempotency_key: "x" }), BASE_ENV);
  assert.equal(status, 503);
  assert.match(body.error, /D1 database not configured/);
});

test("POST no key / missing idempotency key / bad key: 400", async () => {
  const key = mintKey("studio", PRIVATE_PEM);
  const { env } = envWithRow(key, "studio", "active", 0);
  const noKey = await call(postReq({ idempotency_key: "x" }), env);
  assert.equal(noKey.status, 400);
  const noIdem = await call(postReq({ key }), env);
  assert.equal(noIdem.status, 400);
  assert.match(noIdem.body.error, /idempotency_key is required/);
  const badKey = await call(postReq({ key: "DP2-STUDIO-ABCDEFGH23456789-" + "A".repeat(86), idempotency_key: "x" }), env);
  assert.equal(badKey.status, 400);
});

test("POST unconfigured secrets: 503 (DP2 without pubkey, DP1 without secret)", async () => {
  const key2 = mintKey("studio", PRIVATE_PEM);
  const { env: env2 } = envWithRow(key2, "studio", "active", 0);
  const noPub = await call(postReq({ key: key2, idempotency_key: "p" }),
    { ...env2, LICENCE_ED25519_PUBLIC_KEY: undefined });
  assert.equal(noPub.status, 503);
  const key1 = dp1Key("studio");
  const { env: env1 } = envWithRow(key1, "studio", "active", 0);
  const noSecret = await call(postReq({ key: key1, idempotency_key: "s" }),
    { ...env1, LICENCE_SECRET: undefined });
  assert.equal(noSecret.status, 503);
});
