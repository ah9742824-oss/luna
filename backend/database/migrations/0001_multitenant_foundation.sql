-- ============================================================================
-- Migration 0001: Multi-tenant foundation
--
-- Converts the single-tenant LUNA Cafe schema into the reusable multi-business
-- core described in MASTER PROMPT V2 (sections 7-11, 16).
--
-- Strategy (safe on a database that already has real LUNA Cafe data):
--   1. Create the new tenant/RBAC tables (businesses, roles, permissions,
--      role_permissions, profiles).
--   2. Insert exactly one business row ("luna-cafe") representing the
--      existing café, using data copied from the old cafe_info table.
--   3. Add business_id to every existing business-scoped table and backfill
--      it with the luna-cafe business id (existing rows are never deleted).
--   4. Only after backfill do we add NOT NULL + FK + indexes, so this never
--      fails on non-empty tables.
--   5. Migrate the old `users` table into `profiles` (role = super_admin),
--      keeping the same id/email/password_hash so existing admin logins keep
--      working after the backend switch-over. The old `users` table is kept
--      (not dropped) for one release as a safety net; see 0002 for cleanup.
--   6. Retire cafe_info in favor of columns on businesses (section 11).
--   7. Enable Row Level Security as defense-in-depth (see backend/README.md
--      "Multi-tenant security model" for why RLS alone is not sufficient
--      when the Worker connects through a single pooled Hyperdrive role, and
--      what the app layer additionally guarantees).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Core tenant table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS businesses (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  name_ar VARCHAR(150) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'cafe'
    CHECK (type IN ('cafe', 'restaurant', 'store', 'bakery', 'juice_shop', 'service', 'custom')),
  description TEXT,
  description_ar TEXT,
  logo_url TEXT,
  cover_url TEXT,
  phone VARCHAR(30),
  whatsapp VARCHAR(30),
  email VARCHAR(150),
  address TEXT,
  address_ar TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  -- Structured per-day opening hours, e.g.
  -- {"sat": {"open": "09:00", "close": "23:00", "closed": false}, ...}
  working_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- {"instagram": "...", "facebook": "...", "twitter": "...", "google_maps": "..."}
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Frontend theme/branding hints (colors, accent, etc). Frontend-owned shape.
  theme_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Enabled feature modules for this business (section 75): ordering, reviews,
  -- gallery, bookings, tables, coupons, delivery, dine_in, pickup...
  enabled_modules JSONB NOT NULL DEFAULT
    '{"ordering": true, "reviews": true, "gallery": true, "coupons": true, "delivery": true, "pickup": true, "dine_in": true, "bookings": false}'::jsonb,
  -- Order-acceptance kill switch (section 70).
  accept_orders BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. RBAC: roles / permissions / role_permissions (section 16)
--    Global catalog (not per-business) — every business gets the same
--    starting role set. Kept generic so future roles can be added without
--    an "if (role === ...)" scattered through the backend (section 9).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  key VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  name_ar VARCHAR(100) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  key VARCHAR(60) UNIQUE NOT NULL,
  description VARCHAR(200) NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

INSERT INTO roles (key, name, name_ar) VALUES
  ('super_admin', 'Super Admin', 'مدير عام'),
  ('manager', 'Manager', 'مدير'),
  ('staff', 'Staff', 'موظف'),
  ('content_manager', 'Content Manager', 'مدير محتوى')
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (key, description) VALUES
  ('products.manage', 'Create, edit, delete, and reorder products'),
  ('categories.manage', 'Create, edit, delete, and reorder categories'),
  ('orders.view', 'View orders'),
  ('orders.manage', 'Update order status'),
  ('customers.view', 'View customer accounts and order history'),
  ('customers.manage', 'Edit customer accounts'),
  ('reviews.manage', 'Approve, reject, hide, delete, feature reviews'),
  ('gallery.manage', 'Upload, delete, reorder gallery images'),
  ('coupons.manage', 'Create, edit, delete coupons'),
  ('invoices.view', 'View and print invoices'),
  ('business.manage', 'Edit business profile and settings'),
  ('statistics.view', 'View admin dashboard statistics'),
  ('staff.manage', 'Create, edit, deactivate staff accounts and roles'),
  ('audit_log.view', 'View the audit log')
ON CONFLICT (key) DO NOTHING;

-- super_admin: everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.key = 'super_admin'
ON CONFLICT DO NOTHING;

-- manager: everything except staff.manage
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.key = 'manager' AND p.key <> 'staff.manage'
ON CONFLICT DO NOTHING;

-- staff: orders only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.key = 'staff' AND p.key IN ('orders.view', 'orders.manage')
ON CONFLICT DO NOTHING;

-- content_manager: catalog + gallery + reviews
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.key = 'content_manager' AND p.key IN ('products.manage', 'categories.manage', 'gallery.manage', 'reviews.manage')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Seed the luna-cafe business from the existing cafe_info row (if any)
-- ---------------------------------------------------------------------------
INSERT INTO businesses (name, name_ar, slug, type, description, description_ar,
  logo_url, phone, whatsapp, address, address_ar, social_links, working_hours)
SELECT
  COALESCE(name, 'LUNA Café'),
  COALESCE(name_ar, 'لونا كافيه'),
  'luna-cafe',
  'cafe',
  description, description_ar, logo_url, phone, whatsapp, address, address_ar,
  jsonb_strip_nulls(jsonb_build_object(
    'instagram', instagram_url, 'facebook', facebook_url,
    'twitter', twitter_url, 'google_maps', google_maps_url
  )),
  jsonb_build_object('text', opening_hours, 'text_ar', opening_hours_ar)
FROM cafe_info
WHERE EXISTS (SELECT 1 FROM cafe_info)
ON CONFLICT (slug) DO NOTHING;

-- If cafe_info was empty (fresh install), still guarantee the default
-- business exists so business_id backfills below never have nowhere to point.
INSERT INTO businesses (name, name_ar, slug, type)
VALUES ('LUNA Café', 'لونا كافيه', 'luna-cafe', 'cafe')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. business_id on every existing business-scoped table
-- ---------------------------------------------------------------------------
ALTER TABLE categories ADD COLUMN IF NOT EXISTS business_id INTEGER;
ALTER TABLE products   ADD COLUMN IF NOT EXISTS business_id INTEGER;
ALTER TABLE reviews    ADD COLUMN IF NOT EXISTS business_id INTEGER;
ALTER TABLE gallery    ADD COLUMN IF NOT EXISTS business_id INTEGER;

UPDATE categories SET business_id = (SELECT id FROM businesses WHERE slug = 'luna-cafe') WHERE business_id IS NULL;
UPDATE products   SET business_id = (SELECT id FROM businesses WHERE slug = 'luna-cafe') WHERE business_id IS NULL;
UPDATE reviews    SET business_id = (SELECT id FROM businesses WHERE slug = 'luna-cafe') WHERE business_id IS NULL;
UPDATE gallery    SET business_id = (SELECT id FROM businesses WHERE slug = 'luna-cafe') WHERE business_id IS NULL;

ALTER TABLE categories ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE products   ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE reviews    ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE gallery    ALTER COLUMN business_id SET NOT NULL;

ALTER TABLE categories ADD CONSTRAINT fk_categories_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE products   ADD CONSTRAINT fk_products_business   FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE reviews    ADD CONSTRAINT fk_reviews_business    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;
ALTER TABLE gallery    ADD CONSTRAINT fk_gallery_business    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_categories_business ON categories(business_id);
CREATE INDEX IF NOT EXISTS idx_products_business   ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_reviews_business    ON reviews(business_id);
CREATE INDEX IF NOT EXISTS idx_gallery_business    ON gallery(business_id);

-- Category slugs were globally unique; must become unique per business.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_business_slug ON categories(business_id, slug);

-- ---------------------------------------------------------------------------
-- 5. profiles (replaces `users` as the admin/staff account table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, email)
);
CREATE INDEX IF NOT EXISTS idx_profiles_business ON profiles(business_id);

-- Migrate existing admin(s) from `users` into `profiles` as super_admin,
-- attached to the luna-cafe business. Keeps the same password_hash so
-- existing credentials keep working with zero downtime. Written with
-- explicit JOINs (rather than scalar subqueries in the SELECT list) purely
-- for portability across SQL tooling.
INSERT INTO profiles (business_id, role_id, name, email, password_hash, is_active, created_at, updated_at)
SELECT b.id, r.id, u.name, u.email, u.password_hash, TRUE, u.created_at, u.updated_at
FROM users u
JOIN businesses b ON b.slug = 'luna-cafe'
JOIN roles r ON r.key = 'super_admin'
LEFT JOIN profiles p ON p.email = u.email AND p.business_id = b.id
WHERE p.id IS NULL;

-- `users` is intentionally NOT dropped here — see 0002_cleanup_legacy_users.sql,
-- applied only after the backend cut-over to `profiles` has been verified in
-- production (section 85: never destroy data you might still need to roll back to).

-- ---------------------------------------------------------------------------
-- 6. Retire cafe_info in favor of columns on businesses
-- ---------------------------------------------------------------------------
-- Not dropped for the same rollback-safety reason as `users`; the backend
-- stops reading/writing it as of this migration. See 0002 for cleanup.

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers for new tables
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_businesses_updated ON businesses;
CREATE TRIGGER trg_businesses_updated BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Row Level Security (defense-in-depth — see backend/README.md)
-- ---------------------------------------------------------------------------
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery    ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;

ALTER TABLE categories FORCE ROW LEVEL SECURITY;
ALTER TABLE products   FORCE ROW LEVEL SECURITY;
ALTER TABLE reviews    FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery    FORCE ROW LEVEL SECURITY;
ALTER TABLE profiles   FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON categories;
CREATE POLICY tenant_isolation ON categories
  USING (business_id = current_setting('app.current_business_id', true)::integer);

DROP POLICY IF EXISTS tenant_isolation ON products;
CREATE POLICY tenant_isolation ON products
  USING (business_id = current_setting('app.current_business_id', true)::integer);

DROP POLICY IF EXISTS tenant_isolation ON reviews;
CREATE POLICY tenant_isolation ON reviews
  USING (business_id = current_setting('app.current_business_id', true)::integer);

DROP POLICY IF EXISTS tenant_isolation ON gallery;
CREATE POLICY tenant_isolation ON gallery
  USING (business_id = current_setting('app.current_business_id', true)::integer);

DROP POLICY IF EXISTS tenant_isolation ON profiles;
CREATE POLICY tenant_isolation ON profiles
  USING (business_id = current_setting('app.current_business_id', true)::integer);

COMMIT;
