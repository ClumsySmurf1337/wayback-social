"""Pricing single-source-of-truth tests (v1.3).

pricing.yaml -> scripts/sync_pricing.py -> plans.py + web/config.js.
These tests assert the three agree, so a price changed in only one
place fails loudly. No live network calls.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(ROOT / "scripts"))
import sync_pricing  # noqa: E402
from wayback_social import plans  # noqa: E402


def _load():
    return sync_pricing.load_pricing()


def test_yaml_studio_is_a_finite_pack():
    data = _load()
    studio = data["tiers"]["studio"]["caps"]
    assert studio["evidence_reports"] == 10
    assert studio["seats"] == 5
    assert studio["batch_targets"] == 200
    assert studio["archive_limit"] == 25000
    assert studio["fetch_text"] == 10000
    assert data["tiers"]["free"]["caps"]["evidence_reports"] == 0
    assert data["tiers"]["pro"]["caps"]["evidence_reports"] == 0


def test_yaml_bundle_math_is_147_and_60_percent():
    data = _load()
    bundle = data["tiers"]["bundle"]
    assert bundle["regular"] == 147  # 19 + 29 + 99, not the v1.2 $137
    assert bundle["launch"] == 59
    assert sync_pricing.bundle_discount_pct(data) == 60
    assert data["launch"]["topup_price"] == 15
    assert data["launch"]["topup_credits"] == 500


def test_yaml_launch_vs_regular():
    data = _load()
    tiers = data["tiers"]
    assert (tiers["starter"]["launch"], tiers["starter"]["regular"]) == (9, 19)
    assert (tiers["pro"]["launch"], tiers["pro"]["regular"]) == (19, 29)
    assert (tiers["studio"]["launch"], tiers["studio"]["regular"]) == (49, 99)


def test_plans_py_matches_yaml():
    data = _load()
    for tier in ("free", "starter", "pro", "studio"):
        assert plans.PLAN_CAPS[tier] == data["tiers"][tier]["caps"]
        assert plans.PLAN_FEATURES[tier] == data["tiers"][tier]["features"]
        assert plans.PLAN_EXPORTS[tier] == data["tiers"][tier]["features"]["exports"]
    assert plans.BUNDLE_CAPS == data["tiers"]["bundle"]["caps"]
    assert plans.BUNDLE_CAPS == plans.PLAN_CAPS["studio"]
    assert plans.LAUNCH_NOTE == data["launch"]["note"]
    assert plans.TOPUP == {"price": 15, "credits": 500}
    assert plans.evidence_reports_cap("studio") == 10
    assert plans.seats("studio") == 5
    assert plans.seats("free") == 1


def _config_pricing():
    text = (ROOT / "web" / "config.js").read_text(encoding="utf-8")
    entries = {}
    pattern = re.compile(
        r'id: "(free|starter|pro|studio|bundle|topup)", name: "([^"]+)", '
        r'price: "\$(\d+)"(?:, regular: "\$(\d+)")?')
    for m in pattern.finditer(text):
        entries[m.group(1)] = {"name": m.group(2), "price": int(m.group(3)),
                               "regular": int(m.group(4)) if m.group(4) else None}
    return text, entries


def test_config_js_pricing_matches_yaml():
    data = _load()
    text, entries = _config_pricing()
    for tier in ("free", "starter", "pro", "studio", "bundle"):
        assert entries[tier]["price"] == data["tiers"][tier]["launch"]
        # Free has no "regular" field in the JS (launch == regular == 0).
        assert (entries[tier]["regular"] or 0) == data["tiers"][tier]["regular"]
    assert entries["topup"]["price"] == 15
    assert "60% off" in text
    assert "$137" not in text and "57%" not in text  # v1.2 arithmetic, gone
    assert "Launch pricing" in text


def _chart_row(text: str, label: str) -> dict:
    m = re.search(re.escape(f'label: "{label}"') + r", values: \{([^}]*)\}", text)
    assert m, f"chart row missing: {label}"
    return dict(re.findall(r'(\w+): "([^"]*)"', m.group(1)))


def test_config_js_feature_chart_matches_caps():
    text, _ = _config_pricing()
    assert _chart_row(text, "Captures per search")["studio"] == "25,000"
    assert _chart_row(text, "Captures per search")["free"] == "25"
    assert _chart_row(text, "Evidence-pack reports included")["studio"] == "10"
    assert _chart_row(text, "Evidence-pack reports included")["bundle"] == "10"
    assert _chart_row(text, "Evidence-pack reports included")["pro"] == "—"
    assert _chart_row(text, "Seats")["studio"] == "5"
    assert _chart_row(text, "Keyword search (over fetched text)")["pro"] == "✓"
    assert _chart_row(text, "Keyword search (over fetched text)")["free"] == "—"
    assert _chart_row(text, "Deleted-only diff")["starter"] == "✓"
    assert _chart_row(text, "Deleted-only diff")["free"] == "—"


def test_no_unlimited_claims_about_tiers():
    for rel in ("wayback_social/plans.py", "web/config.js",
                "web/index.html", "README.md"):
        text = (ROOT / rel).read_text(encoding="utf-8")
        assert "unlimited" not in text.lower(), f"{rel} still says unlimited"


def test_sync_check_passes():
    res = subprocess.run(
        [sys.executable, "scripts/sync_pricing.py", "--check"],
        cwd=ROOT, capture_output=True, text=True)
    assert res.returncode == 0, res.stdout + res.stderr


def test_fee_math():
    assert sync_pricing.net_kept(15, 0.029, 0.30) == 14.27
    assert sync_pricing.net_kept(49, 0.05, 0.50) == 46.05
    assert sync_pricing.net_kept(147, 0.05, 0.50) == 139.15
    assert sync_pricing.net_kept(147, 0.029, 0.30) == 142.44
