/* Node test for single-post-URL mode (Track K item 2).
 * Loads the real search stack via web/arquivo-ctx.js (which loads
 * url-mode.js before console.js, mirroring index.html). Covers:
 * network auto-detection + URL validation (pure), bad URL -> honest
 * error + zero fetches, URL + keyword -> honest error + zero
 * fetches, free-tier URL search runs (there is NO tier gate for
 * URL mode — plans.py has no url flag; only archive_limit
 * applies), the exact URL as the CDX pattern through BOTH proxies,
 * and the Arquivo per-handle-listing gate being skipped for an
 * exact URL (Instagram + arquivo-only runs). The ONE live probe
 * through the real archive is tests/e2e/test_url_mode.py.
 * Run:  node web/url-mode.test.js
 */
"use strict";
const C = require("./arquivo-ctx.js");
const { makeCtx, routeBoth, HEADER, CDX_BODY, A_ROW_X } = C;

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
function setUrl(ctx, url) {
  ctx.sandbox.document.getElementById("post-url").value = url;
}

async function main() {
  // --- pure: network auto-detection (mirrors CLI detect_network) ---
  {
    const ctx = makeCtx();
    const UM = ctx.sandbox.window.WS_URL_MODE;
    check("WS_URL_MODE loads", typeof UM, "object");
    check("detectNetwork x.com -> x", UM.detectNetwork("https://x.com/jack/status/20"), "x");
    check("detectNetwork twitter.com -> x", UM.detectNetwork("https://twitter.com/jack/status/20"), "x");
    check("detectNetwork instagram.com -> instagram", UM.detectNetwork("https://www.instagram.com/p/abc123/"), "instagram");
    check("detectNetwork youtu.be -> youtube", UM.detectNetwork("https://youtu.be/dQw4w9WgXcQ"), "youtube");
    check("detectNetwork bsky.app -> bluesky", UM.detectNetwork("https://bsky.app/profile/bsky.app/post/123"), "bluesky");
    check("detectNetwork mastodon path -> mastodon", UM.detectNetwork("https://mastodon.social/@user/109123456789"), "mastodon");
    check("detectNetwork unknown host -> null", UM.detectNetwork("https://example.com/post/1"), null);
    check("parsePostUrl trims the trailing slash",
      UM.parsePostUrl("https://x.com/jack/status/20/"), { url: "https://x.com/jack/status/20", net: "x" });
    check("parsePostUrl without a scheme errors",
      UM.parsePostUrl("x.com/jack/status/20").error.includes("starting https://"), true);
    check("parsePostUrl with a non-http scheme errors",
      UM.parsePostUrl("ftp://x.com/jack/status/20").error.includes("starting https://"), true);
    check("parsePostUrl with an unknown host errors",
      UM.parsePostUrl("https://example.com/post/1").error.includes("isn't from a network"), true);
  }

  // --- free tier: URL search runs (NO tier gate) ---------------------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "wayback" }); // free tier (default)
    setUrl(ctx, "https://x.com/jack/status/1");
    ctx.setFetch(routeBoth());
    await ctx.sandbox.search(false);
    check("URL search on free finds captures", ctx.status().includes("Found 2 capture(s) of this post"), true);
    checkHas("URL search status names the network", ctx.status(), "on X / Twitter.");
    check("URL search renders 2 rows", ctx.renderedRows(), 2);
    check("URL search fetched the exact URL through /api/cdx",
      ctx.fetchCalls.some((u) => u.includes("/api/cdx") && u.includes("url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F1")), true);
    check("URL search never fetched a handle pattern",
      ctx.fetchCalls.some((u) => u.includes("status%2F*") || u.includes("%7Bid%7D")), false);
  }

  // --- bad URL: honest error, zero fetches ---------------------------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "wayback" });
    setUrl(ctx, "not a url");
    ctx.setFetch(routeBoth());
    await ctx.sandbox.search(false);
    checkHas("bad URL explains the problem", ctx.status(), "doesn't look like a post URL");
    check("bad URL runs no fetch", ctx.fetchCalls.length, 0);
    check("bad URL renders no rows", ctx.renderedRows(), 0);
  }

  // --- unknown host: honest error, zero fetches ----------------------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "wayback" });
    setUrl(ctx, "https://example.com/post/1");
    ctx.setFetch(routeBoth());
    await ctx.sandbox.search(false);
    checkHas("unknown host names the covered networks", ctx.status(), "isn't from a network");
    check("unknown host runs no fetch", ctx.fetchCalls.length, 0);
  }

  // --- URL + keyword: honest error, zero fetches (Pro tier, so the
  // keyword gate itself doesn't fire first) ---------------------------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "both", keyword: "twttr", tier: "pro" });
    setUrl(ctx, "https://x.com/jack/status/1");
    ctx.setFetch(routeBoth());
    await ctx.sandbox.search(false);
    checkHas("URL + keyword can't combine", ctx.status(), "can't be searched together");
    check("URL + keyword runs no fetch", ctx.fetchCalls.length, 0);
  }

  // --- Both: the exact URL goes through BOTH proxies -----------------
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "both" });
    setUrl(ctx, "https://x.com/jack/status/1");
    ctx.setFetch(async (url) => {
      const u = String(url);
      if (u.includes("/api/arquivo")) return { ok: true, json: async () => [HEADER, A_ROW_X] };
      if (u.includes("/api/cdx")) return { ok: true, json: async () => CDX_BODY };
      throw new Error("unexpected fetch: " + u);
    });
    await ctx.sandbox.search(false);
    check("URL Both finds 2 captures (x.com alias merged)", ctx.status().includes("Found 2 capture(s) of this post"), true);
    check("URL Both renders 2 rows", ctx.renderedRows(), 2);
    check("URL Both fetched the exact URL through /api/cdx",
      ctx.fetchCalls.some((u) => u.includes("/api/cdx") && u.includes("url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F1")), true);
    check("URL Both fetched the exact URL through /api/arquivo",
      ctx.fetchCalls.some((u) => u.includes("/api/arquivo") && u.includes("url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F1")), true);
  }

  // --- Instagram + arquivo-only: the per-handle gate is skipped -----
  // (Arquivo.pt CDX answers any exact URL; the CLI's --url has the
  // same behaviour). The mocked Arquivo rows are twitter rows — the
  // point is the gate is skipped and a fetch ran.
  {
    const ctx = makeCtx();
    ctx.setForm({ source: "arquivo" });
    setUrl(ctx, "https://www.instagram.com/p/abc123/");
    ctx.setFetch(routeBoth());
    await ctx.sandbox.search(false);
    check("URL Instagram + arquivo-only runs (no per-handle gate)",
      ctx.status().includes("Found 2 capture(s) of this post"), true);
    check("URL Instagram + arquivo-only called /api/arquivo",
      ctx.fetchCalls.some((u) => u.includes("/api/arquivo")), true);
    checkHas("URL Instagram status names Instagram", ctx.status(), "on Instagram.");
  }

  console.log(failures === 0
    ? `\nurl-mode: ${checks} checks passed`
    : `\nurl-mode: ${failures}/${checks} checks FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
