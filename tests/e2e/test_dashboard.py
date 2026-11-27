"""Dashboard tests — dashboard.html (localStorage-only, never uploaded).

The dashboard shows tier, usage this month, search history and the
licence box. History/usage are written by index.html searches into
localStorage (ws_history, ws_usage_YYYY-MM, ws_licence_tier).
"""
import json

import pytest

from conftest import BASE_URL, goto, require_feature, shot
from test_licence import mint, verify_on_page


def goto_dashboard(page, path="/dashboard.html"):
    page.goto(BASE_URL + path, wait_until="domcontentloaded")
    require_feature(page, "#tier-badge", "Dashboard (v1.5)")
    return page


def test_dashboard_loads_with_free_tier(page):
    goto_dashboard(page)
    # Title is hostname-branded (branding.js rewrites it on every
    # page), so the "dashboard" check is the URL, not the title.
    assert "dashboard" in page.url
    assert "Free tier" in page.locator("#tier-badge").inner_text()
    usage = page.locator("#usage").inner_text()
    assert "0" in usage and "web searches this month" in usage, usage
    assert "0 / 0" in usage, usage  # evidence packs used / included (Free: 0)
    assert page.locator("#history-empty").is_visible()
    assert "Cloudflare Web Analytics" in page.locator("body").inner_text()
    assert "never" in page.locator("body").inner_text().lower()
    shot(page, "dashboard.png")


def test_dashboard_history_from_localstorage(page):
    entry = [{
        "at": "2026-11-26T14:00:00.000Z", "network": "x",
        "handle": "jack", "captures": 1928,
    }]
    page.add_init_script(
        f"localStorage.setItem('ws_history', JSON.stringify({json.dumps(entry)}));"
    )
    goto_dashboard(page)
    assert not page.locator("#history-empty").is_visible()
    row = page.locator("#history tbody tr").first.inner_text()
    assert "jack" in row and "1928" in row, row
    link = page.locator('#history tbody tr a').first.get_attribute("href")
    assert "network=x" in link and "handle=jack" in link, link
    # Clear history empties the table and restores the empty message.
    page.click("#clear-history")
    assert page.locator("#history-empty").is_visible()
    assert page.evaluate("localStorage.getItem('ws_history')") in (None, "[]")


def test_dashboard_log_evidence_blocked_on_free(page):
    # Issue #15: free includes 0 evidence reports, so logging is blocked
    # from the first click — the button shows the Studio-feature reason
    # instead of incrementing (the old test expected "1 / 0", the
    # pre-#15 dumb-counter behaviour).
    goto_dashboard(page)
    before = page.locator("#usage").inner_text()
    assert "0 / 0" in before, before
    page.click("#log-evidence")
    after = page.locator("#usage").inner_text()
    assert "0 / 0" in after, after
    note = page.locator("#usage-note").inner_text()
    assert "Studio feature" in note, note
    assert "pricing" in note.lower(), note


def test_dashboard_log_evidence_increments_studio(page):
    # Issue #15: Studio includes 10 reports — logging counts up, and the
    # 11th log is blocked with the top-up prompt.
    key = mint("studio")
    goto_dashboard(page)
    page.fill("#licence-key", key)
    page.click("#licence-verify")
    page.wait_for_function(
        "document.getElementById('licence-status').innerText.includes('Demo key active')",
        timeout=15_000,
    )
    assert "Studio" in page.locator("#tier-badge").inner_text()
    assert "0 / 10" in page.locator("#usage").inner_text()
    page.click("#log-evidence")
    assert "1 / 10" in page.locator("#usage").inner_text()
    for _ in range(9):
        page.click("#log-evidence")
    assert "10 / 10" in page.locator("#usage").inner_text()
    page.click("#log-evidence")
    assert "10 / 10" in page.locator("#usage").inner_text()
    note = page.locator("#usage-note").inner_text()
    assert "used up" in note or "top-up" in note, note


def test_dashboard_licence_verify_pro(page):
    key = mint("pro")
    goto_dashboard(page)
    page.fill("#licence-key", key)
    page.click("#licence-verify")
    # Same overwrite as index (see test_licence.verify_on_page): the
    # final text for a demo key is "Demo key active: ...", not
    # "Licence verified".
    page.wait_for_function(
        "['Demo key active', 'Licence active', 'Licence verified', 'Invalid key'].some("
        "  t => document.getElementById('licence-status').innerText.includes(t))",
        timeout=15_000,
    )
    status = page.locator("#licence-status").inner_text()
    assert "Pro Pack" in status, status
    assert "Pro Pack" in page.locator("#tier-badge").inner_text()
    assert "2500" in page.locator("#usage").inner_text()
    # Dashboard and index share the tier (same localStorage keys).
    page.goto(BASE_URL + "/index.html", wait_until="domcontentloaded")
    page.wait_for_selector("#plans .plan")
    assert "Pro Pack" in page.locator("#tier-badge").inner_text()


def test_dashboard_bad_licence_rejected(page):
    goto_dashboard(page)
    page.fill("#licence-key", "DP1-STUDIO-AAAAAAAAAAAAAAAA-00000000")
    page.click("#licence-verify")
    page.wait_for_function(
        "document.getElementById('licence-status').innerText.includes('Invalid key')",
        timeout=15_000,
    )
    assert "Free tier" in page.locator("#tier-badge").inner_text()


def test_no_console_errors_on_dashboard(page, dev_server):
    # The dashboard calls /api/* (runtime-config, evidence-usage) on
    # load, so it must run against the dev server — the plain static
    # server 404s /api/config and the browser logs it as a console
    # error. The dev server is the faithful local replica of
    # production (all /api/* routed). The Clerk CDN script (jsDelivr)
    # cannot load in sandboxed Chromium (the egress proxy blocks it;
    # curl reaches it and the deployed site loads it fine) — that one
    # environmental failure is ignored, not our code.
    from conftest import DEV_PORT
    errors = []

    def _on_console(m):
        if m.type == "error" and "cdn.jsdelivr.net" not in m.text:
            errors.append(m.text)

    page.on("console", _on_console)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"http://127.0.0.1:{DEV_PORT}/dashboard.html",
              wait_until="domcontentloaded")
    require_feature(page, "#tier-badge", "Dashboard (v1.5)")
    assert not errors, f"console/page errors on dashboard: {errors}"


def test_no_third_party_trackers(page):
    """Privacy claim: no third-party analytics/tracker requests on load."""
    goto(page)
    urls = []

    def _collect(request):
        urls.append(request.url)

    page.on("request", _collect)
    page.reload()
    page.wait_for_selector("#plans .plan")
    third = [u for u in urls if any(h in u for h in (
        "google-analytics", "googletagmanager", "hotjar", "segment",
        "mixpanel", "plausible", "clarity.ms", "facebook.net"))]
    assert not third, f"third-party trackers loaded: {third}"
