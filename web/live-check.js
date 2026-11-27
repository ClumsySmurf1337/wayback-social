/* Live check from the browser (issue #13 follow-up: deleted diff is
 * now a web UI). The browser cannot HEAD a live post URL directly
 * (no CORS on x.com / instagram.com / ...), so the verdicts come
 * from the same-origin Pages Function /api/live-check
 * (functions/api/live-check.js), which mirrors the CLI's
 * classify_live verdicts: 200 -> live, 404/410 -> deleted,
 * anything else -> unknown (never deleted).
 *
 * One request checks at most 25 URLs (the Function's cap), so this
 * helper chunks longer lists. A failed chunk (network error, or a
 * non-200 answer) marks its URLs "unknown" — a failed check is never
 * presented as a deletion.
 *
 * No build step. Browser + Node (module.exports guard at the bottom);
 * `fetchImpl` is injectable so the chunking is unit-testable.
 */
"use strict";

var LIVE_CHECK_URL = "/api/live-check";
var LIVE_CHECK_CHUNK = 25;

// Check `urls` (array of strings). Returns a Map url -> verdict
// object {live_verdict, live_http_status, live_final_url,
// live_checked_at}. Unknown on any failure — never "deleted".
async function checkLive(urls, fetchImpl) {
  var doFetch = fetchImpl ||
    (typeof fetch !== "undefined" ? fetch : null);
  var out = new Map();
  var list = (urls || []).filter(function (u) { return typeof u === "string" && u; });
  if (!doFetch) {
    list.forEach(function (u) { out.set(u, { live_verdict: "unknown", live_http_status: "", live_final_url: u, live_checked_at: "" }); });
    return out;
  }
  for (var i = 0; i < list.length; i += LIVE_CHECK_CHUNK) {
    var chunk = list.slice(i, i + LIVE_CHECK_CHUNK);
    try {
      var res = await doFetch(LIVE_CHECK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: chunk }),
      });
      if (!res.ok) throw new Error("live-check answered HTTP " + res.status);
      var data = await res.json();
      (data.results || []).forEach(function (r) {
        if (r && r.url) out.set(r.url, r);
      });
      chunk.forEach(function (u) {
        if (!out.has(u)) out.set(u, { live_verdict: "unknown", live_http_status: "", live_final_url: u, live_checked_at: "" });
      });
    } catch (e) {
      chunk.forEach(function (u) {
        out.set(u, { live_verdict: "unknown", live_http_status: "", live_final_url: u, live_checked_at: "" });
      });
    }
  }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { checkLive, LIVE_CHECK_URL, LIVE_CHECK_CHUNK };
}
if (typeof window !== "undefined") {
  window.WS_LIVE_CHECK = { checkLive, LIVE_CHECK_URL, LIVE_CHECK_CHUNK };
}
