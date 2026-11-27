/* wayback-social — Clerk sign-in UI (Phase 2, issue #6).
 *
 * The browser half of auth.js: loads the Clerk SDK, renders the
 * header auth area, opens Clerk's prebuilt sign-in / sign-up, and
 * signs out. It augments window.WS_AUTH (auth.js must load first).
 * Browser-only — no Node tests; the e2e suite covers it.
 *
 * SDK: @clerk/clerk-js 6.48.0 (MIT) from jsDelivr, loaded only when
 * a real publishable key is configured in web/config.js. Clerk's
 * prebuilt components are used as-is (openSignIn/openSignUp modal,
 * falling back to mounting into #auth-modal). Sign-up bot protection
 * is Clerk's own (Turnstile-based, invisible) — enable it in the
 * Clerk Dashboard under Attack protection; see docs/clerk-auth.md.
 */
(function () {
  "use strict";
  var A = (typeof window !== "undefined" && window.WS_AUTH) || null;
  if (!A) return; // auth.js failed to load — page still works signed out

  var CLERK_CDN =
    "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.48.0/dist/clerk.browser.js";

  /* uiState overrides the core status while the SDK is loading or
   * when auth is not configured at all. null = use the core state. */
  var uiState = null;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderAuth() {
    if (typeof document === "undefined") return;
    var area = document.getElementById("auth-area");
    if (!area) return;
    var st = uiState || A._state().status;
    if (st === "unconfigured") {
      area.innerHTML = '<span class="muted">Sign-in coming soon — use a licence key below for now.</span>';
      return;
    }
    if (st === "loading") {
      area.innerHTML = '<span class="muted">Sign-in loading…</span>';
      return;
    }
    var user = A._state().user;
    if (user) {
      area.innerHTML =
        '<span class="pill good">Signed in as ' + esc(A.userLabel()) + '</span> ' +
        '<a href="dashboard.html">My account</a> ' +
        '<button class="btn2" id="auth-signout" type="button">Sign out</button>';
      var so = document.getElementById("auth-signout");
      if (so) so.addEventListener("click", function () { signOut(); });
      return;
    }
    area.innerHTML =
      '<button class="btn2" id="auth-signin" type="button">Sign in</button> ' +
      '<button class="btn2" id="auth-signup" type="button">Sign up</button>';
    var si = document.getElementById("auth-signin");
    if (si) si.addEventListener("click", function () { openSignIn(); });
    var su = document.getElementById("auth-signup");
    if (su) su.addEventListener("click", function () { openSignUp(); });
  }

  /* Clerk v6 script-tag integration (clerk.com/docs JavaScript quickstart,
   * <script> tab): the bundle reads its publishable key from the
   * data-clerk-publishable-key attribute and sets window.Clerk to the
   * (already constructed) instance — it is NOT a constructor. The
   * `new Clerk(key)` form is only for the NPM/bundler path
   * (import Clerk from "@clerk/clerk-js"). Mixing the two broke sign-in
   * on the preview ("ClerkCtor is not a constructor", 2026-11-27): the
   * script loaded fine, but `new window.Clerk(key)` is invalid. */
  function loadSdk(key) {
    return new Promise(function (resolve, reject) {
      if (typeof document === "undefined") return reject(new Error("no document"));
      if (typeof window !== "undefined" && window.Clerk) return resolve(window.Clerk);
      var s = document.createElement("script");
      s.src = CLERK_CDN;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.setAttribute("data-clerk-publishable-key", key);
      s.onload = function () { resolve(window.Clerk); };
      s.onerror = function () { reject(new Error("Clerk SDK failed to load from " + CLERK_CDN)); };
      document.head.appendChild(s);
    });
  }

  /* Dev/prod env swap (docs/clerk-env-swap.md): the deployed
   * environment's public keys come from /api/config
   * (web/runtime-config.js). It wins when it returns a real key;
   * otherwise the static config.js value (the dev key) applies.
   * Never throws — a missing module or a failed fetch just means
   * the static fallback. */
  async function runtimePublishableKey() {
    try {
      var RC = (typeof window !== "undefined" && window.WS_RUNTIME_CONFIG) || null;
      if (!RC || typeof RC.get !== "function") return null;
      var rc = await RC.get();
      return (rc && rc.clerk && rc.clerk.publishable_key) || null;
    } catch (e) { return null; }
  }

  async function initAuth(cfg) {
    var key = (await runtimePublishableKey()) || A.resolvePublishableKey(cfg);
    if (!key) { uiState = "unconfigured"; renderAuth(); return; }
    uiState = "loading";
    renderAuth();
    try {
      var clerk = await loadSdk(key);
      if (!clerk || typeof clerk.load !== "function") {
        throw new Error("Clerk SDK loaded but window.Clerk has no load()");
      }
      A._setClerk(clerk);
      await clerk.load();
      if (clerk.addListener) clerk.addListener(function () { A._syncUser(); });
      A._syncUser();
      uiState = null;
      renderAuth();
    } catch (e) {
      uiState = "unconfigured";
      var area = document.getElementById("auth-area");
      if (area) area.textContent = "Sign-in failed to load (" + e.message + ") — licence keys still work.";
    }
  }

  /* Sign-in must never fail silently. On 2026-11-27 the preview
   * rendered a Sign in button whose click did nothing — no form,
   * no error anywhere on the page — because openSignIn() threw
   * inside Clerk (UI components not ready) and the throw escaped
   * the click handler, and the mount fallback swallowed its own
   * errors with `return false`. Every failure path below writes
   * its reason into #auth-area (homepage) or #account-status
   * (dashboard), so the user — and any live check — can see it. */
  function authError(msg) {
    if (typeof document === "undefined") return;
    var area = document.getElementById("auth-area") || document.getElementById("account-status");
    if (area) area.textContent = "Sign-in couldn't open (" + msg + ") — licence keys still work.";
  }
  function openAuthModal(which) {
    if (typeof document === "undefined") return false;
    var clerk = A._getClerk();
    if (!clerk) { authError("sign-in service not loaded"); return false; }
    var opener = which === "signup" ? clerk.openSignUp : clerk.openSignIn;
    if (typeof opener === "function") {
      try { opener.call(clerk); return true; }
      catch (e) { authError(e && e.message ? e.message : "sign-in failed"); return false; }
    }
    var dlg = document.getElementById("auth-modal");
    var mount = document.getElementById("auth-mount");
    if (!dlg || !mount) { authError("sign-in panel missing on this page"); return false; }
    mount.innerHTML = "";
    try {
      if (which === "signup" && clerk.mountSignUp) clerk.mountSignUp(mount);
      else if (clerk.mountSignIn) clerk.mountSignIn(mount);
      else { authError("Clerk UI components not loaded"); return false; }
    } catch (e) { authError(e && e.message ? e.message : "sign-in failed"); return false; }
    if (typeof dlg.showModal === "function") dlg.showModal();
    return true;
  }
  function openSignIn() { return openAuthModal("signin"); }
  function openSignUp() { return openAuthModal("signup"); }
  async function signOut() { await A.signOut(); }

  /* Re-render on auth change, and re-apply the tier caps. */
  A._onChange(function () {
    renderAuth();
    try { if (typeof window !== "undefined" && window.applyTier) window.applyTier(); } catch (e) {}
  });

  A.initAuth = initAuth;
  A.openSignIn = openSignIn;
  A.openSignUp = openSignUp;
  A.signOut = signOut;
  A.renderAuth = renderAuth;

  if (typeof document !== "undefined") {
    var boot = function () {
      var cfg = (typeof window !== "undefined" && window.WAYBACK_SOCIAL_CONFIG) || {};
      initAuth(cfg);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})();
