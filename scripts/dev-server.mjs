#!/usr/bin/env node
/* Local dev server for the web console — reproduces the deployed
 * Cloudflare Pages setup on localhost:
 *   - serves web/ statically
 *   - runs HTML pages through the REAL brand middleware
 *     (functions/_middleware.js, HTMLRewriter) so the served title /
 *     meta are per-hostname exactly as on the deployed site
 *   - routes /api/* to the REAL Pages Functions (cdx, arquivo,
 *     ghostarchive, commoncrawl, evidence-usage, billing-portal,
 *     live-check, licence-check, packs-upload, stripe-webhook,
 *     config) so a live
 *     browser search works locally instead of failing on archive.org
 *     CORS (the direct-CDX path browsers hit on localhost).
 *
 * Every /api route goes through callFunction() below — one shared
 * shape (build a Request like Cloudflare's, call the handler, stream
 * its Response back, drop the body if the client went away). A route
 * is one import + one 4-line block; do NOT re-add a per-route copy
 * of the Request/response plumbing.
 *
 * Run:  node scripts/dev-server.mjs [port]   (default 8902)
 * Then open http://localhost:8902/ — searches go through /api/cdx,
 * /api/arquivo, /api/ghostarchive and /api/commoncrawl exactly as
 * they do on the deployed site.
 *
 * Per-host testing: the middleware brands by request hostname, and
 * localhost always resolves to the apex brand. Send X-Test-Host to
 * preview another brand locally, e.g.
 *   curl -H "X-Test-Host: verify.deletedproof.northforgelabs.dev" \
 *     http://localhost:8902/ | grep "<title>"
 * The header is consumed HERE, by this dev server only — it is
 * translated into the request hostname the middleware sees, and never
 * reaches the deployed middleware (which reads the real Host).
 *
 * Endpoints that need secrets or bindings the dev server does not
 * have (D1, R2, the Ed25519 public key) answer their honest 503 /
 * "not configured" error, exactly as the deployed site does before
 * those are set. Values the dev sets in the shell are passed through
 * so an endpoint can be exercised locally:
 *   LICENCE_ED25519_PUBLIC_KEY — /api/licence-check, /api/packs-upload
 *   R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY — /api/packs-upload
 *   PACKS_BUCKET (default deletedproof-packs) — /api/packs-upload
 *   STRIPE_WEBHOOK_SECRET / STRIPE_WEBHOOK_SECRET_SANDBOX /
 *   STRIPE_SECRET_KEY / LICENCE_ED25519_PRIVATE_KEY / RESEND_API_KEY /
 *   RESEND_FROM / STRIPE_PRICE_IDS / APP_URL — /api/stripe-webhook
 *   CLERK_PUBLISHABLE_KEY / TURNSTILE_SITE_KEY — /api/config
 *
 * No dependencies (node:http only). The Function handlers are imported
 * as-is, so this also verifies they run outside the Workers runtime.
 * HTMLRewriter does not exist in Node, so the test-only shim
 * (functions/htmlrewriter-shim.mjs) is installed as the global first.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { HTMLRewriter } from "../functions/htmlrewriter-shim.mjs";
import { onRequest as brandMiddleware } from "../functions/_middleware.js";
import { onRequest as cdxProxy } from "../functions/api/cdx.js";
import { onRequest as arquivoProxy } from "../functions/api/arquivo.js";
import { onRequest as ghostarchiveProxy } from "../functions/api/ghostarchive.js";
import { onRequest as commoncrawlProxy } from "../functions/api/commoncrawl.js";
import { onRequest as evidenceUsage } from "../functions/api/evidence-usage.js";
import { onRequest as billingPortal } from "../functions/api/billing-portal.js";
import { onRequest as liveCheck } from "../functions/api/live-check.js";
import { onRequest as licenceCheck } from "../functions/api/licence-check.js";
import { onRequest as packsUpload } from "../functions/api/packs-upload.js";
import { onRequest as stripeWebhook } from "../functions/api/stripe-webhook.js";
import { onRequest as runtimeConfig } from "../functions/api/config.js";

globalThis.HTMLRewriter = HTMLRewriter;

const root = process.env.WEB_ROOT || fileURLToPath(new URL("../web", import.meta.url));
const port = Number(process.argv[2] || 8902);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// Write a Response back only if the client is still there. The
// search page aborts in-flight /api/cdx requests on Stop, and the
// upstream archive.org fetch keeps running after the abort —
// writing its body to the destroyed socket threw an unhandled
// rejection and KILLED the dev server mid-suite (2026-11-26: the
// stop/resume E2E test died this way, and every later test got
// ERR_CONNECTION_REFUSED). A gone client is not an error: drop the
// body and move on.
function clientGone(req, res) {
  return Boolean(req.aborted || res.destroyed || res.writableEnded);
}
function safeEnd(res, status, headers, body) {
  try {
    if (res.destroyed || res.writableEnded) return;
    if (!res.headersSent) res.writeHead(status, headers);
    res.end(body);
  } catch (_) { /* client already gone */ }
}

// Call a real Pages Function and stream its Response back. `body`
// forwards the request body (POST routes); GET/HEAD never carry one
// (Node's Request throws on a GET with a body). `headers` forwards
// named incoming request headers verbatim (only the webhook needs
// one — Stripe-Signature — the other routes need none). `env` is the
// Function's environment — {} when the endpoint needs nothing, or
// the shell values listed in the header comment. Returns true when
// the response was handled (or the client went away).
async function callFunction(req, res, handler, { body = false, headers = [], env = {} } = {}) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const sendBody = body && req.method !== "GET" && req.method !== "HEAD";
  const chunks = [];
  if (sendBody) for await (const chunk of req) chunks.push(chunk);
  const forwarded = Object.fromEntries(
    headers.map((h) => [h, req.headers[h.toLowerCase()]]).filter(([, v]) => v !== undefined));
  const request = new Request(url.toString(), {
    method: req.method,
    headers: {
      "user-agent": "wayback-social-dev-server/1.0",
      ...(sendBody ? { "content-type": req.headers["content-type"] || "application/json" } : {}),
      ...forwarded,
    },
    body: sendBody ? Buffer.concat(chunks) : undefined,
  });
  const out = await handler({ request, env });
  if (clientGone(req, res)) return true;
  safeEnd(res, out.status, Object.fromEntries(out.headers.entries()),
    Buffer.from(await out.arrayBuffer()));
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === "/api/config") {
      // GET the deployed environment's PUBLIC keys (Clerk publishable
      // + Turnstile site key) — the dev/prod swap endpoint. Locally
      // the env comes from the shell (CLERK_PUBLISHABLE_KEY /
      // TURNSTILE_SITE_KEY); unset means the endpoint answers
      // enabled:false and the page falls back to web/config.js —
      // exactly the deployed behaviour before the vars are set.
      await callFunction(req, res, runtimeConfig, { env: {
        CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,
        TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
      } });
      return;
    }
    if (url.pathname === "/api/cdx") {
      // The real Pages Function, so a live browser search works
      // locally instead of failing on archive.org CORS.
      await callFunction(req, res, cdxProxy);
      return;
    }
    if (url.pathname === "/api/arquivo") {
      // The real Arquivo.pt proxy, so an Arquivo search works locally
      // through the same code the deployed site runs.
      await callFunction(req, res, arquivoProxy);
      return;
    }
    if (url.pathname === "/api/ghostarchive") {
      // The real Ghostarchive proxy, same shape as /api/arquivo.
      await callFunction(req, res, ghostarchiveProxy);
      return;
    }
    if (url.pathname === "/api/commoncrawl") {
      // The real Common Crawl proxy — including its 3-attempt retry
      // with backoff, so a live CC search behaves locally exactly as
      // it does on the deployed site (slow, then rows).
      await callFunction(req, res, commoncrawlProxy);
      return;
    }
    if (url.pathname === "/api/evidence-usage") {
      // GET with ?key=&local_used=, or POST {key, idempotency_key}.
      // The dev server has no D1 binding, so GET answers with the
      // localHint fallback and POST answers 503 — both are the
      // real endpoint behaviour without a database, which is
      // exactly what the dashboard wiring must handle honestly.
      await callFunction(req, res, evidenceUsage, { body: true });
      return;
    }
    if (url.pathname === "/api/billing-portal") {
      // POST {key}. No D1 / no Stripe secret here, so the real
      // endpoint answers its honest 503 — the dashboard wiring
      // must show that message, never a fake link.
      await callFunction(req, res, billingPortal, { body: true });
      return;
    }
    if (url.pathname === "/api/live-check") {
      // POST {urls}. The body (the URL list) is forwarded — the
      // Function reads it with request.json().
      await callFunction(req, res, liveCheck, { body: true });
      return;
    }
    if (url.pathname === "/api/licence-check") {
      // POST {key}. No D1 here, so a valid signature answers
      // status "unknown" (revocation unknown) — the endpoint's
      // honest no-database behaviour. Set
      // LICENCE_ED25519_PUBLIC_KEY in the shell to verify real DP2
      // keys locally; unset, DP2 keys answer valid:false.
      await callFunction(req, res, licenceCheck, { body: true, env: {
        LICENCE_ED25519_PUBLIC_KEY: process.env.LICENCE_ED25519_PUBLIC_KEY || "",
      } });
      return;
    }
    if (url.pathname === "/api/packs-upload") {
      // POST {key, size, sha256, name?}. No R2 credentials here, so
      // the real endpoint answers its honest 503 after verifying
      // the key. Set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID /
      // R2_SECRET_ACCESS_KEY (+ PACKS_BUCKET) in the shell to get a
      // real presigned PUT URL locally.
      await callFunction(req, res, packsUpload, { body: true, env: {
        LICENCE_ED25519_PUBLIC_KEY: process.env.LICENCE_ED25519_PUBLIC_KEY || "",
        R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || "",
        R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || "",
        R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || "",
        PACKS_BUCKET: process.env.PACKS_BUCKET || "deletedproof-packs",
      } });
      return;
    }
    if (url.pathname === "/api/stripe-webhook") {
      // POST a Stripe event (raw JSON body + Stripe-Signature
      // header — callFunction forwards both, exactly as Stripe
      // sends them). No webhook secret here, so the real endpoint
      // answers its honest 503; with a secret but no D1 it answers
      // 500 "D1 binding DB not configured" after verifying the
      // signature. Set STRIPE_WEBHOOK_SECRET (+ the mint/email
      // vars below) in the shell to exercise the full fulfilment
      // path locally. Secrets pass through from the shell only and
      // are never printed or stored.
      await callFunction(req, res, stripeWebhook, { body: true, headers: ["stripe-signature"], env: {
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
        STRIPE_WEBHOOK_SECRET_SANDBOX: process.env.STRIPE_WEBHOOK_SECRET_SANDBOX || "",
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
        LICENCE_ED25519_PRIVATE_KEY: process.env.LICENCE_ED25519_PRIVATE_KEY || "",
        RESEND_API_KEY: process.env.RESEND_API_KEY || "",
        RESEND_FROM: process.env.RESEND_FROM || "",
        STRIPE_PRICE_IDS: process.env.STRIPE_PRICE_IDS || "",
        APP_URL: process.env.APP_URL || "",
      } });
      return;
    }
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    // Directory URLs serve their index.html, exactly as Cloudflare
    // Pages and `python -m http.server` do — without this, readFile
    // on a directory throws EISDIR and the server answers 500.
    if (path.endsWith("/")) path += "index.html";
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) { safeEnd(res, 403, {}, "forbidden"); return; }
    let body;
    try {
      body = await readFile(file);
    } catch (e) {
      if (e.code === "EISDIR") { // directory without a trailing slash
        file = join(file, "index.html");
        body = await readFile(file);
      } else throw e;
    }
    if (extname(file) === ".html") {
      // HTML goes through the real brand middleware, exactly as
      // Cloudflare Pages runs it. X-Test-Host (local only, see the
      // header comment) lets one preview another subdomain's brand.
      const testHost = req.headers["x-test-host"];
      const hostForBrand = testHost || `localhost:${port}`;
      const request = new Request(`https://${hostForBrand}${url.pathname}`, {
        method: req.method,
      });
      const out = await brandMiddleware({
        request,
        next: async () =>
          new Response(body, {
            headers: { "content-type": MIME[".html"] },
          }),
      });
      if (clientGone(req, res)) return;
      safeEnd(res, out.status, Object.fromEntries(out.headers.entries()),
        Buffer.from(await out.arrayBuffer()));
      return;
    }
    safeEnd(res, 200, { "content-type": MIME[extname(file)] || "application/octet-stream" }, body);
  } catch (e) {
    // Never let the error path itself throw: if the client is gone
    // or headers are already sent, there is nothing to write.
    if (e && e.code === "ENOENT") { safeEnd(res, 404, {}, "not found"); return; }
    safeEnd(res, 500, {}, "dev server error: " + e.message);
  }
});

server.listen(port, () => {
  console.log(`wayback-social dev server: http://localhost:${port}/  (proxies /api/* live)`);
});
