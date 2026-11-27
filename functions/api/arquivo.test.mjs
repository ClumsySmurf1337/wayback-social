/* Node test for functions/api/arquivo.js — no dependencies, no
 * browser, no network (fetch is stubbed).
 *
 * Run:  node functions/api/arquivo.test.mjs
 * Exit 0 = the proxy mirrors /api/cdx's contract: allowlisted
 * params only, CDX-array rows with a header row first (so the web
 * client parses both identically), doubled slashes fixed, from/to
 * enforced server-side, keyword mode filtered by handle-in-URL
 * (a URL match, not authorship), upstream errors forwarded honestly
 * (never fake rows), a hung upstream answers 504, Turnstile open
 * when unconfigured and enforced when configured.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "./arquivo.js";

const CDX_JSONL = [
  JSON.stringify({ urlkey: "com,twitter)/jack/status/20", timestamp: "20180809180019",
    url: "https://twitter.com//jack//status//20", mime: "text/html", status: "200",
    digest: "ABC", length: "50815" }),
  JSON.stringify({ urlkey: "com,twitter)/jack/status/20", timestamp: "20180810185735",
    url: "https://twitter.com/jack/status/20", mime: "text/html", status: "200",
    digest: "DEF", length: "50815" }),
  JSON.stringify({ urlkey: "com,twitter)/jack/status/21", timestamp: "20200101000000",
    url: "https://twitter.com/jack/status/21", mime: "text/html", status: "200",
    digest: "GHI", length: "100" }),
  "not json at all",
  JSON.stringify({ urlkey: "x", timestamp: "", url: "" }),
].join("\n");

const TEXTSEARCH = {
  response_items: [
    { originalURL: "https://twitter.com/jack/status/20", tstamp: "20180809180019",
      title: "jack post", mimeType: "text/html", status: "200", digest: "ABC" },
    { originalURL: "https://example.com/about-jack", tstamp: "20190101000000",
      title: "about jack", mimeType: "text/html", status: "200", digest: "DEF" },
    { originalURL: "https://twitter.com/other/status/9", tstamp: "20170101000000",
      title: "other", mimeType: "text/html", status: "200", digest: "GHI" },
  ],
};

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
function stubFetch({ cdx, textsearch, siteverify, hang } = {}) {
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
    if (String(url).startsWith("https://arquivo.pt/textsearch")) {
      if (textsearch instanceof Error) throw textsearch;
      if (textsearch && typeof textsearch === "object" && "status" in textsearch) {
        return { status: textsearch.status, ok: false,
          text: async () => "", json: async () => ({}) };
      }
      return { status: 200, ok: true,
        text: async () => JSON.stringify(TEXTSEARCH),
        json: async () => TEXTSEARCH };
    }
    if (cdx instanceof Error) throw cdx;
    if (cdx && typeof cdx === "object" && "status" in cdx) {
      return { status: cdx.status, ok: false,
        text: async () => "", json: async () => ({}) };
    }
    return { status: 200, ok: true,
      text: async () => (typeof cdx === "string" ? cdx : CDX_JSONL),
      json: async () => ({}) };
  };
  return calls;
}

test("CDX mode: header row first, doubled slashes fixed, range enforced", async () => {
  stubFetch();
  const { status, body, cache } = await call(
    "https://example.com/api/arquivo?mode=cdx&url=twitter.com%2Fjack%2Fstatus%2F*&from=20180801&to=20181231&limit=50");
  assert.equal(status, 200);
  assert.equal(cache, "public, max-age=300");
  assert.deepEqual(body[0],
    ["urlkey", "timestamp", "original", "mimetype", "statuscode", "digest", "length"]);
  // 20180809 + 20180810 in range; 2020-01-01 out of range; the bad
  // line and the empty row are skipped.
  assert.equal(body.length, 3);
  assert.equal(body[1][2], "https://twitter.com/jack/status/20");
  assert.equal(body[1][1], "20180809180019");
  assert.equal(body[2][1], "20180810185735");
});

test("CDX mode: no from/to returns everything, sorted oldest first", async () => {
  stubFetch();
  const { status, body } = await call(
    "https://example.com/api/arquivo?mode=cdx&url=twitter.com%2Fjack%2Fstatus%2F*");
  assert.equal(status, 200);
  assert.equal(body.length, 4); // header + 3 rows
  assert.equal(body[1][1], "20180809180019");
  assert.equal(body[3][1], "20200101000000");
});

test("CDX mode: missing url, bad mode, bad output, bad dates, bad limit -> 400", async () => {
  stubFetch();
  const base = "https://example.com/api/arquivo";
  for (const q of [
    "?mode=cdx",
    "?mode=banana&url=x",
    "?mode=cdx&url=x&output=xml",
    "?mode=cdx&url=x&from=2020",
    "?mode=cdx&url=x&to=2020-01-01",
    "?mode=cdx&url=x&limit=abc",
    "?mode=cdx&url=x&limit=0",
    "?mode=keyword&q=jack",
    "?mode=keyword&handle=jack",
  ]) {
    const { status, body } = await call(base + q);
    assert.equal(status, 400, q);
    assert.ok(body.error, q);
  }
});

test("CDX mode: limit clamps to 1000", async () => {
  const calls = stubFetch();
  const { status, body } = await call(
    "https://example.com/api/arquivo?mode=cdx&url=x&limit=5000");
  assert.equal(status, 200);
  assert.equal(body.length, 4);
  assert.ok(calls[0].includes("limit=1000"), calls[0]);
});

test("keyword mode: handle filter is a URL match, sorted oldest first", async () => {
  stubFetch();
  const { status, body } = await call(
    "https://example.com/api/arquivo?mode=keyword&q=jack&handle=jack&limit=50");
  assert.equal(status, 200);
  // twitter.com/jack/status/20 + example.com/about-jack (URL
  // contains "jack"); twitter.com/other/status/9 is filtered out.
  assert.equal(body.length, 3);
  assert.equal(body[1][2], "https://twitter.com/jack/status/20");
  assert.equal(body[1][1], "20180809180019");
  assert.equal(body[2][2], "https://example.com/about-jack");
});

test("keyword mode: handle is case-insensitive, @ stripped", async () => {
  stubFetch();
  const { status, body } = await call(
    "https://example.com/api/arquivo?mode=keyword&q=jack&handle=%40JACK&limit=50");
  assert.equal(status, 200);
  assert.equal(body.length, 3);
});

test("upstream 500 forwards honestly, no fake rows", async () => {
  stubFetch({ cdx: { status: 500 } });
  const { status, body } = await call(
    "https://example.com/api/arquivo?mode=cdx&url=x");
  assert.equal(status, 500);
  assert.ok(body.error.includes("HTTP 500"));
});

test("upstream abort (hung past 120s) answers 504, never a hang", async () => {
  stubFetch({ hang: true });
  const { status, body } = await call(
    "https://example.com/api/arquivo?mode=cdx&url=x");
  assert.equal(status, 504);
  assert.ok(body.error.includes("didn't answer in time"));
});

test("upstream fetch throwing answers 502", async () => {
  stubFetch({ cdx: new Error("connection reset") });
  const { status, body } = await call(
    "https://example.com/api/arquivo?mode=cdx&url=x");
  assert.equal(status, 502);
  assert.ok(body.error.includes("didn't answer"));
});

test("Turnstile: open when unconfigured, 403 without a token when set", async () => {
  stubFetch();
  const ok = await call("https://example.com/api/arquivo?mode=cdx&url=x", {});
  assert.equal(ok.status, 200);
  const denied = await call(
    "https://example.com/api/arquivo?mode=cdx&url=x",
    { TURNSTILE_SECRET_KEY: "secret" });
  assert.equal(denied.status, 403);
  assert.ok(denied.body.error.includes("bot check required"));
});

test("Turnstile: valid token proceeds (siteverify success)", async () => {
  const calls = stubFetch({ siteverify: true });
  const { status, body } = await call(
    "https://example.com/api/arquivo?mode=cdx&url=x&cf-turnstile-response=tok&cf-turnstile-idem=idem1",
    { TURNSTILE_SECRET_KEY: "secret" });
  assert.equal(status, 200);
  assert.equal(body.length, 4);
  assert.ok(calls.some((u) => u.includes("siteverify")));
  // The token is never forwarded to arquivo.pt.
  assert.ok(calls.filter((u) => u.includes("arquivo.pt"))
    .every((u) => !u.includes("cf-turnstile")));
});
