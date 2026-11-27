/* wayback-social web console — Arquivo.pt response parsing.
 * Pure functions shared by web/arquivo.js (browser) and the node
 * tests. Loaded BEFORE arquivo.js (which calls these bare globals).
 * The same normalization also lives server-side in
 * functions/api/arquivo.js — the two copies are kept in sync by
 * hand (the Function cannot import from web/; see that file's
 * header). No build step. No DOM, no network here.
 */

// Arquivo.pt CDX stores doubled slashes
// (twitter.com//jack//status//20) — same fix as
// wayback_social/arquivo.py _to_record.
function normalizeArquivoUrl(url) {
  return String(url || "").replace(/(?<!:)\/{2,}/g, "/");
}

function inArquivoRange(ts, from, to) {
  var d = String(ts || "").slice(0, 8);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// One Arquivo.pt CDX JSONL row (dict) -> a CDX-array row, or null.
function cdxRowToArray(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  var url = normalizeArquivoUrl(row.url || "");
  var ts = String(row.timestamp || "");
  if (!url || !ts) return null;
  return [row.urlkey || "", ts, url, row.mime || "",
    String(row.status || ""), row.digest || "", String(row.length || "")];
}

// Parse the proxy's answer: a JSON array with a header row first
// (the same shape as /api/cdx, so the client parses both the same
// way). Returns CDX-array rows (no header).
function parseArquivoCdxArray(data) {
  if (!Array.isArray(data)) throw new Error("Arquivo.pt answered with an unexpected format");
  return data.slice(1).filter(function (r) { return Array.isArray(r) && r.length >= 7; });
}

// Parse a direct CDX answer: JSONL, one JSON object per line.
function parseArquivoJsonl(text) {
  var rows = [];
  String(text || "").split("\n").forEach(function (line) {
    var trimmed = line.trim();
    if (!trimmed) return;
    var row = null;
    try { row = JSON.parse(trimmed); } catch (e) { return; }
    var arr = cdxRowToArray(row);
    if (arr) rows.push(arr);
  });
  return rows;
}

// Parse a direct textsearch answer: {response_items: [...]}.
// Filters to URLs containing the handle (URL match, not
// authorship) and maps each item to a CDX-array row.
function parseArquivoKeyword(data, handle) {
  var items = (data && Array.isArray(data.response_items)) ? data.response_items : [];
  var needle = String(handle || "").toLowerCase();
  var rows = [];
  items.forEach(function (item) {
    if (!item || typeof item !== "object") return;
    var url = normalizeArquivoUrl(item.originalURL || "");
    if (needle && url.toLowerCase().indexOf(needle) < 0) return;
    var ts = String(item.tstamp || "");
    if (!url || !ts) return;
    rows.push(["", ts, url, item.mimeType || "",
      String(item.status || ""), item.digest || "", ""]);
  });
  rows.sort(function (a, b) { return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; });
  return rows;
}

if (typeof window !== "undefined") {
  window.WS_ARQUIVO_PARSE = {
    normalizeArquivoUrl: normalizeArquivoUrl,
    inArquivoRange: inArquivoRange,
    cdxRowToArray: cdxRowToArray,
    parseArquivoCdxArray: parseArquivoCdxArray,
    parseArquivoJsonl: parseArquivoJsonl,
    parseArquivoKeyword: parseArquivoKeyword,
  };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeArquivoUrl: normalizeArquivoUrl,
    inArquivoRange: inArquivoRange,
    cdxRowToArray: cdxRowToArray,
    parseArquivoCdxArray: parseArquivoCdxArray,
    parseArquivoJsonl: parseArquivoJsonl,
    parseArquivoKeyword: parseArquivoKeyword,
  };
}
