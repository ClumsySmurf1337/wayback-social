"""Issue #21 exact repro (John's live report, 2026-11-26 15:18 EST).

On https://app.deletedproof.northforgelabs.dev, signed out, free tier,
From 20200101 To 20231231, search for juliawalterz on X, the live v1.3
site showed:
  - "Live search failed (archive.org may block browser requests / CORS)."
  - CLI fallback text + the 2006 demo sample shown as if it were the
    result (1 capture, 2006 — outside the requested 2020-2023 range).
  - Raw YYYYMMDD text boxes — no date picker.

This test reproduces the EXACT case locally through the dev-server
proxy (scripts/dev-server.mjs routes /api/cdx through the real Pages
Function, exactly as the deployed site does) and checks every
acceptance item from the issue. It runs against the REAL archive.org,
so it is slow (one CDX fetch is typically 30-90s) and can flake when
archive.org is down — a failure here must be re-run once before it is
called a product bug. Local-only evidence never closes #21; the live
check after the push is docs/push-readiness.md §2.

Run:
    .venv-e2e/bin/python -m pytest tests/e2e/test_issue21.py -v
"""
import pytest

from conftest import dev_server, goto_dev, page  # noqa: F401
from test_search_controls import set_dates

APP_HOST = "app.deletedproof.northforgelabs.dev"


def goto_app(page):
    """Load the console as the app. brand (DeletedProof) via X-Test-Host."""
    page.context.set_extra_http_headers({"X-Test-Host": APP_HOST})
    goto_dev(page)
    return page


def test_issue21_exact_case_juliawalterz(page, dev_server):
    goto_app(page)
    # Context: signed out, free tier, app. brand.
    assert page.evaluate("localStorage.getItem('ws_licence')") is None
    assert "Free tier" in page.locator("#tier-badge").inner_text()
    # Brand context: the page was served as app. (DeletedProof) — the
    # server-side injection is proven by the raw-HTML matrix
    # (docs/push-readiness.md §1). In the browser, branding.js
    # re-resolves from location.hostname (127.0.0.1 here → apex), so
    # the in-browser brand is driven the same way
    # test_branding_modes.py does it: applyBranding(document, host).
    brand = page.evaluate(
        "(host) => window.ArchiveBranding.applyBranding(document, host)",
        APP_HOST)
    assert brand["key"] == "app", brand
    assert "DeletedProof" in page.locator("h1").inner_text()

    # (1) Date picker present; From/To applied to the CDX query.
    assert page.evaluate("typeof window.flatpickr") == "function"
    assert page.evaluate("!!window.WS_DATEPICKERS")
    page.locator("#handle").fill("juliawalterz")
    page.locator("#network").select_option("x")
    set_dates(page)  # 2020-01-01 .. 2023-12-31
    assert page.locator("#from").input_value() == "20200101"
    assert page.locator("#to").input_value() == "20231231"

    cdx_urls = []
    page.on("request", lambda r: cdx_urls.append(r.url)
            if "/api/cdx" in r.url else None)
    page.locator("#go").click()

    # (5) Progress + Pause / Stop / Resume visible while it runs.
    page.wait_for_selector("#job-progress:not([hidden])", timeout=20_000)
    assert page.locator("#job-pause").is_enabled()
    assert page.locator("#job-stop").is_enabled()

    # (2) Free search works end-to-end via /api/cdx — real rows.
    page.wait_for_selector("#status:has-text('Found')", timeout=240_000)
    status = page.locator("#status").inner_text()
    assert "Found" in status and "capture(s)" in status, status
    assert "2006" not in status, status
    rows = page.locator("#results tbody tr")
    assert rows.count() > 0, "search found nothing"
    for i in range(rows.count()):
        cell = rows.nth(i).locator("td").first.inner_text()
        year = int(cell.split("-")[0])
        assert 2020 <= year <= 2023, f"row {i} outside range: {cell}"
    # The From/To were actually sent to the proxy.
    assert any("from=20200101" in u and "to=20231231" in u for u in cdx_urls), \
        f"CDX query missing the date range: {cdx_urls}"

    # (3) No demo sample posing as a result; (4) no CLI fallback text.
    body = page.locator("body").inner_text()
    for banned in ("pipx", "command line", "use the CLI",
                   "Prefer the command line", "Verified sample",
                   "wayback-social archive"):
        assert banned not in body, f"CLI/demo bleed: {banned!r} on page"
    # The 2006 sample row (jack/status/20, 2006-03-21) must not be
    # among the rows — the per-row year check above already proves it.
