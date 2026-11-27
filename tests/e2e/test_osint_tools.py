"""E2E: osint research tools (issue #13 follow-up) — batch, deleted
diff, evidence pack, citations, and per-host routing.

Runs against the local dev server (scripts/dev-server.mjs, real
middleware + real /api/live-check Function) with MOCKED CDX and
mocked live-check answers — the point here is the UI, the verdicts
and the gating, not archive.org's uptime. The verdict classification
itself is covered by functions/api/live-check.test.mjs; the batch /
diff / citation / pack builders are covered by
web/osint-tools.test.js + web/live-check.test.js.

Licence keys are demo keys minted by the CLI with the public demo
secret (same as test_licence.py) — never purchases.

Routing note: localhost cannot resolve the real subdomain hostnames
(/etc/hosts is read-only in the sandbox), so the per-brand routing
test drives window.WS_OSINT_TOOLS.init() after setting data-brand —
the same code path a real hostname takes (hostname -> brand is
covered by web/branding.test.js + the SSR middleware suite).
"""
import json

import pytest

from conftest import dev_server, goto_dev, page  # noqa: F401

HEADER = ["urlkey", "timestamp", "original", "mimetype",
          "statuscode", "digest", "length"]

# Canned CDX rows. The mock matches the `url` query param against the
# needles in order and returns the FIRST match only (the instagram
# profile needle is a prefix of the /p/ needle, so order matters).
# Both X patterns return the SAME x.com rows (as CDX does once the
# twitter.com -> x.com redirect is archived): the batch dedupes them
# to 3 captures, and the diff dedupes them to 3 posts.
X_ROWS = [
    ["com,x)/jack/status/20", "20210101000000",
     "https://x.com/jack/status/20", "text/html", "200", "A", "1"],
    ["com,x)/jack/status/21", "20220101000000",
     "https://x.com/jack/status/21", "text/html", "200", "B", "1"],
    ["com,x)/jack/status/22", "20220102000000",
     "https://x.com/jack/status/22", "text/html", "200", "C", "1"],
]
CANNED = [
    ("twitter.com/jack/status", X_ROWS),
    ("x.com/jack/status", X_ROWS),
    ("instagram.com/nasa/p/", [
        ["com,instagram)/nasa/p/abc", "20200601000000",
         "https://www.instagram.com/nasa/p/abc", "text/html", "200", "D", "1"],
    ]),
    ("instagram.com/nasa/reel/", []),
    ("instagram.com/nasa/", [
        ["com,instagram)/nasa/", "20200601000000",
         "https://www.instagram.com/nasa/", "text/html", "200", "E", "1"],
    ]),
]

# Live-check verdicts by post URL: one live, one deleted, one unknown.
VERDICTS = {
    "https://x.com/jack/status/20": ("live", "200"),
    "https://x.com/jack/status/21": ("deleted", "404"),
    "https://x.com/jack/status/22": ("unknown", "403"),
    "https://twitter.com/jack/status/20": ("live", "200"),
    "https://twitter.com/jack/status/21": ("deleted", "404"),
    "https://twitter.com/jack/status/22": ("unknown", "403"),
}


def mock_cdx(page):
    def fulfill(route):
        from urllib.parse import parse_qs, urlparse
        q = parse_qs(urlparse(route.request.url).query).get("url", [""])[0]
        rows = [HEADER]
        for needle, rs in CANNED:
            if needle in q:
                rows.extend(rs)
                break
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps(rows))
    page.route("**/api/cdx*", fulfill)


def mock_live_check(page):
    def fulfill(route):
        body = json.loads(route.request.post_data or "{}")
        results = []
        for url in body.get("urls", []):
            verdict, status = VERDICTS.get(url, ("live", "200"))
            results.append({"url": url, "live_verdict": verdict,
                            "live_http_status": status, "live_final_url": url,
                            "live_checked_at": "2026-11-27T00:00:00Z"})
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps({"results": results}))
    page.route("**/api/live-check", fulfill)


def mint(page, tier="pro"):
    """Mint a demo key in the browser, with the page's own public demo
    secret (licence.js DEMO_SECRET) — a demo key, never a purchase, and
    no secret string in this file."""
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


def open_tools(page):
    """Expand the research-tools section (collapsed on the apex host)."""
    page.click("#osint-toggle")
    page.wait_for_selector("#osint-panels:not([hidden])", timeout=5_000)


def show_tab(page, tab):
    page.click(f'[data-osint-tab="{tab}"]')
    page.wait_for_selector(f"#osint-panel-{tab}:not([hidden])", timeout=5_000)


def run_batch(page):
    mock_cdx(page)
    goto_dev(page)
    open_tools(page)
    show_tab(page, "batch")
    page.fill("#batch-lines",
              "x jack\ninstagram nasa\nbluesky bsky.app\ntiktok testuser")
    page.click("#batch-go")
    page.wait_for_function(
        "document.getElementById('batch-status').innerText.includes('Batch done')",
        timeout=60_000)
    return page.locator("#batch-status").inner_text()


def run_diff(page, network="x", handle="jack", posts=3):
    """Starter key + mocked CDX + mocked live-check -> `posts` verdicts."""
    mock_cdx(page)
    mock_live_check(page)
    goto_dev(page)
    status = verify_on_page(page, mint(page, "starter"))
    assert "Starter" in status, status
    open_tools(page)
    show_tab(page, "diff")
    page.select_option("#diff-network", network)
    page.fill("#diff-handle", handle)
    page.click("#diff-go")
    page.wait_for_function(
        "document.getElementById('diff-status').innerText.includes("
        f"'Posts: {posts}')",
        timeout=60_000)
    return page.locator("#diff-status").inner_text()


# --- Section + routing ------------------------------------------------------

def test_osint_section_present_and_collapsed_on_apex(page, dev_server):
    goto_dev(page)
    page.wait_for_selector("#osint-tools", timeout=10_000)
    assert page.locator("#osint-panels").is_hidden()
    assert "Research tools" in page.locator("#osint-toggle").inner_text()
    open_tools(page)
    assert page.locator("#osint-panel-batch").is_visible()
    assert page.locator("#osint-panel-diff").is_hidden()
    assert page.locator("#osint-panel-citations").is_hidden()


def test_routing_resolves_each_host(page, dev_server):
    goto_dev(page)
    resolved = page.evaluate("""() => {
      const r = window.ArchiveBranding.resolveBrand;
      return {
        apex: r("deletedproof.northforgelabs.dev"),
        app: r("app.deletedproof.northforgelabs.dev"),
        verify: r("verify.deletedproof.northforgelabs.dev"),
        osint: r("osint.deletedproof.northforgelabs.dev"),
        legal: r("legal.deletedproof.northforgelabs.dev"),
        testOsint: r("osint.deletedproof.northforgelabs.dev"),
      };
    }""")
    assert resolved == {"apex": "apex", "app": "app", "verify": "verify",
                        "osint": "osint", "legal": "legal",
                        "testOsint": "osint"}, resolved


@pytest.mark.parametrize("brand,tab", [
    ("osint", "batch"), ("legal", "citations"), ("app", "batch")])
def test_routing_opens_primary_mode_per_brand(page, dev_server, brand, tab):
    goto_dev(page)
    page.evaluate("""(brand) => {
      document.body.setAttribute("data-brand", brand);
      window.WS_OSINT_TOOLS.init();
    }""", brand)
    assert page.locator("#osint-panels").is_visible()
    assert page.locator(f"#osint-panel-{tab}").is_visible()


def test_routing_stays_collapsed_on_apex(page, dev_server):
    goto_dev(page)
    page.evaluate("""() => {
      document.body.setAttribute("data-brand", "apex");
      window.WS_OSINT_TOOLS.init();
    }""")
    assert page.locator("#osint-panels").is_hidden()


# --- Batch ------------------------------------------------------------------

def test_batch_mode_mocked_cdx(page, dev_server):
    status = run_batch(page)
    # Free tier caps the batch at 3 targets — the 4th line waits.
    assert "4 lines, tier cap 3" in status, status
    assert "2/3 targets found captures" in status, status
    results = page.locator("#batch-results").inner_text()
    # X: both patterns return the same 3 posts, deduped to 3 captures.
    assert "X / Twitter @jack — 3 captures" in results, results
    # Instagram: 1 post capture + 1 profile-page capture (batch counts
    # raw captures; only the diff skips non-post rows).
    assert "Instagram @nasa — 2 captures" in results, results
    assert "Bluesky @bsky.app — 0 captures" in results, results
    assert "No captures for this target." in results, results
    # Every rendered row keeps its snapshot link.
    assert page.locator('#batch-results a[href*="web.archive.org"]').count() >= 3
    assert page.locator("#batch-actions").is_visible()


def test_batch_csv_downloads_and_json_is_gated_on_free(page, dev_server):
    run_batch(page)
    with page.expect_download(timeout=15_000) as dl:
        page.click("#batch-csv")
    text = dl.value.path().read_text()
    assert text.startswith("network,identifier,archived_timestamp"), text[:80]
    assert "https://x.com/jack/status/20" in text
    page.click("#batch-json")
    page.wait_for_selector("#dlg:not([hidden])", timeout=5_000)
    assert "JSON export needs Starter" in page.locator("#dlgTitle").inner_text()


# --- Deleted diff -------------------------------------------------------------

def test_diff_mode_verdicts_and_only_deleted_filter(page, dev_server):
    status = run_diff(page)
    assert "live 1, deleted 1, unknown 1" in status, status
    rows = page.locator("#diff-results tr")
    assert rows.count() == 3, f"expected 3 diff rows, got {rows.count()}"
    text = page.locator("#diff-results").inner_text()
    assert "live" in text and "deleted" in text and "unknown" in text
    # Every row keeps its Wayback snapshot link.
    assert page.locator('#diff-results a[href*="web.archive.org"]').count() == 3
    # Only-deleted filter narrows to the one deleted post.
    page.check("#diff-only-deleted")
    page.wait_for_function(
        "document.querySelectorAll('#diff-results tr').length === 1",
        timeout=5_000)
    assert "status/21" in page.locator("#diff-results").inner_text()
    page.uncheck("#diff-only-deleted")
    page.wait_for_function(
        "document.querySelectorAll('#diff-results tr').length === 3",
        timeout=5_000)


def test_diff_skips_non_post_captures(page, dev_server):
    # Instagram: 1 post capture + 1 profile-page capture. The profile
    # row is skipped and counted — a 404 on a profile page is not a
    # deleted post (same rule as the CLI diff).
    status = run_diff(page, network="instagram", handle="nasa", posts=1)
    assert "live 1, deleted 0, unknown 0" in status, status
    assert "1 non-post capture(s) skipped" in status, status
    assert page.locator("#diff-results tr").count() == 1
    assert "instagram.com/nasa/p/abc" in page.locator("#diff-results").inner_text()


def test_diff_free_tier_blocked(page, dev_server):
    goto_dev(page)
    open_tools(page)
    show_tab(page, "diff")
    page.select_option("#diff-network", "x")
    page.fill("#diff-handle", "jack")
    page.click("#diff-go")
    page.wait_for_selector("#dlg:not([hidden])", timeout=5_000)
    assert "Deleted diff needs Starter" in page.locator("#dlgTitle").inner_text()
    assert "Starter" in page.locator("#diff-status").inner_text()
    assert page.locator("#diff-results tr").count() == 0


# --- Evidence pack ------------------------------------------------------------

def test_evidence_pack_gated_free_blocked_studio_allowed(page, dev_server):
    run_batch(page)
    # Free tier: 0 reports — blocked with the top-up prompt, no download.
    page.click("#batch-actions .evidence-pack-btn")
    page.wait_for_selector("#dlg:not([hidden])", timeout=5_000)
    assert "Evidence pack unavailable" in page.locator("#dlgTitle").inner_text()
    page.click("#dlg button")
    # Studio key: the pack downloads as a real ZIP.
    status = verify_on_page(page, mint(page, "studio"))
    assert "Studio" in status, status
    with page.expect_download(timeout=60_000) as dl:
        page.click("#batch-actions .evidence-pack-btn")
    download = dl.value
    assert download.suggested_filename.startswith("evidence_"), download.suggested_filename
    assert download.suggested_filename.endswith(".zip")
    data = download.path().read_bytes()
    assert data[:2] == b"PK", "download is not a ZIP file"
    assert b"manifest.json" in data and b"manifest.sha256" in data


# --- Citations ------------------------------------------------------------------

def test_citations_export_and_disclaimer(page, dev_server):
    run_diff(page)
    show_tab(page, "citations")
    panel = page.locator("#osint-panel-citations")
    assert "Triage, not court-ready" in panel.inner_text()
    assert "Found ≠ guilty" in panel.inner_text()
    page.click("#cite-build")
    page.wait_for_function(
        "document.getElementById('cite-output').value.length > 100",
        timeout=15_000)
    out = page.locator("#cite-output").input_value()
    assert "web.archive.org/web/20220101000000/https://x.com/jack/status/21" in out
    assert "live: deleted" in out
    assert "Triage, not court-ready" in out
    with page.expect_download(timeout=15_000) as dl:
        page.click("#cite-md")
    md = dl.value.path().read_text()
    assert "Triage, not court-ready" in md
    assert "https://x.com/jack/status/21" in md
    with page.expect_download(timeout=15_000) as dl2:
        page.click("#cite-csv")
    csv = dl2.value.path().read_text()
    assert csv.startswith("network,identifier,post_id"), csv[:80]
    assert "deleted" in csv
