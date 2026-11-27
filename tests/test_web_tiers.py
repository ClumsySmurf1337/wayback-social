"""Tests for web tier enforcement (v1.5) — Node + local HTTP server.

Licence verification runs in the browser (licence.js, Web Crypto)
and must agree with the Python implementation (licence.py) — a key
minted in one must verify in the other. Tier caps in licence.js must
match pricing.yaml / plans.py, or the page would promise caps the
CLI does not enforce.
"""
from __future__ import annotations

import functools
import http.server
import json
import os
import subprocess
import threading
from pathlib import Path

import pytest

from wayback_social import licence as licence_mod
from wayback_social.plans import BUNDLE_CAPS, PLAN_CAPS

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DEMO_SECRET = "deletedproof-demo-secret"


def _node(script: str) -> dict:
    out = subprocess.run(["node", "-e", script], capture_output=True,
                         text=True, cwd=ROOT, timeout=30)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_js_mint_verify_roundtrip():
    res = _node("""
const L = require("./web/licence.js");
(async () => {
  const key = await L.mintKey("pro", L.DEMO_SECRET);
  const good = await L.verifyKey(key);
  const bad = await L.verifyKey(key.slice(0, -1) + (key.slice(-1) === "0" ? "1" : "0"));
  const malformed = await L.verifyKey("nope");
  console.log(JSON.stringify({key, good, bad, malformed}));
})();""")
    assert res["good"]["valid"] is True
    assert res["good"]["tier"] == "pro"
    assert res["bad"]["valid"] is False
    assert res["malformed"]["valid"] is False


def test_python_key_verifies_in_js():
    key = licence_mod.make_key("studio", DEMO_SECRET)
    res = _node(f"""
const L = require("./web/licence.js");
(async () => {{
  console.log(JSON.stringify(await L.verifyKey({json.dumps(key)})));
}})();""")
    assert res["valid"] is True
    assert res["tier"] == "studio"


def test_js_key_verifies_in_python():
    res = _node("""
const L = require("./web/licence.js");
(async () => {
  console.log(JSON.stringify({key: await L.mintKey("starter", L.DEMO_SECRET)}));
})();""")
    valid, tier, _reason = licence_mod.verify_key(res["key"], DEMO_SECRET)
    assert valid is True
    assert tier == "starter"


def test_js_caps_match_python_caps():
    js = _node("""
const L = require("./web/licence.js");
console.log(JSON.stringify({caps: L.PLAN_CAPS, bundle: L.BUNDLE_CAPS}));""")
    for tier, caps in PLAN_CAPS.items():
        for field in ("archive_limit", "find_networks", "batch_targets",
                      "fetch_text", "evidence_reports", "seats"):
            assert js["caps"][tier][field] == caps[field], (tier, field)
    for field in ("archive_limit", "find_networks", "batch_targets",
                  "fetch_text", "evidence_reports", "seats"):
        assert js["bundle"][field] == BUNDLE_CAPS[field], ("bundle", field)


def test_js_feature_flags_match_python_features():
    # Boolean feature gates live in two places: Python PLAN_FEATURES
    # (pricing.yaml -> plans.py, the CLI's gate) and JS PLAN_CAPS /
    # BUNDLE_CAPS (licence.js, the web console's gate). If they drift,
    # the web would sell a feature the CLI blocks (or block one the
    # CLI allows). keyword_search is the Arquivo.pt gate (issue #8):
    # CDX mode works on every plan, keyword search is Pro+ only —
    # the CLI arquivo command and the web console must agree.
    from wayback_social.plans import BUNDLE_FEATURES, PLAN_FEATURES
    js = _node("""
const L = require("./web/licence.js");
console.log(JSON.stringify({caps: L.PLAN_CAPS, bundle: L.BUNDLE_CAPS}));""")
    for tier, features in PLAN_FEATURES.items():
        for field in ("deleted_diff", "keyword_search"):
            assert js["caps"][tier][field] == features[field], (tier, field)
    for field in ("deleted_diff", "keyword_search"):
        assert js["bundle"][field] == BUNDLE_FEATURES[field], ("bundle", field)


def test_index_has_tier_ui():
    # index.html is a thin shell since the v1.5+branding refactor: the
    # tier/licence/search code lives in console.js, presets + broad
    # search + failure UI in modes.js. The test reads the page AND
    # its scripts, the same set a browser loads.
    html = (WEB / "index.html").read_text(encoding="utf-8")
    js = ((WEB / "console.js").read_text(encoding="utf-8")
          + (WEB / "modes.js").read_text(encoding="utf-8"))
    for needle in ("licence.js", 'id="tier-badge"', 'id="licence-key"',
                   'id="licence-verify"', 'id="licence-clear"',
                   'id="licence-status"', 'id="broad"',
                   "dashboard.html"):
        assert needle in html, needle
    for needle in ("ws_licence_tier", "currentCaps()", "recordHistory"):
        assert needle in js, needle


def test_index_has_branding_and_modes_wiring():
    # Approved subdomain branding (docs/subdomain-branding.md) + the
    # issue 16-18 web improvements must be wired into the page.
    html = (WEB / "index.html").read_text(encoding="utf-8")
    for needle in ("branding.js", "console.js", "modes.js",
                   'id="search-hero"', 'id="fail-actions"',
                   'id="broad-results"', 'id="presets"',
                   'data-preset="catfish"', 'data-preset="journalist"',
                   'data-preset="legal"', 'data-preset="researcher"'):
        assert needle in html, needle
    # Issue 16: no CLI command anywhere on the web page.
    for banned in ("wayback-social archive", "pipx install",
                   "wayback-social batch"):
        assert banned not in html, banned
    js = (WEB / "console.js").read_text(encoding="utf-8")
    assert "use the CLI" not in js and "install the CLI" not in js
    modes = (WEB / "modes.js").read_text(encoding="utf-8")
    assert "searchBroad" in modes and "showFailure" in modes
    assert "SAMPLES_PER_NETWORK" in modes
    assert "NOT a live result" in modes  # sample is labelled, never live


def test_dashboard_has_usage_history_licence():
    html = (WEB / "dashboard.html").read_text(encoding="utf-8")
    for needle in ("licence.js", 'id="tier-badge"', 'id="usage"',
                   'id="licence-key"', 'id="licence-verify"',
                   'id="history"', 'id="clear-history"',
                   'id="log-evidence"', "ws_history", "ws_usage_"):
        assert needle in html, needle


def test_config_has_licence_and_analytics():
    cfg = (WEB / "config.js").read_text(encoding="utf-8")
    assert "LICENCE" in cfg and "demo_secret" in cfg
    assert "ANALYTICS" in cfg and "cloudflare-web-analytics" in cfg
    assert "sent anywhere" in cfg  # key is never sent anywhere


@pytest.fixture(scope="module")
def web_server():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler,
                                directory=str(WEB))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def test_pages_serve_and_reference_licence(web_server):
    import urllib.request
    for path, needle in (("/index.html", "console.js"),
                         ("/dashboard.html", "ws_history"),
                         ("/licence.js", "WAYBACK_LICENCE"),
                         ("/console.js", "cdxUrl"),
                         ("/modes.js", "searchBroad"),
                         ("/config.js", "ANALYTICS"),
                         ("/robots.txt", "User-agent"),
                         ("/sitemap.xml", "urlset")):
        with urllib.request.urlopen(web_server + path, timeout=10) as r:
            assert r.status == 200, path
            assert needle in r.read().decode("utf-8"), path


def test_seo_checker_still_passes(web_server):
    out = subprocess.run(
        ["python3", "scripts/seo_check.py", web_server],
        capture_output=True, text=True, cwd=ROOT, timeout=60)
    assert out.returncode == 0, out.stdout + out.stderr


def test_cdx_proxy_function(tmp_path):
    """functions/api/cdx.js: allowlists params, adds CORS headers,
    400s without ?url=. Tested with a stubbed fetch (the live path
    is verified separately by hand against real archive.org)."""
    src = ROOT / "functions" / "api" / "cdx.js"
    assert src.is_file(), "CDX proxy function missing"
    # Preserve the functions/ layout: cdx.js imports
    # ../_lib/turnstile.js (shared verifier since Track K item 5),
    # so the lib must be copied alongside it.
    api_dir = tmp_path / "api"
    lib_dir = tmp_path / "_lib"
    api_dir.mkdir(exist_ok=True)
    lib_dir.mkdir(exist_ok=True)
    (lib_dir / "turnstile.js").write_text(
        (ROOT / "functions" / "_lib" / "turnstile.js").read_text(encoding="utf-8"),
        encoding="utf-8")
    mjs = api_dir / "cdx.mjs"
    mjs.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    script = f"""
import {{ onRequest }} from {json.dumps(str(mjs))};
const calls = [];
globalThis.fetch = async (url, opts) => {{
  calls.push(url);
  return new Response(JSON.stringify([["x","20060321212430","https://twitter.com/jack/status/20"]]), {{
    status: 200, headers: {{"content-type": "application/json"}} }});
}};
const ok = await onRequest({{ request: {{ url: "https://example.com/api/cdx?url=twitter.com/jack/status/*&output=json&limit=2&evil=1" }} }});
const okBody = await ok.text();
const bad = await onRequest({{ request: {{ url: "https://example.com/api/cdx" }} }});
console.log(JSON.stringify({{
  okStatus: ok.status, cors: ok.headers.get("Access-Control-Allow-Origin"),
  called: calls[0] || "", evilDropped: !((calls[0] || "").includes("evil")),
  bodyHasRow: okBody.includes("jack/status/20"),
  badStatus: bad.status }}));
"""
    out = subprocess.run(["node", "--input-type=module", "-e", script],
                         capture_output=True, text=True, cwd=ROOT, timeout=30)
    assert out.returncode == 0, out.stderr
    res = json.loads(out.stdout)
    assert res["okStatus"] == 200
    assert res["cors"] == "*"
    assert "web.archive.org/cdx/search/cdx" in res["called"]
    assert "url=twitter.com" in res["called"]
    assert res["evilDropped"] is True
    assert res["bodyHasRow"] is True
    assert res["badStatus"] == 400
