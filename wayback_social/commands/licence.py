"""Licence commands: ``licence make`` (dev-only) and ``licence check``.

Split out of cli.py (issue #12) — no behaviour change.
"""
from __future__ import annotations

import os

import click

from ..licence import (SECRET_ENV, SECRET_FILE, load_secret, make_key,
                       verify_key)
from ..plans import PLAN_IDS, PLAN_LABELS


@click.group("licence")
def licence_group():
    """Licence keys: make (dev-only) and check."""


@licence_group.command("make")
@click.option("--tier", type=click.Choice(PLAN_IDS), required=True,
              help="Tier to mint. A Bundle purchase mints a 'studio' key "
                   "(bundle caps are Studio-level).")
@click.option("--email", required=True,
              help="Buyer email — recorded with the sale, not in the key.")
def licence_make(tier, email):
    """Mint a licence key (dev-only — needs the secret in the env)."""
    secret = os.environ.get(SECRET_ENV)
    if not secret:
        raise click.UsageError(
            f"licence make is dev-only: set {SECRET_ENV} to the minting "
            "secret first. Never commit a secret; production minting "
            "happens in a Cloudflare Pages Function (see "
            "docs/storage-auth-plan.md).")
    key = make_key(tier, secret)
    click.echo(f"Licence key for {email} ({tier}):\n{key}")
    click.echo("Give the buyer the key + this check command: "
               "wayback-social licence check KEY")


@licence_group.command("check")
@click.argument("key")
def licence_check(key):
    """Verify a licence key against the secret; print its tier."""
    secret = load_secret()
    if not secret:
        raise click.UsageError(
            f"Cannot verify without the secret: set {SECRET_ENV} or put "
            f"it in {SECRET_FILE}.")
    valid, tier, reason = verify_key(key, secret)
    if valid:
        click.echo(f"Valid licence key — tier: {tier} "
                   f"({PLAN_LABELS[tier]}).")
    else:
        click.echo(f"Invalid licence key: {reason}.")
        raise SystemExit(1)

