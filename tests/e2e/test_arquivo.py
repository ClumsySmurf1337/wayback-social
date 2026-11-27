"""E2E: Arquivo.pt as a web source (issue #8 follow-up) — the source
selector in the console search form.

Runs against the local dev server (scripts/dev-server.mjs, real
middleware + real /api/arquivo Function) with MOCKED CDX and mocked
Arquivo.pt answers — the point here is the UI, the source labels,
the merge/dedup and the tier gate, not the archives' uptime. The
proxy itself is covered by functions/api/arquivo.test.mjs; the
search wiring by web/arquivo.test.js.

Licence keys are demo keys minted by the CLI with the public demo
secret (same as test_osint_tools.py) — never purchases.
"""
import json

import pytest

from conftest import DEV_BASE, dev_server, page  # noqa: F401

HEADER = ["urlkey", "timestamp", "original", "mimetype",
          "statuscode", "digest", "length"]

# Wayback rows for X / jack (both X patterns return the same rows).
# NOTE: the URLs must match the Arquivo.pt rows exactly (twitter.com,
# not x.com) for the plain-dup test. A twitter.com row and an x.com
# row for the same post are ONE capture since Track K item 3
# (host-alias dedup in web/url-alias.js) — see test_url_mode.py for
# the alias case.
X_ROWS = [
    ["com,twitter)/jack/status/20", "20210101000000",
     "https://twitter.com/jack/status/20", "text/html", "200", "A", "1"],
    ["com,twitter)/jack/status/21", "20220101000000",
     "https://twitter.com/jack/status/21", "text/html", "200", "B", "1"],
]
# Arquivo.pt rows: status/20 is the SAME capture (same timestamp +
# URL) as the Wayback row — "Both" must dedupe it to one row,
# Wayback winning the tie; status/22 is Arquivo-only.
ARQ_ROWS = [
    ["twitter.com/jack/status/20", "20210101000000",
     "https://twitter.com/jack/status/20", "text/html", "200", "A", "1"],
    ["twitter.com/jack/status/22", "20220102000000",
     "https://twitter.com/jack/status/22", "text/html", "200", "C", "1"],
]


def mock_cdx(page):
    def fulfill(route):
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER] + X_ROWS))
    page.route("**/api/cdx*", fulfill)


def mock_arquivo(page, fail=False):
    def fulfill(route):
        if fail:
            route.fulfill(status=500, content_type="application/json",
                          body=json.dumps(
                              {"error": "Arquivo.pt answered HTTP 500"}))
            return
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER] + ARQ_ROWS))
    page.route("**/api/arquivo*", fulfill)


def mock_ghostarchive_empty(page):
    """Ghostarchive answers empty (header-only) — in "All archives"
    it runs too, but must not contribute rows to the Arquivo.pt
    merge test (its own merge is covered by test_ghostarchive.py)."""
    def fulfill(route):
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER]))
    page.route("**/api/ghostarchive*", fulfill)


def mock_commoncrawl_empty(page):
    """Common Crawl answers empty (header-only) — same reason as
    mock_ghostarchive_empty (its own merge is test_commoncrawl.py)."""
    def fulfill(route):
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER]))
    page.route("**/api/commoncrawl*", fulfill)


def goto_arquivo(page):
    """Dev server with both proxies forced (?cdx=proxy&arquivo=proxy)."""
    page.goto(DEV_BASE + "&arquivo=proxy", wait_until="domcontentloaded")
    page.wait_for_selector("#plans .plan", timeout=15_000)
    return page


def mint(page, tier="pro"):
    """Mint a demo key in the browser, with the page's own public demo
    secret (licence.js DEMO_SECRET) — a demo key, never a purchase."""
    return page.evaluate("""async (tier) => {
      return await window.WAYBACK_LICENCE.mintKey(tier, window.WAYBACK_LICENCE.DEMO_SECRET);
    }""", tier)


def verify_on_page(page, key):
    page.fill("#licence-key", key)
    page.click("#licence-verify")
    page.wait_for_function(
        "['Demo key active', 'Licence active', 'Licence verified', 'Invalid key'].some("
        "  t => document.getElementById('licence-status').innerText.includes(t))",
        timeout=15_000)
    return page.locator("#licence-status").inner_text()


def run_search(page, expect):
    page.click("#go")
    page.wait_for_function(
        "document.getElementById('status').innerText.includes(%s)" % json.dumps(expect),
        timeout=60_000)
    return page.locator("#status").inner_text()


def test_source_selector_present(page, dev_server):
    goto_arquivo(page)
    assert page.locator("#source").count() == 1
    assert page.locator("#source option").count() == 5
    assert page.locator("#source").input_value() == "wayback"
    assert page.locator("#keyword").count() == 1
    # Keyword starts disabled (Wayback selected, no keyword yet).
    assert page.locator("#keyword").is_disabled()
    assert page.locator("#source-note").count() == 1
    # Selecting Arquivo.pt enables the keyword input and says so.
    page.select_option("#source", "arquivo")
    assert not page.locator("#keyword").is_disabled()
    assert "Arquivo.pt" in page.locator("#source-note").inner_text()


def test_arquivo_only_search(page, dev_server):
    mock_cdx(page)
    mock_arquivo(page)
    goto_arquivo(page)
    page.select_option("#source", "arquivo")
    status = run_search(page, "Found 2 capture(s)")
    assert "Arquivo.pt: 2" in status
    rows = page.locator("#results tbody tr")
    assert rows.count() == 2
    for i in range(2):
        cells = rows.nth(i).locator("td")
        assert cells.nth(4).inner_text() == "Arquivo.pt"
        assert "arquivo.pt/wayback/" in cells.nth(2).locator("a").get_attribute("href")
    # No Wayback link anywhere in the Arquivo-only table.
    assert "web.archive.org" not in page.locator("#results").inner_text()


def test_both_merges_and_dedups(page, dev_server):
    mock_cdx(page)
    mock_arquivo(page)
    mock_ghostarchive_empty(page)
    mock_commoncrawl_empty(page)
    goto_arquivo(page)
    page.select_option("#source", "both")
    status = run_search(page, "Found 3 capture(s)")
    assert "Wayback: 2" in status and "Arquivo.pt: 1" in status
    rows = page.locator("#results tbody tr")
    assert rows.count() == 3
    sources = [rows.nth(i).locator("td").nth(4).inner_text()
               for i in range(3)]
    # The shared capture (status/20) is labelled Wayback; the
    # Arquivo-only capture (status/22) is labelled Arquivo.pt.
    assert sources == ["Wayback", "Wayback", "Arquivo.pt"]
    hrefs = [rows.nth(i).locator("td").nth(2).locator("a").get_attribute("href")
             for i in range(3)]
    assert "web.archive.org" in hrefs[0]
    assert "arquivo.pt/wayback/" in hrefs[2]


def test_one_source_failing_leaves_the_other(page, dev_server):
    mock_cdx(page)
    mock_arquivo(page, fail=True)
    mock_ghostarchive_empty(page)
    mock_commoncrawl_empty(page)
    goto_arquivo(page)
    page.select_option("#source", "both")
    status = run_search(page, "Found 2 capture(s)")
    assert "Arquivo.pt didn't answer" in status
    assert page.locator("#results tbody tr").count() == 2


def test_keyword_blocked_on_free_tier(page, dev_server):
    mock_cdx(page)
    mock_arquivo(page)
    goto_arquivo(page)
    page.select_option("#source", "arquivo")
    page.fill("#keyword", "twttr")
    page.click("#go")
    page.wait_for_selector("#dlgTitle", timeout=5_000)
    assert "Keyword search needs Pro" in page.locator("#dlgTitle").inner_text()
    # No search ran: the results table stays hidden.
    assert page.locator("#results").is_hidden()


def test_keyword_works_with_pro_key(page, dev_server):
    mock_cdx(page)
    mock_arquivo(page)
    goto_arquivo(page)
    status = verify_on_page(page, mint(page, "pro"))
    assert "Pro" in status, status
    page.select_option("#source", "arquivo")
    page.fill("#keyword", "twttr")
    status = run_search(page, "Found 2 capture(s)")
    assert "Arquivo.pt: 2" in status
    rows = page.locator("#results tbody tr")
    assert rows.count() == 2
    assert rows.nth(0).locator("td").nth(4).inner_text() == "Arquivo.pt"


def test_arquivo_unsupported_network(page, dev_server):
    mock_cdx(page)
    mock_arquivo(page)
    goto_arquivo(page)
    page.select_option("#network", "instagram")
    page.select_option("#source", "arquivo")
    page.click("#go")
    page.wait_for_function(
        "document.getElementById('status').innerText.includes(\"Arquivo.pt can't list\")",
        timeout=15_000)
    assert "Instagram" in page.locator("#status").inner_text()
    assert page.locator("#results").is_hidden()
