// GET/POST /api/evidence-usage — server-side evidence-report usage.
//
// The browser counts evidence reports locally first
// (web/evidence-usage.js: Studio includes 10, warn at 9, block the
// 11th). This endpoint is the server half: the authoritative count
// lives in the D1 licences table (reports_used, migration 0001),
// incremented here once per report with an idempotency key so a
// retried POST never double-counts.
//
// GET ?key=<licence key>[&local_used=<n>]
//   - no key: the local-first count as an unverified hint
//     {used: local_used|0, included: 0, remaining: 0, tier: "free",
//     source: "local", verified: false} — the dashboard falls back
//     to this when the browser has no key or the server is
//     unconfigured.
//   - key, DB bound, row found: {used, included, remaining, tier,
//     status, source: "server", verified: true}.
//   - key, DB bound, no row: 404 — a key with no D1 row has no
//     server record (dev DP1 keys need a licences row, via the
//     webhook mint path or a manual insert; see docs/paddle-webhook.md).
//   - key, no DB binding: local fallback hint with the tier from
//     the key when it verifies (source: "local", verified: true,
//     note: server count unavailable).
//   - invalid key: 400.
// POST {key, idempotency_key}
//   - no DB binding: 503 fail-closed — a POST must never silently
//     drop a count; the browser keeps its local count and retries.
//   - no key / invalid key: 400; key valid but no D1 row: 404.
//   - missing idempotency_key: 400 (the client must supply one —
//     the browser generates one per report with crypto.randomUUID()).
//   - licence not active: 403 (revoked/refunded).
//   - tier with included 0: 403 (evidence packs are Studio-only).
//   - used >= included: 403, with the counts so the UI can offer
//     the top-up prompt.
//   - duplicate idempotency key: 200 {ok: true, ..., duplicate:
//     true}, no increment — a retry after a success returns the
//     current count even if the pack is used up by now.
//   - success: 200 {ok: true, used, included, remaining, tier,
//     status: "active", source: "server", duplicate: false}.
//
// Idempotency: the log row (evidence_report_logs, migration 0003)
// is the guard — check-then-INSERT OR IGNORE, the same pattern the
// Paddle webhook uses for webhook_events. The count itself lives
// ONLY in licences.reports_used: no second counter table, because
// two sources of truth would drift. The log table holds only
// (idempotency_key, key_hash, created_at).
//
// DP1 keys ARE verified here (unlike licence-check.js, which refuses
// them as demo-only): local-first Studio keys are DP1 until a
// purchase mints DP2, and the usage count is keyed on the D1 row —
// a DP1 key with no licences row gets 404, not a free pass.
//
// PRIVACY: only the key hash and the counts are read/written. No
// searched handles, no results.
//
// D1 SCHEMA (apply first — see migrations/0003_evidence_usage.sql):
//   evidence_report_logs (idempotency_key PK, key_hash, created_at)
//   + the licences.reports_used counter from migration 0001.
import { keyHash } from "../_lib/dp2.js";
import { verifyLicenceKey } from "../_lib/verify-key.js";

// Must match pricing.yaml (studio evidence_reports: 10) and
// functions/api/licence-check.js REPORTS_INCLUDED.
const REPORTS_INCLUDED = { free: 0, starter: 0, pro: 0, studio: 10 };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function counts(row) {
  const included = REPORTS_INCLUDED[row.tier] ?? 0;
  const used = row.reports_used || 0;
  return {
    used,
    included,
    remaining: Math.max(0, included - used),
    tier: row.tier,
    status: row.status,
    source: "server",
  };
}

function localHint(localUsed, tier, verified, note) {
  const included = REPORTS_INCLUDED[tier] ?? 0;
  return json({
    used: localUsed,
    included,
    remaining: Math.max(0, included - localUsed),
    tier,
    source: "local",
    verified,
    note,
  });
}

async function handleGet(request, env) {
  const url = new URL(request.url);
  const key = (url.searchParams.get("key") || "").trim();
  const localUsed = Math.max(0, parseInt(url.searchParams.get("local_used") || "0", 10) || 0);
  if (!key) {
    return localHint(localUsed, "free", false,
      "no licence key sent — local-first count shown");
  }
  const check = await verifyLicenceKey(key, env);
  if (!check.valid) {
    if (check.unconfigured) {
      // The server cannot verify any key right now — the dashboard
      // falls back to its local count rather than erroring.
      return localHint(localUsed, "free", false,
        "licence verification not configured (" + check.reason + ") — local count shown");
    }
    return json({ error: "Invalid key: " + check.reason }, 400);
  }
  if (!env.DB) {
    return localHint(localUsed, check.tier, true,
      "server count unavailable (D1 not bound) — local count shown");
  }
  const hash = await keyHash(key);
  const row = await env.DB.prepare(
    "SELECT tier, status, reports_used FROM licences WHERE key_hash = ?"
  ).bind(hash).first();
  if (!row) {
    return json({ error: "no server record for this key — the key has no D1 licences row (dev keys need one; see docs/paddle-webhook.md)" }, 404);
  }
  return json({ ...counts(row), verified: true });
}

async function handlePost(request, env) {
  if (!env.DB) {
    return json({ error: "D1 database not configured yet (DB binding) — see docs/paddle-webhook.md §4; the browser keeps its local count and retries" }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const key = (body && body.key ? String(body.key) : "").trim();
  if (!key) return json({ error: "licence key is required" }, 400);
  const idem = (body && body.idempotency_key ? String(body.idempotency_key) : "").trim();
  if (!idem) {
    return json({ error: "idempotency_key is required — generate one per report (crypto.randomUUID())" }, 400);
  }
  const check = await verifyLicenceKey(key, env);
  if (!check.valid) {
    if (check.unconfigured) {
      return json({ error: check.reason + " — see docs/paddle-webhook.md" }, 503);
    }
    return json({ error: "Invalid key: " + check.reason }, 400);
  }
  const hash = await keyHash(key);
  const row = await env.DB.prepare(
    "SELECT tier, status, reports_used FROM licences WHERE key_hash = ?"
  ).bind(hash).first();
  if (!row) {
    return json({ error: "no server record for this key — the key has no D1 licences row (dev keys need one; see docs/paddle-webhook.md)" }, 404);
  }
  const c = counts(row);
  // Idempotency first: a retried POST returns the current count
  // without incrementing, even if the pack is used up by now.
  const seen = await env.DB.prepare(
    "SELECT idempotency_key FROM evidence_report_logs WHERE idempotency_key = ?"
  ).bind(idem).first();
  if (seen) return json({ ok: true, ...c, verified: true, duplicate: true });
  if (row.status !== "active") {
    return json({ error: `licence ${row.status} — evidence reports are not available on this licence`, ...c }, 403);
  }
  if (c.included === 0) {
    return json({ error: "evidence reports are included in the Studio pack only — this tier includes 0", ...c }, 403);
  }
  if (c.used >= c.included) {
    return json({ error: `evidence reports used up (${c.used}/${c.included}) — the Studio pack includes 10; top up to continue`, ...c }, 403);
  }
  // Claim the idempotency key, then increment. INSERT OR IGNORE
  // loses a same-key race cleanly: meta.changes 0 means another
  // request claimed it first — re-read and return duplicate.
  // (Failure window: the claim succeeds but the UPDATE fails —
  // the licences row was just read, so this is near-impossible;
  // a retry then returns duplicate with the pre-claim count.)
  const now = Math.floor(Date.now() / 1000);
  const claimed = await env.DB.prepare(
    "INSERT OR IGNORE INTO evidence_report_logs (idempotency_key, key_hash, created_at) VALUES (?, ?, ?)"
  ).bind(idem, hash, now).run();
  if (!claimed.meta || claimed.meta.changes === 0) {
    const fresh = await env.DB.prepare(
      "SELECT reports_used FROM licences WHERE key_hash = ?"
    ).bind(hash).first();
    const used = (fresh && fresh.reports_used) || c.used;
    return json({ ok: true, used, included: c.included,
      remaining: Math.max(0, c.included - used),
      tier: c.tier, status: c.status, source: "server",
      verified: true, duplicate: true });
  }
  await env.DB.prepare(
    "UPDATE licences SET reports_used = reports_used + 1 WHERE key_hash = ?"
  ).bind(hash).run();
  const used = c.used + 1;
  return json({ ok: true, used, included: c.included,
    remaining: Math.max(0, c.included - used),
    tier: c.tier, status: c.status, source: "server",
    verified: true, duplicate: false });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (request.method === "GET") return handleGet(request, env);
    if (request.method === "POST") return handlePost(request, env);
    return json({ error: "method not allowed" }, 405);
  } catch (e) {
    return json({ error: "evidence-usage failed: " + (e && e.message ? e.message : String(e)) }, 500);
  }
}
