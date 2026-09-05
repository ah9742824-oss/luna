-- ============================================================================
-- Migration 0003: Core backend + orders (MASTER PROMPT V2 sections 10, 27-39,
-- 49, 58, 68, 70)
--
-- Everything here follows the same rules as 0001: additive, non-destructive,
-- safe to run against a database that already has real Phase 1 data.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Order-related business settings (section 68/70) not covered by 0001
-- ---------------------------------------------------------------------------
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS accept_delivery BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS accept_pickup BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS accept_dine_in BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS minimum_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;
-- Percentage, e.g. 14.00 for 14%. Applied to subtotal after discount.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tax_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'EGP';
-- Human-readable order number prefix (section 31, e.g. "LUNA-10025").
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS order_number_prefix VARCHAR(20);
UPDATE businesses SET order_number_prefix = UPPER(REGEXP_REPLACE(slug, '[^a-zA-Z0-9]', '', 'g'))
  WHERE order_number_prefix IS NULL;
ALTER TABLE businesses ALTER COLUMN order_number_prefix SET NOT NULL;
-- Atomically incremented per business inside the same transaction as order
-- creation (`SELECT ... FOR UPDATE` on this row) to generate order_number
-- without a global sequence shared across tenants.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS last_order_number INTEGER NOT NULL DEFAULT 10000;

-- ---------------------------------------------------------------------------
-- 2. Customers + addresses (sections 13, 14)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(30),
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- A customer account is always tied to one business (section 8) — the same
-- person creates a separate account per café/restaurant they order from,
-- same as the admin `profiles` model in 0001.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_business_email ON customers(business_id, LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(business_id, phone);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label VARCHAR(60),
  recipient_name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address_line TEXT NOT NULL,
  city VARCHAR(100),
  notes TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_addresses_business ON customer_addresses(business_id);
CREATE INDEX IF NOT EXISTS idx_addresses_customer ON customer_addresses(customer_id);

-- ---------------------------------------------------------------------------
-- 3. Coupons (section 38)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('percentage', 'fixed_amount')),
  value NUMERIC(10, 2) NOT NULL CHECK (value > 0),
  minimum_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  -- Only meaningful for type='percentage' (caps the discount amount); NULL = uncapped.
  maximum_discount_amount NUMERIC(10, 2),
  usage_limit INTEGER, -- NULL = unlimited
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coupons_business_code ON coupons(business_id, UPPER(code));
CREATE INDEX IF NOT EXISTS idx_coupons_business ON coupons(business_id);

-- ---------------------------------------------------------------------------
-- 4. Orders + order_items (sections 27-34, 96)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,

  -- Guest checkout contact details (section 13) — populated when customer_id
  -- is NULL. Never both empty.
  guest_name VARCHAR(120),
  guest_phone VARCHAR(30),
  guest_email VARCHAR(150),

  order_number VARCHAR(40) NOT NULL,
  order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('pickup', 'delivery', 'dine_in')),
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'
  )),

  -- Server-computed monetary fields (section 29) — NEVER written from a
  -- client-submitted value. See services/orderPricing.js.
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  tax NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),

  coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_code_snapshot VARCHAR(40),

  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'card', 'online')),
  -- 'paid' is only ever set by: (a) an admin manually confirming CASH was
  -- received, or (b) a verified payment provider webhook (section 79/102) —
  -- never directly from client input at order-creation time.
  payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'failed', 'refunded')),

  address_snapshot JSONB,
  table_number VARCHAR(20),
  notes TEXT,

  -- Idempotency (section 34): a client-generated key (one per checkout
  -- attempt, reused across retries of the SAME attempt). Enforced with a
  -- real unique index below, not just an application-layer check.
  idempotency_key VARCHAR(100),

  -- Opaque, unguessable token for guest order tracking (section 33) — never
  -- expose orders by sequential id alone.
  access_token VARCHAR(64) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_order_customer_or_guest CHECK (
    customer_id IS NOT NULL OR (guest_name IS NOT NULL AND guest_phone IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_business_number ON orders(business_id, order_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_business_idempotency ON orders(business_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_access_token ON orders(access_token);
CREATE INDEX IF NOT EXISTS idx_orders_business ON orders(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_business_status ON orders(business_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  -- Snapshots (section 30): historical orders must not change when the
  -- product catalog changes later.
  product_name_snapshot VARCHAR(150) NOT NULL,
  product_name_ar_snapshot VARCHAR(150) NOT NULL,
  unit_price_snapshot NUMERIC(10, 2) NOT NULL CHECK (unit_price_snapshot >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_business ON order_items(business_id);

CREATE TABLE IF NOT EXISTS coupon_usage (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  discount_amount NUMERIC(10, 2) NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coupon_usage_order ON coupon_usage(order_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon ON coupon_usage(coupon_id);

-- ---------------------------------------------------------------------------
-- 5. Payments + invoices (sections 35-37)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL, -- 'cash' | 'card' (in-person) | a real gateway name once integrated
  provider_transaction_id VARCHAR(150),
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_business ON payments(business_id);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_number VARCHAR(40) NOT NULL,
  -- Full point-in-time snapshot (business info, customer info, items,
  -- totals, payment method) — section 37 "historical invoice data must
  -- remain accurate" even if the business/product/customer records change
  -- afterward.
  snapshot JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_business_number ON invoices(business_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_order ON invoices(order_id);

-- ---------------------------------------------------------------------------
-- 6. Notifications (section 49)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- Exactly one audience: business-wide admin notification (customer_id
  -- NULL) or a specific customer's notification (customer_id set).
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  related_order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_business ON notifications(business_id, customer_id, is_read);

-- ---------------------------------------------------------------------------
-- 7. Audit log (section 58)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  action VARCHAR(60) NOT NULL,
  resource_type VARCHAR(40) NOT NULL,
  resource_id VARCHAR(40),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_business ON audit_logs(business_id, created_at);

-- ---------------------------------------------------------------------------
-- 8. updated_at triggers for new tables
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_customers_updated ON customers;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_addresses_updated ON customer_addresses;
CREATE TRIGGER trg_addresses_updated BEFORE UPDATE ON customer_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_coupons_updated ON coupons;
CREATE TRIGGER trg_coupons_updated BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated ON payments;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. Row Level Security (defense-in-depth, same model as 0001)
-- ---------------------------------------------------------------------------
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usage       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs         ENABLE ROW LEVEL SECURITY;

ALTER TABLE customers          FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses FORCE ROW LEVEL SECURITY;
ALTER TABLE coupons            FORCE ROW LEVEL SECURITY;
ALTER TABLE orders             FORCE ROW LEVEL SECURITY;
ALTER TABLE order_items        FORCE ROW LEVEL SECURITY;
ALTER TABLE coupon_usage       FORCE ROW LEVEL SECURITY;
ALTER TABLE payments           FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices           FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications      FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs         FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','customer_addresses','coupons','orders','order_items','coupon_usage','payments','invoices','notifications','audit_logs']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (business_id = current_setting(''app.current_business_id'', true)::integer)', t);
  END LOOP;
END $$;

COMMIT;
