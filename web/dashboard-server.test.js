/* Node test — dashboard server wiring (issue #15 follow-up,
 * Track L). web/dashboard-server.js against stubbed DOM +
 * localStorage + fetch. The real evidence-usage.js and licence.js
 * are used, so the local count and the plan caps are the same
 * code the page uses.
 * Run:  node web/dashboard-server.test.js
 */
"use strict";
const EV = require("./evidence-usage.js");
const LIC = require("./licence.js");

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

const KEY = "DP1-STUDIO-372HNQ5XFCL23X5T-1817d678";

function makeStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function makeEl() {
  const handlers = {};
  return {
    textContent: "", innerHTML: "", hidden: false, value: "",
    onclick: null,
    addEventListener: (type, fn) => { (handlers[type] = handlers[type] || []).push(fn); },
    _handlers: handlers,
    click: function () {
      if (this.onclick) this.onclick();
      (handlers.click || []).forEach((fn) => fn());
    },
  };
}

// Fresh module + globals per test: the module reads window/
// document/localStorage/fetch at call time (not load time), but
// its state (serverUsed, lastLocal) lives in the module closure,
// so the require cache is cleared between tests.
function freshCtx({ fetchImpl, tier, key, localUsed } = {}) {
  const store = makeStore();
  if (tier) store.setItem("ws_licence_tier", tier);
  if (key) store.setItem("ws_licence", key);
  if (localUsed != null && key) EV.setUsed(store, key, localUsed);
  const els = {
    usage: makeEl(),
    "usage-note": makeEl(),
    "usage-server-note": makeEl(),
    "billing-portal-go": makeEl(),
    "billing-portal-status": makeEl(),
    "log-evidence": makeEl(),
    "licence-verify": makeEl(),
    "licence-clear": makeEl(),
  };
  // The evidence stat render() writes: one div per stat, the
  // evidence one carrying "evidence-pack reports used".
  const usageDivs = [
    { textContent: "0 web searches this month", innerHTML: "" },
    { textContent: "25000 captures per search (cap)", innerHTML: "" },
    { textContent: (localUsed || 0) + " / 10evidence-pack reports used", innerHTML: "" },
    { textContent: "5 seat(s)", innerHTML: "" },
  ];
  const fetchCalls = [];
  let impl = fetchImpl || (async () => ({ ok: false, status: 503, json: async () => ({}) }));
  const opened = [];
  let domReady = null;
  global.localStorage = store;
  global.document = {
    readyState: "loading",
    getElementById: (id) => els[id] || null,
    querySelectorAll: (sel) => (sel === "#usage div" ? usageDivs : []),
    addEventListener: (type, fn) => { if (type === "DOMContentLoaded") domReady = fn; },
  };
  global.window = {
    WS_EVIDENCE: EV,
    WAYBACK_LICENCE: LIC,
    crypto: { randomUUID: () => "idem-test-1" },
    open: (url, target) => { opened.push({ url, target }); },
  };
  global.fetch = async (url, opts) => {
    fetchCalls.push({ url: String(url), opts: opts || null });
    return impl(url, opts);
  };
  delete require.cache[require.resolve("./dashboard-server.js")];
  const mod = require("./dashboard-server.js");
  // init() is NOT fired here: the caller fires ready() after
  // registering its fake inline handlers — the real page
  // registers the inline dashboard handlers during parse, before
  // DOMContentLoaded fires init(), so a log click must run the
  // inline handler first and the dashboard-server listener after.
  return { mod, els, usageDivs, fetchCalls, opened, store,
    ready: () => { if (domReady) domReady(); },
    setFetch: (fn) => { impl = fn; },
    evidenceDiv: () => usageDivs[2] };
}

async function tick() { await new Promise((r) => setTimeout(r, 0)); }

async function main() {
  // --- no key: no server call, local-only -------------------------
  {
    const ctx = freshCtx({ tier: "studio" });
    ctx.ready();
    await tick();
    check("no key: no fetch ran", ctx.fetchCalls.length, 0);
    check("no key: server note empty", ctx.els["usage-server-note"].textContent, "");
  }

  // --- server count higher than local: shown, both named ---------
  {
    const ctx = freshCtx({ tier: "studio", key: KEY, localUsed: 1 });
    ctx.setFetch(async (url) => ({
      ok: true, status: 200,
      json: async () => ({ used: 3, included: 10, remaining: 7, tier: "studio", source: "server", verified: true }),
    }));
    await ctx.mod.refreshServerUsage();
    checkHas("server 3 > local 1: stat shows the server count",
      ctx.evidenceDiv().innerHTML, "<b>3 / 10</b>");
    checkHas("server 3 > local 1: stat names both counts",
      ctx.evidenceDiv().innerHTML, "server: 3 · this device: 1");
    checkHas("server 3 > local 1: note names both counts",
      ctx.els["usage-server-note"].textContent, "Server count: 3 · this device: 1");
  }

  // --- server agrees with local: plain stat, no note --------------
  {
    const ctx = freshCtx({ tier: "studio", key: KEY, localUsed: 3 });
    ctx.setFetch(async (url) => ({
      ok: true, status: 200,
      json: async () => ({ used: 3, included: 10, remaining: 7, tier: "studio", source: "server", verified: true }),
    }));
    await ctx.mod.refreshServerUsage();
    checkHas("server == local: stat shows the count",
      ctx.evidenceDiv().innerHTML, "<b>3 / 10</b>");
    check("server == local: stat has no server annotation",
      ctx.evidenceDiv().innerHTML.includes("server:"), false);
    check("server == local: note empty", ctx.els["usage-server-note"].textContent, "");
  }

  // --- server 404: no D1 row — local count stands, note says so --
  {
    const ctx = freshCtx({ tier: "studio", key: KEY, localUsed: 2 });
    ctx.setFetch(async (url) => ({
      ok: false, status: 404,
      json: async () => ({ error: "no server record for this key" }),
    }));
    await ctx.mod.refreshServerUsage();
    checkHas("404: stat keeps the local count",
      ctx.evidenceDiv().innerHTML, "<b>2 / 10</b>");
    checkHas("404: note says counting on this device",
      ctx.els["usage-server-note"].textContent, "No server usage record for this key yet");
  }

  // --- server unreachable: local-only, no crash -------------------
  {
    const ctx = freshCtx({ tier: "studio", key: KEY, localUsed: 2 });
    ctx.setFetch(async () => { throw new Error("network down"); });
    await ctx.mod.refreshServerUsage();
    checkHas("unreachable: stat keeps the local count",
      ctx.evidenceDiv().innerHTML, "<b>2 / 10</b>");
    check("unreachable: note empty", ctx.els["usage-server-note"].textContent, "");
  }

  // --- log button: local log mirrors server-side ------------------
  {
    const ctx = freshCtx({ tier: "studio", key: KEY, localUsed: 1 });
    const posts = [];
    ctx.setFetch(async (url, opts) => {
      if (String(url).includes("/api/evidence-usage") && opts && opts.method === "POST") {
        posts.push(JSON.parse(opts.body));
        return { ok: true, status: 200,
          json: async () => ({ ok: true, used: 2, included: 10, remaining: 8, tier: "studio", source: "server", verified: true }) };
      }
      return { ok: true, status: 200,
        json: async () => ({ used: 2, included: 10, remaining: 8, tier: "studio", source: "server", verified: true }) };
    });
    // The inline dashboard handler (an onclick property, set
    // during parse in the real page — before init() registers the
    // dashboard-server listener) logs locally; the click then
    // fires the dashboard-server listener, which sees the local
    // count moved and mirrors it server-side.
    ctx.els["log-evidence"].onclick = () => {
      EV.logReport(ctx.store, KEY, 10);
    };
    ctx.ready();
    ctx.els["log-evidence"].click();
    await tick(); await tick();
    check("log mirrors: one POST to /api/evidence-usage", posts.length, 1);
    check("log mirrors: POST carries the key", posts[0].key, KEY);
    checkHas("log mirrors: POST carries an idempotency key",
      posts[0].idempotency_key, "idem-test-1");
  }

  // --- billing portal: 200 opens the real URL ---------------------
  {
    const ctx = freshCtx({ tier: "studio", key: KEY });
    ctx.setFetch(async (url) => ({
      ok: true, status: 200,
      json: async () => ({ portal_url: "https://billing.stripe.com/p/session/test_123", return_url: "https://app.deletedproof.northforgelabs.dev/dashboard.html" }),
    }));
    await ctx.mod.openBillingPortal();
    check("portal 200: opens the session URL", ctx.opened.length, 1);
    check("portal 200: URL is Stripe's", ctx.opened[0].url, "https://billing.stripe.com/p/session/test_123");
    check("portal 200: new tab", ctx.opened[0].target, "_blank");
    checkHas("portal 200: status says it opened",
      ctx.els["billing-portal-status"].textContent, "Portal opened in a new tab");
    check("portal 200: no /api/evidence-usage call leaked in",
      ctx.fetchCalls.filter((c) => c.url.includes("evidence-usage")).length, 0);
  }

  // --- billing portal: honest states, never a fake link -----------
  {
    const noKey = freshCtx({ tier: "studio" });
    await noKey.mod.openBillingPortal();
    checkHas("portal no key: asks for a key first",
      noKey.els["billing-portal-status"].textContent, "Add a licence key above first");
    check("portal no key: nothing opened", noKey.opened.length, 0);

    const notLinked = freshCtx({ tier: "studio", key: KEY });
    notLinked.setFetch(async () => ({ ok: false, status: 404,
      json: async () => ({ error: "no Stripe customer is linked to this licence yet" }) }));
    await notLinked.mod.openBillingPortal();
    checkHas("portal 404: says no customer linked",
      notLinked.els["billing-portal-status"].textContent, "No Stripe customer is linked");
    check("portal 404: nothing opened", notLinked.opened.length, 0);

    const badKey = freshCtx({ tier: "studio", key: KEY });
    badKey.setFetch(async () => ({ ok: false, status: 401,
      json: async () => ({ error: "Invalid key" }) }));
    await badKey.mod.openBillingPortal();
    checkHas("portal 401: says the key didn't check out",
      badKey.els["billing-portal-status"].textContent, "didn't check out");
    check("portal 401: nothing opened", badKey.opened.length, 0);
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures) { console.error(`${failures} FAILURES`); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
