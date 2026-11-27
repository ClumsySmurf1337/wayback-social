"""Common Crawl async jobs — the index is too slow/flaky for live use.

``wayback-social cc URL`` writes a job file and reports "queued";
``wayback-social cc --check JOB`` runs one index query later. The
index 404s/504s on single posts (verified 2026-11-26), so a job
that finds nothing says "empty", never a fake result.
"""
from __future__ import annotations

import json
import re
import urllib.parse
from datetime import datetime
from pathlib import Path

import requests

HEADERS = {"User-Agent": "wayback-social/1.0"}
DEFAULT_CRAWL = "CC-MAIN-2026-47"


def queue_commoncrawl_job(url: str, out_dir: Path,
                          crawl: str | None = None) -> dict:
    """Queue a Common Crawl lookup as a background job file.

    Writes a job JSON (url, crawl, queued_at, status) and returns
    the job dict (with its path). Never blocks a search.
    """
    crawl = crawl or DEFAULT_CRAWL
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    safe = re.sub(r"[^A-Za-z0-9]+", "_", url).strip("_")[:60]
    path = out_dir / f"cc_job_{safe}_{stamp}.json"
    job = {"url": url, "crawl": crawl, "status": "queued",
           "queued_at": datetime.now().isoformat(timespec="seconds"),
           "index_url": (f"https://index.commoncrawl.org/{crawl}-index"
                         f"?url={urllib.parse.quote(url, safe='')}"
                         "&output=json"),
           "result": None,
           "note": "Common Crawl index queries are slow/flaky — run "
                   "`wayback-social cc --check <job file>` to fetch it"}
    path.write_text(json.dumps(job, indent=2), encoding="utf-8")
    job["path"] = str(path)
    return job


def run_commoncrawl_job(job_path: str | Path) -> dict:
    """Fetch a queued Common Crawl job (one index query, slow)."""
    p = Path(job_path)
    job = json.loads(p.read_text(encoding="utf-8"))
    try:
        r = requests.get(job["index_url"], headers=HEADERS, timeout=60)
    except Exception as e:
        job["status"] = "error"
        job["result"] = {"note": f"index did not answer: {e}"}
        p.write_text(json.dumps(job, indent=2), encoding="utf-8")
        return job
    if r.status_code == 404:
        job["status"] = "empty"
        job["result"] = {"note": "index: no captures found for this URL"}
    elif r.status_code != 200:
        job["status"] = "error"
        job["result"] = {"note": f"index HTTP {r.status_code}"}
    else:
        rows = []
        for line in r.text.splitlines():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        job["status"] = "done" if rows else "empty"
        job["result"] = {"captures": len(rows), "rows": rows[:20]}
    p.write_text(json.dumps(job, indent=2), encoding="utf-8")
    return job
