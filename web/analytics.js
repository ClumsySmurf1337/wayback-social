/* Cloudflare Web Analytics beacon (issue #14) — page views only.
 *
 * Reads WAYBACK_SOCIAL_CONFIG.ANALYTICS (web/config.js): off by
 * default. When enabled with a token (from the Cloudflare dashboard,
 * Web Analytics > Add a site), injects the beacon script. Nothing is
 * injected while disabled, so the page makes no analytics request at
 * all until a human turns it on. The beacon is cookieless and sees
 * page views only — we never send it handles, results, or keys.
 *
 * No build step. Browser + Node (module.exports guard at the bottom).
 */
(function () {
  "use strict";

  var BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

  function inject(doc, cfg) {
    if (!doc || !cfg || !cfg.enabled || !cfg.token) return false;
    if (doc.querySelector && doc.querySelector('script[data-cf-beacon]')) return false;
    var s = doc.createElement("script");
    s.defer = true;
    s.src = BEACON_SRC;
    s.setAttribute("data-cf-beacon", JSON.stringify({ token: cfg.token }));
    (doc.body || doc.head).appendChild(s);
    return true;
  }

  function boot() {
    try {
      var cfg = (typeof window !== "undefined" && window.WAYBACK_SOCIAL_CONFIG)
        ? window.WAYBACK_SOCIAL_CONFIG.ANALYTICS : null;
      inject(document, cfg);
    } catch (e) { /* analytics must never break the page */ }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { inject: inject, BEACON_SRC: BEACON_SRC };
  }
  if (typeof window !== "undefined") {
    window.WS_ANALYTICS = { inject: inject, BEACON_SRC: BEACON_SRC };
  }
})();
