// GET /api/arquivo?mode=cdx&url=...&from=...&to=...&limit=...
//   or /api/arquivo?mode=keyword&q=...&handle=...&limit=...
// Cloudflare Pages Function that proxies Arquivo.pt — the only
// archive with real full-text search, and the second source for the
// web console's archive search (issue #8).
//
// WHY: the web console searched Wayback CDX only. Arquivo.pt covers
// what Wayback missed (its CDX goes back to 1996, and textsearch is
// the only full-text search across any archive). Same-origin
// /api/arquivo keeps the browser path identical to /api/cdx; the
// client falls back to direct arquivo.pt calls on localhost, where
// arquivo.pt sends Access-Control-Allow-Origin: * (verified
// 2026-11-27) so direct calls work.
//
// WHAT IT RETURNS: CDX-array rows, the same shape as /api/cdx — a
// header row, then [urlkey, timestamp, original, mimetype,
// statuscode, digest, length]. The web client parses both identically
// and labels each row with its source (Wayback / Arquivo.pt); the
// snapshot link for an Arquivo.pt row is
// https://arquivo.pt/wayback/<ts>/<url>, never web.archive.org.
//   - mode=cdx: Arquivo.pt wayback/cdx for a URL pattern. from/to
//     (YYYYMMDD) are passed through AND enforced server-side, so a
//     row outside the range can never leak through.
//   - mode=keyword: Arquivo.pt textsearch (full text), then the
//     results are filtered to URLs containing the handle — the
//     handle filter is a URL match, not authorship (same honest rule
//     as the CLI arquivo --keyword). Keyword search is a Pro feature
//     in the CLI and in the web UI; the proxy itself does not check
//     tiers (same as /api/cdx — caps are enforced client-side).
//
// SAFETY: allowlisted query params only, no credentials, no POST,
// no request body is forwarded, responses are public and cached
// 5 minutes at the edge. Arquivo.pt is free, no key (250 req/60 s
// per IP on textsearch and CDX — the proxy shares Cloudflare's
// egress IP, so heavy use can hit that limit; a 429 from Arquivo.pt
// is forwarded honestly, never retried into fake rows).
//
// TIMEOUT: the upstream fetch is aborted after 120s (same bound as
// the web client's fetch timeout) — a hung upstream answers 504
// with an honest error, never a hang and never fake rows.
//
// TURNSTILE: verified by the shared verifier in
// ../_lib/turnstile.js (same as /api/cdx — one implementation, no
// hand-sync). When TURNSTILE_SECRET_KEY is not set, the proxy is
// open — that is the state until the human step in
// docs/clerk-auth.md §6.
import { verifyTurnstile } from "../_lib/turnstile.js";

const ARQUIVO_CDX = "https://arquivo.pt/wayback/cdx";
const ARQUIVO_TEXTSEARCH = "https://arquivo.pt/textsearch";
const FETCH_TIMEOUT_MS = 120_000;
const MAX_LIMIT = 1000;
const CDX_HEADER = ["urlkey", "timestamp", "original", "mimetype",
  "statuscode", "digest", "length"];

// Params accepted on the query string. cf-turnstile-response /
// cf-turnstile-idem are consumed by verifyTurnstile and never
// forwarded to arquivo.pt. `handle` is consumed server-side (the
// keyword URL filter) and never forwarded either.
const ALLOWED = new Set([
  "mode", "url", "q", "handle", "from", "to", "limit", "output",
]);

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Arquivo.pt CDX stores doubled slashes
// (twitter.com//jack//status//20) — same fix as
// wayback_social/arquivo.py _to_record.
function fixSlashes(url) {
  return String(url || "").replace(/(?<!:)\/{2,}/g, "/");
}

function inRange(ts, from, to) {
  const d = String(ts || "").slice(0, 8);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function validDate(s) {
  return !s || /^\d{8}$/.test(s) || /^\d{14}$/.test(s);
}

function parseLimit(raw) {
  if (raw == null || raw === "") return 50;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return Math.min(n, MAX_LIMIT);
}

// One Arquivo.pt CDX JSONL row -> a CDX-array row (or null).
function cdxRowToArray(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const url = fixSlashes(row.url || "");
  const ts = String(row.timestamp || "");
  if (!url || !ts) return null;
  return [
    row.urlkey || "",
    ts,
    url,
    row.mime || "",
    String(row.status || ""),
    row.digest || "",
    String(row.length || ""),
  ];
}

// One textsearch response_item -> a CDX-array row (or null). The
// archive link is NOT stored in the row — the web client builds
// https://arquivo.pt/wayback/<ts>/<url> from ts + original, the same
// way it builds web.archive.org links for Wayback rows.
function keywordItemToArray(item) {
  if (!item || typeof item !== "object") return null;
  const url = fixSlashes(item.originalURL || "");
  const ts = String(item.tstamp || "");
  if (!url || !ts) return null;
  return [
    "",
    ts,
    url,
    item.mimeType || "",
    String(item.status || ""),
    item.digest || "",
    "",
  ];
}

async function fetchUpstream(url) {
  // AbortSignal.timeout is available in Workers and in Node 18+.
  // A hung upstream becomes a 504 with an honest error (see
  // onRequest), never a hang and never fake rows.
  const signal = typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
    : undefined;
  return fetch(url, {
    headers: { "User-Agent": "wayback-social/1.0" },
    signal,
  });
}

export async function onRequest(context) {
  const request = context.request;
  const reqUrl = new URL(request.url);
  const params = reqUrl.searchParams;
  const mode = params.get("mode") || "cdx";
  if (mode !== "cdx" && mode !== "keyword") {
    return jsonError("mode must be cdx or keyword", 400);
  }
  const output = params.get("output");
  if (output && output !== "json") {
    return jsonError("output must be json", 400);
  }
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  if (!validDate(from) || !validDate(to)) {
    return jsonError("from/to must be YYYYMMDD", 400);
  }
  const limit = parseLimit(params.get("limit"));
  if (limit === null) {
    return jsonError("limit must be a positive integer", 400);
  }
  let target;
  let handle = "";
  if (mode === "cdx") {
    const url = params.get("url");
    if (!url) return jsonError("missing ?url=", 400);
    target = new URL(ARQUIVO_CDX);
    target.searchParams.set("url", url);
    target.searchParams.set("output", "json");
    target.searchParams.set("limit", String(limit));
    if (from) target.searchParams.set("from", from);
    if (to) target.searchParams.set("to", to);
  } else {
    const q = params.get("q");
    handle = (params.get("handle") || "").replace(/^@/, "");
    if (!q) return jsonError("missing ?q=", 400);
    if (!handle) return jsonError("missing ?handle=", 400);
    target = new URL(ARQUIVO_TEXTSEARCH);
    target.searchParams.set("q", q);
    target.searchParams.set("maxItems", String(limit));
  }
  const botCheck = await verifyTurnstile(context.env, request);
  if (botCheck) {
    return jsonError(botCheck.error, 403);
  }
  let res;
  try {
    res = await fetchUpstream(target.toString());
  } catch (e) {
    if (e && e.name === "AbortError") {
      return jsonError("Arquivo.pt didn't answer in time — try again", 504);
    }
    return jsonError("Arquivo.pt didn't answer: " + (e && e.message ? e.message : "fetch failed"), 502);
  }
  if (!res.ok) {
    return jsonError("Arquivo.pt answered HTTP " + res.status, res.status);
  }
  let rows = [];
  try {
    if (mode === "cdx") {
      // JSONL — one JSON object per line (verified live 2026-11-27).
      const text = await res.text();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let row = null;
        try { row = JSON.parse(trimmed); } catch (e) { continue; }
        const arr = cdxRowToArray(row);
        if (arr && inRange(arr[1], from, to)) rows.push(arr);
      }
    } else {
      const data = await res.json();
      const items = (data && Array.isArray(data.response_items))
        ? data.response_items : [];
      const needle = handle.toLowerCase();
      for (const item of items) {
        // URL match, not authorship: a match proves the URL
        // contains the handle, not that the handle wrote it.
        const url = String(item.originalURL || "").toLowerCase();
        if (!url.includes(needle)) continue;
        const arr = keywordItemToArray(item);
        if (arr && inRange(arr[1], from, to)) rows.push(arr);
      }
    }
  } catch (e) {
    return jsonError("Arquivo.pt answered with an unexpected format", 502);
  }
  rows.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  rows = rows.slice(0, limit);
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("content-type", "application/json");
  headers.set("cache-control", "public, max-age=300");
  return new Response(JSON.stringify([CDX_HEADER, ...rows]), {
    status: 200,
    headers,
  });
}

export { ARQUIVO_CDX, ARQUIVO_TEXTSEARCH, FETCH_TIMEOUT_MS, MAX_LIMIT };
