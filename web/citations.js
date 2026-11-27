/* Citations (issue #13 follow-up) — the legal. subdomain's primary
 * mode. Builds a citable list from the search results already on
 * screen (a diff run's verdicts, or a plain search's captures):
 * archived URL, Wayback timestamp, snapshot link, live verdict,
 * retrieval date. Copy-pasteable text, downloadable .md / .csv.
 *
 * The triage disclaimer is part of every citation list, never an
 * optional extra: "Triage, not court-ready. Found ≠ guilty. Not
 * found ≠ not real." A citation proves a post existed on the
 * archived date — not who wrote it, why it was deleted, or intent.
 * Live verdicts are best-effort (unknown = login-walled or errored,
 * never "deleted"). A citation without a live check says so plainly
 * ("live status not checked").
 *
 * No build step. Browser + Node for the pure builders
 * (module.exports guard at the bottom). No CLI text anywhere.
 */
"use strict";

var CITATION_DISCLAIMER = "Triage, not court-ready. Public archived posts only. " +
  "Found ≠ guilty. Not found ≠ not real. A citation proves a post existed " +
  "on the archived date — not who wrote it, why it was deleted, or intent. " +
  "Verify each snapshot yourself at the archive that captured it " +
  "(web.archive.org or arquivo.pt) before relying on it in a filing.";

function fmtDate(ts) {
  if (!ts || ts.length < 8) return ts || "";
  return ts.slice(0, 4) + "-" + ts.slice(4, 6) + "-" + ts.slice(6, 8) +
    (ts.length >= 12 ? " " + ts.slice(8, 10) + ":" + ts.slice(10, 12) + " UTC" : "");
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function verdictLabel(r) {
  if (!r.live_verdict) return "live status not checked";
  if (r.live_verdict === "live") return "live";
  if (r.live_verdict === "deleted") return "deleted";
  return "unknown (login-walled or errored — not counted as deleted)";
}

// CDX row arrays (console.js lastRows) -> citation records.
// One record per URL: when the same post was captured twice, the
// LATEST capture replaces the earlier one (a citation cites the
// newest snapshot of that post, not a duplicate of it).
// `sources` is console.js's per-row source ("wayback" | "arquivo");
// optional — callers without it (diff rows, older tests) default to
// Wayback, which is what those rows are.
function recordsFromRows(rows, nets, sources) {
  const at = {}, out = [];
  const linkFor = (typeof window !== "undefined" && window.WS_CONSOLE && window.WS_CONSOLE.archiveLink)
    ? function (src, ts, orig) { return window.WS_CONSOLE.archiveLink(src, ts, orig); }
    : function (src, ts, orig) {
        return src === "arquivo"
          ? "https://arquivo.pt/wayback/" + ts + "/" + orig
          : "https://web.archive.org/web/" + ts + "/" + orig;
      };
  (rows || []).forEach(function (r, i) {
    const orig = r[2], ts = r[1];
    if (!orig || !ts) return;
    const src = (sources && sources[i]) || "wayback";
    const rec = {
      network: (nets && nets[i]) || "", identifier: "",
      post_id: "", archived_timestamp: ts, original_post_url: orig,
      source: src, archived_post_url: linkFor(src, ts, orig),
      archived_statuscode: r[4] || "", archived_mimetype: r[3] || "",
      live_verdict: "", live_http_status: "", live_checked_at: "",
    };
    if (at[orig] == null) { at[orig] = out.length; out.push(rec); }
    else if (ts > out[at[orig]].archived_timestamp) { out[at[orig]] = rec; }
  });
  out.sort(function (a, b) { return a.archived_timestamp.localeCompare(b.archived_timestamp); });
  return out;
}

function sourceSuffix(r) {
  return r.source === "arquivo" ? " — source: Arquivo.pt" : "";
}

function citeLine(i, r) {
  const when = fmtDate(r.archived_timestamp);
  const who = r.identifier ? "@" + r.identifier : (r.network || "archived post");
  return "[" + (i + 1) + "] " + who + " on " + (r.network || "unknown network") +
    " — " + r.original_post_url + " — archived " + when +
    " — snapshot: " + r.archived_post_url + sourceSuffix(r) +
    " — live: " + verdictLabel(r) +
    (r.live_checked_at ? " (checked " + r.live_checked_at.slice(0, 10) + ")" : "") + ".";
}

function buildCitationText(records, meta) {
  meta = meta || {};
  const head = "Citation list — retrieved " + today() + ".\n" +
    CITATION_DISCLAIMER + "\n" +
    (meta.query ? "Query: " + meta.query + "\n" : "") +
    (meta.counts ? meta.counts + "\n" : "") + "\n";
  return head + records.map(function (r, i) { return citeLine(i, r); }).join("\n") + "\n";
}

function buildCitationMarkdown(records, meta) {
  meta = meta || {};
  const head = "# Citation list — retrieved " + today() + "\n\n" +
    "> " + CITATION_DISCLAIMER + "\n\n" +
    (meta.query ? "Query: " + meta.query + "\n\n" : "") +
    (meta.counts ? meta.counts + "\n\n" : "");
  const lines = records.map(function (r, i) {
    const when = fmtDate(r.archived_timestamp);
    const who = r.identifier ? "@" + r.identifier : (r.network || "archived post");
    return (i + 1) + ". **" + who + "** on " + (r.network || "unknown network") +
      " — [" + r.original_post_url + "](" + r.original_post_url + ")" +
      " — archived " + when +
      " — [snapshot](" + r.archived_post_url + ")" + sourceSuffix(r) +
      " — live: **" + verdictLabel(r) + "**" +
      (r.live_checked_at ? " (checked " + r.live_checked_at.slice(0, 10) + ")" : "");
  });
  return head + lines.join("\n") + "\n";
}

function csvCell(v) { return "\"" + String(v == null ? "" : v).replace(/"/g, "\"\"") + "\""; }
function buildCitationCsv(records) {
  const head = "network,identifier,post_id,archived_timestamp,original_post_url,archived_post_url,live_verdict,live_http_status,live_checked_at,retrieved_at\n";
  const body = records.map(function (r) {
    return [r.network, r.identifier, r.post_id, r.archived_timestamp, r.original_post_url,
      r.archived_post_url, r.live_verdict || "not checked", r.live_http_status,
      r.live_checked_at, today()].map(csvCell).join(",");
  }).join("\n");
  return head + body + "\n";
}

/* --- Browser wiring --------------------------------------------------- */
function currentRecords() {
  // A diff run's rows (with verdicts) win; otherwise the plain
  // search's rows on screen.
  if (typeof window !== "undefined" && window.WS_OSINT && window.WS_OSINT.diffRows && window.WS_OSINT.diffRows.length) {
    return window.WS_OSINT.diffRows.slice();
  }
  if (typeof window !== "undefined" && window.WS_CONSOLE) {
    const got = window.WS_CONSOLE.getRows();
    return recordsFromRows(got.rows, got.nets, got.sources);
  }
  return [];
}

async function buildCitations() {
  const out = $("cite-output");
  const records = currentRecords();
  if (!records.length) {
    if (out) out.value = "No results on screen yet — run a search or a deleted diff first, then build the citation list.";
    $("cite-status").textContent = "Nothing to cite yet.";
    return;
  }
  let verdictsNote = "";
  if ($("cite-live").checked) {
    $("cite-status").textContent = "Checking live status for " + records.length + " post(s)…";
    const verdicts = await window.WS_LIVE_CHECK.checkLive(records.map(function (r) { return r.original_post_url; }));
    records.forEach(function (r) {
      const v = verdicts.get(r.original_post_url) || {};
      r.live_verdict = v.live_verdict || "unknown";
      r.live_http_status = v.live_http_status || "";
      r.live_checked_at = v.live_checked_at || "";
    });
    verdictsNote = "Live verdicts included (checked just now).";
  }
  const counts = records.length + " post(s) cited. " + verdictsNote;
  const md = buildCitationMarkdown(records, { counts: counts });
  if (out) out.value = buildCitationText(records, { counts: counts });
  $("cite-status").textContent = counts + " Copy the text, or download the .md / .csv.";
  $("cite-actions").hidden = false;
  window.WS_CITATIONS_LAST = { records: records, markdown: md };
}

function initCitations() {
  const go = $("cite-build");
  if (go) go.addEventListener("click", buildCitations);
  const copy = $("cite-copy");
  if (copy) copy.addEventListener("click", function () {
    const out = $("cite-output");
    if (!out || !out.value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(out.value).then(function () {
        $("cite-status").textContent = "Citation list copied to the clipboard.";
      });
    } else {
      out.select();
      try { document.execCommand("copy"); } catch (e) {}
    }
  });
  const md = $("cite-md");
  if (md) md.addEventListener("click", function () {
    const last = window.WS_CITATIONS_LAST;
    if (last) download("archivecheck-citations.md", last.markdown, "text/markdown");
  });
  const csv = $("cite-csv");
  if (csv) csv.addEventListener("click", function () {
    const last = window.WS_CITATIONS_LAST;
    if (last) download("archivecheck-citations.csv", buildCitationCsv(last.records), "text/csv");
  });
}

(function init() {
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCitations);
  } else {
    initCitations();
  }
})();

if (typeof window !== "undefined") {
  window.WS_CITATIONS = { buildCitationText: buildCitationText, buildCitationMarkdown: buildCitationMarkdown, buildCitationCsv: buildCitationCsv, recordsFromRows: recordsFromRows, CITATION_DISCLAIMER: CITATION_DISCLAIMER };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildCitationText: buildCitationText, buildCitationMarkdown: buildCitationMarkdown, buildCitationCsv: buildCitationCsv, recordsFromRows: recordsFromRows, CITATION_DISCLAIMER: CITATION_DISCLAIMER };
}
