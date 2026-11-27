/* Evidence pack in the browser (issue #13 follow-up) — the osint.
 * evidence button, Studio-gated. Builds the same pack the CLI
 * builds (wayback_social/evidence.py), in the browser:
 * report.html, captures.csv/.json/.jsonl, manifest.json,
 * manifest.sha256, README.txt — same manifest fields, same
 * SHA-256-per-file layout, same ethics line. The ZIP is written
 * here (stored entries, no compression library — nothing vendored
 * to fetch); hashes come from WebCrypto, never faked: if
 * crypto.subtle is unavailable (non-secure context), the button
 * says so honestly instead of building an unverifiable pack.
 *
 * Gating reuses the local-first counting (web/evidence-usage.js,
 * issue #15): the log happens BEFORE the pack is built, so a blocked
 * 11th report never downloads. Free/Starter/Pro include 0 reports
 * (evidence packs are a Studio feature); Studio includes 10.
 * Server-side D1 counting replaces this when the Paddle go-live
 * lands — until then the page says the count is on this device.
 *
 * No build step. Browser + Node for the pure parts (CRC32, ZIP
 * structure, manifest shape) — module.exports guard at the bottom.
 * The WebCrypto hash is the only part that needs a browser (or
 * node:crypto.webcrypto in tests).
 */
"use strict";

var TOOL_VERSION = "1.5.0"; // keep in sync with wayback_social/evidence.py TOOL_VERSION
var PACK_FILES = ["report.html", "captures.csv", "captures.json",
  "captures.jsonl", "manifest.json", "manifest.sha256", "README.txt"];

// Node (tests) runs each file in its own module scope, so the
// zip-store.js globals aren't visible there — pull them in here.
// In the browser this block never runs; zip-store.js is loaded
// first and crc32 / zipStore resolve as globals.
if (typeof module !== "undefined" && module.exports) {
  var _zipStoreLib = require("./zip-store.js");
  var crc32 = _zipStoreLib.crc32;
  var zipStore = _zipStoreLib.zipStore;
}

// CRC32 + the stored-entry ZIP writer live in zip-store.js now
// (extracted so this file stays under the ~300-line ceiling; it is
// loaded before this file and exports crc32 / zipStore as globals).
/* --- SHA-256 (WebCrypto; never faked) --------------------------------- */
async function sha256Hex(bytes) {
  var subtle = (typeof crypto !== "undefined" && crypto.subtle) ||
    (typeof window !== "undefined" && window.crypto && window.crypto.subtle);
  if (!subtle) throw new Error("SHA-256 is unavailable in this browser context (crypto.subtle needs a secure origin) — the pack cannot be verified, so it was not built.");
  var digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(function (b) {
    return ("0" + b.toString(16)).slice(-2);
  }).join("");
}

/* --- Pack contents (mirror wayback_social/evidence.py) --------------- */
// Which archives the records came from — never label an Arquivo.pt
// capture as Wayback (or vice versa). Missing source = Wayback.
function sourceLabel(records) {
  let a = false, w = false;
  (records || []).forEach(function (r) { if (r.source === "arquivo") a = true; else w = true; });
  return (a && w) ? "Wayback Machine CDX API + Arquivo.pt" : a ? "Arquivo.pt" : "Wayback Machine CDX API";
}
function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function csvCell(v) { return "\"" + String(v == null ? "" : v).replace(/"/g, "\"\"") + "\""; }
function recordsCsv(records) {
  const head = "network,identifier,post_id,archived_timestamp,original_post_url,archived_post_url,archived_statuscode,archived_mimetype,live_verdict,live_http_status,live_checked_at\n";
  return head + records.map(function (r) {
    return [r.network, r.identifier, r.post_id, r.archived_timestamp, r.original_post_url,
      r.archived_post_url, r.archived_statuscode, r.archived_mimetype,
      r.live_verdict || "", r.live_http_status || "", r.live_checked_at || ""].map(csvCell).join(",");
  }).join("\n") + "\n";
}
function reportHtml(records, meta, fileHashes) {
  const rows = records.map(function (r) {
    return "<tr><td><a href=\"" + escHtml(r.original_post_url) + "\">" + escHtml(r.original_post_url) + "</a></td>" +
      "<td><a href=\"" + escHtml(r.archived_post_url) + "\">" + escHtml(r.archived_post_url) + "</a></td>" +
      "<td>" + escHtml(r.archived_timestamp) + "</td><td>" + escHtml(r.live_verdict || "not checked") + "</td></tr>";
  }).join("\n");
  const hashes = Object.keys(fileHashes).sort().map(function (n) {
    return "<li><code>" + escHtml(n) + "</code> — <code>" + fileHashes[n] + "</code></li>";
  }).join("");
  return "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
    "<title>Evidence pack — " + escHtml(meta.identifier) + " (" + escHtml(meta.network) + ")</title>" +
    "<style>body{font-family:system-ui,sans-serif;margin:2em;max-width:1100px}" +
    "table{border-collapse:collapse;font-size:13px}th,td{border:1px solid #ccc;padding:4px 8px;vertical-align:top}" +
    "th{background:#eee}code{font-size:12px}</style></head><body>" +
    "<h1>Evidence pack — " + escHtml(meta.network) + " @" + escHtml(meta.identifier) + "</h1>" +
    "<p>" + records.length + " archived post(s), " + escHtml(meta.date_range) +
    ". Generated " + escHtml(meta.generated_at) + " by ArchiveCheck web " + escHtml(meta.tool_version) +
    ". Source: " + escHtml(sourceLabel(records)) + ".</p>" +
    "<p><strong>What this proves:</strong> that each post below existed and was archived on the date shown. " +
    "It does <em>not</em> prove who wrote it, why it was deleted, or intent. Live verdicts (live / deleted / unknown) " +
    "are best-effort: \"unknown\" means login-walled or errored, never \"deleted\". " +
    "Post text is not fetched in the browser — recovered text is included where the archive captured it.</p>" +
    "<table><thead><tr><th>Post</th><th>Archived snapshot</th><th>Archived at</th><th>Live</th></tr></thead>" +
    "<tbody>" + rows + "</tbody></table>" +
    "<h2>File hashes (SHA-256)</h2><ul>" + hashes + "</ul>" +
    "<p>Verify with <code>sha256sum -c manifest.sha256</code> (manifest.json holds the same hashes plus pack metadata).</p>" +
    "</body></html>";
}
function readmeTxt(meta) {
  return "ArchiveCheck — evidence pack\n" +
    "=============================================\n" +
    "Network: " + meta.network + "\nHandle: @" + meta.identifier + "\n" +
    "Date range: " + meta.date_range + "\nGenerated: " + meta.generated_at + "\n" +
    "Tool: ArchiveCheck web " + meta.tool_version + "\nSource: " + (meta.source_label || "Wayback Machine CDX API") + "\n\n" +
    "Contents: report.html (read this first), captures.csv, captures.json,\n" +
    "captures.jsonl, manifest.json (hashes + pack metadata),\n" +
    "manifest.sha256 (plain sha256sum checklist).\n\n" +
    "How to verify:\n  1. unzip the pack into a folder.\n" +
    "  2. cd into it and run:  sha256sum -c manifest.sha256\n" +
    "     (manifest.json lists the same hashes plus pack metadata;\n" +
    "     manifest.json and manifest.sha256 cannot hash themselves.)\n\n" +
    "What this proves: that each listed post existed and was archived on\n" +
    "the date shown. It does NOT prove who wrote it, why it was deleted,\n" +
    "or intent. Live verdicts are best-effort — \"unknown\" means the live\n" +
    "site was login-walled or errored, never \"deleted\".\n" +
    "Public archived posts only. No DMs, no private accounts.\n";
}

// Build the pack. Returns {blob, manifest, filename}. Throws when
// there are no records or SHA-256 is unavailable.
async function buildEvidencePack(records, meta) {
  records = records || [];
  if (!records.length) throw new Error("No records on screen to pack — run a search or a deleted diff first.");
  meta = Object.assign({}, meta);
  meta.tool_version = TOOL_VERSION;
  meta.generated_at = new Date().toISOString().slice(0, 19) + "Z";
  const stamps = records.map(function (r) { return r.archived_timestamp; }).filter(Boolean).sort();
  meta.date_range = stamps.length ? stamps[0] + " – " + stamps[stamps.length - 1] : "";
  meta.network = meta.network || records[0].network || "";
  meta.identifier = meta.identifier || records[0].identifier || "";
  meta.source_label = sourceLabel(records);
  const enc = new TextEncoder();
  const contents = {
    "captures.csv": enc.encode(recordsCsv(records)),
    "captures.json": enc.encode(JSON.stringify(records, null, 2)),
    "captures.jsonl": enc.encode(records.map(function (r) { return JSON.stringify(r); }).join("\n") + "\n"),
    "README.txt": enc.encode(readmeTxt(meta)),
  };
  const fileHashes = {};
  for (const name of Object.keys(contents)) fileHashes[name] = await sha256Hex(contents[name]);
  contents["report.html"] = enc.encode(reportHtml(records, meta, fileHashes));
  fileHashes["report.html"] = await sha256Hex(contents["report.html"]);
  const manifest = {
    tool: "wayback-social",
    tool_version: meta.tool_version,
    generated_at: meta.generated_at,
    network: meta.network,
    identifier: meta.identifier,
    date_range: meta.date_range,
    source: meta.source_label,
    counts: { records: records.length,
      deleted: records.filter(function (r) { return r.live_verdict === "deleted"; }).length,
      live: records.filter(function (r) { return r.live_verdict === "live"; }).length,
      unknown: records.filter(function (r) { return r.live_verdict === "unknown"; }).length },
    files: {},
    ethics: "Public archived posts only. Proves a post existed on the archived date — not who wrote it, why it was deleted, or intent.",
  };
  Object.keys(fileHashes).sort().forEach(function (n) { manifest.files[n] = { sha256: fileHashes[n] }; });
  manifest.files["manifest.json"] = { sha256: "self (see README.txt)" };
  manifest.files["manifest.sha256"] = { sha256: "self (see README.txt)" };
  contents["manifest.json"] = enc.encode(JSON.stringify(manifest, null, 2));
  fileHashes["manifest.json"] = await sha256Hex(contents["manifest.json"]);
  contents["manifest.sha256"] = enc.encode(Object.keys(fileHashes).sort().map(function (n) {
    return fileHashes[n] + "  " + n + "\n";
  }).join(""));
  const files = PACK_FILES.map(function (n) { return { name: n, data: contents[n] }; });
  const blob = new Blob([zipStore(files)], { type: "application/zip" });
  const stamp = meta.generated_at.replace(/[-:T]/g, "").slice(0, 14);
  const filename = "evidence_" + (meta.network || "pack") + "_" + (meta.identifier || "export") + "_" + stamp + ".zip";
  return { blob: blob, manifest: manifest, filename: filename };
}

/* --- Browser wiring --------------------------------------------------- */
function currentRecords() {
  if (typeof window !== "undefined" && window.WS_OSINT && window.WS_OSINT.diffRows && window.WS_OSINT.diffRows.length) {
    return window.WS_OSINT.diffRows.slice();
  }
  if (typeof window !== "undefined" && window.WS_CITATIONS) {
    const got = window.WS_CONSOLE ? window.WS_CONSOLE.getRows() : { rows: [], nets: [] };
    return window.WS_CITATIONS.recordsFromRows(got.rows, got.nets);
  }
  return [];
}
function licenceKey() {
  try { return localStorage.getItem("ws_licence") || ""; } catch (e) { return ""; }
}
async function onEvidenceClick(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  const records = currentRecords();
  if (!records.length) {
    showDlg("Nothing to pack yet", "Run a search, a batch, or a deleted diff first — the evidence pack is built from the results on screen.");
    return;
  }
  const LIC = window.WAYBACK_LICENCE;
  const caps = LIC.planCaps(currentTier());
  const EV = window.WS_EVIDENCE;
  if (EV) {
    const res = EV.logReport(localStorage, licenceKey(), caps.evidence_reports);
    if (!res.ok) {
      showDlg("Evidence pack unavailable", res.reason + " See pricing for the Studio pack (10 reports included) and the top-up for extra reports.");
      return;
    }
  } else if (caps.evidence_reports <= 0) {
    showDlg("Evidence packs are a Studio feature", "Your tier includes 0 reports. Studio ($49 launch) includes 10 evidence-pack reports — see Pricing below.");
    return;
  }
  const meta = (window.WS_OSINT && window.WS_OSINT.meta) || {};
  try {
    // Batch packs span many handles — the pack is named for the batch,
    // not for one handle (CDX rows carry no handle of their own).
    const pack = await buildEvidencePack(records, {
      network: meta.mode === "batch" ? "" : (records[0].network || ""),
      identifier: meta.mode === "batch" ? "batch" : (records[0].identifier || ""),
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(pack.blob);
    a.download = pack.filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
    showDlg("Evidence pack downloaded", pack.filename + " — " + pack.manifest.counts.records + " record(s)" +
      (pack.manifest.counts.deleted ? ", " + pack.manifest.counts.deleted + " deleted" : "") +
      ". Verify it with sha256sum -c manifest.sha256 after unzipping. The report was logged against your Studio pack (counted on this device).");
  } catch (e) {
    showDlg("Evidence pack could not be built", e.message);
  }
}
function initEvidencePack() {
  document.querySelectorAll(".evidence-pack-btn").forEach(function (b) {
    b.addEventListener("click", onEvidenceClick);
  });
}
(function init() {
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEvidencePack);
  } else {
    initEvidencePack();
  }
})();

if (typeof window !== "undefined") {
  // crc32 / zipStore live in zip-store.js (WS_ZIP_STORE); the pack
  // builder calls them as globals at runtime.
  window.WS_EVIDENCE_PACK = { buildEvidencePack: buildEvidencePack, sourceLabel: sourceLabel, sha256Hex: sha256Hex, PACK_FILES: PACK_FILES };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildEvidencePack: buildEvidencePack, sourceLabel: sourceLabel, sha256Hex: sha256Hex, PACK_FILES: PACK_FILES };
}
