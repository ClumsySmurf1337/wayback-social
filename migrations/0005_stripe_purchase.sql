-- Stripe purchase link (POST /api/stripe-webhook).
-- Database: wayback-social-licences.
-- Apply with: wrangler d1 execute wayback-social-licences --file migrations/0005_stripe_purchase.sql
-- or via the Cloudflare API (POST /accounts/{id}/d1/database/{uuid}/query).
-- Do NOT apply from this VM without John's approval tap — the D1
-- list/apply step is a human-gated action (see docs/issues.md #3).
--
-- The Stripe webhook writes these identifiers when a purchase
-- creates a Stripe customer, so refunds revoke the RIGHT licence:
-- a customer can hold several licences (Starter, then Pro), so
-- revoking by customer alone would be wrong. charge.refunded
-- revokes by stripe_payment_intent; checkout.session.
-- async_payment_failed revokes by stripe_session_id. The
-- stripe_customer_id column (migration 0004) is what
-- POST /api/billing-portal reads to open a portal session.
--
-- The webhook tolerates these columns being absent (it falls back
-- to the 0001 column set and logs a warning) — but until this
-- migration is applied, refunds cannot be linked to licences.
ALTER TABLE licences ADD COLUMN stripe_session_id TEXT;
ALTER TABLE licences ADD COLUMN stripe_payment_intent TEXT;
ALTER TABLE licences ADD COLUMN stripe_price_id TEXT;

-- A Checkout Session completes once; the UNIQUE index is the
-- second idempotency layer behind webhook_events.event_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_licences_stripe_session ON licences(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_licences_stripe_payment_intent ON licences(stripe_payment_intent);
