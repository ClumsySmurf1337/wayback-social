/* Node test for web/modes.js — broad-search fetch timeout.
 * modes.js is a browser script: it runs initModes() at load and reads
 * console.js globals ($, NETWORKS, fetchPattern, ...). This harness
 * loads it in a vm context with stubs, so the timeout logic is testable
 * without a browser and without waiting 120s (timeoutMs is injectable
 * on fetchPatternTimed / checkNetwork).
 * Run:  node web/modes.test.js
 * Exit 0 = a stalled archive fetch times out as TimeoutError (not an
 * AbortError, so it never looks like a user Stop), a real Stop still
 * propagates as AbortError, and a timed-out pattern is counted as a
 * failed pattern while the network check continues with the next one.
 */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

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

function makeCtx(fetchPatternImpl, networks) {
  const els = {};
  function el() {
    const node = {
      innerHTML: "", hidden: false, disabled: false, textContent: "",
      value: "", style: {}, setAttribute() {}, addEventListener() {},
      click() {},
      // renderLimitsBox rebuilds #preset-limits as text + link.
      children: [],
      get firstChild() { return node.children[0] || null; },
      appendChild(child) { node.children.push(child); return child; },
      removeChild(child) {
        node.children = node.children.filter((c) => c !== child);
        return child;
      },
    };
    return node;
  }
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, AbortController,
    document: {
      querySelectorAll: () => [],
      getElementById: (id) => (els[id] || (els[id] = el())),
      body: { setAttribute() {} },
      createElement: () => el(),
      createTextNode: (text) => ({ textContent: text, nodeType: 3 }),
    },
    location: { search: "" },
    NETWORKS: networks,
    fetchPattern: fetchPatternImpl,
    $: (id) => sandbox.document.getElementById(id),
    cdxUrl: () => new URL("http://127.0.0.1/api/cdx"),
    currentCaps: () => ({ find_networks: 3 }),
    currentTier: () => "free",
    renderRows: () => {},
    setLastRows: () => {},
    recordHistory: () => {},
    recordUsage: () => {},
    search: async () => {},
    window: {},
  };
  sandbox.window.WS_SEARCH_JOB = require("./search-job.js");
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  // presets-ui.js owns PRESETS / activatePreset / initPresets now
  // (modes.js re-exports them on WS_MODES) — load it first, in the
  // same order as index.html.
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "presets-ui.js"), "utf8"),
    sandbox, { filename: "presets-ui.js" });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "modes.js"), "utf8"),
    sandbox, { filename: "modes.js" });
  return { sandbox, api: sandbox.module.exports };
}

const ROW = ["com,twitter)/jack/status/1", "20230101120000",
  "https://twitter.com/jack/status/1", "text/html", "200", "A", "1"];

async function main() {
  // --- production default ------------------------------------------------
  {
    const { api } = makeCtx(async () => [ROW], { x: { name: "X", patterns: ["p"] } });
    check("FETCH_TIMEOUT_MS is 120s", api.FETCH_TIMEOUT_MS, 120000);
  }

  // --- WS_MODES export: console.js reuses fetchPatternTimed ------------
  // Single search (console.js fetchSingle) calls the same wrapper, so
  // it must be on the WS_MODES export, not only in module.exports.
  {
    const { sandbox } = makeCtx(async () => [ROW], { x: { name: "X", patterns: ["p"] } });
    check("WS_MODES exposes fetchPatternTimed for console.js",
      typeof sandbox.window.WS_MODES.fetchPatternTimed, "function");
  }

  // --- fetchPatternTimed: fast fetch resolves normally -------------------
  {
    const { api } = makeCtx(async () => [ROW], { x: { name: "X", patterns: ["p"] } });
    const rows = await api.fetchPatternTimed("p", "jack", 20, "", "", undefined, 1000);
    check("timed fetch resolves rows", rows.length, 1);
  }

  // --- fetchPatternTimed: stalled fetch times out as TimeoutError --------
  // NOTE: the stub must honour the signal like real fetch does — a
  // promise that ignores abort never settles, and Node then exits
  // when the timer fires (no live handles left) instead of rejecting.
  {
    const hang = (pat, id, limit, from, to, signal) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => {
        const e = new Error("aborted"); e.name = "AbortError"; reject(e);
      });
    });
    const { api } = makeCtx(hang, { x: { name: "X", patterns: ["p"] } });
    let name = null;
    const t0 = Date.now();
    try {
      await api.fetchPatternTimed("p", "jack", 20, "", "", undefined, 50);
    } catch (e) { name = e && e.name; }
    check("stalled fetch throws TimeoutError", name, "TimeoutError");
    check("timeout fires promptly (ms)", Date.now() - t0 < 2000, true);
  }

  // --- fetchPatternTimed: a real Stop still propagates as AbortError -----
  {
    const jobCtrl = new AbortController();
    const { api } = makeCtx(
      (pat, id, limit, from, to, signal) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          const e = new Error("aborted"); e.name = "AbortError"; reject(e);
        });
      }),
      { x: { name: "X", patterns: ["p"] } });
    setTimeout(() => jobCtrl.abort(), 10);
    let name = null;
    try {
      await api.fetchPatternTimed("p", "jack", 20, "", "", jobCtrl.signal, 5000);
    } catch (e) { name = e && e.name; }
    check("job abort propagates as AbortError (not TimeoutError)", name, "AbortError");
  }

  // --- checkNetwork: timed-out pattern counted, next pattern runs --------
  {
    const nets = { t: { name: "T", patterns: ["hang://p1", "ok://p2"] } };
    const hang = (pat, id, limit, from, to, signal) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => {
        const e = new Error("aborted"); e.name = "AbortError"; reject(e);
      });
    });
    const { api } = makeCtx((pat, id, limit, from, to, signal) => {
      if (pat.startsWith("hang://")) return hang(pat, id, limit, from, to, signal);
      return Promise.resolve([ROW, ROW]);
    }, nets);
    const r = await api.checkNetwork("t", "jack", 20, "", "", undefined, 50);
    check("timed-out pattern counted", r.failedPatterns, 1);
    check("later pattern still ran (count)", r.count, 2);
    check("network with rows is not failed", r.failed, false);
  }

  // --- checkNetwork: every pattern stalled -> failed network, no throw ---
  {
    const nets = { t: { name: "T", patterns: ["hang://p1", "hang://p2"] } };
    const hang = (pat, id, limit, from, to, signal) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => {
        const e = new Error("aborted"); e.name = "AbortError"; reject(e);
      });
    });
    const { api } = makeCtx(hang, nets);
    const t0 = Date.now();
    const r = await api.checkNetwork("t", "jack", 20, "", "", undefined, 50);
    check("all-stalled network returns (no hang)", r.failed, true);
    check("all-stalled counts both patterns", r.failedPatterns, 2);
    check("all-stalled finishes promptly (ms)", Date.now() - t0 < 2000, true);
  }

  // --- honest-limits box (issue #9): preset ethics + universal limits -
  // The box is rebuilt as text + a Trust & safety link on every preset
  // activation; the universal line (no monitoring / no face recognition /
  // no verdicts / no minors) is always present, hiring adds the FCRA note.
  {
    const { sandbox } = makeCtx(async () => [ROW], { x: { name: "X", patterns: ["p"] } });
    const modes = sandbox.window.WS_MODES;
    const boxText = () => sandbox.document.getElementById("preset-limits")
      .children.map((c) => c.textContent || "").join("");
    const boxLink = () => {
      const kids = sandbox.document.getElementById("preset-limits").children;
      return kids.length ? kids[kids.length - 1] : null;
    };
    check("activatePreset catfish returns true",
      modes.activatePreset("catfish"), true);
    check("catfish box carries the preset ethics",
      boxText().includes("stolen photos"), true);
    check("catfish box carries the universal limits",
      boxText().includes("no face recognition") && boxText().includes("no minors"), true);
    check("limits box keeps a Trust & safety link",
      boxLink() && boxLink().href, "trust.html");
    modes.activatePreset("hiring");
    check("hiring box adds the FCRA note",
      boxText().includes("FCRA"), true);
    modes.activatePreset("legal");
    check("legal box carries triage ethics, no FCRA note",
      boxText().includes("Triage, not court-ready") && !boxText().includes("FCRA"), true);
    check("unknown preset returns false",
      modes.activatePreset("bogus"), false);
  }

  console.log(failures === 0
    ? `\nmodes: ${checks} checks passed`
    : `\nmodes: ${failures}/${checks} checks FAILED`);
  // Set exitCode (don't call process.exit(): it can truncate the
  // piped stdout above before it flushes).
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
