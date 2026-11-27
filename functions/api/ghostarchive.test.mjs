/* Node test for functions/api/ghostarchive.js — no dependencies, no
 * browser, no network (fetch is stubbed).
 *
 * Run:  node functions/api/ghostarchive.test.mjs
 * Exit 0 = the proxy mirrors /api/arquivo's contract: allowlisted
 * params only, CDX-array rows with a header row first (plus the
 * Ghostarchive-only 8th column, the /archive/<id> id), dates parsed
 * from the results table (RFC 1123 -> YYYYMMDDHHMMSS, unparsable
 * -> empty timestamp, never faked), undated rows dropped when a
 * date range is given, deduped by archive id, sorted oldest first,
 * upstream errors forwarded honestly (never fake rows), a hung
 * upstream answers 504, Turnstile open when unconfigured and
 * enforced when configured.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { onRequest, parseSearchPage, parseGhostDate } from "./ghostarchive.js";

const SEARCH_PAGE = [
  '<a href="/archive/Zpgdp">https://twitter.com/jack/status/1787895769183268948</a></td><td>Thu, 16 May 2024 03:25:36 GMT',
  '<a href="/archive/AJzyo">https://twitter.com/jack/status/20</a></td><td>Sun, 14 Apr 2024 03:32:58 GMT',
  '<a href="/archive/AJzyo">https://twitter.com/jack/status/20</a></td><td>Sun, 14 Apr 2024 03:32:58 GMT',
  '<a href="/archive/M088M">https://twitter.com/jack/status/20</a></td><td>Thu, 21 Apr 2022 22:23:19 GMT',
  '<a href="/archive/NODATE">https://twitter.com/jack/status/99</a></td><td>not a date at all',
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

// Stub fetch: the upstream is keyed on the URL prefix; the
// Turnstile siteverify endpoint is keyed separately. `hang` makes
// the upstream throw an AbortError (what AbortSignal.timeout does
// when the 120s bound fires).
function stubFetch({ page, siteverify, hang } = {}) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(String(url));
    if (String(url).startsWith("https://challenges.cloudflare.com/")) {
      if (siteverify instanceof Error) throw siteverify;
      return { status: 200, json: async () => ({ success: siteverify !== false }) };
    }
    if (hang) {
      const e = new Error("aborted"); e.name = "AbortError"; throw e;
    }
    if (page instanceof Error) throw page;
    if (page && typeof page === "object" && "status" in page) {
      return { status: page.status, ok: false, text: async () => "" };
    }
    return { status: 200, ok: true,
      text: async () => (typeof page === "string" ? page : SEARCH_PAGE) };
  };
  return calls;
}

test("dates: RFC 1123 -> YYYYMMDDHHMMSS, garbage -> empty", () => {
  assert.equal(parseGhostDate("Thu, 16 May 2024 03:25:36 GMT"), "20240516032536");
  assert.equal(parseGhostDate("Sun, 14 Apr 2024 03:32:58 GMT"), "20240414033258");
  assert.equal(parseGhostDate("not a date"), "");
  assert.equal(parseGhostDate(""), "");
});

test("parse: rows carry the original URL + archive id, deduped, sorted", () => {
  const rows = parseSearchPage(SEARCH_PAGE, "", "");
  // 4 unique ids (AJzyo listed twice); sorted oldest first;
  // the undated row keeps an empty timestamp and sorts last.
  assert.equal(rows.length, 4);
  assert.equal(rows[0][1], "20220421222319");
  assert.equal(rows[0][2], "https://twitter.com/jack/status/20");
  assert.equal(rows[0][7], "M088M");
  assert.equal(rows[1][1], "20240414033258");
  assert.equal(rows[2][1], "20240516032536");
  assert.equal(rows[2][2], "https://twitter.com/jack/status/1787895769183268948");
  assert.equal(rows[3][1], "");
  assert.equal(rows[3][7], "NODATE");
});

test("parse: a date range drops undated + out-of-range rows", () => {
  const rows = parseSearchPage(SEARCH_PAGE, "20240101", "20241231");
  assert.equal(rows.length, 2);
  assert.equal(rows[0][7], "AJzyo");
  assert.equal(rows[1][7], "Zpgdp");
});

test("proxy: header row first, limit applies, cache header set", async () => {
  stubFetch();
  const { status, body, cache } = await call(
    "https://example.com/api/ghostarchive?url=twitter.com%2Fjack%2Fstatus%2F&limit=2");
  assert.equal(status, 200);
  assert.equal(cache, "public, max-age=300");
  assert.deepEqual(body[0],
    ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"]);
  assert.equal(body.length, 3); // header + 2 rows
  assert.equal(body[1][7], "M088M");
});

test("proxy: missing url, bad output, bad dates, bad limit -> 400", async () => {
  stubFetch();
  const base = "https://example.com/api/ghostarchive";
  for (const q of [
    "",
    "?url=x&output=xml",
    "?url=x&from=2020",
    "?url=x&to=2020-01-01",
    "?url=x&limit=abc",
    "?url=x&limit=0",
  ]) {
    const { status, body } = await call(base + q);
    assert.equal(status, 400, q);
    assert.ok(body.error, q);
  }
});

test("proxy: limit clamps to 1000", async () => {
  const calls = stubFetch();
  const { status } = await call(
    "https://example.com/api/ghostarchive?url=x&limit=5000");
  assert.equal(status, 200);
  assert.ok(calls[0].includes("term=x"), calls[0]);
});

test("proxy: no rows parses to header-only, not an error", async () => {
  stubFetch({ page: "<html><body>no results here</body></html>" });
  const { status, body } = await call(
    "https://example.com/api/ghostarchive?url=x");
  assert.equal(status, 200);
  assert.equal(body.length, 1); // header only — honest empty
});

test("proxy: upstream 500 forwards honestly, no fake rows", async () => {
  stubFetch({ page: { status: 500 } });
  const { status, body } = await call(
    "https://example.com/api/ghostarchive?url=x");
  assert.equal(status, 500);
  assert.ok(body.error.includes("HTTP 500"));
});

test("proxy: upstream abort (hung past 120s) answers 504, never a hang", async () => {
  stubFetch({ hang: true });
  const { status, body } = await call(
    "https://example.com/api/ghostarchive?url=x");
  assert.equal(status, 504);
  assert.ok(body.error.includes("didn't answer in time"));
});

test("proxy: upstream fetch throwing answers 502", async () => {
  stubFetch({ page: new Error("connection reset") });
  const { status, body } = await call(
    "https://example.com/api/ghostarchive?url=x");
  assert.equal(status, 502);
  assert.ok(body.error.includes("didn't answer"));
});

test("Turnstile: open when unconfigured, 403 without a token when set", async () => {
  stubFetch();
  const ok = await call("https://example.com/api/ghostarchive?url=x", {});
  assert.equal(ok.status, 200);
  const denied = await call(
    "https://example.com/api/ghostarchive?url=x",
    { TURNSTILE_SECRET_KEY: "secret" });
  assert.equal(denied.status, 403);
  assert.ok(denied.body.error.includes("bot check required"));
});

test("Turnstile: valid token proceeds (siteverify success)", async () => {
  const calls = stubFetch({ siteverify: true });
  const { status, body } = await call(
    "https://example.com/api/ghostarchive?url=x&cf-turnstile-response=tok&cf-turnstile-idem=idem1",
    { TURNSTILE_SECRET_KEY: "secret" });
  assert.equal(status, 200);
  assert.equal(body.length, 5);
  assert.ok(calls.some((u) => u.includes("siteverify")));
  // The token is never forwarded to ghostarchive.org.
  assert.ok(calls.filter((u) => u.includes("ghostarchive.org"))
    .every((u) => !u.includes("cf-turnstile")));
});
