/* Node test for functions/_middleware.js — no dependencies, no browser.
 *
 * Run:  node functions/middleware.test.mjs
 * Exit 0 = every hostname rewrites the served HTML to the right brand.
 *
 * The Workers HTMLRewriter global does not exist in Node, so the test
 * installs the test-only shim (functions/htmlrewriter-shim.mjs) first
 * and then imports the real middleware. The middleware is driven
 * against the REAL web/index.html and web/dashboard.html read from
 * disk, so a static-copy regression fails here too.
 *
 * Coverage:
 *   1. resolveBrand/getBrand in functions/_lib/brands.js agree with
 *      web/branding.js on the same host matrix (guards the duplicated
 *      resolver — both are generated/tested from web/brands.json).
 *   2. For every host x {/, /dashboard.html}: title, meta description,
 *      og/twitter tags, JSON-LD name/description (+ offers preserved),
 *      h1/wordmark/tagline/footer on the index page, canonical + og:url
 *      on production hosts only, unchanged on test/unknown/localhost.
 *   3. Passthrough: non-HTML paths, non-HTML content-type, non-GET,
 *      non-200 responses are returned byte-identical.
 *   4. The static files themselves carry the apex brand (no
 *      "wayback-social" in any <title>).
 *
 * The same rewrite is also covered over real HTTP by
 * tests/e2e/test_ssr_branding.py (scripts/dev-server.mjs runs the
 * middleware). Live-deploy verification is in docs/ssr-branding.md.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { HTMLRewriter } from "./htmlrewriter-shim.mjs";

globalThis.HTMLRewriter = HTMLRewriter;

const { onRequest } = await import("./_middleware.js");
const serverBrands = await import("./_lib/brands.js");
// branding.js is CommonJS (module.exports) — ESM import sees it as default.
const clientBrands = (await import("../web/branding.js")).default;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_HTML = await readFile(join(ROOT, "web", "index.html"), "utf-8");
const DASHBOARD_HTML = await readFile(
  join(ROOT, "web", "dashboard.html"),
  "utf-8",
);

let passed = 0;
let failed = 0;
const failures = [];
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(
      `${label} -> ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`,
    );
  }
}

// Same host matrix as web/branding.test.js — the two resolvers must agree.
// Production host (live, canonical option b 2026-11-27).
const HOSTS = [
  ["deletedproof.northforgelabs.dev", "apex", "ArchiveCheck"],
  ["app.deletedproof.northforgelabs.dev", "app", "DeletedProof"],
  ["verify.deletedproof.northforgelabs.dev", "verify", "HandleHistory"],
  ["osint.deletedproof.northforgelabs.dev", "osint", "PostTrace"],
  ["legal.deletedproof.northforgelabs.dev", "legal", "PastProof"],
  ["www.deletedproof.northforgelabs.dev", "apex", "ArchiveCheck"],
  ["localhost", "apex", "ArchiveCheck"],
  ["127.0.0.1", "apex", "ArchiveCheck"],
  ["localhost:8000", "apex", "ArchiveCheck"],
  ["deletedproof.pages.dev", "apex", "ArchiveCheck"],
  ["wayback-social.pages.dev", "apex", "ArchiveCheck"],
  ["unknown.example.com", "apex", "ArchiveCheck"],
  ["APP.DELETEDPROOF.NORTHFORGELABS.DEV", "app", "DeletedProof"],
  ["verify.deletedproof.northforgelabs.dev:443", "verify", "HandleHistory"],
];

for (const [host, key, name] of HOSTS) {
  check(`server resolveBrand(${host})`, serverBrands.resolveBrand(host), key);
  check(`server getBrand(${host}).name`, serverBrands.getBrand(host).name, name);
  check(
    `resolvers agree on ${host}`,
    serverBrands.resolveBrand(host),
    clientBrands.resolveBrand(host),
  );
  check(
    `brand data agrees on ${host}`,
    JSON.stringify(serverBrands.getBrand(host)),
    JSON.stringify(clientBrands.getBrand(host)),
  );
}

// --- served-HTML helpers (same regexes scripts/seo_check.py uses) ---
function metaContent(html, key) {
  // Attribute-order independent: scan <meta ...> tags for name/property == key.
  // Values use double quotes in our HTML and may contain apostrophes,
  // so capture to the SAME quote character that opened the value.
  const tags = html.match(/<meta[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = tag.match(/(?:name|property)=(["'])(.*?)\1/i);
    const content = tag.match(/content=(["'])(.*?)\1/i);
    if (name && content && name[2] === key) return unescapeAttr(content[2]);
  }
  return null;
}

function unescapeAttr(v) {
  // Attribute values are serialised with & escaped (&amp;) — decode
  // back before comparing, like a browser (and seo_check.py) would.
  return v
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function titleOf(html) {
  const m = html.match(/<title[^>]*>(.*?)<\/title>/is);
  return m ? m[1] : null;
}
function jsonLd(html) {
  const m = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/is,
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return "UNPARSABLE";
  }
}
function h1Of(html) {
  const m = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  return m ? m[1] : null;
}
function subOf(html) {
  const m = html.match(/<p[^>]+class="sub"[^>]*>(.*?)<\/p>/is);
  return m ? m[1] : null;
}
function footerOf(html) {
  const m = html.match(/<footer[^>]*>(.*?)<\/footer>/is);
  return m ? m[1] : null;
}
function canonicalOf(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  return m ? m[1] : null;
}

async function served(host, path, html, extra = {}) {
  const request = new Request(`https://${host}${path}`, {
    method: extra.method || "GET",
  });
  const ctx = {
    request,
    next: async () =>
      new Response(html, {
        status: extra.status || 200,
        headers: { "content-type": extra.contentType || "text/html; charset=utf-8" },
      }),
  };
  const res = await onRequest(ctx);
  return { status: res.status, text: await res.text() };
}

const STATIC_CANONICAL_INDEX = canonicalOf(INDEX_HTML);
const STATIC_CANONICAL_DASH = canonicalOf(DASHBOARD_HTML);
const STATIC_OG_URL = metaContent(INDEX_HTML, "og:url");

for (const [host, key] of HOSTS) {
  const brand = serverBrands.BRANDS[key];
  // URL parsing strips the default port and lowercases, exactly like
  // the middleware's `new URL(request.url).hostname` does — so the
  // production check must use the NORMALISED host, not the raw string.
  const normHost = host.toLowerCase().replace(/:\d+$/, "");
  const production = normHost === "deletedproof.northforgelabs.dev" || normHost.endsWith(".deletedproof.northforgelabs.dev");
  // Index page.
  const index = await served(host, "/", INDEX_HTML);
  check(`${host} / status`, index.status, 200);
  check(`${host} / title`, titleOf(index.text), brand.seoTitle);
  check(`${host} / meta description`, metaContent(index.text, "description"), brand.metaDescription);
  check(`${host} / og:title`, metaContent(index.text, "og:title"), brand.seoTitle);
  check(`${host} / og:description`, metaContent(index.text, "og:description"), brand.metaDescription);
  check(`${host} / og:site_name`, metaContent(index.text, "og:site_name"), brand.name);
  check(`${host} / twitter:title`, metaContent(index.text, "twitter:title"), brand.seoTitle);
  check(`${host} / twitter:description`, metaContent(index.text, "twitter:description"), brand.metaDescription);
  const ld = jsonLd(index.text);
  check(`${host} / JSON-LD parses`, typeof ld === "object" && ld !== null, true);
  if (typeof ld === "object" && ld !== null) {
    check(`${host} / JSON-LD name`, ld.name, brand.jsonLdName);
    check(`${host} / JSON-LD description`, ld.description, brand.metaDescription);
    check(`${host} / JSON-LD offers kept`, Array.isArray(ld.offers) && ld.offers.length >= 4, true);
  }
  check(`${host} / h1 wordmark`, h1Of(index.text), brand.wordmarkHtml);
  check(`${host} / .sub tagline`, subOf(index.text), brand.tagline);
  check(`${host} / footer`, footerOf(index.text), brand.footer);
  if (production) {
    check(`${host} / canonical (production)`, canonicalOf(index.text), brand.canonical);
    check(`${host} / og:url (production)`, metaContent(index.text, "og:url"), brand.canonical);
  } else {
    check(`${host} / canonical untouched`, canonicalOf(index.text), STATIC_CANONICAL_INDEX);
    check(`${host} / og:url untouched`, metaContent(index.text, "og:url"), STATIC_OG_URL);
  }
  // Dashboard page.
  const dash = await served(host, "/dashboard.html", DASHBOARD_HTML);
  check(`${host} /dashboard.html title`, titleOf(dash.text), brand.dashboardTitle);
  check(
    `${host} /dashboard.html meta description`,
    metaContent(dash.text, "description"),
    brand.metaDescription,
  );
  check(`${host} /dashboard.html h1 untouched`, h1Of(dash.text), h1Of(DASHBOARD_HTML));
  if (production) {
    check(`${host} /dashboard.html canonical (production)`, canonicalOf(dash.text), brand.canonical);
  } else {
    check(`${host} /dashboard.html canonical untouched`, canonicalOf(dash.text), STATIC_CANONICAL_DASH);
  }
}

// --- passthrough: nothing else is rewritten ---
const js = await served("verify.deletedproof.northforgelabs.dev", "/licence.js", "const x = 1;", {
  contentType: "text/javascript; charset=utf-8",
});
check("passthrough /licence.js unchanged", js.text, "const x = 1;");
const api = await served("verify.deletedproof.northforgelabs.dev", "/", '{"ok":true}', {
  contentType: "application/json",
});
check("passthrough non-HTML unchanged", api.text, '{"ok":true}');
const post = await served("verify.deletedproof.northforgelabs.dev", "/", INDEX_HTML, { method: "POST" });
check("passthrough POST unchanged", post.text, INDEX_HTML);
const missing = await served("verify.deletedproof.northforgelabs.dev", "/", INDEX_HTML, { status: 404 });
check("passthrough 404 unchanged", missing.text, INDEX_HTML);
const robots = await served("verify.deletedproof.northforgelabs.dev", "/robots.txt", "User-agent: *", {
  contentType: "text/plain",
});
check("passthrough /robots.txt unchanged", robots.text, "User-agent: *");

// --- regression (issue #9): a literal tag name inside <style> or an
// HTML comment is raw text, not an element. Before the shim protected
// raw-text regions, `<footer>` in a CSS comment matched as the first
// <footer> and the footer SetText ate everything up to the real
// </footer> — the whole page body vanished from the served HTML.
{
  const tricky = `<!DOCTYPE html><html><head><title>t</title><style>/* note: the <footer> element is rewritten */\n.limits{color:red}</style></head><body><h1>h</h1><p class="sub">s</p><!-- a comment with a <footer> in it --><main><p id="marker">KEEP-ME-BODY</p></main><footer>old footer</footer></body></html>`;
  const out = await served("deletedproof.northforgelabs.dev", "/", tricky);
  check("style block with fake <footer> survives byte-identical",
    out.text.includes("/* note: the <footer> element is rewritten */"), true);
  check("body survives a fake <footer> in a style comment",
    out.text.includes("KEEP-ME-BODY"), true);
  // footerOf() matches the FIRST <footer in the text, which here is the
  // one inside the HTML comment — so assert on the real footer element
  // directly instead of through the helper.
  check("real footer still rewritten",
    out.text.includes("<footer>" + serverBrands.BRANDS.apex.footer + "</footer>"), true);
  check("comment with fake <footer> survives",
    out.text.includes("comment with a <footer> in it"), true);
}

// --- the static files themselves carry the apex brand ---
check("static index <title> has no wayback-social", titleOf(INDEX_HTML).includes("wayback-social"), false);
check("static index <title> is the apex brand", titleOf(INDEX_HTML), serverBrands.BRANDS.apex.seoTitle);
check("static index meta is the apex brand", metaContent(INDEX_HTML, "description"), serverBrands.BRANDS.apex.metaDescription);
check("static index JSON-LD name is the apex brand", jsonLd(INDEX_HTML).name, "ArchiveCheck");
check("static dashboard <title> has no wayback-social", titleOf(DASHBOARD_HTML).includes("wayback-social"), false);
check("static dashboard <title> is the apex brand", titleOf(DASHBOARD_HTML), serverBrands.BRANDS.apex.dashboardTitle);

console.log(`\n${passed}/${passed + failed} checks passed.`);
if (failed) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  FAIL  " + f);
  process.exit(1);
}
console.log("All middleware checks passed.");
