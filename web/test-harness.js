/* Shared vm harness for the web console's Node tests
 * (console-timeout.test.js, arquivo.test.js, url-mode.test.js).
 *
 * The console is a set of browser scripts loaded in a vm context
 * with a stubbed DOM — every test file used to carry its own ~150
 * lines of that setup, copied with small drifts. This module is the
 * one copy: the DOM stub (el/els/storage), the sandbox, and the file
 * loader. Each test keeps its own check() (the comparison semantics
 * differ per file) and its own per-test api (status(), setForm(),
 * …) on top.
 *
 * Usage:
 *   const H = require("./test-harness.js");
 *   const dom = H.createDom();
 *   const sandbox = H.createSandbox(dom, {
 *     locationSearch: "?cdx=proxy",
 *     fetch: (url, opts) => fetchImpl(url, opts),
 *     searchJob: require("./search-job.js"),   // -> window.WS_SEARCH_JOB
 *     licence: require("./licence.js"),        // -> window.WAYBACK_LICENCE
 *     config: { ... },                        // -> window.WAYBACK_SOCIAL_CONFIG
 *     extra: { fetchPattern: async () => [], $: (id) => ... }, // sandbox globals
 *   });
 *   H.loadFiles(sandbox, ["presets-ui.js", "modes.js",
 *     "console-fetch.js", "console.js"]);
 *
 * The harness is NOT a test — CI runs the *.test.js files, which
 * require this module. Run: node web/<name>.test.js
 */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

function createDom() {
  const els = {};
  const bySelector = {};
  function el() {
    const handlers = {};
    const node = {
      innerHTML: "", hidden: false, disabled: false, textContent: "",
      value: "", style: {}, max: 0, checked: false, href: "",
      children: [],
      setAttribute() {},
      addEventListener(type, fn) { (handlers[type] || (handlers[type] = [])).push(fn); },
      appendChild(child) { node.children.push(child); return child; },
      removeChild(child) {
        node.children = node.children.filter((c) => c !== child);
        return child;
      },
      click() { (handlers.click || []).forEach((fn) => fn({})); },
      showModal() {},
      after() {},
      get firstChild() { return node.children[0] || null; },
    };
    return node;
  }
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  // The real page starts #results, #actions and #fail-actions
  // hidden (index.html); the stub must match, or the failure path
  // would "show" a table that was never rendered.
  const document = {
    querySelectorAll: () => [],
    querySelector: (sel) => {
      if (sel === "#results tbody") return (bySelector[sel] || (bySelector[sel] = el()));
      return null;
    },
    getElementById: (id) => {
      if (!els[id]) {
        els[id] = el();
        if (id === "results" || id === "actions" || id === "fail-actions") els[id].hidden = true;
      }
      return els[id];
    },
    body: { setAttribute() {}, appendChild() {} },
    createElement: () => el(),
    createTextNode: (text) => ({ textContent: text, nodeType: 3 }),
  };
  return { els, bySelector, el, store, storage, document };
}

function createSandbox(dom, opts) {
  opts = opts || {};
  const search = opts.locationSearch || "";
  const sandbox = {
    console, setTimeout, clearTimeout, URL, URLSearchParams, AbortController,
    document: dom.document,
    location: { hostname: "127.0.0.1", href: "http://127.0.0.1/" + search, search },
    fetch: opts.fetch || (async () => ({ ok: true, json: async () => [] })),
    window: {},
  };
  if (opts.searchJob) sandbox.window.WS_SEARCH_JOB = opts.searchJob;
  if (opts.licence) sandbox.window.WAYBACK_LICENCE = opts.licence;
  if (opts.config) sandbox.window.WAYBACK_SOCIAL_CONFIG = opts.config;
  sandbox.window.localStorage = dom.storage;
  sandbox.window.sessionStorage = dom.storage;
  // console.js reads bare localStorage/sessionStorage at load.
  sandbox.localStorage = dom.storage;
  sandbox.sessionStorage = dom.storage;
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  Object.assign(sandbox, opts.extra || {});
  vm.createContext(sandbox);
  return sandbox;
}

// Load browser scripts in order, in the same vm context — mirrors
// the <script> order in web/index.html.
function loadFiles(sandbox, files) {
  for (const f of files) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, f), "utf8"),
      sandbox, { filename: f });
  }
}

module.exports = { createDom, createSandbox, loadFiles };
