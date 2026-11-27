"""New commands, kept out of cli.py (v1.4): ``evidence`` and ``arquivo``.

They are plain click commands, registered on the main group by cli.py
via ``main.add_command(...)``. All shared wiring (plan/licence
options, format gating) lives in cmdutil — nothing here imports cli.
"""
from __future__ import annotations

from pathlib import Path

import click
from rich import print as rprint

from . import arquivo as arquivo_mod
from .cmdutil import (LICENCE_OPTION, PLAN_OPTION, resolve_formats_or_usage,
                      resolve_plan_or_usage)
from .evidence import build_pack_from_export, require_evidence
from .export import export_all
from .plans import has_feature, plan_note


@click.command("evidence")
@click.argument("export_file", type=click.Path(exists=True, path_type=Path))
@click.option("--out", "out_path", type=click.Path(path_type=Path),
              default=None, metavar="PACK.ZIP",
              help="Output ZIP path (default: evidence_<network>_<id>.zip).")
@click.option("--network", default=None, help="Override the pack's network label.")
@click.option("--identifier", default=None, help="Override the pack's handle label.")
@PLAN_OPTION
@LICENCE_OPTION
def evidence_cmd(export_file, out_path, network, identifier, plan, licence_key):
    """Build an evidence-pack ZIP from an export file (Studio feature).

    ``wayback-social evidence x_jack_20261126.json`` reads any export
    written by archive / find / diff and packs it as report.html +
    captures.csv/.json/.jsonl + manifest.json (SHA-256 of every file)
    + README.txt. Studio only — 10 reports are included in the pack;
    free / starter / pro get a clear error naming Studio.
    """
    plan, licence_note = resolve_plan_or_usage(plan, licence_key)
    if licence_note:
        click.echo(licence_note)
    try:
        require_evidence(plan)
        pack, manifest = build_pack_from_export(export_file, network,
                                               identifier, out_path)
    except ValueError as e:
        raise click.UsageError(str(e))
    click.echo(f"Evidence pack: {pack}")
    click.echo(f"  {manifest['counts']['records']} record(s), "
               f"{manifest['counts']['deleted']} deleted, "
               f"{manifest['counts']['live']} live, "
               f"{manifest['counts']['unknown']} unknown.")
    click.echo("  Verify: unzip, then sha256sum -c manifest.sha256 "
               "(see README.txt in the pack).")


@click.command("arquivo")
@click.argument("identifier")
@click.option("--keyword", default=None,
              help="Full-text search term. Without it, Arquivo.pt CDX "
                   "lists captures for the handle instead.")
@click.option("--network", default="x",
              help="Network for CDX mode (x, bluesky, mastodon). Default: x.")
@click.option("--instance", default="mastodon.social",
              help="Mastodon instance for CDX mode.")
@click.option("-l", "--limit", type=int, default=50,
              help="Max results (default 50).")
@click.option("--format", "formats", multiple=True,
              type=click.Choice(["csv", "json", "jsonl", "html", "all"]),
              default=["all"], help="Output format(s).")
@click.option("--out-dir", type=click.Path(path_type=Path), default=Path("."))
@PLAN_OPTION
@LICENCE_OPTION
def arquivo_cmd(identifier, keyword, network, instance, limit, formats,
                out_dir, plan, licence_key):
    """Search Arquivo.pt — the only archive with full-text search.

    ``wayback-social arquivo jack --keyword plunger`` finds jack's
    archived posts mentioning "plunger" (full-text, then URL-filtered
    to the handle). Without --keyword it lists CDX captures for the
    handle (x / bluesky / mastodon only — their post URLs embed it).

    Arquivo.pt results are at least 1 year old (embargo) and the
    archive is Portuguese-weighted — the CLI prints that every time.
    Keyword search is a Pro feature (it is keyword search over
    fetched text in the feature chart).
    """
    plan, licence_note = resolve_plan_or_usage(plan, licence_key)
    if licence_note:
        click.echo(licence_note)
    if keyword and not has_feature(plan, "keyword_search"):
        raise click.UsageError(
            "Arquivo.pt keyword search needs the Pro plan or higher "
            f"(your plan: {plan}). CDX mode (no --keyword) works on "
            f"every plan.")
    click.echo(plan_note(plan))
    click.echo(f"Arquivo.pt: {arquivo_mod.EMBARGO_NOTE}")
    try:
        records, mode = arquivo_mod.run_arquivo(
            identifier, keyword=keyword, network=network,
            instance=instance, limit=limit)
    except ValueError as e:
        raise click.UsageError(str(e))
    except Exception as e:
        rprint(f"[yellow]Arquivo.pt didn't answer: {e}[/yellow]")
        rprint("The Wayback result still stands — retry once, or use "
               "`archive` for the Wayback-only view.")
        raise SystemExit(1)
    click.echo(f"Arquivo.pt ({mode} mode): {len(records)} result(s).")
    if not records:
        raise SystemExit(1)
    fmts = resolve_formats_or_usage(plan, formats)
    saved = export_all(records, network if not keyword else "arquivo",
                       identifier.lstrip("@"), out_dir, fmts)
    for p in saved:
        click.echo(f"Saved to {p}")
