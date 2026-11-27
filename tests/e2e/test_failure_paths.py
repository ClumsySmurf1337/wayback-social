"""Failure-path copy audit (issue #22 follow-through).

Every way the console can fail or block the user — a dead archive, a
tier-gated feature, a bad batch line, a checkout link that isn't
connected yet — must show honest, user-facing text with NO CLI bleed
(CLI is internal only) and NO Wayback-only framing. The grep audit in
docs/push-readiness.md §3 covers the static strings; these tests drive
the live failure paths in a real browser and read what the user
actually sees.

The failed-search test aborts /api/cdx (archive unreachable). The
evidence test mocks CDX (same canned rows as test_osint_tools.py) so
it does not depend on archive.org's uptime. Nothing here touches the
network except the dev server itself.

Run:
    .venv-e2e/bin/python -m pytest tests/e2e/test_failure_paths.py -v
"""
import pytest

from conftest import DEV_BASE, dev_server, goto_dev, page  # noqa: F401
from test_osint_tools import mock_cdx

BANNED = ("pipx", "command line", "use the CLI",
          "Prefer the command line", "wayback-social archive",
          "wayback-social batch", "$ wayback", "install wayback")


def assert_no_cli_bleed(where, text):
    for b in BANNED:
        assert b.lower() not in text.lower(), f"{where}: CLI bleed {b!r} in {text!r}"


def test_failed_search_shows_retry_no_cli_text(page, dev_server):
    """Abort /api/cdx: the failure UI must offer retry + direct link +
    labelled sample — never demo rows as results, never CLI text."""
    goto_dev(page)
    page.route("**/api/cdx*", lambda r: r.abort())
    page.locator("#handle").fill("jack")
    page.locator("#network").select_option("x")
    page.locator("#go").click()
    page.wait_for_selector("#status:not(:empty)", timeout=30_000)
    page.wait_for_timeout(3000)
    status = page.locator("#status").inner_text()
    notice = page.locator("#notice").inner_text()
    assert_no_cli_bleed("failed-search status", status)
    assert_no_cli_bleed("failed-search notice", notice)
    assert_no_cli_bleed("failed-search body", page.locator("body").inner_text())
    # The failure must say the search did not run — never fake rows.
    assert page.locator("#results tbody tr").count() == 0
    assert "retry" in (status + notice).lower() or "try again" in (status + notice).lower(), \
        f"no retry offered: status={status!r} notice={notice!r}"


def test_diff_free_block_dialog_no_cli_text(page, dev_server):
    """Deleted diff is Starter+ (pricing.yaml): free tier gets a dialog,
    not a search, not CLI text."""
    goto_dev(page)
    page.locator("#osint-toggle").click()
    page.locator('[data-osint-tab="diff"]').click()
    page.locator("#diff-go").click()
    page.wait_for_selector("#dlg[open]", timeout=15_000)
    title = page.locator("#dlgTitle").inner_text()
    body = page.locator("#dlgBody").inner_text()
    assert "Starter" in title, title
    assert_no_cli_bleed("diff block dialog", title + " " + body)


def test_evidence_free_block_dialog_no_cli_text(page, dev_server):
    """Rows on screen + free tier: the pack button must refuse with the
    Studio reason — and never download, never mention the CLI."""
    goto_dev(page)
    mock_cdx(page)
    page.locator("#handle").fill("jack")
    page.locator("#network").select_option("x")
    page.locator("#go").click()
    page.wait_for_selector("#status:has-text('Found')", timeout=30_000)
    assert page.locator("#results tbody tr").count() > 0
    page.locator(".evidence-pack-btn").first.click()
    page.wait_for_selector("#dlg[open]", timeout=15_000)
    title = page.locator("#dlgTitle").inner_text()
    body = page.locator("#dlgBody").inner_text()
    assert "unavailable" in title.lower() or "Studio" in title, title
    assert "Studio" in body, body
    assert_no_cli_bleed("evidence block dialog", title + " " + body)


def test_batch_all_bad_lines_reported_no_cli_text(page, dev_server):
    """No valid targets: the skipped-line report stays on screen."""
    goto_dev(page)
    page.locator("#osint-toggle").click()
    page.locator("#batch-lines").fill("not a valid line")
    page.locator("#batch-go").click()
    page.wait_for_selector("#batch-status:has-text('Skipped')", timeout=15_000)
    status = page.locator("#batch-status").inner_text()
    assert_no_cli_bleed("batch bad-line status", status)
    assert "Skipped 1 line(s)" in status, status
    assert "not a valid line" in status, status


def test_batch_bad_line_plus_valid_target_runs(page, dev_server):
    """A bad line + a valid target: the valid target still runs (mocked
    CDX, no archive dependency) AND the skipped-line notice survives
    to the final status (punch-list P4 fix: the notice used to be
    overwritten by the progress text, so the user never learned which
    line was skipped)."""
    goto_dev(page)
    mock_cdx(page)
    page.locator("#osint-toggle").click()
    page.locator("#batch-lines").fill("not a valid line\nx jack")
    page.locator("#batch-go").click()
    # Wait for the skipped-line note, which renderBatch only re-attaches
    # to the FINAL status. Do NOT wait on 'done': the progress text
    # "Batch: 0/1 targets done…" contains "done", so that wait matches
    # mid-run and the assertions read a progress string (flaky failure
    # 2026-11-27: full E2E 108/109 + isolated repro, product proven
    # correct by probe — final status carries the notice).
    page.wait_for_selector("#batch-status:has-text('Skipped')", timeout=60_000)
    status = page.locator("#batch-status").inner_text()
    assert_no_cli_bleed("batch status", status)
    assert "Skipped 1 line(s)" in status, status
    assert "not a valid line" in status, status
    assert page.locator("#batch-results").inner_text(), "no batch results shown"


def test_checkout_default_opens_live_stripe_link(page, dev_server):
    """Stripe is the LIVE default checkout (2026-11-27): clicking a Buy
    button opens the real Payment Link in a new tab — no placeholder
    dialog. The URL is captured by stubbing window.open before the
    click: the VM egress proxy refuses Chromium CONNECTs to
    buy.stripe.com, so a real popup would land on chrome-error:// and
    its URL would be lost. The link target itself is checked live by
    curl + Stripe read-back (see docs/stripe-vs-clerk.md §7)."""
    goto_dev(page)
    note = page.locator("#plans").locator("xpath=following-sibling::p[1]").inner_text()
    assert "Stripe" in note, note
    page.evaluate("window.__opened = []; window.open = (u, t) => { window.__opened.push(u); return null; };")
    page.locator('[data-plan="starter"]').click()
    opened = page.evaluate("window.__opened")
    # The stub records one None entry from the install itself (a
    # Playwright/Chromium quirk — reproduced on about:blank, not a
    # product call), then the click's real URL. Assert membership,
    # not exact equality, so the quirk can't mask a wrong link.
    assert "https://buy.stripe.com/6oUaEX3Xm3NB16E8Ik3sI04" in opened, opened
    assert page.locator("#dlg[open]").count() == 0, "placeholder dialog opened for a live link"


def test_checkout_placeholder_dialog_no_cli_text(page, dev_server):
    """Buy buttons with REPLACE_* links show the not-connected dialog —
    honest, no CLI text. (The dialog's REPLACE_*/config.js wording is
    internal jargon leaking to users — punch-list P3 in
    docs/push-readiness.md, not a CLI-bleed failure.) Paddle is the
    still-placeholder provider now that Stripe is the live default, so
    the dialog is exercised via ?checkout=paddle."""
    page.goto(DEV_BASE + "&checkout=paddle", wait_until="domcontentloaded")
    page.wait_for_selector("#plans .plan", timeout=15_000)
    # Click the Starter card's Buy button directly by its data-plan —
    # filtering ".plan" by the text "Starter" matches 3 cards (the
    # Bundle and top-up cards both mention Starter in their copy).
    page.locator('[data-plan="starter"]').click()
    page.wait_for_selector("#dlg[open]", timeout=15_000)
    title = page.locator("#dlgTitle").inner_text()
    body = page.locator("#dlgBody").inner_text()
    assert "not connected" in title.lower(), title
    assert "Paddle" in body, body
    assert_no_cli_bleed("checkout dialog", title + " " + body)
