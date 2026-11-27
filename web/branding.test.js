/* Node test for branding.js — no dependencies, no browser.
 * Run:  node web/branding.test.js
 * Exit 0 = every hostname resolves to the right brand and applyBranding
 * swaps title / meta / wordmark / tagline / accent / preset on a fake DOM.
 */
"use strict";
const { resolveBrand, getBrand, applyBranding, BRANDS } = require("./branding.js");

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  " + JSON.stringify(actual) +
    (ok ? "" : "  (expected " + JSON.stringify(expected) + ")"));
}

const HOSTS = [
  // production (live host, canonical option b 2026-11-27 — the old
  // archivecheck.com test/production split is gone; both are this host)
  ["deletedproof.northforgelabs.dev", "apex", "ArchiveCheck"],
  ["app.deletedproof.northforgelabs.dev", "app", "DeletedProof"],
  ["verify.deletedproof.northforgelabs.dev", "verify", "HandleHistory"],
  ["osint.deletedproof.northforgelabs.dev", "osint", "PostTrace"],
  ["legal.deletedproof.northforgelabs.dev", "legal", "PastProof"],
  ["www.deletedproof.northforgelabs.dev", "apex", "ArchiveCheck"],
  // fallbacks
  ["localhost", "apex", "ArchiveCheck"],
  ["127.0.0.1", "apex", "ArchiveCheck"],
  ["localhost:8000", "apex", "ArchiveCheck"],
  ["deletedproof.pages.dev", "apex", "ArchiveCheck"],
  ["wayback-social.pages.dev", "apex", "ArchiveCheck"],
  ["unknown.example.com", "apex", "ArchiveCheck"],
  ["APP.DELETEDPROOF.NORTHFORGELABS.DEV", "app", "DeletedProof"], // case-insensitive
  ["verify.deletedproof.northforgelabs.dev:443", "verify", "HandleHistory"], // port stripped
];
for (const [host, key, name] of HOSTS) {
  check("resolveBrand(" + host + ")", resolveBrand(host), key);
  check("getBrand(" + host + ").name", getBrand(host).name, name);
}

// Every brand: accent set, preset valid (or null), limits line present.
const PRESETS = new Set(["catfish", "relationship", "brand", "hiring", "legal", "journalist", "researcher"]);
for (const [key, b] of Object.entries(BRANDS)) {
  check("brand " + key + " accent", /^#[0-9A-Fa-f]{6}$/.test(b.accent), true);
  check("brand " + key + " preset valid", b.preset === null || PRESETS.has(b.preset), true);
  check("brand " + key + " footer has limits line", b.footer.includes("Found \u2260 guilty"), true);
  check("brand " + key + " footer names umbrella", b.footer.includes("ArchiveCheck"), true);
  check("brand " + key + " jsonLdName set", b.jsonLdName.length > 0, true);
}

// Fake-DOM applyBranding: one fake document per subdomain.
function fakeDoc(hostname) {
  const metas = {};
  const els = {
    h1: { innerHTML: "" },
    sub: { textContent: "" },
    hero: { textContent: "" },
    footer: { textContent: "" },
    ld: { textContent: JSON.stringify({ "@type": "SoftwareApplication", name: "wayback-social", description: "old" }) },
  };
  let clickedPreset = null;
  return {
    title: "",
    location: { hostname },
    documentElement: { style: { _props: {}, setProperty(k, v) { this._props[k] = v; } } },
    body: {
      _attrs: {},
      setAttribute(k, v) { this._attrs[k] = v; },
    },
    querySelector(sel) {
      if (sel === "h1") return els.h1;
      if (sel === ".sub") return els.sub;
      if (sel === "footer") return els.footer;
      if (sel === 'script[type="application/ld+json"]') return els.ld;
      if (sel.startsWith('button[data-preset="')) {
        return { click() { clickedPreset = sel; } };
      }
      if (!metas[sel]) metas[sel] = { setAttribute(k, v) { this[k] = v; } };
      return metas[sel];
    },
    getElementById(id) { return id === "search-hero" ? els.hero : null; },
    _els: els, _metas: metas,
    get clickedPreset() { return clickedPreset; },
  };
}
for (const [host, key] of [
  ["verify.deletedproof.northforgelabs.dev", "verify"],
  ["osint.deletedproof.northforgelabs.dev", "osint"],
  ["legal.deletedproof.northforgelabs.dev", "legal"],
  ["app.deletedproof.northforgelabs.dev", "app"],
  ["deletedproof.northforgelabs.dev", "apex"],
]) {
  const doc = fakeDoc(host);
  const brand = applyBranding(doc, host);
  check("applyBranding(" + host + ").key", brand.key, key);
  check("applyBranding(" + host + ") title", doc.title, brand.seoTitle);
  check("applyBranding(" + host + ") h1", doc._els.h1.innerHTML, brand.wordmarkHtml);
  check("applyBranding(" + host + ") tagline", doc._els.sub.textContent, brand.tagline);
  check("applyBranding(" + host + ") hero", doc._els.hero.textContent, brand.hero);
  check("applyBranding(" + host + ") footer", doc._els.footer.textContent, brand.footer);
  check("applyBranding(" + host + ") accent var",
    doc.documentElement.style._props["--brand-accent"], brand.accent);
  check("applyBranding(" + host + ") body data-brand", doc.body._attrs["data-brand"], key);
  check("applyBranding(" + host + ") json-ld name",
    JSON.parse(doc._els.ld.textContent).name, brand.jsonLdName);
  if (brand.preset) {
    check("applyBranding(" + host + ") preset clicked",
      doc.clickedPreset, 'button[data-preset="' + brand.preset + '"]');
  }
}

console.log(failures === 0 ? "\nAll branding checks passed." : "\n" + failures + " check(s) FAILED.");
process.exit(failures === 0 ? 0 : 1);
