// Common Crawl as a web source — client side.
//
// This file mirrors web/arquivo.js. It adds Common Crawl (the
// fourth archive source) to the web console's multi-source search.
// The index is slow and flaky by design — Track B proved the
// async flow end-to-end (queue -> 504 -> retry -> done, 134
// captures for example.com) — so the Function retries inside one
// call (3 attempts, 15s each, backoff 2s/8s, worst ~55s), and the
// client gives it the same SearchJob machinery as the Arquivo
// path: progress, Pause/Stop/Resume, and the shared 120s bound.
// An index that never answers is reported honestly — "Common
// Crawl index didn't answer in time" — never fake rows.
//
// THE INDEX HAS NO REPLAY URL. A Common Crawl capture is a WARC
// record, not a browsable snapshot: the archive link for a row
// points at the index record itself
// (index.commoncrawl.org/<crawl>-index?url=...), honestly
// labelled in the UI. Never link a Wayback capture that may not
// exist.
//
// THE `url` PARAM: the console's per-handle patterns carry a
// trailing `/*`. The index does NOT want the `*` — with
// matchType=prefix the prefix is the URL without the wildcard
// (verified live 2026-11-27: `url=example.com/*&matchType=prefix`
// -> 404, `url=example.com&matchType=prefix` -> 200). The
// Function strips it; the client passes patterns through
// unchanged.
//
// Rows are the CDX-array shape plus the Common-Crawl-only 8th
// column: the crawl id (e.g. CC-MAIN-2026-47), which rides into
// the index-record link.
//
// Node test: web/commoncrawl.test.js (same vm harness as
// web/arquivo.test.js).
(function () {
  "use strict";

  var FETCH_TIMEOUT_MS = 120_000;

  function commoncrawlBase(cfg) {
    // Proxy-only: the index is a JSON API the client could in
    // theory call directly, but it is slow, flaky, and gives no
    // CORS guarantees — every call goes through the server proxy
    // (/api/commoncrawl, functions/api/commoncrawl.js), which
    // retries with backoff. When the config has no proxy, there
    // is no Common Crawl source at all.
    return (cfg && cfg.COMMONCRAWL_PROXY) || "";
  }

  // The crawl id the console queries by default. This must match
  // the Function's default (functions/api/commoncrawl.js
  // DEFAULT_CRAWL) and the CLI's (wayback_social/cc_jobs.py
  // DEFAULT_CRAWL); scripts/sync_config.py checks the three
  // agree.
  function commoncrawlCrawl(cfg) {
    return (cfg && cfg.CC_CRAWL) || "CC-MAIN-2026-47";
  }

  // The per-handle Common Crawl prefix for a network. Every
  // network the console supports has a CC prefix — the index
  // answers URL-prefix queries for any host, so unlike
  // Ghostarchive there is no per-network support table. A 404
  // from the index ("no captures for this URL") is an honest
  // empty, not a failure.
  function commoncrawlPattern(handle, net) {
    var h = String(handle || "").replace(/^@/, "");
    if (!h) return null;
    var map = {
      x: "twitter.com/" + h + "/status/",
      instagram: "instagram.com/" + h + "/",
      facebook: "facebook.com/" + h + "/",
      tiktok: "tiktok.com/@" + h + "/video/",
      youtube: "youtube.com/@" + h + "/",
      reddit: "reddit.com/user/" + h + "/",
      linkedin: "linkedin.com/in/" + h + "/",
      threads: "threads.net/@" + h + "/",
      bluesky: "bsky.app/profile/" + h + "/post/",
      mastodon: "mastodon.social/@" + h + "/",
      pinterest: "pinterest.com/" + h + "/",
      tumblr: h + ".tumblr.com/",
      twitch: "twitch.tv/" + h + "/",
      medium: "medium.com/@" + h + "/",
    };
    var p = map[net];
    if (!p) return null;
    return p + "*";
  }

  // The per-handle CDX patterns — the console's search() gate
  // uses this (null = no listing for this network). Unlike
  // Ghostarchive/Arquivo.pt, every supported network has one.
  // Derived from commoncrawlPattern with the {id} placeholder
  // (one map, not two — the pattern IS the prefix + "*").
  function patternsFor(net) {
    var p = commoncrawlPattern("{id}", net);
    return p ? [p] : null;
  }

  // The archive link for a Common Crawl row: the index record
  // itself (there is no replay URL). `extra` is the crawl id
  // from the row's 8th column; without it, the default crawl.
  // Any other source falls back to the Wayback link (console.js
  // dispatches by source, so this branch only fires when the
  // module is called directly).
  function archiveLink(source, ts, orig, extra) {
    if (source === "commoncrawl") {
      var crawl = extra || "CC-MAIN-2026-47";
      return "https://index.commoncrawl.org/" + crawl + "-index?url=" +
        encodeURIComponent(orig || "") + "&output=json";
    }
    return "https://web.archive.org/web/" + (ts || "") + "/" + (orig || "");
  }

  // A /api/commoncrawl response body (CDX-array JSON) -> rows.
  // The header row is dropped, short rows are skipped, every row
  // is tagged with its source.
  function parseCommoncrawlCdxArray(data, source) {
    if (!Array.isArray(data) || data.length < 1) return [];
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if (!Array.isArray(r) || r.length < 7) continue;
      rows.push([r[0], r[1], r[2], r[3] || "", r[4] || "", r[5] || "", r[6] || "", r[7] || "", source]);
    }
    return rows;
  }

  function inCommoncrawlRange(ts, from, to) {
    var d = String(ts || "").slice(0, 8);
    if (!d) return !(from || to);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  function commoncrawlErrorText(status, error) {
    if (status === 504) return "Common Crawl index didn't answer in time — try again.";
    if (status === 502) return "Common Crawl index didn't answer — try again.";
    if (status === 429) return "Common Crawl index is rate-limiting us — try again in a minute.";
    return (error || "Common Crawl index didn't answer — try again.");
  }

  // The proxy URL for one Common Crawl fetch. Proxy-only (see
  // commoncrawlBase). The Turnstile token rides along — the
  // Function verifies it server-side (same as arquivoUrl).
  function commoncrawlUrl(opts) {
    // cfg is console.js's global (this file loads after it, same
    // as arquivo.js) — the proxy path + crawl id come from
    // web/config.js.
    var base = commoncrawlBase(cfg);
    var u = new URL(base, location.href);
    u.searchParams.set("url", opts.pattern.replace("{id}", opts.handle));
    u.searchParams.set("limit", String(opts.limit));
    u.searchParams.set("crawl", commoncrawlCrawl(cfg));
    if (opts.from) u.searchParams.set("from", opts.from);
    if (opts.to) u.searchParams.set("to", opts.to);
    if (typeof window !== "undefined" && window.WS_TURNSTILE) {
      var t = window.WS_TURNSTILE.currentToken();
      if (t) {
        u.searchParams.set("cf-turnstile-response", t.token);
        if (t.idem) u.searchParams.set("cf-turnstile-idem", t.idem);
      }
    }
    return u;
  }

  // One Common Crawl fetch. opts: {pattern, handle, limit, from,
  // to}. Returns CDX-array rows, range-filtered. Throws on HTTP
  // error or an unexpected answer — the caller counts failures
  // instead of silently skipping them (same contract as
  // console.js fetchPattern). A 404 from the index is an honest
  // empty (the Function already answers it as header-only 200),
  // so it never throws here.
  async function fetchCommoncrawl(opts, signal) {
    var url = commoncrawlUrl(opts);
    var res = await fetch(url.toString(), signal ? { signal: signal } : undefined);
    if (!res.ok) {
      var error = "";
      try { error = (await res.json()).error || ""; } catch (e) {}
      throw new Error(commoncrawlErrorText(res.status, error));
    }
    var rows = parseCommoncrawlCdxArray(await res.json(), "commoncrawl");
    return rows.filter(function (r) {
      return inCommoncrawlRange(r[1], opts.from, opts.to);
    });
  }

  // fetchCommoncrawl with the same 120s stall bound as the other
  // paths. Mirrors arquivo.js fetchArquivoTimed: a stall throws a
  // distinct TimeoutError (not AbortError), a real Stop still
  // propagates as AbortError. The Function's worst case is ~55s,
  // inside this bound. The timeout is injectable for tests via
  // window.WS_FETCH_TIMEOUT_MS.
  async function fetchCommoncrawlTimed(opts, signal, timeoutMs) {
    var ms = typeof timeoutMs === "number" ? timeoutMs : FETCH_TIMEOUT_MS;
    var ctrl = new AbortController();
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, ms);
    var onAbort = function () { ctrl.abort(); };
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    try {
      return await fetchCommoncrawl(opts, ctrl.signal);
    } catch (e) {
      if (timedOut && e && e.name === "AbortError") {
        var err = new Error("Common Crawl fetch timed out after " + Math.round(ms / 1000) + "s");
        err.name = "TimeoutError";
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  }

  function timedMs() {
    return (typeof window !== "undefined" && typeof window.WS_FETCH_TIMEOUT_MS === "number")
      ? window.WS_FETCH_TIMEOUT_MS : undefined;
  }

  // SearchJob steps for a Common Crawl search. ctx: {net, id,
  // limit, from, to, addRow, urlPattern} — addRow(row,
  // "commoncrawl") dedupes against the other archives' rows and
  // counts per source (the caller owns the shared rows list).
  // URL mode is one step for the exact URL; otherwise one step
  // per Common Crawl pattern (usually one).
  function commoncrawlSteps(ctx) {
    var steps = [];
    if (ctx.urlPattern) {
      steps.push({
        label: "Common Crawl — this post",
        run: async function (signal) {
          var rows = await fetchCommoncrawlTimed(
            { pattern: ctx.urlPattern, handle: ctx.id,
              limit: ctx.limit, from: ctx.from, to: ctx.to },
            signal, timedMs());
          var out = [];
          for (var j = 0; j < rows.length; j++) {
            if (ctx.addRow(rows[j], "commoncrawl")) out.push(rows[j]);
          }
          return out;
        },
      });
      return steps;
    }
    var patterns = patternsFor(ctx.net) || [];
    patterns.forEach(function (pat, i) {
      steps.push({
        label: "Common Crawl — pattern " + (i + 1) + "/" + patterns.length,
        run: async function (signal) {
          var rows = await fetchCommoncrawlTimed(
            { pattern: pat, handle: ctx.id,
              limit: ctx.limit, from: ctx.from, to: ctx.to },
            signal, timedMs());
          var out = [];
          for (var j = 0; j < rows.length; j++) {
            if (ctx.addRow(rows[j], "commoncrawl")) out.push(rows[j]);
          }
          return out;
        },
      });
    });
    return steps;
  }

  var api = {
    commoncrawlBase: commoncrawlBase,
    commoncrawlCrawl: commoncrawlCrawl,
    commoncrawlPattern: commoncrawlPattern,
    patternsFor: patternsFor,
    archiveLink: archiveLink,
    parseCommoncrawlCdxArray: parseCommoncrawlCdxArray,
    inCommoncrawlRange: inCommoncrawlRange,
    commoncrawlErrorText: commoncrawlErrorText,
    commoncrawlUrl: commoncrawlUrl,
    fetchCommoncrawl: fetchCommoncrawl,
    fetchCommoncrawlTimed: fetchCommoncrawlTimed,
    commoncrawlSteps: commoncrawlSteps,
    FETCH_TIMEOUT_MS: FETCH_TIMEOUT_MS,
  };

  if (typeof window !== "undefined") {
    window.WS_COMMONCRAWL = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
