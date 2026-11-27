// Shared licence-key verification for Pages Functions — the one place
// that knows how a key proves itself, so link-licence, evidence-
// usage and billing-portal never drift apart.
//
// DP2 (Ed25519, minted by the Paddle webhook) is verified with the
// shared verifier in ./dp2.js against env LICENCE_ED25519_PUBLIC_KEY
// (SPKI DER base64). DP1 (HMAC-SHA256, dev/demo keys) mirrors
// licence.py / licence.js: checksum = HMAC("DP1:<TIER>:<RANDOM>",
// secret)[:8], secret from env LICENCE_SECRET (the production
// minting secret — NOT the public demo secret).
//
// verifyLicenceKey(key, env) returns:
//   { valid: true, tier, scheme: "DP1" | "DP2" }
//   { valid: false, reason, status: 400 | 503, unconfigured: bool }
// Status mirrors what link-licence.js returned before this
// extraction: a missing secret/key for the key's scheme is 503 "not
// configured" (the endpoint cannot verify, so it must not guess);
// a malformed key or a bad signature/checksum is 400. A DP2-
// prefix (case-insensitive) takes the DP2 path; anything else takes
// the DP1 path, which returns "malformed key" for garbage — exactly
// as link-licence did.
//
// Whether an endpoint ACCEPTS a DP1 key is the endpoint's call —
// the verifier only reports validity. licence-check.js refuses DP1
// by design (demo-only, no revocation record); evidence-usage and
// billing-portal accept DP1 (local-first Studio keys are DP1 until
// a purchase mints DP2; test-mode portal sessions are keyed on the
// D1 row, not the scheme).
//
// NOTE: files under functions/_lib/ are ignored by the Pages
// Functions router (underscore prefix) — this is not a route.
import { verifyKey as verifyDP2 } from "./dp2.js";

const DP1_PREFIX = "DP1";
const TIERS = ["free", "starter", "pro", "studio"];

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseDp1(key) {
  const parts = (key || "").trim().split("-");
  if (parts.length !== 4 || parts[0] !== DP1_PREFIX) return null;
  const tier = parts[1].toLowerCase();
  if (TIERS.indexOf(tier) < 0) return null;
  if (parts[2].length !== 16 || !/^[A-Z0-9]+$/.test(parts[2])) return null;
  if (parts[3].length !== 8 || !/^[0-9a-fA-F]+$/.test(parts[3])) return null;
  return { tier, random: parts[2], checksum: parts[3].toLowerCase() };
}

async function verifyDp1(key, secret) {
  const parsed = parseDp1(key);
  if (!parsed) return { valid: false, reason: "malformed key — expected DP1-<TIER>-<16 chars>-<8 hex chars>" };
  const expected = (await hmacHex(secret, `${DP1_PREFIX}:${parsed.tier.toUpperCase()}:${parsed.random}`)).slice(0, 8);
  if (expected !== parsed.checksum) {
    return { valid: false, reason: "checksum mismatch — not minted with this secret" };
  }
  return { valid: true, tier: parsed.tier };
}

export async function verifyLicenceKey(key, env) {
  const k = (key || "").trim();
  if (!k) return { valid: false, reason: "licence key is required", status: 400, unconfigured: false };
  if (k.toUpperCase().startsWith("DP2-")) {
    if (!env.LICENCE_ED25519_PUBLIC_KEY) {
      return { valid: false, reason: "DP2 public key not configured (LICENCE_ED25519_PUBLIC_KEY env var)", status: 503, unconfigured: true };
    }
    const check = verifyDP2(k, env.LICENCE_ED25519_PUBLIC_KEY);
    if (!check.valid) return { valid: false, reason: check.reason, status: 400, unconfigured: false };
    return { valid: true, tier: check.tier, scheme: "DP2" };
  }
  if (!env.LICENCE_SECRET) {
    return { valid: false, reason: "licence secret not configured (LICENCE_SECRET env var)", status: 503, unconfigured: true };
  }
  const check = await verifyDp1(k, env.LICENCE_SECRET);
  if (!check.valid) return { valid: false, reason: check.reason, status: 400, unconfigured: false };
  return { valid: true, tier: check.tier, scheme: "DP1" };
}
