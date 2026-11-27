"""Tests for Clerk auth (issue #6) + Turnstile bot check.

Node tests (web/auth.test.js, web/turnstile.test.js) cover the pure
client logic. The Pages Functions (link-licence.js, cdx.js Turnstile
branch) are tested here by importing them as .mjs with stubbed fetch
/ D1 — no Clerk account, no D1, no network needed.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"


def _node(script: str, timeout: int = 30) -> dict:
    out = subprocess.run(["node", "--input-type=module", "-e", script],
                         capture_output=True, text=True, cwd=ROOT, timeout=timeout)
    assert out.returncode == 0, out.stderr + out.stdout
    return json.loads(out.stdout)


def test_auth_node_tests_pass():
    out = subprocess.run(["node", "web/auth.test.js"],
                         capture_output=True, text=True, cwd=ROOT, timeout=30)
    assert out.returncode == 0, out.stdout + out.stderr
    assert "All auth checks passed." in out.stdout


def test_turnstile_node_tests_pass():
    out = subprocess.run(["node", "web/turnstile.test.js"],
                         capture_output=True, text=True, cwd=ROOT, timeout=30)
    assert out.returncode == 0, out.stdout + out.stderr
    assert "All turnstile checks passed." in out.stdout


def test_config_has_clerk_and_turnstile_placeholders():
    cfg = (WEB / "config.js").read_text(encoding="utf-8")
    # Dev publishable key is WIRED (Socialz dev app, 2026-11-27) — the
    # old placeholder assertion is stale. The dev key is public by
    # design; the PROD key stays a placeholder until the production
    # Clerk instance exists (docs/clerk-env-swap.md §10).
    assert "pk_test_YmVsb3ZlZC1nYXplbGxlLTQ2NzguY2xlcmsuYWNjb3VudHMuZGV2JA" in cfg
    assert "pk_test_REPLACE_CLERK_PUBLISHABLE_KEY" not in cfg
    assert "CLERK_SECRET_KEY" in cfg  # documented as env-only, never here
    # Turnstile site key is WIRED (widget "ArchiveCheck — deletedproof",
    # created via API 2026-11-27) — the same staleness as the Clerk key
    # above. The site key is public by design; the SECRET key stays
    # env-only (TURNSTILE_SECRET_KEY in Pages env vars, both envs).
    assert "0x4AAAAAAGV8UGE-2rGL9e1L" in cfg
    assert "REPLACE_TURNSTILE_SITE_KEY" not in cfg
    assert "TURNSTILE_SECRET_KEY" in cfg
    # No real secret may ever ship in the repo.
    assert "sk_test_" not in cfg and "sk_live_" not in cfg


def test_runtime_config_node_tests_pass():
    out = subprocess.run(["node", "web/runtime-config.test.js"],
                         capture_output=True, text=True, cwd=ROOT, timeout=30)
    assert out.returncode == 0, out.stdout + out.stderr
    assert "All runtime-config checks passed." in out.stdout


def test_config_endpoint_returns_public_keys_only(tmp_path):
    """GET /api/config: env keys in, public keys out — never a secret.
    Unset env -> enabled:false (page falls back to web/config.js)."""
    mjs = _copy_function_to_mjs(tmp_path, "config.js")
    script = f"""
import {{ onRequest }} from {json.dumps(str(mjs))};
const get = async (env) => {{
  const r = await onRequest({{ request: new Request("https://example.com/api/config"), env }});
  return {{ status: r.status, body: await r.json() }};
}};
const withKeys = await get({{ CLERK_PUBLISHABLE_KEY: "pk_test_x", TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }});
const empty = await get({{}});
const replaced = await get({{ CLERK_PUBLISHABLE_KEY: "pk_live_REPLACE_X", TURNSTILE_SITE_KEY: "REPLACE_TURNSTILE_SITE_KEY" }});
const post = await onRequest({{ request: new Request("https://example.com/api/config", {{ method: "POST" }}), env: {{}} }});
const leaked = JSON.stringify(withKeys.body).toLowerCase();
console.log(JSON.stringify({{
  withKeysStatus: withKeys.status, clerkKey: withKeys.body.clerk.publishable_key,
  clerkOn: withKeys.body.clerk.enabled, turnKey: withKeys.body.turnstile.site_key,
  turnOn: withKeys.body.turnstile.enabled,
  emptyClerk: empty.body.clerk.publishable_key, emptyClerkOn: empty.body.clerk.enabled,
  emptyTurn: empty.body.turnstile.site_key, emptyTurnOn: empty.body.turnstile.enabled,
  replacedClerk: replaced.body.clerk.publishable_key, replacedClerkOn: replaced.body.clerk.enabled,
  post: post.status, noSecretField: !leaked.includes("secret"),
}}));
"""
    res = _node(script)
    assert res["withKeysStatus"] == 200, res
    assert res["clerkKey"] == "pk_test_x" and res["clerkOn"] is True, res
    assert res["turnKey"] == "1x00000000000000000000AA" and res["turnOn"] is True, res
    assert res["emptyClerk"] is None and res["emptyClerkOn"] is False, res
    assert res["emptyTurn"] is None and res["emptyTurnOn"] is False, res
    assert res["replacedClerk"] is None and res["replacedClerkOn"] is False, res
    assert res["post"] == 405, res
    assert res["noSecretField"] is True, res


def test_pages_reference_auth_files():
    index = (WEB / "index.html").read_text(encoding="utf-8")
    for needle in ("auth.js", "auth-ui.js", "turnstile.js", "runtime-config.js", "auth-area",
                   "auth-modal", "turnstile-widget"):
        assert needle in index, needle
    dash = (WEB / "dashboard.html").read_text(encoding="utf-8")
    for needle in ("auth.js", "auth-ui.js", "runtime-config.js", "account-card", "link-licence-box"):
        assert needle in dash, needle


def test_wrangler_documents_d1_binding():
    wrangler = (ROOT / "wrangler.toml").read_text(encoding="utf-8")
    # D1 exists (created 2026-11-26 by the Paddle webhook build):
    # active binding, real database id, no placeholder left.
    assert "[[d1_databases]]" in wrangler
    assert 'database_name = "wayback-social-licences"' in wrangler
    assert "38a206cb-5256-4ff0-b8b7-d5a06c2d4d22" in wrangler
    assert "REPLACE_D1_DATABASE_ID" not in wrangler
    # The users table for link-licence.js ships as a versioned
    # migration next to the webhook agent's 0001.
    users_sql = (ROOT / "migrations" / "0002_users.sql").read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS users" in users_sql
    assert "clerk_user_id TEXT PRIMARY KEY" in users_sql
    assert "licence_key_hash" in users_sql
    assert "migrations/0002_users.sql" in wrangler


def test_console_delegates_tier_to_auth():
    console = (WEB / "console.js").read_text(encoding="utf-8")
    assert "WS_AUTH.effectiveTier" in console
    assert "ensureSearchToken" in console
    # The Turnstile token ride-along lives in console-fetch.js since
    # Track K split the CDX transport out of console.js (behaviour
    # identical — cdxUrl() still attaches cf-turnstile-response to
    # proxy requests; only the file moved).
    fetch_layer = (WEB / "console-fetch.js").read_text(encoding="utf-8")
    assert "cf-turnstile-response" in fetch_layer
    assert "ensureSearchToken" in fetch_layer


def _copy_function_to_mjs(tmp_path, name):
    src = ROOT / "functions" / "api" / name
    assert src.is_file(), f"{name} missing"
    # Preserve the functions/ layout: api/<name> imports ../_lib/*.js
    # (dp2.js + verify-key.js — the shared licence verifier;
    # turnstile.js — the shared Turnstile verifier, used by cdx.js
    # since Track K item 5).
    api_dir = tmp_path / "api"
    lib_dir = tmp_path / "_lib"
    api_dir.mkdir(exist_ok=True)
    lib_dir.mkdir(exist_ok=True)
    for lib in ("dp2.js", "verify-key.js", "turnstile.js"):
        lib_src = ROOT / "functions" / "_lib" / lib
        assert lib_src.is_file(), f"functions/_lib/{lib} missing"
        (lib_dir / lib).write_text(lib_src.read_text(encoding="utf-8"), encoding="utf-8")
    mjs = api_dir / name.replace(".js", ".mjs")
    mjs.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    return mjs


def _link_licence_script(mjs: Path) -> str:
    """Node harness: stub Clerk Backend API + D1, mint a real DP1 key
    with the test secret and a real DP2 key with a fresh Ed25519
    keypair, exercise link-licence.js end to end."""
    dp2 = mjs.parent.parent / "_lib" / "dp2.js"
    return f"""
import {{ onRequest }} from {json.dumps(str(mjs))};
import {{ mintKey }} from {json.dumps(str(dp2))};
import crypto from "node:crypto";
const SECRET = "test-licence-secret";
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = b64url({{alg:"none",typ:"JWT"}}) + "." + b64url({{sid:"sess_123",sub:"user_123"}}) + ".sig";
const rows = new Map();
const db = {{ prepare: (sql) => ({{ bind: (...a) => ({{
  first: async () => rows.get(a[0]) || null,
  run: async () => {{ rows.set(a[0], {{tier: a[3], email: a[1]}}); return {{success:true}}; }},
}})}})}};
globalThis.fetch = async (url) => {{
  if (String(url).includes("/v1/sessions/sess_123"))
    return {{ ok: true, json: async () => ({{status:"active", user_id:"user_123"}}) }};
  if (String(url).includes("/v1/users/user_123"))
    return {{ ok: true, json: async () => ({{email_addresses:[{{id:"em_1",email_address:"jo@example.com"}}], primary_email_address_id:"em_1"}}) }};
  return {{ ok: false, status: 404, json: async () => ({{}}) }};
}};
const req = (method, body) => new Request("https://example.com/api/link-licence", {{
  method, headers: {{ Authorization: "Bearer " + jwt, "content-type": "application/json" }},
  body: body === undefined ? undefined : JSON.stringify(body),
}});
// Fresh Ed25519 keypair per run: the DP2 key is minted for real.
const pair = crypto.generateKeyPairSync("ed25519");
const pubDerB64 = pair.publicKey.export({{ format: "der", type: "spki" }}).toString("base64");
const privPem = pair.privateKey.export({{ format: "pem", type: "pkcs8" }});
const goodDp2 = mintKey("studio", privPem);
const other = crypto.generateKeyPairSync("ed25519");
const wrongDp2 = mintKey("pro", other.privateKey.export({{ format: "pem", type: "pkcs8" }}));
const env = {{ DB: db, CLERK_SECRET_KEY: "sk_test_x", LICENCE_SECRET: SECRET, LICENCE_ED25519_PUBLIC_KEY: pubDerB64 }};
const envNoDp2Pub = {{ DB: db, CLERK_SECRET_KEY: "sk_test_x", LICENCE_SECRET: SECRET }};
const noDb = await onRequest({{ request: req("GET"), env: {{}} }});
const noToken = await onRequest({{ request: new Request("https://example.com/api/link-licence"), env }});
const getEmpty = await onRequest({{ request: req("GET"), env }});
const getEmptyBody = await getEmpty.json();
// Mint a valid DP1 key with the test secret (same algorithm as licence.py).
const random = "AAAAAAAAAAAAAAAA";
const sig = crypto.createHmac("sha256", SECRET).update("DP1:STARTER:" + random).digest("hex").slice(0, 8);
const goodKey = "DP1-STARTER-" + random + "-" + sig;
const badKey = "DP1-STARTER-" + random + "-00000000";
const linkBad = await onRequest({{ request: req("POST", {{licence_key: badKey}}), env }});
const linkGood = await onRequest({{ request: req("POST", {{licence_key: goodKey}}), env }});
const linkGoodBody = await linkGood.json();
// DP2: no public key configured -> 503; wrong keypair -> 400;
// real key minted with this keypair -> 200, tier studio (overwrites
// the earlier starter link — re-linking is an upsert).
const linkDp2NoPub = await onRequest({{ request: req("POST", {{licence_key: goodDp2}}), env: envNoDp2Pub }});
const linkDp2Wrong = await onRequest({{ request: req("POST", {{licence_key: wrongDp2}}), env }});
const linkDp2 = await onRequest({{ request: req("POST", {{licence_key: goodDp2}}), env }});
const linkDp2Body = await linkDp2.json();
const getLinked = await onRequest({{ request: req("GET"), env }});
const getLinkedBody = await getLinked.json();
const noSecret = await onRequest({{ request: req("POST", {{licence_key: goodKey}}), env: {{DB: db, LICENCE_SECRET: SECRET}} }});
console.log(JSON.stringify({{
  noDb: noDb.status, noToken: noToken.status,
  getEmpty: getEmpty.status, getEmptyLinked: getEmptyBody.linked,
  linkBad: linkBad.status,
  linkGood: linkGood.status, linkGoodTier: linkGoodBody.tier,
  linkDp2NoPub: linkDp2NoPub.status, linkDp2Wrong: linkDp2Wrong.status,
  linkDp2: linkDp2.status, linkDp2Tier: linkDp2Body.tier,
  getLinked: getLinked.status, getLinkedTier: getLinkedBody.tier,
  getLinkedLinked: getLinkedBody.linked, noSecret: noSecret.status,
}}));
"""


def test_link_licence_function(tmp_path):
    mjs = _copy_function_to_mjs(tmp_path, "link-licence.js")
    res = _node(_link_licence_script(mjs))
    assert res["noDb"] == 503, res
    assert res["noToken"] == 401, res
    assert res["getEmpty"] == 200 and res["getEmptyLinked"] is False, res
    assert res["linkBad"] == 400, res
    assert res["linkGood"] == 200 and res["linkGoodTier"] == "starter", res
    assert res["linkDp2NoPub"] == 503, res
    assert res["linkDp2Wrong"] == 400, res
    assert res["linkDp2"] == 200 and res["linkDp2Tier"] == "studio", res
    assert res["getLinked"] == 200 and res["getLinkedTier"] == "studio", res
    assert res["getLinkedLinked"] is True, res
    assert res["noSecret"] == 503, res


def _cdx_turnstile_script(mjs: Path) -> str:
    """cdx.js Turnstile branch: unconfigured = open; secret set +
    no token = 403; secret set + siteverify success = 200 and the
    token params are NOT forwarded to archive.org."""
    return f"""
import {{ onRequest }} from {json.dumps(str(mjs))};
const calls = [];
globalThis.fetch = async (url, opts) => {{
  calls.push(String(url));
  if (String(url).includes("siteverify")) {{
    const body = new URLSearchParams(opts.body);
    const ok = body.get("response") === "good-token";
    return new Response(JSON.stringify({{success: ok}}), {{status: 200, headers: {{"content-type": "application/json"}}}});
  }}
  return new Response(JSON.stringify([["x","20060321212430","https://twitter.com/jack/status/20"]]), {{
    status: 200, headers: {{"content-type": "application/json"}} }});
}};
const base = "https://example.com/api/cdx?url=twitter.com/jack/status/*&output=json&limit=2";
const open = await onRequest({{ request: {{ url: base }}, env: {{}} }});
const noToken = await onRequest({{ request: {{ url: base }}, env: {{ TURNSTILE_SECRET_KEY: "sx" }} }});
const badToken = await onRequest({{ request: {{ url: base + "&cf-turnstile-response=bad-token&cf-turnstile-idem=idem1" }}, env: {{ TURNSTILE_SECRET_KEY: "sx" }} }});
const good = await onRequest({{ request: {{ url: base + "&cf-turnstile-response=good-token&cf-turnstile-idem=idem1" }}, env: {{ TURNSTILE_SECRET_KEY: "sx" }} }});
const goodBody = await good.text();
const cdxCall = calls.find((u) => u.includes("web.archive.org")) || "";
console.log(JSON.stringify({{
  open: open.status, noToken: noToken.status, badToken: badToken.status,
  good: good.status, goodBodyHasRow: goodBody.includes("jack/status/20"),
  tokenNotForwarded: !cdxCall.includes("cf-turnstile"),
  idemNotForwarded: !cdxCall.includes("cf-turnstile-idem"),
}}));
"""


def test_cdx_turnstile_branch(tmp_path):
    mjs = _copy_function_to_mjs(tmp_path, "cdx.js")
    res = _node(_cdx_turnstile_script(mjs))
    assert res["open"] == 200, res  # no secret configured: unchanged behaviour
    assert res["noToken"] == 403, res
    assert res["badToken"] == 403, res
    assert res["good"] == 200 and res["goodBodyHasRow"] is True, res
    assert res["tokenNotForwarded"] is True, res
    assert res["idemNotForwarded"] is True, res
