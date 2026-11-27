// GET /api/commoncrawl?url=...&from=...&to=...&limit=...&crawl=...
// Cloudflare Pages Function that proxies the Common Crawl index —
// the fourth archive source for the web console (issue #8,
// Track L). Async by design: the index is slow and flaky.
//
// WHY: Common Crawl holds captures of pages the other archives
// missed, and its index answers URL-prefix queries (verified live
// 2026-11-27: example.com -> 134 captures in CC-MAIN-2026-47).
// The index 504s/502s on most attempts at bad times (Track B
// proved the async flow end-to-end: queue -> 504 -> retry -> done),
// so this Function retries with backoff inside one call instead
// of failing on the first 504.
//
// WHAT IT RETURNS: CDX-array rows, the same shape as /api/cdx —
// a header row, then [urlkey, timestamp, original, mimetype,
// statuscode, digest, length, crawl]. The 8th column is the
// Common-Crawl-only extension: the crawl id (e.g.
// CC-MAIN-2026-47), because the client builds the index-record
// link from it (see web/commoncrawl.js archiveLink) — Common
// Crawl has no replay URL, so the snapshot link points at the
// index record itself, honestly labelled.
//
// THE `url` PARAM: a URL pattern with a trailing `/*` (the web
// console's per-handle patterns, e.g. twitter.com/jack/status/*)
// or an exact URL. The index does NOT want the `*`: with
// matchType=prefix the prefix is the URL WITHOUT the wildcard
// (verified live 2026-11-27: `url=example.com/*&matchType=prefix`
// -> 404, `url=example.com&matchType=prefix` -> 200, 278 rows).
// The Function strips `*` and sends matchType=prefix for
// patterns; a bare URL is queried exact (no matchType).
//
// RETRY: up to 3 attempts, 15s per-attempt upstream timeout,
// backoff 2s then 8s between attempts (worst case ~55s wall
// clock — inside the client's 120s bound; a Pages Function
// waiting on I/O does not burn CPU). A 404 is definitive ("no
// captures") and returns header-only immediately — it is NOT
// retried and NOT an error. After all attempts fail, the answer
// is an honest 504 (timeouts) or 502 (last upstream status),
// never fake rows.
//
// SAFETY: allowlisted query params only; `crawl` is validated
// against ^CC-MAIN-\d{4}-\d{2}$ (it goes into the URL path —
// anything else is a 400). No credentials, no POST, no request
// body is forwarded, responses are public and cached 5 minutes
// at the edge. Common Crawl is free, no key.
//
// TURNSTILE: mirrors functions/api/cdx.js verifyTurnstile (kept
// in sync by hand — if it changes, change both; extracting a
// shared _lib/turnstile.js is the follow-up). When
// TURNSTILE_SECRET_KEY is not set, the proxy is open — that is
// the state until the human step in docs/clerk-auth.md §6.
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const CC_INDEX_BASE = "https://index.commoncrawl.org";
const DEFAULT_CRAWL = "CC-MAIN-2026-47";
const CRAWL_RE = /^CC-MAIN-\d{4}-\d{2}$/;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [2000, 8000];
const MAX_LIMIT = 1000;
const CDX_HEADER = ["urlkey", "timestamp", "original", "mimetype",
  "statuscode", "digest", "length"];

const ALLOWED = new Set(["url", "from", "to", "limit", "crawl", "output"]);

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// One index JSONL row -> a CDX-array row (or null). The crawl id
// rides in the 8th column for the client's index-record link.
function indexRowToArray(row, crawl) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const url = String(row.url || "");
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
    crawl,
  ];
}

function parseIndexJsonl(text, crawl, from, to) {
  const rows = [];
  for (const line of String(text || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row = null;
    try { row = JSON.parse(trimmed); } catch (e) { continue; }
    const arr = indexRowToArray(row, crawl);
    if (arr && inRange(arr[1], from, to)) rows.push(arr);
  }
  rows.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return rows;
}

// Build the index URL for one attempt. Patterns carry a trailing
// /* — the index wants the bare prefix with matchType=prefix.
// A bare URL is queried exact (no matchType).
function indexUrl(url, crawl) {
  const hasWildcard = url.includes("*");
  const clean = url.replace(/\*/g, "");
  const target = new URL(`${CC_INDEX_BASE}/${crawl}-index`);
  target.searchParams.set("url", clean);
  if (hasWildcard) target.searchParams.set("matchType", "prefix");
  target.searchParams.set("output", "json");
  return target.toString();
}

async function fetchAttempt(target) {
  const signal = typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
    : undefined;
  return fetch(target, {
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
  const crawl = params.get("crawl") || DEFAULT_CRAWL;
  if (!CRAWL_RE.test(crawl)) {
    return jsonError("crawl must look like CC-MAIN-2026-47", 400);
  }
  const url = params.get("url");
  if (!url) return jsonError("missing ?url=", 400);
  const botCheck = await verifyTurnstile(context.env, request);
  if (botCheck) {
    return jsonError(botCheck.error, 403);
  }
  const target = indexUrl(url, crawl);
  let lastStatus = 0;
  let sawTimeout = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1] || 8000);
    let res;
    try {
      res = await fetchAttempt(target);
    } catch (e) {
      if (e && e.name === "AbortError") sawTimeout = true;
      if (attempt === MAX_ATTEMPTS - 1) break;
      continue;
    }
    if (res.status === 404) {
      // Definitive: the index has no captures for this URL.
      // Honest empty — header only, not an error, not retried.
      return okResponse([]);
    }
    if (!res.ok) {
      lastStatus = res.status;
      if (attempt === MAX_ATTEMPTS - 1) break;
      continue;
    }
    let text = "";
    try {
      text = await res.text();
    } catch (e) {
      lastStatus = 502;
      if (attempt === MAX_ATTEMPTS - 1) break;
      continue;
    }
    const rows = parseIndexJsonl(text, crawl, from, to).slice(0, limit);
    return okResponse(rows);
  }
  if (sawTimeout) {
    return jsonError("Common Crawl index didn't answer in time — try again", 504);
  }
  return jsonError(
    "Common Crawl index answered HTTP " + (lastStatus || 502) + " — try again",
    lastStatus >= 500 ? lastStatus : 502);
}

function okResponse(rows) {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("content-type", "application/json");
  headers.set("cache-control", "public, max-age=300");
  return new Response(JSON.stringify([CDX_HEADER, ...rows]), {
    status: 200,
    headers,
  });
}

export { CC_INDEX_BASE, DEFAULT_CRAWL, FETCH_TIMEOUT_MS, MAX_ATTEMPTS, MAX_LIMIT, indexUrl, parseIndexJsonl };
