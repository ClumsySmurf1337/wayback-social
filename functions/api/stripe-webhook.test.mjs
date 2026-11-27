// Stripe webhook tests — fulfilment path (issue #23).
// Run: node --test functions/api/stripe-webhook.test.mjs
// Refund / revocation / migration tests live in
// stripe-webhook-refunds.test.mjs; the shared harness is
// stripe-webhook-harness.mjs. No network, no real Stripe/Resend/D1.
// Writes one minted DP2 key + its test public key to
// /tmp/stripe_webhook_e2e.json for the Python cross-check
// (tests/test_stripe_webhook.py verifies it with licence2.py).
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";

import { verifyStripeSignature } from "../_lib/stripe-signature.js";
import { normalizeTier } from "../_lib/stripe-tier.js";
import {
  WEBHOOK_SECRET, PRIVATE_PEM, PUBLIC_SPKI_B64, LIVE_PRICE_PRO,
  makeStubDB, makeEnv, signPayload, installFetchStub,
  installFetchStubResendFails, sessionCompletedEvent, postWebhook,
} from "./stripe-webhook-harness.mjs";

test("verifyStripeSignature: valid, wrong secret, stale ts, missing header, second v1", () => {
  const raw = JSON.stringify({ a: 1 });
  const header = signPayload(raw);
  assert.equal(verifyStripeSignature(raw, header, [WEBHOOK_SECRET]).ok, true);
  assert.equal(verifyStripeSignature(raw, header, ["wrong"]).ok, false);
  assert.equal(verifyStripeSignature(raw, "", [WEBHOOK_SECRET]).ok, false);
  const oldTs = String(Math.floor(Date.now() / 1000) - 3600);
  const oldV1 = createHmac("sha256", WEBHOOK_SECRET).update(`${oldTs}.${raw}`).digest("hex");
  assert.equal(verifyStripeSignature(raw, `t=${oldTs},v1=${oldV1}`, [WEBHOOK_SECRET]).ok, false);
  // Stripe can send several v1 signatures (key rotation) — one valid is enough.
  const ts = header.split(",")[0].slice(2);
  const goodV1 = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${raw}`).digest("hex");
  assert.equal(verifyStripeSignature(raw, `t=${ts},v1=${"0".repeat(64)},v1=${goodV1}`, [WEBHOOK_SECRET]).ok, true);
  // Sandbox secret is tried as a fallback.
  const sandboxHeader = signPayload(raw, "whsec_sandbox_secret");
  assert.equal(verifyStripeSignature(raw, sandboxHeader, [WEBHOOK_SECRET, "whsec_sandbox_secret"]).ok, true);
});

test("normalizeTier: pack tiers, bundle -> studio, topup sentinel", () => {
  assert.equal(normalizeTier("pro"), "pro");
  assert.equal(normalizeTier("BUNDLE"), "studio");
  assert.equal(normalizeTier("topup"), "topup");
  assert.equal(normalizeTier("nonsense"), null);
  assert.equal(normalizeTier(undefined), null);
});

test("checkout.session.completed mints a DP2 key, stores it with Stripe ids, emails it", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  const { status, body } = await postWebhook(env, sessionCompletedEvent("evt_1", "cs_1"));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.tier, "pro");
  assert.equal(body.stripe_session_id, "cs_1");
  assert.equal(db.licences.size, 1);
  assert.equal(db.events.size, 1);
  const row = [...db.licences.values()][0];
  assert.equal(row.sessionId, "cs_1");
  assert.equal(row.customerId, "cus_test123");
  assert.equal(row.paymentIntent, "pi_test123");
  assert.equal(row.status, "active");
  // Metadata tier wins — no Stripe API call was needed.
  assert.equal(fetchCalls.filter((c) => c.url.includes("api.stripe.com")).length, 0);
  const resend = fetchCalls.find((c) => c.url.includes("resend.com"));
  assert.ok(resend, "Resend was called");
  const mail = JSON.parse(resend.body);
  assert.deepEqual(mail.to, ["buyer@example.com"]);
  assert.match(mail.subject, /Pro Pack/);
  const key = mail.html.match(/DP2-[A-Za-z0-9\-_]+/)?.[0];
  assert.ok(key, "email contains the licence key");
  assert.match(mail.text, /DP2-PRO-/);
  assert.match(mail.text, /2,500 captures per search, all 14 networks/);
  assert.match(mail.text, /reply to this email/);
  assert.match(mail.html, /Verify my key/);
  // The minted key verifies against the test public key (Node side).
  const { verifyKey } = await import("../_lib/dp2.js");
  assert.equal(verifyKey(key, PUBLIC_SPKI_B64).valid, true);
  // Cross-check artefact for the Python test.
  writeFileSync("/tmp/stripe_webhook_e2e.json", JSON.stringify({ key, public_key_spki_b64: PUBLIC_SPKI_B64 }));
});

test("completed without metadata tier falls back to line items via STRIPE_PRICE_IDS", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  const evt = sessionCompletedEvent("evt_2", "cs_2", { metadata: {} });
  const { status, body } = await postWebhook(env, evt);
  assert.equal(status, 200);
  assert.equal(body.tier, "pro");
  const lineItems = fetchCalls.find((c) => c.url.includes("/line_items"));
  assert.ok(lineItems, "line items were fetched from Stripe");
  assert.match(String(lineItems.headers.Authorization || ""), /^Basic /);
  assert.equal(db.licences.size, 1);
});

test("duplicate event and duplicate session never mint twice", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  const evt = sessionCompletedEvent("evt_3", "cs_3");
  const first = await postWebhook(env, evt);
  assert.equal(first.status, 200);
  const again = await postWebhook(env, evt);
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  const newEventSameSession = sessionCompletedEvent("evt_4", "cs_3");
  const third = await postWebhook(env, newEventSameSession);
  assert.equal(third.body.duplicate, true);
  assert.equal(db.licences.size, 1);
  assert.equal(fetchCalls.filter((c) => c.url.includes("resend.com")).length, 1);
});

test("bundle metadata tier mints studio; topup is ignored, no key, no row", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  const bundle = await postWebhook(env, sessionCompletedEvent("evt_5", "cs_5", { metadata: { tier: "bundle" } }));
  assert.equal(bundle.status, 200);
  assert.equal(bundle.body.tier, "studio");
  assert.equal([...db.licences.values()][0].seats, 5);
  const topup = await postWebhook(env, sessionCompletedEvent("evt_6", "cs_6", { metadata: { tier: "topup" } }));
  assert.equal(topup.status, 200);
  assert.equal(topup.body.ignored, "text-fetch top-up — credits are not licences (no ledger yet)");
  assert.equal(db.licences.size, 1, "top-up mints nothing");
  assert.equal(fetchCalls.filter((c) => c.url.includes("resend.com")).length, 1, "top-up sends no key email");
});

test("unmapped price + no metadata 400; bad signature 400; missing secret 503; GET 405", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls, "price_unknown_xyz");
  const env = makeEnv(db, fetchCalls);
  const unmapped = await postWebhook(env, sessionCompletedEvent("evt_7", "cs_7", { metadata: {} }));
  assert.equal(unmapped.status, 400);
  assert.match(unmapped.body.error, /unmapped price_id: price_unknown_xyz/);
  assert.equal(db.licences.size, 0, "no key minted for an unmapped price");
  const badSig = await postWebhook(env, sessionCompletedEvent("evt_8", "cs_8"), "t=1,v1=deadbeef");
  assert.equal(badSig.status, 400);
  assert.match(badSig.body.error, /invalid signature/);
  const noSecretEnv = makeEnv(db, fetchCalls, { STRIPE_WEBHOOK_SECRET: undefined, STRIPE_WEBHOOK_SECRET_SANDBOX: undefined });
  const noSecret = await postWebhook(noSecretEnv, sessionCompletedEvent("evt_9", "cs_9"));
  assert.equal(noSecret.status, 503);
  assert.match(noSecret.body.error, /STRIPE_WEBHOOK_SECRET not configured/);
  const get = await postWebhook(env, sessionCompletedEvent("evt_10", "cs_10"), undefined, "GET");
  assert.equal(get.status, 405);
});

test("no RESEND_API_KEY: purchase still succeeds, email skipped, licence row intact", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  delete env.RESEND_API_KEY;
  const { status, body } = await postWebhook(env, sessionCompletedEvent("evt_11", "cs_11"));
  assert.equal(status, 200, "email must never block the purchase");
  assert.equal(body.ok, true);
  assert.equal(body.email_sent, false);
  assert.match(body.email_error, /RESEND_API_KEY not configured/);
  assert.equal(db.licences.size, 1, "licence row is stored");
  assert.equal([...db.licences.values()][0].status, "active");
  assert.equal(fetchCalls.filter((c) => c.url.includes("resend.com")).length, 0);
});

test("Resend 4xx/5xx: purchase still succeeds, failure logged, licence row intact", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStubResendFails(fetchCalls, 429);
  const env = makeEnv(db, fetchCalls);
  const { status, body } = await postWebhook(env, sessionCompletedEvent("evt_12", "cs_12"));
  assert.equal(status, 200, "a Resend failure must not fail the purchase");
  assert.equal(body.ok, true);
  assert.equal(body.email_sent, false);
  assert.match(body.email_error, /429/);
  assert.equal(db.licences.size, 1);
  assert.equal(fetchCalls.filter((c) => c.url.includes("resend.com")).length, 1);
});
