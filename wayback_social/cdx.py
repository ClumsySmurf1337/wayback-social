"""Wayback Machine CDX Server API client.

Mirrors waybacktweets' request layer, generalised: the caller supplies
any CDX ``url`` pattern, not just twitter.com/<user>/status/*.
Docs: https://archive.org/developers/wayback-cdx-server.html
"""
from __future__ import annotations

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

CDX_URL = "https://web.archive.org/cdx/search/cdx"
HEADERS = {"User-Agent": "wayback-social/1.0 (+https://github.com/claromes/waybacktweets-inspired)"}


class CdxError(Exception):
    pass


class EmptyResultError(CdxError):
    pass


def _session() -> requests.Session:
    s = requests.Session()
    s.mount("http://", HTTPAdapter(max_retries=Retry(connect=3, backoff_factor=0.5)))
    s.mount("https://", HTTPAdapter(max_retries=Retry(connect=3, backoff_factor=0.5)))
    return s


def query_cdx(url_pattern: str, *, collapse=None, from_ts=None, to_ts=None,
              limit=None, resumption_key=None, matchtype=None,
              timeout: int = 60, verbose: bool = False):
    """One CDX query. Returns (rows, show_resume_key).

    Rows are the raw JSON arrays: [urlkey, timestamp, original, mimetype,
    statuscode, digest, length] — first row is the header. Raises
    EmptyResultError when the archive has nothing for this pattern.
    """
    params = {"url": url_pattern, "output": "json",
              "showResumeKey": bool(limit)}
    if collapse:
        params["collapse"] = collapse
    if from_ts:
        params["from"] = from_ts
    if to_ts:
        params["to"] = to_ts
    if limit:
        params["limit"] = limit
    if resumption_key:
        params["resumption_key"] = resumption_key
    if matchtype:
        params["matchType"] = matchtype
    if verbose:
        print(f"  CDX: {url_pattern}  params={ {k: v for k, v in params.items() if k != 'url'} }")
    try:
        resp = _session().get(CDX_URL, params=params, headers=HEADERS, timeout=timeout)
        resp.raise_for_status()
    except requests.exceptions.ReadTimeout as e:
        raise CdxError(f"CDX timed out after {timeout}s for {url_pattern} — "
                       "archive.org is slow; retry with a smaller --limit.") from e
    except requests.exceptions.RequestException as e:
        raise CdxError(f"CDX request failed for {url_pattern}: {e}") from e
    try:
        data = resp.json()
    except ValueError as e:
        raise CdxError(f"CDX returned non-JSON for {url_pattern}") from e
    if not data or data == []:
        raise EmptyResultError(f"No captures found for {url_pattern}")
    return data, bool(limit)


def query_many(patterns: list[str], **kwargs):
    """Query several CDX patterns, merge rows, de-duplicate by
    (timestamp, original URL). Returns (merged_rows_with_header, resume_key).

    A failed/empty pattern is skipped (with a note in verbose mode)
    instead of aborting the whole run — e.g. x.com may have captures
    where twitter.com has none, and vice versa.
    """
    verbose = kwargs.get("verbose", False)
    header = None
    seen: set[tuple[str, str]] = set()
    rows: list[list] = []
    resume_key = None
    for pat in patterns:
        try:
            data, _show = query_cdx(pat, **kwargs)
        except EmptyResultError as e:
            if verbose:
                print(f"  (empty) {e}")
            continue
        except CdxError as e:
            if verbose:
                print(f"  (error, skipped) {e}")
            continue
        if header is None:
            header = data[0]
        for row in data[1:]:
            # Last row may be the resumption key, not a capture.
            if len(row) == 1:
                resume_key = str(row[0]).strip()
                continue
            # CDX occasionally returns short / malformed rows; a real
            # capture is [urlkey, timestamp, original, mimetype,
            # statuscode, digest, length]. Skip anything shorter.
            if len(row) < 7:
                if verbose:
                    print(f"  (skipped malformed CDX row: {row!r})")
                continue
            key = (row[1], row[2])
            if key not in seen:
                seen.add(key)
                rows.append(row)
    if header is None:
        raise EmptyResultError("No captures found for any pattern: "
                               + ", ".join(patterns))
    rows.sort(key=lambda r: r[1])  # chronological by timestamp
    return [header] + rows, resume_key
