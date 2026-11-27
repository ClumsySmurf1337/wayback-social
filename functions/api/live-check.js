// POST /api/live-check — server-side live check for the web deleted
// diff (issue #13 follow-up: the diff mode is now a web UI, not
// CLI-only). The browser cannot HEAD a live post URL directly —
// x.com, instagram.com etc. send no CORS headers — so the check runs
// here, same pattern as functions/api/cdx.js.
//
// Classification mirrors wayback_social/diff.py classify_live
// exactly, so the web diff and the CLI diff agree on every verdict:
//   200 (and not a login redirect) -> "live"
//   404 / 410 -> "deleted"
//   anything else (401/403/429/5xx, timeout, DNS, login redirect) ->
//   "unknown" — NEVER "deleted". An unknown is not a deleted post.
// X-only tie-breaker: on 401/403/429 or a login redirect, the public
// publish.twitter.com oEmbed endpoint decides (404 = deleted,
// 200 = live). It is NOT consulted for 5xx or other errors — oEmbed
// 404s on a malformed URL too, which would fake a "deleted".
//
// SAFETY: POST only, JSON body {urls: [...]} with at most 25 URLs
// (one diff page), 10s timeout per fetch, no request body is
// forwarded, no credentials, no caching (live status changes).
// Only http(s) URLs are checked; anything else is "unknown".
// The response never claims more than the check found.
const MAX_URLS = 25;
const FETCH_TIMEOUT_MS = 10_000;
const HEADERS = { "user-agent": "wayback-social/1.0" };
const LOGIN_MARKERS = ["/login", "/i/flow", "/accounts/login",
  "/signin", "/auth/login", "/checkpoint"];
const OEMBED = "https://publish.twitter.com/oembed?url=";

function isLoginUrl(url) {
  const low = (url || "").toLowerCase();
  return LOGIN_MARKERS.some((m) => low.includes(m));
}

function isX(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "x.com" || h === "twitter.com" || h.endsWith(".x.com") ||
      h.endsWith(".twitter.com");
  } catch (e) { return false; }
}

async function fetchWithTimeout(url, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function oembedDeleted(postUrl) {
  // Returns true (deleted) / false (live) / null (endpoint errored —
  // do not guess from that).
  try {
    const r = await fetchWithTimeout(OEMBED + encodeURIComponent(postUrl),
      { method: "GET", headers: HEADERS });
    if (r.status === 404) return true;
    if (r.status === 200) return false;
    return null;
  } catch (e) {
    return null;
  }
}

async function checkOne(url) {
  const checkedAt = new Date().toISOString().slice(0, 19) + "Z";
  const base = { live_verdict: "unknown", live_http_status: "",
    live_final_url: url, live_checked_at: checkedAt };
  let parsed;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return base;
    }
  } catch (e) {
    return base;
  }
  let status = 0;
  let finalUrl = url;
  try {
    let res = await fetchWithTimeout(url,
      { method: "HEAD", headers: HEADERS, redirect: "follow" });
    status = res.status;
    finalUrl = res.url || url;
    if (status === 405 || status === 403) {
      // Some platforms refuse HEAD; one GET (body unread) decides.
      res = await fetchWithTimeout(url,
        { method: "GET", headers: HEADERS, redirect: "follow" });
      status = res.status;
      finalUrl = res.url || url;
    }
  } catch (e) {
    // Timeout / DNS / connection — unknown, not deleted.
    return { ...base, live_error: String(e && e.message || e).slice(0, 120) };
  }
  let verdict;
  if (status === 404 || status === 410) verdict = "deleted";
  else if (status === 200 && !isLoginUrl(finalUrl)) verdict = "live";
  else verdict = "unknown";
  if (verdict === "unknown" && isX(url) &&
      (status === 401 || status === 403 || status === 429 ||
       isLoginUrl(finalUrl))) {
    const deleted = await oembedDeleted(url);
    if (deleted === true) verdict = "deleted";
    else if (deleted === false) verdict = "live";
  }
  return { live_verdict: verdict, live_http_status: status,
    live_final_url: finalUrl, live_checked_at: checkedAt };
}

export async function onRequest(context) {
  const request = context.request;
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }
  const urls = body && body.urls;
  if (!Array.isArray(urls) || urls.length === 0 ||
      urls.some((u) => typeof u !== "string")) {
    return new Response(
      JSON.stringify({ error: "body must be {urls: [string, ...]}" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
  }
  if (urls.length > MAX_URLS) {
    return new Response(JSON.stringify({
      error: "at most " + MAX_URLS + " URLs per request",
    }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const results = await Promise.all(urls.map(async (url) => ({
    url, ...(await checkOne(url)),
  })));
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { "content-type": "application/json",
      "cache-control": "no-store" },
  });
}

export { MAX_URLS, FETCH_TIMEOUT_MS };
