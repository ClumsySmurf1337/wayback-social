// Stripe webhook signature verification — shared by
// functions/api/stripe-webhook.js (and its test suite).
//
// Stripe's scheme: HMAC-SHA256 over "t.rawBody" with the endpoint
// secret (whsec_...). Header: "t=<unix ts>,v1=<hex>[,v1=<hex>]"
// (Stripe can send several v1 signatures during a key rotation —
// one valid signature is enough). 5-minute tolerance; constant-
// time compare; never accept an unsigned event.
//
// NOT Paddle's scheme: Paddle signs "ts:rawBody" and uses a
// semicolon-separated "Paddle-Signature" header (see
// functions/api/paddle-webhook.js verifyPaddleSignature). NOT RSA
// either — that is Paddle Classic. Stripe is HMAC, same family as
// Paddle Billing, different signed payload.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_TOLERANCE_S = 300; // Stripe's recommended 5 minutes

/** Verify Stripe's Stripe-Signature header. Returns {ok, reason}. */
export function verifyStripeSignature(rawBody, header, secrets) {
  if (!header) return { ok: false, reason: "missing Stripe-Signature header" };
  let ts = "";
  const v1s = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") ts = (v || "").trim();
    if (k === "v1" && v) v1s.push(v.trim());
  }
  if (!ts || v1s.length === 0) return { ok: false, reason: "malformed Stripe-Signature header" };
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_S) return { ok: false, reason: "stale timestamp — possible replay" };
  for (const secret of secrets.filter(Boolean)) {
    const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
    for (const v1 of v1s) {
      if (v1.length === expected.length &&
          timingSafeEqual(Buffer.from(v1, "utf8"), Buffer.from(expected, "utf8"))) {
        return { ok: true, reason: "valid" };
      }
    }
  }
  return { ok: false, reason: "signature mismatch" };
}
