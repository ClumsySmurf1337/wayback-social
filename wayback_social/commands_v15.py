"""v1.5 CLI commands: live crawl, archive sources, Common Crawl jobs.

Kept in its own module so cli.py (already 553 lines) only gains a
few registration lines at the end. Each command is a plain click
command; cli.py registers them with main.add_command().
"""
from __future__ import annotations

import json
from pathlib import Path

import click
from rich import print as rprint

from .archives import (SOURCES, probe_source, queue_commoncrawl_job,
                       run_commoncrawl_job, search_archive)
from .diff import load_export
from .live_crawl import cross_check, live_posts, live_profile, rss_feed
from .networks import get_network


@click.command("live")
@click.argument("network")
@click.argument("handle")
@click.option("--instance", default="mastodon.social",
              help="Mastodon instance (default mastodon.social).")
@click.option("--export", "export_path", type=click.Path(exists=True, path_type=Path),
              default=None,
              help="An archive export file to cross-check: which of its "
                   "posts are still live, deleted, or unknown.")
@click.option("--limit", type=int, default=10,
              help="Latest live posts to show (default 10).")
def live_cmd(network, handle, instance, export_path, limit):
    """Live check: is this handle / are these posts still up?

    ``wayback-social live bluesky bsky.app`` — public profile + latest
    posts, no key. ``live mastodon Mastodon`` — same via the public
    API. ``live x jack --export x_jack_*.json`` cross-checks an
    archive export against the live site (oEmbed per post).

    Networks with no free live route (Instagram, Facebook, Threads,
    LinkedIn, Reddit) are labelled login-walled — archive only, never
    scraped, never faked.
    """
    net = get_network(network)
    if not net:
        raise click.UsageError(f"Unknown network '{network}'.")
    prof = live_profile(net.id, handle, instance)
    rprint(f"[bold]{net.name} @{handle}[/bold] — live status: "
           f"[cyan]{prof['status']}[/cyan]")
    for key in ("display_name", "did", "account_id", "followers",
                "following", "posts", "created_at"):
        if prof.get(key) is not None:
            rprint(f"  {key}: {prof[key]}")
    if prof.get("note"):
        rprint(f"  note: {prof['note']}")
    if prof["status"] == "live" and net.id in ("bluesky", "mastodon"):
        posts = live_posts(net.id, handle, instance, limit)
        shown = posts.get("posts", [])
        rprint(f"  latest {len(shown)} live post(s):")
        for p in shown:
            text = (p.get("text") or "")[:120].replace("\n", " ")
            rprint(f"    {p.get('created_at', '')[:10]}  {text}")
            rprint(f"      {p.get('url', '')}")
    if export_path:
        records = load_export(export_path)
        rows, skipped = cross_check(records, net.id, instance)
        live_n = sum(1 for r in rows if r["live_status"] == "live")
        del_n = sum(1 for r in rows if r["live_status"] == "deleted")
        unk_n = sum(1 for r in rows if r["live_status"] == "unknown")
        rprint(f"\nCross-check vs {export_path.name}: {len(rows)} post(s) — "
               f"live {live_n}, deleted {del_n}, unknown {unk_n}.")
        if skipped:
            rprint(f"  skipped {skipped} listing/profile row(s) with no "
                   "post id (checking those would fake 'deleted').")
        for r in rows:
            if r["live_status"] == "deleted":
                rprint(f"  deleted: {r['archived_timestamp']} "
                       f"{r['original_post_url']}")
        if unk_n:
            rprint("  'unknown' = login-walled or outside the live feed "
                   "window — not counted as deleted.")


@click.command("sources")
def sources_cmd():
    """List every archive + live source, with a live status probe.

    Each source is probed with one cheap call: working / down /
    not-configured / async-only. A source that is down is reported
    as down — the search falls back to the sources that answer.
    """
    rprint("[bold]Archive sources[/bold] (searchable history)\n")
    for sid, meta in SOURCES.items():
        probe = probe_source(sid)
        status = probe["status"]
        colour = {"ok": "green", "empty": "yellow"}.get(status, "red")
        rprint(f"[cyan]{sid:<13}[/cyan] {meta['name']} "
               f"[{colour}]{status}[/{colour}] — {meta['cost']}; "
               f"needs: {meta['needs']}")
        rprint(f"              {meta['note']}")
        if probe.get("note"):
            rprint(f"              probe: {probe['note']}")
    rprint("\n[bold]Live sources[/bold] (is it still up now — no login)\n")
    live_rows = [
        ("bluesky", "AT Protocol getProfile/getAuthorFeed — no key, free"),
        ("mastodon", "Public API + RSS — no key, 300 req/5 min"),
        ("youtube", "oEmbed (free) + channel RSS; Data API needs a key"),
        ("x", "oEmbed only — the one sanctioned live X check"),
        ("tiktok", "oEmbed only"),
        ("reddit", "LOGIN-WALLED — live JSON is 403/429; archive only"),
        ("instagram", "LOGIN-WALLED — archive only (+ optional Open RSS)"),
        ("facebook", "LOGIN-WALLED — archive only"),
        ("threads", "LOGIN-WALLED — archive only"),
        ("linkedin", "LOGIN-WALLED — archive only"),
    ]
    for net, note in live_rows:
        rprint(f"[cyan]{net:<13}[/cyan] {note}")
    rprint("\nNever in any tier: logged-in X scraping (twikit/twscrape), "
           "Nitter, face recognition, monitoring, DMs, location, minors.")


@click.command("cc")
@click.argument("url", required=False)
@click.option("--check", "job_path", type=click.Path(exists=True, path_type=Path),
              default=None, help="Fetch a queued job file.")
@click.option("--crawl", default="CC-MAIN-2026-47",
              help="Common Crawl index to query (default: latest known).")
@click.option("--out-dir", type=click.Path(path_type=Path), default=Path("."))
def cc_cmd(url, job_path, crawl, out_dir):
    """Common Crawl lookup — async job, never in the live path.

    ``wayback-social cc https://twitter.com/jack/status/20`` queues
    a job file; ``wayback-social cc --check <job file>`` runs the
    (slow, flaky) index query and writes the result back into it.
    The index 404s/504s on single posts — a queued job that comes
    back empty is an honest empty, not a failure.
    """
    if job_path:
        job = run_commoncrawl_job(job_path)
        rprint(f"Job {job_path.name}: [cyan]{job['status']}[/cyan]")
        rprint(f"  {job['result'].get('note', '')}"
               if job["result"] else "")
        if job["status"] == "done":
            rprint(f"  captures: {job['result']['captures']}")
            for row in job["result"]["rows"][:5]:
                rprint(f"    {row.get('timestamp', '')} {row.get('url', '')}")
        return
    if not url:
        raise click.UsageError("Provide a URL to queue, or --check <job file>.")
    job = queue_commoncrawl_job(url, out_dir, crawl)
    click.echo(f"Queued Common Crawl job: {job['path']}")
    click.echo("The index is slow and flaky — run "
               f"`wayback-social cc --check {job['path']}` to fetch it.")


@click.command("rss")
@click.argument("url")
@click.option("--limit", type=int, default=10)
def rss_cmd(url, limit):
    """Fetch a public RSS/Atom feed (Mastodon, Tumblr, Medium, YouTube
    channel feeds) and list its latest entries."""
    result = rss_feed(url, limit)
    if result["status"] != "live":
        rprint(f"[yellow]{result.get('note', 'feed did not answer')}[/yellow]")
        raise SystemExit(1)
    for p in result["posts"]:
        rprint(f"{p.get('created_at', '')[:10]}  {(p.get('text') or '')[:120]}")
        rprint(f"  {p.get('url', '')}")
