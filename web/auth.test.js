/* Node tests for web/auth.js — pure logic + stubbed fetch.
 * Run: node web/auth.test.js  (no deps, no browser, no Clerk account).
 * The Clerk SDK itself is never loaded here; _setClerk injects a fake.
 */
"use strict";
const A = require("./auth.js");

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log("PASS  " + name); }
  else { failed++; console.log("FAIL  " + name + (extra ? "  ->  " + extra : "")); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function fakeStore(initial) {
  const m = Object.assign({}, initial || {});
  return {
    get: (k) => (k in m ? m[k] : null),
    set: (k, v) => { m[k] = v; },
    remove: (k) => { delete m[k]; },
    _m: m,
  };
}

/* --- tier ranking --- */
check("higherTier pro beats starter", A.higherTier("pro", "starter") === "pro");
check("higherTier starter loses to studio", A.higherTier("starter", "studio") === "studio");
check("higherTier bundle == studio", A.higherTier("bundle", "studio") === "studio");
check("higherTier free vs free", A.higherTier("free", "free") === "free");
check("higherTier unknown treated as free", A.higherTier("pro", "nope") === "pro");
check("higherTier case-insensitive", A.higherTier("PRO", "starter") === "pro");

/* --- publishable key resolution --- */
check("placeholder key -> null", A.resolvePublishableKey({ CLERK: { publishable_key: "pk_test_REPLACE_CLERK_PUBLISHABLE_KEY", enabled: true } }) === null);
check("enabled:false -> null", A.resolvePublishableKey({ CLERK: { publishable_key: "pk_test_abc123", enabled: false } }) === null);
check("missing config -> null", A.resolvePublishableKey({}) === null);
check("missing CLERK block -> null", A.resolvePublishableKey(null) === null);
check("real key resolves", A.resolvePublishableKey({ CLERK: { publishable_key: "pk_test_abc123" } }) === "pk_test_abc123");

async function main() {
  /* --- effectiveTier: licence vs linked, signed in vs out --- */
  const store = fakeStore({ ws_licence_tier: "pro" });
  A._setStore(store);
  check("signed out: licence tier wins", A.effectiveTier() === "pro");
  check("licenceTier reads store", A.licenceTier() === "pro");
  check("linkedTier null when unset", A.linkedTier() === null);
  check("not signed in initially", A.isSignedIn() === false);

  // Fake a signed-in Clerk user (no SDK, no network).
  A._setClerk({ user: { id: "user_123", firstName: "Jo", primaryEmailAddress: { emailAddress: "jo@example.com" } }, session: null, addListener: () => {} });
  check("signed in after fake clerk", A.isSignedIn() === true);
  check("user label is first name", A.userLabel() === "Jo");
  check("signed in, no link yet: licence tier still wins", A.effectiveTier() === "pro");
  store.set("ws_linked_tier", "studio");
  check("signed in + linked studio beats licence pro", A.effectiveTier() === "studio");
  store.set("ws_licence_tier", "studio");
  store.set("ws_linked_tier", "free");
  check("signed in + linked free does not downgrade licence studio", A.effectiveTier() === "studio");
  store.set("ws_licence_tier", "free");
  store.set("ws_linked_tier", "pro");
  check("signed in + linked pro beats licence free", A.effectiveTier() === "pro");
  await A.signOut();
  check("after sign out: back to licence tier", A.effectiveTier() === "free");
  check("after sign out: linked tier cleared", A.linkedTier() === null);
  check("after sign out: not signed in", A.isSignedIn() === false);

  /* --- fetchLinkedTier with stubbed fetch --- */
  A._setClerk({ user: { id: "user_123", firstName: "Jo" }, session: { getToken: async () => "tok_abc" }, addListener: () => {} });
  const store2 = fakeStore({ ws_licence_tier: "free" });
  A._setStore(store2);
  let lastReq = null;
  const stubFetch = async (url, opts) => {
    lastReq = { url, opts };
    return { ok: true, json: async () => ({ linked: true, tier: "pro", email: "jo@example.com" }) };
  };
  const linked = await A.fetchLinkedTier(stubFetch);
  check("fetchLinkedTier returns linked pro", eq(linked, { linked: true, tier: "pro", email: "jo@example.com" }), JSON.stringify(linked));
  check("fetchLinkedTier sends Bearer token", lastReq.opts.headers.Authorization === "Bearer tok_abc");
  check("fetchLinkedTier caches tier", store2.get("ws_linked_tier") === "pro");
  check("fetchLinkedTier caches email", store2.get("ws_linked_email") === "jo@example.com");
  check("effectiveTier now pro from link", A.effectiveTier() === "pro");

  const stubFetchUnlinked = async () => ({ ok: true, json: async () => ({ linked: false, tier: null }) });
  const unlinked = await A.fetchLinkedTier(stubFetchUnlinked);
  check("fetchLinkedTier unlinked clears cache", unlinked.linked === false && store2.get("ws_linked_tier") === null);

  const stubFetch401 = async () => ({ ok: false, status: 401, json: async () => ({ error: "session not valid" }) });
  const bad = await A.fetchLinkedTier(stubFetch401);
  check("fetchLinkedTier 401 -> unlinked, no throw", bad.linked === false);

  /* --- linkLicence with stubbed fetch (no WAYBACK_LICENCE in Node) --- */
  A._setClerk({ user: { id: "user_123" }, session: { getToken: async () => "tok_xyz" }, addListener: () => {} });
  const store3 = fakeStore({ ws_licence_tier: "free" });
  A._setStore(store3);
  let postBody = null;
  const stubPost = async (url, opts) => {
    postBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ ok: true, linked: true, tier: "starter", email: "jo@example.com" }) };
  };
  const res = await A.linkLicence("DP1-STARTER-AAAAAAAAAAAAAAAA-01234567", stubPost);
  check("linkLicence ok", res.ok === true && res.tier === "starter", JSON.stringify(res));
  check("linkLicence posts the key", postBody.licence_key === "DP1-STARTER-AAAAAAAAAAAAAAAA-01234567");
  check("linkLicence caches tier", store3.get("ws_linked_tier") === "starter");
  check("linkLicence caches email", store3.get("ws_linked_email") === "jo@example.com");

  const stubPostErr = async () => ({ ok: false, status: 400, json: async () => ({ error: "Invalid key: checksum mismatch" }) });
  const resErr = await A.linkLicence("DP1-STARTER-AAAAAAAAAAAAAAAA-01234567", stubPostErr);
  check("linkLicence server error surfaces", resErr.ok === false && /checksum/.test(resErr.error), JSON.stringify(resErr));

  const empty = await A.linkLicence("   ", stubPost);
  check("linkLicence empty key rejected without fetch", empty.ok === false && /Paste/.test(empty.error));

  A._setClerk({ user: null, session: null, addListener: () => {} });
  const noSession = await A.linkLicence("DP1-STARTER-AAAAAAAAAAAAAAAA-01234567", stubPost);
  check("linkLicence without session rejected", noSession.ok === false && /Sign in/.test(noSession.error));

  console.log(failed === 0 ? "\nAll auth checks passed." : `\n${failed} auth check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error("auth test crashed:", e); process.exit(1); });
