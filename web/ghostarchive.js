// Ghostarchive as a web source — client side.
//
// This file mirrors web/arquivo.js. It adds Ghostarchive (the
// third archive source) to the web console's multi-source search.
// Ghostarchive has no API — its own site sends no CORS headers —
// so the console NEVER fetches ghostarchive.org directly. Every
// call goes through the server proxy (/api/ghostarchive,
// functions/api/ghostarchive.js), which scrapes the search page
// and returns CDX-array rows.
//
// Patterns (wayback_social/archives.py GHOSTARCHIVE_PATTERNS):
// X and Bluesky only. Mastodon / Instagram / TikTok prefixes
// redirect to Ghostarchive's video search (/vidsearch), which has
// no results table — so those networks have no per-handle
// Ghostarchive listing and the console says so honestly (the
// search() gate in console.js, same shape as the Arquivo.pt one).
//
// DATES: Ghostarchive dates come from the results table (the
// Function parses them server-side). A row with no parsable date
// keeps an empty timestamp — never faked. When a date range is
// given, undated rows are dropped server-side (they cannot be
// proven in range). Same rule as the CLI.
//
// COVERAGE: Ghostarchive coverage is uneven by network — it holds
// captures Wayback and Arquivo.pt missed, and misses plenty they
// hold. An empty result here is an honest "not in this archive",
// never a bug. Honest-limits copy lives in web/index.html and in
// arquivo.js syncSourceUI.
//
// Rows are the CDX-array shape plus the Ghostarchive-only 8th
// column: the /archive/<id> id (see archiveLink below — a
// Ghostarchive snapshot link cannot be built from (timestamp,
// URL) the way Wayback/Arquivo.pt links can).
//
// Node test: web/ghostarchive.test.js (same vm harness as
// web/arquivo.test.js).
(function () {
  "use strict";

  var FETCH_TIMEOUT_MS = 120_000;

  function ghostarchiveBase(cfg) {
    // Proxy-only: ghostarchive.org sends no CORS headers, so there
    // is no direct mode (unlike Arquivo.pt's dual mode). When the
    // config has no proxy, there is no Ghostarchive source at all.
    return (cfg && cfg.GHOSTARCHIVE_PROXY) || "";
  }

  // The per-handle Ghostarchive search prefix for a network.
  // Returns null when this network has no Ghostarchive listing.
  function ghostarchivePattern(handle, net) {
    var h = String(handle || "").replace(/^@/, "");
    if (!h) return null;
    if (net === "x") return "twitter.com/" + h + "/status/";
    if (net === "bluesky") return "bsky.app/profile/" + h + "/post/";
    return null;
  }

  // The per-handle search terms — the console's search() gate
  // uses this (null = no listing for this network). Derived from
  // ghostarchivePattern with the {id} placeholder (one map, not
  // two). NOTE: no trailing "*" — Ghostarchive search treats the
  // term as a prefix already (verified live 2026-11-27:
  // "twitter.com/jack/status/" → 14 links); a "*" would be sent
  // through to the search page untested.
  function patternsFor(net) {
    var p = ghostarchivePattern("{id}", net);
    return p ? [p] : null;
  }

  // True when Ghostarchive returns a usable snapshot link for a
  // row: the row must carry the archive id in column 7.
  function ghostarchiveHasLink(row) {
    return !!(row && row[7]);
  }

  // The archive link for a Ghostarchive row. Fallback (no archive
  // id — only a pre-Track-L or hand-built row): the Ghostarchive
  // search page for the post, which is at least a real page that
  // shows what Ghostarchive holds. Any other source falls back to
  // the Wayback link (console.js dispatches by source, so this
  // branch only fires when the module is called directly).
  function archiveLink(source, ts, orig, extra) {
    if (source === "ghostarchive") {
      if (extra) return "https://ghostarchive.org/archive/" + extra;
      return "https://ghostarchive.org/search?term=" + encodeURIComponent(orig || "");
    }
    return "https://web.archive.org/web/" + (ts || "") + "/" + (orig || "");
  }

  // A /api/ghostarchive response body (CDX-array JSON) -> rows.
  // The header row is dropped, short rows are skipped, every row
  // is tagged with its source.
  function parseGhostarchiveCdxArray(data, source) {
    if (!Array.isArray(data) || data.length < 1) return [];
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      if (!Array.isArray(r) || r.length < 7) continue;
      rows.push([r[0], r[1], r[2], r[3] || "", r[4] || "", r[5] || "", r[6] || "", r[7] || "", source]);
    }
    return rows;
  }

  function inGhostarchiveRange(ts, from, to) {
    var d = String(ts || "").slice(0, 8);
    if (!d) return !(from || to);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  function ghostarchiveErrorText(status, error) {
    if (status === 504) return "Ghostarchive didn't answer in time — try again.";
    if (status === 502) return "Ghostarchive didn't answer — try again.";
    if (status === 429) return "Ghostarchive is rate-limiting us — try again in a minute.";
    return (error || "Ghostarchive didn't answer — try again.");
  }

  // The proxy URL for one Ghostarchive fetch. Proxy-only (see
  // ghostarchiveBase). The Turnstile token rides along — the
  // Function verifies it server-side (same as arquivoUrl).
  function ghostarchiveUrl(opts) {
    // cfg is console.js's global (this file loads after it, same
    // as arquivo.js) — the proxy path comes from web/config.js.
    var base = ghostarchiveBase(cfg);
    var u = new URL(base, location.href);
    u.searchParams.set("url", opts.pattern.replace("{id}", opts.handle));
    u.searchParams.set("limit", String(opts.limit));
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

  // One Ghostarchive fetch. opts: {pattern, handle, limit, from,
  // to}. Returns CDX-array rows, range-filtered. Throws on HTTP
  // error or an unexpected answer — the caller counts failures
  // instead of silently skipping them (same contract as
  // console.js fetchPattern).
  async function fetchGhostarchive(opts, signal) {
    var url = ghostarchiveUrl(opts);
    var res = await fetch(url.toString(), signal ? { signal: signal } : undefined);
    if (!res.ok) {
      var error = "";
      try { error = (await res.json()).error || ""; } catch (e) {}
      throw new Error(ghostarchiveErrorText(res.status, error));
    }
    var rows = parseGhostarchiveCdxArray(await res.json(), "ghostarchive");
    return rows.filter(function (r) {
      return inGhostarchiveRange(r[1], opts.from, opts.to);
    });
  }

  // fetchGhostarchive with the same 120s stall bound as the other
  // paths. Mirrors arquivo.js fetchArquivoTimed: a stall throws a
  // distinct TimeoutError (not AbortError), a real Stop still
  // propagates as AbortError. The timeout is injectable for tests
  // via window.WS_FETCH_TIMEOUT_MS.
  async function fetchGhostarchiveTimed(opts, signal, timeoutMs) {
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
      return await fetchGhostarchive(opts, ctrl.signal);
    } catch (e) {
      if (timedOut && e && e.name === "AbortError") {
        var err = new Error("Ghostarchive fetch timed out after " + Math.round(ms / 1000) + "s");
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

  // SearchJob steps for a Ghostarchive search. ctx: {net, id,
  // limit, from, to, addRow, urlPattern} — addRow(row,
  // "ghostarchive") dedupes against the other archives' rows and
  // counts per source (the caller owns the shared rows list).
  // URL mode is one step for the exact URL (no per-handle-listing
  // gate — Ghostarchive search answers any exact URL); otherwise
  // one step per Ghostarchive pattern (usually one).
  function ghostarchiveSteps(ctx) {
    var steps = [];
    if (ctx.urlPattern) {
      steps.push({
        label: "Ghostarchive — this post",
        run: async function (signal) {
          var rows = await fetchGhostarchiveTimed(
            { pattern: ctx.urlPattern, handle: ctx.id,
              limit: ctx.limit, from: ctx.from, to: ctx.to },
            signal, timedMs());
          var out = [];
          for (var j = 0; j < rows.length; j++) {
            if (ctx.addRow(rows[j], "ghostarchive")) out.push(rows[j]);
          }
          return out;
        },
      });
      return steps;
    }
    var patterns = patternsFor(ctx.net) || [];
    patterns.forEach(function (pat, i) {
      steps.push({
        label: "Ghostarchive — pattern " + (i + 1) + "/" + patterns.length,
        run: async function (signal) {
          var rows = await fetchGhostarchiveTimed(
            { pattern: pat, handle: ctx.id,
              limit: ctx.limit, from: ctx.from, to: ctx.to },
            signal, timedMs());
          var out = [];
          for (var j = 0; j < rows.length; j++) {
            if (ctx.addRow(rows[j], "ghostarchive")) out.push(rows[j]);
          }
          return out;
        },
      });
    });
    return steps;
  }

  var api = {
    ghostarchiveBase: ghostarchiveBase,
    ghostarchivePattern: ghostarchivePattern,
    patternsFor: patternsFor,
    ghostarchiveHasLink: ghostarchiveHasLink,
    archiveLink: archiveLink,
    parseGhostarchiveCdxArray: parseGhostarchiveCdxArray,
    inGhostarchiveRange: inGhostarchiveRange,
    ghostarchiveErrorText: ghostarchiveErrorText,
    ghostarchiveUrl: ghostarchiveUrl,
    fetchGhostarchive: fetchGhostarchive,
    fetchGhostarchiveTimed: fetchGhostarchiveTimed,
    ghostarchiveSteps: ghostarchiveSteps,
    FETCH_TIMEOUT_MS: FETCH_TIMEOUT_MS,
  };

  if (typeof window !== "undefined") {
    window.WS_GHOSTARCHIVE = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
