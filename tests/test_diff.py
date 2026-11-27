"""Offline tests for the deleted-only diff. No live network calls:
CDX is stubbed and live checks use a fake request callable."""
from click.testing import CliRunner

from wayback_social.cli import main
from wayback_social.diff import classify_live, dedupe_latest, summarise


class _Resp:
    def __init__(self, status, url):
        self.status_code = status
        self.url = url


def _fake_request_factory(mapping):
    def fake(method, url, **kwargs):
        status, final = mapping.get(url, (200, url))
        return _Resp(status, final)
    return fake


def test_classify_live_deleted_and_live():
    fake = _fake_request_factory({
        "https://x.com/a/status/1": (404, "https://x.com/a/status/1"),
        "https://x.com/a/status/2": (200, "https://x.com/a/status/2"),
    })
    assert classify_live("https://x.com/a/status/1", "x",
                         request=fake)["live_verdict"] == "deleted"
    assert classify_live("https://x.com/a/status/2", "x",
                         request=fake)["live_verdict"] == "live"


def test_classify_unknown_is_not_deleted():
    # 403 / login redirect / timeout / 5xx must never be called "deleted".
    fake = _fake_request_factory({
        "https://instagram.com/p/AAA": (403, "https://instagram.com/p/AAA"),
        "https://instagram.com/p/BBB": (200, "https://instagram.com/accounts/login/"),
        "https://x.com/a/status/9": (520, "https://x.com/a/status/9"),
    })

    def boom(method, url, **kwargs):
        raise TimeoutError("slow")

    assert classify_live("https://instagram.com/p/AAA", "instagram",
                         request=fake)["live_verdict"] == "unknown"
    assert classify_live("https://instagram.com/p/BBB", "instagram",
                         request=fake)["live_verdict"] == "unknown"
    assert classify_live("https://x.com/a/status/9", "x",
                         request=fake)["live_verdict"] == "unknown"
    assert classify_live("https://tiktok.com/@x/video/1", "tiktok",
                         request=boom)["live_verdict"] == "unknown"


def test_dedupe_latest_keeps_first_timestamp():
    rows = [
        {"post_id": "20", "original_post_url": "https://twitter.com/jack/status/20",
         "archived_timestamp": "20060321212430", "archived_post_url": "a"},
        {"post_id": "20", "original_post_url": "https://twitter.com/jack/status/20",
         "archived_timestamp": "20200101000000", "archived_post_url": "b"},
    ]
    out, skipped = dedupe_latest(rows)
    assert len(out) == 1
    assert out[0]["archived_timestamp"] == "20200101000000"
    assert out[0]["first_archived_timestamp"] == "20060321212430"
    assert skipped == 0


def test_dedupe_skips_non_post_rows():
    rows = [
        {"post_id": "", "original_post_url": "https://twitter.com/jack/status",
         "archived_timestamp": "20130407064503"},
        {"post_id": "20", "original_post_url": "https://twitter.com/jack/status/20",
         "archived_timestamp": "20060321212430"},
    ]
    out, skipped = dedupe_latest(rows)
    assert len(out) == 1 and out[0]["post_id"] == "20"
    assert skipped == 1


def test_summarise():
    rows = [{"live_verdict": "deleted"}, {"live_verdict": "live"},
            {"live_verdict": "unknown"}, {"live_verdict": "deleted"}]
    s = summarise(rows)
    assert s == {"total_posts": 4, "live": 1, "deleted": 2, "unknown": 1,
                 "deleted_share": 0.5}


def test_diff_cli_offline(monkeypatch, tmp_path):
    import wayback_social.commands.diff as cli_mod
    import wayback_social.diff as diff_mod

    rows = [["urlkey", "timestamp", "original", "mimetype", "statuscode",
             "digest", "length"],
            ["com,twitter)/jack/status/20", "20060321212430",
             "https://twitter.com/jack/status/20", "text/html", "200", "ABC", "1"],
            ["com,twitter)/jack/status/21", "20060322000000",
             "https://twitter.com/jack/status/21", "text/html", "200", "DEF", "1"]]
    monkeypatch.setattr(cli_mod, "query_many", lambda patterns, **k: (rows, None))
    fake = _fake_request_factory({
        "https://twitter.com/jack/status/20": (200, "https://twitter.com/jack/status/20"),
        "https://twitter.com/jack/status/21": (404, "https://twitter.com/jack/status/21"),
    })
    monkeypatch.setattr(diff_mod, "classify_live",
                        lambda url, nid="", request=None: {
                            "live_verdict": ("live" if "status/20" in url else "deleted"),
                            "live_http_status": 200 if "status/20" in url else 404,
                            "live_final_url": url,
                            "live_checked_at": "2026-11-26T00:00:00+00:00"})
    # diff_records calls the module-level classify_live; patch it there.
    monkeypatch.setattr("wayback_social.diff.classify_live",
                        lambda url, nid="", request=None: {
                            "live_verdict": ("live" if "status/20" in url else "deleted"),
                            "live_http_status": 200 if "status/20" in url else 404,
                            "live_final_url": url,
                            "live_checked_at": "2026-11-26T00:00:00+00:00"})
    runner = CliRunner()
    res = runner.invoke(main, ["diff", "x", "jack", "--no-fetch-text",
                               "--only", "deleted", "--plan", "starter",
                               "--out-dir", str(tmp_path)])
    assert res.exit_code == 0, res.output
    assert "deleted 1" in res.output
    assert "status/21" in res.output
    summaries = list(tmp_path.glob("diff_x_jack_summary.json"))
    assert summaries, res.output


def test_diff_free_plan_refused_before_any_fetch(monkeypatch, tmp_path):
    # B1: deleted_diff is false on free (pricing.yaml) — the CLI must
    # refuse exactly like the web console, BEFORE touching the archive.
    import wayback_social.commands.diff as cli_mod

    def _must_not_run(*args, **kwargs):
        raise AssertionError("CDX must not be queried on the free plan")

    monkeypatch.setattr(cli_mod, "query_many", _must_not_run)
    runner = CliRunner()
    res = runner.invoke(main, ["diff", "x", "jack", "--no-fetch-text",
                               "--out-dir", str(tmp_path)])
    assert res.exit_code == 2, res.output
    assert "Starter" in res.output
    assert not list(tmp_path.glob("diff_x_jack_summary.json"))


def test_diff_free_plan_still_compares_local_exports(tmp_path):
    # The gate covers the live diff only. Comparing two exports the
    # user already has needs no archive or live check, so it stays free.
    import json

    old = tmp_path / "old.json"
    new = tmp_path / "new.json"
    old.write_text(json.dumps([
        {"post_id": "20", "original_post_url": "https://x.com/jack/status/20",
         "archived_timestamp": "20060321212430"},
        {"post_id": "21", "original_post_url": "https://x.com/jack/status/21",
         "archived_timestamp": "20060322000000"}]), encoding="utf-8")
    new.write_text(json.dumps([
        {"post_id": "20", "original_post_url": "https://x.com/jack/status/20",
         "archived_timestamp": "20060321212430"}]), encoding="utf-8")
    runner = CliRunner()
    res = runner.invoke(main, ["diff", str(old), str(new),
                               "--out-dir", str(tmp_path)])
    assert res.exit_code == 0, res.output
    assert "removed 1" in res.output
