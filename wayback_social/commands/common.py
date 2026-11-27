"""Shared CLI bits: date parsing and the live-check help text.

Split out of cli.py (issue #12) — used by archive/diff/find.
"""
from __future__ import annotations

from datetime import datetime

import click


LIVE_CHECK_HELP = ("Best-effort live check (experimental): HEAD/GET each post "
                   "URL and mark live / deleted / unknown. A login wall "
                   "(Instagram, Facebook, TikTok, LinkedIn) is 'unknown', "
                   "never 'deleted' — only 404/410, or X oEmbed 404, counts "
                   "as deleted.")


def _parse_date(ctx, param, value):
    if value is None:
        return None
    try:
        return datetime.strptime(value, "%Y%m%d").strftime("%Y%m%d")
    except ValueError:
        raise click.BadParameter("Date must be in format YYYYmmdd")
