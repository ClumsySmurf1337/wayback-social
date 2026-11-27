/* OSINT research tools — batch mode + section routing
 * (issue #13 follow-up). Lives in the #osint-tools section of
 * index.html; osint. opens with it as the primary mode, legal. opens
 * with the Citations tab, app. opens it too. Other hosts keep it
 * collapsed behind a toggle — same tool, same caps, same archive.
 *
 * Batch: paste `NETWORK @handle` lines (one per line, same format as
 * the CLI batch file), capped to the tier's batch_targets. Each
 * target is one SearchJob step (progress + Pause / Stop / Resume
 * reuse web/search-job.js — no second job machine). Results are
 * grouped per target with CSV/JSON download.
 *
 * The deleted-diff mode lives in web/diff.js (same section, its own
 * file — one job per file); citations in web/citations.js; the
 * evidence pack in web/evidence-pack.js. Shared state
 * (window.WS_OSINT) and the tab/routing init live here.
 *
 * No build step. Browser + Node for the pure helpers (module.exports
 * guard at the bottom). No CLI text anywhere on the page.
 */
"use strict";

/* --- Pure helpers (node-testable) ---------------------------------- */
// Parse batch lines: `NETWORK @handle`, one per line. Blank lines and
// `#` comments are ignored; a bad line is reported, not fatal.
// Each error echoes the skipped line itself (truncated) so the user
// can see WHICH line was skipped — the reason alone ("unknown
// network 'not'") doesn't say that.
function shortLine(raw) {
  const s = String(raw || "").trim();
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}
function parseTargets(text) {
  const targets = [], errors = [];
  const nets = (typeof NETWORKS !== "undefined") ? NETWORKS : {};
  (text || "").split(/\n/).forEach(function (raw, i) {
    const line = raw.trim();
    if (!line || line[0] === "#") return;
    const parts = line.split(/\s+/);
    if (parts.length < 2) {
      errors.push("line " + (i + 1) + ": need NETWORK and handle — e.g. `x jack` — \"" + shortLine(raw) + "\"");
      return;
    }
    const net = parts[0].toLowerCase();
    const id = parts[1].replace(/^@/, "");
    if (!nets[net]) { errors.push("line " + (i + 1) + ": unknown network '" + parts[0] + "' — \"" + shortLine(raw) + "\""); return; }
    if (!id) { errors.push("line " + (i + 1) + ": missing handle — \"" + shortLine(raw) + "\""); return; }
    targets.push({ net: net, id: id });
  });
  return { targets: targets, errors: errors };
}

function fmtTs(ts) {
  return ts && ts.length >= 12
    ? ts.slice(0, 4) + "-" + ts.slice(4, 6) + "-" + ts.slice(6, 8) + " " +
      ts.slice(8, 10) + ":" + ts.slice(10, 12)
    : (ts || "");
}
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* --- Shared state + browser wiring (needs console.js globals) ------- */
var WS_OSINT = { rows: [], nets: [], meta: null, diffRows: null };

function currentCapsLocal() {
  try { return currentCaps(); } catch (e) { return { archive_limit: 25, batch_targets: 3 }; }
}
function setOsintRows(rows, nets, meta) {
  WS_OSINT.rows = rows; WS_OSINT.nets = nets; WS_OSINT.meta = meta;
  try { setLastRows(rows, nets); } catch (e) {}
}

// One batch target: all its CDX patterns, deduped rows, failures counted.
async function checkTarget(net, id, limit, from, to, signal) {
  const fetchTimed = window.WS_MODES && window.WS_MODES.fetchPatternTimed;
  const patterns = NETWORKS[net].patterns;
  const seen = {}, rows = [];
  let failed = 0;
  for (const pat of patterns) {
    let out;
    try { out = await fetchTimed(pat, id, limit, from, to, signal); }
    catch (e) { if (e && e.name === "AbortError") throw e; failed += 1; continue; }
    out.forEach(function (r) {
      // Same alias-aware key as console.js addRow: one capture
      // stored under twitter.com by one pattern and x.com by the
      // other is one row, not two.
      const alias = window.WS_URL_ALIAS;
      const k = alias ? alias.dedupKey(r[1], r[2]) : r[1] + "|" + r[2];
      if (!seen[k]) { seen[k] = 1; rows.push(r); }
    });
    if (rows.length >= limit) break;
  }
  rows.sort(function (a, b) { return a[1].localeCompare(b[1]); });
  return { net: net, id: id, count: rows.length, rows: rows,
    failed: rows.length === 0 && failed > 0, failedPatterns: failed };
}

function renderBatch(perTarget, totalTargets, stopped, skippedNote) {
  const found = perTarget.filter(function (p) { return p.count; });
  const failed = perTarget.filter(function (p) { return p.failed; });
  const bits = ["Batch done: " + found.length + "/" + perTarget.length +
    " targets found captures" + (totalTargets > perTarget.length ? " (" + totalTargets + " lines, tier cap " + perTarget.length + ")" : "") + "."];
  if (skippedNote) bits.push(skippedNote);
  if (stopped) bits.push("Stopped early — partial results.");
  if (failed.length) bits.push(failed.length + " target(s) didn't answer (" + failed.map(function (p) { return "@" + p.id; }).join(", ") + ") — results may be incomplete.");
  $("batch-status").textContent = bits.join(" ");
  const flat = [], nets = [];
  perTarget.forEach(function (p) { p.rows.forEach(function (r) { flat.push(r); nets.push(p.net); }); });
  setOsintRows(flat, nets, { mode: "batch", targets: perTarget.length });
  $("batch-results").innerHTML = perTarget.map(function (p) {
    const head = "<h3>" + esc(NETWORKS[p.net].name) + " @" + esc(p.id) + " — " +
      (p.failed ? "didn't answer" : p.count + " capture" + (p.count === 1 ? "" : "s")) + "</h3>";
    if (!p.rows.length) return head + '<p class="muted">No captures for this target.</p>';
    const rowsHtml = p.rows.slice(0, 5).map(function (r) {
      return "<tr><td>" + fmtTs(r[1]) + "</td><td><a href=\"" + esc(r[2]) + "\" target=\"_blank\" rel=\"noopener\">" + esc(r[2]) + "</a></td>" +
        "<td><a href=\"https://web.archive.org/web/" + r[1] + "/" + esc(r[2]) + "\" target=\"_blank\" rel=\"noopener\">snapshot</a></td></tr>";
    }).join("");
    return head + '<div style="overflow-x:auto"><table><thead><tr><th>Archived</th><th>Post</th><th>Snapshot</th></tr></thead><tbody>' + rowsHtml + "</tbody></table></div>" +
      (p.rows.length > 5 ? '<p class="muted">Showing 5 of ' + p.rows.length + ' — download the CSV/JSON for all of them.</p>' : "");
  }).join("");
  $("batch-actions").hidden = !flat.length;
  try { recordHistory("batch", perTarget.length + " targets", flat.length); recordUsage(); } catch (e) {}
}

async function runBatch() {
  const parsed = parseTargets($("batch-lines").value);
  // The skipped-line notice is set here, then the progress text
  // overwrites the status while the job runs — so it is carried in
  // `skippedNote` and re-attached by renderBatch when the job ends.
  const skippedNote = parsed.errors.length
    ? "Skipped " + parsed.errors.length + " line(s): " + parsed.errors.join("; ")
    : "";
  if (skippedNote) {
    $("batch-status").textContent = skippedNote;
    if (!parsed.targets.length) return;
  }
  const caps = currentCapsLocal();
  const limit = Math.min(parseInt($("batch-limit").value) || 20, caps.archive_limit);
  let targets = parsed.targets;
  if (targets.length > caps.batch_targets) {
    $("batch-status").textContent = "Your tier runs " + caps.batch_targets + " batch targets at a time — running the first " + caps.batch_targets + " of " + targets.length + ".";
    targets = targets.slice(0, caps.batch_targets);
  } else {
    $("batch-status").textContent = "Batch running: " + targets.length + " target(s)…";
  }
  const SJ = window.WS_SEARCH_JOB;
  const perTarget = [];
  const steps = targets.map(function (t) {
    return { label: NETWORKS[t.net].name + " @" + t.id,
      run: async function (signal) { return checkTarget(t.net, t.id, limit, "", "", signal); } };
  });
  const job = new SJ.SearchJob(steps, {
    onProgress: function (p) {
      $("batch-status").textContent = "Batch: " + p.done + "/" + p.total + " targets done…";
    },
    onState: function (s) { if (s === "done" || s === "failed" || s === "stopped") $("batch-go").disabled = false; },
  });
  SJ.bindSearchControls(job, {
    bar: $("batch-progress"), barFill: $("batch-fill"), barText: $("batch-text"),
    pauseBtn: $("batch-pause"), stopBtn: $("batch-stop"), resumeBtn: $("batch-resume"),
  });
  if (activeJob && activeJob !== job) activeJob.abandon();
  activeJob = job;
  $("batch-go").disabled = true;
  job.start();
  for (;;) {
    await job.settled();
    perTarget.length = 0;
    job.results.forEach(function (r) {
      perTarget.push(r.ok ? r.value : { net: r.label, id: "", count: 0, rows: [], failed: true, failedPatterns: 1 });
    });
    renderBatch(perTarget, parsed.targets.length, job.state === "stopped", skippedNote);
    if (job.state !== "stopped") break;
    if (!(await job.waitForResume())) return;
  }
  $("batch-go").disabled = false;
}

function csvCell(v) { return "\"" + String(v == null ? "" : v).replace(/"/g, "\"\"") + "\""; }
// JSON export is a paid-tier format (free exports CSV only) — same gate
// as the main console's Download JSON button. Shared with diff.js.
function jsonExportAllowed() {
  if (currentCapsLocal().exports.includes("json")) return true;
  showDlg("JSON export needs Starter",
    "Your tier exports CSV only. Starter ($9 launch) adds JSON; Pro adds JSONL + HTML. See Pricing below.");
  return false;
}
function downloadBatch(fmt) {
  const rows = WS_OSINT.rows, nets = WS_OSINT.nets;
  if (!rows.length) return;
  if (fmt === "json" && !jsonExportAllowed()) return;
  if (fmt === "csv") {
    const head = "network,identifier,archived_timestamp,original_post_url,archived_post_url,archived_statuscode,archived_mimetype\n";
    const body = rows.map(function (r, i) {
      return [nets[i] || "", "", r[1], r[2], "https://web.archive.org/web/" + r[1] + "/" + r[2], r[4], r[3]].map(csvCell).join(",");
    }).join("\n");
    download("archivecheck-batch.csv", head + body, "text/csv");
  } else {
    download("archivecheck-batch.json", JSON.stringify(rows.map(function (r, i) {
      return { network: nets[i] || "", archived_timestamp: r[1], original_post_url: r[2],
        archived_post_url: "https://web.archive.org/web/" + r[1] + "/" + r[2],
        archived_statuscode: r[4], archived_mimetype: r[3] };
    }), null, 2), "application/json");
  }
}

// --- Tabs + host routing ------------------------------------------------
// osint. opens with this section as the primary mode (Batch tab);
// legal. opens with the Citations tab; app. opens it too (Batch).
// Other hosts keep the panels collapsed behind the toggle — same
// tool, same caps, same archive, one click away.
function showTab(tab) {
  ["batch", "diff", "citations"].forEach(function (t) {
    const panel = $("osint-panel-" + t);
    if (panel) panel.hidden = t !== tab;
    const btn = document.querySelector('[data-osint-tab="' + t + '"]');
    if (btn) btn.setAttribute("aria-pressed", t === tab ? "true" : "false");
  });
}
function initOsintTools() {
  // Brand from the body attribute when branding.js already ran;
  // otherwise resolve it from the hostname directly (branding.js
  // exposes ArchiveBranding.resolveBrand) — never depend on
  // listener ordering.
  var brand = document.body.getAttribute("data-brand");
  if (!brand && typeof window !== "undefined" && window.ArchiveBranding && window.ArchiveBranding.resolveBrand) {
    try { brand = window.ArchiveBranding.resolveBrand(window.location.hostname); } catch (e) { brand = null; }
  }
  brand = brand || "apex";
  const panels = $("osint-panels");
  const toggle = $("osint-toggle");
  const open = brand === "osint" || brand === "legal" || brand === "app";
  if (panels) panels.hidden = !open;
  if (toggle) {
    toggle.setAttribute("aria-pressed", open ? "true" : "false");
    toggle.textContent = open ? "Hide research tools" : "Research tools — batch, deleted diff, citations";
    toggle.addEventListener("click", function () {
      const now = panels.hidden;
      panels.hidden = !now;
      toggle.setAttribute("aria-pressed", now ? "true" : "false");
      toggle.textContent = now ? "Hide research tools" : "Research tools — batch, deleted diff, citations";
    });
  }
  showTab(brand === "legal" ? "citations" : "batch");
  document.querySelectorAll("[data-osint-tab]").forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.dataset.osintTab); });
  });
  const bg = $("batch-go"); if (bg) bg.addEventListener("click", runBatch);
  const bc = $("batch-csv"); if (bc) bc.addEventListener("click", function () { downloadBatch("csv"); });
  const bj = $("batch-json"); if (bj) bj.addEventListener("click", function () { downloadBatch("json"); });
  // The diff tab wires itself (web/diff.js) — guarded so batch.js
  // still works standalone in the node tests.
  if (typeof window !== "undefined" && window.WS_DIFF && window.WS_DIFF.initDiff) {
    window.WS_DIFF.initDiff();
  }
}

(function init() {
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOsintTools);
  } else {
    initOsintTools();
  }
})();

if (typeof window !== "undefined") {
  window.WS_OSINT = WS_OSINT;
  // init is exported so the E2E suite can drive routing per brand
  // (localhost cannot resolve the real subdomain hostnames — /etc/hosts
  // is read-only in the sandbox; hostname -> brand is covered by
  // branding.test.js + the SSR middleware suite instead).
  window.WS_OSINT_TOOLS = { parseTargets: parseTargets, runBatch: runBatch, showTab: showTab, init: initOsintTools };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseTargets: parseTargets, fmtTs: fmtTs };
}
