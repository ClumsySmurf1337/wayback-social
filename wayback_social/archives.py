"""Archive sources beyond Wayback CDX — one uniform interface.

Every source answers ``search(source_id, query, limit)`` with a list
of records in the same shape as the CDX parser's (``original_post_url``,
``archived_timestamp``, ``source``), or an honest failure dict — never
a fake zero. Sources are probed live in ``wayback-social sources``.

* ``wayback`` — CDX, the baseline (existing code, reused here).
* ``arquivo`` — Arquivo.pt full-text + CDX. The only archive with
  real full-text search; embargo >= 1 year, PT-weighted. Free, no
  key, 250 req/60 s.
* ``ghostarchive`` — search page scrape, result links + capture
  dates parsed (verified live 2026-11-27: 7 captures of
  jack/status/20, dates 2022-01-14..2024-04-14, links resolve 200).
  Labelled experimental; outbound links are the safe default.
* ``memgator`` — Memento aggregation, but the public aggregator is
  DEAD (timetravel.mementoweb.org, verified 2026-11-26). The code
  calls a self-hosted MemGator at MEMGATOR_URL and reports
  "not configured" until one exists.
* ``commoncrawl`` — async only. The index API 404s/504s on single
  posts; ``wayback-social cc`` writes a job file and reports
  "queued", never blocks the live path.

Also here: the Wayback availability API (closest snapshot) and the
Save Page Now "capture now" availability check (Studio).
"""
from __future__ import annotations

import os
import re
import urllib.parse

import requests

from .cc_jobs import (queue_commoncrawl_job,  # noqa: F401 (re-exported)
                      run_commoncrawl_job)

HEADERS = {"User-Agent": "wayback-social/1.0"}
TIMEOUT = 20

ARQUIVO_TEXTSEARCH = "https://arquivo.pt/textsearch"
ARQUIVO_CDX = "https://arquivo.pt/wayback/cdx"
GHOSTARCHIVE_SEARCH = "https://ghostarchive.org/search"
CC_COLLINFO = "https://index.commoncrawl.org/collinfo.json"
WAYBACK_AVAILABLE = "https://archive.org/wayback/available"

SOURCES = {
    "wayback": {"name": "Wayback Machine (CDX)",
                "cost": "free", "needs": "nothing",
                "note": "Baseline — 14 networks, CDX API."},
    "arquivo": {"name": "Arquivo.pt",
                "cost": "free", "needs": "nothing",
                "note": "Only archive with full-text search. "
                        "Embargo >= 1 year, PT-weighted."},
    "ghostarchive": {"name": "Ghostarchive",
                     "cost": "free", "needs": "nothing",
                     "note": "Search-page scrape, links + capture dates "
                             "parsed (experimental). Outbound links are "
                             "the safe default."},
    "memgator": {"name": "MemGator (self-hosted Memento)",
                 "cost": "free (self-hosted)",
                 "needs": "nothing (defaults to memgator.northforgelabs.dev; "
                          "MEMGATOR_URL to override, =off to disable)",
                 "note": "Public Memento aggregator is dead; our instance "
                         "runs on the VM behind a Cloudflare Tunnel."},
    "commoncrawl": {"name": "Common Crawl (async)",
                    "cost": "free", "needs": "nothing",
                    "note": "Index queries 404/504 on single posts — "
                            "background job only, never in the live path."},
}


def _fail(source: str, note: str) -> dict:
    return {"source": source, "status": "unavailable",
            "records": [], "note": note}


def _arquivo_ts(raw: str) -> str:
    """Arquivo.pt timestamps are YYYYMMDDHHMMSS already; normalise."""
    digits = re.sub(r"\D", "", raw or "")
    return (digits + "00000000000000")[:14] if digits else ""


def search_arquivo(query: str, limit: int = 10, keyword: bool = False) -> dict:
    """Arquivo.pt full-text search — delegates to arquivo.py (v1.4).

    Keyword mode searches the full text of the Portuguese web
    archive; results are mapped into the same parse-shaped records
    as the CDX parser. Embargo >= 1 year, PT-weighted.
    """
    from . import arquivo as arquivo_mod
    query = (query or "").strip()
    try:
        if keyword:
            items = arquivo_mod.search_keyword(query, max_items=limit)
            records = [r for r in (arquivo_mod._to_record(i, query)
                                    for i in items) if r]
            return {"source": "arquivo",
                    "status": "ok" if records else "empty",
                    "records": records,
                    "note": ("Arquivo.pt full-text search (>= 1 year "
                             "embargo, PT-weighted)")}
        return search_arquivo_cdx(query, limit)
    except Exception as e:
        return _fail("arquivo", f"Arquivo.pt did not answer: {e}")


def search_arquivo_cdx(url: str, limit: int = 10) -> dict:
    """Arquivo.pt CDX API for one URL — delegates to arquivo.py.

    Captures Wayback missed (2010 capture of jack/status/20
    verified 2026-11-26).
    """
    from . import arquivo as arquivo_mod
    try:
        rows = arquivo_mod.search_cdx(url, max_items=limit)
    except Exception as e:
        return _fail("arquivo", f"Arquivo.pt CDX did not answer: {e}")
    records = [r for r in (arquivo_mod._cdx_row_to_record(row, url)
                           for row in rows) if r]
    return {"source": "arquivo", "status": "ok" if records else "empty",
            "records": records,
            "note": "Arquivo.pt CDX (2010 capture of jack/status/20 "
                    "verified 2026-11-26)"}


def _ghostarchive_ts(raw: str) -> str:
    """'Sun, 14 Apr 2024 03:32:58 GMT' -> 'YYYYMMDDHHMMSS' (UTC)."""
    from email.utils import parsedate_to_datetime

    try:
        dt = parsedate_to_datetime((raw or "").strip())
    except (TypeError, ValueError):
        return ""
    if dt is None:
        return ""
    return dt.strftime("%Y%m%d%H%M%S")


# One results-table row: <a href="/archive/<id>">URL</a></td><td>DATE GMT
_GHOST_ROW_RE = re.compile(
    r'href="/archive/([A-Za-z0-9]+)">[^<]*</a>\s*</td>\s*<td>\s*'
    r'([A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT)',
    re.IGNORECASE)


def search_ghostarchive(url: str, limit: int = 10) -> dict:
    """Ghostarchive search page, parsed best-effort.

    The page returns 200 and its results table holds one row per
    capture: an /archive/<id> link plus a capture date in the next
    cell (verified live 2026-11-27: 7 captures of jack/status/20,
    2022-01-14 to 2024-04-14, each /archive/<id> link resolving
    200). Dates are parsed into ``archived_timestamp``; a link
    without a parsable date still yields a record with an empty
    timestamp. If no links parse, the result is 'unavailable' with
    the outbound search URL, never a fake "0 snapshots".
    """
    search_url = (f"{GHOSTARCHIVE_SEARCH}?term="
                  f"{urllib.parse.quote(url, safe='')}")
    try:
        r = requests.get(search_url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
    except Exception as e:
        return _fail("ghostarchive", f"Ghostarchive did not answer: {e}")
    dated = {i: _ghostarchive_ts(d) for i, d in
             _GHOST_ROW_RE.findall(r.text)}
    ids: list[str] = []
    for i in re.findall(r'href="/archive/([A-Za-z0-9]+)"', r.text):
        if i not in ids:
            ids.append(i)
    records = [{"original_post_url": url,
                "archived_post_url": f"https://ghostarchive.org/archive/{i}",
                "archived_timestamp": dated.get(i, ""),
                "source": "ghostarchive",
                "status": "found"} for i in ids[:limit]]
    if not records:
        return {"source": "ghostarchive", "status": "unavailable",
                "records": [],
                "note": "search page answered but no /archive/ links "
                        f"parsed — see {search_url}"}
    return {"source": "ghostarchive", "status": "ok", "records": records,
            "note": "experimental parse of the search page — dates from "
                    "the results table; verify each link before citing it"}


def search_memgator(url: str, limit: int = 10) -> dict:
    """Memento TimeMap via a self-hosted MemGator (MEMGATOR_URL).

    The public aggregator timetravel.mementoweb.org is dead (verified
    2026-11-26), so without a local MemGator this returns
    'not-configured' — honestly, instead of calling a dead host.

    Default base is our self-hosted instance at
    https://memgator.northforgelabs.dev (Cloudflare Tunnel to the VM);
    set MEMGATOR_URL to override it (e.g. http://127.0.0.1:1208 for a
    local instance). Set MEMGATOR_URL=off to disable it entirely.
    For the Cloudflare Pages web app the same value is set as a Pages
    env var — see docs/memgator-deploy.md.
    """
    raw = (os.environ.get("MEMGATOR_URL") or "").strip()
    if raw.lower() in ("off", "none", "disabled"):
        return {"source": "memgator", "status": "not-configured",
                "records": [],
                "note": "MemGator disabled (MEMGATOR_URL=off) — set "
                        "MEMGATOR_URL to a self-hosted MemGator URL "
                        "(Go, MIT: github.com/oduwsdl/MemGator); the "
                        "public Memento aggregator is dead"}
    base = (raw or "https://memgator.northforgelabs.dev").rstrip("/")
    try:
        r = requests.get(f"{base}/timemap/json/{url}", headers=HEADERS,
                         timeout=TIMEOUT)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        return _fail("memgator", f"MemGator at {base} did not answer: {e}")
    mementos = data.get("mementos", {}).get("list", [])
    records = []
    for m in mementos[:limit]:
        records.append({
            "original_post_url": m.get("uri", url),
            "archived_post_url": m.get("uri", ""),
            "archived_timestamp": _arquivo_ts(m.get("datetime", "")),
            "source": "memgator", "status": "found"})
    return {"source": "memgator", "status": "ok" if records else "empty",
            "records": records,
            "note": f"TimeMap from {base}"}


def search_wayback(url: str, limit: int = 10) -> dict:
    """Wayback CDX for one URL, via the existing CDX client."""
    from .cdx import EmptyResultError, query_many
    try:
        rows, _resume = query_many([url], limit=limit)
    except EmptyResultError as e:
        return {"source": "wayback", "status": "empty", "records": [],
                "note": str(e)}
    except Exception as e:
        return _fail("wayback", f"CDX did not answer: {e}")
    records = [{"original_post_url": r[2],
                "archived_post_url": f"https://web.archive.org/web/{r[1]}/{r[2]}",
                "archived_timestamp": r[1],
                "source": "wayback",
                "status": str(r[4])} for r in rows if len(r) >= 7]
    return {"source": "wayback", "status": "ok" if records else "empty",
            "records": records, "note": f"{len(records)} CDX capture(s)"}


def wayback_closest(url: str) -> dict:
    """Wayback availability API: closest snapshot to now (free)."""
    try:
        r = requests.get(WAYBACK_AVAILABLE, params={"url": url},
                         headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        snap = r.json().get("archived_snapshots", {}).get("closest", {})
    except Exception as e:
        return {"status": "unavailable", "note": f"availability API: {e}"}
    if not snap:
        return {"status": "empty", "note": "no snapshot found"}
    return {"status": "ok", "url": snap.get("url", ""),
            "timestamp": snap.get("timestamp", ""),
            "available": snap.get("available", False)}


def search_archive(source: str, query: str, limit: int = 10,
                   keyword: bool = False) -> dict:
    """Uniform entry point: source id + query -> result dict."""
    source = (source or "").lower()
    if source == "wayback":
        return search_wayback(query, limit)
    if source == "arquivo":
        return (search_arquivo(query, limit, keyword=True) if keyword
                else search_arquivo_cdx(query, limit))
    if source == "ghostarchive":
        return search_ghostarchive(query, limit)
    if source == "memgator":
        return search_memgator(query, limit)
    if source == "commoncrawl":
        return {"source": "commoncrawl", "status": "async-only",
                "records": [],
                "note": "Common Crawl is async — use `wayback-social cc "
                        "URL` to queue a job; it never runs in the live path"}
    return _fail(source, f"unknown archive source {source!r} — run "
                         "`wayback-social sources` to list them")


def probe_source(source: str) -> dict:
    """Live probe for `wayback-social sources`: one cheap call per
    source, reporting working / down / not-configured honestly."""
    if source == "wayback":
        r = wayback_closest("https://twitter.com/jack/status/20")
        return {"source": source, "status": r["status"],
                "note": r.get("note", "") or f"closest: {r.get('timestamp', '')}"}
    if source == "arquivo":
        r = search_arquivo_cdx("https://twitter.com/jack/status/20", 1)
        return {"source": source, "status": r["status"], "note": r["note"]}
    if source == "ghostarchive":
        r = search_ghostarchive("https://twitter.com/jack/status/20", 1)
        return {"source": source, "status": r["status"], "note": r["note"]}
    if source == "memgator":
        r = search_memgator("https://twitter.com/jack/status/20", 1)
        return {"source": source, "status": r["status"], "note": r["note"]}
    if source == "commoncrawl":
        try:
            r = requests.get(CC_COLLINFO, headers=HEADERS, timeout=TIMEOUT)
            r.raise_for_status()
            crawls = r.json()
            latest = crawls[0].get("id", "?") if crawls else "?"
            return {"source": source, "status": "async-only",
                    "note": f"index list reachable; latest crawl {latest} "
                            "(index queries are async jobs, not live calls)"}
        except Exception as e:
            return {"source": source, "status": "unavailable",
                    "note": f"collinfo did not answer: {e}"}
    return {"source": source, "status": "unknown", "note": "no probe"}
