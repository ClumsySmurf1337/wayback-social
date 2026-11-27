"""CSP guard: web/_headers must allow every third-party host the frontend loads.

2026-11-27: script-src was 'self' only, which blocked the Clerk SDK
(web/auth-ui.js loads clerk-js from jsDelivr) and broke sign-in on the
preview deploy — the SDK file itself loads fine, the browser refused it
under CSP. This test pins the allowances so a future _headers edit can't
silently break sign-in, Turnstile, or analytics again. It also cross-checks
the loader URLs in the JS: if a loader host changes, this test fails until
the CSP is updated to match.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEADERS = ROOT / "web" / "_headers"


def _csp():
    text = HEADERS.read_text()
    m = re.search(r"Content-Security-Policy:\s*(.+)", text)
    assert m, "no Content-Security-Policy in web/_headers"
    directives = {}
    for part in m.group(1).split(";"):
        part = part.strip()
        if not part:
            continue
        name, *sources = part.split()
        directives[name] = set(sources)
    return directives


def test_csp_allows_clerk_sdk_script():
    csp = _csp()
    assert "https://cdn.jsdelivr.net" in csp["script-src"]


def test_csp_allows_turnstile_script_frame_and_api():
    csp = _csp()
    assert "https://challenges.cloudflare.com" in csp["script-src"]
    assert "https://challenges.cloudflare.com" in csp["frame-src"]
    assert "https://challenges.cloudflare.com" in csp["connect-src"]


def test_csp_allows_clerk_frontend_api():
    csp = _csp()
    assert "https://*.clerk.accounts.dev" in csp["connect-src"]


def test_csp_allows_clerk_host_scripts():
    # clerk.load() may fetch UI code from the Frontend API host.
    csp = _csp()
    assert "https://*.clerk.accounts.dev" in csp["script-src"]


def test_csp_allows_analytics_beacon():
    csp = _csp()
    assert "https://static.cloudflareinsights.com" in csp["script-src"]
    assert "https://cloudflareinsights.com" in csp["connect-src"]


def test_csp_still_locks_down_framing_and_default():
    csp = _csp()
    assert csp["default-src"] == {"'self'"}
    assert csp["frame-ancestors"] == {"'none'"}


def test_csp_covers_every_loader_host_in_js():
    """Every https host a loader script fetches must be in the CSP."""
    csp = _csp()
    loaders = {
        "web/auth-ui.js": "script-src",  # Clerk SDK from jsDelivr
        "web/turnstile.js": "script-src",  # Turnstile api.js
        "web/analytics.js": "script-src",  # Web Analytics beacon
    }
    for rel, directive in loaders.items():
        src = (ROOT / rel).read_text()
        hosts = {f"https://{h}" for h in re.findall(r"https://([a-z0-9.*-]+)", src)}
        # Only the loader's own script host matters here (api hosts are
        # covered by the connect-src tests above).
        script_hosts = {h for h in hosts if h in csp["script-src"]}
        assert hosts <= csp["script-src"] | csp["connect-src"], (
            f"{rel} loads {sorted(hosts)} but CSP {directive} lacks one"
        )
        assert script_hosts, f"{rel}: no loader host found in CSP script-src"
