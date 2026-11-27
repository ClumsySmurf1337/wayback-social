/* Node tests for web/auth-ui.js — sign-in must never fail silently.
 * Run: node web/auth-ui.test.js  (no deps, no browser, no Clerk account).
 * The Clerk SDK itself is never loaded here; _setClerk injects fakes,
 * and document/window are stubs. 2026-11-27 the preview rendered a
 * Sign in button whose click did nothing — openSignIn() threw inside
 * Clerk and the throw escaped the click handler, with no error
 * anywhere on the page. These tests prove every failure path now
 * writes its reason where the user can see it.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const A = require("./auth.js");

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log("PASS  " + name); }
  else { failed++; console.log("FAIL  " + name + (extra ? "  ->  " + extra : "")); }
}

/* Minimal DOM stub: elements by id, each with textContent/innerHTML
 * and addEventListener. document.readyState "complete" so the IIFE
 * boots immediately (initAuth runs, but with no key it renders the
 * "unconfigured" state — harmless here). */
function makeDom(ids) {
  const els = {};
  for (const id of ids) {
    els[id] = { id, textContent: "", innerHTML: "", _listeners: {},
      addEventListener: function (ev, fn) { this._listeners[ev] = fn; },
      showModal: function () { this._modalShown = true; } };
  }
  return {
    els,
    getElementById: function (id) { return els[id] || null; },
    createElement: function () { return { setAttribute: function () {}, }; },
    head: { appendChild: function () {} },
    readyState: "complete",
    addEventListener: function () {},
  };
}

function loadUi(documentStub) {
  const sandbox = {
    window: { WS_AUTH: A, WAYBACK_SOCIAL_CONFIG: {} },
    document: documentStub,
    console,
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, "auth-ui.js"), "utf8");
  vm.runInContext(src, sandbox);
  return sandbox.window.WS_AUTH;
}

function fakeClerk(overrides) {
  return Object.assign({ user: null, session: null, addListener: function () {} }, overrides);
}

/* --- 1. openSignIn that throws: no throw escapes, reason is visible --- */
(function () {
  const dom = makeDom(["auth-area"]);
  const Ui = loadUi(dom);
  Ui._setClerk(fakeClerk({ openSignIn: function () { throw new Error("Clerk was not loaded with Ui components"); } }));
  let threw = false, ret = null;
  try { ret = Ui.openSignIn(); } catch (e) { threw = true; }
  check("throwing openSignIn does not escape", threw === false);
  check("throwing openSignIn returns false", ret === false);
  check("throwing openSignIn writes its reason to #auth-area",
    dom.els["auth-area"].textContent.indexOf("Clerk was not loaded with Ui components") !== -1,
    dom.els["auth-area"].textContent);
})();

/* --- 2. clerk with no open/mount methods: visible "not loaded" --- */
(function () {
  const dom = makeDom(["auth-area", "auth-modal", "auth-mount"]);
  const Ui = loadUi(dom);
  Ui._setClerk(fakeClerk({}));
  const ret = Ui.openSignIn();
  check("no open/mount methods returns false", ret === false);
  check("no open/mount methods says UI components not loaded",
    dom.els["auth-area"].textContent.indexOf("UI components not loaded") !== -1,
    dom.els["auth-area"].textContent);
})();

/* --- 3. working openSignIn: returns true, no error text --- */
(function () {
  const dom = makeDom(["auth-area"]);
  const Ui = loadUi(dom);
  let opened = false;
  Ui._setClerk(fakeClerk({ openSignIn: function () { opened = true; } }));
  const ret = Ui.openSignIn();
  check("working openSignIn returns true", ret === true && opened === true);
  check("working openSignIn writes no error", dom.els["auth-area"].textContent === "");
})();

/* --- 4. no clerk at all: visible "not loaded" --- */
(function () {
  const dom = makeDom(["auth-area"]);
  const Ui = loadUi(dom);
  Ui._setClerk(null);
  const ret = Ui.openSignIn();
  check("no clerk returns false", ret === false);
  check("no clerk says service not loaded",
    dom.els["auth-area"].textContent.indexOf("not loaded") !== -1,
    dom.els["auth-area"].textContent);
})();

/* --- 5. dashboard fallback: no #auth-area, error goes to #account-status --- */
(function () {
  const dom = makeDom(["account-status"]);
  const Ui = loadUi(dom);
  Ui._setClerk(fakeClerk({ openSignIn: function () { throw new Error("boom"); } }));
  const ret = Ui.openSignIn();
  check("dashboard error returns false", ret === false);
  check("dashboard error lands in #account-status",
    dom.els["account-status"].textContent.indexOf("boom") !== -1,
    dom.els["account-status"].textContent);
})();

/* --- 6. mount fallback still works when openSignIn is absent --- */
(function () {
  const dom = makeDom(["auth-area", "auth-modal", "auth-mount"]);
  const Ui = loadUi(dom);
  let mounted = null;
  Ui._setClerk(fakeClerk({ mountSignIn: function (el) { mounted = el; } }));
  const ret = Ui.openSignIn();
  check("mount fallback returns true", ret === true && mounted === dom.els["auth-mount"]);
  check("mount fallback shows the dialog", dom.els["auth-modal"]._modalShown === true);
  check("mount fallback writes no error", dom.els["auth-area"].textContent === "");
})();

if (failed > 0) { console.log("\n" + failed + " auth-ui check(s) failed."); process.exit(1); }
console.log("\nAll auth-ui checks passed.");
