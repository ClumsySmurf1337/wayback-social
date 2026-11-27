"""Pricing, checkout switching, SEO and mobile-layout tests."""
import json

import pytest

from conftest import BASE_URL, _is_live, goto, shot


def test_pricing_cards_render_launch_prices(page):
    goto(page)
    cards = page.locator("#plans .plan")
    assert cards.count() == 6, f"expected 6 pricing cards, got {cards.count()}"
    text = page.locator("#plans").inner_text()
    for price in ("$0", "$9", "$19", "$49", "$59", "$15"):
        assert price in text, f"{price} missing from pricing cards: {text[:400]}"
    # Launch prices show the struck-through regular prices.
    for regular in ("$19", "$29", "$99", "$147"):
        assert regular in text, f"regular price {regular} missing: {text[:400]}"
    assert "Launch pricing" in page.locator("#launch-note").inner_text()
    shot(page, "pricing.png")


def test_feature_chart(page):
    goto(page)
    rows = page.locator("#chart tbody tr")
    assert rows.count() == 13, f"expected 13 chart rows, got {rows.count()}"
    text = page.locator("#chart").inner_text()
    assert "Evidence-pack reports included" in text
    # Studio evidence cell must be the finite pack (10), never "unlimited".
    studio_cell = page.locator(
        "#chart tbody tr:has-text('Evidence-pack reports included') td"
    ).nth(3).inner_text()
    assert studio_cell.strip() == "10", studio_cell
    assert "unlimited" not in text.lower()


def test_checkout_default_is_stripe(page):
    # Stripe became the live default (Track N, 2026-11-27); Paddle is
    # the alternative via ?checkout=paddle. (This test was
    # test_checkout_default_is_paddle before the Stripe-live change.)
    goto(page)
    note = page.locator("#plans").locator("xpath=following-sibling::p").first.inner_text()
    assert "Stripe" in note, note


def test_checkout_param_switches_provider(page):
    goto(page, "?checkout=stripe")
    note = page.locator("#plans").locator("xpath=following-sibling::p").first.inner_text()
    assert "Stripe" in note, note
    goto(page, "?checkout=gumroad")
    note = page.locator("#plans").locator("xpath=following-sibling::p").first.inner_text()
    assert "Gumroad" in note, note


def test_checkout_ab_split_is_sticky(page):
    goto(page, "?ab=paddle-stripe")
    note1 = page.locator("#plans").locator("xpath=following-sibling::p").first.inner_text()
    prov1 = "Paddle" if "Paddle" in note1 else ("Stripe" if "Stripe" in note1 else None)
    assert prov1 in ("Paddle", "Stripe"), note1
    page.reload()
    page.wait_for_selector("#plans .plan")
    note2 = page.locator("#plans").locator("xpath=following-sibling::p").first.inner_text()
    assert prov1 in note2, f"A/B pick not sticky within session: {note1!r} -> {note2!r}"


def test_buy_placeholder_shows_not_connected_dialog(page):
    # The placeholder dialog only exists for the UNCONNECTED provider.
    # The default is now live Stripe (real checkout popup), so the
    # test must run under ?checkout=paddle — the Paddle links are still
    # REPLACE_* placeholders and must show the dialog, never navigate.
    goto(page, "?checkout=paddle")
    opened = []

    def _on_popup(popup):
        opened.append(popup.url)

    page.on("popup", _on_popup)
    page.click('[data-plan="pro"]')
    page.wait_for_timeout(1500)
    assert not opened, f"buy opened a popup to {opened} — placeholder must not navigate"
    # <dialog> opened with showModal: check it is open, not just in the DOM.
    assert page.evaluate("document.getElementById('dlg').open") is True
    dlg = page.locator("#dlg")
    assert "not connected yet" in dlg.locator("#dlgTitle").inner_text().lower(), dlg.inner_text()
    body = dlg.locator("#dlgBody").inner_text()
    assert "Pro Pack" in body and "Paddle" in body, body


def test_free_plan_dialog(page):
    goto(page)
    page.click('[data-plan="free"]')
    dlg = page.locator("#dlg")
    assert "already in" in dlg.locator("#dlgTitle").inner_text(), dlg.inner_text()


def test_lemon_is_never_a_working_checkout(page):
    """?checkout=lemon must surface the closure warning, never a buy flow."""
    goto(page, "?checkout=lemon")
    note = page.locator("#plans").locator("xpath=following-sibling::p").first.inner_text()
    assert "closed" in note.lower(), note
    page.click('[data-plan="pro"]')
    dlg = page.locator("#dlg")
    assert "not connected yet" in dlg.locator("#dlgTitle").inner_text().lower()


def test_seo_tags_and_files(page, browser):
    goto(page)
    # Title is hostname-branded (ArchiveCheck on apex/localhost);
    # every brand title still names the job: finding deleted posts.
    assert "deleted" in page.title().lower(), page.title()
    desc = page.locator('meta[name="description"]').get_attribute("content")
    assert desc and len(desc) > 40, desc
    assert page.locator('meta[property="og:title"]').count() == 1
    assert page.locator('meta[name="twitter:card"]').count() == 1
    ld = page.locator('script[type="application/ld+json"]').inner_text()
    data = json.loads(ld)
    assert data["@type"] == "SoftwareApplication"
    assert len(data["offers"]) == 6, data["offers"]
    assert {o["price"] for o in data["offers"]} == {"0", "9", "19", "49", "59", "15"}
    # Fetch the files from the loaded page (same-origin fetch), not
    # via a separate APIRequestContext: in this sandbox the request
    # context's fresh connections through the test-only CONNECT
    # forwarder get reset (ECONNRESET) while the page's own fetches
    # succeed every time. The assertion is the same — the files must
    # return 200 with the right content — through the browser path a
    # real visitor uses.
    def _fetch(path):
        return page.evaluate(
            """async (p) => {
                const r = await fetch(p);
                return {status: r.status, text: await r.text()};
            }""",
            path,
        )

    robots = _fetch("/robots.txt")
    assert robots["status"] == 200, f"/robots.txt -> {robots['status']}"
    assert "User-agent" in robots["text"]
    sitemap = _fetch("/sitemap.xml")
    assert sitemap["status"] == 200, f"/sitemap.xml -> {sitemap['status']}"
    # Canonical host follows the deployed version: the sitemap lists
    # deletedproof.northforgelabs.dev since the canonical decision
    # (option b, 2026-11-27). The live v1.3 build still lists
    # wayback-social.pages.dev and the pre-retarget tree listed
    # deletedproof.pages.dev — both are accepted until the batched
    # push lands, after which the live copy will say
    # deletedproof.northforgelabs.dev.
    assert "<urlset" in sitemap["text"] and (
        "deletedproof.northforgelabs.dev" in sitemap["text"]
        or "deletedproof.pages.dev" in sitemap["text"]
        or "wayback-social.pages.dev" in sitemap["text"]
    ), sitemap["text"][:300]


def test_mobile_no_horizontal_overflow(browser):
    ctx = browser.new_context(viewport={"width": 390, "height": 844},
                              ignore_https_errors=_is_live())
    pg = ctx.new_page()
    pg.goto(BASE_URL, wait_until="domcontentloaded")
    pg.wait_for_selector("#plans .plan")
    overflow = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, f"horizontal overflow at 390px: {overflow}px"
    # Pricing cards stack vertically on mobile.
    boxes = [el.bounding_box() for el in pg.locator("#plans .plan").all()]
    assert len(boxes) == 6
    assert all(b and b["width"] <= 391 for b in boxes), boxes
    pg.screenshot(path="tests/e2e/screenshots/pricing-mobile.png", full_page=True)
    ctx.close()
