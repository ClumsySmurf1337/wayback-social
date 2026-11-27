"""Check the web config agrees with the server Functions and the CLI.

The Common Crawl crawl id lives in three places and they must agree —
a new crawl is adopted by changing all three at once:
  web/config.js                  CC_CRAWL
  functions/api/commoncrawl.js   DEFAULT_CRAWL
  wayback_social/cc_jobs.py      DEFAULT_CRAWL
The two proxy keys (GHOSTARCHIVE_PROXY, COMMONCRAWL_PROXY) must exist
in web/config.js — the client modules read them, and a missing key
silently disables that source.

Check-only (nothing is rewritten): `python scripts/sync_config.py`
exits 0 when everything agrees, 1 with the mismatch on stderr.
Stdlib only.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_JS = ROOT / "web" / "config.js"
CC_FUNCTION = ROOT / "functions" / "api" / "commoncrawl.js"
CC_JOBS_PY = ROOT / "wayback_social" / "cc_jobs.py"

CRAWL_RE = re.compile(r'CC-MAIN-\d{4}-\d{2}')


def find_crawl(path: Path, label: str) -> str:
    text = path.read_text(encoding="utf-8")
    m = CRAWL_RE.search(text)
    if not m:
        raise SystemExit(f"{label}: no CC-MAIN-YYYY-MM crawl id in {path}")
    return m.group(0)


def main(argv: list[str]) -> int:
    errors = []
    web_crawl = find_crawl(CONFIG_JS, "web/config.js")
    fn_crawl = find_crawl(CC_FUNCTION, "functions/api/commoncrawl.js")
    cli_crawl = find_crawl(CC_JOBS_PY, "wayback_social/cc_jobs.py")
    for label, value in (("functions/api/commoncrawl.js", fn_crawl),
                         ("wayback_social/cc_jobs.py", cli_crawl)):
        if value != web_crawl:
            errors.append(
                f"Common Crawl crawl id drift: web/config.js says "
                f"{web_crawl}, {label} says {value} — change all three at once.")
    config = CONFIG_JS.read_text(encoding="utf-8")
    for key in ("GHOSTARCHIVE_PROXY", "COMMONCRAWL_PROXY", "CC_CRAWL"):
        if key not in config:
            errors.append(f"web/config.js is missing {key}.")
    if errors:
        for e in errors:
            print(f"sync_config: {e}", file=sys.stderr)
        return 1
    print(f"sync_config: OK — crawl {web_crawl} agrees in all three places; "
          "proxy keys present.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
