-- wayback-social users — D1 schema (Clerk link, issue #6).
-- Database: wayback-social-licences (same DB as 0001_licences.sql).
-- Apply with: wrangler d1 execute wayback-social-licences --file migrations/0002_users.sql
-- or via the Cloudflare API (POST /accounts/{id}/d1/database/{uuid}/query).
--
-- What lives here: one row per Clerk account that has linked a
-- licence key. The join to `licences` is licence_key_hash =
-- licences.key_hash (SHA-256 hex of the full key — the raw key is
-- NEVER stored here). A row's tier is a cache of the linked key's
-- tier at link time; the licences table is the authority if they
-- ever disagree (e.g. after a refund revokes the key).
-- Used by functions/api/link-licence.js (GET linked tier / POST
-- link a key). See docs/clerk-auth.md §4.

CREATE TABLE IF NOT EXISTS users (
  clerk_user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  licence_key_hash TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
