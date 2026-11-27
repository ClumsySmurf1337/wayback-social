/* wayback-social — Cloudflare Turnstile bot check (issue #6 follow-up).
 *
 * Turnstile is a BOT CHECK, not a login (docs/cloudflare-auth-options.md):
 * free, unlimited verifications. It proves the visitor is human; it
 * does not know who they are. Two places use it:
 *
 *  1. Sign-up: Clerk's OWN bot sign-up protection, which is
 *     Turnstile-based and invisible for 99.9% of users — enabled in
 *     the Clerk Dashboard (Attack protection), no widget code here.
 *  2. Search form (this file): an invisible Turnstile widget. Before
 *     a search runs, the page executes the challenge and gets a token;
 *     every CDX request of that search carries the token (+ one
 *     idempotency key per search) to /api/cdx, and the Function
 *     verifies it against Cloudflare's siteverify endpoint. That is
 *     what stops bots burning the proxy's 100k req/day budget.
 *
 * Turnstile tokens are SINGLE-USE: validating the same token twice
 * returns "timeout-or-duplicate". A broad search makes many CDX
 * requests, so the page sends one idempotency key per search and the
 * Function passes it to siteverify — repeated validations of the same
 * token with the same key return the cached outcome.
 *
 * When no site key is configured (the default until the human step
 * in docs/clerk-auth.md is done), this module is a no-op: no script
 * is loaded, no widget renders, searches run exactly as before.
 * The secret key NEVER appears here — it lives in a Pages env var
 * (TURNSTILE_SECRET_KEY) and only the Function sees it.
 *
 * Official test keys (Cloudflare docs — public dummy keys, safe to
 * use in tests): site key 1x00000000000000000000AA always passes,
 * 2x00000000000000000000AB always blocks, 3x00000000000000000000FF
 * forces an interactive challenge. The matching test secrets are in
 * docs/clerk-auth.md (server side only).
 *
 * Works in the browser (window.WS_TURNSTILE) and in Node
 * (module.exports) — pure parts tested by web/turnstile.test.js.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.WS_TURNSTILE = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TURNSTILE_API = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  var PLACEHOLDER = "REPLACE_TURNSTILE_SITE_KEY";
  var TEST_SITEKEY_PASS = "1x00000000000000000000AA";
  var TEST_SITEKEY_BLOCK = "2x00000000000000000000AB";
  var TEST_SITEKEY_CHALLENGE = "3x00000000000000000000FF";
  var TOKEN_TTL_MS = 60 * 1000; // reuse a fresh token for one search, then re-challenge
  var CHALLENGE_TIMEOUT_MS = 30 * 1000;

  var turnstileObj = null; // injectable for tests
  var widgetId = null;
  var cached = null; // {token, idem, at}
  var scriptPromise = null;

  function resolveSiteKey(cfg) {
    if (!cfg || !cfg.TURNSTILE) return null;
    if (cfg.TURNSTILE.enabled === false) return null;
    var k = cfg.TURNSTILE.site_key || "";
    if (!k || k.indexOf("REPLACE") >= 0) return null;
    return k;
  }
  function isConfigured(cfg) { return !!resolveSiteKey(cfg); }

  function newIdempotencyKey() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    var s = "";
    var hex = "0123456789abcdef";
    for (var i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
    return s.slice(0, 8) + "-" + s.slice(8, 12) + "-" + s.slice(12, 16) + "-" + s.slice(16, 20) + "-" + s.slice(20, 32);
  }

  function isTokenFresh(entry, now) {
    if (!entry || !entry.token || !entry.idem) return false;
    return (now || Date.now()) - entry.at < TOKEN_TTL_MS;
  }

  function currentToken() {
    if (!isTokenFresh(cached)) return null;
    return { token: cached.token, idem: cached.idem };
  }

  function getTurnstile() {
    if (turnstileObj) return turnstileObj;
    if (typeof window !== "undefined" && window.turnstile) return window.turnstile;
    return null;
  }

  function loadScript() {
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      if (typeof document === "undefined") return reject(new Error("no document"));
      if (getTurnstile()) return resolve(getTurnstile());
      var s = document.createElement("script");
      s.src = TURNSTILE_API;
      s.async = true;
      s.defer = true;
      s.onload = function () { resolve(getTurnstile()); };
      s.onerror = function () { reject(new Error("Turnstile script failed to load")); };
      document.head.appendChild(s);
    });
    return scriptPromise;
  }

  function renderWidget(siteKey) {
    var t = getTurnstile();
    if (!t || typeof document === "undefined") return null;
    var el = document.getElementById("turnstile-widget");
    if (!el) return null;
    if (widgetId !== null) return widgetId;
    try {
      widgetId = t.render(el, {
        sitekey: siteKey,
        size: "invisible",
        callback: function (token) {
          cached = { token: token, idem: newIdempotencyKey(), at: Date.now() };
          if (pendingResolve) { var r = pendingResolve; pendingResolve = null; r(currentToken()); }
        },
        "error-callback": function () {
          if (pendingReject) { var rj = pendingReject; pendingReject = null; rj(new Error("Turnstile challenge error")); }
        },
        "expired-callback": function () { cached = null; },
      });
    } catch (e) { return null; }
    return widgetId;
  }

  var pendingResolve = null;
  var pendingReject = null;

  /* Dev/prod env swap (docs/clerk-env-swap.md): the deployed
   * environment's Turnstile site key comes from /api/config
   * (web/runtime-config.js). It wins when it returns a real key;
   * otherwise the static config.js value applies. Never throws. */
  async function runtimeSiteKey() {
    try {
      var RC = (typeof window !== "undefined" && window.WS_RUNTIME_CONFIG) || null;
      if (!RC || typeof RC.get !== "function") return null;
      var rc = await RC.get();
      return (rc && rc.turnstile && rc.turnstile.site_key) || null;
    } catch (e) { return null; }
  }

  /* Execute the invisible challenge and return {token, idem}, or null
   * when Turnstile is not configured. Reuses a token obtained in the
   * last 60s so one search = one challenge. Throws if the challenge
   * fails or times out — the caller shows an honest error and does
   * not run the search without a token when Turnstile is on. */
  async function ensureToken(cfg) {
    var siteKey = (await runtimeSiteKey()) ||
      resolveSiteKey(cfg || (typeof window !== "undefined" && window.WAYBACK_SOCIAL_CONFIG) || {});
    if (!siteKey) return null;
    var fresh = currentToken();
    if (fresh) return fresh;
    var t = getTurnstile();
    if (!t) {
      try { t = await loadScript(); } catch (e) { throw new Error("Bot check failed to load — check your connection and retry."); }
    }
    if (!t) throw new Error("Bot check unavailable.");
    var wid = renderWidget(siteKey);
    if (wid === null || wid === undefined) throw new Error("Bot check could not start.");
    return new Promise(function (resolve, reject) {
      pendingResolve = resolve;
      pendingReject = reject;
      var timer = setTimeout(function () {
        pendingResolve = null; pendingReject = null;
        reject(new Error("Bot check timed out — try again."));
      }, CHALLENGE_TIMEOUT_MS);
      var origResolve = pendingResolve;
      pendingResolve = function (v) { clearTimeout(timer); origResolve(v); };
      var origReject = pendingReject;
      pendingReject = function (e) { clearTimeout(timer); origReject(e); };
      try { t.execute(wid); } catch (e) {
        clearTimeout(timer); pendingResolve = null; pendingReject = null;
        reject(new Error("Bot check failed to start."));
      }
    });
  }

  /* Test hooks. */
  function _setTurnstile(t) { turnstileObj = t; }
  function _setCached(entry) { cached = entry; }
  function _reset() { widgetId = null; cached = null; scriptPromise = null; pendingResolve = null; pendingReject = null; }

  return {
    TURNSTILE_API: TURNSTILE_API, PLACEHOLDER: PLACEHOLDER,
    TEST_SITEKEY_PASS: TEST_SITEKEY_PASS, TEST_SITEKEY_BLOCK: TEST_SITEKEY_BLOCK,
    TEST_SITEKEY_CHALLENGE: TEST_SITEKEY_CHALLENGE, TOKEN_TTL_MS: TOKEN_TTL_MS,
    resolveSiteKey: resolveSiteKey, isConfigured: isConfigured,
    newIdempotencyKey: newIdempotencyKey, isTokenFresh: isTokenFresh,
    currentToken: currentToken, ensureToken: ensureToken,
    _setTurnstile: _setTurnstile, _setCached: _setCached, _reset: _reset,
  };
});
