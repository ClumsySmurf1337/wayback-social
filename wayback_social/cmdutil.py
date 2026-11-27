"""Shared CLI wiring (v1.4): plan/licence options, format gating,
live-feed verdicts. Split out of cli.py so the command modules stay
thin — cli.py was already 553 lines before v1.4 and must not become
the place where every command lives.
"""
from __future__ import annotations

import click

from . import live as live_mod
from .export import FormatNotAllowedError, resolve_export_formats
from .licence import SECRET_ENV, SECRET_FILE, resolve_plan
from .plans import PLAN_IDS

PLAN_OPTION = click.option(
    "--plan", type=click.Choice(PLAN_IDS), default="free", show_default=True,
    help="Licence plan — enforces its caps (free: 25 captures/archive, "
         "3 networks/find, 3 targets/batch, text for 5 posts).")

LICENCE_OPTION = click.option(
    "--licence", "licence_key", default=None, metavar="KEY",
    help="Licence key (DP1-...) — verifies it and unlocks that tier's "
         "caps, overriding --plan. Needs the secret: set "
         f"{SECRET_ENV} or put it in {SECRET_FILE}.")


def resolve_plan_or_usage(plan: str, licence_key: str | None) -> tuple[str, str | None]:
    """Effective plan after --licence; usage error on a bad key."""
    try:
        return resolve_plan(plan, licence_key)
    except ValueError as e:
        raise click.UsageError(str(e))


def resolve_formats_or_usage(plan: str, formats) -> list[str]:
    """Resolve --format against the plan's export gating (v1.4).

    "all" clamps to what the plan allows (with a note); an explicitly
    requested format above the plan is a usage error (exit code 2)
    naming the tier that unlocks it, with CSV still offered.
    """
    try:
        fmts, skipped = resolve_export_formats(plan, list(formats))
    except FormatNotAllowedError as e:
        raise click.UsageError(str(e))
    if skipped:
        click.echo(f"Note: {', '.join(skipped)} export(s) need a higher "
                   f"plan on the {plan} plan — skipped; "
                   f"{', '.join(fmts)} saved instead.")
    return fmts


def live_verdicts_or_fallback(records, net, ident, instance):
    """Live verdicts via the Bluesky/Mastodon public APIs, or None.

    Returns (verdicts dict, live_check info) when the network has a
    public live feed and the lookup worked; None when the network is
    unsupported or the lookup errored (caller falls back to HEAD).
    """
    if net.id not in live_mod.SUPPORTED:
        return None, None
    # --url mode passes the full post URL as the identifier; the live
    # APIs need the handle (and instance) instead.
    handle, inst = live_mod.handle_from_url(net.id, ident, instance)
    info = live_mod.live_check(net.id, handle, inst)
    if info.get("profile_status") not in ("found", "not_found"):
        click.echo(f"Note: live API didn't answer for @{handle} "
                   f"({info.get('error') or info.get('profile_status')}) — "
                   f"falling back to per-URL checks.")
        return None, info
    if info.get("profile_status") == "not_found":
        click.echo(f"Note: live profile @{handle} is gone "
                   f"({net.id} lookup 404) — every post is deleted.")
    else:
        click.echo(f"Live feed: {len(info['live_post_ids'])} post(s) still "
                   f"up (feed {'complete' if info['complete'] else 'truncated to ' + str(len(info['live_post_ids']))}).")
    return live_mod.verdicts_from_live(records, info), info
