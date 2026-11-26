"""Offline tests for find / presets. No live network calls."""
from click.testing import CliRunner

from wayback_social.cli import main
from wayback_social.presets import get_preset, list_presets


def test_presets():
    assert len(list_presets()) >= 7
    catfish = get_preset("catfish")
    assert catfish and "instagram" in catfish.networks
    assert catfish.ethics  # catfish/relationship presets must carry limits
    assert get_preset("relationship").ethics
    assert get_preset("nope") is None


def test_find_offline(monkeypatch, tmp_path):
    import wayback_social.cli as cli_mod
    rows = [["urlkey", "timestamp", "original", "mimetype", "statuscode",
             "digest", "length"],
            ["com,twitter)/jack/status/20", "20060321212430",
             "https://twitter.com/jack/status/20", "text/html", "200", "ABC", "1"]]
    monkeypatch.setattr(cli_mod, "query_many", lambda patterns, **k: (rows, None))
    runner = CliRunner()
    res = runner.invoke(main, ["find", "jack", "--networks", "x",
                               "--out-dir", str(tmp_path)])
    assert res.exit_code == 0, res.output
    assert "found on 1/1 networks" in res.output
    assert (tmp_path / "find_jack.json").exists()


def test_find_preset_prints_ethics(monkeypatch, tmp_path):
    import wayback_social.cli as cli_mod
    monkeypatch.setattr(cli_mod, "query_many",
                        lambda patterns, **k: (_ for _ in ()).throw(
                            Exception("no network in test")))
    # query_many raising is caught as EmptyResultError only; use a stub
    # that raises the CDX empty error instead.
    from wayback_social.cdx import EmptyResultError
    monkeypatch.setattr(cli_mod, "query_many",
                        lambda patterns, **k: (_ for _ in ()).throw(
                            EmptyResultError("none")))
    runner = CliRunner()
    res = runner.invoke(main, ["find", "someone", "--preset", "catfish",
                               "--out-dir", str(tmp_path)])
    assert res.exit_code == 0, res.output
    assert "Catfish check" in res.output
    assert "Public archived posts only" in res.output
    assert "found on 0/" in res.output
