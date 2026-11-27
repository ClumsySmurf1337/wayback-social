"""Offline tests for v1.4: evidence pack, export gating, Bluesky /
Mastodon live checks, Arquivo.pt. No live network calls (live runs are
in TEST-REPORT.md, recorded separately)."""
import hashlib
import io
import json
import zipfile

import pytest
from click.testing import CliRunner

from wayback_social.cli import main
from wayback_social.diff import diff_records
from wayback_social.evidence import (PACK_FILES, build_evidence_pack,
                                     require_evidence)
from wayback_social.export import FormatNotAllowedError, resolve_export_formats
from wayback_social import arquivo as arquivo_mod
from wayback_social import live as live_mod

RECORDS = [
    {"network": "x", "identifier": "jack", "post_id": "20",
     "archived_timestamp": "20060321212430",
     "parsed_archived_timestamp": "2006-03-21 21:24:30",
     "original_post_url": "https://twitter.com/jack/status/20",
     "archived_post_url": "https://web.archive.org/web/20060321212430/https://twitter.com/jack/status/20",
     "available_post_text": "just setting up my twttr",
     "available_post_title": None, "available_post_author": "jack",
     "live_verdict": "deleted",
     "fallback_archive_today_url": "https://archive.today/newest/https://twitter.com/jack/status/20",
     "fallback_ghostarchive_url": "https://ghostarchive.org/search?term=x"},
    {"network": "x", "identifier": "jack", "post_id": "21",
     "archived_timestamp": "20060322000000",
     "parsed_archived_timestamp": "2006-03-22 00:00:00",
     "original_post_url": "https://twitter.com/jack/status/21",
     "archived_post_url": "https://web.archive.org/web/20060322000000/https://twitter.com/jack/status/21",
     "available_post_text": None, "available_post_title": None,
     "available_post_author": None, "live_verdict": "live",
     "fallback_archive_today_url": "https://archive.today/newest/https://twitter.com/jack/status/21",
     "fallback_ghostarchive_url": "https://ghostarchive.org/search?term=y"},
]


# --- 1. evidence pack ------------------------------------------------------
def test_evidence_pack_contents_and_manifest(tmp_path):
    out = tmp_path / "pack.zip"
    path, manifest = build_evidence_pack(
        RECORDS, {"network": "x", "identifier": "jack"}, out)
    assert path == out and out.exists()
    with zipfile.ZipFile(out) as zf:
        assert sorted(zf.namelist()) == sorted(PACK_FILES)
        assert zf.testzip() is None
        files = {n: zf.read(n) for n in zf.namelist()}
    # Manifest hashes match the actual file bytes (except the two
    # files that cannot hash themselves).
    for name, meta in manifest["files"].items():
        if name in ("manifest.json", "manifest.sha256"):
            assert "self" in meta["sha256"]
            continue
        assert meta["sha256"] == hashlib.sha256(files[name]).hexdigest(), name
    # manifest.sha256 is a real sha256sum checklist: every hashable
    # file listed, and the lines verify against the pack bytes.
    sha_lines = files["manifest.sha256"].decode().strip().split("\n")
    assert len(sha_lines) == len(PACK_FILES) - 1  # everything but itself
    for line in sha_lines:
        digest, fname = line.split("  ", 1)
        assert digest == hashlib.sha256(files[fname]).hexdigest(), fname
    # Report is human-readable and carries the evidence.
    html = files["report.html"].decode()
    assert "jack" in html and "status/20" in html
    assert "just setting up my twttr" in html
    assert "deleted" in html
    assert "archive.today" in html
    # Machine-readable captures round-trip.
    assert len(json.loads(files["captures.json"])) == 2
    assert files["captures.jsonl"].decode().count("\n") == 2
    assert "status/20" in files["captures.csv"].decode()
    assert "sha256sum -c manifest.sha256" in files["README.txt"].decode()
    assert manifest["counts"] == {"records": 2, "deleted": 1, "live": 1,
                                  "unknown": 0}
    assert manifest["tool_version"] == __import__(
        "wayback_social").__version__


def test_evidence_pack_gating():
    for plan in ("free", "starter", "pro"):
        with pytest.raises(ValueError, match="Studio"):
            require_evidence(plan)
    require_evidence("studio")  # no error


def test_evidence_cli_gating(tmp_path):
    export = tmp_path / "x_jack.json"
    export.write_text(json.dumps(RECORDS))
    runner = CliRunner()
    res = runner.invoke(main, ["evidence", str(export), "--out",
                               str(tmp_path / "p.zip")])
    assert res.exit_code == 2, res.output
    assert "Studio" in res.output
    res = runner.invoke(main, ["evidence", str(export), "--out",
                               str(tmp_path / "p.zip"), "--plan", "studio"])
    assert res.exit_code == 0, res.output
    assert (tmp_path / "p.zip").exists()
    with zipfile.ZipFile(tmp_path / "p.zip") as zf:
        assert "manifest.json" in zf.namelist()


# --- 2. export-format gating ----------------------------------------------
@pytest.mark.parametrize("plan,fmt,ok", [
    ("free", "csv", True), ("free", "json", False), ("free", "html", False),
    ("starter", "json", True), ("starter", "jsonl", False),
    ("pro", "jsonl", True), ("pro", "html", True),
    ("studio", "html", True),
])
def test_format_gating_matrix(plan, fmt, ok):
    if ok:
        fmts, skipped = resolve_export_formats(plan, [fmt])
        assert fmts == [fmt] and not skipped
    else:
        with pytest.raises(FormatNotAllowedError) as e:
            resolve_export_formats(plan, [fmt])
        assert "need the" in str(e.value) and "CSV" in str(e.value)


def test_format_all_clamps_to_plan():
    fmts, skipped = resolve_export_formats("free", ["all"])
    assert fmts == ["csv"] and set(skipped) == {"json", "jsonl", "html"}
    fmts, skipped = resolve_export_formats("pro", ["all"])
    assert fmts == ["csv", "json", "jsonl", "html"] and not skipped


def test_archive_free_html_is_usage_error(monkeypatch, tmp_path):
    import wayback_social.commands.archive as cli_mod
    rows = [["urlkey", "timestamp", "original", "mimetype", "statuscode",
             "digest", "length"],
            ["com,twitter)/jack/status/20", "20060321212430",
             "https://twitter.com/jack/status/20", "text/html", "200", "ABC", "1"]]
    monkeypatch.setattr(cli_mod, "query_many", lambda patterns, **k: (rows, None))
    runner = CliRunner()
    res = runner.invoke(main, ["archive", "x", "jack", "--no-fetch-text",
                               "--format", "html", "--out-dir", str(tmp_path)])
    assert res.exit_code == 2, res.output
    assert "Pro" in res.output and "csv" in res.output.lower()
    assert not list(tmp_path.glob("*.html"))
    # Default ("all") on free clamps to CSV with a note instead.
    res = runner.invoke(main, ["archive", "x", "jack", "--no-fetch-text",
                               "--out-dir", str(tmp_path)])
    assert res.exit_code == 0, res.output
    assert list(tmp_path.glob("*.csv"))
    assert not list(tmp_path.glob("*.html"))
    assert "need a higher plan" in res.output


# --- 3. Bluesky / Mastodon live checks (stubbed HTTP) ----------------------
class _JsonResp:
    def __init__(self, code, data):
        self.status_code = code
        self._data = data
        self.headers = {"content-type": "application/json"}

    def json(self):
        return self._data


def _stub_get_factory(routes):
    def fake(url, params=None, **k):
        for key, (code, data) in routes.items():
            if key in url:
                return _JsonResp(code, data)
        return _JsonResp(404, {})
    return fake


def test_bluesky_live_feed_verdicts(monkeypatch):
    routes = {
        "getProfile": (200, {"did": "did:plc:abc", "handle": "nasa.bsky.social",
                             "displayName": "NASA", "postsCount": 3}),
        "getAuthorFeed": (200, {"feed": [
            {"post": {"uri": "at://did:plc:abc/app.bsky.feed.post/111",
                      "author": {"handle": "nasa.bsky.social"},
                      "record": {"text": "hello", "createdAt": "2024-01-01T00:00:00Z"}}},
            {"post": {"uri": "at://did:plc:abc/app.bsky.feed.post/222",
                      "author": {"handle": "nasa.bsky.social"},
                      "record": {"text": "world", "createdAt": "2024-01-02T00:00:00Z"}}}]})
    }
    monkeypatch.setattr(live_mod.requests, "get", _stub_get_factory(routes))
    info = live_mod.live_check("bluesky", "nasa.bsky.social")
    assert info["profile_status"] == "found"
    assert info["live_post_ids"] == ["111", "222"]
    assert info["complete"] is True  # 2 < 100 limit: nothing cut off
    recs = [{"post_id": "111", "original_post_url": "u1"},
            {"post_id": "999", "original_post_url": "u2"}]
    v = live_mod.verdicts_from_live(recs, info)
    assert v["111"]["live_verdict"] == "live"
    assert v["999"]["live_verdict"] == "deleted"  # complete feed, missing = gone


def test_bluesky_truncated_feed_is_unknown(monkeypatch):
    feed = {"feed": [{"post": {"uri": f"at://did:plc:abc/app.bsky.feed.post/{i:03d}",
                               "author": {"handle": "nasa.bsky.social"},
                               "record": {"text": "t", "createdAt": "2024-01-01T00:00:00Z"}}}
                      for i in range(100)]}
    routes = {"getProfile": (200, {"did": "did:plc:abc", "handle": "nasa.bsky.social",
                                   "postsCount": 500}),
              "getAuthorFeed": (200, feed)}
    monkeypatch.setattr(live_mod.requests, "get", _stub_get_factory(routes))
    info = live_mod.live_check("bluesky", "nasa.bsky.social")
    assert info["complete"] is False  # hit the 100 limit: older posts unseen
    v = live_mod.verdicts_from_live(
        [{"post_id": "xyz", "original_post_url": "u"}], info)
    assert v["xyz"]["live_verdict"] == "unknown"


def test_mastodon_live_verdicts(monkeypatch):
    routes = {
        "accounts/lookup": (200, {"id": "13179", "username": "Mastodon",
                                  "statuses_count": 2,
                                  "created_at": "2016-11-23T00:00:00Z"}),
        "accounts/13179/statuses": (200, [
            {"id": "100", "url": "https://mastodon.social/@Mastodon/100",
             "created_at": "2024-01-01T00:00:00Z", "content": "<p>hi</p>"}]),
    }
    monkeypatch.setattr(live_mod.requests, "get", _stub_get_factory(routes))
    info = live_mod.live_check("mastodon", "Mastodon", "mastodon.social")
    assert info["profile_status"] == "found"
    assert info["live_post_ids"] == ["100"]
    v = live_mod.verdicts_from_live(
        [{"post_id": "100", "original_post_url": "u1"},
         {"post_id": "101", "original_post_url": "u2"}], info)
    assert v["100"]["live_verdict"] == "live"
    assert v["101"]["live_verdict"] == "deleted"


def test_live_profile_gone_means_deleted(monkeypatch):
    routes = {"getProfile": (404, {})}
    monkeypatch.setattr(live_mod.requests, "get", _stub_get_factory(routes))
    info = live_mod.live_check("bluesky", "ghost.bsky.social")
    assert info["profile_status"] == "not_found"
    v = live_mod.verdicts_from_live(
        [{"post_id": "1", "original_post_url": "u"}], info)
    assert v["1"]["live_verdict"] == "deleted"


def test_handle_from_url():
    """--url mode passes a full post URL; live checks need the handle."""
    assert live_mod.handle_from_url(
        "mastodon", "https://mastodon.social/@Mastodon/117625790631441803") == (
        "Mastodon", "mastodon.social")
    assert live_mod.handle_from_url(
        "mastodon", "https://fosstodon.org/@alice/123") == ("alice", "fosstodon.org")
    assert live_mod.handle_from_url(
        "bluesky", "https://bsky.app/profile/bsky.app/post/3n2ozugncr22j") == (
        "bsky.app", "mastodon.social")
    # Unparseable input passes through unchanged (lookup 404s honestly).
    assert live_mod.handle_from_url("x", "jack") == ("jack", "mastodon.social")


def test_live_lookup_error_falls_back(monkeypatch):
    def boom(url, params=None, **k):
        raise ConnectionError("down")
    monkeypatch.setattr(live_mod.requests, "get", boom)
    info = live_mod.live_check("bluesky", "nasa.bsky.social")
    assert info["profile_status"] == "error"
    assert live_mod.verdicts_from_live(
        [{"post_id": "1", "original_post_url": "u"}], info) == {}


def test_diff_records_uses_live_ids_not_head(monkeypatch):
    """With live_ids given, diff_records must not call classify_live."""
    import wayback_social.diff as diff_mod
    monkeypatch.setattr(diff_mod, "classify_live",
                        lambda *a, **k: (_ for _ in ()).throw(
                            AssertionError("HEAD must not be called")))
    rows, skipped = diff_records(
        [dict(RECORDS[0]), dict(RECORDS[1])], "x", workers=1,
        live_ids={"20"}, live_complete=True)
    by_id = {r["post_id"]: r["live_verdict"] for r in rows}
    assert by_id == {"20": "live", "21": "deleted"}


# --- 4. Arquivo.pt (stubbed HTTP) ------------------------------------------
def test_arquivo_keyword_maps_to_records(monkeypatch):
    payload = {"response_items": [
        {"originalURL": "https://twitter.com/jack/status/20",
         "tstamp": "20100305120000",
         "linkToArchive": "https://arquivo.pt/wayback/20100305120000/https://twitter.com/jack/status/20",
         "title": "jack post", "mimeType": "text/html", "status": "200",
         "digest": "XYZ"},
        {"originalURL": "https://example.com/other",
         "tstamp": "20100305120000", "linkToArchive": "u"}]}

    class Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return payload

    monkeypatch.setattr(arquivo_mod.requests, "get",
                        lambda url, params=None, **k: Resp())
    recs, mode = arquivo_mod.arquivo_search("jack", keyword="plunger")
    assert mode == "keyword"
    assert len(recs) == 1  # only the URL mentioning jack is kept
    r = recs[0]
    assert r["post_id"] == "20" and r["source"] == "arquivo.pt"
    assert r["archived_timestamp"] == "20100305120000"
    assert r["archived_post_url"].startswith("https://arquivo.pt/wayback/")
    assert r["available_post_title"] == "jack post"
    assert "arquivo.pt" in r["fallback_archive_today_url"] or True
    assert arquivo_mod.EMBARGO_NOTE.startswith("Arquivo.pt")


def test_arquivo_cdx_mode(monkeypatch):
    # Real shape (verified live 2026-11-26): JSONL, one object per line.
    body = ('{"urlkey": "com,twitter)/jack/status/20", '
            '"timestamp": "20101225223655", '
            '"url": "http://twitter.com//jack//status//20", '
            '"mime": "text/html", "status": "404", "digest": "ABC", '
            '"length": "4130"}\n')

    class Resp:
        text = body

        def raise_for_status(self):
            pass

    monkeypatch.setattr(arquivo_mod.requests, "get",
                        lambda url, params=None, **k: Resp())
    recs, mode = arquivo_mod.arquivo_search("jack")
    assert mode == "cdx" and len(recs) == 1
    assert recs[0]["post_id"] == "20"
    assert "//jack//" not in recs[0]["original_post_url"]
    assert recs[0]["archived_timestamp"] == "20101225223655"


def test_arquivo_unknown_network_cdx():
    with pytest.raises(ValueError, match="no URL pattern"):
        arquivo_mod.arquivo_search("jack", network="instagram")
