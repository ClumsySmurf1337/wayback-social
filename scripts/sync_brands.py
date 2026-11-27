"""Sync web/brands.json into web/branding.js + functions/_lib/brands.js.

brands.json is the single source of truth for per-subdomain branding
(docs/subdomain-branding.md). Two consumers must never drift:

  * web/branding.js — client-side fallback (accent, preset, wordmark,
    footer). Only its BRANDS literal is generated, between the
    BEGIN/END GENERATED BRANDS markers; the resolveBrand /
    applyBranding logic stays hand-written.
  * functions/_lib/brands.js — ES module for the Pages Function
    middleware (functions/_middleware.js), which rewrites title/meta/
    JSON-LD server-side via HTMLRewriter. It carries the same brand
    data plus a resolveBrand/getBrand pair with behaviour identical
    to branding.js (both are tested against the same host matrix:
    node web/branding.test.js and node functions/middleware.test.mjs).

Usage: `python scripts/sync_brands.py` to rewrite,
`--check` to exit 1 on drift (used by tests/test_brands_sync.py
and CI). Stdlib only.

Validation (fails loudly rather than shipping bad copy):
  * exactly the five brands apex/app/verify/osint/legal, each with
    all required fields; accent a #RRGGBB hex; preset null or one
    of the seven preset ids; footer contains the limits line and
    the umbrella name.
  * seoTitle 30-70 chars and metaDescription 50-160 chars — the
    gates scripts/seo_check.py enforces on the served page. (The
    2026-11-26 trims that made the v1 copy fit are recorded in
    web/brands.json's header comment.)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRANDS_JSON = ROOT / "web" / "brands.json"
BRANDING_JS = ROOT / "web" / "branding.js"
BRANDS_JS = ROOT / "functions" / "_lib" / "brands.js"

BRAND_KEYS = ("apex", "app", "verify", "osint", "legal")
REQUIRED_FIELDS = (
    "key", "name", "wordmarkHtml", "tagline", "hero", "accent", "preset",
    "seoTitle", "metaDescription", "jsonLdName", "canonical", "footer",
    "dashboardTitle",
)
PRESETS = {
    "catfish", "relationship", "brand", "hiring", "legal", "journalist",
    "researcher",
}
BEGIN_MARKER = "  // BEGIN GENERATED BRANDS"
END_MARKER = "  // END GENERATED BRANDS"

# resolveBrand/getBrand for functions/_lib/brands.js. Behaviour must
# stay identical to web/branding.js — both files are tested against
# the same host matrix (see the module docstring above).
RESOLVER_TEMPLATE = '''
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
  var host = String(hostname || "").toLowerCase().replace(/:\\d+$/, "");
  if (host === "www.") host = "";
  if (host.indexOf("www.") === 0) host = host.slice(4);
  if (!host || host === "localhost" || host === "127.0.0.1") return "apex";
  if (/\\.pages\\.dev$/.test(host)) return "apex"; // Pages preview hosts
  // Test hosts: <sub>.deletedproof.northforgelabs.dev
  var m = host.match(/^([a-z]+)\\.deletedproof\\.northforgelabs\\.dev$/);
  if (m && SUBDOMAINS.indexOf(m[1]) !== -1) return m[1];
  if (host === "deletedproof.northforgelabs.dev") return "apex";
  // Production hosts: <sub>.deletedproof.northforgelabs.dev
  var p = host.match(/^([a-z]+)\\.deletedproof\\.northforgelabs\\.dev$/);
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
'''


def load_brands(path: Path = BRANDS_JSON) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    for section in ("umbrella", "limitsLine", "brands"):
        if section not in data:
            raise ValueError(f"brands.json missing section: {section}")
    brands = data["brands"]
    if tuple(sorted(brands)) != tuple(sorted(BRAND_KEYS)):
        raise ValueError(
            f"brands.json must have exactly {sorted(BRAND_KEYS)}, "
            f"got {sorted(brands)}")
    for key in BRAND_KEYS:
        b = brands[key]
        if b.get("key") != key:
            raise ValueError(f"brand {key} has wrong key field: {b.get('key')!r}")
        for field in REQUIRED_FIELDS:
            if field not in b:
                raise ValueError(f"brand {key} missing field: {field}")
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", b["accent"]):
            raise ValueError(f"brand {key} accent not #RRGGBB: {b['accent']!r}")
        if b["preset"] is not None and b["preset"] not in PRESETS:
            raise ValueError(f"brand {key} preset unknown: {b['preset']!r}")
        if not (30 <= len(b["seoTitle"]) <= 70):
            raise ValueError(
                f"brand {key} seoTitle {len(b['seoTitle'])} chars "
                f"(need 30-70): {b['seoTitle']!r}")
        if not (50 <= len(b["metaDescription"]) <= 160):
            raise ValueError(
                f"brand {key} metaDescription {len(b['metaDescription'])} "
                f"chars (need 50-160)")
        if not (15 <= len(b["dashboardTitle"]) <= 70):
            raise ValueError(
                f"brand {key} dashboardTitle {len(b['dashboardTitle'])} "
                f"chars (need 15-70): {b['dashboardTitle']!r}")
        if data["limitsLine"] not in b["footer"]:
            raise ValueError(f"brand {key} footer lacks the limits line")
        if data["umbrella"] not in b["footer"]:
            raise ValueError(f"brand {key} footer lacks the umbrella name")
    return data


def render_branding_js_block(data: dict) -> str:
    """The BRANDS literal for web/branding.js (between the markers)."""
    dumped = json.dumps(data["brands"], indent=2, sort_keys=True,
                        ensure_ascii=False)
    return f"{BEGIN_MARKER}\n  var BRANDS = {dumped};\n{END_MARKER}"


def render_brands_js(data: dict) -> str:
    """The generated ES module for the middleware (functions/_lib/)."""
    dumped = json.dumps(data["brands"], indent=2, sort_keys=True,
                        ensure_ascii=False)
    header = (
        "// GENERATED — do not edit by hand. Source: web/brands.json.\n"
        "// Regenerate: python scripts/sync_brands.py\n"
        "// Used by functions/_middleware.js (server-side brand injection).\n"
        f"export const UMBRELLA = {json.dumps(data['umbrella'])};\n"
        f"export const LIMITS_LINE = {json.dumps(data['limitsLine'])};\n\n"
        f"export const BRANDS = {dumped};\n"
    )
    return header + RESOLVER_TEMPLATE


def sync(check: bool = False) -> int:
    data = load_brands()
    branding_js = BRANDING_JS.read_text(encoding="utf-8")
    if BEGIN_MARKER not in branding_js or END_MARKER not in branding_js:
        print("web/branding.js is missing the GENERATED BRANDS markers — "
              "the BRANDS literal cannot be regenerated safely.")
        return 1
    block = render_branding_js_block(data)
    pattern = re.compile(
        re.escape(BEGIN_MARKER) + r".*?" + re.escape(END_MARKER), re.DOTALL)
    new_branding = pattern.sub(lambda _: block, branding_js, count=1)
    new_brands_js = render_brands_js(data)
    if check:
        problems = []
        if new_branding != branding_js:
            problems.append("web/branding.js is out of sync with "
                            "web/brands.json (run scripts/sync_brands.py)")
        old = (BRANDS_JS.read_text(encoding="utf-8")
               if BRANDS_JS.exists() else "")
        if new_brands_js != old:
            problems.append("functions/_lib/brands.js is out of sync with "
                            "web/brands.json (run scripts/sync_brands.py)")
        for p in problems:
            print("DRIFT: " + p)
        return 1 if problems else 0
    BRANDING_JS.write_text(new_branding, encoding="utf-8")
    BRANDS_JS.parent.mkdir(parents=True, exist_ok=True)
    BRANDS_JS.write_text(new_brands_js, encoding="utf-8")
    print("Synced web/brands.json -> web/branding.js, "
          "functions/_lib/brands.js")
    return 0


def main(argv: list[str]) -> int:
    check = "--check" in argv
    try:
        return sync(check=check)
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"brands sync failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
