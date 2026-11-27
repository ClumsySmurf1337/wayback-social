/* Shared fixtures + context for the Arquivo.pt web-source test
 * suite (arquivo.test.js, arquivo-gates.test.js,
 * arquivo-evidence.test.js). Owns the vm/DOM setup via
 * web/test-harness.js (Track K) plus the Arquivo fixtures: the CDX
 * bodies, the per-test context (makeCtx), the dual-proxy router
 * (routeBoth) and the stalling fetch (hangFetch). Test files keep
 * only their own check() helpers + blocks, so no file re-copies
 * the ~150-line setup.
 */
"use strict";
const H = require("./test-harness.js");

const HEADER = ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"];
const W_ROW1 = ["com,twitter)/jack/status/1", "20230101120000",
  "https://twitter.com/jack/status/1", "text/html", "200", "A", "1"];
const W_ROW2 = ["com,twitter)/jack/status/2", "20230201120000",
  "https://twitter.com/jack/status/2", "text/html", "200", "B", "1"];
const CDX_BODY = [HEADER, W_ROW1, W_ROW2];
// A_ROW_DUP is the SAME capture (same timestamp + URL) as W_ROW1 —
// in "Both" mode it must dedupe to one row, Wayback winning the tie.
const A_ROW_DUP = ["twitter.com/jack/status/1", "20230101120000",
  "https://twitter.com/jack/status/1", "text/html", "200", "A", "1"];
const A_ROW2 = ["twitter.com/jack/status/3", "20230301120000",
  "https://twitter.com/jack/status/3", "text/html", "200", "C", "1"];
const ARQ_BODY = [HEADER, A_ROW_DUP, A_ROW2];
// Host-alias rows (Track K item 3): the SAME capture as W_ROW1
// (same timestamp, same post) stored under x.com / www.twitter.com
// instead of twitter.com — Both mode must dedupe these to one row,
// Wayback winning the tie. A_ROW_X_LATER is the same post under
// x.com at a DIFFERENT timestamp: a separate capture, must stay.
const A_ROW_X = ["x.com/jack/status/1", "20230101120000",
  "https://x.com/jack/status/1", "text/html", "200", "A", "1"];
const A_ROW_WWW = ["www.twitter.com/jack/status/1", "20230101120000",
  "https://www.twitter.com/jack/status/1", "text/html", "200", "A", "1"];
const A_ROW_X_LATER = ["x.com/jack/status/1", "20230401120000",
  "https://x.com/jack/status/1", "text/html", "200", "A", "1"];


function makeCtx() {
  const dom = H.createDom();
  // fetch behaviour is swapped per test through fetchImpl; every
  // call is recorded so "no fetch ran" is provable.
  let fetchImpl = async () => ({ ok: true, json: async () => CDX_BODY });
  const fetchCalls = [];
  const sandbox = H.createSandbox(dom, {
    locationSearch: "?cdx=proxy&arquivo=proxy",
    fetch: (url, opts) => { fetchCalls.push(String(url)); return fetchImpl(url, opts); },
    searchJob: require("./search-job.js"),
    // The REAL licence module: planCaps is the same code the page
    // uses, so the keyword_search gate is tested for real.
    licence: require("./licence.js"),
    config: {
      CDX_PROXY: "/api/cdx",
      CDX_BASE: "https://web.archive.org/cdx/search/cdx",
      ARQUIVO_PROXY: "/api/arquivo",
      ARQUIVO_CDX_BASE: "https://arquivo.pt/wayback/cdx",
      ARQUIVO_TEXTSEARCH_BASE: "https://arquivo.pt/textsearch",
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
      // Stubs the loaded scripts overwrite (console-fetch.js
      // replaces fetchPattern/cdxUrl with the real ones at load;
      // console.js's const $ shadows the $ stub the same way).
      fetchPattern: async () => [W_ROW1, W_ROW2],
      $: (id) => dom.document.getElementById(id),
      cdxUrl: () => new URL("http://127.0.0.1/api/cdx"),
    },
  });
  // Load order mirrors index.html (presets before modes, fetch
  // layer before console, parsers before arquivo,
  // pricing/datepickers after console).
  H.loadFiles(sandbox, ["presets-ui.js", "modes.js", "url-alias.js", "url-mode.js", "console-fetch.js", "console.js",
    "render-rows.js", "pricing-ui.js", "datepickers.js", "arquivo-parse.js", "arquivo.js"]);
  const api = {
    sandbox, els: dom.els, bySelector: dom.bySelector, fetchCalls,
    status: () => sandbox.document.getElementById("status").textContent,
    note: () => sandbox.document.getElementById("source-note").textContent,
    failHidden: () => sandbox.document.getElementById("fail-actions").hidden,
    renderedRows: () => (dom.bySelector["#results tbody"] ? dom.bySelector["#results tbody"].children.length : 0),
    renderedHtml: () => (dom.bySelector["#results tbody"] ? dom.bySelector["#results tbody"].children.map((c) => c.innerHTML).join("\n") : ""),
    resultsHidden: () => sandbox.document.getElementById("results").hidden,
    dlgTitle: () => sandbox.document.getElementById("dlgTitle").textContent,
    cdxLink: () => sandbox.document.getElementById("cdx-link").href,
    getRows: () => sandbox.window.WS_CONSOLE.getRows(),
    setFetch: (fn) => { fetchImpl = fn; },
    setTier: (tier) => {
      if (tier) dom.storage.setItem("ws_licence_tier", tier);
      else dom.storage.removeItem("ws_licence_tier");
    },
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
      api.setTier(over.tier || null);
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

function routeBoth() {
  return async (url) => {
    const u = String(url);
    if (u.includes("/api/arquivo")) return { ok: true, json: async () => ARQ_BODY };
    if (u.includes("/api/cdx")) return { ok: true, json: async () => CDX_BODY };
    throw new Error("unexpected fetch: " + u);
  };
}

module.exports = { HEADER, W_ROW1, W_ROW2, CDX_BODY, A_ROW_DUP, A_ROW2, ARQ_BODY, A_ROW_X, A_ROW_WWW, A_ROW_X_LATER, makeCtx, hangFetch, routeBoth };
