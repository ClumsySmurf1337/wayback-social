/* Dynamic per-subdomain branding — ONE web app, brand changes by hostname.
 *
 * Umbrella brand: ArchiveCheck (docs/naming-v2.md — the only shortlisted
 * name with a free .com, PyPI and GitHub). Each subdomain gets its own
 * display brand, chosen for THAT audience, all under the umbrella:
 *
 *   apex    ArchiveCheck   — marketing + free search (the umbrella itself)
 *   app     DeletedProof   — full console (deleted-only diff is the star)
 *   verify  HandleHistory  — daters / catfish check (the handle's past)
 *   osint   PostTrace      — researchers / journalists (trace the posts)
 *   legal   PastProof      — lawyers / paralegals (proof from the past)
 *
 * Collision notes (checked live 2026-11-26, see docs/subdomain-branding.md):
 * HandleCheck, SocialTrace, CatfishCheck, DateCheck, RealCheck, TrustCheck
 * and ProfileCheck ALL collide with live products in the trust/dating
 * space and are NOT used anywhere here. Subdomain brands do NOT need
 * their own .com — they live at <sub>.deletedproof.northforgelabs.dev
 * (production and test). The umbrella does NOT own archivecheck.com
 * yet (canonical option b, 2026-11-27); the subdomains borrow the
 * northforgelabs.dev host.
 *
 * Base palette (v1, unchanged): ink navy #0F1E33, evidence green #1F9D63,
 * paper #F7F4EC, alert amber #E8A13D, slate #5A6B7F, deleted red #C0392B.
 * Each subdomain shifts exactly ONE accent colour; everything else stays.
 *
 * Honest-limits copy: every brand carries the same limits line and it is
 * applied on every subdomain — "Public archived posts only. Found ≠ guilty.
 * Not found ≠ not real." A brand swap never swaps the honesty out.
 *
 * This file is self-contained (no build step). It does NOT edit config.js
 * or index.html — see docs/subdomain-branding.md for the wiring snippet.
 * It is safe to load in Node for testing: the browser auto-apply only
 * runs when window + document exist.
 *
 * The BRANDS table below is GENERATED from web/brands.json (the single
 * source of truth) — edit the JSON and run scripts/sync_brands.py,
 * never the block between the GENERATED BRANDS markers. The same JSON
 * also generates functions/_lib/brands.js for the server-side
 * middleware, so client and server can never drift.
 */
(function (root) {
  "use strict";

  var LIMITS_LINE =
    "Public archived posts only. Found \u2260 guilty. Not found \u2260 not real.";

  var UMBRELLA = "ArchiveCheck";

  /* One entry per subdomain. `key` is the subdomain label used by the
   * matcher below. Fields:
   *   name         display brand name (wordmark)
   *   wordmarkHtml h1 innerHTML — second word wrapped for accent styling
   *   tagline      one line under the wordmark (the .sub paragraph)
   *   hero         the search-section headline promise (data attribute;
   *                index.html wires it to the #search h2 via the snippet)
   *   accent       the ONE shifted accent colour for this subdomain
   *   preset       default preset id (catfish/relationship/brand/hiring/
   *                legal/journalist/researcher) — applied if the page has
   *                a button[data-preset] control for it (button-scoped:
   *                the body also carries data-preset once active)
   *   seoTitle / metaDescription / jsonLdName  per-subdomain SEO
   *   footer       footer line (always ends with the limits line)
   */
  // BEGIN GENERATED BRANDS
  var BRANDS = {
  "apex": {
    "accent": "#1F9D63",
    "canonical": "https://deletedproof.northforgelabs.dev/",
    "dashboardTitle": "Dashboard — ArchiveCheck",
    "footer": "ArchiveCheck · Research / OSINT tool. Public archived posts only. Found ≠ guilty. Not found ≠ not real.",
    "hero": "What did they post — and what did they delete?",
    "jsonLdName": "ArchiveCheck",
    "key": "apex",
    "metaDescription": "Search archived posts from X, Instagram, TikTok, YouTube, Reddit and more — Wayback Machine, Arquivo.pt, Common Crawl and live APIs. Free search; packs from $9.",
    "name": "ArchiveCheck",
    "preset": null,
    "seoTitle": "ArchiveCheck — Find deleted posts & check any profile in the archive",
    "tagline": "Check the archive before you trust the profile.",
    "wordmarkHtml": "Archive<span>Check</span>"
  },
  "app": {
    "accent": "#E8A13D",
    "canonical": "https://app.deletedproof.northforgelabs.dev/",
    "dashboardTitle": "Dashboard — DeletedProof",
    "footer": "DeletedProof by ArchiveCheck · Public archived posts only. Found ≠ guilty. Not found ≠ not real.",
    "hero": "The full console — broad search, batch, deleted-only diff and evidence packs.",
    "jsonLdName": "DeletedProof by ArchiveCheck",
    "key": "app",
    "metaDescription": "The ArchiveCheck console: broad search across 14 networks, batch watchlists, deleted-only diff and evidence-pack export.",
    "name": "DeletedProof",
    "preset": null,
    "seoTitle": "DeletedProof — ArchiveCheck console: deleted posts, batch, evidence",
    "tagline": "Every capture. Every deletion. One console. Proof a post existed, dated and sourced.",
    "wordmarkHtml": "Deleted<span>Proof</span>"
  },
  "legal": {
    "accent": "#C9A227",
    "canonical": "https://legal.deletedproof.northforgelabs.dev/",
    "dashboardTitle": "Dashboard — PastProof",
    "footer": "PastProof by ArchiveCheck · Triage, not court-ready. Public archived posts only. Found ≠ guilty. Not found ≠ not real.",
    "hero": "For lawyers and paralegals — evidence packs, citation format, replay links. Triage, not court-ready.",
    "jsonLdName": "PastProof by ArchiveCheck",
    "key": "legal",
    "metaDescription": "PastProof by ArchiveCheck: archived posts, dated and sourced, for legal triage. Evidence packs with SHA-256 manifests. Triage, not court-ready.",
    "name": "PastProof",
    "preset": "legal",
    "seoTitle": "PastProof — Archived social media evidence for lawyers & paralegals",
    "tagline": "Proof from the past — archived posts, dated and sourced, ready to cite.",
    "wordmarkHtml": "Past<span>Proof</span>"
  },
  "osint": {
    "accent": "#3E7CB1",
    "canonical": "https://osint.deletedproof.northforgelabs.dev/",
    "dashboardTitle": "Dashboard — PostTrace",
    "footer": "PostTrace by ArchiveCheck · Public archived posts only. Found ≠ guilty. Not found ≠ not real.",
    "hero": "For researchers and journalists — batch, date ranges, deleted-only diff, evidence packs.",
    "jsonLdName": "PostTrace by ArchiveCheck",
    "key": "osint",
    "metaDescription": "PostTrace by ArchiveCheck: trace a handle's posts across 14 networks. Batch, deleted-only diff, replay text and citable evidence packs for researchers.",
    "name": "PostTrace",
    "preset": "journalist",
    "seoTitle": "PostTrace — OSINT archive search for journalists & researchers",
    "tagline": "Trace their posts across 14 networks — what they said, when, and what vanished.",
    "wordmarkHtml": "Post<span>Trace</span>"
  },
  "verify": {
    "accent": "#E85D75",
    "canonical": "https://verify.deletedproof.northforgelabs.dev/",
    "dashboardTitle": "Dashboard — HandleHistory",
    "footer": "HandleHistory by ArchiveCheck · Public archived posts only. Found ≠ guilty. Not found ≠ not real.",
    "hero": "Check their past before you meet them — old posts, old bios, old handles.",
    "jsonLdName": "HandleHistory by ArchiveCheck",
    "key": "verify",
    "metaDescription": "Before you meet them, check what they posted before. HandleHistory searches the archive for a dating profile's posts, bios and handles — and what was deleted.",
    "name": "HandleHistory",
    "preset": "catfish",
    "seoTitle": "HandleHistory — Is this a catfish? Check a dating profile's past posts",
    "tagline": "Is your match who they say they are? Read their handle's history before you meet.",
    "wordmarkHtml": "Handle<span>History</span>"
  }
};
  // END GENERATED BRANDS

  var SUBDOMAINS = ["app", "verify", "osint", "legal"];

  /* Resolve a hostname to a brand key. Works for:
   *   production:  deletedproof.northforgelabs.dev,
   *                app.deletedproof.northforgelabs.dev, ...
   *   test:        deletedproof.northforgelabs.dev,
   *                app.deletedproof.northforgelabs.dev, ...
   *   legacy test: <project>.pages.dev, localhost, 127.0.0.1
   * Anything unknown (or bare) falls back to the umbrella (apex).
   * "www." is stripped; ports are stripped; case is ignored.
   */
  function resolveBrand(hostname) {
    var host = String(hostname || "").toLowerCase().replace(/:\d+$/, "");
    if (host === "www.") host = "";
    if (host.indexOf("www.") === 0) host = host.slice(4);
    if (!host || host === "localhost" || host === "127.0.0.1") return "apex";
    if (/\.pages\.dev$/.test(host)) return "apex"; // Pages preview hosts
    // Test hosts: <sub>.deletedproof.northforgelabs.dev
    var m = host.match(/^([a-z]+)\.deletedproof\.northforgelabs\.dev$/);
    if (m && SUBDOMAINS.indexOf(m[1]) !== -1) return m[1];
    if (host === "deletedproof.northforgelabs.dev") return "apex";
    // Production hosts: <sub>.deletedproof.northforgelabs.dev
    var p = host.match(/^([a-z]+)\.deletedproof\.northforgelabs\.dev$/);
    if (p && SUBDOMAINS.indexOf(p[1]) !== -1) return p[1];
    if (host === "deletedproof.northforgelabs.dev") return "apex";
    // Generic fallback: first label, if it is a known subdomain.
    var first = host.split(".")[0];
    if (SUBDOMAINS.indexOf(first) !== -1 && host.split(".").length >= 3) return first;
    return "apex";
  }

  function getBrand(hostname) {
    return BRANDS[resolveBrand(hostname)] || BRANDS.apex;
  }

  /* Swap the page to a brand. `doc` defaults to the global document;
   * passing a fake document lets tests drive this in Node. Every lookup
   * is guarded — a missing element is skipped, never an exception — so
   * the file is safe to load on dashboard.html or any future page that
   * only has some of these hooks.
   *
   * Hooks it looks for (index.html wiring snippet adds the ids):
   *   <title>, meta[name=description], meta[property=og:*],
   *   meta[name=twitter:*], link[rel=canonical],
   *   script[type="application/ld+json"], h1 (wordmark),
   *   .sub (tagline), #search-hero (hero line), footer (footer line),
   *   [data-preset="<id>"] (default preset control, button-scoped).
   * It also sets --brand-accent on :root and body[data-brand] /
   * body[data-default-preset] for CSS and for tests to read.
   */
  function applyBranding(doc, hostname) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc) return null;
    var brand = getBrand(hostname || (doc.location && doc.location.hostname) || "");
    var root = doc.documentElement;

    if (doc.title !== undefined) doc.title = brand.seoTitle;

    function setMeta(selector, attr, value) {
      var el = doc.querySelector && doc.querySelector(selector);
      if (el && el.setAttribute) el.setAttribute(attr, value);
    }
    setMeta('meta[name="description"]', "content", brand.metaDescription);
    setMeta('meta[property="og:title"]', "content", brand.seoTitle);
    setMeta('meta[property="og:description"]', "content", brand.metaDescription);
    setMeta('meta[property="og:site_name"]', "content", brand.name);
    setMeta('meta[name="twitter:title"]', "content", brand.seoTitle);
    setMeta('meta[name="twitter:description"]', "content", brand.metaDescription);
    // Canonical only on production hosts — test hosts keep theirs.
    var host = String(hostname || (doc.location && doc.location.hostname) || "").toLowerCase();
    if (host === "deletedproof.northforgelabs.dev" || /\.deletedproof\.northforgelabs\.dev$/.test(host)) {
      setMeta('link[rel="canonical"]', "href", brand.canonical);
      setMeta('meta[property="og:url"]', "content", brand.canonical);
    }

    var ld = doc.querySelector && doc.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        var data = JSON.parse(ld.textContent || "{}");
        data.name = brand.jsonLdName;
        data.description = brand.metaDescription;
        ld.textContent = JSON.stringify(data);
      } catch (e) { /* leave the JSON-LD untouched if it will not parse */ }
    }

    var h1 = doc.querySelector && doc.querySelector("h1");
    if (h1) h1.innerHTML = brand.wordmarkHtml;
    var sub = doc.querySelector && doc.querySelector(".sub");
    if (sub) sub.textContent = brand.tagline;
    var hero = doc.getElementById && doc.getElementById("search-hero");
    if (hero) hero.textContent = brand.hero;
    var foot = doc.querySelector && doc.querySelector("footer");
    if (foot) foot.textContent = brand.footer;

    if (root && root.style && root.style.setProperty) {
      root.style.setProperty("--brand-accent", brand.accent);
    }
    var body = doc.body;
    if (body) {
      if (body.setAttribute) {
        body.setAttribute("data-brand", brand.key);
        body.setAttribute("data-umbrella", UMBRELLA);
        if (brand.preset) body.setAttribute("data-default-preset", brand.preset);
      }
      if (brand.preset && doc.querySelector) {
        var presetEl = doc.querySelector('button[data-preset="' + brand.preset + '"]');
        if (presetEl && presetEl.click) presetEl.click();
      }
    }
    return brand;
  }

  var api = {
    UMBRELLA: UMBRELLA,
    BRANDS: BRANDS,
    LIMITS_LINE: LIMITS_LINE,
    resolveBrand: resolveBrand,
    getBrand: getBrand,
    applyBranding: applyBranding,
  };

  // Browser: expose globally and auto-apply on load.
  if (typeof window !== "undefined") {
    window.ArchiveBranding = api;
    var boot = function () { applyBranding(document, window.location.hostname); };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
  // Node / tests.
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.ArchiveBranding = api;
})(typeof self !== "undefined" ? self : this);
