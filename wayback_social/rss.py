"""Public RSS/Atom feeds — the free live feed where APIs are walled.

Mastodon, Tumblr, Medium and YouTube channels all publish a public
feed with no key. A feed that answers is 'live'; a feed that does
not answer is 'unavailable' — never 'deleted'.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET

import requests

HEADERS = {"User-Agent": "wayback-social/1.0"}
TIMEOUT = 15


def parse_feed(feed_xml: str, limit: int = 10) -> list[dict]:
    """Parse an RSS/Atom feed into {url, text, created_at} rows."""
    try:
        root = ET.fromstring(feed_xml)
    except ET.ParseError:
        return []
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    posts = []
    for item in root.findall(".//item")[:limit]:
        posts.append({"url": item.findtext("link") or "",
                      "text": (item.findtext("title") or "").strip(),
                      "created_at": item.findtext("pubDate") or ""})
    if posts:
        return posts
    for entry in root.findall("atom:entry", ns)[:limit]:
        link_el = entry.find("atom:link", ns)
        posts.append({"url": link_el.get("href") if link_el is not None else "",
                      "text": (entry.findtext("atom:title", "", ns) or "").strip(),
                      "created_at": (entry.findtext("atom:published", "", ns)
                                     or entry.findtext("atom:updated", "", ns)
                                     or "")})
    return posts


def rss_feed(url: str, limit: int = 10) -> dict:
    """Fetch a public RSS/Atom feed (Mastodon, Tumblr, Medium, YouTube
    channel feeds). Returns posts or an honest failure."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
        text = r.text
    except Exception as e:
        return {"status": "unavailable", "posts": [],
                "note": f"feed did not answer: {e}"}
    posts = parse_feed(text, limit)
    if not posts:
        return {"status": "unavailable", "posts": [],
                "note": "feed answered but no entries parsed"}
    return {"status": "live", "posts": posts}
