/* wayback-social / DeletedProof — licence keys in the browser.
 *
 * Mirrors wayback_social/licence.py (same format, same checksum):
 *   DP1-<TIER>-<16 random base32 chars>-<8 hex HMAC-SHA256 chars>
 *   checksum = HMAC-SHA256("DP1:<TIER>:<RANDOM>", secret)[:8]
 *
 * DEMO VERIFICATION ONLY. The secret below is a well-known demo
 * secret — keys minted with it work in this page so the tier UI can
 * be tried end to end, but they are NOT purchases and they prove
 * nothing. Production keys are minted server-side (Paddle webhook
 * -> Ed25519-signed key -> D1 -> Resend email) and verified against
 * the baked-in PUBLIC key — see docs/storage-auth-plan.md. A licence
 * key is never sent anywhere by this page: verification runs locally
 * in the browser, and the key lives in localStorage on this device.
 *
 * Works in the browser (window.WAYBACK_LICENCE) and in Node
 * (module.exports) — the same code is tested by tests/test_web_tiers.py.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.WAYBACK_LICENCE = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEMO_SECRET = "deletedproof-demo-secret"; // DEMO ONLY — see header
  var KEY_PREFIX = "DP1";
  var TIERS = ["free", "starter", "pro", "studio"];

  // DP2 — production keys (Ed25519, minted by the Paddle webhook).
  // Public key only: it verifies, it cannot mint. Same keypair as
  // wayback_social/licence2.py (generated 2026-11-26 by
  // scripts/gen_licence_keys.mjs). The private key is a Pages secret.
  // Ed25519 in WebCrypto needs a modern browser (Chrome 137+, Safari
  // 17+); older browsers get needsOnline:true and should use
  // POST /api/licence-check instead.
  var DP2_PREFIX = "DP2";
  // Mutable holder (not a plain var): verifyKeyDP2 reads DP2_KEY.jwk
  // so tests can swap the key without reloading the module.
  var DP2_KEY = { jwk: { kty: "OKP", crv: "Ed25519", x: "RKv2d0s14DXxgqIm4SbtMN1uUmK_-4CHVF5SaCe89Vs" } };
  var DP2_PUBLIC_KEY_JWK = DP2_KEY.jwk;

  // Plan caps — mirror of pricing.yaml / plans.py (generated values
  // are copied here by scripts/sync_pricing.py; keep them in sync).
  var PLAN_CAPS = {
    // deleted_diff mirrors pricing.yaml features.deleted_diff (false on
    // free, true on paid tiers) — the web deleted-diff UI gates on it.
    // keyword_search mirrors pricing.yaml features.keyword_search
    // (false on free/starter, true on pro/studio) — the Arquivo.pt
    // keyword search gates on it (web/arquivo.js). The six numeric
    // caps stay in sync with plans.py (see
    // test_js_caps_match_python_caps); these two booleans are the only
    // extra fields, and they change no price or cap.
    free:    {archive_limit: 25,    find_networks: 3,  batch_targets: 3,   fetch_text: 5,    evidence_reports: 0,  seats: 1, exports: ["csv"], deleted_diff: false, keyword_search: false},
    starter: {archive_limit: 250,   find_networks: 7,  batch_targets: 10,  fetch_text: 100,  evidence_reports: 0,  seats: 1, exports: ["csv", "json"], deleted_diff: true, keyword_search: false},
    pro:     {archive_limit: 2500,  find_networks: 14, batch_targets: 50,  fetch_text: 1000, evidence_reports: 0,  seats: 1, exports: ["csv", "json", "jsonl", "html"], deleted_diff: true, keyword_search: true},
    studio:  {archive_limit: 25000, find_networks: 14, batch_targets: 200, fetch_text: 10000, evidence_reports: 10, seats: 5, exports: ["csv", "json", "jsonl", "html"], deleted_diff: true, keyword_search: true},
  };
  var BUNDLE_CAPS = {archive_limit: 25000, find_networks: 14, batch_targets: 200, fetch_text: 10000, evidence_reports: 10, seats: 5, exports: ["csv", "json", "jsonl", "html"], deleted_diff: true, keyword_search: true};

  function parseKey(key) {
    var parts = (key || "").trim().split("-");
    if (parts.length !== 4 || parts[0] !== KEY_PREFIX) return null;
    var tier = parts[1].toLowerCase();
    if (TIERS.indexOf(tier) < 0) return null;
    if (parts[2].length !== 16 || !/^[A-Z0-9]+$/.test(parts[2])) return null;
    if (parts[3].length !== 8 || !/^[0-9a-fA-F]+$/.test(parts[3])) return null;
    return {tier: tier, random: parts[2], checksum: parts[3].toLowerCase()};
  }

  async function hmacHex(secret, message) {
    var cryptoObj = (typeof crypto !== "undefined" && crypto.subtle)
      ? crypto
      : (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle
        ? globalThis.crypto : null);
    if (!cryptoObj) throw new Error("Web Crypto (subtle) is not available");
    var enc = new TextEncoder();
    var key = await cryptoObj.subtle.importKey(
      "raw", enc.encode(secret), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
    var sig = await cryptoObj.subtle.sign("HMAC", key, enc.encode(message));
    return Array.from(new Uint8Array(sig))
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  async function verifyKey(key, secret) {
    var parsed = parseKey(key);
    if (!parsed) {
      return {valid: false, tier: null,
              reason: "malformed key — expected DP1-<TIER>-<16 chars>-<8 hex chars>"};
    }
    var expected = (await hmacHex(secret || DEMO_SECRET,
      KEY_PREFIX + ":" + parsed.tier.toUpperCase() + ":" + parsed.random)).slice(0, 8);
    if (expected !== parsed.checksum) {
      return {valid: false, tier: null,
              reason: "checksum mismatch — not minted with this secret"};
    }
    return {valid: true, tier: parsed.tier, reason: "valid"};
  }

  function mintKey(tier, secret) {
    // Demo/dev minting only (the page never calls this for real
    // purchases). Randomness: crypto.getRandomValues when available.
    var t = (tier || "").toLowerCase();
    if (TIERS.indexOf(t) < 0) throw new Error("unknown tier: " + tier);
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    var bytes = new Uint8Array(10);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    var random = "";
    var acc = 0, bits = 0;
    for (var j = 0; j < bytes.length; j++) {
      acc = (acc << 8) | bytes[j]; bits += 8;
      while (bits >= 5) { random += alphabet[(acc >> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) random += alphabet[(acc << (5 - bits)) & 31];
    random = random.slice(0, 16);
    return hmacHex(secret || DEMO_SECRET,
      KEY_PREFIX + ":" + t.toUpperCase() + ":" + random).then(function (hex) {
      return KEY_PREFIX + "-" + t.toUpperCase() + "-" + random + "-" + hex.slice(0, 8);
    });
  }

  function b64urlDecode(text) {
    var s = (text || "").replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function parseKeyDP2(key) {
    // Base64url includes "-", so split into at most 4 parts: the
    // signature is always last and may itself contain dashes.
    var raw = (key || "").trim().split("-");
    if (raw.length < 4 || raw[0] !== DP2_PREFIX) return null;
    var parts = [raw[0], raw[1], raw[2], raw.slice(3).join("-")];
    var tier = parts[1].toLowerCase();
    if (TIERS.indexOf(tier) < 0) return null;
    if (parts[2].length !== 16 || !/^[A-Z0-9]+$/.test(parts[2])) return null;
    var sig;
    try { sig = b64urlDecode(parts[3]); } catch (e) { return null; }
    if (sig.length !== 64) return null;
    return { tier: tier, random: parts[2], signature: sig };
  }

  async function verifyKeyDP2(key) {
    // Production key: Ed25519 signature over "DP2:<TIER>:<RANDOM>".
    var parsed = parseKeyDP2(key);
    if (!parsed) {
      return { valid: false, tier: null, scheme: "DP2",
        reason: "malformed key — expected DP2-<TIER>-<16 chars>-<86-char signature>" };
    }
    var cryptoObj = (typeof crypto !== "undefined" && crypto.subtle) ? crypto : null;
    if (!cryptoObj) {
      return { valid: false, tier: null, scheme: "DP2", needsOnline: true,
        reason: "this browser has no Web Crypto — verify online via /api/licence-check" };
    }
    var pub;
    try {
      pub = await cryptoObj.subtle.importKey(
        "jwk", DP2_KEY.jwk, { name: "Ed25519" }, false, ["verify"]);
    } catch (e) {
      return { valid: false, tier: null, scheme: "DP2", needsOnline: true,
        reason: "this browser does not support Ed25519 — verify online via /api/licence-check" };
    }
    var msg = new TextEncoder().encode(
      DP2_PREFIX + ":" + parsed.tier.toUpperCase() + ":" + parsed.random);
    var ok = false;
    try {
      ok = await cryptoObj.subtle.verify({ name: "Ed25519" }, pub, parsed.signature, msg);
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      return { valid: false, tier: null, scheme: "DP2",
        reason: "signature mismatch — not minted with the production key" };
    }
    return { valid: true, tier: parsed.tier, scheme: "DP2", reason: "valid" };
  }

  // Dispatcher: DP1 (HMAC demo/dev) or DP2 (Ed25519 production).
  // verifyKey keeps its old (key, secret) signature for DP1 callers.
  async function verifyAnyKey(key, secret) {
    var k = (key || "").trim();
    if (k.indexOf(DP2_PREFIX + "-") === 0) return verifyKeyDP2(k);
    return verifyKey(k, secret);
  }

  function planCaps(tier) {
    if (tier === "bundle") return Object.assign({}, BUNDLE_CAPS);
    return PLAN_CAPS[tier] ? Object.assign({}, PLAN_CAPS[tier]) : Object.assign({}, PLAN_CAPS.free);
  }

  function tierLabel(tier) {
    return {free: "Free", starter: "Starter", pro: "Pro Pack", studio: "Studio", bundle: "All-in Bundle"}[tier] || "Free";
  }

  return {
    DEMO_SECRET: DEMO_SECRET, TIERS: TIERS, PLAN_CAPS: PLAN_CAPS, BUNDLE_CAPS: BUNDLE_CAPS,
    DP2_PUBLIC_KEY_JWK: DP2_PUBLIC_KEY_JWK, DP2_KEY: DP2_KEY,
    parseKey: parseKey, verifyKey: verifyKey, mintKey: mintKey,
    parseKeyDP2: parseKeyDP2, verifyKeyDP2: verifyKeyDP2, verifyAnyKey: verifyAnyKey,
    planCaps: planCaps, tierLabel: tierLabel,
  };
});
