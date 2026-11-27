"""E2E: Common Crawl as a web source (issue #8 follow-up, Track L) —
the source selector in the console search form.

Runs against the local dev server (scripts/dev-server.mjs, real
middleware + real /api/commoncrawl Function) with MOCKED CDX and
mocked Common Crawl answers — the point here is the UI, the source
labels, the merge/dedup and the honest-empty path, not the index's
uptime (it 504s on most attempts; the Function retries with
backoff). The proxy itself is covered by
functions/api/commoncrawl.test.mjs; the search wiring by
web/commoncrawl.test.js.
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
# Common Crawl rows: status/20 is the SAME capture (same timestamp
# + URL) as the Wayback row — "All archives" must dedupe it to one
# row, Wayback winning the tie; status/22 is Common-Crawl-only.
# The 8th column is the crawl id.
CC_ROWS = [
    ["com,twitter)/jack/status/20", "20210101000000",
     "https://twitter.com/jack/status/20", "text/html", "200", "A", "1",
     "CC-MAIN-2026-47"],
    ["com,twitter)/jack/status/22", "20220102000000",
     "https://twitter.com/jack/status/22", "text/html", "200", "C", "1",
     "CC-MAIN-2026-47"],
]


def mock_cdx(page):
    def fulfill(route):
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER] + X_ROWS))
    page.route("**/api/cdx*", fulfill)


def mock_commoncrawl(page, fail=False, empty=False):
    def fulfill(route):
        if fail:
            route.fulfill(status=504, content_type="application/json",
                          body=json.dumps(
                              {"error": "Common Crawl index didn't answer in time"}))
            return
        body = [HEADER] + ([] if empty else CC_ROWS)
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps(body))
    page.route("**/api/commoncrawl*", fulfill)


def mock_arquivo_empty(page):
    """Arquivo.pt answers empty (header-only) — in "All archives"
    it runs too, but must not contribute rows to the Common Crawl
    merge test (its own merge is test_arquivo.py). The goto forces
    ?arquivo=proxy so the step uses the mocked proxy URL instead of
    calling arquivo.pt directly (unreachable from this browser)."""
    def fulfill(route):
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER]))
    page.route("**/api/arquivo*", fulfill)


def mock_ghostarchive_empty(page):
    """Ghostarchive answers empty (header-only) — same reason as
    mock_arquivo_empty (its own merge is test_ghostarchive.py)."""
    def fulfill(route):
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps([HEADER]))
    page.route("**/api/ghostarchive*", fulfill)


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


def test_commoncrawl_only_search(page, dev_server):
    mock_cdx(page)
    mock_commoncrawl(page)
    goto(page)
    page.select_option("#source", "commoncrawl")
    status = run_search(page, "Found 2 capture(s)")
    assert "Common Crawl: 2" in status
    rows = page.locator("#results tbody tr")
    assert rows.count() == 2
    for i in range(2):
        cells = rows.nth(i).locator("td")
        assert cells.nth(4).inner_text() == "Common Crawl"
        # The snapshot link is the index record itself — Common
        # Crawl has no replay URL, and the test must not find a
        # Wayback link passed off as a CC capture.
        href = cells.nth(2).locator("a").get_attribute("href")
        assert "index.commoncrawl.org/CC-MAIN-2026-47-index" in href
    assert "web.archive.org" not in page.locator("#results").inner_text()


def test_all_archives_merges_and_dedups(page, dev_server):
    mock_cdx(page)
    mock_commoncrawl(page)
    mock_arquivo_empty(page)
    mock_ghostarchive_empty(page)
    goto(page)
    page.select_option("#source", "both")
    status = run_search(page, "Found 3 capture(s)")
    assert "Wayback: 2" in status and "Common Crawl: 1" in status
    rows = page.locator("#results tbody tr")
    assert rows.count() == 3
    sources = [rows.nth(i).locator("td").nth(4).inner_text()
               for i in range(3)]
    assert sources == ["Wayback", "Wayback", "Common Crawl"]
    hrefs = [rows.nth(i).locator("td").nth(2).locator("a").get_attribute("href")
             for i in range(3)]
    assert "web.archive.org" in hrefs[0]
    assert "index.commoncrawl.org" in hrefs[2]


def test_one_source_failing_leaves_the_other(page, dev_server):
    mock_cdx(page)
    mock_commoncrawl(page, fail=True)
    mock_arquivo_empty(page)
    mock_ghostarchive_empty(page)
    goto(page)
    page.select_option("#source", "both")
    status = run_search(page, "Found 2 capture(s)")
    assert "Common Crawl index didn't answer" in status
    assert page.locator("#results tbody tr").count() == 2


def test_commoncrawl_empty_is_honest_not_a_failure(page, dev_server):
    mock_cdx(page)
    mock_commoncrawl(page, empty=True)
    goto(page)
    page.select_option("#source", "commoncrawl")
    status = run_search(page, "No captures found")
    # An empty index answer is "no captures", not a failure: no
    # failure actions, no "didn't answer" text.
    assert "didn't answer" not in status
    assert page.locator("#fail-actions").is_hidden()


def test_commoncrawl_source_note(page, dev_server):
    goto(page)
    page.select_option("#source", "commoncrawl")
    note = page.locator("#source-note").inner_text()
    assert "Common Crawl" in note
    assert "index record" in note
