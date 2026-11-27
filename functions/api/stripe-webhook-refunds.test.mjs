// Stripe webhook tests — refunds, revocation, migration tolerance
// (issue #23). Run: node --test functions/api/stripe-webhook-refunds.test.mjs
// Fulfilment-path tests live in stripe-webhook.test.mjs; the shared
// harness is stripe-webhook-harness.mjs. No network, no real
// Stripe/Resend/D1.
import test from "node:test";
import assert from "node:assert/strict";

import { onRequest as licenceCheck } from "./licence-check.js";
import { mintKey } from "../_lib/dp2.js";
import {
  PRIVATE_PEM, makeStubDB, makeEnv, installFetchStub,
  sessionCompletedEvent, postWebhook,
} from "./stripe-webhook-harness.mjs";

async function mintedKey(env, fetchCalls, eventId, sessionId) {
  await postWebhook(env, sessionCompletedEvent(eventId, sessionId));
  const mail = fetchCalls.find((c) => c.url.includes("resend.com"));
  return JSON.parse(mail.body).html.match(/DP2-[A-Za-z0-9\-_]+/)?.[0];
}

async function check(env, key) {
  const req = new Request("https://example.com/api/licence-check", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  const res = await licenceCheck({ request: req, env });
  return res.json();
}

test("charge.refunded revokes by payment_intent; licence-check sees it; unmatched refund is 200", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  const key = await mintedKey(env, fetchCalls, "evt_13", "cs_13");
  const row = [...db.licences.values()][0];
  assert.equal(row.status, "active");
  // The mint used payment_intent pi_test123 (harness default); revoke by it.
  const refund = { id: "evt_14", type: "charge.refunded", data: { object: { id: "ch_1", customer: "cus_test123", payment_intent: "pi_test123" } } };
  const res = await postWebhook(env, refund);
  assert.equal(res.status, 200);
  assert.equal(res.body.revoked, 1);
  assert.equal(row.status, "revoked");
  const checkBody = await check(env, key);
  assert.equal(checkBody.valid, false);
  assert.equal(checkBody.status, "revoked");
  const noMatch = { id: "evt_15", type: "charge.refunded", data: { object: { id: "ch_2", customer: "cus_other", payment_intent: "pi_nobody" } } };
  const noMatchRes = await postWebhook(env, noMatch);
  assert.equal(noMatchRes.status, 200);
  assert.equal(noMatchRes.body.revoked, 0);
});

test("checkout.session.async_payment_failed revokes by session id", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  await postWebhook(env, sessionCompletedEvent("evt_16", "cs_16"));
  const row = [...db.licences.values()][0];
  assert.equal(row.status, "active");
  const failed = { id: "evt_17", type: "checkout.session.async_payment_failed", data: { object: { id: "cs_16", customer: "cus_test123" } } };
  const res = await postWebhook(env, failed);
  assert.equal(res.status, 200);
  assert.equal(res.body.revoked, 1);
  assert.equal(row.status, "revoked");
});

test("migrations 0004/0005 not applied: purchase still succeeds, refund honestly reports it", async () => {
  const db = makeStubDB({ stripeColumns: false });
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  const { status, body } = await postWebhook(env, sessionCompletedEvent("evt_18", "cs_18"));
  assert.equal(status, 200, "a missing Stripe column must not fail the purchase");
  assert.equal(body.ok, true);
  assert.equal(db.licences.size, 1, "core licence row is stored");
  assert.equal([...db.licences.values()][0].sessionId, null, "no Stripe identifiers without the migrations");
  const refund = { id: "evt_19", type: "charge.refunded", data: { object: { id: "ch_9", payment_intent: "pi_test123" } } };
  const res = await postWebhook(env, refund);
  assert.equal(res.status, 200);
  assert.equal(res.body.revoked, 0);
  assert.match(res.body.reason, /0005_stripe_purchase/);
});

test("licence-check: active key valid, revoked invalid, unknown key honest", async () => {
  const db = makeStubDB();
  const fetchCalls = [];
  installFetchStub(fetchCalls);
  const env = makeEnv(db, fetchCalls);
  const key = await mintedKey(env, fetchCalls, "evt_20", "cs_20");
  const active = await check(env, key);
  assert.equal(active.valid, true);
  assert.equal(active.tier, "pro");
  const orphan = mintKey("pro", PRIVATE_PEM); // valid sig, no D1 row
  const orphanCheck = await check(env, orphan);
  assert.equal(orphanCheck.valid, true);
  assert.equal(orphanCheck.status, "unknown");
});
