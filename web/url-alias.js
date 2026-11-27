/* Host-alias normalisation for archive dedup (Track K item 3).
 *
 * The same post is often stored under two hostnames: archive.org
 * kept twitter.com captures for years, while Arquivo.pt (and newer
 * Wayback captures) store the same post under x.com. In Both /
 * multi-source mode the merge step used the exact URL as the dedup
 * key, so one capture rendered twice — once per hostname.
 *
 * The map is deliberately small and host-level only: two hostnames
 * are aliases only when the same path means the same post.
 * twitter.com <-> x.com qualifies (same service, same
 * /<handle>/status/<id> paths). youtu.be vs youtube.com does NOT
 * (different path shapes: youtu.be/<id> vs youtube.com/watch?v=<id>),
 * so it is not mapped — host normalisation alone could not dedupe
 * those. www. is stripped and the host lowercased for every URL.
 *
 * Canonical host is twitter.com: the bulk of the archive predates
 * the 2023 rename, so most stored URLs already use it, and the
 * Wayback rows (which win dedup ties — they run first) carry it.
 *
 * dedupKey(timestamp, url) is the key the merge step uses. Same
 * post under either alias at the same timestamp is one key;
 * different timestamps stay separate captures, so the stats range
 * (earliest..latest) is preserved. If the URL cannot be parsed,
 * the raw string is used — exact-match behaviour, never a crash.
 *
 * Exposed on window.WS_URL_ALIAS; every caller falls back to the
 * exact (timestamp, URL) key if this script failed to load, so a
 * missing file degrades to the old behaviour instead of breaking
 * search. Loaded before console.js in web/index.html.
 */
(function () {
  "use strict";
  var ALIASES = { "x.com": "twitter.com" };
  function canonicalHost(host) {
    var h = String(host || "").toLowerCase();
    if (h.indexOf("www.") === 0) h = h.slice(4);
    return ALIASES[h] || h;
  }
  function canonicalUrl(url) {
    try {
      var u = new URL(String(url));
      u.host = canonicalHost(u.hostname);
      return u.href;
    } catch (e) { return String(url); }
  }
  function dedupKey(timestamp, url) {
    return String(timestamp) + "|" + canonicalUrl(url);
  }
  window.WS_URL_ALIAS = {
    ALIASES: ALIASES,
    canonicalHost: canonicalHost,
    canonicalUrl: canonicalUrl,
    dedupKey: dedupKey,
  };
})();
