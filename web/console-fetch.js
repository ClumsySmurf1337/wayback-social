/* wayback-social web console — CDX transport layer.
 * Extracted from console.js (Track K) so that file stays under the
 * ~500-line ceiling: the fetch functions are one coherent module —
 * everything that talks to an archive over HTTP, with the 120s stall
 * bound and the Turnstile token ride-along. Behaviour-identical to
 * the code that used to live in console.js; console.js, modes.js and
 * arquivo.js call these as before.
 *
 * Load order: this file BEFORE console.js (index.html). The functions
 * are top-level declarations in a classic script, so they are window
 * globals — console.js calls fetchSingle() / ensureSearchToken()
 * directly, modes.js calls fetchPattern() via fetchPatternTimed, and
 * the vm test harnesses (console-timeout.test.js, arquivo.test.js)
 * load this file the same way. They are also exposed on
 * window.WS_FETCH for anything that prefers the namespace.
 * No build step. No CLI text.
 */
function el(id) { return document.getElementById(id); }

// CDX base: same-origin proxy on the deployed site (archive.org
// sends no CORS headers — direct browser calls fail there), direct
// CDX on localhost where the Pages Function does not run.
// Override for testing: ?cdx=proxy forces the proxy (used by
// scripts/dev-server.mjs, which runs the real Function locally),
// ?cdx=direct forces direct CDX.
function cdxBase(){
  const cfg = window.WAYBACK_SOCIAL_CONFIG;
  const h = location.hostname;
  const q = new URLSearchParams(location.search);
  const force = q.get("cdx");
  if (force === "proxy" && cfg.CDX_PROXY) return cfg.CDX_PROXY;
  if (force === "direct") return cfg.CDX_BASE;
  if (h && h !== "localhost" && h !== "127.0.0.1" && cfg.CDX_PROXY) return cfg.CDX_PROXY;
  return cfg.CDX_BASE;
}
function cdxUrl(){
  const cfg = window.WAYBACK_SOCIAL_CONFIG;
  const u = new URL(cdxBase(), location.href);
  // Turnstile token (web/turnstile.js) rides along on proxy requests
  // only — the Function verifies it server-side. No token is sent to
  // web.archive.org directly, and no token exists when Turnstile is
  // not configured. The token is single-use per search, so it travels
  // with one idempotency key (see turnstile.js).
  const usingProxy = cdxBase() === cfg.CDX_PROXY;
  if (usingProxy && window.WS_TURNSTILE) {
    const t = window.WS_TURNSTILE.currentToken();
    if (t) {
      u.searchParams.set("cf-turnstile-response", t.token);
      u.searchParams.set("cf-turnstile-idem", t.idem);
    }
  }
  return u;
}
// Run the invisible Turnstile challenge (if configured) before a
// search, so the token is cached when cdxUrl() builds the requests.
// Returns true when the search may proceed. Unconfigured = no-op.
async function ensureSearchToken(){
  if (!window.WS_TURNSTILE) return true;
  try {
    await window.WS_TURNSTILE.ensureToken(window.WAYBACK_SOCIAL_CONFIG);
    return true;
  } catch (e) {
    el("status").textContent = "Bot check didn't complete (" + e.message + ") — no search was run. Try again.";
    return false;
  }
}
// One CDX pattern fetch. Throws on HTTP error, on a non-JSON answer,
// or on abort — the caller counts failures instead of silently
// skipping them (a 504 from a slow archive used to look exactly like
// "no captures found").
async function fetchPattern(pat, id, limit, from, to, signal){
  const url = cdxUrl();
  url.searchParams.set("url", pat.replace("{id}",id));
  url.searchParams.set("output","json"); url.searchParams.set("limit",String(limit));
  url.searchParams.set("showResumeKey","true");
  if(from) url.searchParams.set("from",from); if(to) url.searchParams.set("to",to);
  const res = await fetch(url.toString(), signal ? {signal} : undefined);
  if(!res.ok) throw new Error("archive answered HTTP " + res.status);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("archive answered with an unexpected format");
  return data.slice(1).filter(r => r.length >= 7);
}
// One CDX pattern fetch for single search, WITH a timeout — the same
// fetchPatternTimed broad search uses (modes.js, loaded after this
// file, exposes it on window.WS_MODES; search() runs on click, so
// by then modes.js is loaded). A stalled archive used to hang a
// single search until the caller gave up: the broad-search timeout
// fixed only searchBroad, and the stop test proved the single path
// could hang 240s on a stalled CDX fetch. Now a stall throws a
// distinct TimeoutError (not AbortError) after 120s, so the job
// counts it as a failed pattern and the failure UI offers retry —
// a real Stop still propagates as AbortError. The timeout is
// injectable for tests via window.WS_FETCH_TIMEOUT_MS (production
// leaves it undefined and the wrapper's 120s default applies). If
// modes.js failed to load, the plain fetchPattern is used (no
// timeout) rather than failing the search — the timeout is a
// hardening, not a dependency.
function fetchSingle(pat, id, limit, from, to, signal){
  const timed = window.WS_MODES && window.WS_MODES.fetchPatternTimed;
  const ms = (typeof window !== "undefined" && typeof window.WS_FETCH_TIMEOUT_MS === "number")
    ? window.WS_FETCH_TIMEOUT_MS : undefined;
  if (timed) return timed(pat, id, limit, from, to, signal, ms);
  return fetchPattern(pat, id, limit, from, to, signal);
}
if (typeof window !== "undefined") {
  window.WS_FETCH = { cdxBase, cdxUrl, ensureSearchToken, fetchPattern, fetchSingle };
}
