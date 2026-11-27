/* Node test — Ghostarchive as a web source (issue #8 follow-up,
 * Track L). Module-level: patterns, links, parsing, the timed
 * fetch, and the SearchJob step builders. The end-to-end search()
 * blocks (source selector -> steps -> rows, incl. the "All
 * archives" merge) live in this file too and run against the
 * real search() — console.js wires the source in (Track L).
 * Run:  node web/ghostarchive.test.js
 */
"use strict";
const H = require("./test-harness.js");

const HEADER = ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"];
const G_ROW1 = ["", "20240414033258", "https://twitter.com/jack/status/20", "", "", "", "", "AJzyo"];
const G_ROW2 = ["", "20240516032536", "https://twitter.com/jack/status/1787895769183268948", "", "", "", "", "Zpgdp"];
const GHOST_BODY = [HEADER, G_ROW1, G_ROW2];
// Same capture (same timestamp + URL) as the Wayback row in the
// arquivo fixtures — in "All archives" mode it must dedupe to one
// row, Wayback winning the tie.
const W_ROW1 = ["com,twitter)/jack/status/1", "20230101120000",
  "https://twitter.com/jack/status/1", "text/html", "200", "A", "1"];
const CDX_BODY = [HEADER, W_ROW1];

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  " + JSON.stringify(actual) +
    (ok ? "" : "  (expected " + JSON.stringify(expected) + ")"));
}
function checkHas(label, haystack, needle) {
  checks += 1;
  const ok = String(haystack || "").includes(needle);
  if (!ok) failures += 1;
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  contains " + JSON.stringify(needle) +
    (ok ? "" : "  (in " + JSON.stringify(String(haystack || "").slice(0, 200)) + ")"));
}

function makeCtx() {
  const dom = H.createDom();
  let fetchImpl = async () => ({ ok: true, json: async () => GHOST_BODY });
  const fetchCalls = [];
  const sandbox = H.createSandbox(dom, {
    locationSearch: "?cdx=proxy&arquivo=proxy",
    fetch: (url, opts) => { fetchCalls.push(String(url)); return fetchImpl(url, opts); },
    searchJob: require("./search-job.js"),
    licence: require("./licence.js"),
    config: {
      CDX_PROXY: "/api/cdx",
      CDX_BASE: "https://web.archive.org/cdx/search/cdx",
      ARQUIVO_PROXY: "/api/arquivo",
      ARQUIVO_CDX_BASE: "https://arquivo.pt/wayback/cdx",
      ARQUIVO_TEXTSEARCH_BASE: "https://arquivo.pt/textsearch",
      GHOSTARCHIVE_PROXY: "/api/ghostarchive",
      COMMONCRAWL_PROXY: "/api/commoncrawl",
      CC_CRAWL: "CC-MAIN-2026-47",
      PRICING: [
        { id: "free", name: "Free", price: "$0", cadence: "forever", blurb: "Try it.", features: ["25 captures"], cta: "Start free", checkout: null },
        { id: "pro", name: "Pro", price: "$19", regular: "$29", cadence: "one-time", blurb: "More.", features: ["2,500 captures"], cta: "Buy Pro", checkout: "pro" },
      ],
      FEATURE_CHART: [],
      LAUNCH_NOTE: "Launch note (test).",
      CHECKOUT: { provider: "paddle", links: { paddle: {} } },
      LICENCE: { demo_secret: "test-demo-secret" },
    },
    extra: {
      fetchPattern: async () => [W_ROW1],
      $: (id) => dom.document.getElementById(id),
      cdxUrl: () => new URL("http://127.0.0.1/api/cdx"),
    },
  });
  // Load order mirrors index.html (parsers before their modules).
  H.loadFiles(sandbox, ["presets-ui.js", "modes.js", "console-fetch.js", "console.js",
    "render-rows.js", "pricing-ui.js", "datepickers.js", "arquivo-parse.js", "arquivo.js",
    "ghostarchive.js", "commoncrawl.js"]);
  const api = {
    sandbox, els: dom.els, bySelector: dom.bySelector, fetchCalls,
    status: () => sandbox.document.getElementById("status").textContent,
    note: () => sandbox.document.getElementById("source-note").textContent,
    failHidden: () => sandbox.document.getElementById("fail-actions").hidden,
    renderedRows: () => (dom.bySelector["#results tbody"] ? dom.bySelector["#results tbody"].children.length : 0),
    renderedHtml: () => (dom.bySelector["#results tbody"] ? dom.bySelector["#results tbody"].children.map((c) => c.innerHTML).join("\n") : ""),
    getRows: () => sandbox.window.WS_CONSOLE.getRows(),
    setFetch: (fn) => { fetchImpl = fn; },
    setForm: (over) => {
      over = over || {};
      sandbox.document.getElementById("network").value = over.network || "x";
      sandbox.document.getElementById("handle").value = over.handle || "jack";
      sandbox.document.getElementById("limit").value = over.limit || "20";
      sandbox.document.getElementById("from").value = over.from || "";
      sandbox.document.getElementById("to").value = over.to || "";
      sandbox.document.getElementById("broad").checked = false;
      sandbox.document.getElementById("source").value = over.source || "wayback";
      sandbox.document.getElementById("keyword").value = over.keyword || "";
      sandbox.document.getElementById("keyword").disabled = false;
    },
  };
  api.setForm();
  return api;
}

function hangFetch(url, opts) {
  return new Promise((resolve, reject) => {
    const signal = opts && opts.signal;
    if (!signal) return;
    if (signal.aborted) {
      const e = new Error("aborted"); e.name = "AbortError"; reject(e); return;
    }
    signal.addEventListener("abort", () => {
      const e = new Error("aborted"); e.name = "AbortError"; reject(e);
    });
  });
}

async function main() {
  // --- wiring: WS_GHOSTARCHIVE exposes the patterns + links -------
  {
    const ctx = makeCtx();
    const GH = ctx.sandbox.window.WS_GHOSTARCHIVE;
    check("WS_GHOSTARCHIVE loads", typeof GH, "object");
    check("patternsFor(x) has the status prefix",
      GH.patternsFor("x"), ["twitter.com/{id}/status/"]);
    check("patternsFor(bluesky) has the post prefix",
      GH.patternsFor("bluesky"), ["bsky.app/profile/{id}/post/"]);
    check("patternsFor(instagram) has no listing",
      GH.patternsFor("instagram"), null);
    check("patternsFor(mastodon) has no listing",
      GH.patternsFor("mastodon"), null);
    check("ghostarchivePattern(x, jack)",
      GH.ghostarchivePattern("jack", "x"), "twitter.com/jack/status/");
    check("ghostarchivePattern strips a leading @",
      GH.ghostarchivePattern("@jack", "x"), "twitter.com/jack/status/");
    check("archiveLink(ghostarchive) points at the /archive/ id",
      GH.archiveLink("ghostarchive", "20240414033258", "https://twitter.com/jack/status/20", "AJzyo"),
      "https://ghostarchive.org/archive/AJzyo");
    check("archiveLink(ghostarchive, no id) falls back to search",
      GH.archiveLink("ghostarchive", "20240414033258", "https://twitter.com/jack/status/20", ""),
      "https://ghostarchive.org/search?term=https%3A%2F%2Ftwitter.com%2Fjack%2Fstatus%2F20");
    check("archiveLink(wayback) points at web.archive.org",
      GH.archiveLink("wayback", "20230101120000", "https://twitter.com/jack/status/1"),
      "https://web.archive.org/web/20230101120000/https://twitter.com/jack/status/1");
    check("parse keeps the archive id + tags the source",
      GH.parseGhostarchiveCdxArray(GHOST_BODY, "ghostarchive"),
      [G_ROW1.concat(["ghostarchive"]), G_ROW2.concat(["ghostarchive"])]);
    check("parse drops short rows",
      GH.parseGhostarchiveCdxArray([HEADER, ["x"], G_ROW1], "ghostarchive").length, 1);
    check("inGhostarchiveRange drops undated rows when ranged",
      GH.inGhostarchiveRange("", "20240101", "20241231"), false);
    check("inGhostarchiveRange keeps undated rows when unranged",
      GH.inGhostarchiveRange("", "", ""), true);
  }

  // --- fetch: proxy URL, error text, stall timeout -----------------
  {
    const ctx = makeCtx();
    const GH = ctx.sandbox.window.WS_GHOSTARCHIVE;
    ctx.setFetch(async (url) => {
      if (String(url).includes("/api/ghostarchive")) return { ok: true, json: async () => GHOST_BODY };
      return { ok: true, json: async () => CDX_BODY };
    });
    const rows = await GH.fetchGhostarchive(
      { pattern: "twitter.com/{id}/status/", handle: "jack", limit: 20, from: "", to: "" });
    check("fetchGhostarchive returns 2 rows", rows.length, 2);
    check("fetchGhostarchive rows carry the source", rows.map((r) => r[8]),
      ["ghostarchive", "ghostarchive"]);
    check("fetchGhostarchive calls the proxy",
      ctx.fetchCalls.filter((u) => u.includes("/api/ghostarchive?url=twitter.com%2Fjack%2Fstatus%2F")).length, 1);
    check("fetchGhostarchive range-filters client-side",
      (await GH.fetchGhostarchive(
        { pattern: "twitter.com/{id}/status/", handle: "jack", limit: 20, from: "20240501", to: "20240531" })
      ).length, 1);
  }
  {
    const ctx = makeCtx();
    const GH = ctx.sandbox.window.WS_GHOSTARCHIVE;
    ctx.setFetch(async () => ({ ok: false, status: 504, json: async () => ({ error: "Ghostarchive didn't answer in time" }) }));
    let err = null;
    try {
      await GH.fetchGhostarchive({ pattern: "x", handle: "jack", limit: 20, from: "", to: "" });
    } catch (e) { err = e; }
    checkHas("fetchGhostarchive 504 throws the honest message",
      err && err.message, "didn't answer in time");
  }
  {
    // The stall bound is injected the way the real search does it:
    // ghostarchiveSteps passes timedMs() (window.WS_FETCH_TIMEOUT_MS)
    // into fetchGhostarchiveTimed — a direct call without it uses
    // the 120s production default, which is correct but slow.
    const ctx = makeCtx();
    const GH = ctx.sandbox.window.WS_GHOSTARCHIVE;
    ctx.sandbox.window.WS_FETCH_TIMEOUT_MS = 50;
    ctx.setFetch(hangFetch);
    const steps = GH.ghostarchiveSteps(
      { net: "x", id: "jack", limit: 20, from: "", to: "",
        addRow: () => true, urlPattern: null });
    const t0 = Date.now();
    let err = null;
    try {
      await steps[0].run();
    } catch (e) { err = e; }
    check("stalled fetch throws TimeoutError", err && err.name, "TimeoutError");
    check("stalled fetch finishes promptly (ms)", Date.now() - t0 < 5000, true);
  }

  // --- steps: URL mode + per-handle mode, addRow contract ---------
  {
    const ctx = makeCtx();
    const GH = ctx.sandbox.window.WS_GHOSTARCHIVE;
    ctx.setFetch(async () => ({ ok: true, json: async () => GHOST_BODY }));
    const seen = [];
    const addRow = (r, src) => { seen.push([r[1], src]); return true; };
    const urlSteps = GH.ghostarchiveSteps(
      { net: "instagram", id: "https://instagram.com/p/ABC/", limit: 20, from: "", to: "",
        addRow, urlPattern: "https://instagram.com/p/ABC/" });
    check("URL mode: one step even for an unlisted network", urlSteps.length, 1);
    check("URL mode: step label names the post", urlSteps[0].label, "Ghostarchive — this post");
    await urlSteps[0].run();
    check("URL mode: step adds both rows", seen.length, 2);
    check("URL mode: rows tagged ghostarchive", seen.map((s) => s[1]),
      ["ghostarchive", "ghostarchive"]);

    const xSteps = GH.ghostarchiveSteps(
      { net: "x", id: "jack", limit: 20, from: "", to: "", addRow, urlPattern: null });
    check("handle mode: one step for X", xSteps.length, 1);
    const igSteps = GH.ghostarchiveSteps(
      { net: "instagram", id: "nasa", limit: 20, from: "", to: "", addRow, urlPattern: null });
    check("handle mode: no steps for Instagram (no listing)", igSteps.length, 0);
  }

  // --- search() end-to-end (console.js wires the source in) -------
  // SEARCH_WIRED is true now that console.js dispatches the
  // ghostarchive source (Track L integration): the blocks below
  // run against the real search().
  const SEARCH_WIRED = true;
  if (SEARCH_WIRED) {
    const ctx = makeCtx();
    ctx.setForm({ source: "ghostarchive" });
    ctx.setFetch(async (url) => {
      if (String(url).includes("/api/ghostarchive")) return { ok: true, json: async () => GHOST_BODY };
      return { ok: true, json: async () => CDX_BODY };
    });
    await ctx.sandbox.search(false);
    check("ghostarchive-only finds 2 captures", ctx.status().includes("Found 2 capture(s)"), true);
    checkHas("ghostarchive-only status shows per-source counts", ctx.status(), "Ghostarchive: 2");
    check("ghostarchive-only renders 2 rows", ctx.renderedRows(), 2);
    check("ghostarchive-only row sources are ghostarchive",
      ctx.getRows().sources, ["ghostarchive", "ghostarchive"]);
    checkHas("ghostarchive-only snapshot links point at ghostarchive.org",
      ctx.renderedHtml(), "ghostarchive.org/archive/AJzyo");
    checkHas("ghostarchive-only rows carry the Ghostarchive label",
      ctx.renderedHtml(), "Ghostarchive");
    // "All archives": the shared capture (Wayback row, also
    // returned by the Arquivo.pt and Common Crawl mocks) dedupes
    // to one row, Wayback winning the tie; the Ghostarchive-only
    // rows keep their source label and snapshot link.
    const ctxB = makeCtx();
    ctxB.setForm({ source: "both" });
    ctxB.setFetch(async (url) => {
      if (String(url).includes("/api/ghostarchive")) return { ok: true, json: async () => GHOST_BODY };
      return { ok: true, json: async () => CDX_BODY };
    });
    await ctxB.sandbox.search(false);
    check("both finds 3 captures (shared row deduped)", ctxB.status().includes("Found 3 capture(s)"), true);
    checkHas("both status shows Wayback + Ghostarchive counts", ctxB.status(), "Wayback: 1 · Ghostarchive: 2");
    check("both renders 3 rows", ctxB.renderedRows(), 3);
    check("both row sources are wayback then ghostarchive",
      ctxB.getRows().sources, ["wayback", "ghostarchive", "ghostarchive"]);
    checkHas("both snapshot links still point at ghostarchive.org",
      ctxB.renderedHtml(), "ghostarchive.org/archive/AJzyo");
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures) { console.error(`${failures} FAILURES`); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
