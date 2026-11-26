#!/usr/bin/env python3
"""SEO health check for the wayback-social web app (stdlib only).

Usage:
  python3 scripts/seo_check.py https://wayback-social.pages.dev/
  python3 scripts/seo_check.py http://localhost:8000/

Checks the homepage for: <title>, meta description, Open Graph tags,
Twitter card, canonical link, JSON-LD (parses as JSON), robots.txt and
sitemap.xml reachable. Prints a checklist and exits non-zero on any
failure. See docs/seo-monitor.md for the weekly routine.
"""
from __future__ import annotations

import html as html_mod
import json
import re
import sys
import urllib.error
import urllib.request

TIMEOUT = 30


def fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "wayback-social-seo-check/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return 0, f"ERROR: {e}"


def check(base: str) -> list[tuple[str, bool, str]]:
    base = base.rstrip("/")
    results: list[tuple[str, bool, str]] = []

    def add(name, ok, detail=""):
        results.append((name, bool(ok), detail))

    status, html = fetch(base + "/")
    add("homepage reachable (200)", status == 200, f"HTTP {status}")
    if status != 200:
        return results

    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.DOTALL | re.IGNORECASE)
    title = html_mod.unescape(m.group(1)).strip() if m else ""
    add("title present (30-70 chars)", 30 <= len(title) <= 70, f"{len(title)} chars: {title[:80]}")

    m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']',
                  html, re.DOTALL | re.IGNORECASE)
    desc = html_mod.unescape(m.group(1)).strip() if m else ""
    add("meta description present (50-160 chars)", 50 <= len(desc) <= 160,
        f"{len(desc)} chars")

    for prop in ("og:title", "og:description", "og:url", "og:type"):
        present = re.search(rf'<meta[^>]+property=["\']{prop}["\']', html, re.IGNORECASE) is not None
        add(f"Open Graph {prop}", present)

    present = re.search(r'<meta[^>]+name=["\']twitter:card["\']', html, re.IGNORECASE) is not None
    add("Twitter card", present)

    m = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\'](.*?)["\']',
                  html, re.IGNORECASE)
    add("canonical link", bool(m), m.group(1) if m else "missing")

    m = re.search(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                  html, re.DOTALL | re.IGNORECASE)
    if m:
        try:
            data = json.loads(m.group(1))
            offers = data.get("offers", []) if isinstance(data, dict) else []
            add("JSON-LD parses, has offers", len(offers) >= 4, f"{len(offers)} offers")
        except json.JSONDecodeError as e:
            add("JSON-LD parses", False, str(e))
    else:
        add("JSON-LD present", False)

    status, _ = fetch(base + "/robots.txt")
    add("robots.txt reachable (200)", status == 200, f"HTTP {status}")

    status, sm = fetch(base + "/sitemap.xml")
    ok = status == 200 and "<urlset" in sm
    add("sitemap.xml reachable + valid", ok, f"HTTP {status}")
    return results


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: python3 scripts/seo_check.py <site-url>")
        return 2
    results = check(argv[1])
    failed = 0
    for name, ok, detail in results:
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))
        failed += 0 if ok else 1
    print(f"\n{len(results) - failed}/{len(results)} checks passed.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
