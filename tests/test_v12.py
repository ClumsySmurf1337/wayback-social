"""Offline tests for v1.2: export diff, replay text, fallback links,
plan caps, archive --live-check (stubbed). No live network calls."""
import json

import pytest
from click.testing import CliRunner

from wayback_social.cli import main
from wayback_social.diff import diff_exports, load_export
from wayback_social.networks import get_network
from wayback_social.oembed import extract_visible_text, fetch_replay_text
from wayback_social.parse import PostsParser, fallback_links
from wayback_social.plans import cap_limit, cap_find_networks, cap_batch_targets

ROWS = [["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"],
        ["com,twitter)/jack/status/20", "20060321212430",
         "https://twitter.com/jack/status/20", "text/html", "200", "ABC", "1"],
        ["com,twitter)/jack/status/21", "20060322000000",
         "https://twitter.com/jack/status/21", "text/html", "200", "DEF", "1"]]

REPLAY_HTML = """<html><head><title>jack on X: "just setting up my twttr"</title></head>
<body><div id="wayback-toolbar">Wayback Machine toolbar</div>
<main><article><p>just setting up my twttr</p></article></main>
<script>var x = 1;</script><style>.a{}</style></body></html>"""


# --- 1. export diff -------------------------------------------------------
def test_diff_exports_removed_added_kept(tmp_path):
    old = tmp_path / "old.json"
    new = tmp_path / "new.json"
    old.write_text(json.dumps([
        {"post_id": "20", "original_post_url": "https://twitter.com/jack/status/20",
         "archived_timestamp": "20060321212430", "network": "x", "identifier": "jack",
         "archived_post_url": "https://web.archive.org/web/20060321212430/https://twitter.com/jack/status/20"},
        {"post_id": "21", "original_post_url": "https://twitter.com/jack/status/21",
         "archived_timestamp": "20060322000000", "network": "x", "identifier": "jack",
         "archived_post_url": "https://web.archive.org/web/20060322000000/https://twitter.com/jack/status/21"},
        {"post_id": "22", "original_post_url": "https://twitter.com/jack/status/22",
         "archived_timestamp": "20060323000000", "network": "x", "identifier": "jack",
         "archived_post_url": "u"},
    ]))
    new.write_text(json.dumps([
        {"post_id": "21", "original_post_url": "https://twitter.com/jack/status/21",
         "archived_timestamp": "20200101000000", "network": "x", "identifier": "jack",
         "archived_post_url": "u2"},
        {"post_id": "23", "original_post_url": "https://twitter.com/jack/status/23",
         "archived_timestamp": "20200102000000", "network": "x", "identifier": "jack",
         "archived_post_url": "u3"},
    ]))
    res = diff_exports(load_export(old), load_export(new))
    assert res["removed"] == 2 and res["added"] == 1 and res["kept"] == 1
    removed = {r["post_id"] for r in res["removed_rows"]}
    assert removed == {"20", "22"}
    assert res["removed_rows"][0]["first_archived_timestamp"] == "20060321212430"
    assert res["removed_rows"][0]["last_archived_timestamp"] == "20060321212430"


def test_diff_exports_csv(tmp_path):
    old = tmp_path / "old.csv"
    old.write_text("post_id,original_post_url,archived_timestamp\n"
                   "20,https://twitter.com/jack/status/20,20060321212430\n")
    new = tmp_path / "new.csv"
    new.write_text("post_id,original_post_url,archived_timestamp\n")
    res = diff_exports(load_export(old), load_export(new))
    assert res["removed"] == 1 and res["kept"] == 0


def test_diff_exports_cli(tmp_path):
    old = tmp_path / "old.json"
    new = tmp_path / "new.json"
    old.write_text(json.dumps([{"post_id": "20",
                                "original_post_url": "https://twitter.com/jack/status/20",
                                "archived_timestamp": "20060321212430"}]))
    new.write_text(json.dumps([]))
    runner = CliRunner()
    res = runner.invoke(main, ["diff", str(old), str(new), "--format", "json",
                               "--out-dir", str(tmp_path)])
    assert res.exit_code == 0, res.output
    assert "removed 1" in res.output
    assert list(tmp_path.glob("diff_exports_*.json"))


def test_diff_exports_bad_format(tmp_path):
    bad = tmp_path / "x.txt"
    bad.write_text("nope")
    with pytest.raises(ValueError):
        load_export(bad)


# --- 2. replay text -------------------------------------------------------
def test_extract_visible_text_fixture():
    text = extract_visible_text(REPLAY_HTML)
    assert text and "just setting up my twttr" in text
    assert "Wayback Machine toolbar" not in text
    assert "var x = 1" not in text


def test_extract_visible_text_blank_shell():
    html = ("<html><head><title>X</title></head><body>"
            "<script src='/app.js'></script><div id='root'></div></body></html>")
    assert extract_visible_text(html) is None


def test_fetch_replay_text_offline(monkeypatch):
    class Resp:
        text = REPLAY_HTML

        def raise_for_status(self):
            pass

    monkeypatch.setattr("wayback_social.oembed.requests.get",
                        lambda url, **k: Resp())
    out = fetch_replay_text("https://twitter.com/jack/status/20", "20060321212430")
    assert out and "just setting up my twttr" in out["text"]
    assert out["title"] and "jack" in out["title"]


# --- 3. fallback links ----------------------------------------------------
def test_fallback_links():
    today, ghost = fallback_links("https://twitter.com/jack/status/20")
    assert today == "https://archive.today/newest/https://twitter.com/jack/status/20"
    assert ghost.startswith("https://ghostarchive.org/search?term=")
    assert "twitter.com%2Fjack%2Fstatus%2F20" in ghost


def test_parse_adds_fallback_links():
    recs = PostsParser(ROWS, get_network("x"), "jack").parse(fetch_text=False)
    assert len(recs) == 2
    for r in recs:
        assert r["fallback_archive_today_url"].startswith("https://archive.today/newest/")
        assert r["fallback_ghostarchive_url"].startswith("https://ghostarchive.org/search?term=")


# --- 4. plan caps ---------------------------------------------------------
def test_plan_caps():
    assert cap_limit("free", 100) == (25, True)
    assert cap_limit("free", 10) == (10, False)
    assert cap_limit("free", None) == (25, True)
    assert cap_limit("pro", 100) == (100, False)
    assert cap_limit("studio", 99999) == (25000, True)
    assert cap_find_networks("free", 14) == (3, True)
    assert cap_find_networks("starter", 5) == (5, False)
    assert cap_batch_targets("free", 10) == (3, True)


def test_archive_free_plan_caps_limit_offline(monkeypatch, tmp_path):
    import wayback_social.cli as cli_mod

    monkeypatch.setattr(cli_mod, "query_many", lambda patterns, **k: (ROWS, None))
    seen = {}

    def spy(patterns, **k):
        seen.update(k)
        return (ROWS, None)

    monkeypatch.setattr(cli_mod, "query_many", spy)
    runner = CliRunner()
    res = runner.invoke(main, ["archive", "x", "jack", "--no-fetch-text",
                               "--limit", "500", "--format", "json",
                               "--out-dir", str(tmp_path)])
    assert res.exit_code == 0, res.output
    assert seen["limit"] == 25  # free cap enforced
    assert "capped to 25" in res.output
    assert "Plan: Free" in res.output


def test_batch_free_plan_caps_targets_offline(monkeypatch, tmp_path):
    import wayback_social.cli as cli_mod

    monkeypatch.setattr(cli_mod, "query_many", lambda patterns, **k: (ROWS, None))
    targets = tmp_path / "t.txt"
    targets.write_text("\n".join(f"x u{i}" for i in range(5)))
    runner = CliRunner()
    res = runner.invoke(main, ["batch", str(targets), "--out-dir", str(tmp_path),
                               "--format", "json", "--no-fetch-text"])
    assert res.exit_code == 0, res.output
    summary = json.loads((tmp_path / "batch_summary.json").read_text())
    assert len(summary) == 3  # free cap: 3 targets
    assert "capped to the first 3" in res.output


def test_archive_live_check_offline(monkeypatch, tmp_path):
    import wayback_social.cli as cli_mod
    import wayback_social.diff as diff_mod

    monkeypatch.setattr(cli_mod, "query_many", lambda patterns, **k: (ROWS, None))
    monkeypatch.setattr(diff_mod, "classify_live",
                        lambda url, nid="", request=None: {
                            "live_verdict": "deleted" if "status/21" in url else "live",
                            "live_http_status": 404 if "status/21" in url else 200,
                            "live_final_url": url,
                            "live_checked_at": "2026-11-26T00:00:00+00:00"})
    # archive imports classify_live into cli namespace; patch there too.
    monkeypatch.setattr(cli_mod, "classify_live",
                        lambda url, nid="", request=None: {
                            "live_verdict": "deleted" if "status/21" in url else "live",
                            "live_http_status": 404 if "status/21" in url else 200,
                            "live_final_url": url,
                            "live_checked_at": "2026-11-26T00:00:00+00:00"})
    runner = CliRunner()
    res = runner.invoke(main, ["archive", "x", "jack", "--no-fetch-text",
                               "--live-check", "--format", "json",
                               "--out-dir", str(tmp_path)])
    assert res.exit_code == 0, res.output
    assert "deleted 1" in res.output
    saved = list(tmp_path.glob("x_jack_*.json"))
    assert saved
    data = json.loads(saved[0].read_text())
    assert any(r.get("live_verdict") == "deleted" for r in data)
    assert all("live_verdict" in r for r in data)
