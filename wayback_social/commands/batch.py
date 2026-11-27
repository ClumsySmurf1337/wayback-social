"""``batch`` command — archive many accounts from a file.

Split out of cli.py (issue #12) — no behaviour change.
"""
from __future__ import annotations

from pathlib import Path

import click
from rich import print as rprint

from ..cdx import EmptyResultError, query_many
from ..cmdutil import (LICENCE_OPTION, PLAN_OPTION,
                       resolve_formats_or_usage as _formats,
                       resolve_plan_or_usage as _resolve)
from ..export import export_all
from ..networks import get_network
from ..parse import FIELD_OPTIONS, PostsParser
from ..plans import cap_batch_targets, cap_limit, fetch_text_cap, plan_note


@click.command("batch")
@click.argument("file", type=click.Path(exists=True, path_type=Path))
@click.option("--out-dir", type=click.Path(path_type=Path), default=Path("."))
@click.option("-l", "--limit", type=int, default=100,
              help="Max CDX results per URL pattern, per target (default 100).")
@click.option("--fetch-text/--no-fetch-text", default=False,
              help="Try to recover post text (slower; default off for batch).")
@click.option("--format", "formats", multiple=True,
              type=click.Choice(["csv", "json", "jsonl", "html", "all"]),
              default=["all"], help="Output format(s) per target.")
@click.option("-v", "--verbose", is_flag=True, default=False)
@PLAN_OPTION
@LICENCE_OPTION
def batch_cmd(file, out_dir, limit, fetch_text, formats, verbose, plan,
              licence_key):
    """Archive many accounts at once, one per line in FILE.

    Line format: ``NETWORK IDENTIFIER [INSTANCE]`` — e.g.::

        x jack
        instagram nasa
        mastodon gargron mastodon.social
        reddit r/technology

    Blank lines and lines starting with ``#`` are ignored. Writes one
    export set per target plus ``batch_summary.json`` in --out-dir.
    This is the Pro-pack workflow: one file, a whole watchlist.
    """
    import json

    plan, licence_note = _resolve(plan, licence_key)
    if licence_note:
        click.echo(licence_note)
    targets = []
    for raw in file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            rprint(f"[yellow]Skipping bad line: {raw!r} (need NETWORK IDENTIFIER)[/yellow]")
            continue
        net = get_network(parts[0])
        if not net:
            rprint(f"[yellow]Skipping unknown network: {parts[0]!r}[/yellow]")
            continue
        targets.append((net, parts[1].lstrip("@"),
                        parts[2] if len(parts) > 2 else "mastodon.social"))
    if not targets:
        raise click.UsageError("No valid targets in file.")

    click.echo(plan_note(plan))
    kept_t, t_clamped = cap_batch_targets(plan, len(targets))
    if t_clamped:
        click.echo(f"Note: batch capped to the first {kept_t} target(s) "
                   f"on the {plan} plan ({len(targets)} in file).")
        targets = targets[:kept_t]
    limit, lim_clamped = cap_limit(plan, limit)
    if lim_clamped:
        click.echo(f"Note: --limit capped to {limit} per target on the {plan} plan.")

    fmts = _formats(plan, formats)
    summary = []
    for net, ident, instance in targets:
        click.echo(f"\n== {net.id} @{ident} ==")
        if net.id == "reddit" and ident.startswith("r/"):
            patterns = [f"https://www.reddit.com/{ident}/*"]
        else:
            patterns = net.cdx_urls(ident, instance)
        try:
            rows, resume = query_many(patterns, limit=limit, verbose=verbose)
        except EmptyResultError as e:
            click.echo(f"  no captures: {e}")
            summary.append({"network": net.id, "identifier": ident,
                            "captures": 0, "error": str(e)})
            continue
        records = PostsParser(rows, net, ident, FIELD_OPTIONS,
                              resumption_key=resume).parse(
                                  fetch_text=fetch_text,
                                  fetch_cap=fetch_text_cap(plan))
        saved = export_all(records, net.id, ident, out_dir, fmts)
        for p in saved:
            click.echo(f"  Saved to {p}")
        summary.append({"network": net.id, "identifier": ident,
                        "captures": len(records),
                        "with_text": sum(1 for r in records if r.get("available_post_text")),
                        "files": [str(p) for p in saved]})
    out_dir.mkdir(parents=True, exist_ok=True)
    summary_path = out_dir / "batch_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    total = sum(s.get("captures", 0) for s in summary)
    click.echo(f"\nBatch done: {len(summary)} target(s), {total} capture(s). "
               f"Summary: {summary_path}")

