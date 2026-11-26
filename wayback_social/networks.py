"""Network registry: one definition per social network.

Each network knows how to turn a handle/identifier into Wayback CDX
``url`` patterns, how to pull a post id out of a URL, and where (if
anywhere) to fetch live text/title via oEmbed.

Honest coverage notes — Wayback archiving is uneven:
* good:    X, Reddit, Bluesky, Mastodon — post URLs embed the user.
* moderate: Instagram, Facebook, TikTok, Threads, YouTube, Tumblr,
  Twitch — archived, but JS / login walls mean many snapshots are
  shells, and some post URLs don't embed the owner.
* poor:    LinkedIn, Pinterest, Medium — thin / login-walled archive.

For networks where a post URL does NOT contain the username
(YouTube watch URLs, Instagram /p/ codes, Pinterest pins), a
per-user listing via CDX is incomplete by construction. Use
``--url <full post url>`` for those, or accept profile snapshots.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class Network:
    id: str
    name: str
    aliases: list[str] = field(default_factory=list)
    identifier_label: str = "username"
    # Callables take the identifier and return CDX `url` patterns.
    patterns: list[str] = field(default_factory=list)
    post_id_regexes: list[str] = field(default_factory=list)
    oembed_template: str | None = None  # "{url}" -> oEmbed endpoint
    coverage: str = "moderate"
    notes: str = ""
    needs_instance: bool = False
    # Extra CDX patterns that need a second identifier (e.g. instance).
    instance_patterns: list[str] = field(default_factory=list)

    def cdx_urls(self, identifier: str, instance: str | None = None) -> list[str]:
        ident = identifier.lstrip("@")
        urls = [p.format(id=ident, instance=instance or "") for p in self.patterns]
        if self.needs_instance and instance:
            urls += [
                p.format(id=ident, instance=instance.rstrip("/"))
                for p in self.instance_patterns
            ]
        # De-duplicate, keep order.
        return list(dict.fromkeys(urls))

    def post_id(self, url: str) -> str | None:
        for rx in self.post_id_regexes:
            m = re.search(rx, url)
            if m:
                return m.group(1)
        return None


def _n(id_, name, **kw):
    return Network(id=id_, name=name, **kw)


NETWORKS: list[Network] = [
    _n("x", "X / Twitter", aliases=["twitter"],
       patterns=["https://twitter.com/{id}/status/*",
                 "https://x.com/{id}/status/*"],
       post_id_regexes=[r"/status/(\d+)"],
       oembed_template="https://publish.twitter.com/oembed?url={url}",
       coverage="good",
       notes="Best-archived network. twitter.com + x.com both queried and merged."),
    _n("instagram", "Instagram", aliases=["ig"],
       patterns=["https://www.instagram.com/{id}/p/*",
                 "https://www.instagram.com/{id}/reel/*",
                 "https://www.instagram.com/{id}/*"],
       post_id_regexes=[r"/p/([A-Za-z0-9_-]+)", r"/reel/([A-Za-z0-9_-]+)"],
       coverage="moderate",
       notes="Many snapshots are login shells. Post URLs (/p/<code>) do not "
             "embed the username, so per-user CDX is incomplete; use --url "
             "for a specific post."),
    _n("facebook", "Facebook", aliases=["fb"],
       patterns=["https://www.facebook.com/{id}/posts/*",
                 "https://www.facebook.com/{id}/*"],
       post_id_regexes=[r"/posts/(pfbid[0-9A-Za-z]+|\d+)",
                        r"/photo\.php\?fbid=(\d+)", r"/videos/(\d+)"],
       coverage="moderate",
       notes="Login-walled; most snapshots are shells. /posts/ URLs embed the user."),
    _n("tiktok", "TikTok", aliases=["tt"],
       patterns=["https://www.tiktok.com/@{id}/video/*"],
       post_id_regexes=[r"/video/(\d+)"],
       oembed_template="https://www.tiktok.com/oembed?url={url}",
       coverage="moderate",
       notes="Video URLs embed @user. JS-heavy snapshots often have no text."),
    _n("youtube", "YouTube", aliases=["yt"],
       patterns=["https://www.youtube.com/@{id}/*",
                 "https://www.youtube.com/channel/{id}/*",
                 "https://www.youtube.com/c/{id}/*",
                 "https://www.youtube.com/user/{id}/*"],
       post_id_regexes=[r"[?&]v=([A-Za-z0-9_-]{11})",
                        r"/shorts/([A-Za-z0-9_-]+)", r"/live/([A-Za-z0-9_-]+)"],
       oembed_template="https://www.youtube.com/oembed?url={url}&format=json",
       coverage="moderate",
       notes="Watch URLs (watch?v=) do NOT embed the channel, so a per-channel "
             "video list via CDX is incomplete. These patterns return channel "
             "page snapshots; use --url for a specific video/short."),
    _n("reddit", "Reddit", aliases=["rd"],
       patterns=["https://www.reddit.com/user/{id}/*",
                 "https://old.reddit.com/user/{id}/*"],
       post_id_regexes=[r"/comments/([a-z0-9]+)", r"/user/[^/]+/comments/([a-z0-9]+)"],
       oembed_template="https://www.reddit.com/oembed?url={url}",
       coverage="good",
       notes="Use identifier r/<subreddit> to archive a subreddit instead: "
             "reddit.com/r/<sub>/*."),
    _n("linkedin", "LinkedIn", aliases=["li"],
       patterns=["https://www.linkedin.com/in/{id}/*",
                 "https://www.linkedin.com/posts/{id}*"],
       post_id_regexes=[r"/posts/.*?_(\d+)", r"/posts/([A-Za-z0-9_-]+)"],
       coverage="poor",
       notes="Heavily login-walled; expect profile snapshots, rarely post text."),
    _n("threads", "Threads",
       patterns=["https://www.threads.net/@{id}/post/*",
                 "https://www.threads.net/@{id}/*"],
       post_id_regexes=[r"/post/([A-Za-z0-9_-]+)"],
       coverage="moderate",
       notes="Post URLs embed @user. JS app — snapshots are often shells."),
    _n("bluesky", "Bluesky", aliases=["bsky"],
       patterns=["https://bsky.app/profile/{id}/post/*"],
       post_id_regexes=[r"/post/([a-z0-9]+)"],
       coverage="good",
       notes="Identifier is handle (alice.bsky.social) or DID. Post URLs embed it."),
    _n("mastodon", "Mastodon", aliases=["masto"], needs_instance=True,
       identifier_label="username (with --instance)",
       instance_patterns=["https://{instance}/@{id}/*"],
       post_id_regexes=[r"/@[^/]+/(\d+)"],
       coverage="good",
       notes="Needs --instance, e.g. mastodon.social. Default instance is "
             "mastodon.social if omitted."),
    _n("pinterest", "Pinterest", aliases=["pin"],
       patterns=["https://www.pinterest.com/{id}/*"],
       post_id_regexes=[r"/pin/(\d+)"],
       coverage="poor",
       notes="Pin URLs (/pin/<id>) do not embed the user; per-user CDX returns "
             "profile/board snapshots. Use --url for a specific pin."),
    _n("tumblr", "Tumblr",
       patterns=["https://{id}.tumblr.com/post/*",
                 "https://www.tumblr.com/{id}/*"],
       post_id_regexes=[r"/post/(\d+)"],
       coverage="moderate",
       notes="Identifier is the blog name: <blog>.tumblr.com."),
    _n("twitch", "Twitch",
       patterns=["https://www.twitch.tv/{id}/*"],
       post_id_regexes=[r"/videos/(\d+)", r"/clip/([A-Za-z0-9_-]+)"],
       coverage="moderate",
       notes="Channel snapshots + /videos/<id> VODs. Live pages rarely archive usefully."),
    _n("medium", "Medium",
       patterns=["https://medium.com/@{id}/*"],
       post_id_regexes=[r"/@[^/]+/([a-z0-9-]+-[a-f0-9]{12})"],
       coverage="poor",
       notes="Post slugs embed a hash, not a clean id. CDX returns article snapshots."),
]

_BY_ID = {n.id: n for n in NETWORKS}
_BY_ALIAS = {a: n for n in NETWORKS for a in n.aliases}


def get_network(name: str) -> Network | None:
    key = name.strip().lower()
    return _BY_ID.get(key) or _BY_ALIAS.get(key)


def list_networks() -> list[Network]:
    return list(NETWORKS)


def detect_network(url: str) -> Network | None:
    """Guess the network from a full post/profile URL."""
    low = url.lower()
    for n in NETWORKS:
        for host in ("twitter.com", "x.com", "instagram.com", "facebook.com",
                     "tiktok.com", "youtube.com", "youtu.be", "reddit.com",
                     "linkedin.com", "threads.net", "bsky.app",
                     "pinterest.com", "tumblr.com", "twitch.tv", "medium.com"):
            if host in low:
                # Map host -> network id
                mapping = {"twitter.com": "x", "x.com": "x",
                           "instagram.com": "instagram", "facebook.com": "facebook",
                           "tiktok.com": "tiktok", "youtube.com": "youtube",
                           "youtu.be": "youtube", "reddit.com": "reddit",
                           "linkedin.com": "linkedin", "threads.net": "threads",
                           "bsky.app": "bluesky", "pinterest.com": "pinterest",
                           "tumblr.com": "tumblr", "twitch.tv": "twitch",
                           "medium.com": "medium"}
                return _BY_ID[mapping[host]]
    if "mastodon" in low or re.search(r"https?://[^/]+/@[^/]+/\d+", low):
        return _BY_ID["mastodon"]
    return None
