/* wayback-social web console — pricing UI (plans + feature chart).
 * Extracted from console.js so that file stays under the ~500-line
 * ceiling. Loaded right after console.js; it uses that file's
 * globals (cfg, $, showDlg). No build step.
 */
(function () {
  "use strict";

  // Checkout is swappable: ?checkout=paddle|stripe|gumroad|email, or
  // ?ab=paddle-stripe splits visitors 50/50 (stored per session).
  // Lemon Squeezy is closed (16 Nov 2026) — never a provider here.
  function activeProvider() {
    const q = new URLSearchParams(location.search);
    const want = q.get("checkout");
    if (want && cfg.CHECKOUT.links[want]) return want;
    const ab = q.get("ab");
    if (ab) {
      const [a, b] = ab.split("-");
      if (cfg.CHECKOUT.links[a] && cfg.CHECKOUT.links[b]) {
        let pick = sessionStorage.getItem("ws-ab");
        if (!pick) { pick = Math.random() < 0.5 ? a : b; sessionStorage.setItem("ws-ab", pick); }
        return pick;
      }
    }
    return cfg.CHECKOUT.provider;
  }
  const PROVIDER_LABEL = { paddle: "Paddle", stripe: "Stripe", gumroad: "Gumroad", email: "Email order", lemon: "Lemon Squeezy (closed — do not use)" };
  function renderPlans() {
    const prov = activeProvider();
    // Each paid card states WHY the price is low and HOW LONG it lasts:
    // the launch note (pricing.yaml, single source of truth) plus this
    // pack's own launch-vs-regular prices. Regular price is struck
    // through next to the launch price above; there is no countdown
    // (no backend buyer count — see pricing.yaml).
    $("plans").innerHTML = cfg.PRICING.map(p => `<div class="plan ${p.featured ? "featured" : ""}">
    ${p.featured ? '<span class="badge">RECOMMENDED</span>' : ""}
    <h3>${p.name}</h3><div class="price">${p.regular ? `<span class="strike">${p.regular}</span>` : ""}${p.price} <small>${p.cadence}</small></div>
    ${p.regular ? `<p class="muted" style="font-size:13px;margin:6px 0 0"><b>Launch price.</b> ${cfg.LAUNCH_NOTE || ""} This pack: ${p.price} now, ${p.regular} after launch.</p>` : ""}
    <p class="muted">${p.blurb}</p><ul>${p.features.map(f => `<li>${f}</li>`).join("")}</ul>
    <button class="btn" data-plan="${p.id}">${p.cta}</button></div>`).join("");
    const note = document.createElement("p");
    note.className = "muted";
    note.innerHTML = `Checkout: <b>${PROVIDER_LABEL[prov] || prov}</b> · Secure checkout opens in a new tab. Seller test: add <code>?checkout=stripe</code> (or paddle / gumroad / email) or <code>?ab=paddle-stripe</code> to swap providers.`;
    $("plans").after(note);
    document.querySelectorAll("[data-plan]").forEach(b => b.onclick = () => {
      const p = cfg.PRICING.find(x => x.id === b.dataset.plan);
      if (!p.checkout) { showDlg("Free — you're already in", "No payment needed. Use the search above."); return; }
      const link = cfg.CHECKOUT.links[prov] && cfg.CHECKOUT.links[prov][p.checkout];
      if (!link || link.includes("REPLACE")) { showDlg("Checkout not connected yet", `${p.name} (${p.price} ${p.cadence}) via ${PROVIDER_LABEL[prov] || prov} — checkout isn't connected yet. Please check back soon.`); return; }
      window.open(link, "_blank");
    });
  }
  function renderChart() {
    const rows = cfg.FEATURE_CHART || [];
    const cols = ["free", "starter", "pro", "studio", "bundle"];
    const tb = document.querySelector("#chart tbody");
    if (tb) tb.innerHTML = rows.map(r => `<tr><th>${r.label}</th>${
      cols.map(t => `<td>${(r.values && r.values[t]) || "—"}</td>`).join("")}</tr>`).join("");
    const ln = $("launch-note");
    if (ln && cfg.LAUNCH_NOTE) {
      const regs = cfg.PRICING.filter(p => p.regular)
        .map(p => `${p.name} ${p.regular}`).join(" · ");
      ln.innerHTML = `<b>${cfg.LAUNCH_NOTE}</b> Regular prices: ${regs}.`;
    }
  }
  renderPlans();
  renderChart();

  if (typeof window !== "undefined") {
    window.WS_PRICING_UI = { renderPlans: renderPlans, renderChart: renderChart, activeProvider: activeProvider };
  }
})();
