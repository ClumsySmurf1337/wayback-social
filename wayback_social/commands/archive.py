"""``archive`` command — archive NETWORK IDENTIFIER (or --url).

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
from ..diff import classify_live, summarise
from ..evidence import build_evidence_pack, require_evidence
from ..export import export_all
from ..networks import detect_network, get_network
from ..parse import FIELD_OPTIONS, PostsParser
from ..plans import cap_limit, fetch_text_cap, plan_note
from .common import LIVE_CHECK_HELP, _parse_date


@click.command("archive")
@click.argument("network", required=False)
@click.argument("identifier", required=False)
@click.option("--url", "post_url", default=None,
              help="Archive a single full post URL instead (network auto-detected).")
@click.option("--instance", default=None,
              help="Mastodon instance, e.g. mastodon.social (default).")
@click.option("-c", "--collapse", default=None,
              help="Collapse results: urlkey, digest, or timestamp:XX (XX=1-14).")
@click.option("-f", "--from", "from_ts", callback=_parse_date, default=None,
              metavar="DATE", help="From date, YYYYmmdd.")
@click.option("-t", "--to", "to_ts", callback=_parse_date, default=None,
              metavar="DATE", help="To date, YYYYmmdd.")
@click.option("-l", "--limit", type=int, default=None, help="Max CDX results per URL pattern.")
@click.option("-rk", "--resumption-key", default=None,
              help="Resume a previous query from its resumption key.")
@click.option("-mt", "--matchtype", type=click.Choice(
    ["exact", "prefix", "host", "domain"], case_sensitive=False), default=None)
@click.option("--format", "formats", multiple=True,
              type=click.Choice(["csv", "json", "jsonl", "html", "all"]),
              default=["all"], help="Output format(s); repeatable. Default: all.")
@click.option("--out-dir", type=click.Path(path_type=Path), default=Path("."),
              help="Output directory (default: current directory).")
@click.option("--fetch-text/--no-fetch-text", default=True,
              help="Try oEmbed / archived snapshot for post text (default: on). "
                   "--no-fetch-text is much faster and CDX-only.")
@click.option("--live-check", is_flag=True, default=False, help=LIVE_CHECK_HELP)
@click.option("--evidence", "evidence_path", type=click.Path(path_type=Path),
              default=None, metavar="PACK.ZIP",
              help="Also build an evidence-pack ZIP (Studio feature — "
                   "10 reports included in the Studio pack).")
@click.option("--workers", type=int, default=5, help="Parallel fetch workers.")
@click.option("-v", "--verbose", is_flag=True, default=False)
@PLAN_OPTION
@LICENCE_OPTION
def archive_cmd(network, identifier, post_url, instance, collapse, from_ts,
                to_ts, limit, resumption_key, matchtype, formats, out_dir,
                fetch_text, live_check, evidence_path, workers, verbose,
                plan, licence_key):
    """Archive NETWORK IDENTIFIER, e.g. `archive x jack`.

    NETWORK is one of the ids from `wayback-social networks`
    (x, instagram, facebook, tiktok, youtube, reddit, linkedin,
    threads, bluesky, mastodon, pinterest, tumblr, twitch, medium).
    """
    plan, licence_note = _resolve(plan, licence_key)
    if licence_note:
        click.echo(licence_note)

    # --- resolve target -------------------------------------------------
    if post_url:
        net = detect_network(post_url)
        if not net:
            raise click.UsageError(f"Could not detect network from URL: {post_url}")
        ident = post_url
        patterns = [post_url.rstrip("/") + "/*" if not post_url.rstrip("/").endswith("/*") else post_url]
        # Single-post mode: exact URL, no wildcard expansion beyond itself.
        patterns = [post_url]
        if verbose:
            rprint(f"Detected network: [cyan]{net.id}[/cyan] ({net.name})")
    else:
        if not network or not identifier:
            raise click.UsageError("Provide NETWORK and IDENTIFIER, or --url <post url>.")
        net = get_network(network)
        if not net:
            raise click.UsageError(
                f"Unknown network '{network}'. Run `wayback-social networks` to list them.")
        ident = identifier.lstrip("@")
        if net.id == "reddit" and ident.startswith("r/"):
            patterns = [f"https://www.reddit.com/{ident}/*",
                        f"https://old.reddit.com/{ident}/*"]
        else:
            patterns = net.cdx_urls(ident, instance or "mastodon.social")
        if verbose:
            rprint(f"Network: [cyan]{net.id}[/cyan] ({net.name})  coverage: {net.coverage}")
            rprint(f"Note: {net.notes}")

    # --- plan caps -------------------------------------------------------
    click.echo(plan_note(plan))
    limit, clamped = cap_limit(plan, limit)
    if clamped:
        click.echo(f"Note: --limit capped to {limit} on the {plan} plan "
                   f"(upgrade with --plan pro / studio).")

    # --- CDX -------------------------------------------------------------
    click.echo("Retrieving from Wayback CDX… (archive.org can be slow; "
               "use --limit / --no-fetch-text if it stalls)")
    cdx_kw = dict(collapse=collapse, from_ts=from_ts, to_ts=to_ts, limit=limit,
                  resumption_key=resumption_key, matchtype=matchtype, verbose=verbose)
    try:
        # query_many handles 1 pattern or several (e.g. twitter.com + x.com),
        # merges, de-dupes by (timestamp, original) and pulls the resume key.
        rows, resume = query_many(patterns, **cdx_kw)
    except EmptyResultError as e:
        rprint(f"[yellow]No captures: {e}[/yellow]")
        rprint("Tip: try a wider date range, --matchtype prefix, or check the "
               "handle spelling. Some networks are barely archived at all.")
        raise SystemExit(1)

    # --- parse (+ optional text) ----------------------------------------
    parser = PostsParser(rows, net, ident, FIELD_OPTIONS,
                         resumption_key=resume)
    total = len(parser.rows)
    click.echo(f"Found {total} capture(s). Parsing…")
    if fetch_text:
        fcap = fetch_text_cap(plan)
        if total > fcap:
            click.echo(f"Note: text fetch capped to the first {fcap} post(s) "
                       f"on the {plan} plan.")
        done = [0]

        def _tick():
            done[0] += 1
            if done[0] % 20 == 0:
                click.echo(f"  fetched text for {done[0]}/{total}…")

        records = parser.parse(fetch_text=True, workers=workers, progress=_tick,
                               fetch_cap=fcap)
    else:
        records = parser.parse(fetch_text=False)
    with_text = sum(1 for r in records if r.get("available_post_text"))
    click.echo(f"Parsed {len(records)} post(s); text recovered for {with_text}.")

    # --- live check (experimental, best-effort) ---------------------------
    export_fields = None
    if live_check:
        click.echo("Live-checking each post (unknown = login wall / error, "
                   "never counted as deleted)…")
        live_fields = ["live_verdict", "live_http_status", "live_final_url",
                       "live_checked_at"]
        verdicts, _info = _live_verdicts(records, net, ident,
                                         instance or "mastodon.social")
        for r in records:
            if not r.get("post_id"):
                # Listing/profile rows are not posts; don't live-check them.
                r.update({"live_verdict": "not-a-post", "live_http_status": "",
                          "live_final_url": r["original_post_url"],
                          "live_checked_at": ""})
                continue
            if verdicts is not None and r["post_id"] in verdicts:
                r.update(verdicts[r["post_id"]])
            else:
                info = classify_live(r["original_post_url"], net.id)
                r.update(info)
        counts = summarise(records)
        click.echo(f"Live: {counts['live']}, deleted {counts['deleted']}, "
                   f"unknown {counts['unknown']} (of {counts['total_posts']}).")
        export_fields = FIELD_OPTIONS + live_fields

    # --- export -----------------------------------------------------------
    fmts = _formats(plan, formats)
    # --url mode: filename from the post id, not the whole URL.
    file_ident = ident
    if post_url:
        file_ident = net.post_id(post_url) or records[0].get("post_id") or "post"
    saved = export_all(records, net.id, file_ident, out_dir, fmts,
                       fields=export_fields)
    for p in saved:
        click.echo(f"Saved to {p}")
    if evidence_path:
        try:
            require_evidence(plan)
        except ValueError as e:
            raise click.UsageError(str(e))
        pack, manifest = build_evidence_pack(
            records, {"network": net.id, "identifier": file_ident},
            evidence_path)
        click.echo(f"Evidence pack: {pack} ({manifest['counts']['records']} "
                   f"records, {manifest['counts']['deleted']} deleted, "
                   f"manifest SHA-256 in manifest.json).")
    if resume:
        rprint(f"\n[blue]Resumption Key: [bold]{resume}[/bold][/blue]")
        rprint("Use --resumption-key <key> with --limit to page through large results.")

