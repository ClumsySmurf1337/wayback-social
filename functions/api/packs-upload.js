// POST /api/packs-upload {key, size, sha256, name?} — presigned R2 PUT
// for an evidence pack (ZIP). Returns a 15-minute presigned URL the
// browser/CLI PUTs the pack to directly — R2 credentials never leave
// Cloudflare. No secrets in the browser, no pack bytes through the
// Function (packs are ~3 MB; the Function only mints the URL).
//
// Flow (see docs/storage-auth-plan.md §1):
//   1. Client calls this endpoint with a DP2 licence key + the pack's
//      byte size + SHA-256.
//   2. We verify the key (Ed25519, shared _lib/dp2.js) and the D1
//      licence status, then return a SigV4 presigned PUT URL bound to
//      one object key: packs/<free|paid>/<keyHash8>/<sha256>.zip
//      (content-addressed — a tampered upload cannot overwrite another
//      pack, and the confirm step can re-check the hash).
//   3. Client PUTs the ZIP to that URL (Content-Type: application/zip).
//   4. POST /api/pack-confirm (follow-up with the Paddle go-live,
//      needs a D1 `packs` table — migrations/0003, not yet written)
//      records the pack so the dashboard can show "expires on …".
//      Until then, retention is enforced by R2 lifecycle rules alone
//      (packs/free/* → 30 days, packs/paid/* → 365 days).
//
// Auth: DP2 keys only. DP1 keys are dev/demo keys — verified offline
// only, rejected here like in licence-check.js. A valid signature with
// no D1 row is allowed (minted before D1 / test key) with status
// "unknown", exactly like licence-check.js.
//
// Env (Pages secrets / vars — never in this repo):
//   LICENCE_ED25519_PUBLIC_KEY — SPKI DER base64 (same as licence2.py)
//   R2_ACCOUNT_ID              — Cloudflare account id (hex)
//   R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY — R2 S3 API token
//     (dashboard: R2 → Manage R2 API Tokens; object read+write on
//     the packs buckets only). Missing any R2 value → 503, fail-closed.
//   PACKS_BUCKET               — default "deletedproof-packs"
// D1 binding: DB (wayback-social-licences) — optional; without it the
// status check is skipped and the signature alone decides.
//
// Limits: pack 1 byte … 10 MB (packs are ~2–5 MB; 10 MB leaves room
// for the largest evidence ZIP). sha256 must be 64 lowercase hex.
// Free tier → packs/free/ (30-day retention), paid tiers →
// packs/paid/ (365-day retention). Free sources / free tiers only
// (standing rule, John 2026-11-26): R2 Standard free tier — 10 GB-mo,
// 1M Class A / 10M Class B ops/mo, free egress. Never Infrequent
// Access (no free tier), never a paid plan, until paying customers.
import { verifyKey, keyHash } from "../_lib/dp2.js";

export const MAX_PACK_BYTES = 10 * 1024 * 1024;
export const URL_TTL_SECONDS = 900; // 15 minutes
const RETENTION_DAYS = { free: 30, starter: 365, pro: 365, studio: 365 };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isHex64(s) {
  return typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
}

function asString(v) {
  return typeof v === "string" ? v : "";
}

function safeName(name) {
  const base = asString(name).split(/[\\/]/).pop() || "";
  if (!base) return "evidence-pack.zip";
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "").slice(0, 120);
  if (!clean) return "evidence-pack.zip";
  return clean.endsWith(".zip") ? clean : `${clean}.zip`;
}

async function hmacHex(keyBytes, data) {
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data) {
  const digest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function amzDates(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}`;
  const amzdate = `${stamp}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`;
  return { stamp, amzdate };
}

/** SigV4 presigned PUT URL for one R2 object. Exported for tests. */
export async function presignPut({ accountId, accessKey, secretKey, bucket, objectKey, now }) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const { stamp, amzdate } = amzDates(now);
  const credential = `${accessKey}/${stamp}/auto/s3/aws4_request`;
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzdate,
    "X-Amz-Expires": String(URL_TTL_SECONDS),
    "X-Amz-SignedHeaders": "host",
  });
  const canonicalRequest = [
    "PUT",
    `/${bucket}/${objectKey}`,
    params.toString(),
    `host:${host}`,
    "",
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const scope = `${stamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzdate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const enc = new TextEncoder();
  const kDate = await hmacRaw(`AWS4${secretKey}`, stamp, enc);
  const kRegion = await hmacRaw(kDate, "auto", enc);
  const kService = await hmacRaw(kRegion, "s3", enc);
  const kSigning = await hmacRaw(kService, "aws4_request", enc);
  const signature = await hmacHex(kSigning, stringToSign);
  params.set("X-Amz-Signature", signature);
  return `https://${host}/${bucket}/${objectKey}?${params.toString()}`;
}

async function hmacRaw(key, data, enc) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", typeof key === "string" ? enc.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data)));
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const key = asString(body?.key).trim();
  const size = body?.size;
  const sha256 = asString(body?.sha256).trim().toLowerCase();
  if (!key) return json({ error: "missing key" }, 400);
  if (!Number.isInteger(size) || size < 1 || size > MAX_PACK_BYTES) {
    return json({ error: `size must be 1..${MAX_PACK_BYTES} bytes`, max_bytes: MAX_PACK_BYTES }, 400);
  }
  if (!isHex64(sha256)) return json({ error: "sha256 must be 64 lowercase hex chars" }, 400);
  if (key.startsWith("DP1-")) {
    return json({ valid: false, tier: null,
      reason: "DP1 keys are dev/demo keys — cloud upload needs a DP2 purchase key" });
  }
  if (!key.startsWith("DP2-")) return json({ valid: false, tier: null, reason: "unknown key format" });
  const publicKey = env.LICENCE_ED25519_PUBLIC_KEY || "";
  const check = verifyKey(key, publicKey);
  if (!check.valid) return json({ valid: false, tier: null, reason: check.reason });
  let status = "unknown";
  if (env.DB) {
    const hash = await keyHash(key);
    const row = await env.DB.prepare(
      "SELECT status FROM licences WHERE key_hash = ?").bind(hash).first();
    if (row) {
      status = row.status;
      if (row.status !== "active") {
        return json({ valid: false, tier: check.tier, status: row.status,
          reason: `licence ${row.status}` });
      }
    }
  }
  const tier = check.tier;
  const prefix = tier === "free" ? "free" : "paid";
  const keyHash8 = (await keyHash(key)).slice(0, 8);
  const objectKey = `packs/${prefix}/${keyHash8}/${sha256}.zip`;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return json({ error: "R2 not configured — upload unavailable", valid: true, tier, status }, 503);
  }
  const bucket = env.PACKS_BUCKET || "deletedproof-packs";
  const uploadUrl = await presignPut({
    accountId: R2_ACCOUNT_ID,
    accessKey: R2_ACCESS_KEY_ID,
    secretKey: R2_SECRET_ACCESS_KEY,
    bucket,
    objectKey,
  });
  return json({
    valid: true, tier, status,
    upload_url: uploadUrl,
    object_key: objectKey,
    bucket,
    name: safeName(body?.name),
    size, sha256,
    content_type: "application/zip",
    expires_in: URL_TTL_SECONDS,
    retention_days: RETENTION_DAYS[tier] ?? 365,
    method: "PUT",
    note: "PUT the ZIP to upload_url within 15 minutes, Content-Type: application/zip. "
      + "Then confirm it with POST /api/pack-confirm (coming with the Paddle go-live).",
  });
}
