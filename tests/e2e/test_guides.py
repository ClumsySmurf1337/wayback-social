"""Guide pages (issue #10) — Playwright smoke tests.

Each of the 10 content pieces + the guides index must load (200),
carry its own title/meta/OG/Twitter/canonical/JSON-LD, contain no CLI
text (the CLI is internal only — no commands, no pipx, no "command
line"), show the honest-limits line, and have internal links that
resolve. Static pages: the SSR middleware does not rewrite them, so
the meta on disk is what crawlers see.
"""
import json
from urllib.parse import urljoin

import pytest

from conftest import BASE_URL

GUIDES = [
    ("guides/", "CollectionPage"),
    ("guides/find-deleted-tweets/", "Article"),
    ("guides/find-deleted-instagram-posts/", "Article"),
    ("guides/catfish-check-5-minutes/", "Article"),
    ("guides/evidence-pack-for-lawyers/", "Article"),
    ("guides/archivecheck-vs-waybacktweets/", "Article"),
    ("guides/archivecheck-vs-social-catfish/", "Article"),
    ("guides/changelog-v1-2-to-v1-5/", "Article"),
    ("guides/what-the-archive-cant-tell-you/", "Article"),
    ("guides/journalist-deleted-claim/", "Article"),
    ("guides/brand-monitoring-deleted-posts/", "Article"),
]

# CLI bleed: any of these strings on a public page is a failure.
# ("click" contains "cli" — that is why this list is word-level, not
# a substring match on "cli".)
CLI_BLEED = (
    "pip install",
    "pipx",
    "command line",
    "wayback-social archive",
    "wayback-social find",
    "wayback-social batch",
    "wayback-social diff",
    "wayback-social licence",
    "$ wayback-social",
)


@pytest.mark.parametrize("path,ld_type", GUIDES)
def test_guide_page_meta(page, path, ld_type):
    resp = page.goto(BASE_URL + "/" + path, wait_until="domcontentloaded")
    assert resp is not None and resp.status == 200, f"{path} -> {resp}"

    title = page.title()
    assert 30 <= len(title) <= 70, f"{path}: title {len(title)} chars: {title!r}"

    desc = page.locator('meta[name="description"]').first.get_attribute("content") or ""
    assert 50 <= len(desc) <= 160, f"{path}: description {len(desc)} chars"

    for prop in ("og:title", "og:description", "og:url", "og:type"):
        el = page.locator(f'meta[property="{prop}"]').first
        assert el.count() == 1 and el.get_attribute("content"), f"{path}: {prop} missing"

    card = page.locator('meta[name="twitter:card"]').first
    assert card.count() == 1 and card.get_attribute("content"), f"{path}: twitter:card missing"

    canon = page.locator('link[rel="canonical"]').first
    assert canon.count() == 1 and canon.get_attribute("href"), f"{path}: canonical missing"

    ld_raw = page.locator('script[type="application/ld+json"]').first.inner_text()
    data = json.loads(ld_raw)
    assert data.get("@type") == ld_type, f"{path}: JSON-LD @type {data.get('@type')!r}"
    label = data.get("headline") or data.get("name")
    assert label, f"{path}: JSON-LD has no headline/name"

    body = page.locator("body").inner_text()
    lowered = body.lower()
    for needle in CLI_BLEED:
        assert needle not in lowered, f"{path}: CLI bleed {needle!r}"
    assert "Found ≠ guilty" in body, f"{path}: honest-limits line missing"
    assert "Last updated 27 November 2026" in body, f"{path}: last-updated line missing"


@pytest.mark.parametrize("path,ld_type", GUIDES)
def test_guide_internal_links_resolve(page, path, ld_type):
    page.goto(BASE_URL + "/" + path, wait_until="domcontentloaded")
    hrefs = page.locator("a[href]").evaluate_all(
        "els => els.map(e => e.getAttribute('href'))"
    )
    seen = set()
    for href in hrefs:
        if not href or href.startswith(("http", "mailto:", "#")):
            continue
        url = urljoin(page.url, href)
        if url in seen:
            continue
        seen.add(url)
        resp = page.request.get(url)
        assert resp.status == 200, f"{path}: link {href} -> {url} -> {resp.status}"
    assert seen, f"{path}: no internal links found"


def test_footer_guides_links(page):
    page.goto(BASE_URL + "/", wait_until="domcontentloaded")
    assert page.locator('nav.footernav a[href="guides/index.html"]').count() == 1
    page.goto(BASE_URL + "/dashboard.html", wait_until="domcontentloaded")
    assert page.locator('a[href="guides/index.html"]').count() == 1


def test_sitemap_lists_guides(page):
    resp = page.request.get(BASE_URL + "/sitemap.xml")
    assert resp.status == 200
    text = resp.text()
    for slug in ("guides/", "find-deleted-tweets", "catfish-check-5-minutes",
                 "archivecheck-vs-waybacktweets", "changelog-v1-2-to-v1-5"):
        assert slug in text, f"sitemap missing {slug}"
