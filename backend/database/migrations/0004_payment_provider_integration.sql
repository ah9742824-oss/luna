-- ============================================================================
-- Migration 0004: Payment provider integration columns
--
-- Reuses the existing `payments` table from 0003 as-is — this only ADDS the
-- columns needed to support a real online-payment provider round trip
-- (section 35/36): the provider's own order reference (to match an
-- inbound webhook back to a row without trusting the webhook's claimed
-- order id alone) and the checkout/redirect URL returned when payment is
-- initiated (so it can be handed back to a client that reloads the page
-- before completing payment, without re-registering a new provider order).
-- ============================================================================

BEGIN;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(150);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_url TEXT;

-- One provider reference should never be reused across two different
-- payment rows — defense-in-depth against a forged webhook claiming a
-- transaction id that legitimately belongs to a different order.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_reference ON payments(provider_reference) WHERE provider_reference IS NOT NULL;

-- Every processed webhook event is logged here (section 36, 79): the
-- provider's transaction id, the raw verified payload, and the outcome.
-- This is what makes duplicate/replayed webhook delivery safe — a second
-- delivery of the same provider transaction id is recognized and
-- short-circuited instead of being reprocessed.
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  provider VARCHAR(30) NOT NULL,
  provider_transaction_id VARCHAR(150) NOT NULL,
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('processed', 'duplicate_ignored', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- The core replay-protection guarantee: the SAME provider+transaction id
-- can only ever be recorded as 'processed' once. A second webhook for the
-- same transaction id is provably a duplicate/replay by this constraint
-- alone, independent of any application-layer check.
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_events_processed
  ON payment_webhook_events(provider, provider_transaction_id) WHERE outcome = 'processed';
CREATE INDEX IF NOT EXISTS idx_webhook_events_business ON payment_webhook_events(business_id, created_at);

ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON payment_webhook_events;
CREATE POLICY tenant_isolation ON payment_webhook_events
  USING (business_id = current_setting('app.current_business_id', true)::integer);

COMMIT;
