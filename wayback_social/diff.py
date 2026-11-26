"""Deleted-only diff: which archived posts are gone from the live site.

Top improvement from the competition scope-out (2026-11-26): the
archive alone lists what *was* posted; the diff answers what is
*no longer live* — the thing catfish / legal / journalist users
actually pay for, and the thing no free rival does across networks.

Honest classification — a live check is NOT proof on login-walled
networks, so three verdicts, never two:

* ``live``    — live URL returned HTTP 200 and did not land on a
  login / signup / home page.
* ``deleted`` — HTTP 404 / 410, or (X only) the public oEmbed
  endpoint 404s for that post. That is the strongest signal we get
  without an account.
* ``unknown`` — 401 / 403 / 429 / 5xx, a redirect to login, a
  timeout, or any other error. Unknown is NOT deleted: Instagram,
  Facebook, TikTok and LinkedIn routinely return 403 / login walls
  for logged-out checks, so calling those "deleted" would be lying.

Every record keeps its archived snapshot link, so a ``deleted``
post is still viewable in the Wayback Machine — that is the point
of the evidence pack. ``--only deleted`` exports just those rows.
"""
from __future__ import annotations

import csv
import json
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import requests

HEADERS = {"User-Agent": "wayback-social/1.0"}
TIMEOUT = 10

DIFF_FIELDS = [
    "network", "identifier", "post_id",
    "original_post_url", "archived_post_url",
    "archived_timestamp", "parsed_archived_timestamp",
    "first_archived_timestamp",
    "available_post_text", "available_post_title",
    "live_verdict", "live_http_status", "live_final_url",
    "live_checked_at",
]

_LOGIN_MARKERS = ("/login", "/i/flow", "/accounts/login",
                  "/auth", "/signup", "/signin")


def _is_login_url(url: str) -> bool:
    low = (url or "").lower()
    return any(m in low for m in _LOGIN_MARKERS)


def _oembed_deleted(post_url: str) -> bool | None:
    """X-only tie-breaker: publish.twitter.com oEmbed 404s for deleted
    posts and 200s for live ones. Returns True/False, or None if the
    endpoint itself errored (do not guess from that)."""
    endpoint = ("https://publish.twitter.com/oembed?url="
                + urllib.parse.quote(post_url, safe=""))
    try:
        r = requests.get(endpoint, headers=HEADERS, timeout=TIMEOUT)
    except Exception:
        return None
    if r.status_code == 404:
        return True
    if r.status_code == 200:
        return False
    return None


def classify_live(url: str, network_id: str = "",
                  request=None) -> dict:
    """Check one live URL. ``request`` is an injectable
    ``requests.request``-compatible callable, for offline tests."""
    req = request or requests.request
    checked_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        resp = req("HEAD", url, headers=HEADERS, timeout=TIMEOUT,
                   allow_redirects=True)
        status = resp.status_code
        final = getattr(resp, "url", url) or url
        if status in (405, 403):
            # Some platforms refuse HEAD; one GET (no body read) decides.
            resp = req("GET", url, headers=HEADERS, timeout=TIMEOUT,
                       allow_redirects=True, stream=True)
            status = resp.status_code
            final = getattr(resp, "url", url) or url
    except Exception as exc:  # timeout / DNS / connection — unknown, not deleted
        return {"live_verdict": "unknown", "live_http_status": "",
                "live_final_url": url, "live_checked_at": checked_at,
                "live_error": str(exc)[:120]}
    if status in (404, 410):
        verdict = "deleted"
    elif status == 200 and not _is_login_url(final):
        verdict = "live"
    elif status == 200 and _is_login_url(final):
        verdict = "unknown"
    else:
        verdict = "unknown"
    if verdict == "unknown" and network_id == "x" and (
            status in (401, 403, 429) or _is_login_url(final)):
        # X login-walls / 403s logged-out HEADs; oEmbed is public and
        # decisive there. Do NOT use it for 5xx / other errors: oEmbed
        # 404s on a malformed URL too, which would fake a "deleted".
        # X login-walls logged-out HEADs; oEmbed is public and decisive.
        deleted = _oembed_deleted(url)
        if deleted is True:
            verdict = "deleted"
        elif deleted is False:
            verdict = "live"
    return {"live_verdict": verdict, "live_http_status": status,
            "live_final_url": final, "live_checked_at": checked_at}


def dedupe_latest(records: list[dict],
                  require_post_id: bool = True) -> list[dict]:
    """One row per post (by post_id, else original URL), keeping the
    latest capture; first_archived_timestamp preserves the earliest.

    With ``require_post_id`` (default), rows with no post id are
    skipped: CDX patterns also return profile / listing pages
    (e.g. ``twitter.com/jack/status`` with no id, or a ``:80`` port
    variant), and a 404 on one of those is not a deleted post.
    ``--url`` mode passes False, because the user named that URL."""
    best: dict[str, dict] = {}
    skipped = 0
    for rec in records:
        if require_post_id and not rec.get("post_id"):
            skipped += 1
            continue
        key = rec.get("post_id") or rec.get("original_post_url") or ""
        if not key:
            continue
        cur = best.get(key)
        if cur is None:
            row = dict(rec)
            row["first_archived_timestamp"] = rec["archived_timestamp"]
            best[key] = row
        else:
            cur["first_archived_timestamp"] = min(
                cur["first_archived_timestamp"], rec["archived_timestamp"])
            if rec["archived_timestamp"] > cur["archived_timestamp"]:
                first = cur["first_archived_timestamp"]
                cur.update(rec)
                cur["first_archived_timestamp"] = first
    out = sorted(best.values(),
                 key=lambda r: r["archived_timestamp"], reverse=True)
    return out, skipped


def diff_records(records: list[dict], network_id: str = "",
                 workers: int = 5,
                 require_post_id: bool = True) -> tuple[list[dict], int]:
    """Dedupe to latest capture per post, then classify each live URL
    (in parallel). Returns (rows in DIFF_FIELDS shape, newest first,
    count of non-post rows skipped)."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    rows, skipped = dedupe_latest(records, require_post_id=require_post_id)

    def _one(row):
        info = classify_live(row["original_post_url"], network_id)
        out = {f: row.get(f, "") for f in DIFF_FIELDS}
        out.update(info)
        # Keep only the fields the export knows; drop the error note
        # from the exported row (it is still in the summary count).
        out.pop("live_error", None)
        return out

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(_one, r): r for r in rows}
        done = []
        for fut in as_completed(futs):
            try:
                done.append(fut.result())
            except Exception:
                pass
    done.sort(key=lambda r: r["archived_timestamp"], reverse=True)
    return done, skipped


DIFF_EXPORT_FIELDS = [
    "network", "identifier", "post_id",
    "original_post_url", "archived_post_url",
    "first_archived_timestamp", "last_archived_timestamp",
    "present_in", "status",
]


def load_export(path: str | Path) -> list[dict]:
    """Load an export written by `archive` (JSON list, JSONL, or CSV).

    Returns normalised records with post_id / original_post_url /
    archived_timestamp (at least one of post_id or original URL must
    be present to be counted).
    """
    p = Path(path)
    if p.suffix == ".json":
        data = json.loads(p.read_text(encoding="utf-8"))
        rows = data if isinstance(data, list) else data.get("records", [])
    elif p.suffix == ".jsonl":
        rows = [json.loads(ln) for ln in p.read_text(encoding="utf-8").splitlines()
                if ln.strip()]
    elif p.suffix == ".csv":
        with open(p, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
    else:
        raise ValueError(f"Unsupported export format: {p.suffix} "
                         f"(use .json, .jsonl or .csv)")
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        out.append({k: ("" if v is None else str(v)) for k, v in r.items()})
    return out


def _export_key(rec: dict) -> str:
    return rec.get("post_id") or rec.get("original_post_url") or ""


def diff_exports(old_records: list[dict], new_records: list[dict]) -> dict:
    """Compare two exports: which posts vanished, appeared, or stayed.

    Keys are post_id (falling back to original URL). Returns:
    {removed, added, kept, removed_rows, added_rows, kept_rows} where
    removed_rows carry first/last archived dates from the OLD export.
    A post present in old but missing in new is "removed" — most often
    that means the live post was deleted between the two runs, which
    is exactly what the evidence pack needs.
    """
    def _index(records):
        idx: dict[str, dict] = {}
        for r in records:
            # Skip listing/profile rows with no post id (e.g. bare
            # twitter.com/jack/status or a :80 port variant) — they are
            # not posts, and diffing them just adds noise.
            if not r.get("post_id"):
                continue
            k = _export_key(r)
            if not k:
                continue
            cur = idx.get(k)
            if cur is None:
                idx[k] = {"rec": r,
                          "first": r.get("archived_timestamp", ""),
                          "last": r.get("archived_timestamp", "")}
            else:
                ts = r.get("archived_timestamp", "")
                cur["first"] = min(cur["first"], ts) if cur["first"] else ts
                cur["last"] = max(cur["last"], ts) if cur["last"] else ts
                if ts > cur["rec"].get("archived_timestamp", ""):
                    cur["rec"] = r
        return idx

    old, new = _index(old_records), _index(new_records)
    removed_keys = sorted(set(old) - set(new))
    added_keys = sorted(set(new) - set(old))
    kept_keys = sorted(set(old) & set(new))

    def _row(k, idx, status, present):
        r = idx[k]["rec"]
        return {"network": r.get("network", ""),
                "identifier": r.get("identifier", ""),
                "post_id": r.get("post_id", ""),
                "original_post_url": r.get("original_post_url", ""),
                "archived_post_url": r.get("archived_post_url", ""),
                "first_archived_timestamp": idx[k]["first"],
                "last_archived_timestamp": idx[k]["last"],
                "present_in": present, "status": status}

    return {
        "removed": len(removed_keys), "added": len(added_keys),
        "kept": len(kept_keys),
        "removed_rows": [_row(k, old, "removed", "old only") for k in removed_keys],
        "added_rows": [_row(k, new, "added", "new only") for k in added_keys],
        "kept_rows": [_row(k, old, "kept", "both") for k in kept_keys],
    }


def summarise(rows: list[dict]) -> dict:
    counts = {"live": 0, "deleted": 0, "unknown": 0}
    for r in rows:
        counts[r.get("live_verdict", "unknown")] = \
            counts.get(r.get("live_verdict", "unknown"), 0) + 1
    return {"total_posts": len(rows), **counts,
            "deleted_share": (round(counts["deleted"] / len(rows), 3)
                              if rows else 0)}
