"""Arquivo.pt source (v1.4) — the Pro keyword fallback.

Arquivo.pt is the only archive with real full-text search, and its
CDX endpoint covers what Wayback missed. Free, no key:
250 req/60 s per IP on textsearch and CDX.

Two modes, both mapped into the same record shape as parse.py
(``source`` is an extra key, not exported by default):

* keyword search — ``textsearch?q=<word>``: full-text across the
  Portuguese web archive. Results are filtered to URLs containing
  the handle, so ``arquivo jack --keyword plunger`` finds jack's
  archived posts mentioning "plunger".
* CDX search — ``wayback/cdx?url=twitter.com/<handle>/status/*``:
  captures for one handle, like a Wayback CDX query.

**Embargo: Arquivo.pt results are at least 1 year old** and the
archive is PT-weighted — international pages appear only if linked
from Portuguese pages. Every result carries that note, and the CLI
prints it. Never present Arquivo.pt as current.
"""
from __future__ import annotations

import requests
from urllib.parse import quote

from .networks import detect_network
from .parse import fallback_links, timestamp_parser

HEADERS = {"User-Agent": "wayback-social/1.0"}
TIMEOUT = 30
TEXTSEARCH = "https://arquivo.pt/textsearch"
CDX = "https://arquivo.pt/wayback/cdx"

EMBARGO_NOTE = ("Arquivo.pt (≥1 yr old, PT-weighted): results are at "
                "least a year old and the archive is Portuguese-weighted.")

# CDX pattern per network for the no-keyword mode. Only networks whose
# post URLs embed the handle work here — same rule as Wayback CDX.
CDX_PATTERNS = {
    "x": "twitter.com/{id}/status/*",
    "bluesky": "bsky.app/profile/{id}/post/*",
    "mastodon": "{instance}/@{id}/*",
}


def _to_record(item: dict, identifier: str) -> dict | None:
    """One Arquivo.pt result -> a parse.py-shaped record (or None)."""
    import re as _re

    original = (item.get("originalURL") or "").strip()
    tstamp = str(item.get("tstamp") or "")
    if not original or not tstamp:
        return None
    # Arquivo.pt CDX stores doubled slashes (twitter.com//jack//status//20).
    original = _re.sub(r"(?<!:)/{2,}", "/", original)
    net = detect_network(original)
    post_id = net.post_id(original) if net else ""
    today, ghost = fallback_links(original)
    archived = item.get("linkToArchive") or ""
    return {
        "source": "arquivo.pt",
        "network": net.id if net else "arquivo.pt",
        "identifier": identifier,
        "post_id": post_id,
        "archived_urlkey": "",
        "archived_timestamp": tstamp,
        "parsed_archived_timestamp": timestamp_parser(tstamp),
        "archived_post_url": archived,
        "parsed_archived_post_url": archived,
        "original_post_url": original,
        "parsed_post_url": original,
        "available_post_text": None,
        "available_post_title": item.get("title") or None,
        "available_post_author": None,
        "available_post_is_repost": None,
        "archived_mimetype": item.get("mimeType") or "",
        "archived_statuscode": str(item.get("status") or ""),
        "archived_digest": item.get("digest") or "",
        "archived_length": "",
        "resumption_key": "",
        "fallback_archive_today_url": today,
        "fallback_ghostarchive_url": ghost,
    }


def search_keyword(keyword: str, max_items: int = 50) -> list[dict]:
    """Full-text search. Returns raw response_items (may be empty)."""
    r = requests.get(TEXTSEARCH, params={"q": keyword, "maxItems": max_items},
                     headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.json()
    return data.get("response_items", []) if isinstance(data, dict) else []


def search_cdx(url_pattern: str, max_items: int = 50) -> list[dict]:
    """CDX search for a URL pattern. Returns raw rows (dicts).

    Verified live 2026-11-26: Arquivo.pt CDX returns JSONL — one
    JSON object per line ({urlkey, timestamp, url, mime, status,
    digest, length, ...}) — NOT the {"rows": [...]} shape. A single
    JSON object (no newline) is handled too.
    """
    import json as _json

    r = requests.get(CDX, params={"url": url_pattern, "output": "json",
                                  "limit": max_items},
                     headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    rows = []
    for line in r.text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = _json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict) and row.get("url"):
            rows.append(row)
    return rows


def _cdx_row_to_record(row, identifier: str) -> dict | None:
    """Arquivo.pt CDX row -> record. Two shapes, both seen in the wild:

    * dict (real API, verified live 2026-11-26): JSONL objects
      {urlkey, timestamp, url, mime, status, digest, ...}.
    * list (CDX-array shape, e.g. [urlkey, timestamp, original,
      mimetype, statuscode, ...]) — accepted for compatibility.
    """
    if isinstance(row, dict):
        url = (row.get("url") or "").strip()
        tstamp = str(row.get("timestamp") or "")
        if not url or not tstamp:
            return None
        item = {"originalURL": url, "tstamp": tstamp,
                "linkToArchive": f"https://arquivo.pt/wayback/{tstamp}/{url}",
                "mimeType": row.get("mime") or "",
                "status": row.get("status") or "",
                "digest": row.get("digest") or ""}
        return _to_record(item, identifier)
    if isinstance(row, list) and len(row) >= 3:
        item = {"originalURL": row[2], "tstamp": str(row[1]),
                "linkToArchive": (f"https://arquivo.pt/wayback/{row[1]}/{row[2]}"
                                  if row[1] and row[2] else ""),
                "mimeType": row[3] if len(row) > 3 else "",
                "status": row[4] if len(row) > 4 else "",
                "digest": row[5] if len(row) > 5 else ""}
        return _to_record(item, identifier)
    return None


def run_arquivo(identifier: str, keyword: str | None = None,
                network: str = "x", instance: str = "mastodon.social",
                limit: int = 50) -> tuple[list[dict], str]:
    """The `arquivo` command body (minus CLI echo/gating): search and
    return (records, mode). Raises ValueError for a bad network."""
    return arquivo_search(identifier, keyword=keyword, network=network,
                          instance=instance, limit=limit)


def arquivo_search(identifier: str, keyword: str | None = None,
                   network: str = "x", instance: str = "mastodon.social",
                   limit: int = 50) -> tuple[list[dict], str]:
    """Search Arquivo.pt for a handle, optionally filtered by keyword.

    Returns (records, mode) where mode is "keyword" or "cdx".
    Keyword mode searches full text, then keeps only results whose
    URL mentions the handle — the handle filter is honest about what
    it is (URL match, not authorship).
    """
    ident = identifier.lstrip("@")
    if keyword:
        items = search_keyword(keyword, max_items=limit)
        records = []
        for item in items:
            url = (item.get("originalURL") or "").lower()
            if ident.lower() not in url:
                continue
            rec = _to_record(item, ident)
            if rec:
                records.append(rec)
        records.sort(key=lambda r: r["archived_timestamp"])
        return records, "keyword"
    pattern = CDX_PATTERNS.get(network)
    if not pattern:
        raise ValueError(
            f"Arquivo.pt CDX mode has no URL pattern for network "
            f"'{network}' — post URLs there don't embed the handle. "
            f"Use --keyword instead, or network x / bluesky / mastodon.")
    url = pattern.format(id=ident, instance=instance)
    rows = search_cdx(url, max_items=limit)
    records = [r for r in (_cdx_row_to_record(row, ident) for row in rows) if r]
    records.sort(key=lambda r: r["archived_timestamp"])
    return records, "cdx"
