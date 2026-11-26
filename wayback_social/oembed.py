"""Live-text enrichment: oEmbed first, archived snapshot as fallback.

waybacktweets used Twitter's oEmbed (publish.twitter.com) to recover
the text of tweets that are still live. Generalised:
* networks with a public oEmbed endpoint (X, YouTube, TikTok, Reddit)
  get title/text/author from it;
* everything else falls back to the *archived* snapshot itself
  (web.archive.org/web/<ts>id_/<url>), extracting <title> and
  og:description / twitter:description meta tags.

Both are best-effort. A deleted / login-walled post returns None and
the CDX row is still saved — the archive record is the point, the
live text is a bonus. Keep this module free of network-specific
parsing beyond the oEmbed JSON shape.
"""
from __future__ import annotations

import html as html_mod
import re
import urllib.parse

import requests

HEADERS = {"User-Agent": "wayback-social/1.0"}
TIMEOUT = 15


def _get_json(url: str):
    r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def _strip_html(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"<a[^>]*>|</a>", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    return html_mod.unescape(text).strip()


def fetch_oembed(network, post_url: str) -> dict | None:
    """Return {text, title, author, is_repost} or None."""
    if not network.oembed_template:
        return None
    endpoint = network.oembed_template.format(
        url=urllib.parse.quote(post_url, safe=""))
    try:
        data = _get_json(endpoint)
    except Exception:
        return None
    if network.id == "x":
        # publish.twitter.com returns html blockquote.
        raw = data.get("html", "")
        m = re.search(r"<p[^>]*>(.*?)</p>.*?&mdash; (.*?)</a>", raw, re.DOTALL)
        if not m:
            return None
        author = data.get("author_name", "")
        info = _strip_html(m.group(2))
        author_post = re.match(r"^(.*?)\s*\(", info)
        is_repost = bool(author_post and author_post.group(1) != author)
        return {"text": _strip_html(m.group(1)), "title": None,
                "author": info or author, "is_repost": is_repost}
    # YouTube / TikTok / Reddit oEmbed: title + author_name (+ html).
    title = data.get("title")
    author = data.get("author_name")
    if not title and not author:
        return None
    return {"text": title, "title": title, "author": author, "is_repost": False}


def fetch_snapshot_meta(archived_url: str) -> dict | None:
    """Fetch the archived snapshot (id_ = raw, no Wayback toolbar) and
    pull <title> + description meta. Returns {text, title} or None."""
    try:
        r = requests.get(archived_url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
    except Exception:
        return None
    text = r.text
    if len(text) < 200:
        return None
    title_m = re.search(r"<title[^>]*>(.*?)</title>", text, re.DOTALL | re.IGNORECASE)
    title = _strip_html(title_m.group(1)) if title_m else None
    desc = None
    for prop in ("og:description", "twitter:description", "description"):
        m = re.search(
            rf'<meta[^>]+(?:property|name)=["\']{re.escape(prop)}["\'][^>]+content=["\'](.*?)["\']',
            text, re.DOTALL | re.IGNORECASE)
        if m:
            desc = html_mod.unescape(m.group(1)).strip()
            break
    if not title and not desc:
        return None
    return {"text": desc or title, "title": title, "author": None,
            "is_repost": False}


def enrich(network, post_url: str, archived_url: str) -> dict | None:
    """oEmbed first, snapshot meta second. Returns None if both fail."""
    result = fetch_oembed(network, post_url)
    if result and result.get("text"):
        return result
    return fetch_snapshot_meta(archived_url)
