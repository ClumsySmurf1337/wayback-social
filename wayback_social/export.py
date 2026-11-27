"""Export parsed records to CSV / JSON / JSONL / HTML.

Stdlib only (csv/json/html) — waybacktweets used pandas; dropping it
keeps install to click+requests+rich and the output identical in
shape. HTML is a simple readable table with links to the archived
snapshot and the original post (no iframe embed — iframes break for
login-walled networks).
"""
from __future__ import annotations

import csv
import html as html_mod
import json
from datetime import datetime
from pathlib import Path

from .parse import FIELD_OPTIONS
from .plans import PLAN_EXPORTS, PLAN_IDS

# Minimum tier that unlocks each export format (pricing.yaml is the
# source of truth; PLAN_EXPORTS is generated from it). Enforced here,
# not just printed on the pricing page: Free = CSV only, Starter =
# CSV + JSON, Pro/Studio = all formats. "all" is never an error — it
# means "every format my plan allows" and notes what was skipped.
_FORMAT_MIN_TIER = {"csv": "free", "json": "starter",
                    "jsonl": "pro", "html": "pro"}
_TIER_ORDER = {t: i for i, t in enumerate(PLAN_IDS)}


class FormatNotAllowedError(ValueError):
    """A requested export format needs a higher tier."""


def allowed_formats(plan: str) -> list[str]:
    return list(PLAN_EXPORTS[plan])


def resolve_export_formats(plan: str, requested: list[str]) -> tuple[list[str], list[str]]:
    """Resolve --format into the formats to write.

    ``requested`` is the raw --format list (may contain "all").
    Returns (formats_to_write, skipped_formats). An explicitly
    requested format above the plan raises FormatNotAllowedError
    naming the tier that unlocks it — exit code 2 at the CLI, with
    CSV still offered. "all" just clamps to what the plan allows.
    """
    allowed = allowed_formats(plan)
    if "all" in requested:
        skipped = [f for f in ("csv", "json", "jsonl", "html")
                   if f not in allowed]
        return allowed, skipped
    denied = [f for f in requested if f not in allowed]
    if denied:
        need = sorted({_FORMAT_MIN_TIER[f] for f in denied},
                      key=lambda t: _TIER_ORDER[t])
        raise FormatNotAllowedError(
            f"Format(s) {', '.join(denied)} need the {need[0].title()} "
            f"plan or higher (your plan: {plan}). CSV is included in "
            f"every plan — use --format csv, or upgrade with "
            f"--plan {need[0]} / a licence key.")
    return list(requested), []


def _stamp() -> str:
    return datetime.now().strftime("%Y%m%d%H%M%S")


def _base_filename(network_id: str, identifier: str) -> str:
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in identifier)
    return f"{network_id}_{safe}_{_stamp()}"


def _rows(records, fields):
    return [[r.get(f, "") for f in fields] for r in records]


def save_csv(records, fields, path: Path):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(fields)
        w.writerows(_rows(records, fields))
    return path


def save_json(records, fields, path: Path):
    data = [{f: r.get(f, "") for f in fields} for r in records]
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def save_jsonl(records, fields, path: Path):
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps({k: r.get(k, "") for k in fields},
                               ensure_ascii=False) + "\n")
    return path


def save_html(records, fields, path: Path, network_id: str, identifier: str):
    rows = ""
    for r in records:
        cells = []
        for f in fields:
            v = r.get(f, "") or ""
            v = html_mod.escape(str(v))
            if f in ("archived_post_url", "original_post_url") and v:
                v = f'<a href="{v}">{v[:80]}</a>'
            cells.append(f"<td>{v}</td>")
        rows += "<tr>" + "".join(cells) + "</tr>\n"
    head = "".join(f"<th>{html_mod.escape(f)}</th>" for f in fields)
    doc = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>wayback-social — {html_mod.escape(network_id)} @{html_mod.escape(identifier)}</title>
<style>body{{font-family:system-ui,sans-serif;margin:2em}}table{{border-collapse:collapse;font-size:13px}}th,td{{border:1px solid #ccc;padding:4px 8px;vertical-align:top}}th{{background:#eee;position:sticky;top:0}}</style>
</head><body><h1>{html_mod.escape(network_id)} — @{html_mod.escape(identifier)}</h1>
<p>{len(records)} archived post(s) from the Wayback Machine CDX API.</p>
<table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></body></html>"""
    path.write_text(doc, encoding="utf-8")
    return path


def export_all(records, network_id, identifier, out_dir: Path,
               formats: list[str], fields=None) -> list[Path]:
    fields = fields or FIELD_OPTIONS
    out_dir.mkdir(parents=True, exist_ok=True)
    base = _base_filename(network_id, identifier)
    writers = {"csv": save_csv, "json": save_json, "jsonl": save_jsonl,
               "html": save_html}
    saved: list[Path] = []
    for fmt in formats:
        fn = writers[fmt]
        path = out_dir / f"{base}.{fmt}"
        if fmt == "html":
            fn(records, fields, path, network_id, identifier)
        else:
            fn(records, fields, path)
        saved.append(path)
    return saved
