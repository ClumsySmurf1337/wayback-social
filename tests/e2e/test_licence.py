"""Licence-key tests — web UI (index licence section + dashboard).

Keys are verified in the browser against the public DEMO secret
("deletedproof-demo-secret", in web/config.js LICENCE.demo_secret and
web/licence.js). A key minted with that secret is a demo key, not a
purchase — exactly what the page says. The CLI mints it with the same
secret so the two sides agree.
"""
import os
import subprocess

import pytest

from conftest import goto, require_feature, wait_for_search_done

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CLI = [os.path.join(REPO, ".venv", "bin", "wayback-social")]
DEMO_SECRET = "deletedproof-demo-secret"
ENV = dict(os.environ, WAYBACK_SOCIAL_LICENCE_SECRET=DEMO_SECRET)


def mint(tier="pro"):
    made = subprocess.run(
        CLI + ["licence", "make", "--tier", tier, "--email", "e2e@example.com"],
        capture_output=True, text=True, env=ENV, timeout=60,
    )
    assert made.returncode == 0, made.stderr
    # `licence make` prints the key plus a trailing instruction line —
    # take the line that actually looks like a key.
    keys = [ln.strip() for ln in made.stdout.splitlines()
            if ln.strip().startswith(f"DP1-{tier.upper()}-")]
    assert keys, f"no key in output: {made.stdout!r}"
    return keys[0]


def verify_on_page(page, key):
    page.fill("#licence-key", key)
    page.click("#licence-verify")
    # NOTE: the page sets "Licence verified — ..." and then applyTier()
    # immediately overwrites it with the final status text in the same
    # JS task, so a poller only ever sees the final text. Since the
    # licence lockdown the final text for a demo key is
    # "Demo key active: ..." (never presented as a purchase); a bad
    # key still shows "Invalid key".
    page.wait_for_function(
        "['Demo key active', 'Licence active', 'Licence verified', 'Invalid key'].some("
        "  t => document.getElementById('licence-status').innerText.includes(t))",
        timeout=15_000,
    )
    return page.locator("#licence-status").inner_text()


def test_pro_licence_unlocks_pro_tier_on_index(page):
    key = mint("pro")
    goto(page)
    require_feature(page, "#tier-badge", "Licence UI (v1.5)")
    assert "Free tier" in page.locator("#tier-badge").inner_text()
    assert page.locator("#json").is_disabled(), "JSON export must be disabled on Free"
    status = verify_on_page(page, key)
    assert "Pro Pack" in status, status
    badge = page.locator("#tier-badge").inner_text()
    assert "Pro Pack" in badge and "2500" in badge, badge
    assert "2500" in page.locator("#limit-label").inner_text()
    assert not page.locator("#json").is_disabled(), "JSON export must unlock on Pro"
    # Tier survives a reload (localStorage).
    page.reload()
    page.wait_for_selector("#plans .plan")
    assert "Pro Pack" in page.locator("#tier-badge").inner_text()


def test_bad_licence_key_rejected(page):
    goto(page)
    require_feature(page, "#tier-badge", "Licence UI (v1.5)")
    status = verify_on_page(page, "DP1-PRO-AAAAAAAAAAAAAAAA-00000000")
    assert "Invalid key" in status, status
    assert "Free tier" in page.locator("#tier-badge").inner_text()


def test_licence_clear_returns_to_free(page):
    key = mint("starter")
    goto(page)
    require_feature(page, "#tier-badge", "Licence UI (v1.5)")
    verify_on_page(page, key)
    assert "Starter" in page.locator("#tier-badge").inner_text()
    page.click("#licence-clear")
    assert "Licence removed" in page.locator("#licence-status").inner_text()
    assert "Free tier" in page.locator("#tier-badge").inner_text()
    assert "25" in page.locator("#limit-label").inner_text()


def test_json_export_gated_on_free_but_downloads_on_pro(page):
    # Free tier: JSON button is disabled, so no JSON download is possible.
    goto(page)
    require_feature(page, "#tier-badge", "Licence UI (v1.5)")
    assert page.locator("#json").is_disabled()
    # Pro tier: JSON button enabled and downloads real JSON.
    key = mint("pro")
    verify_on_page(page, key)
    page.click("#demo")
    wait_for_search_done(page)
    # On localhost the live search fails (archive.org CORS) and the
    # page shows no rows until the labelled sample is loaded.
    if page.locator("#fail-actions:not([hidden])").count():
        page.click("#sample")
        page.wait_for_selector("#results tbody tr", timeout=15_000)
    assert page.locator("#results tbody tr").count() >= 1
    with page.expect_download() as dl:
        page.click("#json")
    download = dl.value
    path = f"/tmp/e2e-{download.suggested_filename}"
    download.save_as(path)
    text = open(path, encoding="utf-8").read()
    assert text.strip().startswith("["), text[:120]
    assert "jack/status/20" in text, text[:500]


def test_cli_mint_and_check_pro_key():
    key = mint("pro")
    checked = subprocess.run(
        CLI + ["licence", "check", key],
        capture_output=True, text=True, env=ENV, timeout=60,
    )
    assert checked.returncode == 0, checked.stderr
    assert "pro" in checked.stdout.lower(), checked.stdout


def test_cli_licence_unlocks_pro_caps():
    """A Pro licence resolves to the Pro plan (cap 2500, not free 25)."""
    key = mint("pro")
    # The import check must run under the MAIN venv (it has `requests`);
    # the E2E venv deliberately only has playwright + pytest.
    probe = subprocess.run(
        [os.path.join(REPO, ".venv", "bin", "python"), "-c",
         "import sys; sys.path.insert(0, '.');"
         "from wayback_social.licence import resolve_plan;"
         "from wayback_social.plans import PLAN_CAPS;"
         f"print(resolve_plan('free', '{key}', env={{'WAYBACK_SOCIAL_LICENCE_SECRET': '{DEMO_SECRET}'}}));"
         "print(PLAN_CAPS['pro']['archive_limit'], PLAN_CAPS['free']['archive_limit'])"],
        capture_output=True, text=True, cwd=REPO, timeout=60,
    )
    assert probe.returncode == 0, probe.stderr
    assert "('pro'," in probe.stdout, probe.stdout
    assert "2500 25" in probe.stdout, probe.stdout
    run = subprocess.run(
        CLI + ["archive", "x", "jack", "--limit", "1", "--no-fetch-text",
               "--licence", key, "--out-dir", "/tmp/e2e-licence-run"],
        capture_output=True, text=True, env=ENV, timeout=180,
    )
    out = run.stdout + run.stderr
    assert run.returncode == 0, out
    assert "pro" in out.lower(), out
