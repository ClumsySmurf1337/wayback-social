-- Evidence-report idempotency log (POST /api/evidence-usage).
-- Database: wayback-social-licences.
-- Apply with: wrangler d1 execute wayback-social-licences --file migrations/0003_evidence_usage.sql
-- or via the Cloudflare API (POST /accounts/{id}/d1/database/{uuid}/query).
-- Do NOT apply from this VM without John's approval tap — the D1
-- list/apply step is a human-gated action (see docs/issues.md #15).
--
-- The authoritative evidence-report count lives in the licences
-- table (reports_used, migration 0001) — this table holds ONLY the
-- idempotency keys for POST /api/evidence-usage, so a retried POST
-- never double-counts. Deliberately NO second counter here: two
-- sources of truth would drift. The log table holds only
-- (idempotency_key, key_hash, created_at) — never the full key,
-- never searched handles, never pack contents.
CREATE TABLE IF NOT EXISTS evidence_report_logs (
  idempotency_key TEXT PRIMARY KEY, -- client-supplied, one per report (crypto.randomUUID())
  key_hash TEXT NOT NULL,           -- sha256 hex of the full licence key
  created_at INTEGER NOT NULL       -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_evidence_report_logs_key_hash ON evidence_report_logs(key_hash);
