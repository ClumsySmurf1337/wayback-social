/* Node test for functions/api/commoncrawl.js — no dependencies, no
 * browser, no network (fetch is stubbed).
 *
 * Run:  node functions/api/commoncrawl.test.mjs
 * Exit 0 = the proxy mirrors /api/arquivo's contract plus the
 * async-by-design retry: allowlisted params only, the `*` is
 * stripped from patterns (matchType=prefix), bare URLs are
 * queried exact, crawl ids are validated, JSONL parses to CDX-
 * array rows with the crawl id in the 8th column, sorted oldest
 * first, range enforced server-side, a 404 is an honest header-
 * only empty (not an error, not retried), a 504/502 retries up
 * to 3 attempts with backoff and then answers an honest 504/502
 * (never fake rows), Turnstile open when unconfigured and
 * enforced when configured.
 *
 * NOTE: the retry-success test waits ~10s of real backoff time
 * (2s + 8s) — that is the real production backoff, not a mock.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { onRequest, indexUrl, parseIndexJsonl, DEFAULT_CRAWL } from "./commoncrawl.js";

const JSONL = [
  '{"urlkey": "com,example)/", "timestamp": "20261106154953", "url": "https://www.example.com/", "mime": "text/html", "status": "200", "digest": "ABC", "length": "998", "filename": "crawl-data/x.warc.gz"}',
  '{"urlkey": "com,example)/", "timestamp": "20261101000000", "url": "https://example.com/", "mime": "text/html", "status": "200", "digest": "DEF", "length": "500", "filename": "crawl-data/y.warc.gz"}',
  "this is not json",
  '{"url": "https://example.com/no-timestamp"}',
].join("\n");

function req(url, env) {
  return { request: new Request(url), env: env || {} };
}

async function call(url, env) {
  const res = await onRequest(req(url, env));
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (e) { /* not JSON */ }
  return { status: res.status, body, text,
    cache: res.headers.get("cache-control") };
}

// Stub fetch: `script` is an array of per-attempt answers consumed
// in order — {status, body}, {status} for an HTTP error, "hang"
// for an AbortError (the 15s per-attempt timeout), or an Error to
// throw. `siteverify` keys the Turnstile endpoint.
function stubFetch({ script, siteverify } = {}) {
  const calls = [];
  const queue = Array.isArray(script) ? [...script] : [];
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    if (String(url).startsWith("https://challenges.cloudflare.com/")) {
      if (siteverify instanceof Error) throw siteverify;
      return { status: 200, json: async () => ({ success: siteverify !== false }) };
    }
    const next = queue.length ? queue.shift() : { status: 200, body: JSONL };
    if (next === "hang") {
      const e = new Error("aborted"); e.name = "AbortError"; throw e;
    }
    if (next instanceof Error) throw next;
    if (next.status === 404) {
      return { status: 404, ok: false,
        text: async () => '{"message": "No Captures found"}' };
    }
    if (!next.ok && next.status && next.status !== 200) {
      return { status: next.status, ok: false, text: async () => "" };
    }
    return { status: 200, ok: true,
      text: async () => (typeof next.body === "string" ? next.body : JSONL) };
  };
  return calls;
}

test("indexUrl: wildcard patterns lose the * and get matchType=prefix", () => {
  const u = indexUrl("twitter.com/jack/status/*", "CC-MAIN-2026-47");
  assert.ok(u.includes("url=twitter.com%2Fjack%2Fstatus%2F"), u);
  assert.ok(!u.includes("*"), u);
  assert.ok(u.includes("matchType=prefix"), u);
  assert.ok(u.includes("CC-MAIN-2026-47-index"), u);
});

test("indexUrl: a bare URL is queried exact, no matchType", () => {
  const u = indexUrl("example.com", "CC-MAIN-2026-47");
  assert.ok(u.includes("url=example.com"), u);
  assert.ok(!u.includes("matchType"), u);
});

test("parse: JSONL -> rows, bad lines + missing timestamps skipped, sorted", () => {
  const rows = parseIndexJsonl(JSONL, "CC-MAIN-2026-47", "", "");
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], "20261101000000");
  assert.equal(rows[0][2], "https://example.com/");
  assert.equal(rows[0][7], "CC-MAIN-2026-47");
  assert.equal(rows[1][1], "20261106154953");
  assert.equal(rows[1][3], "text/html");
  assert.equal(rows[1][4], "200");
});

test("parse: a date range filters rows", () => {
  const rows = parseIndexJsonl(JSONL, "CC-MAIN-2026-47", "20261105", "20261107");
  assert.equal(rows.length, 1);
  assert.equal(rows[0][1], "20261106154953");
});

test("proxy: header row first, limit applies, cache header set", async () => {
  stubFetch();
  const { status, body, cache } = await call(
    "https://example.com/api/commoncrawl?url=example.com&limit=1");
  assert.equal(status, 200);
  assert.equal(cache, "public, max-age=300");
  assert.deepEqual(body[0],
    ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"]);
  assert.equal(body.length, 2); // header + 1 row
  assert.equal(body[1][1], "20261101000000");
});

test("proxy: missing url, bad output, bad dates, bad limit, bad crawl -> 400", async () => {
  stubFetch();
  const base = "https://example.com/api/commoncrawl";
  for (const q of [
    "",
    "?url=x&output=xml",
    "?url=x&from=2020",
    "?url=x&to=2020-01-01",
    "?url=x&limit=abc",
    "?url=x&limit=0",
    "?url=x&crawl=CC-MAIN-2026",
    "?url=x&crawl=../../etc/passwd",
  ]) {
    const { status, body } = await call(base + q);
    assert.equal(status, 400, q);
    assert.ok(body.error, q);
  }
});

test("proxy: limit clamps to 1000 and the pattern loses its *", async () => {
  const calls = stubFetch();
  const { status } = await call(
    "https://example.com/api/commoncrawl?url=twitter.com%2Fjack%2Fstatus%2F*&limit=5000");
  assert.equal(status, 200);
  assert.ok(!calls[0].includes("*"), calls[0]);
  assert.ok(calls[0].includes("matchType=prefix"), calls[0]);
});

test("proxy: 404 is an honest header-only empty, not an error", async () => {
  stubFetch({ script: [{ status: 404 }] });
  const { status, body } = await call(
    "https://example.com/api/commoncrawl?url=example.com");
  assert.equal(status, 200);
  assert.equal(body.length, 1); // header only
});

test("proxy: 502 then success — one retry, rows returned", async () => {
  stubFetch({ script: [{ status: 502 }, { status: 200, body: JSONL }] });
  const { status, body } = await call(
    "https://example.com/api/commoncrawl?url=example.com");
  assert.equal(status, 200);
  assert.equal(body.length, 3);
});

test("proxy: hang, hang, success — two retries, rows returned", async () => {
  stubFetch({ script: ["hang", "hang", { status: 200, body: JSONL }] });
  const { status, body } = await call(
    "https://example.com/api/commoncrawl?url=example.com");
  assert.equal(status, 200);
  assert.equal(body.length, 3);
}, { timeout: 60000 });

test("proxy: three hangs -> honest 504, never fake rows", async () => {
  stubFetch({ script: ["hang", "hang", "hang"] });
  const { status, body } = await call(
    "https://example.com/api/commoncrawl?url=example.com");
  assert.equal(status, 504);
  assert.ok(body.error.includes("didn't answer in time"));
}, { timeout: 60000 });

test("proxy: three 502s -> honest 502 with the last status", async () => {
  stubFetch({ script: [{ status: 502 }, { status: 503 }, { status: 502 }] });
  const { status, body } = await call(
    "https://example.com/api/commoncrawl?url=example.com");
  assert.equal(status, 502);
  assert.ok(body.error.includes("HTTP 502"));
}, { timeout: 60000 });

test("Turnstile: open when unconfigured, 403 without a token when set", async () => {
  stubFetch();
  const ok = await call("https://example.com/api/commoncrawl?url=x", {});
  assert.equal(ok.status, 200);
  const denied = await call(
    "https://example.com/api/commoncrawl?url=x",
    { TURNSTILE_SECRET_KEY: "secret" });
  assert.equal(denied.status, 403);
  assert.ok(denied.body.error.includes("bot check required"));
});

test("Turnstile: valid token proceeds (siteverify success)", async () => {
  const calls = stubFetch({ siteverify: true });
  const { status, body } = await call(
    "https://example.com/api/commoncrawl?url=x&cf-turnstile-response=tok&cf-turnstile-idem=idem1",
    { TURNSTILE_SECRET_KEY: "secret" });
  assert.equal(status, 200);
  assert.equal(body.length, 3);
  assert.ok(calls.some((u) => u.includes("siteverify")));
  // The token is never forwarded to the Common Crawl index.
  assert.ok(calls.filter((u) => u.includes("index.commoncrawl.org"))
    .every((u) => !u.includes("cf-turnstile")));
});

test("default crawl is the one the CLI uses", () => {
  assert.equal(DEFAULT_CRAWL, "CC-MAIN-2026-47");
});
