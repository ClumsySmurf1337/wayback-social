// GET /api/ghostarchive?url=...&from=...&to=...&limit=...
// Cloudflare Pages Function that proxies Ghostarchive — the third
// archive source for the web console (issue #8, Track L).
//
// WHY: Ghostarchive holds captures Wayback and Arquivo.pt missed
// (verified live 2026-11-27: 7 captures of jack/status/20,
// 2022-01-14..2024-04-14). Unlike CDX archives it has no API —
// the Function scrapes the search page server-side (a server
// fetch has no browser CORS issue) and parses the results table
// exactly like the CLI does (wayback_social/archives.py
// search_ghostarchive): one row per capture, an /archive/<id>
// link plus a capture date in the next cell.
//
// WHAT IT RETURNS: CDX-array rows, the same shape as /api/cdx —
// a header row, then [urlkey, timestamp, original, mimetype,
// statuscode, digest, length, archiveId]. The 8th column is the
// Ghostarchive-only extension: the /archive/<id> id, because a
// Ghostarchive snapshot link cannot be derived from (timestamp,
// URL) the way Wayback/Arquivo.pt links can — the client builds
// https://ghostarchive.org/archive/<id> from it (see
// web/ghostarchive.js archiveLink). Rows without a parsable date
// keep an empty timestamp, never a faked one (same rule as the
// CLI); when a date range is given, undated rows are dropped —
// an undated capture cannot be proven in range.
//
// THE `url` PARAM: a full post URL or a URL prefix. Ghostarchive
// search treats the term as a prefix: `twitter.com/jack/status/`
// returns captures under that prefix (verified live 2026-11-27:
// 14 links for the prefix, 7 for the exact status/20). The web
// console sends per-handle prefixes for X and Bluesky — the only
// two networks whose prefixes return the classic results table.
// Mastodon / Instagram / TikTok prefixes redirect to Ghostarchive's
// video search (/vidsearch), which has no results table, so those
// networks have no Ghostarchive per-handle listing (the console
// says so honestly instead of running a doomed query).
//
// SAFETY: allowlisted query params only, no credentials, no POST,
// no request body is forwarded, responses are public and cached
// 5 minutes at the edge. Ghostarchive is free, no key.
//
// TIMEOUT: the upstream fetch is aborted after 120s (same bound as
// the other proxies) — a hung upstream answers 504 with an honest
// error, never a hang and never fake rows.
//
// TURNSTILE: mirrors functions/api/cdx.js verifyTurnstile (kept in
// sync by hand — if it changes, change both; extracting a shared
// _lib/turnstile.js is the follow-up). When TURNSTILE_SECRET_KEY is
// not set, the proxy is open — that is the state until the human
// step in docs/clerk-auth.md §6.
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const GHOSTARCHIVE_SEARCH = "https://ghostarchive.org/search";
const FETCH_TIMEOUT_MS = 120_000;
const MAX_LIMIT = 1000;
const CDX_HEADER = ["urlkey", "timestamp", "original", "mimetype",
  "statuscode", "digest", "length"];

// Two passes, exactly like the CLI (wayback_social/archives.py
// search_ghostarchive): (1) every /archive/<id> link, whose link
// text is the original post URL; (2) the dated rows — <a
// href="/archive/<id>">ORIGINAL-URL</a></td><td>DATE GMT — for the
// capture dates. An id with no dated row keeps an empty timestamp
// (never faked); the date pass alone would drop it, because its
// date cell doesn't match the RFC 1123 shape.
const LINK_RE = /href="\/archive\/([A-Za-z0-9]+)">([^<]*)<\/a>/gi;
const ROW_RE = /href="\/archive\/([A-Za-z0-9]+)">[^<]*<\/a>\s*<\/td>\s*<td>\s*([A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT)/gi;

const ALLOWED = new Set(["url", "from", "to", "limit", "output"]);

async function verifyTurnstile(env, request) {
  if (!env || !env.TURNSTILE_SECRET_KEY) return null; // not configured — open
  const reqUrl = new URL(request.url);
  const token = reqUrl.searchParams.get("cf-turnstile-response");
  if (!token) {
    return { ok: false, error: "bot check required — run the search from the site" };
  }
  const idem = reqUrl.searchParams.get("cf-turnstile-idem") || undefined;
  const form = new URLSearchParams();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  if (idem) form.set("idempotency_key", idem);
  let res;
  try {
    res = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: form });
  } catch (e) {
    return { ok: false, error: "bot check could not be verified — try again" };
  }
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!data.success) {
    return { ok: false, error: "bot check failed — are you human? Try again." };
  }
  return null;
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// 'Thu, 16 May 2024 03:25:36 GMT' -> 'YYYYMMDDHHMMSS' (UTC).
// Unparsable -> "" (never faked).
function parseGhostDate(raw) {
  const ms = Date.parse((raw || "").trim());
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds());
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

// The search page HTML -> CDX-array rows (8 columns: the standard
// 7 plus the archive id). Deduped by archive id (the page can list
// the same capture twice), sorted oldest first; undated rows sort
// last and keep their page order.
function parseSearchPage(html, from, to) {
  const ranged = Boolean(from || to);
  const dated = new Map();
  const dateRe = new RegExp(ROW_RE.source, ROW_RE.flags);
  let m;
  while ((m = dateRe.exec(html)) !== null) {
    if (!dated.has(m[1])) dated.set(m[1], parseGhostDate(m[2]));
  }
  const seen = new Set();
  const rows = [];
  const linkRe = new RegExp(LINK_RE.source, LINK_RE.flags);
  while ((m = linkRe.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const orig = (m[2] || "").trim();
    if (!orig) continue;
    const ts = dated.get(id) || "";
    if (ranged && !inRange(ts, from, to)) continue;
    rows.push(["", ts, orig, "", "", "", "", id]);
  }
  rows.sort((a, b) => {
    if (!a[1] && !b[1]) return 0;
    if (!a[1]) return 1;
    if (!b[1]) return -1;
    return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  });
  return rows;
}

async function fetchUpstream(url) {
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
  const url = params.get("url");
  if (!url) return jsonError("missing ?url=", 400);
  const target = new URL(GHOSTARCHIVE_SEARCH);
  target.searchParams.set("term", url);
  const botCheck = await verifyTurnstile(context.env, request);
  if (botCheck) {
    return jsonError(botCheck.error, 403);
  }
  let res;
  try {
    res = await fetchUpstream(target.toString());
  } catch (e) {
    if (e && e.name === "AbortError") {
      return jsonError("Ghostarchive didn't answer in time — try again", 504);
    }
    return jsonError("Ghostarchive didn't answer: " + (e && e.message ? e.message : "fetch failed"), 502);
  }
  if (!res.ok) {
    return jsonError("Ghostarchive answered HTTP " + res.status, res.status);
  }
  let html = "";
  try {
    html = await res.text();
  } catch (e) {
    return jsonError("Ghostarchive answered with an unreadable page", 502);
  }
  const rows = parseSearchPage(html, from, to).slice(0, limit);
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("content-type", "application/json");
  headers.set("cache-control", "public, max-age=300");
  return new Response(JSON.stringify([CDX_HEADER, ...rows]), {
    status: 200,
    headers,
  });
}

export { GHOSTARCHIVE_SEARCH, FETCH_TIMEOUT_MS, MAX_LIMIT, parseSearchPage, parseGhostDate };
