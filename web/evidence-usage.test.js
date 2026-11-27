/* Node test for web/evidence-usage.js (issue #15).
 * Run:  node web/evidence-usage.test.js
 * Exit 0 = per-key namespacing, legacy migration, warn-at-last-one,
 * block-at-the-cap (never increments past it), and 0-included tiers
 * blocked from the first log.
 */
"use strict";
const api = require("./evidence-usage.js");

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  " + JSON.stringify(actual) +
    (ok ? "" : "  (expected " + JSON.stringify(expected) + ")"));
}

function fakeStore(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

const KEY_A = "DP1-STUDIO-AAAAAAAAAAAAAAAA-00000000";
const KEY_B = "DP1-STUDIO-BBBBBBBBBBBBBBBB-11111111";

// --- namespacing ---------------------------------------------------------
check("key hash is stable", api.keyHash(KEY_A), api.keyHash(KEY_A));
check("different keys hash differently", api.keyHash(KEY_A) === api.keyHash(KEY_B), false);
check("usage key is namespaced per key",
  api.usageKey(KEY_A), "ws_evidence_used_" + api.keyHash(KEY_A));
check("no key falls back to the legacy key", api.usageKey(""), "ws_evidence_used");
check("no key falls back to the legacy key (null)", api.usageKey(null), "ws_evidence_used");

// --- log / warn / block ---------------------------------------------------
{
  const s = fakeStore();
  let r = api.logReport(s, KEY_A, 10);
  check("first log ok", r.ok, true);
  check("first log used=1", r.used, 1);
  check("first log no warning", r.warning, false);
  for (let i = 0; i < 7; i++) api.logReport(s, KEY_A, 10);
  check("8 used after 8 logs", api.getUsed(s, KEY_A), 8);
  r = api.logReport(s, KEY_A, 10);
  check("9th log warns (last one left)", r.warning, true);
  check("9th log ok", r.ok, true);
  r = api.logReport(s, KEY_A, 10);
  check("10th log ok, no warning", r.ok && !r.warning, true);
  check("10 used at the cap", api.getUsed(s, KEY_A), 10);
  r = api.logReport(s, KEY_A, 10);
  check("11th log blocked", r.ok, false);
  check("11th log blocked flag", r.blocked, true);
  check("count never passes the cap", api.getUsed(s, KEY_A), 10);
  r = api.logReport(s, KEY_A, 10);
  check("12th log still blocked", r.ok, false);
}

// --- per-key isolation -----------------------------------------------------
{
  const s = fakeStore();
  api.logReport(s, KEY_A, 10);
  api.logReport(s, KEY_A, 10);
  check("key B unaffected by key A logs", api.getUsed(s, KEY_B), 0);
  check("key A has 2", api.getUsed(s, KEY_A), 2);
}

// --- 0-included tiers ------------------------------------------------------
{
  const s = fakeStore();
  const r = api.logReport(s, KEY_A, 0);
  check("0-included tier blocked from the first log", r.ok, false);
  check("0-included count stays 0", api.getUsed(s, KEY_A), 0);
  check("0-included reason names Studio",
    r.reason.includes("Studio"), true);
}

// --- legacy migration -------------------------------------------------------
{
  const s = fakeStore({ ws_evidence_used: "3" });
  const moved = api.migrateLegacy(s, KEY_A);
  check("legacy count migrated", moved, 3);
  check("migrated into the per-key bucket", api.getUsed(s, KEY_A), 3);
  check("legacy key removed", s.getItem("ws_evidence_used"), null);
  const s2 = fakeStore({ ws_evidence_used: "3", ["ws_evidence_used_" + api.keyHash(KEY_A)]: "5" });
  api.migrateLegacy(s2, KEY_A);
  check("existing per-key count is not overwritten", api.getUsed(s2, KEY_A), 5);
  check("legacy key removed even when not migrated", s2.getItem("ws_evidence_used"), null);
}

// --- status lines ------------------------------------------------------------
check("status 0/10", api.statusLine(0, 10).includes("includes 10"), true);
check("status 9/10 warns", api.statusLine(9, 10).includes("1 report left"), true);
check("status 10/10 used up", api.statusLine(10, 10).includes("used up"), true);
check("status 0-included names Studio", api.statusLine(0, 0).includes("Studio"), true);

console.log(failures === 0
  ? `\nevidence-usage: ${checks} checks passed`
  : `\nevidence-usage: ${failures}/${checks} checks FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
