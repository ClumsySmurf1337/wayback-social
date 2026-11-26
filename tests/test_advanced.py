"""Offline tests for the advanced build: CDX merging, oEmbed parsing,
batch file handling, and exports. No live network calls."""
import json

from click.testing import CliRunner

from wayback_social import cdx as cdx_mod
from wayback_social.cli import main
from wayback_social.networks import get_network
from wayback_social.oembed import _strip_html, fetch_oembed
from wayback_social.parse import PostsParser


def test_cdx_query_many_merges_and_skips_malformed(monkeypatch):
    calls = {"n": 0}

    def fake_query(url_pattern, **kw):
        calls["n"] += 1
        header = ["urlkey", "timestamp", "original", "mimetype",
                  "statuscode", "digest", "length"]
        if "twitter" in url_pattern:
            return ([header,
                     ["com,twitter)/a/status/1", "20200101000000",
                      "https://twitter.com/a/status/1", "text/html", "200", "D1", "10"],
                     []], False)  # malformed [] row must be skipped
        return ([header,
                 ["com,x)/a/status/1", "20200101000000",
                  "https://x.com/a/status/1", "text/html", "200", "D1", "10"],
                 ["resume-key-123"]], False)

    monkeypatch.setattr(cdx_mod, "query_cdx", fake_query)
    rows, resume = cdx_mod.query_many(
        ["https://twitter.com/a/status/*", "https://x.com/a/status/*"])
    assert len(rows) == 3  # header + 2 captures (same ts, different URL)
    assert resume == "resume-key-123"
    assert calls["n"] == 2


def test_cdx_empty_raises(monkeypatch):
    monkeypatch.setattr(cdx_mod, "query_cdx",
                        lambda *a, **k: (_ for _ in ()).throw(
                            cdx_mod.EmptyResultError("none")))
    try:
        cdx_mod.query_many(["https://example.com/*"])
    except cdx_mod.EmptyResultError:
        return
    raise AssertionError("expected EmptyResultError")


def test_oembed_x_parsing(monkeypatch):
    class Resp:
        def json(self):
            return {"author_name": "jack",
                    "html": '<blockquote class="twitter-tweet"><p>just setting up my twttr</p>&mdash; jack (@jack) <a href="#">March 21, 2006</a></blockquote>'}

    monkeypatch.setattr("wayback_social.oembed._get_json", lambda url: Resp().json())
    out = fetch_oembed(get_network("x"), "https://twitter.com/jack/status/20")
    assert out and out["text"] == "just setting up my twttr"
    assert out["author"].startswith("jack")
    assert _strip_html("<p>hi<br>there</p>") == "hi\nthere"


def test_batch_skips_bad_lines_and_writes_summary(monkeypatch, tmp_path):
    rows = [["urlkey", "timestamp", "original", "mimetype", "statuscode",
             "digest", "length"],
            ["com,twitter)/jack/status/20", "20060321212430",
             "https://twitter.com/jack/status/20", "text/html", "200", "ABC", "1"]]
    monkeypatch.setattr(cdx_mod, "query_many", lambda patterns, **k: (rows, None))
    # cli imports query_many into its own namespace
    import wayback_social.cli as cli_mod
    monkeypatch.setattr(cli_mod, "query_many", lambda patterns, **k: (rows, None))
    targets = tmp_path / "targets.txt"
    targets.write_text("# watchlist\nx jack\nbogus nope\ninstagram\n\n")
    runner = CliRunner()
    res = runner.invoke(main, ["batch", str(targets), "--out-dir", str(tmp_path),
                               "--limit", "5"])
    assert res.exit_code == 0, res.output
    summary = json.loads((tmp_path / "batch_summary.json").read_text())
    assert len(summary) == 1 and summary[0]["captures"] == 1
    assert (tmp_path / "batch_summary.json").exists()


def test_parser_handles_short_rows():
    rows = [["urlkey", "timestamp", "original", "mimetype", "statuscode",
             "digest", "length"],
            ["short"],  # malformed — must not crash
            ["com,twitter)/jack/status/20", "20060321212430",
             "https://twitter.com/jack/status/20", "text/html", "200", "ABC", "1"]]
    recs = PostsParser(rows, get_network("x"), "jack").parse(fetch_text=False)
    assert len(recs) == 1 and recs[0]["post_id"] == "20"
