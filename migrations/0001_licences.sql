-- wayback-social licences — D1 schema (v1.6, Paddle webhook pipeline).
-- Database: wayback-social-licences (created 2026-11-26 via Cloudflare API).
-- Apply with: wrangler d1 execute wayback-social-licences --file migrations/0001_licences.sql
-- or via the Cloudflare API (POST /accounts/{id}/d1/database/{uuid}/query).
--
-- What lives here: licence records only. NEVER the full licence key
-- (only its SHA-256 + a short prefix for display), never searched
-- handles, never pack contents. See docs/storage-auth-plan.md §1.

CREATE TABLE IF NOT EXISTS licences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_prefix TEXT NOT NULL,              -- e.g. DP2-STUDIO-372HNQ5XFCL23X5T (first 24 chars, for support lookup)
  key_hash TEXT NOT NULL UNIQUE,         -- sha256 hex of the full key
  scheme TEXT NOT NULL DEFAULT 'DP2',    -- DP2 (Ed25519, production) or DP1 (HMAC, dev only)
  tier TEXT NOT NULL,                    -- free | starter | pro | studio (bundle mints studio)
  email TEXT NOT NULL,
  paddle_transaction_id TEXT UNIQUE,     -- txn_...; NULL for manually minted keys
  paddle_customer_id TEXT,
  paddle_price_id TEXT,
  seats INTEGER NOT NULL DEFAULT 1,
  reports_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- active | revoked | refunded
  created_at TEXT NOT NULL,              -- ISO 8601 UTC
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,             -- Paddle event id (evt_...)
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_licences_email ON licences (email);
CREATE INDEX IF NOT EXISTS idx_licences_txn ON licences (paddle_transaction_id);
CREATE INDEX IF NOT EXISTS idx_licences_status ON licences (status);
