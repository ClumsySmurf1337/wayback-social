// POST /api/licence-check {key} — server-side licence verification.
//
// Why this exists: offline verification (web/licence.js, the CLI)
// proves a key was minted with the production key, but it cannot
// know about refunds or revocations. This endpoint re-verifies the
// Ed25519 signature server-side AND checks D1 for the key's status
// and evidence-report usage. The dashboard calls it when online;
// offline mode still works, it just cannot see revocations.
//
// DP1 (HMAC dev) keys are NOT verified here — they are demo-only and
// verified offline in the browser/CLI. Asking this endpoint about a
// DP1 key returns valid:false with that reason.
//
// Response: {valid, tier, status, reports_used, reports_included,
// seats, email?} — the buyer email is never returned (support looks
// it up by key_prefix in D1). Env: LICENCE_ED25519_PUBLIC_KEY
// (SPKI DER base64 — same value as wayback_social/licence2.py).
// D1 binding: DB (wayback-social-licences).
import { verifyKey, keyHash } from "../_lib/dp2.js";
import { createHash } from "node:crypto";

const REPORTS_INCLUDED = { free: 0, starter: 0, pro: 0, studio: 10 };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
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
  const key = (body?.key || "").trim();
  if (!key) return json({ error: "missing key" }, 400);
  if (key.startsWith("DP1-")) {
    return json({ valid: false, tier: null,
      reason: "DP1 keys are dev/demo keys — verified offline only, not by this endpoint" });
  }
  if (!key.startsWith("DP2-")) return json({ valid: false, tier: null, reason: "unknown key format" });
  const publicKey = env.LICENCE_ED25519_PUBLIC_KEY || "";
  const check = verifyKey(key, publicKey);
  if (!check.valid) return json({ valid: false, tier: null, reason: check.reason });
  const hash = env.DB ? await keyHash(key) : sha256Hex(key);
  let row = null;
  if (env.DB) {
    row = await env.DB.prepare(
      "SELECT tier, status, reports_used, seats FROM licences WHERE key_hash = ?")
      .bind(hash).first();
  }
  if (!row) {
    // Signature is valid but no D1 row: minted before D1 existed, or
    // a test key. Valid signature wins; status is unknown, not revoked.
    return json({ valid: true, tier: check.tier, status: "unknown",
      reports_used: 0, reports_included: REPORTS_INCLUDED[check.tier] ?? 0,
      seats: check.tier === "studio" ? 5 : 1,
      note: "no D1 record — signature valid, revocation unknown" });
  }
  return json({
    valid: row.status === "active",
    tier: row.tier,
    status: row.status,
    reports_used: row.reports_used,
    reports_included: REPORTS_INCLUDED[row.tier] ?? 0,
    seats: row.seats,
    reason: row.status === "active" ? "valid" : `licence ${row.status}`,
  });
}
