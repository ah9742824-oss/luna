/**
 * LUNA Cafe - DESTRUCTIVE demo reset script
 *
 * ============================================================
 * WARNING: THIS DELETES DATA.
 *
 * This DELETEs every products/categories/reviews/gallery row belonging to
 * the 'luna-cafe' business only (other businesses on the same reusable
 * backend, if any, are never touched) and re-inserts the demo dataset from
 * scratch.
 *
 * NEVER run this against a café's real production data — it will
 * permanently delete every product, category, review, and gallery
 * image currently in the database for luna-cafe, including anything added
 * through the admin dashboard.
 *
 * This exists only for resetting a portfolio/demo deployment back
 * to a clean state. It is intentionally a separate command from
 * `npm run seed` so it can never run by accident.
 * ============================================================
 *
 * Usage:
 *   cd backend
 *   cp .env.example .env   # fill in SUPABASE_DB_URL, ADMIN_EMAIL, ADMIN_PASSWORD
 *   CONFIRM_RESET=yes npm run seed:demo-reset
 *
 * The CONFIRM_RESET=yes environment variable must be set explicitly;
 * running `npm run seed:demo-reset` alone will refuse and exit.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

if (process.env.CONFIRM_RESET !== 'yes') {
  console.error(
    'Refusing to run: this script deletes all products, categories, reviews, and gallery rows.\n' +
    'If you are certain you want to reset a DEMO/PORTFOLIO deployment (never production data),\n' +
    'run again with:  CONFIRM_RESET=yes npm run seed:demo-reset'
  );
  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`${name} is required. Set it in backend/.env before running this script.`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_DB_URL = requireEnv('SUPABASE_DB_URL');
const ADMIN_EMAIL = requireEnv('ADMIN_EMAIL');
const ADMIN_PASSWORD = requireEnv('ADMIN_PASSWORD');

const pool = new Pool({ connectionString: SUPABASE_DB_URL });

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

async function reset() {
  const client = await pool.connect();
  try {
    console.warn('Resetting LUNA Cafe demo tables — this deletes existing rows...');
    await client.query('BEGIN');

    const businessResult = await client.query('SELECT id FROM businesses WHERE slug = $1', ['luna-cafe']);
    if (businessResult.rows.length === 0) {
      throw new Error("No business with slug 'luna-cafe' found. Run `npm run migrate` first.");
    }
    const businessId = businessResult.rows[0].id;

    // Only this business's rows are wiped — other tenants sharing the same
    // reusable backend (section 8) are never touched by a demo reset.
    await client.query('DELETE FROM products WHERE business_id = $1', [businessId]);
    await client.query('DELETE FROM categories WHERE business_id = $1', [businessId]);
    await client.query('DELETE FROM reviews WHERE business_id = $1', [businessId]);
    await client.query('DELETE FROM gallery WHERE business_id = $1', [businessId]);

    const categoryIdBySlug = {};
    for (const c of categories) {
      const res = await client.query(
        `INSERT INTO categories (business_id, name, name_ar, slug, display_order) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [businessId, c.name, c.name_ar, c.slug, c.display_order]
      );
      categoryIdBySlug[c.slug] = res.rows[0].id;
    }

    for (const [slug, items] of Object.entries(productsByCategory)) {
      for (const [name, name_ar, description, description_ar, price, image_url] of items) {
        await client.query(
          `INSERT INTO products (business_id, category_id, name, name_ar, description, description_ar, price, image_url, is_available)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
          [businessId, categoryIdBySlug[slug], name, name_ar, description, description_ar, price, image_url]
        );
      }
    }

    for (const [customer_name, rating, comment] of reviews) {
      await client.query(
        `INSERT INTO reviews (business_id, customer_name, rating, comment, is_enabled) VALUES ($1,$2,$3,$4,TRUE)`,
        [businessId, customer_name, rating, comment]
      );
    }

    for (const [image_url, caption, display_order] of gallery) {
      await client.query(
        `INSERT INTO gallery (business_id, image_url, caption, display_order) VALUES ($1,$2,$3,$4)`,
        [businessId, image_url, caption, display_order]
      );
    }

    const superAdminRole = await client.query(`SELECT id FROM roles WHERE key = 'super_admin'`);
    const roleId = superAdminRole.rows[0].id;
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await client.query('DELETE FROM profiles WHERE email = $1 AND business_id = $2', [ADMIN_EMAIL, businessId]);
    await client.query(
      `INSERT INTO profiles (business_id, role_id, name, email, password_hash) VALUES ($1,$2,$3,$4,$5)`,
      [businessId, roleId, 'Admin', ADMIN_EMAIL, passwordHash]
    );

    await client.query('COMMIT');
    console.log('Demo reset complete.');
    console.log(`Admin login -> email: ${ADMIN_EMAIL}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reset failed, rolled back:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

reset();
