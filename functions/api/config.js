// GET /api/config — the deployed environment's PUBLIC keys.
//
// WHY: Pages env vars (Production vs Preview) are only visible to
// Functions, never to the static frontend — and this project has no
// build step, so keys cannot be injected at build time either. The
// browser fetches this endpoint once at boot (web/runtime-config.js)
// and uses the keys it returns. When the endpoint has no key for
// something (env var not set yet), the page falls back to the static
// values in web/config.js (the dev publishable key today, the
// Turnstile placeholder until a site key exists). That fallback is
// what keeps local development (no Functions on localhost) and the
// current deploy working while the env vars are being set up.
//
// WHAT IT RETURNS — public keys ONLY, never secrets:
//   { clerk: { publishable_key, enabled },
//     turnstile: { site_key, enabled } }
// The secret halves (CLERK_SECRET_KEY, TURNSTILE_SECRET_KEY,
// LICENCE_SECRET, LICENCE_ED25519_PRIVATE_KEY, STRIPE_SECRET_KEY,
// RESEND_API_KEY, PADDLE_*) are never read here and never leave the
// server; the Functions that need them read env directly.
//
// ENV VARS (set per environment in the Pages dashboard, or
// `wrangler pages secret put NAME --project-name deletedproof`;
// plain env vars work too — these values are public):
//   CLERK_PUBLISHABLE_KEY — pk_test_… on Preview, pk_live_… on
//     Production (once the production Clerk instance exists).
//   TURNSTILE_SITE_KEY — the Turnstile site key for this environment.
// Until they are set, the endpoint answers enabled:false and the
// page uses its static fallback. See docs/clerk-env-swap.md.
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "content-type": "application/json",
      // Env vars change on deploy; never serve a stale key set.
      "cache-control": "no-store",
    },
  });
}

function publicKey(v) {
  if (!v || typeof v !== "string") return null;
  if (v.indexOf("REPLACE") >= 0) return null;
  return v;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }
  const clerkKey = publicKey(env && env.CLERK_PUBLISHABLE_KEY);
  const turnstileKey = publicKey(env && env.TURNSTILE_SITE_KEY);
  return json({
    clerk: { publishable_key: clerkKey, enabled: !!clerkKey },
    turnstile: { site_key: turnstileKey, enabled: !!turnstileKey },
  });
}
