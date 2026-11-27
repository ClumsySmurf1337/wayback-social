"""Search-controls acceptance (John's screenshot test, issue #21/#22).

A signed-out free user on the console must be able to:
  1. pick dates with a real date picker (no raw YYYYMMDD typing);
  2. run a free search that WORKS end-to-end via the /api/cdx proxy —
     real rows, not the demo sample — with From/To applied;
  3. see progress + Pause / Stop / Resume while the search runs;
  4. see NO CLI fallback text anywhere, including the failure path;
  5. never be shown the verified sample as a result when it falls
     outside the chosen date range.

These tests run against the REAL proxy path and REAL archive.org:
a local dev server (scripts/dev-server.mjs) serves web/ and routes
/api/cdx through the real Pages Function handler — no mocked CDX.
archive.org is slow (one CDX fetch is typically 30–90s), so the
search tests carry long explicit timeouts and the whole file takes
roughly 5 minutes. Run:

    .venv-e2e/bin/python -m pytest tests/e2e/test_search_controls.py -v

The live deploy is the final proof (see docs/web-search-ux.md §6):
the same flow must pass on app.deletedproof.northforgelabs.dev
after the batched push — local-only evidence never closes #21/#22.
"""
import json
import time

import pytest

# Fixtures: page (browser), dev_server (real /api/cdx proxy on 8902)
# and goto_dev (navigate to it) all live in conftest.py.
from conftest import dev_server, goto_dev, page  # noqa: F401


def set_dates(page, frm="2020-01-01", to="2023-12-31"):
    page.evaluate(
        """([f, t]) => {
            const d = window.WS_DATEPICKERS;
            if (f) d.from.setDate(f);
            if (t) d.to.setDate(t);
        }""",
        [frm, to],
    )


def delay_first_cdx(page, seconds=25):
    """Delay the first /api/cdx request so Pause/Stop can be exercised
    while a search is visibly in flight. Later requests pass through."""
    state = {"delayed": False}

    def _handler(route):
        if not state["delayed"]:
            state["delayed"] = True
            time.sleep(seconds)
        route.continue_()

    page.route("**/api/cdx*", _handler)


def test_date_picker_sets_yyyymmdd(page, dev_server):
    goto_dev(page)
    assert page.evaluate("typeof window.flatpickr") == "function", \
        "flatpickr did not load (vendored web/vendor/flatpickr/)"
    assert page.evaluate("!!window.WS_DATEPICKERS"), \
        "date pickers not initialised"
    set_dates(page)
    assert page.locator("#from").input_value() == "20200101"
    assert page.locator("#to").input_value() == "20231231"
    # The human-readable field shows the picked date, not YYYYMMDD.
    assert "January 1, 2020" in page.locator("#from + input").input_value()
    assert "December 31, 2023" in page.locator("#to + input").input_value()
    # Clear button empties the field (and the picker).
    page.locator("#from-clear").click()
    assert page.locator("#from").input_value() == ""
    assert page.evaluate("window.WS_DATEPICKERS.from.selectedDates.length") == 0
    # Typing an ISO date into the visible field must parse exactly —
    # flatpickr's built-in Ymd parser mis-read "2023-12-31" as
    # 2023-01-01 (see parsePickerDate in console.js).
    page.locator("#to + input").fill("2023-06-15")
    page.locator("#to + input").press("Enter")
    assert page.locator("#to").input_value() == "20230615"
    page.locator("#to + input").fill("20231231")
    page.locator("#to + input").press("Enter")
    assert page.locator("#to").input_value() == "20231231"


def test_free_search_via_proxy_with_date_range(page, dev_server):
    """Acceptance core: free, signed-out, dated search, real rows."""
    goto_dev(page)
    assert page.evaluate("localStorage.getItem('ws_licence')") is None
    assert "Free tier" in page.locator("#tier-badge").inner_text()
    page.locator("#handle").fill("jack")
    page.locator("#network").select_option("x")
    set_dates(page)
    page.locator("#go").click()
    # Progress is visible while archive.org thinks.
    page.wait_for_selector("#job-progress:not([hidden])", timeout=20_000)
    assert "done" in page.locator("#job-text").inner_text()
    # Real rows, in the chosen range, via the proxy.
    page.wait_for_selector("#status:has-text('Found')", timeout=240_000)
    status = page.locator("#status").inner_text()
    assert "Found 20 capture(s)" in status, status
    assert "2006" not in status
    rows = page.locator("#results tbody tr")
    assert rows.count() == 20, f"expected 20 rows, got {rows.count()}"
    for i in range(rows.count()):
        cell = rows.nth(i).locator("td").first.inner_text()
        year = int(cell.split("-")[0])
        assert 2020 <= year <= 2023, f"row {i} outside range: {cell}"
    # The proxy was actually used (not a direct CDX fetch, not demo).
    used_proxy = page.evaluate(
        "() => performance.getEntriesByType('resource')"
        ".map(e => e.name).some(n => n.includes('/api/cdx'))")
    assert used_proxy, "no /api/cdx request was made"
    # No CLI fallback, no demo sample anywhere on the page.
    body = page.locator("body").inner_text()
    for banned in ("pipx", "command line", "use the CLI",
                   "Prefer the command line", "Verified sample"):
        assert banned not in body, f"CLI/demo bleed: {banned!r} on page"


def test_pause_resume_during_search(page, dev_server):
    goto_dev(page)
    delay_first_cdx(page)
    page.locator("#handle").fill("jack")
    page.locator("#network").select_option("x")
    set_dates(page)
    page.locator("#go").click()
    page.wait_for_selector("#job-progress:not([hidden])", timeout=20_000)
    page.locator("#job-pause").click()
    page.wait_for_selector("#job-text:has-text('paused')", timeout=10_000)
    assert page.locator("#job-resume").is_enabled()
    page.locator("#job-resume").click()
    page.wait_for_selector("#status:has-text('Found')", timeout=240_000)
    assert page.locator("#results tbody tr").count() > 0


def test_stop_keeps_partial_results_then_resume(page, dev_server):
    goto_dev(page)
    delay_first_cdx(page)
    page.locator("#handle").fill("jack")
    page.locator("#network").select_option("x")
    set_dates(page)
    page.locator("#go").click()
    page.wait_for_selector("#job-progress:not([hidden])", timeout=20_000)
    page.locator("#job-stop").click()
    page.wait_for_selector("#status:has-text('stopped')", timeout=15_000)
    assert "partial" in page.locator("#status").inner_text().lower() \
        or "no results yet" in page.locator("#status").inner_text().lower()
    # Resume continues with the remaining patterns and completes.
    page.locator("#job-resume").click()
    page.wait_for_selector("#status:has-text('Found')", timeout=240_000)
    assert page.locator("#results tbody tr").count() > 0


def test_stop_resume_with_mocked_cdx(page, dev_server):
    """Same Stop/Resume flow as above, but with a mocked CDX (no
    archive.org). The live variant proves the real archive; this one
    proves the resume MACHINERY — Stop, resume, finishSearch,
    renderRows — so a live failure can be told apart from a
    regression in the extracted render-rows.js. Added 2026-11-27
    (Track K) after the live variant failed 3× in one window while
    archive.org was answering slowly (CDX 200 in ~13s)."""
    goto_dev(page)
    header = ["urlkey", "timestamp", "original", "mimetype",
              "statuscode", "digest", "length", "filename"]
    rows = [header,
            ["x.com", "20210101000000", "https://x.com/jack/status/20",
             "text/html", "200", "abc", "1000", ""],
            ["x.com", "20220101000000", "https://x.com/jack/status/20",
             "text/html", "200", "def", "1000", ""]]
    # Hang the FIRST CDX attempt (never fulfil it) and answer every
    # later one instantly. A sleep-based delay does NOT work here:
    # in the sync Playwright API the route handler's sleep blocks the
    # test thread, so by the time the test can click Stop the instant
    # mock has already finished the job (probe 2026-11-27: search
    # showed "Found 2 capture(s)" at t+16.9s, Stop already disabled).
    # Hanging the first attempt keeps the job in "running" with Stop
    # enabled until the test stops it; the abort cancels the hung
    # request, and Resume retries it — this time answered instantly.
    state = {"hung": False}

    def _handler(route):
        if not state["hung"]:
            state["hung"] = True
            return  # leave the request pending — Stop aborts it
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps(rows))

    page.route("**/api/cdx*", _handler)
    page.locator("#handle").fill("jack")
    page.locator("#network").select_option("x")
    set_dates(page)
    page.locator("#go").click()
    page.wait_for_selector("#job-progress:not([hidden])", timeout=20_000)
    page.locator("#job-stop").click()
    page.wait_for_selector("#status:has-text('stopped')", timeout=15_000)
    assert "partial" in page.locator("#status").inner_text().lower() \
        or "no results yet" in page.locator("#status").inner_text().lower()
    page.locator("#job-resume").click()
    page.wait_for_selector("#status:has-text('Found')", timeout=60_000)
    assert page.locator("#results tbody tr").count() == 2


def test_sample_respects_date_range(page, dev_server):
    """The 2006 sample must never pose as a result outside its range."""
    goto_dev(page)
    set_dates(page)  # 2020-01-01 .. 2023-12-31: the 2006 sample is out.
    page.evaluate("window.WS_MODES.loadSample()")
    status = page.locator("#status").inner_text()
    assert "outside" in status and "isn't shown as a result" in status, status
    assert "No rows are shown" in page.locator("#notice").inner_text()
    assert page.locator("#results tbody tr").count() == 0
    # In range, the same sample loads and is labelled NOT a live result.
    page.evaluate(
        "() => { document.getElementById('from').value = '';"
        " document.getElementById('to').value = '';"
        " window.WS_DATEPICKERS.from.clear();"
        " window.WS_DATEPICKERS.to.clear(); }")
    page.evaluate("window.WS_MODES.loadSample()")
    status = page.locator("#status").inner_text()
    assert "NOT a live result" in status, status
    assert "2006-03-21" in status
    assert page.locator("#results tbody tr").count() == 1
