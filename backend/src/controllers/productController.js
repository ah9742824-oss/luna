import { query, tenantQuery } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import {
  isNonEmptyString, isNonNegativeNumber, isPositiveInteger, isBooleanIfProvided,
} from '../utils/validate.js';

// Fire-and-forget audit entry (section 58) for a completed product mutation.
// Deliberately a separate statement/transaction from the mutation itself —
// an audit-log write failure must never block or roll back the actual
// product change; see utils/audit.js for the transactional version used by
// order creation, where atomicity does matter.
async function auditProduct(env, request, action, productId, metadata) {
  await tenantQuery(
    env, request.business.id,
    `INSERT INTO audit_logs (business_id, profile_id, action, resource_type, resource_id, metadata) VALUES ($1,$2,$3,'product',$4,$5)`,
    [request.business.id, request.user.id, action, String(productId), JSON.stringify(metadata)]
  ).catch((err) => console.error('audit log write failed (non-fatal):', err));
}

// GET /api/products?category=slug&available=true
export async function getProducts(request, env) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const available = url.searchParams.get('available');

  const conditions = ['p.business_id = $1'];
  const values = [request.business.id];

  let sql = `
    SELECT p.*, c.slug AS category_slug, c.name AS category_name, c.name_ar AS category_name_ar
    FROM products p
    JOIN categories c ON c.id = p.category_id
  `;

  if (category) {
    values.push(category);
    conditions.push(`c.slug = $${values.length}`);
  }
  if (available !== null) {
    values.push(available === 'true');
    conditions.push(`p.is_available = $${values.length}`);
  }
  sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY p.id ASC';

  const result = await query(env, sql, values);
  return json(result.rows);
}

export async function getProductById(request, env) {
  const { id } = request.params;
  if (!isPositiveInteger(id)) throw new HttpError(400, 'Invalid product id.');
  const result = await query(env, 'SELECT * FROM products WHERE id = $1 AND business_id = $2', [id, request.business.id]);
  if (result.rows.length === 0) throw new HttpError(404, 'Product not found.');
  return json(result.rows[0]);
}

function validateProductBody(body) {
  const { category_id, name, name_ar, price, is_available } = body;
  if (!isPositiveInteger(category_id)) throw new HttpError(400, 'A valid category_id is required.');
  if (!isNonEmptyString(name)) throw new HttpError(400, 'name is required.');
  if (!isNonEmptyString(name_ar)) throw new HttpError(400, 'name_ar is required.');
  if (!isNonNegativeNumber(price)) throw new HttpError(400, 'price must be a valid non-negative number.');
  if (!isBooleanIfProvided(is_available)) throw new HttpError(400, 'is_available must be a boolean.');
}

// Category must itself belong to the same business — otherwise a product
// could be pinned to another business's category id.
async function assertCategoryBelongsToBusiness(env, businessId, categoryId) {
  const result = await query(env, 'SELECT id FROM categories WHERE id = $1 AND business_id = $2', [categoryId, businessId]);
  if (result.rows.length === 0) throw new HttpError(400, 'category_id does not reference a category on this business.');
}

export async function createProduct(request, env) {
  const body = await request.json().catch(() => ({}));
  validateProductBody(body);
  const { category_id, name, name_ar, description, description_ar, price, image_url, is_available } = body;

  await assertCategoryBelongsToBusiness(env, request.business.id, category_id);

  const result = await tenantQuery(
    env,
    request.business.id,
    `INSERT INTO products (business_id, category_id, name, name_ar, description, description_ar, price, image_url, is_available)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [request.business.id, category_id, name, name_ar, description || '', description_ar || '', price, image_url || '', is_available !== false]
  );
  await auditProduct(env, request, 'product_created', result.rows[0].id, { name });
  return json(result.rows[0], 201);
}

export async function updateProduct(request, env) {
  const { id } = request.params;
  if (!isPositiveInteger(id)) throw new HttpError(400, 'Invalid product id.');

  const body = await request.json().catch(() => ({}));
  validateProductBody(body);
  const { category_id, name, name_ar, description, description_ar, price, image_url, is_available } = body;

  await assertCategoryBelongsToBusiness(env, request.business.id, category_id);

  const result = await tenantQuery(
    env,
    request.business.id,
    `UPDATE products SET category_id=$1, name=$2, name_ar=$3, description=$4, description_ar=$5,
     price=$6, image_url=$7, is_available=$8 WHERE id=$9 AND business_id=$10 RETURNING *`,
    [category_id, name, name_ar, description || '', description_ar || '', price, image_url || '', is_available !== false, id, request.business.id]
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Product not found.');
  await auditProduct(env, request, 'product_updated', id, { name });
  return json(result.rows[0]);
}

export async function deleteProduct(request, env) {
  const { id } = request.params;
  if (!isPositiveInteger(id)) throw new HttpError(400, 'Invalid product id.');
  const result = await tenantQuery(
    env,
    request.business.id,
    'DELETE FROM products WHERE id = $1 AND business_id = $2 RETURNING id',
    [id, request.business.id]
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Product not found.');
  await auditProduct(env, request, 'product_deleted', id, {});
  return json({ success: true });
}
