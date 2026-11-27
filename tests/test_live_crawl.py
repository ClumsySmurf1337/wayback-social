"""Offline tests for live_crawl.py — stubbed HTTP, no network.

Live behaviour is verified separately by the CLI smoke runs
(live bluesky bsky.app, live mastodon Mastodon, live x jack).
"""
from __future__ import annotations

import json

import pytest

from wayback_social import live_crawl


class _Resp:
    def __init__(self, status=200, text="", json_data=None):
        self.status_code = status
        self.text = text
        self._json = json_data

    def json(self):
        if self._json is None:
            raise ValueError("no json")
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests
            raise requests.HTTPError(f"HTTP {self.status_code}",
                                     response=self)


X_OEMBED_HTML = ('<blockquote class="twitter-tweet"><p lang="en">just '
                 'setting up my twttr</p>&mdash; jack (@jack) '
                 '<a href="https://x.com/jack/status/20">March 21, 2006</a>'
                 '</blockquote>')


def _stub_get(monkeypatch, mapping):
    """mapping: substring -> _Resp. Anything else -> 404."""
    def fake(url, **kw):
        for sub, resp in mapping.items():
            if sub in url:
                return resp
        return _Resp(404, "")
    monkeypatch.setattr(live_crawl.requests, "get", fake)
    return fake


def test_oembed_x_live_parses_text(monkeypatch):
    _stub_get(monkeypatch, {"publish.twitter.com": _Resp(
        200, json_data={"html": X_OEMBED_HTML, "author_name": "jack"})})
    out = live_crawl.oembed_exists("x", "https://twitter.com/jack/status/20")
    assert out["status"] == "live"
    assert out["text"] == "just setting up my twttr"
    assert out["author"] == "jack"


def test_oembed_x_404_is_deleted(monkeypatch):
    _stub_get(monkeypatch, {"publish.twitter.com": _Resp(404, "")})
    out = live_crawl.oembed_exists("x", "https://twitter.com/jack/status/999")
    assert out["status"] == "deleted"


def test_oembed_youtube_title(monkeypatch):
    _stub_get(monkeypatch, {"youtube.com/oembed": _Resp(
        200, json_data={"title": "Rick Astley - Never Gonna Give You Up",
                        "author_name": "Rick Astley"})})
    out = live_crawl.oembed_exists(
        "youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert out["status"] == "live"
    assert "Rick Astley" in out["text"]


def test_oembed_unknown_network_is_login_walled():
    out = live_crawl.oembed_exists("instagram", "https://www.instagram.com/p/x/")
    assert out["status"] == "login-walled"


def test_live_profile_login_walled():
    for net in ("instagram", "facebook", "threads", "linkedin", "reddit"):
        out = live_crawl.live_profile(net, "someone")
        assert out["status"] == "login-walled", net


def test_live_profile_bluesky_not_found(monkeypatch):
    def fake_check(network, identifier, instance="mastodon.social", limit=100):
        return {"network": "bluesky", "identifier": identifier,
                "profile_status": "not_found", "post_count": 0,
                "live_post_ids": [], "complete": False, "error": ""}
    monkeypatch.setattr(live_crawl.live_mod, "live_check", fake_check)
    out = live_crawl.live_profile("bluesky", "nasa.bsky.social")
    assert out["status"] == "not-found"


def test_live_profile_bluesky_live(monkeypatch):
    def fake_check(network, identifier, instance="mastodon.social", limit=100):
        return {"network": "bluesky", "identifier": identifier,
                "profile_status": "found", "post_count": 42,
                "live_post_ids": ["abc"], "complete": True, "error": ""}
    monkeypatch.setattr(live_crawl.live_mod, "live_check", fake_check)
    monkeypatch.setattr(live_crawl.live_mod, "bluesky_profile",
                        lambda actor: {"status": "found", "did": "did:plc:x",
                                       "display_name": "Bluesky",
                                       "posts_count": 42})
    out = live_crawl.live_profile("bluesky", "bsky.app")
    assert out["status"] == "live"
    assert out["did"] == "did:plc:x"
    assert out["posts"] == 42


def test_rss_feed_parses_atom(monkeypatch):
    atom = ('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">'
            '<entry><title>Hello world</title>'
            '<link href="https://example.com/p/1"/>'
            '<published>2026-01-02T03:04:05Z</published></entry></feed>')
    _stub_get(monkeypatch, {"example.com/feed": _Resp(200, text=atom)})
    out = live_crawl.rss_feed("https://example.com/feed")
    assert out["status"] == "live"
    assert out["posts"][0]["url"] == "https://example.com/p/1"
    assert out["posts"][0]["text"] == "Hello world"


def test_rss_feed_failure_is_unavailable(monkeypatch):
    def boom(url, **kw):
        raise ConnectionError("down")
    monkeypatch.setattr(live_crawl.requests, "get", boom)
    out = live_crawl.rss_feed("https://example.com/feed")
    assert out["status"] == "unavailable"
    assert out["posts"] == []


def test_cross_check_x_uses_oembed(monkeypatch):
    _stub_get(monkeypatch, {
        "publish.twitter.com/oembed?url=https%3A%2F%2Ftwitter.com%2Fjack%2Fstatus%2F20":
            _Resp(200, json_data={"html": X_OEMBED_HTML, "author_name": "jack"}),
        "publish.twitter.com": _Resp(404, "")})
    recs = [
        {"post_id": "20", "original_post_url": "https://twitter.com/jack/status/20",
         "archived_timestamp": "20060321212430"},
        {"post_id": "21", "original_post_url": "https://twitter.com/jack/status/21",
         "archived_timestamp": "20060322000000"},
    ]
    out, skipped = live_crawl.cross_check(recs, "x")
    assert skipped == 0
    by_id = {r["post_id"]: r for r in out}
    assert by_id["20"]["live_status"] == "live"
    assert by_id["21"]["live_status"] == "deleted"


def test_cross_check_login_walled_is_unknown():
    recs = [{"post_id": "C1", "original_post_url": "https://www.instagram.com/p/C1/",
             "archived_timestamp": "20240101000000"}]
    out, skipped = live_crawl.cross_check(recs, "instagram")
    assert skipped == 0
    assert out[0]["live_status"] == "unknown"
    assert "login-walled" in out[0]["live_note"]


def test_cross_check_bluesky_uses_feed_verdicts(monkeypatch):
    def fake_check(network, identifier, instance="mastodon.social", limit=100):
        return {"network": "bluesky", "identifier": identifier,
                "profile_status": "found", "post_count": 1,
                "live_post_ids": ["3abc"], "complete": True,
                "checked_at": "2026-11-26T00:00:00+00:00", "error": ""}
    monkeypatch.setattr(live_crawl.live_mod, "live_check", fake_check)
    recs = [
        {"post_id": "3abc",
         "original_post_url": "https://bsky.app/profile/bsky.app/post/3abc",
         "archived_timestamp": "20250101000000"},
        {"post_id": "3def",
         "original_post_url": "https://bsky.app/profile/bsky.app/post/3def",
         "archived_timestamp": "20250102000000"},
    ]
    out, skipped = live_crawl.cross_check(recs, "bluesky")
    assert skipped == 0
    by_id = {r["post_id"]: r for r in out}
    assert by_id["3abc"]["live_status"] == "live"
    # Feed was complete, so the missing post is deleted, not unknown.
    assert by_id["3def"]["live_status"] == "deleted"


def test_cross_check_skips_listing_rows_without_post_id(monkeypatch):
    """Bare /status rows (no post id) must not be oEmbed-checked —
    a 404 on a listing URL would fake a 'deleted' verdict."""
    _stub_get(monkeypatch, {"publish.twitter.com": _Resp(404, "")})
    recs = [
        {"post_id": "", "original_post_url": "https://x.com/jack/status/",
         "archived_timestamp": "20250912050157"},
        {"post_id": "20", "original_post_url": "https://twitter.com/jack/status/20",
         "archived_timestamp": "20060321212430"},
    ]
    out, skipped = live_crawl.cross_check(recs, "x")
    assert skipped == 1
    assert [r["post_id"] for r in out] == ["20"]
    assert out[0]["live_status"] == "deleted"
