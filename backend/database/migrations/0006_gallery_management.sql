-- ============================================================================
-- Migration 0006: Gallery management
-- Adds visibility control without affecting existing gallery images.
-- ============================================================================

BEGIN;

ALTER TABLE gallery
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_gallery_business_visible_order
  ON gallery (business_id, is_visible, display_order, id);

COMMIT;