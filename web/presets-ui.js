/* wayback-social web console — presets UI (use-case presets + the
 * honest-limits box). Extracted from modes.js so that file stays
 * under the ~300-line ceiling. Loaded BEFORE modes.js (which
 * re-exports activatePreset / PRESETS / LIMITS_LINE on WS_MODES and
 * used to call initPresets()).
 * It uses console.js globals ($). It initialises itself at load
 * (scripts load at end of body, so the DOM is ready): preset
 * buttons get listeners and ?preset= activates the matching preset.
 * No build step.
 */

// --- Presets (copy mirrors wayback_social/presets.py) ---------------
const PRESETS = {
  catfish: { name: "Catfish check",
    blurb: "Is this profile real, reused, or stolen? Checks the handle across networks and over time.",
    ethics: "Public archived posts only. A match does not prove the person messaging you is that person — stolen photos are the classic catfish move." },
  relationship: { name: "Relationship trust check",
    blurb: "What has this person posted publicly, under this handle, over time?",
    ethics: "Public posts only — no DMs, no location, no account access. Talk to the person before concluding anything." },
  brand: { name: "Brand monitoring",
    blurb: "Where has our brand / handle appeared, and what got deleted?",
    ethics: "Public archived posts only. Watch for impersonator handles with similar names." },
  hiring: { name: "Hiring screen",
    blurb: "Public professional history for a candidate, with consent.",
    ethics: "Public posts only, with the candidate's knowledge where your policy requires it. Do not use protected characteristics found in archives.",
    fcra: "FCRA: this is not a consumer report — do not use it for employment decisions without a compliant screening provider. See Trust & safety." },
  legal: { name: "Evidence preservation",
    blurb: "Preserve a dated, citable record of a public post before it is deleted.",
    ethics: "Triage, not court-ready. Verify the snapshot yourself at web.archive.org before relying on it in a filing." },
  journalist: { name: "Journalist / OSINT",
    blurb: "Verify a claim, find deleted posts, trace a handle across networks.",
    ethics: "Public archived posts only. Cross-check every archived post against a second source; the capture date proves the post existed then, not when it was written." },
  researcher: { name: "Researcher",
    blurb: "A complete, reproducible archive pull for a handle or topic.",
    ethics: "Public archived posts only. Publish the query (network, handle, date range, limit) with your results." },
};
const LIMITS_LINE = "Public archived posts only. Found ≠ guilty. Not found ≠ not real.";
// Universal limits, shown in the honest-limits box under every preset
// (issue #9) — the per-preset ethics line is the preset's own note,
// this is the part that never changes.
const UNIVERSAL_LIMITS = "Public archived posts only. No private messages, no account access, no location tracking, no real-time monitoring, no face recognition, no verdicts, no minors. Found ≠ guilty. Not found ≠ not real.";
let activePreset = null;

function renderLimitsBox(p) {
  const box = $("preset-limits");
  if (!box) return;
  const extra = p && p.fcra ? " " + p.fcra : "";
  // textContent would wipe the box's Trust & safety link, so rebuild
  // the box as text + link instead of assigning textContent.
  const text = "Honest limits: " + (p ? p.ethics + " " : "") + UNIVERSAL_LIMITS + extra + " ";
  while (box.firstChild) box.removeChild(box.firstChild);
  box.appendChild(document.createTextNode(text));
  const a = document.createElement("a");
  a.href = "trust.html";
  a.textContent = "Trust & safety";
  box.appendChild(a);
}
function activatePreset(id) {
  const p = PRESETS[id];
  if (!p) return false;
  activePreset = id;
  document.querySelectorAll("button[data-preset]").forEach(b =>
    b.setAttribute("aria-pressed", b.dataset.preset === id ? "true" : "false"));
  const desc = $("preset-desc");
  if (desc) desc.textContent = `${p.name} — ${p.blurb} ${p.ethics}`;
  renderLimitsBox(p);
  const broad = $("broad");
  if (broad) broad.checked = true; // every preset is an all-network search
  try { document.body.setAttribute("data-preset", id); } catch (e) {}
  return true;
}
function initPresets() {
  document.querySelectorAll("button[data-preset]").forEach(b =>
    b.addEventListener("click", () => activatePreset(b.dataset.preset)));
  // ?preset=catfish (dashboard / subdomain links) — branding.js also
  // clicks the right preset on DOMContentLoaded; both call the same
  // idempotent activatePreset, so a double call is harmless.
  const q = new URLSearchParams(location.search);
  const qp = q.get("preset");
  if (qp) activatePreset(qp);
}
initPresets();

if (typeof window !== "undefined") {
  window.WS_PRESETS_UI = { PRESETS: PRESETS, LIMITS_LINE: LIMITS_LINE, activatePreset: activatePreset, initPresets: initPresets };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { PRESETS: PRESETS, LIMITS_LINE: LIMITS_LINE, activatePreset: activatePreset, initPresets: initPresets };
}
