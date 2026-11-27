"""E2E: dashboard server wiring (issue #15 follow-up, Track L) —
web/dashboard-server.js against the local dev server with MOCKED
/api/evidence-usage and /api/billing-portal answers. The point
here is the UI: the server count merges with the local count
honestly, a logged report mirrors server-side, and the billing
portal opens a real session URL or says why it cannot — never a
fake link. The endpoints themselves are covered by
functions/api/evidence-usage.test.mjs and
functions/api/billing-portal.test.mjs; the wiring logic by
web/dashboard-server.test.js.

Licence keys are demo keys minted by the CLI with the public demo
secret (same as test_osint_tools.py) — never purchases.
"""
import json

import pytest

from conftest import dev_server, page  # noqa: F401

DASHBOARD = "http://127.0.0.1:8902/dashboard.html"
PORTAL_URL = "https://billing.stripe.com/p/session/test_123"


def mock_evidence_usage(page, server_used=3, posts=None):
    """GET -> the server count; POST -> record the increment, answer
    with the new server count."""
    def fulfill(route):
        req = route.request
        if req.method == "POST":
            if posts is not None:
                posts.append(json.loads(req.post_data or "{}"))
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps(
                              {"ok": True, "used": server_used + 1, "included": 10,
                               "remaining": 9, "tier": "studio", "status": "active",
                               "source": "server", "verified": True}))
            return
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps(
                          {"used": server_used, "included": 10, "remaining": 7,
                           "tier": "studio", "status": "active",
                           "source": "server", "verified": True}))
    page.route("**/api/evidence-usage*", fulfill)


def mock_evidence_usage_404(page):
    def fulfill(route):
        route.fulfill(status=404, content_type="application/json",
                      body=json.dumps({"error": "no server record for this key"}))
    page.route("**/api/evidence-usage*", fulfill)


def mock_billing_portal(page, status=200):
    def fulfill(route):
        if status == 200:
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps(
                              {"portal_url": PORTAL_URL,
                               "return_url": "https://app.deletedproof.northforgelabs.dev/dashboard.html"}))
        else:
            route.fulfill(status=404, content_type="application/json",
                          body=json.dumps(
                              {"error": "no Stripe customer is linked to this licence yet"}))
    page.route("**/api/billing-portal*", fulfill)


def goto_dashboard(page):
    page.goto(DASHBOARD, wait_until="domcontentloaded")
    page.wait_for_selector("#licence-key", timeout=15_000)
    return page


def mint(page, tier="studio"):
    return page.evaluate("""async (tier) => {
      return await window.WAYBACK_LICENCE.mintKey(tier, window.WAYBACK_LICENCE.DEMO_SECRET);
    }""", tier)


def verify_on_page(page, key):
    page.fill("#licence-key", key)
    page.click("#licence-verify")
    page.wait_for_function(
        "['Demo key active', 'Licence active', 'Invalid key'].some("
        "  t => document.getElementById('licence-status').innerText.includes(t))",
        timeout=15_000)
    return page.locator("#licence-status").inner_text()


def test_server_count_merges_with_local(page, dev_server):
    mock_evidence_usage(page, server_used=3)
    mock_billing_portal(page)
    goto_dashboard(page)
    status = verify_on_page(page, mint(page, "studio"))
    assert "Studio" in status, status
    # The server says 3 used, this device says 0 — the stat shows
    # the higher (3) and the note names both numbers.
    page.wait_for_function(
        "document.getElementById('usage-server-note').innerText.includes('Server count: 3')",
        timeout=15_000)
    assert "3 / 10" in page.locator("#usage").inner_text()
    assert "this device: 0" in page.locator("#usage-server-note").inner_text()


def test_no_server_row_falls_back_to_local(page, dev_server):
    mock_evidence_usage_404(page)
    mock_billing_portal(page)
    goto_dashboard(page)
    status = verify_on_page(page, mint(page, "studio"))
    assert "Studio" in status, status
    page.wait_for_function(
        "document.getElementById('usage-server-note').innerText.includes('No server usage record')",
        timeout=15_000)
    assert "0 / 10" in page.locator("#usage").inner_text()


def test_log_report_mirrors_server_side(page, dev_server):
    posts = []
    mock_evidence_usage(page, server_used=0, posts=posts)
    mock_billing_portal(page)
    goto_dashboard(page)
    status = verify_on_page(page, mint(page, "studio"))
    assert "Studio" in status, status
    page.click("#log-evidence")
    # The local log (0 -> 1) mirrors to POST /api/evidence-usage
    # with the key + an idempotency key; the stat then shows the
    # server's updated count (1).
    page.wait_for_function(
        "document.getElementById('usage').innerText.includes('1 / 10')",
        timeout=15_000)
    assert len(posts) == 1
    assert posts[0]["key"].startswith("DP1-STUDIO-")
    assert posts[0]["idempotency_key"]


def test_billing_portal_opens_real_session(page, dev_server):
    mock_evidence_usage(page)
    mock_billing_portal(page, status=200)
    # The mocked portal URL is a real Stripe session URL shape, but
    # the session id is fake — Chromium cannot load it in this
    # sandbox and replaces the popup URL with chrome-error://. Route
    # it to a dummy page so the popup loads and its URL stays the
    # session URL the endpoint returned (the point of the test).
    # NOTE: page.context.route, not page.route — page.route only
    # covers requests from the dashboard page itself, and the
    # portal opens in a separate popup page (verified by probe:
    # page.route never fires for the popup, context.route does).
    page.context.route("**/billing.stripe.com/**",
                       lambda route: route.fulfill(
                           status=200, content_type="text/html",
                           body="<html><body>Stripe billing portal (mocked)</body></html>"))
    goto_dashboard(page)
    status = verify_on_page(page, mint(page, "studio"))
    assert "Studio" in status, status
    with page.expect_popup() as popup_info:
        page.click("#billing-portal-go")
    popup = popup_info.value
    assert popup.url == PORTAL_URL
    assert "Portal opened in a new tab" in page.locator("#billing-portal-status").inner_text()


def test_billing_portal_no_customer_is_honest(page, dev_server):
    mock_evidence_usage(page)
    mock_billing_portal(page, status=404)
    goto_dashboard(page)
    status = verify_on_page(page, mint(page, "studio"))
    assert "Studio" in status, status
    page.click("#billing-portal-go")
    page.wait_for_function(
        "document.getElementById('billing-portal-status').innerText.includes('No Stripe customer is linked')",
        timeout=15_000)
