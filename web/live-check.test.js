/* Node test for web/live-check.js — the browser half of the deleted
 * diff (issue #13 follow-up). The verdicts themselves are classified
 * server-side (functions/api/live-check.test.mjs covers 200/404/410/
 * login-redirect / oEmbed / 5xx); this file covers the client side:
 * chunking at the Function's 25-URL cap, and — the rule that matters
 * most — a failed chunk is "unknown", never "deleted".
 * Run:  node web/live-check.test.js
 */
"use strict";
const { checkLive, LIVE_CHECK_CHUNK } = require("./live-check.js");

let failures = 0, checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  " + JSON.stringify(actual) +
    (ok ? "" : "  (expected " + JSON.stringify(expected) + ")"));
}

function fakeFetch(responses) {
  // responses: url -> {status, verdict} or Error to throw.
  const calls = [];
  const fn = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body.urls);
    const results = [];
    for (const u of body.urls) {
      const r = responses[u];
      if (r instanceof Error) throw r;
      results.push({ url: u, live_verdict: r.verdict, live_http_status: r.status,
        live_final_url: u, live_checked_at: "2026-11-27T00:00:00Z" });
    }
    return { ok: true, status: 200, json: async () => ({ results }) };
  };
  fn.calls = calls;
  return fn;
}

(async () => {
  check("chunk size is the Function cap", LIVE_CHECK_CHUNK, 25);

  // Verdicts pass through unchanged.
  const f1 = fakeFetch({
    "https://x.com/a/status/1": { status: 200, verdict: "live" },
    "https://x.com/a/status/2": { status: 404, verdict: "deleted" },
    "https://x.com/a/status/3": { status: 403, verdict: "unknown" },
  });
  const m1 = await checkLive([
    "https://x.com/a/status/1", "https://x.com/a/status/2", "https://x.com/a/status/3"], f1);
  check("200 -> live", m1.get("https://x.com/a/status/1").live_verdict, "live");
  check("404 -> deleted", m1.get("https://x.com/a/status/2").live_verdict, "deleted");
  check("403 -> unknown", m1.get("https://x.com/a/status/3").live_verdict, "unknown");
  check("one call for a short list", f1.calls.length, 1);

  // 30 URLs -> 2 calls (25 + 5), all verdicts present.
  const urls30 = Array.from({ length: 30 }, (_, i) => "https://x.com/a/status/" + (100 + i));
  const resp30 = {};
  urls30.forEach((u, i) => { resp30[u] = { status: i % 2 ? 200 : 404, verdict: i % 2 ? "live" : "deleted" }; });
  const f2 = fakeFetch(resp30);
  const m2 = await checkLive(urls30, f2);
  check("30 URLs chunked into 2 calls", f2.calls.map((c) => c.length), [25, 5]);
  check("all 30 verdicts returned", m2.size, 30);
  check("chunk 2 verdicts intact", m2.get(urls30[29]).live_verdict, "live");

  // A fetch that throws marks its chunk unknown — never deleted.
  const throwing = async () => { throw new Error("network down"); };
  const m3 = await checkLive(["https://x.com/a/status/9"], throwing);
  check("thrown fetch -> unknown", m3.get("https://x.com/a/status/9").live_verdict, "unknown");

  // A non-200 answer marks its chunk unknown — never deleted.
  const bad = async () => ({ ok: false, status: 502, json: async () => ({}) });
  const m4 = await checkLive(["https://x.com/a/status/9"], bad);
  check("502 answer -> unknown", m4.get("https://x.com/a/status/9").live_verdict, "unknown");

  // No fetch available (older browser / no network stack) -> unknown.
  const m5 = await checkLive(["https://x.com/a/status/9"], null);
  check("no fetch -> unknown", m5.get("https://x.com/a/status/9").live_verdict, "unknown");

  // Empty input -> empty map, no call.
  const f6 = fakeFetch({});
  const m6 = await checkLive([], f6);
  check("empty input -> empty map", m6.size, 0);
  check("empty input -> no call", f6.calls.length, 0);

  console.log("\n" + checks + " checks, " + failures + " failure(s)");
  process.exit(failures ? 1 : 0);
})();
