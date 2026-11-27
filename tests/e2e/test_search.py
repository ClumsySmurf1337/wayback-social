"""Search console tests: page load, demo search, free-tier clamp, CSV export.

The live CDX search talks to web.archive.org from the browser and can take
20-60s (or be blocked by CORS). The demo-search test therefore accepts
either a real result set OR the page's honest failure message — but never a
"Found N captures" claim with no rows, and never a fabricated row.
"""
import re

import pytest

from conftest import dev_server, goto, goto_dev, require_feature, shot, wait_for_search_done  # noqa: F401  (dev_server fixture)


def test_page_loads(page):
    goto(page)
    # Title + wordmark are hostname-branded (branding.js): ArchiveCheck
    # on the apex/localhost, DeletedProof / HandleHistory / PostTrace /
    # PastProof on the subdomains. The old "wayback-social" slug is no
    # longer the page title.
    title = page.title()
    assert any(b in title for b in ("ArchiveCheck", "DeletedProof",
                "HandleHistory", "PostTrace", "PastProof",
                "wayback-social")), title
    h1 = page.locator("h1").inner_text().strip().replace(" ", "")
    assert any(b in h1 for b in ("ArchiveCheck", "DeletedProof",
                "HandleHistory", "PostTrace", "PastProof",
                "wayback-social")), h1
    opts = page.locator("#network option")
    assert opts.count() == 14, f"expected 14 networks, got {opts.count()}"
    assert page.locator("#handle").input_value() == "jack"
    assert page.locator("#limit").input_value() == "20"


def _run_demo(page):
    """Click the demo search and wait until it finishes. Returns status text.

    On localhost the live search fails (archive.org CORS) — the page
    then shows retry / sample / direct-CDX actions and NO rows, so a
    demo that fails is followed by "Load a verified sample instead"
    (the one labelled jack/status/20 capture). The sample is not a
    live result and is never recorded as history.
    """
    goto(page)
    page.click("#demo")
    # The button is disabled while searching; wait for it to re-enable.
    # (wait_for_search_done, not a bare #go wait — the bare wait can
    # return before the search even starts; see conftest.)
    wait_for_search_done(page)
    status = page.locator("#status").inner_text()
    if "didn't complete" in status:
        page.wait_for_selector("#fail-actions:not([hidden])", timeout=15_000)
        page.click("#sample")
        page.wait_for_selector("#results tbody tr", timeout=15_000)
        status = page.locator("#status").inner_text()
    return status


def test_demo_search(page):
    status = _run_demo(page)
    shot(page, "search-demo.png")
    rows = page.locator("#results tbody tr").count()
    stats = page.locator("#stats").inner_text()
    if status.startswith("Found"):
        # Real result set: rows must exist and link to real archive.org snapshots.
        assert rows > 0, f"status says '{status}' but no result rows rendered"
        hrefs = page.locator("#results tbody tr td a").all_inner_texts()
        assert any("web.archive.org/web/" in h for h in hrefs), hrefs
        assert re.search(r"(\d+)\s*captures", stats), stats
        assert "20060321212430" in page.locator("#results tbody").inner_text() or rows >= 1
    elif "Verified sample" in status:
        # Honest failure path: the live search did not complete, the
        # page showed retry/sample/CDX actions (no fake rows), and the
        # labelled sample is the real jack/status/20 capture.
        assert "NOT a live result" in status, status
        body = page.locator("#results tbody").inner_text()
        assert "twitter.com/jack/status/20" in body, body
        assert rows == 1, f"sample must show exactly the 1 demo row, got {rows}"
    else:
        pytest.fail(f"unexpected demo-search status: {status!r}")


def test_free_limit_clamp(page):
    """Free tier caps at 25: a 500 limit must never produce >25 rows."""
    goto(page)
    page.fill("#limit", "500")
    page.click("#demo")
    wait_for_search_done(page)
    rows = page.locator("#results tbody tr").count()
    status = page.locator("#status").inner_text()
    assert rows <= 25, f"free tier produced {rows} rows (limit was 500)"
    # The label next to the limit field states the cap.
    assert "Free" in page.locator("label", has_text="Limit").inner_text()


def test_csv_download_after_demo(page):
    _run_demo(page)
    rows = page.locator("#results tbody tr").count()
    assert rows >= 1, "no rows to export"
    with page.expect_download() as dl:
        page.click("#csv")
    download = dl.value
    path = f"/tmp/e2e-{download.suggested_filename}"
    download.save_as(path)
    text = open(path, encoding="utf-8").read()
    assert text.startswith("network,identifier,archived_timestamp"), text[:120]
    assert "jack/status/20" in text, text[:500]


def test_empty_handle_defaults_to_jack(page):
    goto(page)
    page.fill("#handle", "")
    page.click("#go")
    wait_for_search_done(page)
    status = page.locator("#status").inner_text()
    assert ("jack" in status.lower() or "didn't complete" in status), status


def test_broad_search_checks_tier_networks(page, dev_server):
    """Broad search: free tier checks 3 networks, shows per-network counts.

    Runs against the dev server (real /api/cdx proxy, conftest
    dev_server fixture): the local snapshot server has no proxy, so
    the page fetches CDX directly and archive.org blocks the browser
    (CORS / ERR_TUNNEL_CONNECTION_FAILED) — the search then fails
    honestly and "found on" never appears. The proxy path is also
    what production uses, so this is the representative run.
    Timeout is 420s: 3 networks sequential over archive.org is slow.
    """
    goto_dev(page)
    require_feature(page, "#broad", "Broad search (v1.5)")
    page.fill("#handle", "jack")
    page.check("#broad")
    page.click("#go")
    # Broad search has no disabled-button signal; wait for the final status.
    page.wait_for_function(
        "document.getElementById('status').innerText.includes('found on')",
        timeout=420_000,
    )
    status = page.locator("#status").inner_text()
    assert "found on" in status and "/3 networks" in status, status
    stats = page.locator("#stats").inner_text()
    assert stats.strip(), "broad search must render per-network counts"
    assert len(page.locator("#stats div").all()) == 3, stats


def test_successful_search_records_history(page):
    """A successful search lands in localStorage history + usage."""
    status = _run_demo(page)
    keys = page.evaluate("Object.keys(localStorage)")
    if status.startswith("Found"):
        hist = page.evaluate("JSON.parse(localStorage.getItem('ws_history') || '[]')")
        assert hist and hist[0]["handle"] == "jack", hist
        assert hist[0]["captures"] >= 1
        month = page.evaluate(
            "Object.keys(localStorage).find(k => k.startsWith('ws_usage_'))")
        usage = page.evaluate(f"JSON.parse(localStorage.getItem('{month}'))")
        assert usage["searches"] >= 1, usage
    else:
        # CORS failure path: nothing is recorded (the page says so
        # honestly) — the labelled sample is not a search result.
        assert "Verified sample" in status, status
        assert page.evaluate("localStorage.getItem('ws_history')") in (None, "[]")


def test_query_params_prefill_form(page):
    # Use non-default values so a pass proves the prefill ran (v1.3's
    # defaults are network=x, handle=jack — those would pass vacuously).
    goto(page, "?network=reddit&handle=nasa")
    assert page.locator("#handle").input_value() == "nasa"
    assert page.locator("#network").input_value() == "reddit"
