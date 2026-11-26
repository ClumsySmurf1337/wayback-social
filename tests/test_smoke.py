"""Offline smoke tests — no network. Live CDX tests are manual
(see README 'Testing against live CDX') because archive.org is slow.
"""
from wayback_social.networks import detect_network, get_network, list_networks
from wayback_social.parse import FIELD_OPTIONS, PostsParser, timestamp_parser
from wayback_social.export import export_all

ROWS = [["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"],
        ["com,twitter)/jack/status/20", "20060321212430",
         "https://twitter.com/jack/status/20", "text/html", "200", "ABC", "1234"],
        ["com,twitter)/jack/status/21", "20060321213000",
         "https://twitter.com/jack/status/21", "text/html", "200", "DEF", "1235"]]


def test_networks():
    assert len(list_networks()) >= 14
    assert get_network("twitter").id == "x"
    assert get_network("ig").id == "instagram"
    assert get_network("nope") is None
    assert detect_network("https://www.tiktok.com/@tiktok/video/123").id == "tiktok"
    assert detect_network("https://bsky.app/profile/nasa.bsky.social/post/abc").id == "bluesky"


def test_cdx_patterns():
    x = get_network("x")
    assert "https://twitter.com/jack/status/*" in x.cdx_urls("jack")
    assert "https://x.com/jack/status/*" in x.cdx_urls("jack")
    assert x.post_id("https://twitter.com/jack/status/20") == "20"
    m = get_network("mastodon")
    assert "mastodon.social" in m.cdx_urls("gargron", "mastodon.social")[0]


def test_parse_and_export(tmp_path):
    assert timestamp_parser("20060321212430") == "2006-03-21 21:24:30"
    parser = PostsParser(ROWS, get_network("x"), "jack", FIELD_OPTIONS)
    recs = parser.parse(fetch_text=False)
    assert len(recs) == 2
    assert recs[0]["post_id"] == "20"
    assert recs[0]["archived_post_url"].startswith("https://web.archive.org/web/20060321212430/")
    assert recs[0]["available_post_text"] is None  # CDX-only, no fetch
    saved = export_all(recs, "x", "jack", tmp_path, ["csv", "json", "jsonl", "html"])
    assert len(saved) == 4
    assert all(p.exists() and p.stat().st_size > 0 for p in saved)
    assert "jack" in (tmp_path / saved[0].name).read_text()
