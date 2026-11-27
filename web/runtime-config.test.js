/* Node tests for web/runtime-config.js — the dev/prod env swap.
 * Run: node web/runtime-config.test.js  (no deps, no browser).
 * The endpoint is stubbed; no network, no Clerk account, no env vars.
 */
"use strict";
const RC = require("./runtime-config.js");

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log("PASS  " + name); }
  else { failed++; console.log("FAIL  " + name + (extra ? "  ->  " + extra : "")); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

const STATIC_DEV = {
  CLERK: { publishable_key: "pk_test_dev123", enabled: true },
  TURNSTILE: { site_key: "REPLACE_TURNSTILE_SITE_KEY", enabled: false },
};

/* --- static fallback --- */
check("staticKeys takes a real dev key",
  eq(RC.staticKeys(STATIC_DEV), { clerk: "pk_test_dev123", turnstile: null }));
check("staticKeys honours enabled:false",
  eq(RC.staticKeys({ CLERK: { publishable_key: "pk_test_x", enabled: false } }), { clerk: null, turnstile: null }));
check("staticKeys rejects REPLACE_ placeholders",
  eq(RC.staticKeys({ TURNSTILE: { site_key: "REPLACE_TURNSTILE_SITE_KEY", enabled: true } }), { clerk: null, turnstile: null }));
check("staticKeys tolerates missing config",
  eq(RC.staticKeys(null), { clerk: null, turnstile: null }));

/* --- merge: endpoint wins when real, static fills the gaps --- */
check("merge: endpoint prod key wins over static dev key",
  RC.merge(STATIC_DEV, { clerk: { publishable_key: "pk_live_prod456", enabled: true }, turnstile: { site_key: "0x4AAAAAA", enabled: true } }).clerk.publishable_key === "pk_live_prod456");
check("merge: endpoint turnstile key wins",
  RC.merge(STATIC_DEV, { clerk: { publishable_key: null, enabled: false }, turnstile: { site_key: "0x4AAAAAA", enabled: true } }).turnstile.site_key === "0x4AAAAAA");
check("merge: endpoint empty -> static dev fallback",
  RC.merge(STATIC_DEV, { clerk: { publishable_key: null, enabled: false }, turnstile: { site_key: null, enabled: false } }).clerk.publishable_key === "pk_test_dev123");
check("merge: no endpoint body -> static fallback",
  RC.merge(STATIC_DEV, null).clerk.publishable_key === "pk_test_dev123");
check("merge: endpoint REPLACE_ ignored, static wins",
  RC.merge(STATIC_DEV, { clerk: { publishable_key: "pk_live_REPLACE_X", enabled: true } }).clerk.publishable_key === "pk_test_dev123");
check("merge: nothing anywhere -> both disabled",
  eq(RC.merge({}, null), {
    clerk: { publishable_key: null, enabled: false },
    turnstile: { site_key: null, enabled: false },
  }));
check("merge: enabled follows the effective key",
  RC.merge(STATIC_DEV, null).clerk.enabled === true &&
  RC.merge(STATIC_DEV, null).turnstile.enabled === false);

/* --- get(): fetch once, cache, fall back honestly --- */
async function runAsync() {
  let calls = 0;
  const stubFetch = async () => {
    calls++;
    return { ok: true, json: async () => ({
      clerk: { publishable_key: "pk_live_prod456", enabled: true },
      turnstile: { site_key: "0x4AAAAAA", enabled: true },
    }) };
  };
  RC._reset();
  const first = await RC.get(STATIC_DEV, stubFetch);
  const second = await RC.get(STATIC_DEV, stubFetch);
  check("get: endpoint keys merged in", first.clerk.publishable_key === "pk_live_prod456" && first.turnstile.site_key === "0x4AAAAAA");
  check("get: second call reuses the one fetch", calls === 1 && second === first);

  RC._reset();
  const failingFetch = async () => { throw new Error("no Functions here"); };
  const fallback = await RC.get(STATIC_DEV, failingFetch);
  check("get: fetch failure falls back to static dev key",
    fallback.clerk.publishable_key === "pk_test_dev123" && fallback.turnstile.enabled === false);

  RC._reset();
  const http500 = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const oldDeploy = await RC.get(STATIC_DEV, http500);
  check("get: non-200 endpoint falls back to static",
    oldDeploy.clerk.publishable_key === "pk_test_dev123");

  RC._reset();
  const emptyEnv = async () => ({ ok: true, json: async () => ({
    clerk: { publishable_key: null, enabled: false },
    turnstile: { site_key: null, enabled: false },
  }) });
  const unset = await RC.get(STATIC_DEV, emptyEnv);
  check("get: endpoint with no keys set falls back to static",
    unset.clerk.publishable_key === "pk_test_dev123" && unset.turnstile.enabled === false);
}

runAsync().then(() => {
  console.log("");
  if (failed === 0) console.log("All runtime-config checks passed.");
  else console.log(failed + " runtime-config check(s) FAILED.");
  process.exitCode = failed === 0 ? 0 : 1;
});
