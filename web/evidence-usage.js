/* Evidence-pack report counting (issue #15) — local-first.
 *
 * Studio includes 10 evidence-pack reports. Evidence packs are built
 * outside the browser (the CLI / download tool), so the dashboard
 * counts them by hand: the "Log a report" button records one, and the
 * dashboard shows used / included. Server-side counting against D1
 * replaces this when the Paddle go-live lands (docs/paddle-webhook.md)
 * — this module is the local stand-in, and it says so on the page.
 *
 * The count is namespaced per licence key (a short hash of the key —
 * a bucket label, not security; the key itself already lives in
 * localStorage). No key / free tier counts under the shared key, which
 * is fine: free has 0 reports included, so logging is blocked anyway.
 *
 * Rules:
 *   - included = 0 (free/starter/pro): logging is blocked — evidence
 *     packs are a Studio feature.
 *   - used < included: logging records one more report.
 *   - used == included - 1: the next log is the last one (warning).
 *   - used == included: the pack is used up — further logging is
 *     blocked and the page offers the top-up (placeholder link to the
 *     pricing page; no purchase is invented — checkout is not
 *     connected yet).
 *
 * No build step. Browser + Node (module.exports guard at the bottom).
 */
(function () {
  "use strict";

  var LEGACY_KEY = "ws_evidence_used";

  // FNV-1a, 32-bit — a stable bucket label for the licence key.
  function keyHash(key) {
    var h = 0x811c9dc5;
    var s = String(key || "");
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return ("0000000" + h.toString(16)).slice(-8);
  }

  function usageKey(licenceKey) {
    if (!licenceKey) return LEGACY_KEY;
    return LEGACY_KEY + "_" + keyHash(licenceKey);
  }

  function getUsed(store, licenceKey) {
    try {
      var v = parseInt(store.getItem(usageKey(licenceKey)) || "0", 10);
      return isNaN(v) || v < 0 ? 0 : v;
    } catch (e) {
      return 0;
    }
  }

  function setUsed(store, licenceKey, n) {
    try {
      store.setItem(usageKey(licenceKey), String(n));
    } catch (e) {}
  }

  // Move a pre-#15 count (stored under the shared key) into the
  // per-key bucket once, so nobody loses reports they already logged.
  function migrateLegacy(store, licenceKey) {
    if (!licenceKey) return 0;
    try {
      var legacy = parseInt(store.getItem(LEGACY_KEY) || "0", 10);
      if (!legacy) return 0;
      var keyed = usageKey(licenceKey);
      if (store.getItem(keyed) === null) setUsed(store, licenceKey, legacy);
      store.removeItem(LEGACY_KEY);
      return legacy;
    } catch (e) {
      return 0;
    }
  }

  // Record one built report. Returns {ok, used, included, warning,
  // blocked, reason}. Never increments past `included`.
  function logReport(store, licenceKey, included) {
    included = included || 0;
    var used = getUsed(store, licenceKey);
    if (included <= 0) {
      return { ok: false, used: used, included: included,
               warning: false, blocked: true,
               reason: "Evidence packs are a Studio feature — your tier includes 0 reports." };
    }
    if (used >= included) {
      return { ok: false, used: used, included: included,
               warning: false, blocked: true,
               reason: "Your Studio pack's " + included + " reports are used up." };
    }
    used += 1;
    setUsed(store, licenceKey, used);
    return { ok: true, used: used, included: included,
             warning: used === included - 1 && included > 1,
             blocked: false, reason: "" };
  }

  // One-line status for the dashboard usage note.
  function statusLine(used, included) {
    if (included <= 0) {
      return "Evidence packs are a Studio feature — upgrade to Studio for 10 included reports.";
    }
    if (used >= included) {
      return "All " + included + " reports used up. Extra reports need a top-up — see pricing (checkout isn't connected yet).";
    }
    if (used === included - 1) {
      return "1 report left in your Studio pack — log the next one carefully, then top up.";
    }
    return "Studio includes " + included + " evidence-pack reports. Log each pack you build with the button above.";
  }

  var api = { keyHash: keyHash, usageKey: usageKey, getUsed: getUsed,
              setUsed: setUsed, migrateLegacy: migrateLegacy,
              logReport: logReport, statusLine: statusLine,
              LEGACY_KEY: LEGACY_KEY };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof window !== "undefined") {
    window.WS_EVIDENCE = api;
  }
})();
