"""E2E: Ghostarchive as a web source (issue #8 follow-up, Track L) —
the source selector in the console search form.

Runs against the local dev server (scripts/dev-server.mjs, real
middleware + real /api/ghostarchive Function) with MOCKED CDX and
mocked Ghostarchive answers — the point here is the UI, the source
labels, the merge/dedup and the per-network gate, not
Ghostarchive's uptime. The proxy itself is covered by
functions/api/ghostarchive.test.mjs; the search wiring by
web/ghostarchive.test.js.
"""
import json

import pytest

from conftest import DEV_BASE, dev_server, page  # noqa: F401

HEADER = ["urlkey", "timestamp", "original", "mimetype",
          "statuscode", "digest", "length"]

# Wayback rows for X / jack.
X_ROWS = [
    ["com,twitter)/jack/status/20", "20210101000000",
     "https://twitter.com/jack/status/20", "text/html", "200", "A", "1"],
    ["com,twitter)/jack/status/21", "20220101000000",
     "https://twitter.com/jack/status/21", "text/html", "200", "B", "1"],
]
# Ghostarchive rows: status/20 is the SAME capture (same timestamp +
# URL) as the Wayback row — "All archives" must dedupe it to one
# row, Wayback winning the tie; status/22 is Ghostarchive-only.
# The 8th column is the /archive/<id> id.
GHOST_ROWS = [
    ["", "20210101000000",
     "https://twitter.com/jack/status/20", "", "", "", "", "AJzyo"],
    ["", "20220102000000",
     "https://twitter.com/jack/status/22", "", "", "", "", "Zpgdp"],
]


def mock_cdx(page):
    def fulfill(route):
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER] + X_ROWS))
    page.route("**/api/cdx*", fulfill)


def mock_ghostarchive(page, fail=False):
    def fulfill(route):
        if fail:
            route.fulfill(status=500, content_type="application/json",
                          body=json.dumps(
                              {"error": "Ghostarchive answered HTTP 500"}))
            return
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER] + GHOST_ROWS))
    page.route("**/api/ghostarchive*", fulfill)


def mock_arquivo_empty(page):
    """Arquivo.pt answers empty (header-only) — in "All archives"
    it runs too, but must not contribute rows to the Ghostarchive
    merge test (its own merge is test_arquivo.py). The goto forces
    ?arquivo=proxy so the step uses the mocked proxy URL instead of
    calling arquivo.pt directly (unreachable from this browser)."""
    def fulfill(route):
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER]))
    page.route("**/api/arquivo*", fulfill)


def mock_commoncrawl_empty(page):
    """Common Crawl answers empty (header-only) — same reason as
    mock_arquivo_empty (its own merge is test_commoncrawl.py)."""
    def fulfill(route):
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER]))
    page.route("**/api/commoncrawl*", fulfill)


def goto(page):
    # Force the Arquivo.pt proxy too (?arquivo=proxy): without it
    # the Arquivo.pt step calls arquivo.pt directly, which this
    # browser cannot reach — the step would hang on its 120s stall
    # bound and the test would time out.
    page.goto(DEV_BASE + "&arquivo=proxy", wait_until="domcontentloaded")
    page.wait_for_selector("#plans .plan", timeout=15_000)
    return page


def run_search(page, expect):
    page.click("#go")
    page.wait_for_function(
        "document.getElementById('status').innerText.includes(%s)" % json.dumps(expect),
        timeout=60_000)
    return page.locator("#status").inner_text()


def test_ghostarchive_only_search(page, dev_server):
    mock_cdx(page)
    mock_ghostarchive(page)
    goto(page)
    page.select_option("#source", "ghostarchive")
    status = run_search(page, "Found 2 capture(s)")
    assert "Ghostarchive: 2" in status
    rows = page.locator("#results tbody tr")
    assert rows.count() == 2
    for i in range(2):
        cells = rows.nth(i).locator("td")
        assert cells.nth(4).inner_text() == "Ghostarchive"
        assert "ghostarchive.org/archive/" in cells.nth(2).locator("a").get_attribute("href")
    # No Wayback link anywhere in the Ghostarchive-only table.
    assert "web.archive.org" not in page.locator("#results").inner_text()


def test_all_archives_merges_and_dedups(page, dev_server):
    mock_cdx(page)
    mock_ghostarchive(page)
    mock_arquivo_empty(page)
    mock_commoncrawl_empty(page)
    goto(page)
    page.select_option("#source", "both")
    status = run_search(page, "Found 3 capture(s)")
    assert "Wayback: 2" in status and "Ghostarchive: 1" in status
    rows = page.locator("#results tbody tr")
    assert rows.count() == 3
    sources = [rows.nth(i).locator("td").nth(4).inner_text()
               for i in range(3)]
    # The shared capture (status/20) is labelled Wayback; the
    # Ghostarchive-only capture (status/22) is labelled Ghostarchive.
    assert sources == ["Wayback", "Wayback", "Ghostarchive"]
    hrefs = [rows.nth(i).locator("td").nth(2).locator("a").get_attribute("href")
             for i in range(3)]
    assert "web.archive.org" in hrefs[0]
    assert "ghostarchive.org/archive/Zpgdp" in hrefs[2]


def test_one_source_failing_leaves_the_other(page, dev_server):
    mock_cdx(page)
    mock_ghostarchive(page, fail=True)
    mock_arquivo_empty(page)
    mock_commoncrawl_empty(page)
    goto(page)
    page.select_option("#source", "both")
    status = run_search(page, "Found 2 capture(s)")
    assert "Ghostarchive didn't answer" in status
    assert page.locator("#results tbody tr").count() == 2


def test_ghostarchive_unsupported_network(page, dev_server):
    mock_cdx(page)
    mock_ghostarchive(page)
    goto(page)
    page.select_option("#network", "instagram")
    page.select_option("#source", "ghostarchive")
    page.click("#go")
    page.wait_for_function(
        "document.getElementById('status').innerText.includes(\"Ghostarchive can't list\")",
        timeout=15_000)
    assert "Instagram" in page.locator("#status").inner_text()
    assert page.locator("#results").is_hidden()


def test_ghostarchive_source_note(page, dev_server):
    goto(page)
    page.select_option("#source", "ghostarchive")
    note = page.locator("#source-note").inner_text()
    assert "Ghostarchive" in note
    assert "uneven" in note
