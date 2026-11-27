"""E2E: approved per-subdomain branding + issue 16-18 web improvements.

- Branding (docs/subdomain-branding.md): one page, brand swaps by
  hostname. Localhost is the apex host, so per-subdomain brands are
  driven through window.ArchiveBranding.applyBranding(document, host)
  in the real browser and asserted on the live DOM.
- Issue 16: no CLI command text anywhere on the web pages.
- Issue 17: a failed live search shows retry / direct-CDX / labelled
  sample — never fake rows as results.
- Issue 18: all-network search renders grouped per-network results.
"""
from conftest import goto, require_feature, shot


def test_branding_applies_per_hostname(page):
    goto(page)
    require_feature(page, "#search-hero", "Branding wiring (v1.5+branding)")
    cases = {
        "deletedproof.northforgelabs.dev": ("apex", "ArchiveCheck", None),
        "app.deletedproof.northforgelabs.dev": ("app", "DeletedProof", None),
        "verify.deletedproof.northforgelabs.dev": ("verify", "HandleHistory", "catfish"),
        "osint.deletedproof.northforgelabs.dev": ("osint", "PostTrace", "journalist"),
        "legal.deletedproof.northforgelabs.dev": ("legal", "PastProof", "legal"),
    }
    for host, (key, word, preset) in cases.items():
        state = page.evaluate("""(host) => {
            const b = window.ArchiveBranding.applyBranding(document, host);
            const pressed = document.querySelector('[data-preset="catfish"],[data-preset="journalist"],[data-preset="legal"]');
            return { key: b.key, title: document.title,
                hero: document.getElementById('search-hero').textContent,
                brand: document.body.getAttribute('data-brand'),
                footer: document.querySelector('footer').textContent,
                broad: document.getElementById('broad').checked,
                accent: getComputedStyle(document.documentElement)
                    .getPropertyValue('--brand-accent').trim() };
        }""", host)
        assert state["key"] == key, (host, state)
        assert word in state["title"], (host, state)
        assert state["brand"] == key, (host, state)
        assert "Found ≠ guilty" in state["footer"], (host, state)
        assert state["accent"], (host, state)
        if preset:
            assert state["broad"] is True, (host, state)
            pressed = page.evaluate(
                f"document.querySelector('button[data-preset=\"{preset}\"]')"
                ".getAttribute('aria-pressed')")
            assert pressed == "true", (host, preset, pressed)
    shot(page, "branding-legal.png")


def test_preset_picker_activates_and_checks_broad(page):
    goto(page)
    require_feature(page, "#presets", "Preset picker (v1.5+branding)")
    page.click('button[data-preset="legal"]')
    assert page.locator('button[data-preset="legal"]').get_attribute("aria-pressed") == "true"
    assert page.locator("#broad").is_checked()
    desc = page.locator("#preset-desc").inner_text()
    assert "Evidence preservation" in desc and "Triage" in desc, desc
    page.click('button[data-preset="catfish"]')
    assert page.locator('button[data-preset="catfish"]').get_attribute("aria-pressed") == "true"
    assert "Catfish check" in page.locator("#preset-desc").inner_text()


def test_no_cli_text_on_pages(page):
    from conftest import BASE_URL
    goto(page)
    body = page.locator("body").inner_text()
    for banned in ("wayback-social archive", "pipx install",
                   "wayback-social batch", "use the CLI"):
        assert banned not in body, ("index", banned)
    # Dashboard has no pricing section, so goto()'s #plans wait does
    # not apply — navigate directly and wait for its own badge.
    page.goto(BASE_URL + "/dashboard.html", wait_until="domcontentloaded")
    page.wait_for_selector("#tier-badge", timeout=15_000)
    body = page.locator("body").inner_text()
    for banned in ("wayback-social archive", "pipx install",
                   "wayback-social batch"):
        assert banned not in body, ("dashboard", banned)


def test_failed_search_shows_retry_not_fake_rows(page):
    goto(page)
    page.route("**/cdx/search/cdx**", lambda route: route.abort())
    page.fill("#handle", "jack")
    page.click("#go")
    page.wait_for_selector("#fail-actions:not([hidden])", timeout=30_000)
    status = page.locator("#status").inner_text()
    assert "didn't complete" in status, status
    assert page.locator("#results tbody tr").count() == 0
    assert page.locator("#retry").is_visible()
    assert page.locator("#sample").is_visible()
    assert "web.archive.org/cdx" in page.locator("#cdx-link").get_attribute("href")
    page.click("#retry")
    page.wait_for_selector("#fail-actions:not([hidden])", timeout=30_000)
    assert "didn't complete" in page.locator("#status").inner_text()
    page.click("#sample")
    page.wait_for_function(
        "document.getElementById('status').innerText.includes('NOT a live result')",
        timeout=10_000)
    assert page.locator("#results tbody tr").count() == 1
    assert "twitter.com/jack/status/20" in page.locator("#results tbody").inner_text()


def test_broad_search_renders_grouped_results(page):
    # Localhost has no CDX proxy and archive.org sends no CORS headers,
    # so a live broad search finds 0 networks in this browser. Mock the
    # CDX responses instead — this tests the grouped rendering, which is
    # the new code; the live path is covered by test_broad_search_*
    # (status + per-network counts) and by the CLI smoke in TEST-REPORT.
    goto(page)
    require_feature(page, "#broad", "Broad search (v1.5)")
    header = ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"]
    canned = {
        # One row-set per network, keyed on the FIRST pattern only —
        # later patterns for the same network must return header-only,
        # or the counts would double-count the same captures.
        "twitter.com/jack/status/": [
            ["com,twitter)/jack/status/20", "20060321212430", "https://twitter.com/jack/status/20", "text/html", "200", "A", "1"],
            ["com,twitter)/jack/status/21", "20060322000000", "https://twitter.com/jack/status/21", "text/html", "200", "B", "1"],
        ],
        "instagram.com/jack/p/": [
            ["com,instagram)/jack/p/abc", "20190601000000", "https://www.instagram.com/jack/p/abc", "text/html", "200", "C", "1"],
        ],
        "facebook.com/jack/posts/": [
            ["com,facebook)/jack/posts/1", "20200101000000", "https://www.facebook.com/jack/posts/1", "text/html", "200", "D", "1"],
        ],
    }
    def fulfill(route):
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(route.request.url).query).get("url", [""])[0]
        rows = [header]
        for needle, rs in canned.items():
            if needle in q:
                rows.extend(rs)
        route.fulfill(status=200, content_type="application/json",
                      body=__import__("json").dumps(rows))
    page.route("**/cdx/search/cdx**", fulfill)
    page.fill("#handle", "jack")
    page.check("#broad")
    page.click("#go")
    page.wait_for_function(
        "document.getElementById('status').innerText.includes('found on')",
        timeout=60_000)
    status = page.locator("#status").inner_text()
    assert "found on 3/3 networks" in status, status
    groups = page.locator("#broad-results h3").all_inner_texts()
    assert len(groups) == 3, groups
    assert any("X / Twitter — 2 captures" in g for g in groups), groups
    assert any("Instagram — 1 capture" in g for g in groups), groups
    assert any("Facebook — 1 capture" in g for g in groups), groups
    links = page.locator("#broad-results tbody tr td a").all_inner_texts()
    assert any("web.archive.org/web/" in h for h in links), links
    assert "twitter.com/jack/status/20" in page.locator("#broad-results").inner_text()
