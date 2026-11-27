#!/usr/bin/env python3
"""Run the wayback-social / DeletedProof Playwright E2E suite.

Usage:
    python tests/e2e/run_e2e.py [--base-url URL] [--live] [--headed] [-k EXPR]

    --base-url URL   Base URL to test (default: local server on 127.0.0.1:8901)
    --live           Run against the live deploys (deletedproof.pages.dev and
                     deletedproof.northforgelabs.dev), after a local run
    --headed         Show the browser window (default headless)
    -k EXPR          pytest -k expression, e.g. -k "pricing"

Local runs serve web/ with `python -m http.server`. Live runs need no
server; the runner checks each live URL returns HTTP 200 first and skips
the ones that do not, recording the last observed status.
"""
from __future__ import annotations

import argparse
import functools
import os
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WEB = REPO / "web"
VENV_PY = REPO / ".venv-e2e" / "bin" / "python"
LIVE_URLS = [
    "https://deletedproof.pages.dev",
    "https://deletedproof.northforgelabs.dev",
]


def _http_ok(url: str, timeout: int = 20) -> tuple[bool, str]:
    """GET the URL with a browser UA and report its status.

    Uses curl, not urllib: Cloudflare returns 403 to urllib's default
    User-Agent (and to HEAD requests), while a browser UA + GET gets 200.
    """
    try:
        proc = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code} %{size_download}B",
             "--max-time", str(timeout), "-A",
             "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
             "(KHTML, like Gecko) Chrome/120.0 Safari/537.36", url],
            capture_output=True, text=True, timeout=timeout + 5,
        )
        code = proc.stdout.strip().split()[0]
        return code == "200", f"HTTP {proc.stdout.strip()}"
    except Exception as exc:  # noqa: BLE001 - report, don't crash
        return False, f"{type(exc).__name__}: {exc}"


def _serve() -> tuple[ThreadingHTTPServer, str]:
    """Serve a snapshot copy of web/ on a random free localhost port.

    The snapshot is deliberate: sibling agents edit web/ while this
    suite runs, and a half-written index.html mid-run would fail tests
    that have nothing to do with the product. The port is random
    (bind 0) because a sibling keeps starting/stopping its own server
    on 8902 — a fixed port races with it and fails mid-run with
    ERR_CONNECTION_REFUSED. Returns (server, base_url).
    """
    import shutil
    import tempfile

    snap = Path(tempfile.mkdtemp(prefix="e2e-web-"))
    shutil.copytree(WEB, snap, dirs_exist_ok=True)
    print(f"Serving snapshot of web/ from {snap}", flush=True)
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(snap))
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{port}"


def _run_pytest(base_url: str, extra: list[str]) -> int:
    env = dict(os.environ, E2E_BASE_URL=base_url)
    cmd = [str(VENV_PY), "-m", "pytest", "tests/e2e", "-v",
           "--tb=short", "-p", "no:cacheprovider"] + extra
    print(f"\n=== pytest against {base_url} ===", flush=True)
    return subprocess.run(cmd, cwd=REPO, env=env).returncode


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url")
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("-k", default=None)
    args = ap.parse_args()

    extra = []
    if args.k:
        extra += ["-k", args.k]
    if args.headed:
        extra += ["--headed"]  # honoured by conftest via env below
        os.environ["E2E_HEADED"] = "1"

    results = {}
    if args.live:
        # Local first, then each live URL that answers.
        srv, local_url = _serve()
        results["local"] = _run_pytest(local_url, extra)
        srv.shutdown()
        for url in LIVE_URLS:
            ok, status = _http_ok(url)
            print(f"\nLive check {url}: {status}", flush=True)
            if not ok:
                results[url] = f"SKIPPED — not reachable ({status})"
                continue
            results[url] = _run_pytest(url, extra)
    elif args.base_url:
        results[args.base_url] = _run_pytest(args.base_url, extra)
    else:
        srv, local_url = _serve()
        try:
            results["local"] = _run_pytest(local_url, extra)
        finally:
            srv.shutdown()

    print("\n=== E2E summary ===")
    for where, rc in results.items():
        print(f"  {where}: {rc}")
    time.sleep(0.1)
    return 0 if all(rc in (0, "0") or str(rc).startswith("SKIPPED") for rc in results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
