"""CLI: wayback-social — archived posts from the Wayback Machine,
for all social networks, not just Twitter.

Usage:
  wayback-social networks
  wayback-social archive x jack
  wayback-social archive tiktok @tiktok --from 20220101 --limit 100
  wayback-social archive youtube @NASA --no-fetch-text
  wayback-social archive mastodon gargron --instance mastodon.social
  wayback-social archive --url https://www.instagram.com/p/C-a6bDVy7hz/
  wayback-social archive reddit spez --format json
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import click
from rich import print as rprint

from .cdx import EmptyResultError, query_cdx, query_many
from .diff import (DIFF_EXPORT_FIELDS, DIFF_FIELDS, classify_live,
                   diff_exports, diff_records, load_export, summarise)
from .export import export_all
from .networks import detect_network, get_network, list_networks
from .parse import FIELD_OPTIONS, PostsParser
from .plans import (PLAN_IDS, cap_batch_targets, cap_find_networks,
                    cap_limit, fetch_text_cap, plan_note)
from .presets import get_preset, list_presets

VERSION = "1.2.0"

PLAN_OPTION = click.option(
    "--plan", type=click.Choice(PLAN_IDS), default="free", show_default=True,
    help="Licence plan — enforces its caps (free: 25 captures/archive, "
         "3 networks/find, 3 targets/batch, text for 5 posts).")

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


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.version_option(version=VERSION, prog_name="wayback-social")
def main():
    """Retrieve archived social-media posts from the Wayback Machine."""


@main.command("networks")
def networks_cmd():
    """List supported networks, their coverage and identifier format."""
    rprint("[bold]Supported networks[/bold]  (coverage = how well Wayback archives it)\n")
    for n in list_networks():
        aliases = f" (aliases: {', '.join(n.aliases)})" if n.aliases else ""
        rprint(f"[cyan]{n.id:<10}[/cyan] {n.name}{aliases}")
        rprint(f"           coverage: {n.coverage} | identifier: {n.identifier_label}")
        rprint(f"           {n.notes}\n")


@main.command("archive")
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
@click.option("-l", "--limit", type=int, default=None, help="Max CDX results.")
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
@click.option("--workers", type=int, default=5, help="Parallel fetch workers.")
@click.option("-v", "--verbose", is_flag=True, default=False)
@PLAN_OPTION
def archive_cmd(network, identifier, post_url, instance, collapse, from_ts,
                to_ts, limit, resumption_key, matchtype, formats, out_dir,
                fetch_text, live_check, workers, verbose, plan):
    """Archive NETWORK IDENTIFIER, e.g. `archive x jack`.

    NETWORK is one of the ids from `wayback-social networks`
    (x, instagram, facebook, tiktok, youtube, reddit, linkedin,
    threads, bluesky, mastodon, pinterest, tumblr, twitch, medium).
    """
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
        for r in records:
            if not r.get("post_id"):
                # Listing/profile rows are not posts; don't live-check them.
                r.update({"live_verdict": "not-a-post", "live_http_status": "",
                          "live_final_url": r["original_post_url"],
                          "live_checked_at": ""})
                continue
            info = classify_live(r["original_post_url"], net.id)
            r.update(info)
        counts = summarise(records)
        click.echo(f"Live: {counts['live']}, deleted {counts['deleted']}, "
                   f"unknown {counts['unknown']} (of {counts['total_posts']}).")
        export_fields = FIELD_OPTIONS + live_fields

    # --- export -----------------------------------------------------------
    fmts = ["csv", "json", "jsonl", "html"] if "all" in formats else list(formats)
    # --url mode: filename from the post id, not the whole URL.
    file_ident = ident
    if post_url:
        file_ident = net.post_id(post_url) or records[0].get("post_id") or "post"
    saved = export_all(records, net.id, file_ident, out_dir, fmts,
                       fields=export_fields)
    for p in saved:
        click.echo(f"Saved to {p}")
    if resume:
        rprint(f"\n[blue]Resumption Key: [bold]{resume}[/bold][/blue]")
        rprint("Use --resumption-key <key> with --limit to page through large results.")


@main.command("diff")
@click.argument("network", required=False)
@click.argument("identifier", required=False)
@click.option("--url", "post_url", default=None,
              help="Diff a single full post URL (network auto-detected).")
@click.option("--instance", default=None, help="Mastodon instance.")
@click.option("-f", "--from", "from_ts", callback=_parse_date, default=None, metavar="DATE")
@click.option("-t", "--to", "to_ts", callback=_parse_date, default=None, metavar="DATE")
@click.option("-l", "--limit", type=int, default=20, help="Max CDX results (default 20).")
@click.option("--only", type=click.Choice(["deleted", "live", "unknown", "all"]),
              default="all", help="Export only this verdict (default: all).")
@click.option("--fetch-text/--no-fetch-text", default=True,
              help="Recover text from the archived snapshot for deleted posts (default: on).")
@click.option("--workers", type=int, default=5, help="Parallel live-check workers.")
@click.option("--format", "formats", multiple=True,
              type=click.Choice(["csv", "json", "jsonl", "html", "all"]),
              default=["csv", "json"], help="Output format(s).")
@click.option("--out-dir", type=click.Path(path_type=Path), default=Path("."))
@click.option("-v", "--verbose", is_flag=True, default=False)
@PLAN_OPTION
def diff_cmd(network, identifier, post_url, instance, from_ts, to_ts,
             limit, only, fetch_text, workers, formats, out_dir, verbose, plan):
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
        fmts = ["csv", "json", "jsonl", "html"] if "all" in formats else list(formats)
        saved = export_all(kept, "diff", "exports", out_dir, fmts,
                           fields=DIFF_EXPORT_FIELDS)
        for p in saved:
            click.echo(f"Saved to {p}")
        return

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
    diffed, skipped = diff_records(records, net.id, workers=workers,
                                   require_post_id=not bool(post_url))
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
    fmts = ["csv", "json", "jsonl", "html"] if "all" in formats else list(formats)
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


@main.command("find")
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
              default=["json"], help="Output format(s).")
@click.option("--out-dir", type=click.Path(path_type=Path), default=Path("."))
@click.option("-v", "--verbose", is_flag=True, default=False)
@PLAN_OPTION
def find_cmd(identifier, preset_name, networks, keyword, limit, from_ts,
             to_ts, fetch_text, formats, out_dir, verbose, plan):
    """Broad search: one handle, every network at once.

    ``wayback-social find jack`` checks the same handle on all 14
    networks and reports where it exists, oldest capture first.
    ``--preset catfish`` narrows to the networks + checklist for that
    use, and prints its ethics note. ``--keyword`` filters on recovered
    text (use with --fetch-text).
    """
    import json

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

    fmts = ["csv", "json", "jsonl", "html"] if "all" in formats else list(formats)
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


@main.command("presets")
def presets_cmd():
    """List market presets (catfish, relationship, brand, hiring, legal, …)."""
    for p in list_presets():
        rprint(f"[cyan]{p.id:<12}[/cyan] {p.name} — {p.audience}")
        rprint(f"             {p.goal}")
        rprint(f"             networks: {', '.join(p.networks)}\n")


@main.command("batch")
@click.argument("file", type=click.Path(exists=True, path_type=Path))
@click.option("--out-dir", type=click.Path(path_type=Path), default=Path("."))
@click.option("-l", "--limit", type=int, default=100,
              help="Max CDX results per target (default 100).")
@click.option("--fetch-text/--no-fetch-text", default=False,
              help="Try to recover post text (slower; default off for batch).")
@click.option("--format", "formats", multiple=True,
              type=click.Choice(["csv", "json", "jsonl", "html", "all"]),
              default=["csv", "json"], help="Output format(s) per target.")
@click.option("-v", "--verbose", is_flag=True, default=False)
@PLAN_OPTION
def batch_cmd(file, out_dir, limit, fetch_text, formats, verbose, plan):
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

    fmts = ["csv", "json", "jsonl", "html"] if "all" in formats else list(formats)
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


if __name__ == "__main__":
    main()
