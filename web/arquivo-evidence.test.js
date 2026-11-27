/* Node test — Arquivo.pt in citations + evidence packs (issue #8 follow-up).
 * Downstream consumers keep the source: citations link arquivo.pt
 * for Arquivo.pt rows (Wayback rows unchanged), and the evidence
 * pack manifest / report / README name both archives.
 * Fixtures + context live in web/arquivo-ctx.js (Track K);
 * this file keeps only its check() helpers + blocks.
 * Run:  node web/arquivo-evidence.test.js
 */
"use strict";
const C = require("./arquivo-ctx.js");
const { makeCtx, routeBoth, hangFetch, W_ROW1, A_ROW2, CDX_BODY, ARQ_BODY } = C;

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  " + JSON.stringify(actual) +
    (ok ? "" : "  (expected " + JSON.stringify(expected) + ")"));
}
function checkHas(label, haystack, needle) {
  checks += 1;
  const ok = String(haystack).includes(needle);
  if (!ok) failures += 1;
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  contains " + JSON.stringify(needle) +
    (ok ? "" : "  (in " + JSON.stringify(String(haystack).slice(0, 200)) + ")"));
}

async function main() {
  // --- citations: Arquivo.pt rows cite arquivo.pt ---------------------
  {
    const { recordsFromRows, buildCitationText } = require("./citations.js");
    const rows = [W_ROW1, A_ROW2];
    const recs = recordsFromRows(rows, ["x", "x"], ["wayback", "arquivo"]);
    check("citation record keeps the source", recs.map((r) => r.source), ["wayback", "arquivo"]);
    check("arquivo citation links arquivo.pt",
      recs[1].archived_post_url,
      "https://arquivo.pt/wayback/20230301120000/https://twitter.com/jack/status/3");
    check("wayback citation still links web.archive.org",
      recs[0].archived_post_url,
      "https://web.archive.org/web/20230101120000/https://twitter.com/jack/status/1");
    checkHas("citation text names the Arquivo.pt source",
      buildCitationText(recs, {}), "source: Arquivo.pt");
    // No sources passed (diff rows, older callers): defaults Wayback.
    const legacy = recordsFromRows([W_ROW1], ["x"]);
    check("recordsFromRows without sources defaults to Wayback",
      legacy[0].source, "wayback");
  }

  // --- evidence pack: mixed sources named in the manifest ------------
  {
    const { buildEvidencePack } = require("./evidence-pack.js");
    const records = [
      { network: "x", identifier: "jack", post_id: "", archived_timestamp: "20230101120000",
        original_post_url: "https://twitter.com/jack/status/1",
        archived_post_url: "https://web.archive.org/web/20230101120000/https://twitter.com/jack/status/1",
        source: "wayback", archived_statuscode: "200", archived_mimetype: "text/html",
        live_verdict: "", live_http_status: "", live_checked_at: "" },
      { network: "x", identifier: "jack", post_id: "", archived_timestamp: "20230301120000",
        original_post_url: "https://twitter.com/jack/status/3",
        archived_post_url: "https://arquivo.pt/wayback/20230301120000/https://twitter.com/jack/status/3",
        source: "arquivo", archived_statuscode: "200", archived_mimetype: "text/html",
        live_verdict: "", live_http_status: "", live_checked_at: "" },
    ];
    const pack = await buildEvidencePack(records, { network: "x", identifier: "jack" });
    check("mixed pack manifest names both archives",
      pack.manifest.source, "Wayback Machine CDX API + Arquivo.pt");
    check("mixed pack filename is a zip", pack.filename.endsWith(".zip"), true);
    // Minimal stored-ZIP reader (same shape as osint-tools.test.js):
    // walk local headers and pull out report.html + README.txt.
    const zip = new Uint8Array(await pack.blob.arrayBuffer());
    const files = {};
    let off = 0;
    while (off + 30 <= zip.length && zip[off] === 0x50 && zip[off + 1] === 0x4B && zip[off + 2] === 3 && zip[off + 3] === 4) {
      const csize = zip[off + 18] | (zip[off + 19] << 8) | (zip[off + 20] << 16) | (zip[off + 21] << 24);
      const nlen = zip[off + 26] | (zip[off + 27] << 8);
      const elen = zip[off + 28] | (zip[off + 29] << 8);
      const name = new TextDecoder().decode(zip.slice(off + 30, off + 30 + nlen));
      files[name] = zip.slice(off + 30 + nlen + elen, off + 30 + nlen + elen + csize);
      off += 30 + nlen + elen + csize;
    }
    const report = new TextDecoder().decode(files["report.html"]);
    const readme = new TextDecoder().decode(files["README.txt"]);
    checkHas("mixed pack report names Arquivo.pt", report, "Arquivo.pt");
    checkHas("mixed pack report still names the Wayback Machine", report, "Wayback Machine CDX API");
    checkHas("mixed pack README names both archives", readme, "Wayback Machine CDX API + Arquivo.pt");
    const manifestInZip = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    check("mixed pack manifest in the zip names both archives",
      manifestInZip.source, "Wayback Machine CDX API + Arquivo.pt");
    // The pack CSV keeps its schema; the source rides on the URL host.
    const csv = new TextDecoder().decode(files["captures.csv"]);
    checkHas("mixed pack CSV has the arquivo.pt snapshot link", csv, "arquivo.pt/wayback/20230301120000/");
    const jsonl = new TextDecoder().decode(files["captures.jsonl"]);
    checkHas("mixed pack JSONL carries the per-record source", jsonl, "\"source\":\"arquivo\"");
  }
  console.log(failures === 0
    ? `\narquivo-evidence.test.js: ${checks} checks passed`
    : `\narquivo-evidence.test.js: ${failures}/${checks} checks FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
