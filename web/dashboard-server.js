// Dashboard server wiring (issue #15 follow-up, Track L).
//
// The dashboard counts evidence-pack reports locally first
// (web/evidence-usage.js) and shows the tier from the licence
// key on this device. This file wires it to the two server
// endpoints Track F built — no new endpoints:
//
//   GET  /api/evidence-usage?key=...&local_used=...
//        -> {used, included, remaining, tier, source: "server"|
//           "local", verified, note?}
//        The server count is authoritative when source is
//        "server". When it is "local" (no D1 bound, key not
//        verifiable) the server echoed our local count back and
//        the dashboard keeps counting on this device. A 404 means
//        the key has no D1 row yet (minted before the D1 sync, or
//        a demo key) — local count stands, and the note says so.
//        A 400 means the key didn't verify server-side — the
//        local demo count stands; the Licence card says so.
//   POST /api/evidence-usage {key, idempotency_key}
//        -> mirrors a locally logged report server-side, best
//        effort. The server enforces its own cap (403 when used
//        up / tier includes 0) — a server 403 does NOT undo the
//        local log; the next refresh shows the server count and
//        the note explains the disagreement.
//   POST /api/billing-portal {key}
//        -> {portal_url} on 200; honest states only: 401 bad key,
//        404 no Stripe customer linked, 503 not configured /
//        live key refused / migration missing. Never a fake link.
//
// The honest combined count: the dashboard shows
// max(local, server) — a pack logged on another device counts
// too — and the server note names both numbers when they differ.
// The evidence stat is patched by applyServerUsage(), which the
// dashboard's render() calls at the end of every render (one
// line in dashboard.html), so a re-render never loses the server
// view.
//
// No build step. Browser + Node (module.exports guard at the
// bottom). Node test: web/dashboard-server.test.js.
(function () {
  "use strict";

  var state = {
    serverUsed: null, // null = no server count (local-only)
    serverNote: "",
    lastLocal: 0,
  };

  function $(id) { return document.getElementById(id); }
  function licenceKey() {
    try { return localStorage.getItem("ws_licence") || ""; } catch (e) { return ""; }
  }
  function getTier() {
    try { return localStorage.getItem("ws_licence_tier") || "free"; } catch (e) { return "free"; }
  }
  function localUsed() {
    var EV = window.WS_EVIDENCE;
    if (!EV) return 0;
    try { return EV.getUsed(localStorage, licenceKey()); } catch (e) { return 0; }
  }
  function planIncluded() {
    var LIC = window.WAYBACK_LICENCE;
    if (!LIC) return 0;
    try { return LIC.planCaps(getTier()).evidence_reports || 0; } catch (e) { return 0; }
  }

  // Fetch the server count and re-apply the display. Never throws
  // and never clears the local count: any failure leaves the
  // dashboard exactly as it was (local-first).
  async function refreshServerUsage() {
    var key = licenceKey();
    if (!key) {
      state.serverUsed = null;
      state.serverNote = "";
      applyServerUsage();
      return;
    }
    var res, data;
    try {
      res = await fetch("/api/evidence-usage?key=" + encodeURIComponent(key) +
        "&local_used=" + localUsed());
      data = await res.json().catch(function () { return {}; });
    } catch (e) {
      state.serverUsed = null;
      state.serverNote = "";
      applyServerUsage();
      return;
    }
    if (!res.ok) {
      state.serverUsed = null;
      state.serverNote = res.status === 404
        ? "No server usage record for this key yet — counting on this device."
        : "";
      applyServerUsage();
      return;
    }
    if (data.source === "server") {
      state.serverUsed = data.used;
      state.serverNote = "";
    } else {
      // source "local": the server could not verify / has no D1 —
      // it echoed our local count back. Keep counting locally.
      state.serverUsed = null;
      state.serverNote = data.note || "";
    }
    applyServerUsage();
  }

  // Patch the evidence stat + server note after every render().
  // The stat shows max(local, server); the note names both
  // numbers when they differ, so a pack logged on another device
  // is visible instead of silently overwriting this device's.
  function applyServerUsage() {
    var local = localUsed();
    var included = planIncluded();
    var shown = state.serverUsed == null ? local : Math.max(local, state.serverUsed);
    var stats = document.querySelectorAll("#usage div");
    for (var i = 0; i < stats.length; i++) {
      if (stats[i].textContent.indexOf("evidence-pack reports used") !== -1) {
        stats[i].innerHTML = "<b>" + shown + " / " + included + "</b>evidence-pack reports used" +
          (state.serverUsed != null && state.serverUsed !== local
            ? " (server: " + state.serverUsed + " · this device: " + local + ")"
            : "");
      }
    }
    var noteEl = $("usage-server-note");
    if (!noteEl) return;
    if (state.serverUsed != null && state.serverUsed !== local) {
      noteEl.textContent = "Server count: " + state.serverUsed + " · this device: " + local +
        ". Showing the higher of the two — a pack logged on another device counts too.";
    } else if (state.serverNote) {
      noteEl.textContent = state.serverNote;
    } else {
      noteEl.textContent = "";
    }
  }

  // After the dashboard logged a report locally, mirror it
  // server-side (best effort). Only called when the local count
  // actually moved — the inline handler blocks when used up or
  // when the tier includes 0 reports.
  async function syncLogToServer() {
    var key = licenceKey();
    if (!key) return;
    var idem = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : ("dash-" + Date.now() + "-" + Math.random().toString(36).slice(2));
    try {
      var res = await fetch("/api/evidence-usage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: key, idempotency_key: idem }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.ok && data.source === "server") state.serverUsed = data.used;
      // A 403 (server says used up / tier 0) does not undo the
      // local log — the refresh below shows the server count and
      // the note explains the disagreement.
    } catch (e) { /* server sync is best effort — the local log already happened */ }
    refreshServerUsage();
  }

  function portalErrorText(status, error) {
    if (status === 401) return "That key didn't check out — re-verify it in the Licence card above.";
    if (status === 404) return "No Stripe customer is linked to this licence yet — the portal opens after a purchase links a customer to this key. (No fake link is shown.)";
    if (status === 503) return error || "Billing portal isn't set up yet.";
    return error || "Billing portal didn't answer — try again.";
  }

  // Open a Stripe Billing Portal session for the buyer behind the
  // licence key. The endpoint returns the real session URL on 200
  // and an honest error otherwise — this function never invents a
  // link. Portal sessions expire 5 minutes after creation if
  // unused (1 hour after first activity) and cannot be iframed,
  // so the URL opens in a new tab.
  async function openBillingPortal() {
    var st = $("billing-portal-status");
    var key = licenceKey();
    if (!key) {
      if (st) st.textContent = "Add a licence key above first — the portal opens for the buyer behind a key.";
      return;
    }
    if (st) st.textContent = "Opening the billing portal…";
    var res, data;
    try {
      res = await fetch("/api/billing-portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: key }),
      });
      data = await res.json().catch(function () { return {}; });
    } catch (e) {
      if (st) st.textContent = "Could not reach the billing portal — try again.";
      return;
    }
    if (!res.ok) {
      if (st) st.textContent = portalErrorText(res.status, data.error);
      return;
    }
    if (!data.portal_url) {
      if (st) st.textContent = "Stripe answered without a portal URL — try again.";
      return;
    }
    if (st) st.textContent = "Portal opened in a new tab — it expires 5 minutes after creation if unused (1 hour after first activity).";
    window.open(data.portal_url, "_blank", "noopener");
  }

  function init() {
    state.lastLocal = localUsed();
    var go = $("billing-portal-go");
    if (go) go.onclick = openBillingPortal;
    var logBtn = $("log-evidence");
    if (logBtn) {
      // The inline handler (registered first, in dashboard.html)
      // runs before this one: the local count moved iff the log
      // succeeded, so compare against the last-known value.
      logBtn.addEventListener("click", function () {
        var now = localUsed();
        var before = state.lastLocal;
        state.lastLocal = now;
        if (now > before) syncLogToServer();
        else refreshServerUsage();
      });
    }
    var verifyBtn = $("licence-verify");
    if (verifyBtn) {
      verifyBtn.addEventListener("click", function () {
        // The inline handler stores the key and re-renders first.
        setTimeout(function () {
          state.lastLocal = localUsed();
          refreshServerUsage();
        }, 0);
      });
    }
    var clearBtn = $("licence-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        setTimeout(function () {
          state.lastLocal = localUsed();
          refreshServerUsage();
        }, 0);
      });
    }
    refreshServerUsage();
  }

  var api = { refreshServerUsage: refreshServerUsage,
              applyServerUsage: applyServerUsage,
              syncLogToServer: syncLogToServer,
              openBillingPortal: openBillingPortal,
              portalErrorText: portalErrorText,
              init: init, _state: state };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof window !== "undefined") {
    window.WS_DASHBOARD_SERVER = api;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
