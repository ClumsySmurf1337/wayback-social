/* Node test for functions/api/packs-upload.js — no dependencies, no browser.
 *
 * Run:  node functions/api/packs-upload.test.mjs
 * Exit 0 = the presigned-upload endpoint behaves: licence verification
 * (DP2 via _lib/dp2.js, DP1 rejected as demo-only), size/sha validation,
 * free-vs-paid object prefix + retention, fail-closed 503 without R2
 * credentials, and a SigV4 signature that verifies against an
 * INDEPENDENT recomputation (node createHmac — not the implementation's
 * WebCrypto path), so a signing bug fails here instead of at R2.
 *
 * The test mints its own throwaway Ed25519 keypair at runtime — no
 * secrets, no D1, no network. R2 env values are fake; nothing is
 * uploaded anywhere (the URL is verified, never fetched).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, generateKeyPairSync } from "node:crypto";
import { mintKey } from "../_lib/dp2.js";
import { onRequest, presignPut, MAX_PACK_BYTES, URL_TTL_SECONDS } from "./packs-upload.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const PUBLIC_B64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

const R2 = {
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  PACKS_BUCKET: "deletedproof-packs",
};
const SHA = "a".repeat(64);
const BASE_ENV = { LICENCE_ED25519_PUBLIC_KEY: PUBLIC_B64, ...R2 };

function req(method, body) {
  return {
    method,
    json: async () => {
      if (body === undefined) throw new Error("bad json");
      return body;
    },
  };
}

async function call(body, env = BASE_ENV, method = "POST") {
  const res = await onRequest({ request: req(method, body), env });
  return { status: res.status, body: JSON.parse(await res.text()) };
}

function studioKey() { return mintKey("studio", PRIVATE_PEM); }
function freeKey() { return mintKey("free", PRIVATE_PEM); }

/** Independent SigV4 (node createHmac) — recompute the signature for a URL. */
function independentSignature(url) {
  const u = new URL(url);
  const amzdate = u.searchParams.get("X-Amz-Date");
  const stamp = amzdate.slice(0, 8);
  const host = u.host;
  const bucket = "deletedproof-packs";
  const objectKey = u.pathname.slice(1 + bucket.length + 1);
  const credential = `${R2.R2_ACCESS_KEY_ID}/${stamp}/auto/s3/aws4_request`;
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzdate,
    "X-Amz-Expires": String(URL_TTL_SECONDS),
    "X-Amz-SignedHeaders": "host",
  });
  const canonical = ["PUT", `/${bucket}/${objectKey}`, params.toString(),
    `host:${host}`, "", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const scope = `${stamp}/auto/s3/aws4_request`;
  const sts = ["AWS4-HMAC-SHA256", amzdate, scope,
    createHash("sha256").update(canonical).digest("hex")].join("\n");
  const h = (k, d) => createHmac("sha256", k).update(d).digest();
  const kSigning = h(h(h(h(`AWS4${R2.R2_SECRET_ACCESS_KEY}`, stamp), "auto"), "s3"), "aws4_request");
  return { signature: createHmac("sha256", kSigning).update(sts).digest("hex"), amzdate };
}

test("happy path: studio key gets a presigned PUT URL, paid prefix, 365-day retention", async () => {
  const { status, body } = await call({ key: studioKey(), size: 3_000_000, sha256: SHA });
  assert.equal(status, 200);
  assert.equal(body.valid, true);
  assert.equal(body.tier, "studio");
  assert.equal(body.retention_days, 365);
  assert.equal(body.expires_in, 900);
  assert.equal(body.method, "PUT");
  assert.equal(body.content_type, "application/zip");
  assert.match(body.object_key, /^packs\/paid\/[0-9a-f]{8}\/a{64}\.zip$/);
  assert.equal(body.bucket, "deletedproof-packs");
  assert.equal(body.size, 3_000_000);
  const u = new URL(body.upload_url);
  assert.equal(u.host, `${R2.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  assert.equal(u.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(u.searchParams.get("X-Amz-Expires"), "900");
  assert.equal(u.searchParams.get("X-Amz-SignedHeaders"), "host");
});

test("presigned signature verifies against an independent SigV4 recomputation", async () => {
  const { body } = await call({ key: studioKey(), size: 1024, sha256: SHA });
  const u = new URL(body.upload_url);
  const { signature } = independentSignature(body.upload_url);
  assert.equal(u.searchParams.get("X-Amz-Signature"), signature);
  assert.match(signature, /^[0-9a-f]{64}$/);
});

test("presignPut with a fixed date is byte-identical to the independent computation", async () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const objectKey = "packs/paid/deadbeef/" + "b".repeat(64) + ".zip";
  const url = await presignPut({
    accountId: R2.R2_ACCOUNT_ID, accessKey: R2.R2_ACCESS_KEY_ID,
    secretKey: R2.R2_SECRET_ACCESS_KEY, bucket: R2.PACKS_BUCKET, objectKey, now,
  });
  const { signature } = independentSignature(url);
  assert.equal(new URL(url).searchParams.get("X-Amz-Signature"), signature);
  assert.ok(url.includes("X-Amz-Date=20261126T120000Z"));
});

test("free tier goes to packs/free/ with 30-day retention", async () => {
  const { status, body } = await call({ key: freeKey(), size: 1024, sha256: SHA });
  assert.equal(status, 200);
  assert.match(body.object_key, /^packs\/free\//);
  assert.equal(body.retention_days, 30);
});

test("DP1 demo key is rejected for cloud upload", async () => {
  const { status, body } = await call({
    key: "DP1-STUDIO-372HNQ5XFCL23X5T-1817d678", size: 1024, sha256: SHA });
  assert.equal(status, 200);
  assert.equal(body.valid, false);
  assert.match(body.reason, /DP1/);
});

test("tampered DP2 key is rejected", async () => {
  const bad = studioKey().slice(0, -2) + "AA";
  const { body } = await call({ key: bad, size: 1024, sha256: SHA });
  assert.equal(body.valid, false);
});

test("unknown key format is rejected", async () => {
  const { body } = await call({ key: "nope", size: 1024, sha256: SHA });
  assert.equal(body.valid, false);
  assert.equal(body.reason, "unknown key format");
});

test("oversize pack is rejected (max 10 MB)", async () => {
  const { status, body } = await call({
    key: studioKey(), size: MAX_PACK_BYTES + 1, sha256: SHA });
  assert.equal(status, 400);
  assert.equal(body.max_bytes, MAX_PACK_BYTES);
});

test("zero/negative/non-integer size is rejected", async () => {
  for (const size of [0, -5, 1.5, "1024", null]) {
    const { status } = await call({ key: studioKey(), size, sha256: SHA });
    assert.equal(status, 400, `size ${JSON.stringify(size)}`);
  }
});

test("bad sha256 is rejected (must be 64 lowercase hex)", async () => {
  for (const sha256 of ["xyz", "a".repeat(63), "a".repeat(65), 123, null]) {
    const { status } = await call({ key: studioKey(), size: 1024, sha256 });
    assert.equal(status, 400, `sha ${JSON.stringify(sha256)}`);
  }
});

test("uppercase sha256 is normalised to lowercase and accepted", async () => {
  const { status, body } = await call({
    key: studioKey(), size: 1024, sha256: "B".repeat(64) });
  assert.equal(status, 200);
  assert.equal(body.sha256, "b".repeat(64));
  assert.ok(body.object_key.endsWith(`${"b".repeat(64)}.zip`));
});

test("missing key / missing JSON / non-POST", async () => {
  const noKey = await call({ size: 1024, sha256: SHA });
  assert.equal(noKey.status, 400);
  const badJson = await onRequest({ request: req("POST", undefined), env: BASE_ENV });
  assert.equal(badJson.status, 400);
  const get = await onRequest({ request: req("GET", {}), env: BASE_ENV });
  assert.equal(get.status, 405);
});

test("missing R2 credentials fail closed with 503 (licence still verified)", async () => {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, ...noR2 } = BASE_ENV;
  const { status, body } = await call(
    { key: studioKey(), size: 1024, sha256: SHA }, noR2);
  assert.equal(status, 503);
  assert.equal(body.valid, true); // key was fine; the service is not configured
  assert.match(body.error, /R2 not configured/);
});

test("name is sanitised, defaults to evidence-pack.zip", async () => {
  const { body } = await call({ key: studioKey(), size: 1024, sha256: SHA });
  assert.equal(body.name, "evidence-pack.zip");
  const named = await call({
    key: studioKey(), size: 1024, sha256: SHA, name: "../../etc/passwd" });
  assert.equal(named.body.name, "passwd.zip");
  assert.ok(!named.body.name.includes("/"));
});
