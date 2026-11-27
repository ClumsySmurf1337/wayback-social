"""Offline tests for archives.py — stubbed HTTP, no network.

Live behaviour is verified by `wayback-social sources` (probes) and
the CLI smoke runs.
"""
from __future__ import annotations

import json

from wayback_social import archives


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


def test_ghostarchive_parses_archive_links(monkeypatch):
    html = ('<html><body><a href="/archive/AJzyo">x</a> '
            '<a href="/archive/AxS75">y</a> '
            '<a href="https://ghostarchive.org">home</a></body></html>')
    monkeypatch.setattr(archives.requests, "get",
                        lambda url, **kw: _Resp(200, text=html))
    out = archives.search_ghostarchive("https://twitter.com/jack/status/20")
    assert out["status"] == "ok"
    assert [r["archived_post_url"] for r in out["records"]] == [
        "https://ghostarchive.org/archive/AJzyo",
        "https://ghostarchive.org/archive/AxS75"]


def test_ghostarchive_parses_capture_dates(monkeypatch):
    # Real row shape from ghostarchive.org/search (live 2026-11-27):
    # <td><a href="/archive/AJzyo">URL</a></td><td>Sun, 14 Apr 2024 02:47:34 GMT
    html = ('<html><body><table>'
            '<tr><td><img src="/img2/afDG6.png"></td>'
            '<td><a href="/archive/afDG6">https://twitter.com/jack/status/20</a></td>'
            '<td>Sun, 14 Apr 2024 03:32:58 GMT</td></tr>'
            '<tr><td><img src="/img2/AJzyo.png"></td>'
            '<td><a href="/archive/AJzyo">https://twitter.com/jack/status/20</a></td>'
            '<td>Sun, 14 Apr 2024 02:47:34 GMT</td></tr>'
            '</table></body></html>')
    monkeypatch.setattr(archives.requests, "get",
                        lambda url, **kw: _Resp(200, text=html))
    out = archives.search_ghostarchive("https://twitter.com/jack/status/20")
    assert out["status"] == "ok"
    assert [(r["archived_post_url"].rsplit("/", 1)[-1],
             r["archived_timestamp"]) for r in out["records"]] == [
        ("afDG6", "20240414033258"), ("AJzyo", "20240414024734")]


def test_ghostarchive_link_without_date_keeps_empty_timestamp(monkeypatch):
    html = ('<html><body><a href="/archive/AJzyo">x</a></body></html>')
    monkeypatch.setattr(archives.requests, "get",
                        lambda url, **kw: _Resp(200, text=html))
    out = archives.search_ghostarchive("https://twitter.com/jack/status/20")
    assert out["status"] == "ok"
    assert out["records"][0]["archived_timestamp"] == ""
    assert (out["records"][0]["archived_post_url"]
            == "https://ghostarchive.org/archive/AJzyo")


def test_ghostarchive_no_links_is_unavailable_not_zero(monkeypatch):
    monkeypatch.setattr(archives.requests, "get",
                        lambda url, **kw: _Resp(200, text="<html></html>"))
    out = archives.search_ghostarchive("https://twitter.com/jack/status/20")
    assert out["status"] == "unavailable"
    assert out["records"] == []
    assert "ghostarchive.org/search" in out["note"]


def test_memgator_needs_url(monkeypatch):
    # MEMGATOR_URL=off is the explicit opt-out (unset now defaults to the
    # public instance — see docs/memgator-deploy.md).
    monkeypatch.setenv("MEMGATOR_URL", "off")
    out = archives.search_memgator("https://twitter.com/jack/status/20")
    assert out["status"] == "not-configured"
    assert "MEMGATOR_URL" in out["note"]


def test_memgator_defaults_to_public_instance(monkeypatch):
    monkeypatch.delenv("MEMGATOR_URL", raising=False)
    timemap = {"mementos": {"list": [
        {"uri": "https://web.archive.org/web/20200101000000/https://example.com",
         "datetime": "2020-01-01T00:00:00Z"}]}}
    seen = {}

    def fake_get(url, **kw):
        seen["url"] = url
        return _Resp(200, json_data=timemap)

    monkeypatch.setattr(archives.requests, "get", fake_get)
    out = archives.search_memgator("https://example.com")
    assert out["status"] == "ok"
    assert seen["url"].startswith(
        "https://memgator.northforgelabs.dev/timemap/json/")


def test_memgator_with_url(monkeypatch):
    monkeypatch.setenv("MEMGATOR_URL", "http://localhost:1208")
    timemap = {"mementos": {"list": [
        {"uri": "https://web.archive.org/web/20200101000000/https://example.com",
         "datetime": "2020-01-01T00:00:00Z"}]}}
    monkeypatch.setattr(archives.requests, "get",
                        lambda url, **kw: _Resp(200, json_data=timemap))
    out = archives.search_memgator("https://example.com")
    assert out["status"] == "ok"
    assert out["records"][0]["archived_timestamp"] == "20200101000000"


def test_commoncrawl_job_queue_and_check(tmp_path, monkeypatch):
    job = archives.queue_commoncrawl_job(
        "https://twitter.com/jack/status/20", tmp_path)
    assert job["status"] == "queued"
    assert "index.commoncrawl.org" in job["index_url"]
    assert json.loads(tmp_path.joinpath(job["path"].split("/")[-1])
                      .read_text())["status"] == "queued"
    # Index 404 -> honest empty, not an error.
    monkeypatch.setattr(archives.requests, "get",
                        lambda url, **kw: _Resp(404, text='{"message": "No Captures"}'))
    done = archives.run_commoncrawl_job(job["path"])
    assert done["status"] == "empty"
    # Index 200 with rows -> done.
    body = ('{"url": "twitter.com/jack/status/20", "timestamp": "20200101"}\n'
            '{"url": "twitter.com/jack/status/20", "timestamp": "20210101"}\n')
    monkeypatch.setattr(archives.requests, "get",
                        lambda url, **kw: _Resp(200, text=body))
    done = archives.run_commoncrawl_job(job["path"])
    assert done["status"] == "done"
    assert done["result"]["captures"] == 2


def test_search_archive_unknown_source():
    out = archives.search_archive("nope", "https://example.com")
    assert out["status"] == "unavailable"
    assert "unknown archive source" in out["note"]


def test_search_archive_commoncrawl_is_async_only():
    out = archives.search_archive("commoncrawl", "https://example.com")
    assert out["status"] == "async-only"
    assert out["records"] == []


def test_arquivo_delegates_to_arquivo_module(monkeypatch):
    import wayback_social.arquivo as arquivo_mod
    items = [{"originalURL": "https://twitter.com/jack/status/20",
              "tstamp": "20101225223655",
              "linkToArchive": "https://arquivo.pt/wayback/20101225223655/https://twitter.com/jack/status/20",
              "title": "https://twitter.com/jack/status/20"}]
    monkeypatch.setattr(arquivo_mod, "search_keyword", lambda q, max_items=50: items)
    out = archives.search_arquivo("plunger", keyword=True)
    assert out["status"] == "ok"
    assert out["records"][0]["archived_timestamp"] == "20101225223655"
    assert out["records"][0]["source"] == "arquivo.pt"


def test_arquivo_cdx_delegates(monkeypatch):
    import wayback_social.arquivo as arquivo_mod
    rows = [["com,twitter)/jack/status/20", "20101225223655",
             "https://twitter.com/jack/status/20", "text/html", "200"]]
    monkeypatch.setattr(arquivo_mod, "search_cdx",
                        lambda url, max_items=50: rows)
    out = archives.search_arquivo_cdx("https://twitter.com/jack/status/20")
    assert out["status"] == "ok"
    assert out["records"][0]["post_id"] == "20"


def test_probe_commoncrawl_uses_collinfo(monkeypatch):
    monkeypatch.setattr(archives.requests, "get",
                        lambda url, **kw: _Resp(200, json_data=[
                            {"id": "CC-MAIN-2026-47"}]))
    out = archives.probe_source("commoncrawl")
    assert out["status"] == "async-only"
    assert "CC-MAIN-2026-47" in out["note"]


def test_wayback_closest_ok(monkeypatch):
    monkeypatch.setattr(archives.requests, "get",
                        lambda url, **kw: _Resp(200, json_data={
                            "archived_snapshots": {"closest": {
                                "status": "200", "available": True,
                                "url": "http://web.archive.org/web/20260723100538/https://twitter.com/jack/status/20",
                                "timestamp": "20260723100538"}}}))
    out = archives.wayback_closest("https://twitter.com/jack/status/20")
    assert out["status"] == "ok"
    assert out["timestamp"] == "20260723100538"
