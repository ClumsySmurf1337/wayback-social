// GENERATED — do not edit by hand. Source: web/brands.json.
// Regenerate: python scripts/sync_brands.py
// Used by functions/_middleware.js (server-side brand injection).
export const UMBRELLA = "ArchiveCheck";
export const LIMITS_LINE = "Public archived posts only. Found \u2260 guilty. Not found \u2260 not real.";

export const BRANDS = {
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

export const SUBDOMAINS = ["app", "verify", "osint", "legal"];

/* Resolve a hostname to a brand key. Works for:
 *   production:  deletedproof.northforgelabs.dev, app.deletedproof.northforgelabs.dev, ...
 *   test:        deletedproof.northforgelabs.dev,
 *                app.deletedproof.northforgelabs.dev, ...
 *   legacy test: <project>.pages.dev, localhost, 127.0.0.1
 * Anything unknown (or bare) falls back to the umbrella (apex).
 * "www." is stripped; ports are stripped; case is ignored.
 */
export function resolveBrand(hostname) {
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

export function getBrand(hostname) {
  return BRANDS[resolveBrand(hostname)] || BRANDS.apex;
}
