"""``diff`` command — deleted-only diff (live / deleted / unknown).

Split out of cli.py (issue #12) — no behaviour change.
"""
from __future__ import annotations

from pathlib import Path

import click
from rich import print as rprint

from .. import live as live_mod
from ..cdx import EmptyResultError, query_many
from ..cmdutil import (LICENCE_OPTION, PLAN_OPTION,
                       live_verdicts_or_fallback as _live_verdicts,
                       resolve_formats_or_usage as _formats,
                       resolve_plan_or_usage as _resolve)
from ..diff import (DIFF_EXPORT_FIELDS, DIFF_FIELDS, diff_exports,
                    diff_records, load_export, summarise)
from ..export import export_all
from ..networks import detect_network, get_network
from ..parse import FIELD_OPTIONS, PostsParser
from ..plans import cap_limit, fetch_text_cap, has_feature, plan_note
from .common import _parse_date


@click.command("diff")
@click.argument("network", required=False)
@click.argument("identifier", required=False)
@click.option("--url", "post_url", default=None,
              help="Diff a single full post URL (network auto-detected).")
@click.option("--instance", default=None, help="Mastodon instance.")
@click.option("-f", "--from", "from_ts", callback=_parse_date, default=None, metavar="DATE")
@click.option("-t", "--to", "to_ts", callback=_parse_date, default=None, metavar="DATE")
@click.option("-l", "--limit", type=int, default=20,
              help="Max CDX results per URL pattern (default 20).")
@click.option("--only", type=click.Choice(["deleted", "live", "unknown", "all"]),
              default="all", help="Export only this verdict (default: all).")
@click.option("--fetch-text/--no-fetch-text", default=True,
              help="Recover text from the archived snapshot for deleted posts (default: on).")
@click.option("--workers", type=int, default=5, help="Parallel live-check workers.")
@click.option("--format", "formats", multiple=True,
              type=click.Choice(["csv", "json", "jsonl", "html", "all"]),
              default=["all"], help="Output format(s).")
@click.option("--out-dir", type=click.Path(path_type=Path), default=Path("."))
@click.option("-v", "--verbose", is_flag=True, default=False)
@PLAN_OPTION
@LICENCE_OPTION
def diff_cmd(network, identifier, post_url, instance, from_ts, to_ts,
             limit, only, fetch_text, workers, formats, out_dir, verbose,
             plan, licence_key):
    """Deleted-only diff: which archived posts are gone from the live site.

    ``wayback-social diff x jack`` archives the account, checks each
    distinct post live, and reports live / deleted / unknown per post.
    ``unknown`` means login-walled, rate-limited or errored — it is NOT
    counted as deleted. Every row keeps its Wayback snapshot link, so
    a deleted post is still viewable. ``--only deleted`` exports just
    the gone posts: the evidence pack.

    ``wayback-social diff OLD.json NEW.json`` compares two exports
    instead (no network): posts in OLD but missing from NEW are
    "removed", with first/last archived dates.
    """
    import json

    plan, licence_note = _resolve(plan, licence_key)
    if licence_note:
        click.echo(licence_note)

    # --- export-comparison mode: diff OLD.json NEW.json -------------------
    if network and identifier and Path(network).is_file() and Path(identifier).is_file():
        try:
            old_recs = load_export(network)
            new_recs = load_export(identifier)
        except ValueError as e:
            raise click.UsageError(str(e))
        result = diff_exports(old_recs, new_recs)
        click.echo(f"Compared {len(old_recs)} (old) vs {len(new_recs)} (new) rows: "
                   f"removed {result['removed']}, added {result['added']}, "
                   f"kept {result['kept']}.")
        for r in result["removed_rows"]:
            click.echo(f"  removed: {r['first_archived_timestamp']}–"
                       f"{r['last_archived_timestamp']} {r['original_post_url']}")
        # --only deleted (live-diff vocabulary) means "removed" here.
        kept = {"all": result["removed_rows"] + result["added_rows"] + result["kept_rows"],
                "removed": result["removed_rows"], "deleted": result["removed_rows"],
                "added": result["added_rows"],
                "kept": result["kept_rows"]}.get(only, result["removed_rows"])
        fmts = _formats(plan, formats)
        saved = export_all(kept, "diff", "exports", out_dir, fmts,
                           fields=DIFF_EXPORT_FIELDS)
        for p in saved:
            click.echo(f"Saved to {p}")
        return

    # Deleted diff is a paid feature (pricing.yaml: deleted_diff is
    # false on free) — the web console blocks free users the same way.
    # The local export-comparison mode above is NOT gated: it only
    # compares two files the user already exported, no archive or
    # live check involved.
    if not has_feature(plan, "deleted_diff"):
        raise click.UsageError(
            "Deleted diff needs the Starter plan or higher "
            f"(your plan: {plan}). `archive` (CDX search without "
            "the live check) works on every plan.")

    if post_url:
        net = detect_network(post_url)
        if not net:
            raise click.UsageError(f"Could not detect network from URL: {post_url}")
        ident = post_url
        patterns = [post_url]
    else:
        if not network or not identifier:
            raise click.UsageError("Provide NETWORK and IDENTIFIER, or --url <post url>.")
        net = get_network(network)
        if not net:
            raise click.UsageError(f"Unknown network '{network}'.")
        ident = identifier.lstrip("@")
        patterns = net.cdx_urls(ident, instance or "mastodon.social")
    click.echo(plan_note(plan))
    limit, clamped = cap_limit(plan, limit)
    if clamped:
        click.echo(f"Note: --limit capped to {limit} on the {plan} plan.")
    click.echo("Retrieving from Wayback CDX…")
    try:
        rows, resume = query_many(patterns, limit=limit, from_ts=from_ts,
                                  to_ts=to_ts, verbose=verbose)
    except EmptyResultError as e:
        rprint(f"[yellow]No captures: {e}[/yellow]")
        raise SystemExit(1)
    records = PostsParser(rows, net, ident, FIELD_OPTIONS,
                          resumption_key=resume).parse(fetch_text=fetch_text,
                                                      workers=workers,
                                                      fetch_cap=fetch_text_cap(plan))
    click.echo(f"Archived {len(records)} capture(s); checking each post live…")
    # Bluesky / Mastodon: one public live-feed lookup beats per-URL
    # HEADs (their post pages are SPAs that 200 for any route).
    live_ids = live_complete = None
    if net.id in live_mod.SUPPORTED:
        verdicts, info = _live_verdicts(records, net, ident,
                                        instance or "mastodon.social")
        if verdicts is not None and info is not None:
            live_ids = set(info.get("live_post_ids", []))
            live_complete = bool(info.get("complete")
                                 or info.get("profile_status") == "not_found")
    diffed, skipped = diff_records(records, net.id, workers=workers,
                                   require_post_id=not bool(post_url),
                                   live_ids=live_ids,
                                   live_complete=bool(live_complete))
    summary = summarise(diffed)
    if skipped:
        click.echo(f"Skipped {skipped} non-post capture(s) with no post ID "
                   f"(profile / listing pages — not posts, not counted).")
    click.echo(f"Posts: {summary['total_posts']} — live {summary['live']}, "
               f"deleted {summary['deleted']}, unknown {summary['unknown']} "
               f"(login-walled / rate-limited, not counted as deleted).")
    if summary["deleted"]:
        click.echo("Deleted posts (still viewable via their archived link):")
        for r in diffed:
            if r["live_verdict"] == "deleted":
                click.echo(f"  - {r['archived_timestamp']} {r['original_post_url']}")
    else:
        click.echo("No deleted posts found in this set.")
    kept = [r for r in diffed if only == "all" or r["live_verdict"] == only]
    fmts = _formats(plan, formats)
    file_ident = (net.post_id(post_url) if post_url else ident)
    saved = export_all(kept, net.id, f"diff_{file_ident}", out_dir, fmts,
                       fields=DIFF_FIELDS)
    for p in saved:
        click.echo(f"Saved to {p}")
    out_dir.mkdir(parents=True, exist_ok=True)
    summary_path = out_dir / f"diff_{net.id}_{file_ident}_summary.json"
    summary_path.write_text(json.dumps(
        {"network": net.id, "identifier": ident, "summary": summary,
         "skipped_non_post_captures": skipped,
         "records": diffed}, indent=2, ensure_ascii=False), encoding="utf-8")
    click.echo(f"Summary: {summary_path}")

