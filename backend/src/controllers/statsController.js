import { query } from '../config/db.js';
import { json } from '../utils/http.js';

// GET /api/stats — powers the admin dashboard summary cards, scoped to the
// authenticated admin's business only.
export async function getStats(request, env) {
  const businessId = request.business.id;
  const [products, categories, available, unavailable] = await Promise.all([
    query(env, 'SELECT COUNT(*)::int AS count FROM products WHERE business_id = $1', [businessId]),
    query(env, 'SELECT COUNT(*)::int AS count FROM categories WHERE business_id = $1', [businessId]),
    query(env, 'SELECT COUNT(*)::int AS count FROM products WHERE business_id = $1 AND is_available = TRUE', [businessId]),
    query(env, 'SELECT COUNT(*)::int AS count FROM products WHERE business_id = $1 AND is_available = FALSE', [businessId]),
  ]);

  return json({
    success: true,
    data: {
      totalProducts: products.rows[0].count,
      totalCategories: categories.rows[0].count,
      availableProducts: available.rows[0].count,
      unavailableProducts: unavailable.rows[0].count,
    },
  });
}
