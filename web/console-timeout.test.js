/* Node test for the single-search timeout in web/console.js.
 * console.js is a browser script: it populates the network select,
 * renders plans, wires date pickers and licence UI at load. This
 * harness loads search-job.js (real), modes.js (real), console-fetch.js
 * (real — the CDX transport: fetchPattern / fetchSingle live there
 * since Track K split console.js) and console.js (real) in a vm
 * context with stubbed DOM/globals, so the search() wiring is testable
 * without a browser and without waiting 120s
 * (window.WS_FETCH_TIMEOUT_MS is the injectable timeout).
 * Run:  node web/console-timeout.test.js
 * Exit 0 = a fast fetch resolves with rows, a stalled fetch fails
 * honestly as a timeout (failure UI + retry, promptly, never a hang),
 * a real Stop still propagates as AbortError (stopped status, partial
 * results), and the search still works when modes.js failed to load
 * (plain fetchPattern fallback, no timeout).
 */
"use strict";
const H = require("./test-harness.js");

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  " + JSON.stringify(actual) +
    (ok ? "" : "  (expected " + JSON.stringify(expected) + ")"));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROW = ["com,twitter)/jack/status/1", "20230101120000",
  "https://twitter.com/jack/status/1", "text/html", "200", "A", "1"];
const ROW2 = ["com,twitter)/jack/status/2", "20230201120000",
  "https://twitter.com/jack/status/2", "text/html", "200", "B", "1"];
const CDX_BODY = [["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"], ROW, ROW2];

function makeCtx(loadModes) {
  const dom = H.createDom();
  // fetch behaviour is swapped per test through this variable.
  let fetchImpl = async () => ({ ok: true, json: async () => CDX_BODY });
  const sandbox = H.createSandbox(dom, {
    locationSearch: "?cdx=proxy",
    fetch: (url, opts) => fetchImpl(url, opts),
    searchJob: require("./search-job.js"),
    config: {
      CDX_PROXY: "http://127.0.0.1/api/cdx",
      CDX_BASE: "https://web.archive.org/cdx/search/cdx",
      PRICING: [
        { id: "free", name: "Free", price: "$0", cadence: "forever", blurb: "Try it.", features: ["25 captures"], cta: "Start free", checkout: null },
        { id: "pro", name: "Pro", price: "$19", regular: "$29", cadence: "one-time", blurb: "More.", features: ["2,500 captures"], cta: "Buy Pro", checkout: "pro" },
      ],
      FEATURE_CHART: [],
      LAUNCH_NOTE: "Launch note (test).",
      CHECKOUT: { provider: "paddle", links: { paddle: {} } },
      LICENCE: { demo_secret: "test-demo-secret" },
    },
    licence: {
      planCaps: () => ({ archive_limit: 25, find_networks: 3, exports: ["csv"] }),
      tierLabel: (t) => t,
      verifyKey: async () => ({ valid: false, reason: "test stub" }),
    },
    extra: {
      // modes.js reads these globals at call time; console-fetch.js
      // overwrites fetchPattern/cdxUrl with the real ones at load.
      fetchPattern: async () => [ROW, ROW2],
      $: (id) => dom.document.getElementById(id),
      cdxUrl: () => new URL("http://127.0.0.1/api/cdx"),
      currentCaps: () => ({ archive_limit: 25, find_networks: 3, exports: ["csv"] }),
      currentTier: () => "free",
      renderRows: () => {},
      setLastRows: () => {},
      recordHistory: () => {},
      recordUsage: () => {},
      search: async () => {},
    },
  });
  if (loadModes) {
    // presets-ui.js owns PRESETS / activatePreset now (modes.js
    // re-exports them on WS_MODES) — load it first, in the same
    // order as index.html.
    H.loadFiles(sandbox, ["presets-ui.js", "modes.js"]);
  }
  H.loadFiles(sandbox, ["console-fetch.js", "console.js", "render-rows.js"]);
  const api = {
    sandbox,
    els: dom.els,
    bySelector: dom.bySelector,
    status: () => sandbox.document.getElementById("status").textContent,
    failHidden: () => sandbox.document.getElementById("fail-actions").hidden,
    renderedRows: () => (dom.bySelector["#results tbody"] ? dom.bySelector["#results tbody"].children.length : 0),
    resultsHidden: () => sandbox.document.getElementById("results").hidden,
    setFetch: (fn) => { fetchImpl = fn; },
    setForm: (over) => {
      sandbox.document.getElementById("network").value = (over && over.network) || "x";
      sandbox.document.getElementById("handle").value = (over && over.handle) || "jack";
      sandbox.document.getElementById("limit").value = (over && over.limit) || "20";
      sandbox.document.getElementById("from").value = "";
      sandbox.document.getElementById("to").value = "";
      sandbox.document.getElementById("broad").checked = false;
    },
  };
  api.setForm();
  return api;
}

function hangFetch(url, opts) {
  // Like a stalled archive.org fetch: never resolves, but rejects
  // AbortError when its signal aborts — exactly what real fetch does.
  return new Promise((resolve, reject) => {
    const signal = opts && opts.signal;
    if (!signal) return; // no signal: hang forever (test would time out)
    if (signal.aborted) {
      const e = new Error("aborted"); e.name = "AbortError"; reject(e); return;
    }
    signal.addEventListener("abort", () => {
      const e = new Error("aborted"); e.name = "AbortError"; reject(e);
    });
  });
}

async function main() {
  // --- wiring: fetchSingle is the modes.js wrapper --------------------
  {
    const ctx = makeCtx(true);
    check("WS_MODES exposes fetchPatternTimed",
      typeof ctx.sandbox.window.WS_MODES.fetchPatternTimed, "function");
    check("console-fetch.js defines fetchSingle",
      typeof ctx.sandbox.fetchSingle, "function");
    check("console-fetch.js defines fetchPattern (bare, for the wrapper)",
      typeof ctx.sandbox.fetchPattern, "function");
  }

  // --- fast fetch resolves with rows -----------------------------------
  {
    const ctx = makeCtx(true);
    ctx.setFetch(async () => ({ ok: true, json: async () => CDX_BODY }));
    await ctx.sandbox.search(false);
    check("fast search finds rows", ctx.status().includes("Found 2 capture(s)"), true);
    check("fast search renders rows", ctx.renderedRows(), 2);
    check("fast search shows results table", ctx.resultsHidden(), false);
  }

  // --- stalled fetch fails honestly as a timeout, promptly --------------
  // Both X patterns stall; each times out (50ms in the test) instead
  // of hanging until the caller's 240s wait expires.
  {
    const ctx = makeCtx(true);
    ctx.sandbox.window.WS_FETCH_TIMEOUT_MS = 50;
    ctx.setFetch(hangFetch);
    const t0 = Date.now();
    await ctx.sandbox.search(false);
    const elapsed = Date.now() - t0;
    check("stalled search finishes promptly (ms)", elapsed < 5000, true);
    check("timeout status says the archive didn't answer in time",
      ctx.status().includes("didn't answer in time"), true);
    check("timeout shows the failure actions (retry)", ctx.failHidden(), false);
    check("timeout renders no rows as results", ctx.renderedRows(), 0);
    check("timeout hides the results table", ctx.resultsHidden(), true);
  }

  // --- a real Stop still propagates as AbortError -----------------------
  // The search is in flight on a hanging fetch (5s timeout, so no
  // timeout fires); clicking Stop aborts it and the page reports
  // "stopped" — it must NOT look like a timeout.
  {
    const ctx = makeCtx(true);
    ctx.sandbox.window.WS_FETCH_TIMEOUT_MS = 5000;
    ctx.setFetch(hangFetch);
    const p = ctx.sandbox.search(false);
    await sleep(100);
    ctx.sandbox.document.getElementById("job-stop").click();
    await sleep(150);
    check("stop status says stopped, not timed out",
      ctx.status().includes("stopped"), true);
    check("stop status does not claim a timeout",
      ctx.status().includes("didn't answer in time"), false);
    // The search loop waits for a resume after a stop; abandon it so
    // the floating promise resolves instead of hanging the runner.
    const job = ctx.sandbox.document.getElementById("job-stop")._wsJob;
    if (job) job.abandon();
    const done = await Promise.race([
      p.then(() => true),
      sleep(2000).then(() => false),
    ]);
    check("stopped search promise resolves after abandon", done, true);
  }

  // --- modes.js missing: plain fetchPattern fallback still searches ----
  {
    const ctx = makeCtx(false);
    check("no WS_MODES when modes.js failed to load",
      typeof ctx.sandbox.window.WS_MODES, "undefined");
    ctx.setFetch(async () => ({ ok: true, json: async () => CDX_BODY }));
    await ctx.sandbox.search(false);
    check("fallback search still finds rows", ctx.status().includes("Found 2 capture(s)"), true);
    check("fallback search renders rows", ctx.renderedRows(), 2);
  }

  console.log(failures === 0
    ? `\nconsole-timeout: ${checks} checks passed`
    : `\nconsole-timeout: ${failures}/${checks} checks FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
