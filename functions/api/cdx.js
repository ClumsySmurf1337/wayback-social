// GET /api/cdx?url=...&output=json&limit=... — Cloudflare Pages
// Function that proxies the Wayback Machine CDX API.
//
// WHY: the browser page talks to web.archive.org directly, and
// archive.org does not send CORS headers — a live search from the
// deployed site fails in the browser (verified 2026-11-26 on
// deletedproof.northforgelabs.dev) and the page falls back to demo
// data. Same-origin /api/cdx has no CORS problem; the CLI is
// unaffected (it calls CDX directly, no browser involved).
//
// SAFETY: allowlisted query params only, no credentials, no POST,
// no request body is forwarded, responses are public and cached
// 5 minutes at the edge. Rate limits: the proxy shares the
// Workers/Pages Functions free budget (100k requests/day) — the
// page's Free-tier cap (25 captures/search) keeps one visitor from
// hammering archive.org through it.
//
// TURNSTILE (bot check, web/turnstile.js): when the
// TURNSTILE_SECRET_KEY env var is set, every request must carry a
// cf-turnstile-response token (+ cf-turnstile-idem, one idempotency
// key per search). The token is verified by the shared verifier in
// ../_lib/turnstile.js and is NEVER forwarded to archive.org. When
// the secret is not set, the proxy works exactly as before (no bot
// check) — that is the state until the human step in
// docs/clerk-auth.md §6.
import { verifyTurnstile } from "../_lib/turnstile.js";

// Params forwarded to the CDX API. cf-turnstile-response /
// cf-turnstile-idem are deliberately NOT here — they are consumed
// by verifyTurnstile and never leave Cloudflare.
const ALLOWED = new Set([
  "url", "output", "limit", "from", "to", "collapse", "matchtype",
  "showResumeKey", "resumptionKey", "filter", "fl",
]);

export async function onRequest(context) {
  const reqUrl = new URL(context.request.url);
  if (!reqUrl.searchParams.get("url")) {
    return new Response(JSON.stringify({ error: "missing ?url=" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const botCheck = await verifyTurnstile(context.env, context.request);
  if (botCheck) {
    return new Response(JSON.stringify({ error: botCheck.error }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  const target = new URL("https://web.archive.org/cdx/search/cdx");
  for (const [k, v] of reqUrl.searchParams) {
    if (ALLOWED.has(k)) target.searchParams.set(k, v);
  }
  const res = await fetch(target.toString(), {
    headers: { "User-Agent": "wayback-social/1.0" },
  });
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  const ct = res.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  headers.set("cache-control", "public, max-age=300");
  return new Response(res.body, { status: res.status, headers });
}
