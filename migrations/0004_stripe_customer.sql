-- Stripe customer link (POST /api/billing-portal).
-- Database: wayback-social-licences.
-- Apply with: wrangler d1 execute wayback-social-licences --file migrations/0004_stripe_customer.sql
-- or via the Cloudflare API (POST /accounts/{id}/d1/database/{uuid}/query).
-- Do NOT apply from this VM without John's approval tap — the D1
-- list/apply step is a human-gated action (see docs/issues.md #3).
--
-- The Stripe webhook (future work — see docs/stripe-vs-clerk.md §5)
-- writes stripe_customer_id when a purchase creates a Stripe
-- customer, so the Billing Portal endpoint can open a portal
-- session for the buyer behind a licence key. No customer ids are
-- ever invented: a licence with no linked customer gets an honest
-- 404 from /api/billing-portal, not a fake link.
ALTER TABLE licences ADD COLUMN stripe_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_licences_stripe_customer ON licences(stripe_customer_id);
