#!/usr/bin/env python3
"""SEO health check for the wayback-social web app (stdlib only).

Usage:
  python3 scripts/seo_check.py https://wayback-social.pages.dev/
  python3 scripts/seo_check.py http://localhost:8000/
  python3 scripts/seo_check.py http://localhost:8000/ guides/ guides/find-deleted-tweets/

With no extra arguments, checks the homepage for: <title>, meta
description, Open Graph tags, Twitter card, canonical link, JSON-LD
(parses as JSON), robots.txt and sitemap.xml reachable. With page
paths, also runs the per-page checks (title 30-70, description 50-160,
OG tags, Twitter card, canonical, JSON-LD parses with a headline/name)
on each page — used for the guide pages under web/guides/, whose
static meta is not covered by the SSR middleware. Prints a checklist
and exits non-zero on any failure. See docs/seo-monitor.md for the
weekly routine.
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


def _page_checks(path: str, html: str) -> list[tuple[str, bool, str]]:
    """Per-page SEO checks shared by the homepage and guide pages.

    The homepage's JSON-LD is a SoftwareApplication with offers; guide
    pages carry an Article (or CollectionPage for the index) with a
    headline/name. The caller passes the expected JSON-LD shape.
    """
    results: list[tuple[str, bool, str]] = []

    def add(name, ok, detail=""):
        results.append((f"{path}: {name}", bool(ok), detail))

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
    return results


def _jsonld_check(path: str, html: str, kind: str) -> list[tuple[str, bool, str]]:
    """JSON-LD check for one page. kind is "offers" (homepage) or
    "article" (guide pages: Article with headline, or CollectionPage
    with a name for the guides index)."""
    m = re.search(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                  html, re.DOTALL | re.IGNORECASE)
    if not m:
        return [(f"{path}: JSON-LD present", False, "")]
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        return [(f"{path}: JSON-LD parses", False, str(e))]
    if kind == "offers":
        offers = data.get("offers", []) if isinstance(data, dict) else []
        return [(f"{path}: JSON-LD parses, has offers", len(offers) >= 4,
                 f"{len(offers)} offers")]
    label = data.get("headline") or data.get("name") if isinstance(data, dict) else None
    ok = isinstance(data, dict) and data.get("@type") in ("Article", "CollectionPage") and bool(label)
    return [(f"{path}: JSON-LD parses, Article/CollectionPage with headline",
             ok, f"{data.get('@type') if isinstance(data, dict) else '?'}: {str(label)[:60]}")]


def check(base: str) -> list[tuple[str, bool, str]]:
    base = base.rstrip("/")
    results: list[tuple[str, bool, str]] = []

    def add(name, ok, detail=""):
        results.append((name, bool(ok), detail))

    status, html = fetch(base + "/")
    add("homepage reachable (200)", status == 200, f"HTTP {status}")
    if status != 200:
        return results
    results += _page_checks("/", html)
    results += _jsonld_check("/", html, "offers")

    status, _ = fetch(base + "/robots.txt")
    add("robots.txt reachable (200)", status == 200, f"HTTP {status}")

    status, sm = fetch(base + "/sitemap.xml")
    ok = status == 200 and "<urlset" in sm
    add("sitemap.xml reachable + valid", ok, f"HTTP {status}")
    return results


def check_pages(base: str, pages: list[str]) -> list[tuple[str, bool, str]]:
    """Per-page checks for extra paths (e.g. the guide pages)."""
    base = base.rstrip("/")
    results: list[tuple[str, bool, str]] = []
    for page in pages:
        path = "/" + page.strip("/")
        status, html = fetch(base + path + ("/" if not path.endswith((".html", "/")) else ""))
        if status != 200:
            results.append((f"{path}: reachable (200)", False, f"HTTP {status}"))
            continue
        results.append((f"{path}: reachable (200)", True, f"HTTP {status}"))
        results += _page_checks(path, html)
        results += _jsonld_check(path, html, "article")
    return results


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: python3 scripts/seo_check.py <site-url> [page ...]")
        return 2
    results = check(argv[1])
    if len(argv) > 2:
        results += check_pages(argv[1], argv[2:])
    failed = 0
    for name, ok, detail in results:
        mark = "PASS" if ok else "FAIL"
        print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))
        failed += 0 if ok else 1
    print(f"\n{len(results) - failed}/{len(results)} checks passed.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
