/* wayback-social web console — Arquivo.pt as a second archive
 * source (issue #8). Loaded after console.js; it uses that file's
 * globals ($, currentCaps, showDlg) and the SearchJob machinery
 * (window.WS_SEARCH_JOB) — the same machinery the Wayback search
 * uses, so progress + Pause / Stop / Resume work identically.
 * No build step. No CLI text anywhere in this file or on the page.
 *
 * Arquivo.pt is the only archive with real full-text search, and
 * its CDX goes back to 1996. Two modes:
 *   - CDX mode (every plan): per-handle captures, like Wayback CDX
 *     — but only X, Bluesky and Mastodon have a per-handle URL
 *     pattern. Other networks have no Arquivo.pt CDX listing; the
 *     search says so honestly instead of running a doomed query.
 *   - Keyword mode (Pro+): full-text search, filtered to URLs
 *     containing the handle — a URL match, not authorship (same
 *     honest rule as the CLI arquivo --keyword). Gated in the UI
 *     on licence.js keyword_search (false on free/starter).
 *
 * Honest limits, shown in the source note under the form:
 * Arquivo.pt results are at least a year old (embargo) and the
 * archive is Portuguese-weighted. Rows are labelled with their
 * source (Wayback / Arquivo.pt) and the snapshot link for an
 * Arquivo.pt row is https://arquivo.pt/wayback/<ts>/<url> — never
 * web.archive.org. A row is never presented as coming from the
 * other archive.
 */
(function () {
  "use strict";

  var FETCH_TIMEOUT_MS = 120_000;

  // Per-handle CDX patterns — mirrors wayback_social/arquivo.py
  // CDX_PATTERNS (mastodon uses the default instance, as the web's
  // Wayback pattern does). Networks not listed here have no
  // Arquivo.pt per-handle listing.
  var ARQUIVO_PATTERNS = {
    x: ["twitter.com/{id}/status/*"],
    bluesky: ["bsky.app/profile/{id}/post/*"],
    mastodon: ["mastodon.social/@{id}/*"],
  };

  function patternsFor(net) {
    return ARQUIVO_PATTERNS[net] ? ARQUIVO_PATTERNS[net].slice() : null;
  }

  function archiveLink(source, ts, orig) {
    if (source === "arquivo") {
      return "https://arquivo.pt/wayback/" + ts + "/" + orig;
    }
    return "https://web.archive.org/web/" + ts + "/" + orig;
  }

  // Response parsing lives in web/arquivo-parse.js (loaded before
  // this file): parseArquivoCdxArray / parseArquivoJsonl /
  // parseArquivoKeyword / inArquivoRange. The same normalization
  // also lives server-side in functions/api/arquivo.js.

  // Proxy or direct, mirroring console.js cdxBase(): the same-origin
  // /api/arquivo proxy on the deployed site, direct arquivo.pt calls
  // on localhost (arquivo.pt sends Access-Control-Allow-Origin: *,
  // verified 2026-11-27). ?arquivo=proxy / ?arquivo=direct override.
  function arquivoBase() {
    var q = new URLSearchParams(location.search);
    var force = q.get("arquivo");
    if (force === "proxy" && cfg.ARQUIVO_PROXY) return cfg.ARQUIVO_PROXY;
    if (force === "direct") return "direct";
    var h = location.hostname;
    if (h && h !== "localhost" && h !== "127.0.0.1" && cfg.ARQUIVO_PROXY) return cfg.ARQUIVO_PROXY;
    return "direct";
  }

  function arquivoUrl(opts) {
    var usingProxy = arquivoBase() !== "direct";
    var u;
    if (usingProxy) {
      u = new URL(cfg.ARQUIVO_PROXY, location.href);
      u.searchParams.set("mode", opts.mode);
      if (opts.mode === "keyword") {
        u.searchParams.set("q", opts.keyword);
        u.searchParams.set("handle", opts.handle);
      } else {
        u.searchParams.set("url", opts.pattern.replace("{id}", opts.handle));
      }
      u.searchParams.set("limit", String(opts.limit));
      if (opts.from) u.searchParams.set("from", opts.from);
      if (opts.to) u.searchParams.set("to", opts.to);
      // Turnstile token rides along on proxy requests only — the
      // Function verifies it server-side (same as cdxUrl). The
      // token is single-use per search with one idempotency key,
      // so the same token+idem is used for CDX and Arquivo calls
      // in one search (the proxy returns the cached outcome).
      if (window.WS_TURNSTILE) {
        var t = window.WS_TURNSTILE.currentToken();
        if (t) {
          u.searchParams.set("cf-turnstile-response", t.token);
          u.searchParams.set("cf-turnstile-idem", t.idem);
        }
      }
      return u;
    }
    if (opts.mode === "keyword") {
      u = new URL(cfg.ARQUIVO_TEXTSEARCH_BASE, location.href);
      u.searchParams.set("q", opts.keyword);
      u.searchParams.set("maxItems", String(opts.limit));
      return u;
    }
    u = new URL(cfg.ARQUIVO_CDX_BASE, location.href);
    u.searchParams.set("url", opts.pattern.replace("{id}", opts.handle));
    u.searchParams.set("output", "json");
    u.searchParams.set("limit", String(opts.limit));
    if (opts.from) u.searchParams.set("from", opts.from);
    if (opts.to) u.searchParams.set("to", opts.to);
    return u;
  }

  // One Arquivo.pt fetch. opts: {mode, pattern, keyword, handle,
  // limit, from, to}. Returns CDX-array rows, range-filtered.
  // Throws on HTTP error or an unexpected answer — the caller counts
  // failures instead of silently skipping them (same contract as
  // console.js fetchPattern).
  async function fetchArquivo(opts, signal) {
    var url = arquivoUrl(opts);
    var usingProxy = arquivoBase() !== "direct";
    var res = await fetch(url.toString(), signal ? { signal: signal } : undefined);
    if (!res.ok) throw new Error("Arquivo.pt answered HTTP " + res.status);
    var rows;
    if (usingProxy) {
      rows = parseArquivoCdxArray(await res.json());
    } else if (opts.mode === "keyword") {
      rows = parseArquivoKeyword(await res.json(), opts.handle);
    } else {
      rows = parseArquivoJsonl(await res.text());
    }
    return rows.filter(function (r) {
      return inArquivoRange(r[1], opts.from, opts.to);
    });
  }

  // fetchArquivo with the same 120s stall bound as the Wayback
  // paths. Mirrors modes.js fetchPatternTimed (kept separate so
  // this file stays self-contained): a stall throws a distinct
  // TimeoutError (not AbortError), a real Stop still propagates as
  // AbortError. The timeout is injectable for tests via
  // window.WS_FETCH_TIMEOUT_MS (production leaves it undefined and
  // the 120s default applies).
  async function fetchArquivoTimed(opts, signal, timeoutMs) {
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
      return await fetchArquivo(opts, ctrl.signal);
    } catch (e) {
      if (timedOut && e && e.name === "AbortError") {
        var err = new Error("Arquivo.pt fetch timed out after " + Math.round(ms / 1000) + "s");
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

  // SearchJob steps for an Arquivo.pt search. ctx: {net, id,
  // keyword, limit, from, to, addRow} — addRow(row, "arquivo")
  // dedupes against the Wayback rows and counts per source (the
  // caller owns the shared rows list). Keyword mode is one step;
  // CDX mode is one step per Arquivo pattern (usually one).
  function arquivoSteps(ctx) {
    var steps = [];
    // Single-post-URL mode (Track K item 2): one CDX step for the
    // exact URL — no {id} substitution (the URL has none), no
    // per-handle-listing gate (Arquivo.pt CDX answers any exact
    // URL). Mirrors the CLI's --url pattern [post_url].
    if (ctx.urlPattern) {
      steps.push({
        label: "Arquivo.pt — this post",
        run: async function (signal) {
          var rows = await fetchArquivoTimed(
            { mode: "cdx", pattern: ctx.urlPattern, handle: ctx.id,
              limit: ctx.limit, from: ctx.from, to: ctx.to },
            signal, timedMs());
          var out = [];
          for (var j = 0; j < rows.length; j++) {
            if (ctx.addRow(rows[j], "arquivo")) out.push(rows[j]);
          }
          return out;
        },
      });
      return steps;
    }
    if (ctx.keyword) {
      steps.push({
        label: "Arquivo.pt — keyword \"" + ctx.keyword + "\"",
        run: async function (signal) {
          var rows = await fetchArquivoTimed(
            { mode: "keyword", keyword: ctx.keyword, handle: ctx.id,
              limit: ctx.limit, from: ctx.from, to: ctx.to },
            signal, timedMs());
          var out = [];
          for (var i = 0; i < rows.length; i++) {
            if (ctx.addRow(rows[i], "arquivo")) out.push(rows[i]);
          }
          return out;
        },
      });
      return steps;
    }
    var patterns = patternsFor(ctx.net) || [];
    patterns.forEach(function (pat, i) {
      steps.push({
        label: "Arquivo.pt — pattern " + (i + 1) + "/" + patterns.length,
        run: async function (signal) {
          var rows = await fetchArquivoTimed(
            { mode: "cdx", pattern: pat, handle: ctx.id,
              limit: ctx.limit, from: ctx.from, to: ctx.to },
            signal, timedMs());
          var out = [];
          for (var j = 0; j < rows.length; j++) {
            if (ctx.addRow(rows[j], "arquivo")) out.push(rows[j]);
          }
          return out;
        },
      });
    });
    return steps;
  }

  // --- Source selector UI (index.html) --------------------------------
  // The selector is disabled while All-network search is on: broad
  // search is Wayback-only (Arquivo.pt has no per-network listing
  // beyond X / Bluesky / Mastodon). The keyword input is disabled
  // unless the source involves Arquivo.pt.
  function currentSource() {
    var sel = document.getElementById("source");
    return (sel && sel.value) || "wayback";
  }

  function syncSourceUI() {
    var src = document.getElementById("source");
    var kw = document.getElementById("keyword");
    var note = document.getElementById("source-note");
    var broad = document.getElementById("broad");
    if (!src) return;
    var v = currentSource();
    var broadOn = broad && broad.checked;
    // Keyword search is Arquivo.pt-only: the input is enabled for
    // Arquivo.pt and for All archives (which runs Arquivo.pt too),
    // disabled for the other single sources and for broad search.
    if (kw) kw.disabled = broadOn || (v !== "arquivo" && v !== "both");
    if (src) src.disabled = !!broadOn;
    if (!note) return;
    if (broadOn) {
      note.textContent = "All-network search checks the Wayback Machine only — uncheck it to search the other archives too.";
    } else if (v === "arquivo") {
      note.textContent = "Arquivo.pt — the only archive with full-text search. Results are at least a year old (embargo) and Portuguese-weighted; per-handle listing covers X, Bluesky and Mastodon — type a keyword (Pro) for other networks.";
    } else if (v === "ghostarchive") {
      note.textContent = "Ghostarchive — a volunteer archive that holds captures the others missed, and misses plenty they hold. Coverage is uneven by network; per-handle listing covers X and Bluesky only. Dates come from its results table — an undated row is shown undated, never faked.";
    } else if (v === "commoncrawl") {
      note.textContent = "Common Crawl — a monthly broad crawl since 2008. Slow and flaky by design: the search retries with backoff and says so honestly when the index doesn't answer. Captures link to the index record itself — Common Crawl has no replay URL.";
    } else if (v === "both") {
      note.textContent = "All archives — Wayback first, then Arquivo.pt, Ghostarchive and Common Crawl (slowest, last). Arquivo.pt results are at least a year old and Portuguese-weighted; Ghostarchive coverage is uneven; Common Crawl links to index records, not replays.";
    } else {
      note.textContent = "Wayback Machine — the largest archive. Switch to Arquivo.pt for full-text keyword search (Pro), Ghostarchive for captures the others missed, Common Crawl for the broad crawl, or search all archives.";
    }
  }

  var api = {
    ARQUIVO_PATTERNS: ARQUIVO_PATTERNS,
    patternsFor: patternsFor,
    archiveLink: archiveLink,
    arquivoBase: arquivoBase,
    arquivoUrl: arquivoUrl,
    fetchArquivo: fetchArquivo,
    fetchArquivoTimed: fetchArquivoTimed,
    arquivoSteps: arquivoSteps,
    currentSource: currentSource,
    syncSourceUI: syncSourceUI,
    FETCH_TIMEOUT_MS: FETCH_TIMEOUT_MS,
  };

  if (typeof window !== "undefined") {
    window.WS_ARQUIVO = api;
    // Wire the selector now (scripts load at end of body, so the
    // DOM is ready). Guarded: the file is also loaded in Node
    // tests, where document is undefined.
    if (typeof document !== "undefined") {
      ["source", "broad"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener("change", syncSourceUI);
      });
      syncSourceUI();
    }
  }
  if (typeof module !== "undefined" && module.exports) {
    // Parsers live in arquivo-parse.js (require it directly in
    // Node); this module exports only the fetch/UI surface.
    module.exports = api;
  }
})();
