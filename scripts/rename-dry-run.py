#!/usr/bin/env python3
"""Rename dry-run (issue #1 prep) — READ-ONLY.

Lists every file and every string a rename of wayback-social to the
ArchiveCheck umbrella name would touch, with counts per file, and
prints the ordered runbook steps. It writes NOTHING: it only reads the
tree and prints to stdout.

Target name: ArchiveCheck (naming-v2 recommendation, NOT formally
locked — John approved the subdomain brands, not the repo/PyPI/Pages
rename). Do NOT run a rename until he locks the name. See
docs/rename-runbook.md for the ordered steps and the open decisions
(licence-key prefix, Python import name, Pages project name).

Usage:
    python3 scripts/rename-dry-run.py [--root .]

Proof of read-only: snapshot checksums before/after and diff them —
    find . -type f -not -path "./.venv/*" -not -path "./.venv-e2e/*" \
        -not -path "./*/__pycache__/*" -exec sha256sum {} + | sort > /tmp/before.txt
    python3 scripts/rename-dry-run.py > /tmp/dryrun.txt
    python3 scripts/rename-dry-run.py > /tmp/dryrun2.txt
    find . ... | sort > /tmp/after.txt
    diff /tmp/before.txt /tmp/after.txt   # must be empty
    diff /tmp/dryrun.txt /tmp/dryrun2.txt  # must be empty (deterministic)
"""
import argparse
import os
import re
import sys

# (label, pattern, what it is, where the decision lives)
PATTERNS = [
    ("repo/CLI name 'wayback-social'",
     re.compile(r"wayback-social"),
     "GitHub repo, PyPI name, CLI script name, docs, guide URL slugs"),
    ("Python package 'wayback_social'",
     re.compile(r"wayback_social"),
     "package dir, imports, pyproject entry point, docs"),
    ("Pages project 'deletedproof'",
     re.compile(r"deletedproof"),
     "wrangler.toml, Pages project, *.pages.dev host, sitemap/robots"),
    ("GitHub owner/repo 'ClumsySmurf1337/wayback-social'",
     re.compile(r"ClumsySmurf1337/wayback-social"),
     "README, docs, wrangler.toml comment, CI"),
    ("JS globals 'WAYBACK_SOCIAL_CONFIG' / 'WAYBACK_LICENCE'",
     re.compile(r"WAYBACK_(SOCIAL_CONFIG|LICENCE)"),
     "web/config.js, web/licence.js, every page script that reads them"),
    ("env var 'WAYBACK_SOCIAL_LICENCE_SECRET'",
     re.compile(r"WAYBACK_SOCIAL_LICENCE_SECRET"),
     "licence make (CLI), docs, Pages secrets list"),
    ("licence prefixes 'DP1' / 'DP2'",
     re.compile(r"\bDP[12]\b"),
     "licence keys (DP = DeletedProof). OPEN DECISION: rename to AC1/AC2 "
     "or keep DP? Existing keys (incl. John's admin key) must keep "
     "verifying — see docs/rename-runbook.md §3."),
    ("D1 database 'wayback-social-licences'",
     re.compile(r"wayback-social-licences"),
     "wrangler.toml D1 binding, docs, migration commands"),
    ("brand 'DeletedProof' (app. subdomain brand — KEEPS its name)",
     re.compile(r"DeletedProof"),
     "Stays as the app. brand after the rename; only the Pages PROJECT "
     "name / repo / package change. Listed so the rename doesn't "
     "blindly sed it away."),
    ("canonical host 'deletedproof.northforgelabs.dev' (option b, 2026-11-27)",
     re.compile(r"archivecheck\.com"),
     "brands.json canonicals + index/dashboard static values. These "
     "already point at the target — the rename makes them TRUE instead "
     "of aspirational. The rename is gated on the 4 open decisions "
     "below, NOT on the canonical decision (option (b) applied "
     "2026-11-27; option (a) is deferred)."),
]

SKIP_DIRS = {".venv", ".venv-e2e", "__pycache__", "node_modules", ".git",
             ".pytest_cache"}
SKIP_FILES = {"rename-dry-run.py"}  # this script mentions its own patterns
# Binaries must never be read as text (a byte match in a compiled
# binary is not a rename hit): the MemGator + cloudflared binaries.
# Runtime logs/pids are not source either — the rename must not sweep
# them in (they are also never committed).
SKIP_PATHS = {"./ops/memgator/memgator", "./ops/memgator/cloudflared"}
SKIP_SUFFIXES = (".log", ".pid")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    os.chdir(root)

    files = []
    for dirpath, dirnames, filenames in os.walk("."):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for fn in sorted(filenames):
            if fn in SKIP_FILES or fn.endswith(SKIP_SUFFIXES):
                continue
            path = os.path.join(dirpath, fn)
            if path in SKIP_PATHS:
                continue
            files.append(path)

    totals = {label: 0 for label, _, _ in PATTERNS}
    per_file = {}
    for path in files:
        try:
            with open(path, encoding="utf-8", errors="ignore") as f:
                text = f.read()
        except (OSError, UnicodeDecodeError):
            continue
        hits = {}
        for label, pat, _ in PATTERNS:
            n = len(pat.findall(text))
            if n:
                hits[label] = n
                totals[label] += n
        if hits:
            per_file[path] = hits

    print("wayback-social -> ArchiveCheck rename dry-run (READ-ONLY)")
    print(f"root: {root}")
    print(f"files scanned: {len(files)}   files with hits: {len(per_file)}")
    print()
    print("== Totals per string ==")
    for label, pat, note in PATTERNS:
        print(f"  {totals[label]:5d}  {label}")
        print(f"         {note}")
    print()
    print("== Per-file hits (path: label=count, ...) ==")
    for path in sorted(per_file):
        parts = ", ".join(f"{k}={v}" for k, v in per_file[path].items())
        print(f"  {path}: {parts}")
    print()
    print("== Out of scope for the rename (do NOT touch) ==")
    print("  - web/brands.json brand names: DeletedProof, HandleHistory,")
    print("    PostTrace, PastProof stay as the per-subdomain brands.")
    print("  - docs/naming-v2.md, docs/subdomain-branding.md history: the")
    print("    old names are the record of how the brands were chosen.")
    print("  - ops/memgator/ binaries, tunnel-token, *.log, *.pid: never")
    print("    committed; the rename must not sweep them in either.")
    print()
    print("== Runbook ==")
    print("  See docs/rename-runbook.md for the ordered steps.")
    print("  Open decisions (do not rename until John answers them):")
    print("    1. Licence prefix: keep DP1/DP2 or move to AC1/AC2?")
    print("    2. Python import name: keep `wayback_social` or rename")
    print("       the package dir to `archivecheck`?")
    print("    3. Pages project: rename deletedproof -> archivecheck,")
    print("       or keep the project name and only change the repo?")
    print("    4. Guide URL slugs — CLOSED 2026-11-27: already")
    print("       `archivecheck-vs-*` (renamed by the guides track).")
    print("    5. GitHub org: new org `archivecheck`, or rename the repo")
    print("       in place under ClumsySmurf1337?")
    return 0


if __name__ == "__main__":
    sys.exit(main())
