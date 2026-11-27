// GET/POST /api/link-licence — attach a licence key to a Clerk account.
//
// WHY: a licence key bought on Paddle is just a string. A signed-in
// user posts it here; the Function verifies the Clerk session, verifies
// the key, and stores the link in D1 so the tier follows the account
// across devices. The licence key still works on its own (paste it on
// any device) — linking is a convenience, not a requirement.
//
// AUTH: the session token is a Clerk JWT. It is verified by asking
// Clerk's Backend API about the session id in the token
// (GET https://api.clerk.com/v1/sessions/:id, CLERK_SECRET_KEY) —
// no JWT library needed in a no-build-step Function. If the secret
// key is not set, the endpoint answers 503 (auth not configured).
//
// KEY VERIFICATION: the shared verifier in
// functions/_lib/verify-key.js (DP1 HMAC-SHA256, mirroring
// licence.py / licence.js, secret from env LICENCE_SECRET; DP2
// Ed25519 via functions/_lib/dp2.js against env
// LICENCE_ED25519_PUBLIC_KEY, SPKI DER base64 — the same public
// key as functions/api/licence-check.js uses). See
// docs/clerk-auth.md §5.
//
// D1 SCHEMA (create it first — see docs/clerk-auth.md §4):
//   CREATE TABLE IF NOT EXISTS users (
//     clerk_user_id TEXT PRIMARY KEY,
//     email TEXT NOT NULL,
//     licence_key_hash TEXT,
//     tier TEXT NOT NULL DEFAULT 'free',
//     created_at INTEGER NOT NULL,
//     updated_at INTEGER NOT NULL
//   );
//   CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
// The Paddle webhook agent owns the `licences` table (key_hash,
// email, tier, seats...). The join between the two tables is the
// SHA-256 hex of the full licence key — the raw key is never stored
// here, only its hash. If D1 is not bound yet, this endpoint answers
// 503 with a clear message instead of failing obscurely.
//
// PRIVACY: only the Clerk user id, the email Clerk reports, the key
// hash and the tier are stored. No searched handles, no results.
import { keyHash } from "../_lib/dp2.js";
import { verifyLicenceKey } from "../_lib/verify-key.js";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json" },
  });
}

function base64UrlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}

function decodeJwtPayload(token) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch (e) {
    return null;
  }
}

/* Verify a Clerk session token via the Backend API. Returns
 * {userId, email} or throws {status, message}. */
async function verifyClerkSession(env, token) {
  if (!env.CLERK_SECRET_KEY) {
    throw { status: 503, message: "Clerk secret key not configured (CLERK_SECRET_KEY) — see docs/clerk-auth.md" };
  }
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.sid || !payload.sub) {
    throw { status: 401, message: "invalid session token" };
  }
  const sessionRes = await fetch(`https://api.clerk.com/v1/sessions/${payload.sid}`, {
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
  });
  if (!sessionRes.ok) {
    throw { status: 401, message: "session not valid" };
  }
  const session = await sessionRes.json();
  if (session.status !== "active" || session.user_id !== payload.sub) {
    throw { status: 401, message: "session not active" };
  }
  let email = null;
  const userRes = await fetch(`https://api.clerk.com/v1/users/${session.user_id}`, {
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
  });
  if (userRes.ok) {
    const user = await userRes.json();
    const primary = (user.email_addresses || []).find((e) => e.id === user.primary_email_address_id);
    email = (primary && primary.email_address) ||
      (user.email_addresses && user.email_addresses[0] && user.email_addresses[0].email_address) || null;
  }
  return { userId: session.user_id, email };
}

function bearerToken(request) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (!env || !env.DB) {
      return json({ error: "D1 database not configured yet (DB binding) — see docs/clerk-auth.md §4" }, 503);
    }
    const token = bearerToken(request);
    if (!token) return json({ error: "sign in first — no session token sent" }, 401);
    const session = await verifyClerkSession(env, token);

    if (request.method === "GET") {
      const row = await env.DB.prepare(
        "SELECT tier, email FROM users WHERE clerk_user_id = ?"
      ).bind(session.userId).first();
      if (!row) return json({ linked: false, tier: null, email: session.email });
      return json({ linked: true, tier: row.tier, email: row.email });
    }

    if (request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      const key = (body.licence_key || "").trim();
      if (!key) return json({ error: "licence_key is required" }, 400);
      const check = await verifyLicenceKey(key, env);
      if (!check.valid) {
        if (check.unconfigured) {
          return json({ error: check.reason + " — see docs/clerk-auth.md" }, 503);
        }
        return json({ error: "Invalid key: " + check.reason }, 400);
      }
      const hash = await keyHash(key);
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `INSERT INTO users (clerk_user_id, email, licence_key_hash, tier, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(clerk_user_id) DO UPDATE SET
           email = excluded.email,
           licence_key_hash = excluded.licence_key_hash,
           tier = excluded.tier,
           updated_at = excluded.updated_at`
      ).bind(session.userId, session.email || "", hash, check.tier, now, now).run();
      return json({ ok: true, linked: true, tier: check.tier, email: session.email });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (e) {
    if (e && e.status) return json({ error: e.message }, e.status);
    return json({ error: "link-licence failed: " + (e && e.message ? e.message : String(e)) }, 500);
  }
}
