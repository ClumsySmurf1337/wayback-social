/* Node test — Arquivo.pt gating (keyword + networks) (issue #8 follow-up).
 * Tier + network gates: keyword search is Pro-gated exactly like
 * the CLI (free blocked before any fetch, Pro passes mode=keyword),
 * unsupported networks fail honestly without a fetch, and the
 * licence caps mirror the CLI tiers.
 * Fixtures + context live in web/arquivo-ctx.js (Track K);
 * this file keeps only its check() helpers + blocks.
 * Run:  node web/arquivo-gates.test.js
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
  // --- keyword blocked on free tier (same gate as the CLI) -----------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "arquivo", keyword: "twttr" }); // free tier
    ctx.setFetch(routeBoth());
    await ctx.sandbox.search(false);
    check("keyword on free shows the Pro dialog", ctx.dlgTitle(), "Keyword search needs Pro");
    check("keyword on free runs no fetch", ctx.fetchCalls.length, 0);
    check("keyword on free renders no rows", ctx.renderedRows(), 0);
  }

  // --- keyword works on Pro ------------------------------------------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "arquivo", keyword: "twttr", tier: "pro" });
    ctx.setFetch(async (url) => {
      const u = new URL(String(url));
      if (u.pathname.includes("/api/arquivo")) {
        check("keyword fetch uses mode=keyword", u.searchParams.get("mode"), "keyword");
        check("keyword fetch passes the keyword", u.searchParams.get("q"), "twttr");
        check("keyword fetch passes the handle", u.searchParams.get("handle"), "jack");
        return { ok: true, json: async () => ARQ_BODY };
      }
      throw new Error("unexpected fetch: " + url);
    });
    await ctx.sandbox.search(false);
    check("keyword on Pro finds captures", ctx.status().includes("Found 2 capture(s)"), true);
    check("keyword on Pro renders 2 rows", ctx.renderedRows(), 2);
    check("keyword on Pro row sources are arquivo",
      ctx.getRows().sources, ["arquivo", "arquivo"]);
  }

  // --- unsupported network + Arquivo-only: honest, no fetch ----------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "arquivo", network: "instagram" });
    ctx.setFetch(routeBoth());
    await ctx.sandbox.search(false);
    checkHas("instagram + arquivo-only explains the gap",
      ctx.status(), "Arquivo.pt can't list Instagram");
    check("instagram + arquivo-only runs no fetch", ctx.fetchCalls.length, 0);
    check("instagram + arquivo-only renders no rows", ctx.renderedRows(), 0);
  }

  // --- Both + unsupported network: Wayback only + note ---------------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "both", network: "instagram" });
    ctx.setFetch(routeBoth());
    await ctx.sandbox.search(false);
    check("both + instagram still finds Wayback rows", ctx.status().includes("Found 2 capture(s)"), true);
    checkHas("both + instagram notes the Arquivo.pt gap",
      ctx.status(), "Arquivo.pt has no per-handle listing for Instagram");
    check("both + instagram never calls /api/arquivo",
      ctx.fetchCalls.filter((u) => u.includes("/api/arquivo")).length, 0);
  }

  // --- licence caps: keyword_search mirrors the CLI tiers ------------
  {
    const LIC = require("./licence.js");
    check("licence free keyword_search false", LIC.PLAN_CAPS.free.keyword_search, false);
    check("licence starter keyword_search false", LIC.PLAN_CAPS.starter.keyword_search, false);
    check("licence pro keyword_search true", LIC.PLAN_CAPS.pro.keyword_search, true);
    check("licence studio keyword_search true", LIC.PLAN_CAPS.studio.keyword_search, true);
    check("licence bundle keyword_search true", LIC.BUNDLE_CAPS.keyword_search, true);
  }
  console.log(failures === 0
    ? `\narquivo-gates.test.js: ${checks} checks passed`
    : `\narquivo-gates.test.js: ${failures}/${checks} checks FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
