"""Parse CDX rows into generic post records.

Field names deliberately mirror waybacktweets (archived_*, parsed_*,
available_*) so anyone coming from that tool recognises them — only
``tweet`` becomes ``post`` and ``network`` / ``post_id`` are added.
"""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from urllib.parse import quote, unquote

from . import oembed as oembed_mod

FIELD_OPTIONS = [
    "network", "identifier", "post_id",
    "archived_urlkey", "archived_timestamp", "parsed_archived_timestamp",
    "archived_post_url", "parsed_archived_post_url",
    "original_post_url", "parsed_post_url",
    "available_post_text", "available_post_title", "available_post_author",
    "available_post_is_repost",
    "archived_mimetype", "archived_statuscode", "archived_digest",
    "archived_length", "resumption_key",
    # Fallback archives (competition top-8 #4): one click to check the
    # two archives that cover what Wayback misses (JS-heavy posts, video).
    "fallback_archive_today_url", "fallback_ghostarchive_url",
]


def fallback_links(original_url: str) -> tuple[str, str]:
    """archive.today + Ghostarchive links for one original post URL."""
    today = f"https://archive.today/newest/{original_url}"
    ghost = ("https://ghostarchive.org/search?term="
             + quote(original_url, safe=""))
    return today, ghost


def timestamp_parser(ts: str) -> str:
    """20200305123456 -> 2020-03-05 12:34:56 (UTC, as stored by CDX)."""
    try:
        return datetime.strptime(ts, "%Y%m%d%H%M%S").strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return ts


def _semicolon(s: str | None) -> str | None:
    # CSV safety: waybacktweets replaced ';' so fields don't break exports.
    return s.replace(";", ",") if s else s


def _clean_url(url: str) -> str:
    # Strip Wayback artefacts / tracking params that pollute CDX originals.
    url = unquote(url).replace("’", "")
    url = re.sub(r"[?&](hl|utm_[^=&]+|fbclid|igshid)=[^&]*", "", url)
    # CDX sometimes stores doubled slashes in the path
    # (twitter.com//jack//status//20) — collapse them, keeping "://".
    url = re.sub(r"(?<!:)/{2,}", "/", url)
    return url.rstrip("?&")


def _wayback_url(ts: str, original: str) -> str:
    return f"https://web.archive.org/web/{ts}/{original}"


class PostsParser:
    def __init__(self, cdx_rows: list, network, identifier: str,
                 field_options: list[str] | None = None,
                 resumption_key: str | None = None):
        self.rows = cdx_rows[1:] if cdx_rows and cdx_rows[0][0] == "urlkey" else cdx_rows
        self.network = network
        self.identifier = identifier
        self.fields = field_options or FIELD_OPTIONS
        unknown = [f for f in self.fields if f not in FIELD_OPTIONS]
        if unknown:
            raise ValueError(f"Unknown field options: {unknown}")
        self.resumption_key = resumption_key
        self.records: list[dict] = []

    def _process(self, row: list) -> dict | None:
        if len(row) < 7:
            return None
        urlkey, ts, original, mimetype, status, digest, length = row[:7]
        original = _clean_url(original)
        archived = _wayback_url(ts, original)
        post_id = self.network.post_id(original) if self.network else None
        today, ghost = fallback_links(original)
        rec = {
            "fallback_archive_today_url": today,
            "fallback_ghostarchive_url": ghost,
            "network": self.network.id if self.network else "",
            "identifier": self.identifier,
            "post_id": post_id or "",
            "archived_urlkey": urlkey,
            "archived_timestamp": ts,
            "parsed_archived_timestamp": timestamp_parser(ts),
            "archived_post_url": archived,
            "parsed_archived_post_url": archived,
            "original_post_url": original,
            "parsed_post_url": original,
            "available_post_text": None,
            "available_post_title": None,
            "available_post_author": None,
            "available_post_is_repost": None,
            "archived_mimetype": mimetype,
            "archived_statuscode": status,
            "archived_digest": digest,
            "archived_length": length,
            "resumption_key": self.resumption_key or "",
        }
        return rec

    def parse(self, fetch_text: bool = False, workers: int = 5,
              progress=None, fetch_cap: int | None = None) -> list[dict]:
        self.records = [r for r in (self._process(row) for row in self.rows) if r]
        if fetch_text and self.records:
            self._enrich(workers, progress, fetch_cap=fetch_cap)
        # Chronological, then by post id for stable output.
        self.records.sort(key=lambda r: (r["archived_timestamp"], r["post_id"]))
        return self.records

    def _enrich(self, workers: int, progress, fetch_cap: int | None = None):
        targets = self.records[:fetch_cap] if fetch_cap else self.records

        def _one(rec):
            raw_id = f"{rec['archived_timestamp']}id_/{rec['original_post_url']}"
            snapshot = f"https://web.archive.org/web/{raw_id}"
            try:
                info = oembed_mod.enrich(self.network, rec["original_post_url"], snapshot)
            except Exception:
                info = None
            if info:
                rec["available_post_text"] = _semicolon(info.get("text"))
                rec["available_post_title"] = _semicolon(info.get("title"))
                rec["available_post_author"] = _semicolon(info.get("author"))
                rec["available_post_is_repost"] = info.get("is_repost")
            return rec

        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(_one, r): r for r in targets}
            for fut in as_completed(futs):
                try:
                    fut.result()
                except Exception:
                    pass
                if progress:
                    progress()
