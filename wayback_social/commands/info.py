"""``networks`` and ``presets`` — the two list/info commands.

Split out of cli.py (issue #12) — no behaviour change.
"""
from __future__ import annotations

import click
from rich import print as rprint

from ..networks import list_networks
from ..presets import list_presets


@click.command("networks")
def networks_cmd():
    """List supported networks, their coverage and identifier format."""
    rprint("[bold]Supported networks[/bold]  (coverage = how well Wayback archives it)\n")
    for n in list_networks():
        aliases = f" (aliases: {', '.join(n.aliases)})" if n.aliases else ""
        rprint(f"[cyan]{n.id:<10}[/cyan] {n.name}{aliases}")
        rprint(f"           coverage: {n.coverage} | identifier: {n.identifier_label}")
        rprint(f"           {n.notes}\n")



@click.command("presets")
def presets_cmd():
    """List market presets (catfish, relationship, brand, hiring, legal, …)."""
    for p in list_presets():
        rprint(f"[cyan]{p.id:<12}[/cyan] {p.name} — {p.audience}")
        rprint(f"             {p.goal}")
        rprint(f"             networks: {', '.join(p.networks)}\n")
