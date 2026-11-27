"""E2E: single-post-URL mode (Track K item 2) — paste a post URL,
check that one post instead of a whole handle.

Runs against the local dev server (scripts/dev-server.mjs, real
middleware + real /api/cdx + /api/arquivo Functions). The mocked
tests prove the UI, the exact-URL pattern, the tier rule (no gate)
and the honest errors; the last test is ONE live probe through the
dev-server proxy on the real jack/status/20 post — it needs the
archives to be answering, and proves the exact-URL pattern works
end to end in a real browser.
"""
import json

import pytest

from conftest import DEV_BASE, dev_server, page  # noqa: F401

HEADER = ["urlkey", "timestamp", "original", "mimetype",
          "statuscode", "digest", "length"]

# Wayback rows for the exact post https://x.com/jack/status/20
# (plus a second capture of the same post).
X_ROWS = [
    ["com,x)/jack/status/20", "20240518094654",
     "https://x.com/jack/status/20", "text/html", "200", "A", "1"],
    ["com,x)/jack/status/20", "20240605152045",
     "https://x.com/jack/status/20", "text/html", "200", "B", "1"],
]
# Arquivo.pt row: the SAME capture (same timestamp + URL) as the
# first Wayback row, stored under x.com — Both must dedupe it to
# one row (host-alias dedup, Track K item 3), Wayback winning.
ARQ_ROWS = [
    ["x.com/jack/status/20", "20240518094654",
     "https://x.com/jack/status/20", "text/html", "200", "A", "1"],
]


def mock_cdx(page, seen):
    def fulfill(route):
        seen.append(route.request.url)
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER] + X_ROWS))
    page.route("**/api/cdx*", fulfill)


def mock_arquivo(page, seen):
    def fulfill(route):
        seen.append(route.request.url)
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER] + ARQ_ROWS))
    page.route("**/api/arquivo*", fulfill)


def mock_empty_source(page, seen, pattern):
    """Mock a source endpoint with zero rows (header-only CDX array).
    Used for Ghostarchive + Common Crawl in the Both test: since
    Track L, source=both means ALL archives, and those two steps
    would otherwise hit the real Functions and stall the job past
    the 60s wait. The point of the test is the exact-URL pattern
    through the CDX + Arquivo proxies, not those archives' uptime."""
    def fulfill(route):
        seen.append(route.request.url)
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER]))
    page.route(pattern, fulfill)


def goto_url_mode(page):
    """Dev server with both proxies forced (?cdx=proxy&arquivo=proxy)."""
    page.goto(DEV_BASE + "&arquivo=proxy", wait_until="domcontentloaded")
    page.wait_for_selector("#plans .plan", timeout=15_000)
    return page


def mint(page, tier="pro"):
    """Mint a demo key in the browser (public demo secret) — never a purchase."""
    return page.evaluate("""async (tier) => {
      return await window.WAYBACK_LICENCE.mintKey(tier, window.WAYBACK_LICENCE.DEMO_SECRET);
    }""", tier)


def run_search(page, expect, timeout=60_000):
    page.click("#go")
    page.wait_for_function(
        "document.getElementById('status').innerText.includes(%s)" % json.dumps(expect),
        timeout=timeout)
    return page.locator("#status").inner_text()


def test_url_input_present(page, dev_server):
    goto_url_mode(page)
    assert page.locator("#post-url").count() == 1
    assert page.locator("#post-url").input_value() == ""
    assert "x.com/jack/status/20" in (page.locator("#post-url").get_attribute("placeholder") or "")
    # The helper text says it works on every plan.
    assert "every plan" in page.locator("#search").inner_text()


def test_url_search_wayback_mocked(page, dev_server):
    seen = []
    mock_cdx(page, seen)
    mock_arquivo(page, seen)
    goto_url_mode(page)
    page.fill("#post-url", "https://x.com/jack/status/20")
    status = run_search(page, "Found 2 capture(s) of this post")
    assert "on X / Twitter." in status
    rows = page.locator("#results tbody tr")
    assert rows.count() == 2
    # The exact post URL went to the CDX proxy — no handle pattern.
    cdx_calls = [u for u in seen if "/api/cdx" in u]
    assert len(cdx_calls) == 1
    assert "url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F20" in cdx_calls[0]
    assert "status%2F*" not in cdx_calls[0]
    # Both rows are the same post; the snapshot links point at it.
    for i in range(2):
        cells = rows.nth(i).locator("td")
        assert "jack/status/20" in cells.nth(1).inner_text()
        assert cells.nth(4).inner_text() == "Wayback"


def test_url_search_both_mocked(page, dev_server):
    seen = []
    mock_cdx(page, seen)
    mock_arquivo(page, seen)
    mock_empty_source(page, seen, "**/api/ghostarchive*")
    mock_empty_source(page, seen, "**/api/commoncrawl*")
    goto_url_mode(page)
    page.select_option("#source", "both")
    page.fill("#post-url", "https://x.com/jack/status/20")
    status = run_search(page, "Found 2 capture(s) of this post")
    # Counts omit zero sources (render-rows.js): Wayback 2, and no
    # Arquivo.pt part because the Arquivo row deduped to zero. The
    # Arquivo step still RAN — asserted below via the fetch URLs.
    assert "Wayback: 2" in status
    assert "Arquivo.pt" not in status
    rows = page.locator("#results tbody tr")
    assert rows.count() == 2
    sources = [rows.nth(i).locator("td").nth(4).inner_text() for i in range(2)]
    assert sources == ["Wayback", "Wayback"]
    # The exact URL went through BOTH proxies.
    assert any("/api/cdx" in u and "url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F20" in u
               for u in seen)
    assert any("/api/arquivo" in u and "url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F20" in u
               for u in seen)


def test_bad_url_no_fetch(page, dev_server):
    seen = []
    mock_cdx(page, seen)
    mock_arquivo(page, seen)
    goto_url_mode(page)
    page.fill("#post-url", "not a url")
    page.click("#go")
    page.wait_for_function(
        "document.getElementById('status').innerText.includes(\"doesn't look like a post URL\")",
        timeout=15_000)
    assert seen == []
    assert page.locator("#results tbody tr").count() == 0


def test_url_plus_keyword_no_fetch(page, dev_server):
    seen = []
    mock_cdx(page, seen)
    mock_arquivo(page, seen)
    goto_url_mode(page)
    key = mint(page, "pro")
    page.fill("#licence-key", key)
    page.click("#licence-verify")
    page.wait_for_function(
        "document.getElementById('licence-status').innerText.includes('Demo key active')",
        timeout=15_000)
    page.select_option("#source", "both")
    page.fill("#keyword", "twttr")
    page.fill("#post-url", "https://x.com/jack/status/20")
    page.click("#go")
    page.wait_for_function(
        "document.getElementById('status').innerText.includes(\"can't be searched together\")",
        timeout=15_000)
    assert seen == []


def test_url_instagram_arquivo_only(page, dev_server):
    seen = []
    mock_cdx(page, seen)
    mock_arquivo(page, seen)
    goto_url_mode(page)
    page.select_option("#source", "arquivo")
    page.fill("#post-url", "https://www.instagram.com/p/abc123/")
    # The mocked Arquivo answer carries one row (ARQ_ROWS) — the
    # point is the gate is skipped and the row renders.
    status = run_search(page, "Found 1 capture(s) of this post")
    assert "on Instagram." in status
    # The per-handle-listing gate did NOT fire: /api/arquivo was called.
    assert any("/api/arquivo" in u for u in seen)


def test_url_mode_live_probe(page, dev_server):
    """ONE live probe: the real jack/status/20 post through the
    dev-server proxy, no mocks. Proves the exact-URL pattern works
    end to end in a real browser when the archives answer."""
    goto_url_mode(page)
    page.fill("#post-url", "https://x.com/jack/status/20")
    status = run_search(page, "capture(s) of this post", timeout=180_000)
    assert "on X / Twitter." in status
    rows = page.locator("#results tbody tr")
    assert rows.count() >= 1
    for i in range(rows.count()):
        cells = rows.nth(i).locator("td")
        assert "jack/status/20" in cells.nth(1).inner_text()
