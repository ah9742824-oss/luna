-- ============================================================================
-- Migration 0002: drop legacy single-tenant tables
--
-- Run this only after confirming (in your environment) that the backend is
-- fully cut over to `profiles` and `businesses` (i.e. after 0001 has been
-- applied and the deployed Worker code from this same release is live).
-- Kept as its own migration, instead of folding into 0001, specifically so
-- you can delay/skip it if you need a rollback window — see section 85.
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS cafe_info;

COMMIT;
