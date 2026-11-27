/* wayback-social — runtime public-key config (Clerk close-to-prod).
 *
 * The deployed environment's PUBLIC keys, fetched once from the
 * same-origin /api/config endpoint (functions/api/config.js) and
 * merged over the static values in web/config.js. This is the
 * dev/prod env swap: Preview deploys serve the dev keys from their
 * env vars, Production deploys serve the prod keys from theirs —
 * the browser never hardcodes which environment it is in.
 *
 * Precedence (per key): endpoint value wins when it is a real key;
 * otherwise the static config.js value (the dev publishable key
 * today; the Turnstile placeholder until a site key exists); when
 * neither has a real key, the feature stays unconfigured and the
 * page behaves exactly as before (free search works, sign-in shows
 * "coming soon"). The endpoint is never required: on localhost
 * (no Functions) or on an old deploy (no /api/config yet) the fetch
 * fails and the static fallback applies — so this module can never
 * break the page by itself.
 *
 * Public keys only. No secret is ever read, returned, or stored
 * here — secrets live in Pages env vars and only Functions see them.
 *
 * Works in the browser (window.WS_RUNTIME_CONFIG) and in Node
 * (module.exports) — pure parts tested by web/runtime-config.test.js.
 * Loads BEFORE auth.js / turnstile.js (see index.html, dashboard.html).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.WS_RUNTIME_CONFIG = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ENDPOINT = "/api/config";
  var fetchImpl = null;
  var cachedPromise = null;

  function getFetch() {
    if (fetchImpl) return fetchImpl;
    if (typeof fetch !== "undefined") return fetch;
    throw new Error("fetch is not available");
  }

  function cleanKey(v) {
    if (!v || typeof v !== "string") return null;
    if (v.indexOf("REPLACE") >= 0) return null;
    return v;
  }

  /* Static fallback from web/config.js, using the same rules as
   * auth.js resolvePublishableKey / turnstile.js resolveSiteKey:
   * enabled:false or a REPLACE_ placeholder means "not configured". */
  function staticKeys(cfg) {
    var clerk = null, turnstile = null;
    if (cfg && cfg.CLERK && cfg.CLERK.enabled !== false) {
      clerk = cleanKey(cfg.CLERK.publishable_key);
    }
    if (cfg && cfg.TURNSTILE && cfg.TURNSTILE.enabled !== false) {
      turnstile = cleanKey(cfg.TURNSTILE.site_key);
    }
    return { clerk: clerk, turnstile: turnstile };
  }

  /* Pure merge: endpoint values win when real, static values fill
   * the gaps. Never throws on a malformed endpoint body. */
  function merge(staticCfg, runtime) {
    var s = staticKeys(staticCfg || {});
    var r = runtime || {};
    var clerkKey = cleanKey(r.clerk && r.clerk.publishable_key) || s.clerk;
    var turnstileKey = cleanKey(r.turnstile && r.turnstile.site_key) || s.turnstile;
    return {
      clerk: { publishable_key: clerkKey, enabled: !!clerkKey },
      turnstile: { site_key: turnstileKey, enabled: !!turnstileKey },
    };
  }

  async function fetchRuntime() {
    try {
      var f = getFetch();
      var res = await f(ENDPOINT);
      if (!res || !res.ok) return null;
      return await res.json();
    } catch (e) {
      return null; // no Functions here (localhost / old deploy) — fallback
    }
  }

  function staticConfig() {
    try {
      if (typeof window !== "undefined" && window.WAYBACK_SOCIAL_CONFIG) {
        return window.WAYBACK_SOCIAL_CONFIG;
      }
    } catch (e) {}
    return {};
  }

  /* The merged effective config. Cached per page load: one fetch,
   * shared by the Clerk SDK init and the Turnstile widget. */
  function get(cfg, fetchFn) {
    if (!cachedPromise) {
      var staticCfg = cfg || staticConfig();
      var f = fetchFn || null;
      if (f) fetchImpl = f;
      cachedPromise = fetchRuntime().then(function (runtime) {
        return merge(staticCfg, runtime);
      });
    }
    return cachedPromise;
  }

  function _setFetch(f) { fetchImpl = f; }
  function _reset() { cachedPromise = null; fetchImpl = null; }

  return {
    ENDPOINT: ENDPOINT,
    staticKeys: staticKeys, merge: merge, get: get,
    _setFetch: _setFetch, _reset: _reset,
  };
});
