/* Node test for the osint research tools (issue #13 follow-up):
 *   web/batch.js      — parseTargets, postKey, dedupePosts
 *   web/citations.js  — citation builders (text / markdown / csv)
 *   web/evidence-pack.js — CRC32, stored ZIP, SHA-256 manifest
 *   web/licence.js    — deleted_diff caps (free: no diff, paid: diff)
 * Run:  node web/osint-tools.test.js
 * The browser wiring (tabs, routing, gating dialogs, downloads) is
 * covered by tests/e2e/test_osint_tools.py in a real browser.
 */
"use strict";
const { parseTargets } = require("./batch.js");
const { postKey, dedupePosts } = require("./diff.js");
const { buildCitationText, buildCitationMarkdown, buildCitationCsv,
  recordsFromRows, CITATION_DISCLAIMER } = require("./citations.js");
const { buildEvidencePack, PACK_FILES } = require("./evidence-pack.js");
const { crc32, zipStore } = require("./zip-store.js"); // extracted from evidence-pack.js
const LIC = require("./licence.js");

let failures = 0, checks = 0;
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
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  " + (ok ? "contains " + JSON.stringify(needle) : "MISSING " + JSON.stringify(needle)));
}

// batch.js needs NETWORKS at call time (parseTargets reads it).
globalThis.NETWORKS = {
  x: { name: "X", patterns: ["x.com/*"] },
  instagram: { name: "Instagram", patterns: ["instagram.com/*"] },
  bluesky: { name: "Bluesky", patterns: ["bsky.app/*"] },
};

(async () => {
  // --- parseTargets -------------------------------------------------------
  let p = parseTargets("x jack\ninstagram nasa\n# a comment\n\nbluesky bsky.app\n");
  check("batch parses three targets", p.targets, [
    { net: "x", id: "jack" }, { net: "instagram", id: "nasa" }, { net: "bluesky", id: "bsky.app" }]);
  check("batch ignores comments/blanks", p.errors, []);
  p = parseTargets("x @jack\nbogus handle\nx\n");
  check("@ stripped from handle", p.targets, [{ net: "x", id: "jack" }]);
  check("unknown network + bare network reported, not fatal", p.errors.length, 2);
  check("unknown network named in error", p.errors[0].includes("bogus"), true);

  // --- postKey ------------------------------------------------------------
  check("x status -> post key", postKey("x", "https://x.com/jack/status/20"), "x:20");
  check("x profile -> null (not a post)", postKey("x", "https://x.com/jack"), null);
  check("instagram reel -> post key", postKey("instagram", "https://www.instagram.com/reel/AbC123/"), "instagram:AbC123");
  check("instagram profile -> null", postKey("instagram", "https://www.instagram.com/nasa/"), null);
  check("youtube watch -> post key", postKey("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "youtube:dQw4w9WgXcQ");
  check("youtube channel -> null", postKey("youtube", "https://www.youtube.com/@SomeChannel"), null);
  check("tiktok video -> post key", postKey("tiktok", "https://www.tiktok.com/@a/video/1234567890"), "tiktok:1234567890");

  // --- dedupePosts --------------------------------------------------------
  const rows = [
    ["x", "20200101000000", "https://x.com/jack/status/20", "text/html", "200", "", ""],
    ["x", "20210101000000", "https://x.com/jack/status/20", "text/html", "200", "", ""],
    ["x", "20210101000000", "https://x.com/jack", "text/html", "200", "", ""],
    ["x", "20220101000000", "https://x.com/jack/status/21", "text/html", "200", "", ""],
  ];
  const d = dedupePosts(rows, "x", "jack");
  check("dedupe keeps one row per post", d.posts.length, 2);
  check("dedupe keeps the LATEST capture", d.posts[0].archived_timestamp, "20210101000000");
  check("dedupe remembers the FIRST capture", d.posts[0].first_archived_timestamp, "20200101000000");
  check("dedupe counts the profile row as skipped", d.skipped, 1);
  check("dedupe builds the snapshot link", d.posts[0].archived_post_url,
    "https://web.archive.org/web/20210101000000/https://x.com/jack/status/20");

  // --- citations ----------------------------------------------------------
  const recs = d.posts.map((x) => ({ ...x, live_verdict: "deleted", live_http_status: "404", live_checked_at: "2026-11-27T00:00:00Z" }));
  const txt = buildCitationText(recs, { query: "x jack" });
  checkHas("text citation carries the snapshot link", txt, "web.archive.org/web/20210101000000/https://x.com/jack/status/20");
  checkHas("text citation carries the verdict", txt, "live: deleted");
  checkHas("text citation carries the disclaimer", txt, "Triage, not court-ready");
  checkHas("text citation carries the retrieval date", txt, "Citation list — retrieved ");
  const md = buildCitationMarkdown(recs, {});
  checkHas("markdown citation links the snapshot", md, "[snapshot](https://web.archive.org/web/20210101000000/https://x.com/jack/status/20)");
  checkHas("markdown citation keeps the disclaimer", md, "Found ≠ guilty");
  const csv = buildCitationCsv(recs);
  checkHas("csv citation has the verdict column", csv, "live_verdict");
  checkHas("csv citation has the deleted verdict", csv, "deleted");
  const fromRows = recordsFromRows(rows, ["x", "x", "x", "x"]);
  check("recordsFromRows dedupes by URL (latest wins)", fromRows.length, 3);
  // status/20's 2020 capture is superseded by its 2021 capture, so
  // the oldest remaining record is 2021, not 2020.
  check("recordsFromRows sorts oldest first", fromRows[0].archived_timestamp, "20210101000000");
  check("recordsFromRows keeps the latest capture of a URL", fromRows.find(function (r) { return r.original_post_url.includes("status/20"); }).archived_timestamp, "20210101000000");
  check("disclaimer constant mentions court", CITATION_DISCLAIMER.includes("not court-ready"), true);

  // --- licence caps: the deleted-diff gate -------------------------------
  check("free tier has no deleted diff", LIC.planCaps("free").deleted_diff, false);
  check("starter tier has deleted diff", LIC.planCaps("starter").deleted_diff, true);
  check("pro tier has deleted diff", LIC.planCaps("pro").deleted_diff, true);
  check("studio tier has deleted diff", LIC.planCaps("studio").deleted_diff, true);
  check("bundle has deleted diff", LIC.planCaps("bundle").deleted_diff, true);
  check("free tier has 0 evidence reports", LIC.planCaps("free").evidence_reports, 0);
  check("studio tier has 10 evidence reports", LIC.planCaps("studio").evidence_reports, 10);

  // --- CRC32 (known vectors) ---------------------------------------------
  const enc = new TextEncoder();
  check("crc32 empty", crc32(new Uint8Array(0)), 0);
  check("crc32 '123456789'", crc32(enc.encode("123456789")), 0xCBF43926);

  // --- evidence pack: build, unzip, verify --------------------------------
  const packRecs = [{
    network: "x", identifier: "jack", post_id: "20",
    archived_timestamp: "20210101000000",
    original_post_url: "https://x.com/jack/status/20",
    archived_post_url: "https://web.archive.org/web/20210101000000/https://x.com/jack/status/20",
    archived_statuscode: "200", archived_mimetype: "text/html",
    live_verdict: "deleted", live_http_status: "404", live_checked_at: "2026-11-27T00:00:00Z",
  }, {
    network: "x", identifier: "jack", post_id: "21",
    archived_timestamp: "20220101000000",
    original_post_url: "https://x.com/jack/status/21",
    archived_post_url: "https://web.archive.org/web/20220101000000/https://x.com/jack/status/21",
    archived_statuscode: "200", archived_mimetype: "text/html",
    live_verdict: "live", live_http_status: "200", live_checked_at: "2026-11-27T00:00:00Z",
  }];
  const pack = await buildEvidencePack(packRecs, {});
  check("pack is a zip blob", pack.blob.type, "application/zip");
  check("pack filename names network + handle", pack.filename.startsWith("evidence_x_jack_"), true);
  check("pack manifest counts records", pack.manifest.counts.records, 2);
  check("pack manifest counts deleted", pack.manifest.counts.deleted, 1);
  check("pack manifest counts live", pack.manifest.counts.live, 1);
  check("pack manifest names the tool version", pack.manifest.tool_version, "1.5.0");
  check("pack manifest carries the ethics line", pack.manifest.ethics.includes("Public archived posts only"), true);

  // Minimal stored-ZIP reader: walk local headers, verify CRCs + sizes.
  const zip = new Uint8Array(await pack.blob.arrayBuffer());
  check("zip starts with PK", String.fromCharCode(zip[0], zip[1]), "PK");
  const files = {};
  let off = 0;
  while (off + 30 <= zip.length && zip[off] === 0x50 && zip[off + 1] === 0x4B && zip[off + 2] === 3 && zip[off + 3] === 4) {
    const method = zip[off + 8] | (zip[off + 9] << 8);
    const crc = (zip[off + 14] | (zip[off + 15] << 8) | (zip[off + 16] << 16) | (zip[off + 17] << 24)) >>> 0;
    const csize = zip[off + 18] | (zip[off + 19] << 8) | (zip[off + 20] << 16) | (zip[off + 21] << 24);
    const nlen = zip[off + 26] | (zip[off + 27] << 8);
    const elen = zip[off + 28] | (zip[off + 29] << 8);
    const name = new TextDecoder().decode(zip.slice(off + 30, off + 30 + nlen));
    const data = zip.slice(off + 30 + nlen + elen, off + 30 + nlen + elen + csize);
    check("zip entry " + name + " is stored (method 0)", method, 0);
    check("zip entry " + name + " CRC matches", crc32(data), crc);
    files[name] = data;
    off += 30 + nlen + elen + csize;
  }
  check("zip holds all 7 pack files", Object.keys(files).sort(), PACK_FILES.slice().sort());
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  const crypto = globalThis.crypto;
  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => ("0" + b.toString(16)).slice(-2)).join("");
  }
  for (const name of ["report.html", "captures.csv", "captures.json", "captures.jsonl", "README.txt"]) {
    const actual = await sha256Hex(files[name]);
    check("manifest.json hash matches " + name, manifest.files[name].sha256, actual);
  }
  const shaList = new TextDecoder().decode(files["manifest.sha256"]).trim().split("\n");
  check("manifest.sha256 lists every hashed file", shaList.length, 6);
  checkHas("manifest.sha256 line format is sha256sum-style", shaList.join("\n"), "  report.html");
  checkHas("report.html names the post", new TextDecoder().decode(files["report.html"]), "https://x.com/jack/status/20");
  checkHas("report.html states what the pack proves", new TextDecoder().decode(files["report.html"]), "What this proves");
  checkHas("captures.csv has the verdict columns", new TextDecoder().decode(files["captures.csv"]), "live_verdict");
  checkHas("README.txt explains verification", new TextDecoder().decode(files["README.txt"]), "sha256sum -c manifest.sha256");

  // Empty records -> honest error, never an empty pack.
  let threw = false;
  try { await buildEvidencePack([], {}); } catch (e) { threw = true; }
  check("empty records -> error, not an empty pack", threw, true);

  console.log("\n" + checks + " checks, " + failures + " failure(s)");
  process.exit(failures ? 1 : 0);
})();
