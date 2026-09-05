-- LUNA Cafe - Database Schema (PostgreSQL)
-- Run this once against an empty database to create all tables.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  name_ar VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  name_ar VARCHAR(150) NOT NULL,
  description TEXT,
  description_ar TEXT,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(120) NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gallery (
  id SERIAL PRIMARY KEY,
  image_url TEXT NOT NULL,
  caption VARCHAR(200),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cafe_info (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL DEFAULT 'LUNA Café',
  name_ar VARCHAR(150) NOT NULL DEFAULT 'لونا كافيه',
  description TEXT,
  description_ar TEXT,
  phone VARCHAR(30),
  whatsapp VARCHAR(30),
  address TEXT,
  address_ar TEXT,
  opening_hours TEXT,
  opening_hours_ar TEXT,
  google_maps_url TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  twitter_url TEXT,
  logo_url TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Keep updated_at fresh automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_categories_updated ON categories;
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_reviews_updated ON reviews;
CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_cafe_info_updated ON cafe_info;
CREATE TRIGGER trg_cafe_info_updated BEFORE UPDATE ON cafe_info
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
