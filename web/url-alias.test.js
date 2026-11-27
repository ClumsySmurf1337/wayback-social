/* Node test for web/url-alias.js (Track K item 3).
 * Pure-function checks: canonical host / URL / dedup key. The
 * through-the-search-path checks live in web/arquivo.test.js
 * (Both + x.com / www alias blocks). Run: node web/url-alias.test.js
 */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  " + JSON.stringify(actual) +
    (ok ? "" : "  (expected " + JSON.stringify(expected) + ")"));
}

const sandbox = { window: {}, URL, console };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "url-alias.js"), "utf8"),
  sandbox, { filename: "url-alias.js" });
const A = sandbox.window.WS_URL_ALIAS;

check("WS_URL_ALIAS loads", typeof A, "object");
check("x.com canonicalises to twitter.com", A.canonicalHost("x.com"), "twitter.com");
check("twitter.com stays twitter.com", A.canonicalHost("twitter.com"), "twitter.com");
check("www. is stripped", A.canonicalHost("www.twitter.com"), "twitter.com");
check("host is lowercased", A.canonicalHost("X.COM"), "twitter.com");
check("unrelated host untouched", A.canonicalHost("instagram.com"), "instagram.com");
check("canonicalUrl rewrites x.com", A.canonicalUrl("https://x.com/jack/status/1"), "https://twitter.com/jack/status/1");
check("canonicalUrl strips www.", A.canonicalUrl("https://www.twitter.com/jack/status/1"), "https://twitter.com/jack/status/1");
check("canonicalUrl leaves other hosts alone", A.canonicalUrl("https://instagram.com/p/abc"), "https://instagram.com/p/abc");
check("dedupKey merges aliases at the same timestamp",
  A.dedupKey("20230101120000", "https://x.com/jack/status/1"),
  A.dedupKey("20230101120000", "https://twitter.com/jack/status/1"));
check("dedupKey differs across timestamps",
  A.dedupKey("20230101120000", "https://x.com/jack/status/1") !==
  A.dedupKey("20230401120000", "https://x.com/jack/status/1"), true);
check("dedupKey differs across posts",
  A.dedupKey("20230101120000", "https://x.com/jack/status/1") !==
  A.dedupKey("20230101120000", "https://x.com/jack/status/2"), true);
check("unparsable URL falls back to the raw string",
  A.dedupKey("20230101120000", "not a url"), "20230101120000|not a url");

console.log(failures === 0
  ? `\nurl-alias: ${checks} checks passed`
  : `\nurl-alias: ${failures}/${checks} checks FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
