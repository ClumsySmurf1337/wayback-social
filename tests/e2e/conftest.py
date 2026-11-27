"""Shared fixtures for the wayback-social / DeletedProof Playwright E2E suite.

Run via tests/e2e/run_e2e.py (starts a local server for you) or directly:

    E2E_BASE_URL=http://127.0.0.1:8901 \
      ~/workspace/wayback-social/.venv-e2e/bin/python -m pytest tests/e2e -v

The suite tests the page as it actually is. Features that do not exist yet
(dashboard / search history, licence-key input on the page, broad-find tab)
are covered by explicit NOT-IMPLEMENTED tests that fail honestly instead of
being skipped or faked.
"""
import os

import pytest

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - e2e needs its own venv
    # The default venv does not install Playwright (see run_e2e.py /
    # .venv-e2e). Skip the whole e2e directory there instead of
    # breaking `pytest tests/` collection for everyone.
    pytest.skip("playwright not installed (e2e needs .venv-e2e)",
                allow_module_level=True)

BASE_URL = os.environ.get("E2E_BASE_URL", "http://127.0.0.1:8901")


@pytest.fixture(scope="session")
def pw():
    with sync_playwright() as p:
        yield p


def _is_live():
    """True when BASE_URL is an external (non-localhost) deployment."""
    from urllib.parse import urlparse

    host = urlparse(BASE_URL).hostname or ""
    return host not in ("localhost", "127.0.0.1", "::1")


@pytest.fixture(scope="session")
def live_proxy():
    """Local CONNECT forwarder for live runs (see fwdproxy.py).

    Chrome in this sandbox cannot tunnel through the egress proxy
    directly (ERR_TUNNEL_CONNECTION_FAILED for every external site,
    while curl works) and its root store rejects all public TLS
    roots. For live runs only, route Chrome through a localhost
    forwarder that does the CONNECT with preemptive auth like curl.
    Local runs need no proxy at all (localhost is bypassed anyway).
    Yields the Playwright proxy dict, or {} for local runs.
    """
    import socket
    import subprocess
    import sys
    import time

    if not _is_live():
        yield {}
        return
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    proc = subprocess.Popen(
        [sys.executable, os.path.join(os.path.dirname(__file__),
                                      "fwdproxy.py"),
         "--port", str(port)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                break
        except OSError:
            time.sleep(0.2)
    else:
        proc.kill()
        raise RuntimeError("fwdproxy did not start")
    yield {"server": f"http://127.0.0.1:{port}",
           "bypass": "localhost,127.0.0.1,::1"}
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture(scope="session")
def browser(pw, live_proxy):
    headed = os.environ.get("E2E_HEADED") == "1"
    # The sandbox egress proxy blocks Playwright's own browser CDN, so the
    # suite uses Chrome for Testing downloaded directly from Google
    # (~/.cache/e2e-chrome/chrome-linux64/chrome). Fall back to the
    # bundled Playwright chromium if it exists.
    exe = os.environ.get(
        "E2E_CHROME_PATH",
        os.path.expanduser("~/.cache/e2e-chrome/chrome-linux64/chrome"),
    )
    kwargs = {"headless": not headed}
    if live_proxy:
        kwargs["proxy"] = live_proxy
    if os.path.exists(exe):
        kwargs["executable_path"] = exe
    b = pw.chromium.launch(**kwargs)
    yield b
    b.close()


@pytest.fixture()
def context(browser):
    # Live runs ignore cert errors only because this Chrome-for-Testing
    # build rejects all public TLS roots in this sandbox; the live
    # site's own certificate was verified valid independently
    # (openssl: Let's Encrypt, verify return code 0).
    ctx = browser.new_context(viewport={"width": 1280, "height": 900},
                              ignore_https_errors=_is_live())
    yield ctx
    ctx.close()


@pytest.fixture()
def page(context):
    pg = context.new_page()
    pg.set_default_timeout(30_000)
    if not _is_live():
        # Turnstile stub (local runs only). The sandbox egress proxy
        # refuses CONNECT to challenges.cloudflare.com
        # (ERR_TUNNEL_CONNECTION_FAILED), so the real Turnstile script
        # can never load here and every search would die in
        # ensureToken ("Bot check failed to load — no search was run").
        # Stub window.turnstile before page scripts run: the page's own
        # code path (ensureToken -> render -> execute -> callback ->
        # token attached to proxy requests) is exercised for real; only
        # the external script is replaced. The dev-server /api/cdx has
        # no TURNSTILE_SECRET_KEY in its env, so it accepts the token
        # open (the same as the unconfigured server path). Live runs
        # use the real widget — a fake token would fail server-side
        # verification there (TURNSTILE_SECRET_KEY is set live), so the
        # stub must never apply to a live BASE_URL.
        pg.add_init_script("""
window.turnstile = (function () {
  var callbacks = {};
  var n = 0;
  return {
    render: function (el, opts) {
      var id = "e2e-widget-" + (++n);
      callbacks[id] = opts && opts.callback;
      return id;
    },
    execute: function (id) {
      var cb = callbacks[id];
      if (cb) setTimeout(function () { cb("e2e-test-token-" + id); }, 10);
    },
    reset: function () {},
    remove: function (id) { delete callbacks[id]; }
  };
})();
""")
    yield pg
    pg.close()


def goto(page, path=""):
    """Go to base_url + path and wait for the app to render."""
    page.goto(BASE_URL + path, wait_until="domcontentloaded")
    page.wait_for_selector("#plans .plan", timeout=15_000)
    return page


def shot(page, name):
    """Save a screenshot under tests/e2e/screenshots/."""
    path = os.path.join(os.path.dirname(__file__), "screenshots", name)
    page.screenshot(path=path, full_page=True)
    return path


def require_feature(page, selector, feature):
    """Fail fast with a clear message if a v1.5 feature is absent.

    The live deploy can lag the local files (v1.3 has no licence UI,
    dashboard or broad search). A missing selector must read as
    'feature not deployed here', not as a 30s locator timeout.
    """
    try:
        page.wait_for_selector(selector, timeout=5_000)
    except Exception:
        raise AssertionError(
            f"{feature} not present in this deployment "
            f"(no {selector} on {page.url}) — the deployed version "
            "predates that feature"
        )


# --- Dev server (real /api/cdx proxy) -------------------------------------
# Local snapshot runs serve web/ with a plain static server, so the
# page talks to CDX directly — and archive.org sends no CORS headers,
# so every live search fails in the browser (issue #17) and broad
# search can never show "found on". Tests that need a WORKING search
# use this fixture: scripts/dev-server.mjs serves web/ and routes
# /api/cdx through the real Pages Function, exactly as the deployed
# site does. DEV_BASE forces the proxy path (?cdx=proxy) even on
# localhost.
DEV_PORT = 8902
DEV_BASE = f"http://127.0.0.1:{DEV_PORT}/?cdx=proxy"


def _port_answers_200(port):
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2) as r:
            return r.status == 200
    except OSError:
        return False


@pytest.fixture(scope="session")
def dev_server():
    """Serve web/ with the real /api/cdx Function (dev-server.mjs).

    If a server is already answering on DEV_PORT (a previous run's
    fixture, or a manual dev server), reuse it instead of failing to
    bind — and do not kill it at teardown. Otherwise start one and
    terminate it at session end.
    """
    import subprocess
    import sys
    import time

    repo = os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))))
    owned = False
    proc = None
    if not _port_answers_200(DEV_PORT):
        proc = subprocess.Popen(
            ["node", "scripts/dev-server.mjs", str(DEV_PORT)],
            cwd=repo,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        owned = True
        deadline = time.time() + 20
        while time.time() < deadline:
            if proc.poll() is not None:
                raise RuntimeError(
                    f"dev-server exited early (code {proc.returncode})")
            if _port_answers_200(DEV_PORT):
                break
            time.sleep(0.3)
        else:
            proc.kill()
            raise RuntimeError("dev-server did not start on 8902")
    yield
    if owned and proc is not None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def goto_dev(page):
    """Go to the dev server (proxy path) and wait for the app to render."""
    page.goto(DEV_BASE, wait_until="domcontentloaded")
    page.wait_for_selector("#plans .plan", timeout=15_000)
    return page


def wait_for_search_done(page, timeout=180_000):
    """Wait until a search that was just started has finished.

    #go is already enabled before search() disables it — the Turnstile
    token round-trip is async (and the E2E stub adds a setTimeout),
    so waiting on #go alone can return before the search even starts
    and the caller then reads the initial empty #status (that is how
    test_empty_handle_defaults_to_jack failed twice in a row, and how
    test_signed_out_free_search_still_works failed once: status "").
    Wait for the search to start first — #status leaves its initial
    empty state, or #go goes disabled — then wait for #go to
    re-enable. Every path out of search() sets #status, so the first
    condition always fires for a started search.
    """
    page.wait_for_function(
        "() => document.querySelector('#status').innerText.trim() !== ''"
        " || document.querySelector('#go').disabled",
        timeout=30_000)
    page.wait_for_selector("#go:not([disabled])", timeout=timeout)
