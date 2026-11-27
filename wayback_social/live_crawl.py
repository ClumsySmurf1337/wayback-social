"""Live social crawling / searching — public routes only, no login.

This is the "is it still up *right now*?" half of the product. The
archive (CDX) says a post existed on date D; these checks say whether
it is still live today. Bluesky + Mastodon go through ``live.py``
(the v1.4 public-API module — feed-completeness verdicts); this
module adds the rest: oEmbed existence checks (X / YouTube / TikTok),
public RSS feeds, the login-walled labels, and the cross-check of an
archive export against the live site.

Every network gets an honest label:

* ``live``        — a public endpoint answered and the profile/post
  exists (Bluesky, Mastodon, YouTube oEmbed, X/TikTok oEmbed).
* ``not-found``   — the public endpoint says the profile does not
  exist (Bluesky/Mastodon lookup 404).
* ``login-walled`` — the network needs a signed-in account for live
  reads (Instagram, Facebook, Threads, LinkedIn, Reddit). Archive
  only — never scraped, never faked.
* ``unavailable`` — the public endpoint errored / timed out. That is
  a source failure, not a deleted post.

Rules (from docs/data-sources.md — do not relax them): no account
access, no DMs, no location, no monitoring, no face recognition, no
twikit/twscrape-style logged-in X scraping, no Nitter. oEmbed is the
only sanctioned live X check. A 404 from oEmbed *is* a deleted post;
a login wall is *never* a deleted post.
"""
from __future__ import annotations

import re
import urllib.parse

import requests

from . import live as live_mod
from .rss import rss_feed  # noqa: F401 (re-exported)

HEADERS = {"User-Agent": "wayback-social/1.0"}
TIMEOUT = 15

OEMBED = {
    "x": "https://publish.twitter.com/oembed?url={url}",
    "youtube": "https://www.youtube.com/oembed?url={url}&format=json",
    "tiktok": "https://www.tiktok.com/oembed?url={url}",
}
# Networks with no free live route at all (verified 2026-11-26).
LOGIN_WALLED = {"instagram", "facebook", "threads", "linkedin",
                "pinterest", "tumblr", "twitch", "medium", "reddit"}


def _norm_handle(handle: str) -> str:
    return (handle or "").strip().lstrip("@").rstrip("/")


def bluesky_profile(handle: str) -> dict:
    """Public AT Protocol profile via live.py (no key).

    404 here means the handle does not exist (verified: nasa.bsky.social
    400s; bsky.app 200s). Shape: {network, handle, status, did,
    display_name, posts, created_at, note}.
    """
    handle = _norm_handle(handle)
    info = live_mod.live_check("bluesky", handle)
    status = {"found": "live", "not_found": "not-found",
              "error": "unavailable"}.get(info["profile_status"], "unavailable")
    if status == "unavailable" and "HTTP 400" in info.get("error", ""):
        # Bluesky answers 400 "Profile not found" for a handle that
        # does not exist (verified: nasa.bsky.social) — that is a
        # not-found, not a source failure.
        status = "not-found"
    prof = live_mod.bluesky_profile(handle) if status == "live" else {}
    return {"network": "bluesky", "handle": handle, "status": status,
            "did": info.get("did") or prof.get("did"),
            "display_name": prof.get("display_name"),
            "followers": None, "following": None,
            "posts": info.get("post_count") or prof.get("posts_count"),
            "created_at": "",
            "note": info.get("error", "")}


def bluesky_feed(handle: str, limit: int = 10) -> dict:
    """Latest public posts for a handle (live.py getAuthorFeed, no key)."""
    handle = _norm_handle(handle)
    posts, complete = live_mod.bluesky_author_feed(handle, limit)
    if not posts:
        prof = live_mod.bluesky_profile(handle)
        if prof.get("status") == "not_found":
            return {"network": "bluesky", "handle": handle,
                    "status": "not-found", "posts": [],
                    "note": "no such Bluesky profile"}
        return {"network": "bluesky", "handle": handle,
                "status": "unavailable", "posts": [],
                "note": "Bluesky feed did not answer"}
    return {"network": "bluesky", "handle": handle, "status": "live",
            "posts": [{"url": p["url"], "uri": p["uri"],
                       "text": p["text"], "created_at": p["created_at"],
                       "replies": 0, "reposts": 0, "likes": 0}
                      for p in posts],
            "complete": complete}


def mastodon_lookup(handle: str, instance: str = "mastodon.social") -> dict:
    """Public account lookup + latest statuses via live.py."""
    handle = _norm_handle(handle)
    instance = (instance or "mastodon.social").strip().rstrip("/")
    info = live_mod.live_check("mastodon", handle, instance)
    status = {"found": "live", "not_found": "not-found",
              "error": "unavailable"}.get(info["profile_status"], "unavailable")
    look = (live_mod.mastodon_lookup(instance, f"{handle}@{instance}")
            if status == "live" else {})
    posts, _complete = ([], False)
    if status == "live" and look.get("id"):
        posts, _complete = live_mod.mastodon_statuses(
            instance, look["id"], 10)
    return {"network": "mastodon", "handle": handle, "instance": instance,
            "status": status, "account_id": look.get("id"),
            "display_name": look.get("username"),
            "followers": None, "following": None,
            "posts": info.get("post_count") or look.get("statuses_count"),
            "created_at": look.get("created_at", ""),
            "latest_posts": [{"url": p["url"], "text": p["text"],
                              "created_at": p["created_at"],
                              "replies": 0, "reposts": 0, "likes": 0}
                             for p in posts],
            "note": info.get("error", "")}


def oembed_exists(network_id: str, post_url: str) -> dict:
    """oEmbed existence check (X / YouTube / TikTok): 200 + title/text
    means the post is live; 404/401 means gone/private. Anything else
    is 'unavailable', never 'deleted'."""
    template = OEMBED.get(network_id)
    if not template:
        return {"network": network_id, "url": post_url,
                "status": "login-walled",
                "note": "no public oEmbed — live check not possible"}
    endpoint = template.format(url=urllib.parse.quote(post_url, safe=""))
    try:
        r = requests.get(endpoint, headers=HEADERS, timeout=TIMEOUT)
    except Exception as e:
        return {"network": network_id, "url": post_url,
                "status": "unavailable", "note": f"oEmbed error: {e}"}
    if r.status_code in (404, 401):
        return {"network": network_id, "url": post_url,
                "status": "deleted",
                "note": f"oEmbed {r.status_code} — post gone or private"}
    if r.status_code != 200:
        return {"network": network_id, "url": post_url,
                "status": "unavailable",
                "note": f"oEmbed HTTP {r.status_code}"}
    try:
        data = r.json()
    except Exception:
        return {"network": network_id, "url": post_url, "status": "live",
                "note": "oEmbed answered (unparseable body)"}
    text = data.get("title") or ""
    if network_id == "x":
        # X oEmbed returns blockquote HTML; strip it to the post text.
        html = data.get("html", "")
        m = re.search(r"<p[^>]*>(.*?)</p>", html, re.DOTALL)
        if m:
            text = re.sub(r"<[^>]+>", "", m.group(1)).strip()
    return {"network": network_id, "url": post_url, "status": "live",
            "text": text, "author": data.get("author_name")}


def live_profile(network_id: str, handle: str,
                 instance: str = "mastodon.social") -> dict:
    """One live profile check for a handle, with an honest label.

    Returns a dict with at least {network, handle, status, note} where
    status is live / not-found / login-walled / unavailable.
    """
    net = (network_id or "").lower()
    handle = _norm_handle(handle)
    if net == "bluesky":
        return bluesky_profile(handle)
    if net == "mastodon":
        return mastodon_lookup(handle, instance)
    if net in LOGIN_WALLED:
        return {"network": net, "handle": handle, "status": "login-walled",
                "note": (f"{net} needs a signed-in account for live reads "
                         "— archive only, never scraped")}
    if net in ("x", "youtube", "tiktok"):
        return {"network": net, "handle": handle, "status": "per-post-only",
                "note": (f"{net} has no public profile endpoint — live "
                         "checks run per post via oEmbed; use "
                         "`--export <archive file>` to cross-check "
                         "archived posts against the live site")}
    return {"network": net, "handle": handle, "status": "unavailable",
            "note": f"no live profile check implemented for {net}"}


def live_posts(network_id: str, handle: str,
               instance: str = "mastodon.social",
               limit: int = 10) -> dict:
    """Latest live posts for a handle (Bluesky / Mastodon only —
    the two networks with a free public feed API)."""
    net = (network_id or "").lower()
    if net == "bluesky":
        return bluesky_feed(handle, limit)
    if net == "mastodon":
        result = mastodon_lookup(handle, instance)
        if result.get("status") == "live":
            result["posts"] = result.pop("latest_posts", [])
        return result
    if net == "youtube":
        return {"network": net, "handle": handle, "status": "unavailable",
                "posts": [],
                "note": "YouTube live listing needs a channel id — "
                        "use the channel RSS feed instead"}
    return {"network": net, "handle": handle, "status": "login-walled",
            "posts": [],
            "note": (f"{net} has no free public live feed — archive only")}


def cross_check(export_records: list[dict], network_id: str,
                instance: str = "mastodon.social"
                ) -> tuple[list[dict], int]:
    """Cross-check archived posts against the live site.

    Bluesky/Mastodon: live.py's feed-completeness verdicts (a post
    missing from a *complete* feed is deleted; missing from a
    truncated feed is unknown). X/YouTube/TikTok: oEmbed per URL.
    Everything else: 'unknown' (login-walled) — the archive record
    stands on its own.

    Returns (rows, skipped): one row per distinct post {post_id,
    original_post_url, archived_timestamp, live_status, live_note},
    plus the count of listing/profile rows skipped (no post id —
    checking those would fake "deleted" verdicts).
    """
    net = (network_id or "").lower()
    seen: dict[str, dict] = {}
    skipped = 0
    for r in export_records:
        url = r.get("original_post_url") or ""
        if not url:
            continue
        # Listing/profile rows have no post id (e.g. bare
        # twitter.com/jack/status) — oEmbed 404s on them, which would
        # fake a "deleted" verdict. Skip them, like diff.py does.
        if not r.get("post_id"):
            skipped += 1
            continue
        key = r["post_id"]
        if key not in seen or (r.get("archived_timestamp", "")
                               > seen[key].get("archived_timestamp", "")):
            seen[key] = {"post_id": r["post_id"],
                         "original_post_url": url,
                         "archived_timestamp": r.get("archived_timestamp", "")}
    rows = sorted(seen.values(), key=lambda r: r["archived_timestamp"],
                  reverse=True)
    if not rows:
        return [], skipped

    verdicts: dict[str, dict] = {}
    if net in live_mod.SUPPORTED:
        # Handle from the first URL (bsky.app/profile/<h>/post/… or
        # <instance>/@<h>/<id>); feed verdicts are per post_id.
        first = rows[0]["original_post_url"]
        handle = ""
        m = re.search(r"bsky\.app/profile/([^/]+)/post/", first)
        if m:
            handle = m.group(1)
        else:
            m = re.search(r"/@([^/]+)/", first)
            if m:
                handle = m.group(1)
        if handle:
            info = live_mod.live_check(net, handle, instance)
            verdicts = live_mod.verdicts_from_live(rows, info)
    out = []
    for row in rows:
        url = row["original_post_url"]
        if net in ("x", "youtube", "tiktok"):
            check = oembed_exists(net, url)
            row["live_status"] = check["status"]
            row["live_note"] = check.get("note", "") or check.get("text", "")
        elif net in live_mod.SUPPORTED:
            v = verdicts.get(row["post_id"] or "")
            if v:
                row["live_status"] = v["live_verdict"]
                row["live_note"] = ("live feed verdict "
                                    f"({v['live_checked_at'][:10]})")
            else:
                row["live_status"] = "unknown"
                row["live_note"] = ("live feed did not answer — "
                                    "falling back to the archive record")
        else:
            row["live_status"] = "unknown"
            row["live_note"] = (f"{net} is login-walled — live check not "
                                "possible; the archived snapshot stands")
        out.append(row)
    return out, skipped
