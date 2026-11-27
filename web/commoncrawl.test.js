/* Node test — Common Crawl as a web source (issue #8 follow-up,
 * Track L). Module-level: patterns, links, parsing, the timed
 * fetch, and the SearchJob step builders. The end-to-end search()
 * blocks (source selector -> steps -> rows, incl. the "All
 * archives" merge) live in this file too and run against the
 * real search() — console.js wires the source in (Track L).
 * Run:  node web/commoncrawl.test.js
 */
"use strict";
const H = require("./test-harness.js");

const HEADER = ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"];
const C_ROW1 = ["com,example)/", "20261106154953", "https://www.example.com/", "text/html", "200", "ABC", "998", "CC-MAIN-2026-47"];
const C_ROW2 = ["com,example)/", "20261101000000", "https://example.com/", "text/html", "200", "DEF", "500", "CC-MAIN-2026-47"];
const CC_BODY = [HEADER, C_ROW1, C_ROW2];
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
  let fetchImpl = async () => ({ ok: true, json: async () => CC_BODY });
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
  // --- wiring: WS_COMMONCRAWL exposes the patterns + links --------
  {
    const ctx = makeCtx();
    const CC = ctx.sandbox.window.WS_COMMONCRAWL;
    check("WS_COMMONCRAWL loads", typeof CC, "object");
    check("patternsFor(x) has the status pattern",
      CC.patternsFor("x"), ["twitter.com/{id}/status/*"]);
    check("patternsFor(instagram) has a listing",
      CC.patternsFor("instagram"), ["instagram.com/{id}/*"]);
    check("patternsFor covers all 14 networks",
      ["x", "instagram", "facebook", "tiktok", "youtube", "reddit",
       "linkedin", "threads", "bluesky", "mastodon", "pinterest",
       "tumblr", "twitch", "medium"].every((n) => CC.patternsFor(n) !== null), true);
    check("patternsFor(unknown) has no listing",
      CC.patternsFor("myspace"), null);
    check("commoncrawlPattern(x, jack)",
      CC.commoncrawlPattern("jack", "x"), "twitter.com/jack/status/*");
    check("commoncrawlPattern strips a leading @",
      CC.commoncrawlPattern("@jack", "x"), "twitter.com/jack/status/*");
    check("commoncrawlCrawl defaults to the CLI crawl",
      CC.commoncrawlCrawl({ CC_CRAWL: "CC-MAIN-2026-47" }), "CC-MAIN-2026-47");
    check("archiveLink(commoncrawl) points at the index record",
      CC.archiveLink("commoncrawl", "20261106154953", "https://www.example.com/", "CC-MAIN-2026-47"),
      "https://index.commoncrawl.org/CC-MAIN-2026-47-index?url=https%3A%2F%2Fwww.example.com%2F&output=json");
    check("archiveLink(commoncrawl, no crawl) uses the default",
      CC.archiveLink("commoncrawl", "20261106154953", "https://www.example.com/", ""),
      "https://index.commoncrawl.org/CC-MAIN-2026-47-index?url=https%3A%2F%2Fwww.example.com%2F&output=json");
    check("archiveLink(wayback) points at web.archive.org",
      CC.archiveLink("wayback", "20230101120000", "https://twitter.com/jack/status/1"),
      "https://web.archive.org/web/20230101120000/https://twitter.com/jack/status/1");
    check("parse keeps the crawl id + tags the source",
      CC.parseCommoncrawlCdxArray(CC_BODY, "commoncrawl"),
      [C_ROW1.concat(["commoncrawl"]), C_ROW2.concat(["commoncrawl"])]);
    check("parse drops short rows",
      CC.parseCommoncrawlCdxArray([HEADER, ["x"], C_ROW1], "commoncrawl").length, 1);
    check("inCommoncrawlRange drops undated rows when ranged",
      CC.inCommoncrawlRange("", "20261101", "20261130"), false);
    check("inCommoncrawlRange keeps undated rows when unranged",
      CC.inCommoncrawlRange("", "", ""), true);
  }

  // --- fetch: proxy URL (crawl param), error text, stall timeout ---
  {
    const ctx = makeCtx();
    const CC = ctx.sandbox.window.WS_COMMONCRAWL;
    ctx.setFetch(async (url) => {
      if (String(url).includes("/api/commoncrawl")) return { ok: true, json: async () => CC_BODY };
      return { ok: true, json: async () => CDX_BODY };
    });
    const rows = await CC.fetchCommoncrawl(
      { pattern: "example.com/*", handle: "", limit: 20, from: "", to: "" });
    check("fetchCommoncrawl returns 2 rows", rows.length, 2);
    check("fetchCommoncrawl rows carry the source", rows.map((r) => r[8]),
      ["commoncrawl", "commoncrawl"]);
    check("fetchCommoncrawl sends the crawl id",
      ctx.fetchCalls.filter((u) => u.includes("/api/commoncrawl") && u.includes("crawl=CC-MAIN-2026-47")).length, 1);
    check("fetchCommoncrawl passes the pattern through (the Function strips the *)",
      ctx.fetchCalls.filter((u) => u.includes("url=example.com%2F*")).length, 1);
    check("fetchCommoncrawl range-filters client-side",
      (await CC.fetchCommoncrawl(
        { pattern: "example.com/*", handle: "", limit: 20, from: "20261105", to: "20261107" })
      ).length, 1);
  }
  {
    const ctx = makeCtx();
    const CC = ctx.sandbox.window.WS_COMMONCRAWL;
    ctx.setFetch(async () => ({ ok: false, status: 504, json: async () => ({ error: "Common Crawl index didn't answer in time" }) }));
    let err = null;
    try {
      await CC.fetchCommoncrawl({ pattern: "example.com/*", handle: "", limit: 20, from: "", to: "" });
    } catch (e) { err = e; }
    checkHas("fetchCommoncrawl 504 throws the honest message",
      err && err.message, "didn't answer in time");
  }
  {
    const ctx = makeCtx();
    const CC = ctx.sandbox.window.WS_COMMONCRAWL;
    ctx.sandbox.window.WS_FETCH_TIMEOUT_MS = 50;
    ctx.setFetch(hangFetch);
    const steps = CC.commoncrawlSteps(
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
    const CC = ctx.sandbox.window.WS_COMMONCRAWL;
    ctx.setFetch(async () => ({ ok: true, json: async () => CC_BODY }));
    const seen = [];
    const addRow = (r, src) => { seen.push([r[1], src]); return true; };
    const urlSteps = CC.commoncrawlSteps(
      { net: "x", id: "https://twitter.com/jack/status/20", limit: 20, from: "", to: "",
        addRow, urlPattern: "https://twitter.com/jack/status/20" });
    check("URL mode: one step", urlSteps.length, 1);
    check("URL mode: step label names the post", urlSteps[0].label, "Common Crawl — this post");
    await urlSteps[0].run();
    check("URL mode: step adds both rows", seen.length, 2);
    check("URL mode: rows tagged commoncrawl", seen.map((s) => s[1]),
      ["commoncrawl", "commoncrawl"]);

    const igSteps = CC.commoncrawlSteps(
      { net: "instagram", id: "nasa", limit: 20, from: "", to: "", addRow, urlPattern: null });
    check("handle mode: one step for Instagram (CC lists every network)", igSteps.length, 1);
  }

  // --- search() end-to-end (console.js wires the source in) -------
  // SEARCH_WIRED is true now that console.js dispatches the
  // commoncrawl source (Track L integration): the blocks below
  // run against the real search().
  const SEARCH_WIRED = true;
  if (SEARCH_WIRED) {
    const ctx = makeCtx();
    ctx.setForm({ source: "commoncrawl" });
    ctx.setFetch(async (url) => {
      if (String(url).includes("/api/commoncrawl")) return { ok: true, json: async () => CC_BODY };
      return { ok: true, json: async () => CDX_BODY };
    });
    await ctx.sandbox.search(false);
    check("commoncrawl-only finds 2 captures", ctx.status().includes("Found 2 capture(s)"), true);
    checkHas("commoncrawl-only status shows per-source counts", ctx.status(), "Common Crawl: 2");
    check("commoncrawl-only renders 2 rows", ctx.renderedRows(), 2);
    check("commoncrawl-only row sources are commoncrawl",
      ctx.getRows().sources, ["commoncrawl", "commoncrawl"]);
    checkHas("commoncrawl-only snapshot links point at the CC index",
      ctx.renderedHtml(), "index.commoncrawl.org/CC-MAIN-2026-47-index");
    checkHas("commoncrawl-only rows carry the Common Crawl label",
      ctx.renderedHtml(), "Common Crawl");
    // "All archives": the shared capture (Wayback row, also
    // returned by the Arquivo.pt and Ghostarchive mocks) dedupes
    // to one row, Wayback winning the tie; the Common Crawl-only
    // rows keep their source label and index-record link.
    const ctxB = makeCtx();
    ctxB.setForm({ source: "both" });
    ctxB.setFetch(async (url) => {
      if (String(url).includes("/api/commoncrawl")) return { ok: true, json: async () => CC_BODY };
      return { ok: true, json: async () => CDX_BODY };
    });
    await ctxB.sandbox.search(false);
    check("both finds 3 captures (shared row deduped)", ctxB.status().includes("Found 3 capture(s)"), true);
    checkHas("both status shows Wayback + Common Crawl counts", ctxB.status(), "Wayback: 1 · Common Crawl: 2");
    check("both renders 3 rows", ctxB.renderedRows(), 3);
    check("both row sources are wayback then commoncrawl",
      ctxB.getRows().sources, ["wayback", "commoncrawl", "commoncrawl"]);
    checkHas("both snapshot links still point at the CC index",
      ctxB.renderedHtml(), "index.commoncrawl.org/CC-MAIN-2026-47-index");
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures) { console.error(`${failures} FAILURES`); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
