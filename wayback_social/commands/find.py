"""``find`` command — broad search: one handle, every network.

Split out of cli.py (issue #12) — no behaviour change.
"""
from __future__ import annotations

from pathlib import Path

import click

from ..cdx import EmptyResultError, query_many
from ..cmdutil import (LICENCE_OPTION, PLAN_OPTION,
                       resolve_formats_or_usage as _formats,
                       resolve_plan_or_usage as _resolve)
from ..export import export_all
from ..networks import get_network, list_networks
from ..parse import FIELD_OPTIONS, PostsParser
from ..plans import (cap_find_networks, cap_limit, fetch_text_cap,
                     plan_note)
from ..presets import get_preset
from .common import _parse_date


@click.command("find")
@click.argument("identifier")
@click.option("--preset", "preset_name", default=None,
              help="Market preset: catfish, relationship, brand, hiring, legal, journalist, researcher.")
@click.option("--networks", default=None,
              help="Comma-separated networks to search, e.g. x,instagram,tiktok. Default: all 14 (or the preset's).")
@click.option("--keyword", default=None,
              help="Only keep captures whose recovered text/title/URL contains this (needs --fetch-text).")
@click.option("-l", "--limit", type=int, default=20, help="Max captures per network.")
@click.option("-f", "--from", "from_ts", callback=_parse_date, default=None, metavar="DATE")
@click.option("-t", "--to", "to_ts", callback=_parse_date, default=None, metavar="DATE")
@click.option("--fetch-text/--no-fetch-text", default=False,
              help="Recover post text (slower; needed for --keyword).")
@click.option("--format", "formats", multiple=True,
              type=click.Choice(["csv", "json", "jsonl", "html", "all"]),
              default=["all"], help="Output format(s).")
@click.option("--out-dir", type=click.Path(path_type=Path), default=Path("."))
@click.option("-v", "--verbose", is_flag=True, default=False)
@PLAN_OPTION
@LICENCE_OPTION
def find_cmd(identifier, preset_name, networks, keyword, limit, from_ts,
             to_ts, fetch_text, formats, out_dir, verbose, plan, licence_key):
    """Broad search: one handle, every network at once.

    ``wayback-social find jack`` checks the same handle on all 14
    networks and reports where it exists, oldest capture first.
    ``--preset catfish`` narrows to the networks + checklist for that
    use, and prints its ethics note. ``--keyword`` filters on recovered
    text (use with --fetch-text).
    """
    import json

    plan, licence_note = _resolve(plan, licence_key)
    if licence_note:
        click.echo(licence_note)
    ident = identifier.lstrip("@")
    preset = get_preset(preset_name) if preset_name else None
    if preset_name and not preset:
        raise click.UsageError(
            f"Unknown preset '{preset_name}'. Run `wayback-social presets` to list them.")
    click.echo(plan_note(plan))
    if networks:
        nets = [get_network(n) for n in networks.split(",")]
        if any(n is None for n in nets):
            raise click.UsageError("Unknown network in --networks list.")
    elif preset:
        nets = [get_network(n) for n in preset.networks]
    else:
        nets = list_networks()
    kept_n, net_clamped = cap_find_networks(plan, len(nets))
    if net_clamped:
        click.echo(f"Note: find capped to {kept_n} networks on the {plan} plan "
                   f"({len(nets)} requested).")
        nets = nets[:kept_n]
    limit, lim_clamped = cap_limit(plan, limit)
    if lim_clamped:
        click.echo(f"Note: --limit capped to {limit} per network on the {plan} plan.")
    if keyword and not fetch_text:
        click.echo("Note: --keyword needs --fetch-text to see post text; enabling it.")
        fetch_text = True

    if preset:
        click.echo(f"Preset: {preset.name} — {preset.audience}")
        click.echo(f"Goal: {preset.goal}")
        if preset.ethics:
            click.echo(f"Limits: {preset.ethics}")
        click.echo("Checklist:")
        for item in preset.checklist:
            click.echo(f"  - {item}")

    fmts = _formats(plan, formats)
    found = []
    for net in nets:
        patterns = net.cdx_urls(ident, "mastodon.social")
        try:
            rows, resume = query_many(patterns, limit=limit, from_ts=from_ts,
                                      to_ts=to_ts, verbose=verbose)
        except EmptyResultError:
            if verbose:
                click.echo(f"  {net.id}: no captures")
            found.append({"network": net.id, "identifier": ident, "captures": 0})
            continue
        records = PostsParser(rows, net, ident, FIELD_OPTIONS,
                              resumption_key=resume).parse(
                                  fetch_text=fetch_text,
                                  fetch_cap=fetch_text_cap(plan))
        if keyword:
            kw = keyword.lower()
            records = [r for r in records
                       if kw in " ".join(str(r.get(f) or "") for f in
                                         ("available_post_text", "available_post_title",
                                          "original_post_url")).lower()]
    # fetch_text cap applies to find too (parse call above uses it).
        click.echo(f"  {net.id}: {len(records)} capture(s)"
                   + (f" matching {keyword!r}" if keyword else ""))
        if records:
            saved = export_all(records, net.id, ident, out_dir, fmts)
            for p in saved:
                click.echo(f"    Saved to {p}")
        found.append({"network": net.id, "identifier": ident,
                      "captures": len(records),
                      "oldest": records[0]["archived_timestamp"] if records else None,
                      "newest": records[-1]["archived_timestamp"] if records else None})
    present = [f for f in found if f["captures"]]
    click.echo(f"\nHandle @{ident} found on {len(present)}/{len(nets)} networks: "
               + (", ".join(f["network"] for f in present) or "none"))
    out_dir.mkdir(parents=True, exist_ok=True)
    summary_path = out_dir / f"find_{ident}.json"
    summary_path.write_text(json.dumps(found, indent=2), encoding="utf-8")
    click.echo(f"Summary: {summary_path}")

