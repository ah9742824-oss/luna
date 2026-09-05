/**
 * LUNA Cafe - SAFE demo data seeder
 *
 * This is a plain Node.js script — it does NOT run on Cloudflare Workers and
 * is never deployed or run automatically. Run it locally, manually, whenever
 * you want to make sure the demo dataset and admin account exist.
 *
 * It connects DIRECTLY to Supabase (not through Hyperdrive — Hyperdrive is
 * only used by the deployed Worker's request-time queries).
 *
 * SAFE TO RUN AGAINST A LIVE CAFE'S DATA:
 *   - It NEVER truncates or deletes products, categories, reviews, or gallery rows.
 *   - Each demo table (categories/products/reviews/gallery) is only ever
 *     populated with demo rows if that table is currently completely empty.
 *     If real data already exists, this script leaves it untouched.
 *   - Business profile fields (name/phone/address/etc) are never touched by
 *     this script — they're seeded once by migration 0001 and from then on
 *     only editable via the admin dashboard / PUT /api/business.
 *   - The admin account is upserted by (business, email): if ADMIN_EMAIL
 *     already exists on the luna-cafe business, only its password/name are
 *     updated (no duplicate account is created).
 *
 * REQUIRES migration 0001_multitenant_foundation.sql to have already been
 * applied (`npm run migrate`) — that migration creates the 'luna-cafe'
 * business row this script seeds demo content into.
 *
 * Usage:
 *   cd backend
 *   cp .env.example .env   # fill in SUPABASE_DB_URL, ADMIN_EMAIL, ADMIN_PASSWORD
 *   npm run seed
 *
 * ADMIN_EMAIL and ADMIN_PASSWORD are REQUIRED — there is no default password.
 * The script refuses to run without them.
 *
 * For a destructive full reset of the DEMO tables (deletes products/
 * categories/reviews/gallery before reseeding), use the separate, clearly
 * named script instead: `npm run seed:demo-reset` — never use that against
 * a café's real data.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`${name} is required. Set it in backend/.env before running the seed script.`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_DB_URL = requireEnv('SUPABASE_DB_URL');
const ADMIN_EMAIL = requireEnv('ADMIN_EMAIL');
const ADMIN_PASSWORD = requireEnv('ADMIN_PASSWORD');

const pool = new Pool({ connectionString: SUPABASE_DB_URL });

// ---- Demo dataset (used only to fill tables that are currently empty) ----

const categories = [
  { name: 'Coffee', name_ar: 'قهوة', slug: 'coffee', display_order: 1 },
  { name: 'Hot Drinks', name_ar: 'مشروبات ساخنة', slug: 'hot-drinks', display_order: 2 },
  { name: 'Cold Drinks', name_ar: 'مشروبات باردة', slug: 'cold-drinks', display_order: 3 },
  { name: 'Desserts', name_ar: 'حلويات', slug: 'desserts', display_order: 4 },
  { name: 'Breakfast', name_ar: 'فطور', slug: 'breakfast', display_order: 5 },
  { name: 'Sandwiches', name_ar: 'ساندويشات', slug: 'sandwiches', display_order: 6 },
];

const productsByCategory = {
  coffee: [
    ['Espresso', 'إسبريسو', 'Rich and concentrated Arabica shot', 'قهوة مركزة وغنية من حبوب الأرابيكا', 12, 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=600'],
    ['Americano', 'أمريكانو', 'Espresso diluted with hot water', 'إسبريسو ممزوج بالماء الساخن', 14, 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=600'],
    ['Cappuccino', 'كابتشينو', 'Espresso with steamed milk foam', 'إسبريسو مع رغوة حليب مبخرة', 16, 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=600'],
    ['Latte', 'لاتيه', 'Smooth espresso with steamed milk', 'إسبريسو ناعم مع حليب مبخر', 17, 'https://images.unsplash.com/photo-1561047029-3000c68339ca?w=600'],
    ['Turkish Coffee', 'قهوة تركية', 'Traditional finely ground coffee', 'قهوة تقليدية مطحونة ناعماً', 13, 'https://images.unsplash.com/photo-1610632380989-680fe40816c6?w=600'],
    ['Mocha', 'موكا', 'Espresso with chocolate and milk', 'إسبريسو مع الشوكولاتة والحليب', 18, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600'],
  ],
  'hot-drinks': [
    ['Green Tea', 'شاي أخضر', 'Light and refreshing green tea', 'شاي أخضر خفيف ومنعش', 10, 'https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?w=600'],
    ['Moroccan Mint Tea', 'شاي بالنعناع', 'Traditional mint tea', 'شاي تقليدي بالنعناع الطازج', 11, 'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=600'],
    ['Hot Chocolate', 'شوكولاتة ساخنة', 'Creamy rich hot chocolate', 'شوكولاتة ساخنة غنية وكريمية', 16, 'https://images.unsplash.com/photo-1517578239113-b03992dcdd25?w=600'],
    ['Karak Tea', 'شاي كرك', 'Spiced milk tea', 'شاي بالحليب والتوابل', 10, 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=600'],
  ],
  'cold-drinks': [
    ['Iced Latte', 'لاتيه مثلج', 'Chilled espresso with cold milk', 'إسبريسو بارد مع حليب مثلج', 18, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600'],
    ['Iced Americano', 'أمريكانو مثلج', 'Chilled espresso with cold water', 'إسبريسو بارد مع ماء مثلج', 15, 'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?w=600'],
    ['Mango Smoothie', 'عصير مانجو', 'Fresh mango blended smoothie', 'عصير مانجو طازج ومخفوق', 19, 'https://images.unsplash.com/photo-1546173159-315724a31696?w=600'],
    ['Strawberry Lemonade', 'ليموناضة فراولة', 'Refreshing strawberry lemonade', 'ليموناضة منعشة بالفراولة', 17, 'https://images.unsplash.com/photo-1497534446932-c925b458314e?w=600'],
  ],
  desserts: [
    ['Cheesecake', 'تشيز كيك', 'Classic creamy cheesecake slice', 'قطعة تشيز كيك كريمية كلاسيكية', 22, 'https://images.unsplash.com/photo-1524351199678-941a58a3df50?w=600'],
    ['Chocolate Brownie', 'براوني شوكولاتة', 'Warm fudgy chocolate brownie', 'براوني شوكولاتة دافئ وطري', 18, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600'],
    ['Baklava', 'بقلاوة', 'Sweet layered pastry with nuts', 'حلوى مورقة محشوة بالمكسرات', 15, 'https://images.unsplash.com/photo-1519676867240-f03562e64548?w=600'],
  ],
  breakfast: [
    ['Croissant', 'كرواسون', 'Buttery flaky French pastry', 'معجنات فرنسية طبقية بالزبدة', 12, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600'],
    ['Pancakes', 'بان كيك', 'Fluffy pancakes with syrup', 'بان كيك طري مع شراب القيقب', 20, 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600'],
    ['Shakshuka', 'شكشوكة', 'Eggs poached in tomato sauce', 'بيض مطهو في صلصة الطماطم', 24, 'https://images.unsplash.com/photo-1590412200988-a436970781fa?w=600'],
  ],
  sandwiches: [
    ['Club Sandwich', 'ساندويش كلوب', 'Triple-decker classic sandwich', 'ساندويش كلاسيكي بثلاث طبقات', 26, 'https://images.unsplash.com/photo-1567234669003-dce7a7a88821?w=600'],
    ['Halloumi Sandwich', 'ساندويش حلوم', 'Grilled halloumi with veggies', 'حلوم مشوي مع الخضار', 22, 'https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=600'],
  ],
};

const reviews = [
  ['Sara Ahmed', 5, 'أفضل قهوة تركية جربتها في المدينة! الأجواء رائعة والخدمة ممتازة.'],
  ['Omar Khaled', 5, 'مكان مريح جداً للعمل والدراسة، والكابتشينو لذيذ جداً.'],
  ['Lina Youssef', 4, 'الحلويات رائعة خصوصاً التشيز كيك، بالتأكيد سأعود مرة أخرى.'],
  ['Hassan Ali', 5, 'خدمة سريعة وموظفون لطيفون، أنصح بتجربة الشكشوكة على الفطور.'],
  ['Maya Nasser', 4, 'مكان جميل بديكور دافئ، والأسعار معقولة مقارنة بالجودة.'],
];

const gallery = [
  ['https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800', 'Cafe interior', 1],
  ['https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800', 'Coffee bar', 2],
  ['https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=800', 'Latte art', 3],
  ['https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800', 'Cozy seating', 4],
  ['https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800', 'Coffee beans', 5],
  ['https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=800', 'Cafe counter', 6],
  ['https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=800', 'Pastry display', 7],
  ['https://images.unsplash.com/photo-1481833761820-0509d3217039?w=800', 'Terrace seating', 8],
];

async function tableIsEmpty(client, tableName, businessId) {
  const result = await client.query(`SELECT 1 FROM ${tableName} WHERE business_id = $1 LIMIT 1`, [businessId]);
  return result.rows.length === 0;
}

// Requires migration 0001 to have already run (creates the businesses/roles/
// profiles tables and the default 'luna-cafe' business). This script only
// seeds DEMO CONTENT into that business — it never creates businesses itself,
// so it stays a safe, idempotent "make sure demo data exists" tool rather
// than a tenant-provisioning tool. See docs/CLIENT_SETUP.md for onboarding a
// brand-new business.
async function getLunaBusinessId(client) {
  const result = await client.query('SELECT id FROM businesses WHERE slug = $1', ['luna-cafe']);
  if (result.rows.length === 0) {
    throw new Error(
      "No business with slug 'luna-cafe' found. Run `npm run migrate` first — migration " +
      '0001_multitenant_foundation.sql creates it automatically.'
    );
  }
  return result.rows[0].id;
}

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding LUNA Cafe (safe/non-destructive) into Supabase...');
    await client.query('BEGIN');

    const businessId = await getLunaBusinessId(client);

    // --- Categories: only insert demo categories that don't already exist
    // for this business (relies on the (business_id, slug) unique index). ---
    const categoryIdBySlug = {};
    const existingCategories = await client.query('SELECT id, slug FROM categories WHERE business_id = $1', [businessId]);
    for (const row of existingCategories.rows) categoryIdBySlug[row.slug] = row.id;

    for (const c of categories) {
      if (categoryIdBySlug[c.slug]) continue; // already exists — leave it alone
      const res = await client.query(
        `INSERT INTO categories (business_id, name, name_ar, slug, display_order)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (business_id, slug) DO NOTHING
         RETURNING id`,
        [businessId, c.name, c.name_ar, c.slug, c.display_order]
      );
      if (res.rows[0]) categoryIdBySlug[c.slug] = res.rows[0].id;
    }
    console.log(`Categories: ${Object.keys(categoryIdBySlug).length} present (demo rows added only where missing).`);

    // --- Products: only seed demo products if this business has none yet. ---
    if (await tableIsEmpty(client, 'products', businessId)) {
      for (const [slug, items] of Object.entries(productsByCategory)) {
        const categoryId = categoryIdBySlug[slug];
        if (!categoryId) continue;
        for (const [name, name_ar, description, description_ar, price, image_url] of items) {
          await client.query(
            `INSERT INTO products (business_id, category_id, name, name_ar, description, description_ar, price, image_url, is_available)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
            [businessId, categoryId, name, name_ar, description, description_ar, price, image_url]
          );
        }
      }
      console.log('Products: table was empty for this business — demo products inserted.');
    } else {
      console.log('Products: this business already has data — left untouched.');
    }

    // --- Reviews: only seed if this business has none yet. ---
    if (await tableIsEmpty(client, 'reviews', businessId)) {
      for (const [customer_name, rating, comment] of reviews) {
        await client.query(
          `INSERT INTO reviews (business_id, customer_name, rating, comment, is_enabled) VALUES ($1,$2,$3,$4,TRUE)`,
          [businessId, customer_name, rating, comment]
        );
      }
      console.log('Reviews: table was empty for this business — demo reviews inserted.');
    } else {
      console.log('Reviews: this business already has data — left untouched.');
    }

    // --- Gallery: only seed if this business has none yet. ---
    if (await tableIsEmpty(client, 'gallery', businessId)) {
      for (const [image_url, caption, display_order] of gallery) {
        await client.query(
          `INSERT INTO gallery (business_id, image_url, caption, display_order) VALUES ($1,$2,$3,$4)`,
          [businessId, image_url, caption, display_order]
        );
      }
      console.log('Gallery: table was empty for this business — demo images inserted.');
    } else {
      console.log('Gallery: this business already has data — left untouched.');
    }

    // Business profile fields (name/phone/address/etc) are seeded by
    // migration 0001 itself (copied from the old cafe_info row, or sensible
    // defaults on a fresh install) — this script no longer touches them, to
    // avoid ever overwriting real business info an admin already edited via
    // PUT /api/business.

    // --- Admin account: upsert by (business_id, email) into `profiles`,
    // role = super_admin. Updates password/name if the account already
    // exists; never creates a duplicate, never uses a fallback password
    // (ADMIN_PASSWORD is required — enforced above). ---
    const superAdminRole = await client.query(`SELECT id FROM roles WHERE key = 'super_admin'`);
    const roleId = superAdminRole.rows[0].id;

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const existingProfile = await client.query(
      'SELECT id FROM profiles WHERE email = $1 AND business_id = $2',
      [ADMIN_EMAIL, businessId]
    );
    if (existingProfile.rows.length > 0) {
      await client.query(
        `UPDATE profiles SET name = $1, password_hash = $2, role_id = $3, is_active = TRUE WHERE email = $4 AND business_id = $5`,
        ['Admin', passwordHash, roleId, ADMIN_EMAIL, businessId]
      );
      console.log(`Admin account: existing profile for ${ADMIN_EMAIL} updated (password refreshed).`);
    } else {
      await client.query(
        `INSERT INTO profiles (business_id, role_id, name, email, password_hash) VALUES ($1,$2,$3,$4,$5)`,
        [businessId, roleId, 'Admin', ADMIN_EMAIL, passwordHash]
      );
      console.log(`Admin account: created for ${ADMIN_EMAIL}.`);
    }

    await client.query('COMMIT');
    console.log('Seed complete. No existing data was deleted.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed, nothing was changed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
