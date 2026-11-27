/* Node test for functions/api/live-check.js — no dependencies, no
 * browser, no network (fetch is stubbed).
 *
 * Run:  node functions/api/live-check.test.mjs
 * Exit 0 = the verdicts mirror wayback_social/diff.py classify_live:
 * 200 -> live, 404/410 -> deleted, 401/403/429/5xx/timeout/login
 * redirect -> unknown (NEVER deleted), X 403 -> oEmbed tie-breaker
 * (404 deleted / 200 live), oEmbed never consulted on 5xx.
 * Guards: POST only, {urls} required, >25 URLs rejected, bad JSON
 * rejected, non-http(s) URLs are unknown.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { onRequest, MAX_URLS } from "./live-check.js";

function req(method, body, raw) {
  return {
    method,
    json: async () => {
      if (raw !== undefined) throw new Error("bad json");
      return body;
    },
  };
}

async function call(body, method = "POST", raw) {
  const res = await onRequest({ request: req(method, body, raw) });
  return { status: res.status, body: JSON.parse(await res.text()) };
}

// Stub fetch: url -> {status, url} or an Error to throw. oEmbed is
// keyed on the publish.twitter.com host.
function stubFetch(map) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: opts && opts.method });
    const key = String(url);
    if (key.startsWith("https://publish.twitter.com/oembed")) {
      const hit = map.oembed;
      if (hit instanceof Error) throw hit;
      return { status: hit, url: key };
    }
    const hit = map[key];
    if (hit === undefined) throw new Error("unexpected fetch: " + key);
    if (hit instanceof Error) throw hit;
    return { status: hit.status, url: hit.url || key };
  };
  return calls;
}

test("200 is live, 404/410 deleted, 500/timeout unknown", async () => {
  stubFetch({
    "https://example.com/live": { status: 200 },
    "https://example.com/gone": { status: 404 },
    "https://example.com/gone2": { status: 410 },
    "https://example.com/broken": { status: 500 },
    "https://example.com/slow": new Error("timed out"),
  });
  const { status, body } = await call({ urls: [
    "https://example.com/live", "https://example.com/gone",
    "https://example.com/gone2", "https://example.com/broken",
    "https://example.com/slow",
  ] });
  assert.equal(status, 200);
  const v = Object.fromEntries(body.results.map((r) => [r.url, r.live_verdict]));
  assert.equal(v["https://example.com/live"], "live");
  assert.equal(v["https://example.com/gone"], "deleted");
  assert.equal(v["https://example.com/gone2"], "deleted");
  assert.equal(v["https://example.com/broken"], "unknown");
  assert.equal(v["https://example.com/slow"], "unknown");
  assert.equal(body.results.find((r) => r.url === "https://example.com/gone").live_http_status, 404);
});

test("login redirect is unknown, never deleted", async () => {
  stubFetch({
    "https://www.instagram.com/p/ABC/": { status: 200, url: "https://www.instagram.com/accounts/login/" },
  });
  const { body } = await call({ urls: ["https://www.instagram.com/p/ABC/"] });
  assert.equal(body.results[0].live_verdict, "unknown");
  assert.equal(body.results[0].live_final_url, "https://www.instagram.com/accounts/login/");
});

test("HEAD 405 falls back to GET", async () => {
  let head = true;
  globalThis.fetch = async (url, opts) => {
    if (opts && opts.method === "HEAD" && head) { head = false; return { status: 405, url }; }
    return { status: 200, url };
  };
  const { body } = await call({ urls: ["https://example.com/headless"] });
  assert.equal(body.results[0].live_verdict, "live");
  assert.equal(body.results[0].live_http_status, 200);
});

test("X 403 consults oEmbed: 404 deleted, 200 live", async () => {
  const calls = stubFetch({
    "https://x.com/jack/status/20": { status: 403 },
    "https://x.com/jack/status/21": { status: 403 },
    oembed: 404,
  });
  let { body } = await call({ urls: ["https://x.com/jack/status/20"] });
  assert.equal(body.results[0].live_verdict, "deleted");
  // Second URL: oEmbed 200 -> live.
  stubFetch({
    "https://x.com/jack/status/21": { status: 403 },
    oembed: 200,
  });
  ({ body } = await call({ urls: ["https://x.com/jack/status/21"] }));
  assert.equal(body.results[0].live_verdict, "live");
  assert.ok(calls.some((c) => c.url.startsWith("https://publish.twitter.com/oembed")));
});

test("oEmbed is NOT consulted on 5xx", async () => {
  const calls = stubFetch({
    "https://x.com/jack/status/22": { status: 500 },
    oembed: 404,
  });
  const { body } = await call({ urls: ["https://x.com/jack/status/22"] });
  assert.equal(body.results[0].live_verdict, "unknown");
  assert.ok(!calls.some((c) => c.url.startsWith("https://publish.twitter.com/oembed")));
});

test("guards: POST only, urls required, >25 rejected, bad JSON, non-http", async () => {
  let r = await call({ urls: ["https://example.com/x"] }, "GET");
  assert.equal(r.status, 405);
  r = await call({ urls: [] });
  assert.equal(r.status, 400);
  r = await call({ urls: "nope" });
  assert.equal(r.status, 400);
  r = await call({ urls: Array.from({ length: MAX_URLS + 1 }, (_, i) => "https://example.com/" + i) });
  assert.equal(r.status, 400);
  r = await call(undefined, "POST", true);
  assert.equal(r.status, 400);
  stubFetch({});
  r = await call({ urls: ["ftp://example.com/x", "not a url"] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.results.map((x) => x.live_verdict), ["unknown", "unknown"]);
});
