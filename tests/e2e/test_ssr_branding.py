"""E2E: server-side brand injection (docs/ssr-branding.md).

The Pages Function middleware (functions/_middleware.js) rewrites the
SERVED HTML per hostname, so a no-JS crawler — and a raw HTTP fetch —
sees the right <title> / meta / JSON-LD on every subdomain. These
tests fetch the raw bytes (page.request.get runs no JavaScript) and
assert the brand is already there, before any client code runs.

Local runs start scripts/dev-server.mjs on a scratch copy of web/ —
the dev server runs the real middleware, so this is the deployed path
minus Cloudflare. Live runs (run_e2e.py --live) fetch the real
subdomains instead; a live host still serving the old static title
fails here on purpose — that is the deploy-lag signal, not a test bug.
"""
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time

import pytest

from conftest import BASE_URL

REPO = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
BRANDS = json.load(open(os.path.join(REPO, "web", "brands.json")))["brands"]

CASES = {
    "deletedproof.northforgelabs.dev": "apex",
    "app.deletedproof.northforgelabs.dev": "app",
    "verify.deletedproof.northforgelabs.dev": "verify",
    "osint.deletedproof.northforgelabs.dev": "osint",
    "legal.deletedproof.northforgelabs.dev": "legal",
}


def _free_port():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


@pytest.fixture(scope="module")
def ssr_server():
    """Dev server (real middleware) on a snapshot of web/.

    Yields its base URL, or None when node is unavailable.
    """
    if shutil.which("node") is None:
        yield None
        return
    snap = tempfile.mkdtemp(prefix="e2e-ssr-web-")
    shutil.copytree(os.path.join(REPO, "web"), snap, dirs_exist_ok=True)
    port = _free_port()
    env = dict(os.environ, WEB_ROOT=snap)
    proc = subprocess.Popen(
        ["node", os.path.join(REPO, "scripts", "dev-server.mjs"),
         str(port)],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    deadline = time.time() + 15
    up = False
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                up = True
                break
        except OSError:
            if proc.poll() is not None:
                break
            time.sleep(0.2)
    if not up:
        proc.kill()
        raise RuntimeError("SSR dev server did not start")
    yield base
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    shutil.rmtree(snap, ignore_errors=True)


def _is_live():
    from urllib.parse import urlparse
    host = urlparse(BASE_URL).hostname or ""
    return host not in ("localhost", "127.0.0.1", "::1")


def _title(html):
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    return m.group(1).strip() if m else None


def _meta(html, key):
    import html as html_mod
    for tag in re.findall(r"<meta[^>]*>", html, re.I):
        # Values use double quotes and may contain apostrophes (& in
        # the served HTML is serialised as &amp;) — match to the SAME
        # quote that opened the value, then unescape like a browser.
        name = re.search(r"""(?:name|property)=(["'])(.*?)\1""", tag, re.I)
        content = re.search(r"""content=(["'])(.*?)\1""", tag, re.I)
        if name and content and name.group(2) == key:
            return html_mod.unescape(content.group(2))
    return None


def _json_ld(html):
    m = re.search(
        r"""<script[^>]+type=["']application/ld\+json["'][^>]*>(.*?)</script>""",
        html, re.S | re.I)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return "UNPARSABLE"


def _raw_get(page, url, host_header=None):
    """Raw bytes, no JavaScript — exactly what a crawler sees."""
    headers = {"X-Test-Host": host_header} if host_header else {}
    resp = page.request.get(url, headers=headers)
    return resp


@pytest.mark.parametrize("host,key", sorted(CASES.items()))
def test_raw_html_carries_the_brand(page, ssr_server, host, key):
    brand = BRANDS[key]
    if _is_live():
        # Live: the real subdomain must already serve the brand.
        # Skip (don't fail) a host that does not answer at all.
        resp = _raw_get(page, f"https://{host}/")
        if resp.status != 200:
            pytest.skip(f"{host} not reachable live (HTTP {resp.status})")
        html = resp.text()
        where = f"live {host}"
    else:
        if ssr_server is None:
            pytest.skip("node not available for the SSR dev server")
        resp = _raw_get(page, ssr_server + "/", host_header=host)
        assert resp.status == 200, (host, resp.status)
        html = resp.text()
        where = f"local {host}"
    assert _title(html) == brand["seoTitle"], (where, _title(html))
    assert _meta(html, "description") == brand["metaDescription"], where
    assert _meta(html, "og:title") == brand["seoTitle"], where
    assert _meta(html, "og:description") == brand["metaDescription"], where
    assert _meta(html, "og:site_name") == brand["name"], where
    assert _meta(html, "twitter:title") == brand["seoTitle"], where
    ld = _json_ld(html)
    assert isinstance(ld, dict), (where, ld)
    assert ld["name"] == brand["jsonLdName"], where
    assert ld["description"] == brand["metaDescription"], where
    assert len(ld.get("offers", [])) >= 4, where
    assert "wayback-social" not in _title(html), where


@pytest.mark.parametrize("host,key", sorted(CASES.items()))
def test_raw_dashboard_html_carries_the_brand(page, ssr_server, host, key):
    brand = BRANDS[key]
    if _is_live():
        resp = _raw_get(page, f"https://{host}/dashboard.html")
        if resp.status != 200:
            pytest.skip(f"{host}/dashboard.html not reachable live")
        html = resp.text()
        where = f"live {host}/dashboard.html"
    else:
        if ssr_server is None:
            pytest.skip("node not available for the SSR dev server")
        resp = _raw_get(page, ssr_server + "/dashboard.html",
                        host_header=host)
        assert resp.status == 200, (host, resp.status)
        html = resp.text()
        where = f"local {host}/dashboard.html"
    assert _title(html) == brand["dashboardTitle"], (where, _title(html))
    assert "wayback-social" not in _title(html), where


def test_raw_html_unknown_host_falls_back_to_apex(page, ssr_server):
    if _is_live():
        pytest.skip("unknown-host fallback is covered locally; "
                    "live has no unknown host to fetch")
    if ssr_server is None:
        pytest.skip("node not available for the SSR dev server")
    resp = _raw_get(page, ssr_server + "/",
                    host_header="someone-elses-site.example.com")
    assert resp.status == 200
    assert _title(resp.text()) == BRANDS["apex"]["seoTitle"]
    assert _meta(resp.text(), "og:site_name") == "ArchiveCheck"
