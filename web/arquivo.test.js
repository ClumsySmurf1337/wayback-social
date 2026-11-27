/* Node test — Arquivo.pt as a web source (issue #8 follow-up).
 * Search behaviour: wiring, Arquivo-only, Both merge/dedup, one
 * source failing, stalled-fetch timeout. The licence tier comes
 * from the REAL licence.js (planCaps) via localStorage, so the
 * keyword_search gate is tested against the same caps the page uses.
 * Fixtures + context live in web/arquivo-ctx.js (Track K);
 * this file keeps only its check() helpers + blocks.
 * Run:  node web/arquivo.test.js
 */
"use strict";
const C = require("./arquivo-ctx.js");
const { makeCtx, routeBoth, hangFetch, HEADER, W_ROW1, A_ROW2, CDX_BODY, ARQ_BODY, A_ROW_X, A_ROW_WWW, A_ROW_X_LATER } = C;

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
  // --- wiring: WS_ARQUIVO exposes the patterns + links --------------
  {
    const ctx = makeCtx();
    const AQ = ctx.sandbox.window.WS_ARQUIVO;
    check("WS_ARQUIVO loads", typeof AQ, "object");
    check("patternsFor(x) has the status pattern",
      AQ.patternsFor("x"), ["twitter.com/{id}/status/*"]);
    check("patternsFor(instagram) has no per-handle pattern",
      AQ.patternsFor("instagram"), null);
    check("archiveLink(arquivo) points at arquivo.pt",
      AQ.archiveLink("arquivo", "20230101120000", "https://twitter.com/jack/status/1"),
      "https://arquivo.pt/wayback/20230101120000/https://twitter.com/jack/status/1");
    check("archiveLink(wayback) points at web.archive.org",
      AQ.archiveLink("wayback", "20230101120000", "https://twitter.com/jack/status/1"),
      "https://web.archive.org/web/20230101120000/https://twitter.com/jack/status/1");
    check("source selector defaults to Wayback",
      ctx.els["source"].value, "wayback");
  }

  // --- Arquivo-only search: rows labelled Arquivo.pt -----------------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "arquivo" });
    ctx.setFetch(routeBoth());
    await ctx.sandbox.search(false);
    check("arquivo-only finds 2 captures", ctx.status().includes("Found 2 capture(s)"), true);
    checkHas("arquivo-only status shows per-source counts", ctx.status(), "Wayback: 0 · Arquivo.pt: 2");
    check("arquivo-only renders 2 rows", ctx.renderedRows(), 2);
    check("arquivo-only row sources are arquivo",
      ctx.getRows().sources, ["arquivo", "arquivo"]);
    checkHas("arquivo-only snapshot links point at arquivo.pt",
      ctx.renderedHtml(), "arquivo.pt/wayback/20230101120000/");
    check("arquivo-only table shows no Wayback link",
      ctx.renderedHtml().includes("web.archive.org"), false);
    checkHas("arquivo-only rows carry the Arquivo.pt label",
      ctx.renderedHtml(), "Arquivo.pt");
    check("arquivo-only calls /api/arquivo, not /api/cdx",
      ctx.fetchCalls.filter((u) => u.includes("/api/cdx")).length, 0);
  }

  // --- Both: merges + dedups, Wayback wins the tie -------------------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "both" });
    ctx.setFetch(routeBoth());
    await ctx.sandbox.search(false);
    check("both finds 3 captures (dup merged)", ctx.status().includes("Found 3 capture(s)"), true);
    checkHas("both status shows per-source counts", ctx.status(), "Wayback: 2 · Arquivo.pt: 1");
    check("both renders 3 rows", ctx.renderedRows(), 3);
    check("both row sources: Wayback wins the shared capture",
      ctx.getRows().sources, ["wayback", "wayback", "arquivo"]);
    check("both fetched both proxies",
      ctx.fetchCalls.filter((u) => u.includes("/api/arquivo")).length >= 1 &&
      ctx.fetchCalls.filter((u) => u.includes("/api/cdx")).length >= 1, true);
  }

  // --- Both + x.com alias: same capture dedupes to one row --------
  // Arquivo.pt stores the W_ROW1 capture under x.com; Wayback stores
  // it under twitter.com. Same post, same timestamp: one row,
  // Wayback winning the tie (it runs first).
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "both" });
    ctx.setFetch(async (url) => {
      const u = String(url);
      if (u.includes("/api/arquivo")) return { ok: true, json: async () => [HEADER, A_ROW_X] };
      if (u.includes("/api/cdx")) return { ok: true, json: async () => CDX_BODY };
      throw new Error("unexpected fetch: " + u);
    });
    await ctx.sandbox.search(false);
    check("both + x.com alias finds 2 captures (alias merged)", ctx.status().includes("Found 2 capture(s)"), true);
    check("both + x.com alias renders 2 rows", ctx.renderedRows(), 2);
    check("both + x.com alias: Wayback wins the shared capture",
      ctx.getRows().sources, ["wayback", "wayback"]);
    check("both + x.com alias keeps only the twitter.com URL",
      ctx.getRows().rows.map((r) => r[2]), ["https://twitter.com/jack/status/1", "https://twitter.com/jack/status/2"]);
  }

  // --- Both + www alias + later x.com capture ------------------------
  // www.twitter.com is the same capture as W_ROW1 (dedupes); the
  // x.com row at a LATER timestamp is a separate capture (stays).
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "both" });
    ctx.setFetch(async (url) => {
      const u = String(url);
      if (u.includes("/api/arquivo")) return { ok: true, json: async () => [HEADER, A_ROW_WWW, A_ROW_X_LATER] };
      if (u.includes("/api/cdx")) return { ok: true, json: async () => CDX_BODY };
      throw new Error("unexpected fetch: " + u);
    });
    await ctx.sandbox.search(false);
    check("both + www alias finds 3 captures (www merged, later stays)", ctx.status().includes("Found 3 capture(s)"), true);
    check("both + www alias renders 3 rows", ctx.renderedRows(), 3);
    check("both + www alias row sources",
      ctx.getRows().sources, ["wayback", "wayback", "arquivo"]);
    check("both + www alias keeps the later x.com capture",
      ctx.getRows().rows[2][2], "https://x.com/jack/status/1");
  }
  // --- one source failing leaves the other standing ------------------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "both" });
    ctx.setFetch(async (url) => {
      if (String(url).includes("/api/arquivo")) {
        return { ok: false, status: 500, json: async () => ({ error: "Arquivo.pt answered HTTP 500" }) };
      }
      return { ok: true, json: async () => CDX_BODY };
    });
    await ctx.sandbox.search(false);
    check("arquivo 500 still shows Wayback rows", ctx.status().includes("Found 2 capture(s)"), true);
    check("arquivo 500 renders 2 rows", ctx.renderedRows(), 2);
    checkHas("arquivo 500 names the failed source", ctx.status(), "Arquivo.pt didn't answer");
    check("arquivo 500 does not show the failure actions", ctx.failHidden(), true);
  }

  // --- stalled Arquivo.pt fetch times out honestly --------------------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "arquivo" });
    ctx.sandbox.window.WS_FETCH_TIMEOUT_MS = 50;
    ctx.setFetch(hangFetch);
    const t0 = Date.now();
    await ctx.sandbox.search(false);
    const elapsed = Date.now() - t0;
    check("stalled arquivo search finishes promptly (ms)", elapsed < 5000, true);
    checkHas("stalled arquivo status says it didn't answer in time",
      ctx.status(), "didn't answer in time");
    check("stalled arquivo shows the failure actions (retry)", ctx.failHidden(), false);
    check("stalled arquivo renders no rows", ctx.renderedRows(), 0);
    checkHas("stalled arquivo direct link goes to arquivo.pt, not Wayback",
      ctx.cdxLink(), "arquivo.pt/wayback/cdx");
  }
  console.log(failures === 0
    ? `\narquivo.test.js: ${checks} checks passed`
    : `\narquivo.test.js: ${failures}/${checks} checks FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
