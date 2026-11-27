/* Node tests for web/turnstile.js — pure logic only (no DOM, no network).
 * Run: node web/turnstile.test.js  (no deps).
 * The widget itself (Turnstile script + render/execute) is exercised in
 * the Playwright e2e suite with Cloudflare's official test site keys.
 */
"use strict";
const T = require("./turnstile.js");

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log("PASS  " + name); }
  else { failed++; console.log("FAIL  " + name + (extra ? "  ->  " + extra : "")); }
}

check("placeholder site key -> null", T.resolveSiteKey({ TURNSTILE: { site_key: "REPLACE_TURNSTILE_SITE_KEY", enabled: true } }) === null);
check("enabled:false -> null", T.resolveSiteKey({ TURNSTILE: { site_key: "1x00000000000000000000AA", enabled: false } }) === null);
check("missing config -> null", T.resolveSiteKey({}) === null);
check("missing TURNSTILE block -> null", T.resolveSiteKey(null) === null);
check("real site key resolves", T.resolveSiteKey({ TURNSTILE: { site_key: "0x00000000000000000000AA" } }) === "0x00000000000000000000AA");
check("test pass key is a real key", T.resolveSiteKey({ TURNSTILE: { site_key: T.TEST_SITEKEY_PASS } }) === T.TEST_SITEKEY_PASS);
check("isConfigured false when unconfigured", T.isConfigured({}) === false);
check("isConfigured true with a key", T.isConfigured({ TURNSTILE: { site_key: "0x00000000000000000000AA" } }) === true);
check("test keys documented", T.TEST_SITEKEY_PASS === "1x00000000000000000000AA" && T.TEST_SITEKEY_BLOCK === "2x00000000000000000000AB" && T.TEST_SITEKEY_CHALLENGE === "3x00000000000000000000FF");

const now = Date.now();
check("fresh token is fresh", T.isTokenFresh({ token: "tok", idem: "idem", at: now - 1000 }, now) === true);
check("old token is stale", T.isTokenFresh({ token: "tok", idem: "idem", at: now - T.TOKEN_TTL_MS - 1000 }, now) === false);
check("token without idem is not fresh", T.isTokenFresh({ token: "tok", idem: null, at: now }, now) === false);
check("null entry is not fresh", T.isTokenFresh(null, now) === false);

const k1 = T.newIdempotencyKey();
const k2 = T.newIdempotencyKey();
check("idempotency keys are uuid-shaped", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k1), k1);
check("idempotency keys differ", k1 !== k2);

T._setCached({ token: "tok123", idem: "idem123", at: Date.now() });
const cur = T.currentToken();
check("currentToken returns cached token+idem", cur !== null && cur.token === "tok123" && cur.idem === "idem123", JSON.stringify(cur));
T._setCached({ token: "tok123", idem: "idem123", at: Date.now() - T.TOKEN_TTL_MS - 1 });
check("currentToken null when stale", T.currentToken() === null);

async function main() {
  T._reset();
  /* Unconfigured: ensureToken is a no-op returning null, no script,
   * no widget, no network. */
  const none = await T.ensureToken({});
  check("ensureToken unconfigured -> null", none === null);
  const none2 = await T.ensureToken({ TURNSTILE: { site_key: "REPLACE_TURNSTILE_SITE_KEY" } });
  check("ensureToken placeholder -> null", none2 === null);

  /* Configured, fresh cache: no challenge is executed. */
  T._setCached({ token: "cached-tok", idem: "cached-idem", at: Date.now() });
  let executed = 0;
  T._setTurnstile({ render: () => { executed++; return 1; }, execute: () => { executed++; } });
  const cached = await T.ensureToken({ TURNSTILE: { site_key: "0x00000000000000000000AA" } });
  check("ensureToken reuses fresh cache", cached !== null && cached.token === "cached-tok" && executed === 0, JSON.stringify(cached));

  console.log(failed === 0 ? "\nAll turnstile checks passed." : `\n${failed} turnstile check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error("turnstile test crashed:", e); process.exit(1); });
