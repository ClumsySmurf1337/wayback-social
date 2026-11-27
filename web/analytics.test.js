/* Node test for web/analytics.js (issue #14).
 * Run:  node web/analytics.test.js
 * Exit 0 = no beacon while disabled or token-less, exactly one beacon
 * when enabled with a token, and a second boot does not double-inject.
 */
"use strict";
const { inject, BEACON_SRC } = require("./analytics.js");

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  " + JSON.stringify(actual) +
    (ok ? "" : "  (expected " + JSON.stringify(expected) + ")"));
}

function fakeDoc() {
  const appended = [];
  const scripts = [];
  return {
    _appended: appended,
    querySelector: (sel) =>
      (sel === "script[data-cf-beacon]" && scripts.length ? scripts[0] : null),
    createElement: (tag) => {
      const el = { tagName: tag, attrs: {},
        setAttribute(k, v) { el.attrs[k] = v; } };
      scripts.push(el);
      return el;
    },
    body: { appendChild: (el) => { appended.push(el); } },
    head: { appendChild: (el) => { appended.push(el); } },
  };
}

check("disabled: no beacon", inject(fakeDoc(), { enabled: false, token: "tok" }), false);
check("enabled but no token: no beacon", inject(fakeDoc(), { enabled: true, token: "" }), false);
check("no config: no beacon", inject(fakeDoc(), null), false);
check("no document: no beacon", inject(null, { enabled: true, token: "tok" }), false);
{
  const doc = fakeDoc();
  check("enabled + token: beacon injected", inject(doc, { enabled: true, token: "tok123" }), true);
  check("one script appended", doc._appended.length, 1);
  check("beacon src", doc._appended[0].src, BEACON_SRC);
  check("beacon carries the token",
    doc._appended[0].attrs["data-cf-beacon"], JSON.stringify({ token: "tok123" }));
  check("second boot does not double-inject",
    inject(doc, { enabled: true, token: "tok123" }), false);
  check("still one script", doc._appended.length, 1);
}

console.log(failures === 0
  ? `\nanalytics: ${checks} checks passed`
  : `\nanalytics: ${failures}/${checks} checks FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
