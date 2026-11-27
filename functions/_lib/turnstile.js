// Shared Turnstile (bot check) verification for Pages Functions —
// the one place that knows how a token proves itself, so /api/cdx
// and /api/arquivo never drift apart (they used to carry identical
// copies, kept in sync by hand — Track K extracted it, following
// the verify-key.js precedent).
//
// verifyTurnstile(env, request) returns:
//   null — the check passed, or Turnstile is not configured
//   (no TURNSTILE_SECRET_KEY env var: the proxy works exactly as
//   before, open — that is the state until the human step in
//   docs/clerk-auth.md §6).
//   { ok: false, error } — the caller answers 403 with the error.
//
// The token (cf-turnstile-response) + idempotency key
// (cf-turnstile-idem, one per search — Turnstile tokens are
// single-use, so repeated validations of the same token with the
// same key return the cached outcome) ride on the query string and
// are consumed here, NEVER forwarded to the archive. The token is
// verified against Cloudflare's siteverify endpoint.
//
// NOTE: files under functions/_lib/ are ignored by the Pages
// Functions router (underscore prefix) — this is not a route.
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(env, request) {
  if (!env || !env.TURNSTILE_SECRET_KEY) return null; // not configured — open
  const reqUrl = new URL(request.url);
  const token = reqUrl.searchParams.get("cf-turnstile-response");
  if (!token) {
    return { ok: false, error: "bot check required — run the search from the site" };
  }
  const idem = reqUrl.searchParams.get("cf-turnstile-idem") || undefined;
  const form = new URLSearchParams();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  if (idem) form.set("idempotency_key", idem);
  let res;
  try {
    res = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: form });
  } catch (e) {
    return { ok: false, error: "bot check could not be verified — try again" };
  }
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!data.success) {
    return { ok: false, error: "bot check failed — are you human? Try again." };
  }
  return null;
}
