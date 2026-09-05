-- ============================================================================
-- Migration 0005: Password reset tokens (section 12 — "Reset password").
--
-- One shared table for both actor types (admin `profiles` and `customers`)
-- rather than two near-identical tables — the row records WHICH kind of
-- account it's for via `actor_type`, and only ONE of profile_id/customer_id
-- is ever set (enforced by the CHECK constraint below), matching the same
-- "exactly one audience" pattern already used by `notifications.customer_id`
-- in migration 0003.
--
-- Tokens are stored as a SHA-256 hash, never in plaintext (same principle
-- as password_hash) — even a full database read never reveals a usable
-- reset token, only the raw token emailed to the user does.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_type VARCHAR(10) NOT NULL CHECK (actor_type IN ('profile', 'customer')),
  profile_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL, -- hex-encoded SHA-256, always 64 chars
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_reset_token_actor CHECK (
    (actor_type = 'profile' AND profile_id IS NOT NULL AND customer_id IS NULL) OR
    (actor_type = 'customer' AND customer_id IS NOT NULL AND profile_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_business ON password_reset_tokens(business_id);
-- Fast "does this profile/customer already have a live token" lookups, so
-- requesting a reset repeatedly can invalidate the previous one instead of
-- accumulating an unbounded number of valid tokens per account.
CREATE INDEX IF NOT EXISTS idx_reset_tokens_profile ON password_reset_tokens(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reset_tokens_customer ON password_reset_tokens(customer_id) WHERE customer_id IS NOT NULL;

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON password_reset_tokens;
CREATE POLICY tenant_isolation ON password_reset_tokens
  USING (business_id = current_setting('app.current_business_id', true)::integer);

COMMIT;
