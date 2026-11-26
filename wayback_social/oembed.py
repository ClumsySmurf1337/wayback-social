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
from html.parser import HTMLParser

import requests

HEADERS = {"User-Agent": "wayback-social/1.0"}
TIMEOUT = 15


class _VisibleTextParser(HTMLParser):
    """Stdlib-only visible-text extractor for archived replays.

    Collects text inside <p>, <h1-h3>, <article>, <main>, <blockquote>,
    <li>, <td> — the tags that hold post copy on most networks —
    and ignores <script>/<style>/<nav>/<header>/<footer> and the
    Wayback toolbar. JS-heavy replays are often blank shells; that
    returns None honestly instead of inventing text.
    """
    KEEP_TAGS = {"p", "h1", "h2", "h3", "article", "main", "blockquote",
                 "li", "td", "span", "div"}
    SKIP_TAGS = {"script", "style", "nav", "header", "footer", "noscript",
                 "form", "svg", "head"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._skip_depth = 0
        self._chunks: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
        elif tag == "br":
            self._chunks.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
        elif tag in ("p", "h1", "h2", "h3", "li", "blockquote", "article"):
            self._chunks.append("\n")

    def handle_data(self, data):
        if self._skip_depth:
            return
        text = data.strip()
        if text:
            self._chunks.append(text + " ")

    def text(self, max_chars: int = 2000) -> str | None:
        joined = "".join(self._chunks)
        # Strip the Wayback toolbar phrase in place (it shares a line
        # with post text in the raw HTML, so dropping the whole line
        # would eat the post itself).
        joined = re.sub(r"(?i)\bwayback machine( toolbar)?\b", "", joined)
        # Collapse whitespace; drop toolbar / cookie boilerplate lines.
        lines = [re.sub(r"\s+", " ", ln).strip() for ln in joined.split("\n")]
        lines = [ln for ln in lines if ln and not ln.lower().startswith(
            ("save page now", "go to the wayback", "the wayback machine"))]
        out = "\n".join(lines).strip()
        return out[:max_chars] if out else None


def extract_visible_text(html_text: str, max_chars: int = 2000) -> str | None:
    """Visible text from a replay HTML document (stdlib only)."""
    parser = _VisibleTextParser()
    try:
        parser.feed(html_text)
    except Exception:
        return None
    return parser.text(max_chars=max_chars)


def fetch_replay_text(post_url: str, timestamp: str) -> dict | None:
    """Fetch the raw replay (``id_`` = no Wayback toolbar) and pull the
    visible post text out of it. Returns {text, title} or None.

    This is the third fallback in enrich(): oEmbed (live, public) ->
    snapshot <title>/og:description -> full visible text. JS-heavy
    snapshots (Instagram, TikTok) often return blank shells; None
    there is an honest "no text recovered", not a failure.
    """
    replay = f"https://web.archive.org/web/{timestamp}id_/{post_url}"
    try:
        r = requests.get(replay, headers=HEADERS, timeout=TIMEOUT)
        r.raise_for_status()
    except Exception:
        return None
    text = extract_visible_text(r.text)
    if not text:
        return None
    title_m = re.search(r"<title[^>]*>(.*?)</title>", r.text,
                        re.DOTALL | re.IGNORECASE)
    title = _strip_html(title_m.group(1)) if title_m else None
    return {"text": text, "title": title, "author": None, "is_repost": False}


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
    """oEmbed first, snapshot meta second, replay visible text third.
    Returns None if all three fail."""
    result = fetch_oembed(network, post_url)
    if result and result.get("text"):
        return result
    result = fetch_snapshot_meta(archived_url)
    if result and result.get("text"):
        return result
    # archived_url looks like .../web/<ts>id_/<original> — pull the ts.
    m = re.search(r"/web/(\d{14})id_/", archived_url)
    if m:
        return fetch_replay_text(post_url, m.group(1))
    return None
