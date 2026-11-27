"""Offline tests for licence keys (v1.3, HMAC dev scheme).

No live network calls; CDX is stubbed where the CLI runs. The secret
here is a test-only value passed explicitly or via monkeypatched env —
never a real secret, never committed.
"""
import json

import pytest
from click.testing import CliRunner

from wayback_social.cli import main
from wayback_social.licence import (SECRET_ENV, load_secret, make_key,
                                    parse_key, resolve_plan, verify_key)

SECRET = "test-only-secret-123"
ROWS = [["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"],
        ["com,twitter)/jack/status/20", "20060321212430",
         "https://twitter.com/jack/status/20", "text/html", "200", "ABC", "1"]]


def test_make_check_round_trip():
    key = make_key("pro", SECRET)
    assert key.startswith("DP1-PRO-")
    valid, tier, reason = verify_key(key, SECRET)
    assert valid and tier == "pro" and reason == "valid"
    assert parse_key(key)["tier"] == "pro"


def test_tampered_key_rejected():
    key = make_key("studio", SECRET)
    bad_checksum = key[:-1] + ("0" if key[-1] != "0" else "1")
    assert verify_key(bad_checksum, SECRET)[0] is False
    # Swapping the tier breaks the checksum too.
    assert verify_key(key.replace("DP1-STUDIO", "DP1-PRO"), SECRET)[0] is False
    # Wrong secret, right key.
    assert verify_key(key, "someone-elses-secret")[0] is False
    # Malformed keys.
    for bad in ("", "DP1-PRO-ABC", "DP1-XXX-ABCDEFGHIJKLMNOP-12345678",
                "XX1-PRO-ABCDEFGHIJKLMNOP-12345678", "DP1-PRO-short-12345678"):
        assert verify_key(bad, SECRET)[0] is False
        assert parse_key(bad) is None


def test_make_unknown_tier_rejected():
    with pytest.raises(ValueError):
        make_key("bundle", SECRET)  # bundle mints a studio key instead
    with pytest.raises(ValueError):
        make_key("gold", SECRET)


def test_resolve_plan_no_licence_keeps_plan():
    assert resolve_plan("free", None) == ("free", None)


def test_resolve_plan_licence_overrides(monkeypatch):
    monkeypatch.setenv(SECRET_ENV, SECRET)
    key = make_key("studio", SECRET)
    plan, note = resolve_plan("free", key)
    assert plan == "studio"
    assert "Licence verified" in note


def test_resolve_plan_needs_secret(monkeypatch):
    from pathlib import Path

    monkeypatch.delenv(SECRET_ENV, raising=False)
    monkeypatch.setattr("wayback_social.licence.SECRET_FILE",
                        Path("/nonexistent-dir/licence.key"))
    with pytest.raises(ValueError, match="needs the secret"):
        resolve_plan("free", make_key("pro", SECRET))


def test_cli_make_refuses_without_secret(monkeypatch):
    monkeypatch.delenv(SECRET_ENV, raising=False)
    res = CliRunner().invoke(main, ["licence", "make", "--tier", "pro",
                                    "--email", "a@b.c"])
    assert res.exit_code != 0
    assert "dev-only" in res.output


def test_cli_make_check_round_trip(monkeypatch):
    monkeypatch.setenv(SECRET_ENV, SECRET)
    runner = CliRunner()
    made = runner.invoke(main, ["licence", "make", "--tier", "pro",
                                "--email", "a@b.c"])
    assert made.exit_code == 0, made.output
    key = [ln for ln in made.output.splitlines() if ln.startswith("DP1-")][0]
    checked = runner.invoke(main, ["licence", "check", key])
    assert checked.exit_code == 0, checked.output
    assert "Valid licence key" in checked.output and "pro" in checked.output


def test_cli_check_bad_key(monkeypatch):
    monkeypatch.setenv(SECRET_ENV, SECRET)
    res = CliRunner().invoke(main, ["licence", "check", "DP1-PRO-AAAAAAAAAAAAAAAA-00000000"])
    assert res.exit_code == 1
    assert "Invalid licence key" in res.output


def test_cli_archive_licence_unlocks_caps(monkeypatch, tmp_path):
    import wayback_social.commands.archive as cli_mod

    monkeypatch.setenv(SECRET_ENV, SECRET)
    monkeypatch.setattr(cli_mod, "query_many", lambda patterns, **k: (ROWS, None))
    seen = {}

    def spy(patterns, **k):
        seen.update(k)
        return (ROWS, None)

    monkeypatch.setattr(cli_mod, "query_many", spy)
    key = make_key("pro", SECRET)
    res = CliRunner().invoke(main, ["archive", "x", "jack", "--no-fetch-text",
                                    "--limit", "5000", "--licence", key,
                                    "--format", "json",
                                    "--out-dir", str(tmp_path)])
    assert res.exit_code == 0, res.output
    assert "Licence verified" in res.output
    assert seen["limit"] == 2500  # pro cap clamps 5000; free would clamp to 25
    assert "capped to 2500" in res.output
    assert "Plan: Pro Pack" in res.output


def test_cli_archive_bad_licence_rejected(monkeypatch, tmp_path):
    import wayback_social.commands.archive as cli_mod

    monkeypatch.setenv(SECRET_ENV, SECRET)
    monkeypatch.setattr(cli_mod, "query_many", lambda patterns, **k: (ROWS, None))
    res = CliRunner().invoke(main, ["archive", "x", "jack", "--no-fetch-text",
                                    "--licence", "DP1-PRO-AAAAAAAAAAAAAAAA-00000000",
                                    "--out-dir", str(tmp_path)])
    assert res.exit_code != 0
    assert "Invalid licence key" in res.output


def test_load_secret_prefers_env(monkeypatch, tmp_path):
    monkeypatch.setenv(SECRET_ENV, "env-secret")
    assert load_secret() == "env-secret"
