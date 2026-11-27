"""Brands single-source-of-truth tests.

web/brands.json -> scripts/sync_brands.py -> web/branding.js (client
fallback) + functions/_lib/brands.js (server middleware). These tests
assert the three agree, so a brand changed in only one place fails
loudly. No live network calls.

The resolver behaviour itself (same host matrix on both sides) is
covered by node web/branding.test.js and node
functions/middleware.test.mjs; this file covers the sync + the
copy gates.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(ROOT / "scripts"))
import sync_brands  # noqa: E402


def _load():
    return sync_brands.load_brands()


def test_sync_check_is_clean():
    proc = subprocess.run(
        [sys.executable, "scripts/sync_brands.py", "--check"],
        cwd=ROOT, capture_output=True, text=True,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr


def test_brands_json_has_all_five_brands():
    data = _load()
    assert sorted(data["brands"]) == ["apex", "app", "legal", "osint", "verify"]
    assert data["umbrella"] == "ArchiveCheck"
    assert data["limitsLine"].startswith("Public archived posts only.")


def test_generated_files_match_brands_json():
    """The generated BRANDS in both consumers equal brands.json."""
    data = _load()
    branding_js = (ROOT / "web" / "branding.js").read_text(encoding="utf-8")
    assert "// BEGIN GENERATED BRANDS" in branding_js
    assert "// END GENERATED BRANDS" in branding_js
    for key, brand in data["brands"].items():
        assert f'"seoTitle": "{brand["seoTitle"]}"' in branding_js, key
        assert f'"name": "{brand["name"]}"' in branding_js, key
    brands_js = (ROOT / "functions" / "_lib" / "brands.js").read_text(
        encoding="utf-8")
    assert brands_js.startswith("// GENERATED")
    for key, brand in data["brands"].items():
        assert f'"seoTitle": "{brand["seoTitle"]}"' in brands_js, key


def test_seo_copy_fits_the_gates():
    """seo_check.py enforces these on the served page; the sync
    script validates them too — this test pins them at the JSON level
    so a too-long title fails before it ever reaches a browser."""
    data = _load()
    for key, brand in data["brands"].items():
        assert 30 <= len(brand["seoTitle"]) <= 70, key
        assert 50 <= len(brand["metaDescription"]) <= 160, key
        assert 15 <= len(brand["dashboardTitle"]) <= 70, key


def test_no_wayback_social_in_static_titles():
    """The static files carry the apex brand, never the repo slug."""
    for page in ("web/index.html", "web/dashboard.html"):
        html = (ROOT / page).read_text(encoding="utf-8")
        import re
        title = re.search(r"<title[^>]*>(.*?)</title>", html, re.S).group(1)
        assert "wayback-social" not in title, page
        assert "ArchiveCheck" in title, page


def test_static_index_matches_apex_brand():
    """The static fallback must equal the apex entry in brands.json,
    so no-JS / no-middleware visitors see the same brand the
    middleware would serve on the apex host."""
    data = _load()
    apex = data["brands"]["apex"]
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert apex["seoTitle"] in html
    assert apex["metaDescription"] in html
    assert apex["tagline"] in html
    assert apex["canonical"] in html
    # NOTE: the static <footer> is deliberately NOT asserted here — it
    # carries the live "Respect robots..." line while the served footer
    # is the brand footer (verified per-host in
    # functions/middleware.test.mjs). The static file is the fallback,
    # not the served copy.
