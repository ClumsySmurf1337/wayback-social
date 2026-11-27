"""Auth + Turnstile e2e tests (Clerk, issue #6).

Clerk dev app "Socialz" exists (verified 2026-11-27) and the dev
publishable key is wired into web/config.js, so the suite tests the
CONFIGURED state: the Clerk SDK loads, Sign in / Sign up render,
the free search still works signed out. Turnstile is still
unconfigured (no site key), so the page must make NO Turnstile
requests. The signed-in flows (link a licence, tier follows the
account) need the secret key + test users — see
docs/clerk-env-swap.md §11 for the post-deploy setup test.
"""
import pytest

from conftest import BASE_URL, goto, require_feature, shot, wait_for_search_done


def goto_dashboard(page, path="/dashboard.html"):
    page.goto(BASE_URL + path, wait_until="domcontentloaded")
    require_feature(page, "#tier-badge", "Dashboard (v1.5)")
    return page


def test_auth_ui_present_and_honest(page):
    goto(page)
    area = page.locator("#auth-area")
    area.wait_for(timeout=10_000)
    # The SDK loads async: wait for the area to settle out of
    # "loading" before judging it (up to 20s — the sandbox's egress
    # proxy is slow to fail a CDN fetch).
    try:
        page.wait_for_function(
            """() => {
                 const t = document.querySelector('#auth-area').innerText;
                 return !t.includes('loading');
               }""",
            timeout=20_000)
    except Exception:
        pass  # fall through: the assertion below judges the text
    text = area.inner_text()
    # Configured + SDK loaded: Sign in / Sign up buttons.
    # Unconfigured (no publishable key): honest "coming soon" copy.
    # Configured + CDN unreachable (this sandbox's egress proxy
    # blocks the jsDelivr fetch — ERR_TUNNEL_CONNECTION_FAILED):
    # the honest failure text naming the cause + the licence
    # fallback. All three are working states; a broken/empty auth
    # area is not.
    assert (("coming soon" in text) or ("Sign in" in text) or
            ("Sign-in failed to load" in text and "licence keys still work" in text)), text
    assert page.locator("#auth-modal").count() == 1
    assert page.locator("#auth-mount").count() == 1


def test_clerk_sdk_requested_when_configured_and_no_turnstile_requests(page):
    """Dev key wired (2026-11-27): the Clerk SDK IS requested from
    jsDelivr. Turnstile is still unconfigured, so no request to
    challenges.cloudflare.com may happen. The SDK request is an
    attempt, not a success — this sandbox's egress proxy blocks the
    jsDelivr fetch, so the settled UI is the honest failure text;
    the live render check belongs to the post-deploy setup test
    (docs/clerk-env-swap.md §11)."""
    external = []
    page.on("request", lambda r: external.append(r.url))
    goto(page)
    # Wait for the auth area to settle out of "loading" (SDK loaded
    # or failed) — at most 15s, then judge by what was attempted.
    try:
        page.locator("#auth-area").wait_for(timeout=10_000)
        page.wait_for_function(
            """() => {
                 const t = document.querySelector('#auth-area').innerText;
                 return !t.includes('loading');
               }""",
            timeout=15_000)
    except Exception:
        pass  # fall through to the request assertions below
    clerk_calls = [u for u in external if "cdn.jsdelivr.net/npm/@clerk" in u]
    assert clerk_calls != [], "Clerk SDK was never requested despite a wired dev key"
    turnstile_calls = [u for u in external
                       if "challenges.cloudflare.com" in u]
    assert turnstile_calls == [], turnstile_calls


def test_turnstile_widget_container_present_but_empty(page):
    goto(page)
    assert page.locator("#turnstile-widget").count() == 1
    # Unconfigured: no widget script is loaded, no iframe renders.
    assert page.locator("#turnstile-widget iframe").count() == 0


def test_signed_out_free_search_still_works(page):
    goto(page)
    page.click("#demo")
    wait_for_search_done(page)
    status = page.locator("#status").inner_text()
    # Either live results, the honest failure message (+ retry/sample
    # actions), or the labelled sample — never an auth wall.
    assert "Sign in" not in status, status
    assert status.strip() != "", status
    if "didn't complete" in status:
        page.wait_for_selector("#fail-actions:not([hidden])", timeout=15_000)
        page.click("#sample")
        page.wait_for_selector("#results tbody tr", timeout=15_000)
    shot(page, "auth-signed-out-search.png")


def test_dashboard_account_card_signed_out(page):
    goto_dashboard(page)
    card = page.locator("#account-card")
    card.wait_for(timeout=10_000)
    text = card.inner_text()
    assert "Not signed in" in text, text
    # Link form is hidden until signed in; licence box still works.
    assert page.locator("#link-licence-box").is_hidden()
    assert page.locator("#licence-key").count() == 1
    assert "Sign in" in text


def test_clerk_sdk_renders_sign_in_when_cdn_reachable(page):
    """Strict when reachable: if the Clerk SDK script itself returns 200,
    the auth area MUST render Sign in — the failure text is a bug, not a
    working state. 2026-11-27 the suite accepted the failure text and
    shipped two broken integrations (CSP blocked the SDK, then the code
    did `new window.Clerk(key)` although the v6 script bundle exposes
    an instance, not a constructor). When the CDN is blocked in this
    sandbox the SDK never returns 200 and this test skips — the live
    preview re-probe owns the proof there."""
    responses = []
    page.on("response", lambda r: responses.append(r))
    goto(page)
    area = page.locator("#auth-area")
    area.wait_for(timeout=10_000)
    try:
        page.wait_for_function(
            """() => {
                 const t = document.querySelector('#auth-area').innerText;
                 return !t.includes('loading');
               }""",
            timeout=20_000)
    except Exception:
        pass  # fall through: the SDK-status check below decides
    sdk_ok = [r for r in responses
              if "cdn.jsdelivr.net/npm/@clerk" in r.url and r.status == 200]
    if not sdk_ok:
        pytest.skip("Clerk SDK fetch did not return 200 here (CDN blocked) — live check owns this")
    text = area.inner_text()
    assert "Sign in" in text, text
    assert "failed to load" not in text, text
