/* wayback-social — Clerk auth, core (Phase 2, issue #6).
 *
 * The tier/account logic: which tier gates paid features, the
 * signed-in state, linking a licence key to an account. The Clerk
 * SDK loading and the sign-in UI live in auth-ui.js, which augments
 * this module (window.WS_AUTH) in the browser. Splitting keeps both
 * files under the ~300-line ceiling.
 *
 * Auth is OPTIONAL. Free search works signed out; paid features work
 * with EITHER a licence key OR a signed-in account that has a licence
 * linked (POST /api/link-licence). effectiveTier() is the higher of
 * the two — console.js delegates currentTier() to it.
 *
 * Works in the browser (window.WS_AUTH) and in Node
 * (module.exports) — tested by web/auth.test.js. All DOM access is
 * guarded so requiring this file in Node never touches document.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.WS_AUTH = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PLACEHOLDER = "pk_test_REPLACE_CLERK_PUBLISHABLE_KEY";
  var LINKED_TIER_KEY = "ws_linked_tier";
  var LINKED_EMAIL_KEY = "ws_linked_email";
  var LICENCE_TIER_KEY = "ws_licence_tier";
  var TIER_RANK = { free: 0, starter: 1, pro: 2, studio: 3, bundle: 3 };

  /* Injectable store (localStorage in the browser, a plain object in
   * tests) and fetch (global fetch in the browser, a stub in tests). */
  var store = null;
  var fetchImpl = null;
  function getStore() {
    if (store) return store;
    try {
      if (typeof localStorage !== "undefined") {
        return {
          get: function (k) { return localStorage.getItem(k); },
          set: function (k, v) { localStorage.setItem(k, v); },
          remove: function (k) { localStorage.removeItem(k); },
        };
      }
    } catch (e) {}
    var mem = {};
    return {
      get: function (k) { return k in mem ? mem[k] : null; },
      set: function (k, v) { mem[k] = v; },
      remove: function (k) { delete mem[k]; },
    };
  }
  function getFetch() {
    if (fetchImpl) return fetchImpl;
    if (typeof fetch !== "undefined") return fetch;
    throw new Error("fetch is not available");
  }

  var clerk = null;
  var state = { status: "unconfigured", user: null };
  var changeListeners = []; // auth-ui.js + dashboard both listen

  function higherTier(a, b) {
    var an = (a || "free").toLowerCase(), bn = (b || "free").toLowerCase();
    var ra = TIER_RANK[an] || 0, rb = TIER_RANK[bn] || 0;
    if (ra > rb) return an;
    if (rb > ra) return bn;
    /* Equal rank (bundle == studio caps): prefer the canonical tier
     * name so the badge/label stays consistent. */
    if (an === "bundle") return bn;
    return an;
  }

  function resolvePublishableKey(cfg) {
    if (!cfg || !cfg.CLERK) return null;
    if (cfg.CLERK.enabled === false) return null;
    var k = cfg.CLERK.publishable_key || "";
    if (!k || k.indexOf("REPLACE") >= 0) return null;
    return k;
  }

  function licenceTier() {
    try { return getStore().get(LICENCE_TIER_KEY) || "free"; } catch (e) { return "free"; }
  }
  function linkedTier() {
    try { return getStore().get(LINKED_TIER_KEY) || null; } catch (e) { return null; }
  }
  function linkedEmail() {
    try { return getStore().get(LINKED_EMAIL_KEY) || null; } catch (e) { return null; }
  }
  function isSignedIn() { return !!state.user; }

  /* The tier that gates paid features: the higher of the licence-key
   * tier and the linked-account tier (linked tier counts only while
   * signed in). Free search never needs either. */
  function effectiveTier() {
    var lt = licenceTier();
    if (isSignedIn()) {
      var linked = linkedTier();
      if (linked) return higherTier(lt, linked);
    }
    return lt;
  }

  function userLabel() {
    if (!state.user) return null;
    return state.user.firstName ||
      state.user.fullName ||
      state.user.primaryEmailAddress ||
      (state.user.emailAddresses && state.user.emailAddresses[0] &&
        state.user.emailAddresses[0].emailAddress) ||
      "Signed in";
  }

  function notifyChange() {
    changeListeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  /* Called by auth-ui.js whenever Clerk reports a user change (and by
   * tests with a fake clerk object). Pulls the linked licence tier
   * for the account; a failure leaves the licence-key tier in force. */
  function syncUserFromClerk() {
    var u = (clerk && clerk.user) || null;
    state.user = u ? {
      id: u.id,
      firstName: u.firstName || null,
      fullName: u.fullName || null,
      primaryEmailAddress: (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || null,
      emailAddresses: (u.emailAddresses || []).map(function (e) { return { emailAddress: e.emailAddress }; }),
    } : null;
    state.status = state.user ? "signed-in" : "signed-out";
    if (state.user) {
      fetchLinkedTier().catch(function () {});
    } else {
      try { getStore().remove(LINKED_TIER_KEY); getStore().remove(LINKED_EMAIL_KEY); } catch (e) {}
    }
    notifyChange();
  }

  async function signOut() {
    try { if (clerk && clerk.signOut) await clerk.signOut(); } catch (e) {}
    state.user = null;
    state.status = "signed-out";
    try { getStore().remove(LINKED_TIER_KEY); getStore().remove(LINKED_EMAIL_KEY); } catch (e) {}
    notifyChange();
  }

  async function getSessionToken() {
    if (!clerk || !clerk.session) return null;
    try { return await clerk.session.getToken(); } catch (e) { return null; }
  }

  /* GET /api/link-licence — what tier (if any) this signed-in
   * account has linked. Cached so gating stays synchronous. */
  async function fetchLinkedTier(fetchFn) {
    var token = await getSessionToken();
    if (!token) return { linked: false, tier: null };
    var f = fetchFn || getFetch();
    var res = await f("/api/link-licence", {
      headers: { Authorization: "Bearer " + token },
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || !data || !data.linked) {
      try { getStore().remove(LINKED_TIER_KEY); getStore().remove(LINKED_EMAIL_KEY); } catch (e) {}
      return { linked: false, tier: null };
    }
    try {
      getStore().set(LINKED_TIER_KEY, data.tier);
      if (data.email) getStore().set(LINKED_EMAIL_KEY, data.email);
    } catch (e) {}
    return { linked: true, tier: data.tier, email: data.email || null };
  }

  /* POST /api/link-licence — attach a licence key to this account.
   * The key is checked locally first (fast, honest error), then
   * verified + stored server-side. The key itself is never stored
   * in the browser beyond the existing localStorage licence slot. */
  async function linkLicence(key, fetchFn) {
    var clean = (key || "").trim();
    if (!clean) return { ok: false, error: "Paste a licence key first (DP1-…)." };
    var LIC = (typeof window !== "undefined" && window.WAYBACK_LICENCE) || null;
    if (LIC) {
      var local = await LIC.verifyKey(clean);
      if (!local.valid) return { ok: false, error: "Invalid key: " + local.reason };
    }
    var token = await getSessionToken();
    if (!token) return { ok: false, error: "Sign in first — the link needs your account." };
    var f = fetchFn || getFetch();
    var res = await f("/api/link-licence", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ licence_key: clean }),
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      return { ok: false, error: (data && data.error) || ("Link failed (HTTP " + res.status + ").") };
    }
    try {
      getStore().set(LINKED_TIER_KEY, data.tier);
      if (data.email) getStore().set(LINKED_EMAIL_KEY, data.email);
    } catch (e) {}
    notifyChange();
    return { ok: true, tier: data.tier, email: data.email || null };
  }

  /* Test hooks + UI-module wiring. */
  function _setStore(s) { store = s; }
  function _setFetch(f) { fetchImpl = f; }
  function _setClerk(c) { clerk = c; syncUserFromClerk(); }
  function _getClerk() { return clerk; }
  function _onChange(fn) { if (typeof fn === "function") changeListeners.push(fn); }
  function _state() { return { status: state.status, user: state.user }; }
  function _syncUser() { syncUserFromClerk(); }

  return {
    PLACEHOLDER: PLACEHOLDER, TIER_RANK: TIER_RANK,
    higherTier: higherTier, resolvePublishableKey: resolvePublishableKey,
    licenceTier: licenceTier, linkedTier: linkedTier, linkedEmail: linkedEmail,
    isSignedIn: isSignedIn, effectiveTier: effectiveTier, userLabel: userLabel,
    signOut: signOut, getSessionToken: getSessionToken,
    fetchLinkedTier: fetchLinkedTier, linkLicence: linkLicence,
    _setStore: _setStore, _setFetch: _setFetch, _setClerk: _setClerk,
    _getClerk: _getClerk, _onChange: _onChange, _state: _state, _syncUser: _syncUser,
  };
});
