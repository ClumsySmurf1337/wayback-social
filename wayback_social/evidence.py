"""Evidence-pack exporter (v1.4) — the Studio feature.

A pack is a ZIP proving a set of archived posts existed, in a form a
researcher, journalist or lawyer can hand on:

* ``report.html`` — human-readable report: handle, network, date
  range, capture table with archived + fallback links, live verdicts.
* ``captures.csv`` / ``captures.json`` / ``captures.jsonl`` — the
  records in every machine-readable shape.
* ``manifest.json`` — SHA-256 for every file in the pack, pack
  metadata, generation timestamp, tool version.
* ``README.txt`` — how to verify the pack (sha256sum, unzip).

Studio is a finite pack (10 reports included), so building a pack is
gated on the plan: ``has_feature(plan, "evidence_pack")`` must be
true, else the caller gets a clear error naming Studio. There is no
server-side report counter in v1 — the entitlement is the tier, and
the manifest records which pack this is only by its generation time.
"""
from __future__ import annotations

import hashlib
import html as html_mod
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from .export import save_csv, save_json, save_jsonl
from .parse import FIELD_OPTIONS
from .plans import has_feature

TOOL_VERSION = "1.5.0"

PACK_FILES = ("report.html", "captures.csv", "captures.json",
              "captures.jsonl", "manifest.json", "manifest.sha256",
              "README.txt")

EVIDENCE_UNLOCK = ("Evidence packs are a Studio feature. "
                   "Buy the Studio pack (10 evidence-pack reports "
                   "included) — or the All-in Bundle — to build one.")


def require_evidence(plan: str) -> None:
    """Raise ValueError unless the plan includes evidence packs."""
    if not has_feature(plan, "evidence_pack"):
        raise ValueError(EVIDENCE_UNLOCK + f" Your plan is {plan}.")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _stamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _date_range(records: list[dict]) -> tuple[str, str]:
    stamps = sorted(r.get("archived_timestamp", "") for r in records
                    if r.get("archived_timestamp"))
    return (stamps[0], stamps[-1]) if stamps else ("", "")


def _report_html(records: list[dict], meta: dict,
                 file_hashes: dict[str, str]) -> str:
    esc = html_mod.escape
    rows = ""
    for r in records:
        cells = []
        for label, key in (("Post", "original_post_url"),
                           ("Archived", "archived_post_url"),
                           ("Archived at", "parsed_archived_timestamp"),
                           ("Text", "available_post_text"),
                           ("Live", "live_verdict"),
                           ("archive.today", "fallback_archive_today_url"),
                           ("Ghostarchive", "fallback_ghostarchive_url")):
            v = esc(str(r.get(key) or ""))
            if key.endswith("_url") and v:
                v = f'<a href="{v}">{v[:70]}</a>'
            cells.append(f"<td>{v}</td>")
        rows += "<tr>" + "".join(cells) + "</tr>\n"
    hashes = "".join(
        f"<li><code>{esc(name)}</code> — <code>{h}</code></li>"
        for name, h in sorted(file_hashes.items()))
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Evidence pack — {esc(meta.get("identifier", ""))} ({esc(meta.get("network", ""))})</title>
<style>body{{font-family:system-ui,sans-serif;margin:2em;max-width:1100px}}
table{{border-collapse:collapse;font-size:13px}}th,td{{border:1px solid #ccc;padding:4px 8px;vertical-align:top}}
th{{background:#eee}}code{{font-size:12px}}</style></head><body>
<h1>Evidence pack — {esc(meta.get("network", ""))} @{esc(meta.get("identifier", ""))}</h1>
<p>{len(records)} archived post(s), {esc(meta.get("date_range", ""))}.
Generated {esc(meta.get("generated_at", ""))} by wayback-social {esc(meta.get("tool_version", ""))}.
Source: Wayback Machine CDX API{esc(meta.get("source_note", ""))}.</p>
<p><strong>What this proves:</strong> that each post below existed and was
archived on the date shown. It does <em>not</em> prove who wrote it, why it
was deleted, or intent. Live verdicts (live / deleted / unknown) are
best-effort: "unknown" means login-walled or errored, never "deleted".</p>
<table><thead><tr><th>Post</th><th>Archived snapshot</th><th>Archived at</th>
<th>Text</th><th>Live</th><th>archive.today</th><th>Ghostarchive</th></tr></thead>
<tbody>{rows}</tbody></table>
<h2>File hashes (SHA-256)</h2><ul>{hashes}</ul>
<p>Verify with <code>sha256sum -c manifest.sha256</code> (manifest.json
holds the same hashes plus pack metadata), or
<code>python3 -c "import zipfile; zipfile.ZipFile('pack.zip').testzip()"</code>.</p>
</body></html>"""


def _readme_txt(meta: dict) -> str:
    return f"""DeletedProof / wayback-social — evidence pack
=============================================
Network: {meta.get("network", "")}
Handle: @{meta.get("identifier", "")}
Date range: {meta.get("date_range", "")}
Generated: {meta.get("generated_at", "")}
Tool: wayback-social {meta.get("tool_version", "")}
Source: Wayback Machine CDX API{meta.get("source_note", "")}

Contents: report.html (read this first), captures.csv, captures.json,
captures.jsonl, manifest.json (hashes + pack metadata),
manifest.sha256 (plain sha256sum checklist).

How to verify:
  1. unzip the pack into a folder.
  2. cd into it and run:  sha256sum -c manifest.sha256
     (manifest.json lists the same hashes plus pack metadata;
     manifest.json and manifest.sha256 cannot hash themselves.)
  3. Or in Python:  python3 -m zipfile -t pack.zip

What this proves: that each listed post existed and was archived on
the date shown. It does NOT prove who wrote it, why it was deleted,
or intent. Live verdicts are best-effort — "unknown" means the live
site was login-walled or errored, never "deleted".
Public archived posts only. No DMs, no private accounts.
"""


def build_pack_from_export(export_file: str | Path, network: str | None = None,
                           identifier: str | None = None,
                           out_path: str | Path | None = None) -> tuple[Path, dict]:
    """Build a pack from an export file (the `evidence` command body).

    Loads the export, resolves the network/handle labels from the
    first record unless overridden, defaults the output name, and
    builds the pack. Raises ValueError when the export is empty.
    Callers gate on the plan first (require_evidence).
    """
    from .diff import load_export

    records = load_export(export_file)
    if not records:
        raise ValueError(f"No records in {export_file}.")
    net = network or records[0].get("network", "")
    ident = identifier or records[0].get("identifier", "")
    if not out_path:
        stamp = datetime.now().strftime("%Y%m%d%H%M%S")
        out_path = Path(f"evidence_{net or 'pack'}_{ident or 'export'}_{stamp}.zip")
    return build_evidence_pack(records, {"network": net, "identifier": ident},
                               out_path)


def build_evidence_pack(records: list[dict], meta: dict,
                        out_path: str | Path) -> tuple[Path, dict]:
    """Build the pack ZIP. Returns (path, manifest dict).

    ``meta`` needs network + identifier; generated_at / tool_version
    / date_range are filled in here. Records are written in the
    FIELD_OPTIONS shape (extra keys are dropped by the exporters).
    """
    meta = dict(meta)
    meta.setdefault("generated_at", _stamp())
    meta.setdefault("tool_version", TOOL_VERSION)
    first, last = _date_range(records)
    meta.setdefault("date_range", f"{first} – {last}" if first else "")
    meta.setdefault("source_note", "")

    # Write the machine-readable captures into memory via temp files,
    # so the CSV/JSON/JSONL bytes are byte-identical to a normal export.
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        save_csv(records, FIELD_OPTIONS, tmp / "captures.csv")
        save_json(records, FIELD_OPTIONS, tmp / "captures.json")
        save_jsonl(records, FIELD_OPTIONS, tmp / "captures.jsonl")
        contents: dict[str, bytes] = {
            name: (tmp / name).read_bytes()
            for name in ("captures.csv", "captures.json", "captures.jsonl")
        }

    contents["README.txt"] = _readme_txt(meta).encode("utf-8")
    # report.html hashes the captures (not itself) — compute first.
    file_hashes = {name: _sha256(data) for name, data in contents.items()
                   if name != "manifest.json"}
    contents["report.html"] = _report_html(records, meta, file_hashes).encode("utf-8")
    file_hashes["report.html"] = _sha256(contents["report.html"])

    manifest = {
        "tool": "wayback-social",
        "tool_version": meta["tool_version"],
        "generated_at": meta["generated_at"],
        "network": meta.get("network", ""),
        "identifier": meta.get("identifier", ""),
        "date_range": meta["date_range"],
        "source": "Wayback Machine CDX API" + meta.get("source_note", ""),
        "counts": {"records": len(records),
                   "deleted": sum(1 for r in records
                                  if r.get("live_verdict") == "deleted"),
                   "live": sum(1 for r in records
                               if r.get("live_verdict") == "live"),
                   "unknown": sum(1 for r in records
                                  if r.get("live_verdict") == "unknown")},
        "files": {name: {"sha256": h} for name, h in sorted(file_hashes.items())},
        "ethics": ("Public archived posts only. Proves a post existed "
                   "on the archived date — not who wrote it, why it was "
                   "deleted, or intent."),
    }
    # The manifest hashes every file except itself (a self-hash is
    # impossible); the entry says so plainly instead of faking one.
    manifest["files"]["manifest.json"] = {"sha256": "self (see README.txt)"}
    manifest["files"]["manifest.sha256"] = {"sha256": "self (see README.txt)"}
    contents["manifest.json"] = json.dumps(manifest, indent=2,
                                           ensure_ascii=False).encode("utf-8")
    # manifest.sha256: the same hashes in plain sha256sum format, so
    # `sha256sum -c manifest.sha256` actually works (manifest.json is
    # JSON, not a checksum file). It covers every file except itself.
    file_hashes["manifest.json"] = _sha256(contents["manifest.json"])
    contents["manifest.sha256"] = "".join(
        f"{h}  {name}\n" for name, h in sorted(file_hashes.items())
    ).encode("utf-8")

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in PACK_FILES:
            zf.writestr(name, contents[name])
    out.write_bytes(buf.getvalue())
    return out, manifest
