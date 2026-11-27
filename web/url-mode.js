/* Single-post-URL mode (Track K item 2).
 *
 * A pasted post URL searches that one post instead of a whole
 * handle — the network is detected from the link, exactly like the
 * CLI's --url (wayback_social/commands/archive.py). The pattern the
 * search uses is the exact URL — no wildcard, no {id} substitution.
 *
 * Tier rule, verified in wayback_social/plans.py: there is NO
 * feature flag for URL mode (PLAN_FEATURES has no url/single_url
 * entry — the flags are exports, deleted_diff, replay_text,
 * keyword_search, archive_fallbacks, evidence_pack, commercial_use,
 * support). URL mode is a URL-pattern search, not keyword search,
 * so it is NOT gated: every plan can use it, and the only cap that
 * applies is archive_limit (Free 25 / Starter 250 / Pro 2,500 /
 * Studio 25,000 captures per search) — the same cap as a handle
 * search. There is no "needs Pro" dialog for a URL.
 *
 * detectNetwork mirrors the CLI's detect_network
 * (wayback_social/networks.py): host substring match, in the same
 * host order, with the Mastodon fallback (the word "mastodon" in
 * the URL, or a /@handle/<digits> path on any instance).
 *
 * Exposed on window.WS_URL_MODE; console.js calls parsePostUrl()
 * when the #post-url field is non-empty. Loaded before console.js
 * in web/index.html.
 */
(function () {
  "use strict";
  var HOSTS = [
    ["twitter.com", "x"], ["x.com", "x"],
    ["instagram.com", "instagram"], ["facebook.com", "facebook"],
    ["tiktok.com", "tiktok"], ["youtube.com", "youtube"],
    ["youtu.be", "youtube"], ["reddit.com", "reddit"],
    ["linkedin.com", "linkedin"], ["threads.net", "threads"],
    ["bsky.app", "bluesky"], ["pinterest.com", "pinterest"],
    ["tumblr.com", "tumblr"], ["twitch.tv", "twitch"],
    ["medium.com", "medium"],
  ];
  function detectNetwork(url) {
    var low = String(url || "").toLowerCase();
    for (var i = 0; i < HOSTS.length; i++) {
      if (low.indexOf(HOSTS[i][0]) !== -1) return HOSTS[i][1];
    }
    if (low.indexOf("mastodon") !== -1 ||
        /https?:\/\/[^/]+\/@[^/]+\/\d+/.test(low)) return "mastodon";
    return null;
  }
  // Validate a pasted post URL. Returns {url, net} or {error} —
  // the error is shown as-is in #status and NO fetch runs.
  // The URL is normalised like the CLI (trailing slash trimmed).
  function parsePostUrl(raw) {
    var url = String(raw || "").trim();
    if (!url) return { error: "Paste a post URL first." };
    var u;
    try { u = new URL(url); }
    catch (e) {
      return { error: "That doesn't look like a post URL — paste the full link (starting https://) from the post." };
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { error: "That doesn't look like a post URL — paste the full link (starting https://) from the post." };
    }
    var net = detectNetwork(u.href);
    if (!net) {
      return { error: "That link isn't from a network this tool covers (X, Instagram, Facebook, TikTok, YouTube, Reddit, LinkedIn, Threads, Bluesky, Mastodon, Pinterest, Tumblr, Twitch, Medium). Paste a post URL from one of those." };
    }
    return { url: u.href.replace(/\/$/, ""), net: net };
  }
  window.WS_URL_MODE = {
    HOSTS: HOSTS,
    detectNetwork: detectNetwork,
    parsePostUrl: parsePostUrl,
  };
})();
