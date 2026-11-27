"""Live checks via public, no-auth APIs (v1.4) — Bluesky + Mastodon.

These are the two clean live sources from docs/data-sources.md: both
have public endpoints that need no key and no account, and both give
the deleted-diff its sharpest signal — a live author feed to compare
against archived post IDs.

Honest verdicts, as in diff.py: a post found in the live feed is
``live``; a post missing from a *complete* feed (the feed returned
fewer posts than the page limit, so nothing was cut off) is
``deleted``; a post missing from a *truncated* feed is ``unknown``
(it may just be older than the window we fetched). A profile lookup
that 404s means the account itself is gone — every post is
``deleted``; a lookup that errors (network, 5xx) falls back to the
per-URL HEAD check in diff.py instead of guessing.

Bluesky post IDs are the rkey in at://did/app.bsky.feed.post/<rkey>,
which matches the /post/<rkey> in bsky.app URLs and the CDX post_id
regex. Mastodon post IDs are the numeric status IDs, matching the
/@user/<id> in Mastodon URLs and the CDX post_id regex.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

import requests

HEADERS = {"User-Agent": "wayback-social/1.0"}
TIMEOUT = 15
BSKY_API = "https://public.api.bsky.app/xrpc"
FEED_LIMIT = 100

SUPPORTED = ("bluesky", "mastodon")


def _stamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _get_json(url: str, params: dict | None = None):
    r = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
    return r.status_code, r.json() if r.headers.get("content-type", "").startswith(
        "application/json") else None


# --- Bluesky ---------------------------------------------------------------

def bluesky_profile(actor: str) -> dict:
    """Public profile: {did, handle, display_name, posts_count, status}.

    status is "found" / "not_found" (404) / "error" (anything else).
    """
    try:
        code, data = _get_json(f"{BSKY_API}/app.bsky.actor.getProfile",
                               {"actor": actor})
    except Exception as exc:
        return {"status": "error", "error": str(exc)[:120]}
    if code == 404:
        return {"status": "not_found"}
    if code != 200 or not data:
        return {"status": "error", "error": f"HTTP {code}"}
    return {"status": "found", "did": data.get("did", ""),
            "handle": data.get("handle", actor),
            "display_name": data.get("displayName", ""),
            "posts_count": data.get("postsCount", 0)}


def bluesky_author_feed(actor: str, limit: int = FEED_LIMIT) -> tuple[list[dict], bool]:
    """Live author feed: ([{post_id, uri, url, text, created_at}], complete).

    complete is True when the API returned fewer posts than the limit
    — nothing was cut off, so a missing post really is gone. Paginates
    with a cursor up to ``limit`` posts.
    """
    posts: list[dict] = []
    cursor = None
    while len(posts) < limit:
        params = {"actor": actor, "limit": min(100, limit - len(posts))}
        if cursor:
            params["cursor"] = cursor
        try:
            code, data = _get_json(f"{BSKY_API}/app.bsky.feed.getAuthorFeed", params)
        except Exception:
            break
        if code != 200 or not data:
            break
        for item in data.get("feed", []):
            post = item.get("post", {})
            uri = post.get("uri", "")
            m = re.search(r"/app\.bsky\.feed\.post/([a-z0-9]+)$", uri)
            if not m:
                continue
            rec = post.get("record", {})
            # The feed includes reposts: the URL must use the post's
            # own author handle, not the feed owner (actor).
            handle = post.get("author", {}).get("handle") or actor
            posts.append({"post_id": m.group(1), "uri": uri,
                          "url": f"https://bsky.app/profile/{handle}/post/{m.group(1)}",
                          "text": rec.get("text", ""),
                          "created_at": rec.get("createdAt", "")})
        cursor = data.get("cursor")
        if not cursor:
            break
    complete = len(posts) < limit
    return posts, complete


# --- Mastodon --------------------------------------------------------------

def mastodon_lookup(instance: str, acct: str) -> dict:
    """Public account lookup: {id, username, statuses_count, created_at, status}."""
    try:
        code, data = _get_json(
            f"https://{instance}/api/v1/accounts/lookup", {"acct": acct})
    except Exception as exc:
        return {"status": "error", "error": str(exc)[:120]}
    if code == 404:
        return {"status": "not_found"}
    if code != 200 or not data:
        return {"status": "error", "error": f"HTTP {code}"}
    return {"status": "found", "id": str(data.get("id", "")),
            "username": data.get("username", acct),
            "statuses_count": data.get("statuses_count", 0),
            "created_at": data.get("created_at", "")}


def mastodon_statuses(instance: str, account_id: str,
                      limit: int = FEED_LIMIT) -> tuple[list[dict], bool]:
    """Live statuses: ([{post_id, url, created_at, text}], complete).

    Pages through /api/v1/accounts/:id/statuses (40/page max) up to
    ``limit``. complete is True when fewer than ``limit`` came back.
    """
    posts: list[dict] = []
    max_id = None
    while len(posts) < limit:
        params = {"limit": min(40, limit - len(posts))}
        if max_id:
            params["max_id"] = max_id
        try:
            code, data = _get_json(
                f"https://{instance}/api/v1/accounts/{account_id}/statuses", params)
        except Exception:
            break
        if code != 200 or not data:
            break
        for s in data:
            text = re.sub(r"<[^>]+>", "", s.get("content", "") or "")
            posts.append({"post_id": str(s.get("id", "")),
                          "url": s.get("url", ""),
                          "created_at": s.get("created_at", ""),
                          "text": text.strip()[:500]})
        if len(data) < params["limit"]:
            break
        max_id = data[-1].get("id")
        if not max_id:
            break
    complete = len(posts) < limit
    return posts, complete


def handle_from_url(network: str, url: str,
                    instance: str = "mastodon.social") -> tuple[str, str]:
    """Handle (+ instance) for live checks, from a full post URL.

    ``diff --url`` and ``archive --url`` pass the whole URL as the
    identifier; the live APIs need the handle instead. Mastodon:
    https://<instance>/@<user>/<id> -> (user, instance). Bluesky:
    https://bsky.app/profile/<handle>/post/<rkey> -> (handle, instance).
    Anything unparseable returns the URL unchanged (the lookup will
    404 honestly, not silently).
    """
    if network == "mastodon":
        m = re.search(r"https?://([^/]+)/@([^/]+)/", url or "")
        if m:
            return m.group(2), m.group(1)
    if network == "bluesky":
        m = re.search(r"https?://bsky\.app/profile/([^/]+)/post/", url or "")
        if m:
            return m.group(1), instance
    return url, instance


# --- Generic entry point ---------------------------------------------------

def live_check(network: str, identifier: str,
               instance: str = "mastodon.social",
               limit: int = FEED_LIMIT) -> dict:
    """Live state of one handle on Bluesky or Mastodon.

    Returns {network, identifier, profile_status, post_count,
    latest_post_date, live_post_ids, complete, checked_at, source,
    error}. ``profile_status`` is found / not_found / error /
    unsupported. Only bluesky + mastodon are supported — every other
    network returns profile_status "unsupported" (use oEmbed / HEAD).
    """
    checked_at = _stamp()
    base = {"network": network, "identifier": identifier,
            "profile_status": "unsupported", "post_count": 0,
            "latest_post_date": "", "live_post_ids": [],
            "complete": False, "checked_at": checked_at,
            "source": "live API", "error": ""}
    if network == "bluesky":
        prof = bluesky_profile(identifier)
        base["profile_status"] = prof["status"]
        if prof["status"] == "found":
            base["post_count"] = prof.get("posts_count", 0)
            posts, complete = bluesky_author_feed(identifier, limit)
            base["live_post_ids"] = sorted(p["post_id"] for p in posts)
            base["complete"] = complete
            base["latest_post_date"] = max(
                (p["created_at"] for p in posts), default="")
        elif prof["status"] == "error":
            base["error"] = prof.get("error", "")
        return base
    if network == "mastodon":
        acct = identifier if "@" in identifier else f"{identifier}@{instance}"
        look = mastodon_lookup(instance, acct)
        base["profile_status"] = look["status"]
        if look["status"] == "found":
            base["post_count"] = look.get("statuses_count", 0)
            posts, complete = mastodon_statuses(instance, look["id"], limit)
            base["live_post_ids"] = sorted(p["post_id"] for p in posts)
            base["complete"] = complete
            base["latest_post_date"] = max(
                (p["created_at"] for p in posts), default="")
        elif look["status"] == "error":
            base["error"] = look.get("error", "")
        return base
    base["error"] = (f"live checks are only supported for bluesky and "
                     f"mastodon, not {network} — use oEmbed / HEAD checks")
    return base


def verdicts_from_live(records: list[dict], live: dict) -> dict[str, dict]:
    """Per-post live verdicts from one live_check() result.

    Returns {post_id: {live_verdict, live_http_status, live_final_url,
    live_checked_at}}. A missing post is "deleted" only when the feed
    was complete or the profile itself is gone; otherwise "unknown".
    A lookup error returns {} — the caller falls back to HEAD checks.
    """
    if live.get("profile_status") == "error":
        return {}
    if live.get("profile_status") == "unsupported":
        return {}
    live_ids = set(live.get("live_post_ids", []))
    complete = bool(live.get("complete"))
    gone = live.get("profile_status") == "not_found"
    out: dict[str, dict] = {}
    for r in records:
        pid = r.get("post_id") or ""
        if not pid:
            continue
        if pid in live_ids:
            verdict = "live"
        elif gone or complete:
            verdict = "deleted"
        else:
            verdict = "unknown"
        out[pid] = {"live_verdict": verdict, "live_http_status": "",
                    "live_final_url": r.get("original_post_url", ""),
                    "live_checked_at": live.get("checked_at", "")}
    return out
