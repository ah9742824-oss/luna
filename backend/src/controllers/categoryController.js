import { query, tenantQuery } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import { isNonEmptyString, isValidSlug, isNumberIfProvided, isPositiveInteger } from '../utils/validate.js';

async function auditCategory(env, request, action, categoryId, metadata) {
  await tenantQuery(
    env, request.business.id,
    `INSERT INTO audit_logs (business_id, profile_id, action, resource_type, resource_id, metadata) VALUES ($1,$2,$3,'category',$4,$5)`,
    [request.business.id, request.user.id, action, String(categoryId), JSON.stringify(metadata)]
  ).catch((err) => console.error('audit log write failed (non-fatal):', err));
}

export async function getCategories(request, env) {
  // Public read: app-layer filter is the primary guarantee here (no admin
  // session/JWT exists yet to drive a tenant transaction), so we filter
  // explicitly by business_id rather than relying on RLS alone.
  const result = await query(env, 'SELECT * FROM categories WHERE business_id = $1 ORDER BY display_order ASC, id ASC', [request.business.id]);
  return json(result.rows);
}

function validateCategoryBody(body) {
  const { name, name_ar, slug, display_order } = body;
  if (!isNonEmptyString(name)) throw new HttpError(400, 'name is required.');
  if (!isNonEmptyString(name_ar)) throw new HttpError(400, 'name_ar is required.');
  if (!isValidSlug(slug)) {
    throw new HttpError(400, 'slug is required and must contain only lowercase letters, numbers and hyphens.');
  }
  if (!isNumberIfProvided(display_order)) throw new HttpError(400, 'display_order must be a number.');
}

export async function createCategory(request, env) {
  const body = await request.json().catch(() => ({}));
  validateCategoryBody(body);
  const { name, name_ar, slug, display_order } = body;

  try {
    const result = await tenantQuery(
      env,
      request.business.id,
      `INSERT INTO categories (business_id, name, name_ar, slug, display_order) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [request.business.id, name, name_ar, slug, display_order || 0]
    );
    await auditCategory(env, request, 'category_created', result.rows[0].id, { name });
    return json(result.rows[0], 201);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'A category with this slug already exists.');
    throw err;
  }
}

export async function updateCategory(request, env) {
  const { id } = request.params;
  if (!isPositiveInteger(id)) throw new HttpError(400, 'Invalid category id.');

  const body = await request.json().catch(() => ({}));
  validateCategoryBody(body);
  const { name, name_ar, slug, display_order } = body;

  try {
    // business_id in the WHERE clause is what stops Business A from editing
    // Business B's category by guessing/incrementing an id (section 96).
    const result = await tenantQuery(
      env,
      request.business.id,
      `UPDATE categories SET name=$1, name_ar=$2, slug=$3, display_order=$4
       WHERE id=$5 AND business_id=$6 RETURNING *`,
      [name, name_ar, slug, display_order || 0, id, request.business.id]
    );
    if (result.rows.length === 0) throw new HttpError(404, 'Category not found.');
    await auditCategory(env, request, 'category_updated', id, { name });
    return json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'A category with this slug already exists.');
    throw err;
  }
}

export async function deleteCategory(request, env) {
  const { id } = request.params;
  if (!isPositiveInteger(id)) throw new HttpError(400, 'Invalid category id.');
  const result = await tenantQuery(
    env,
    request.business.id,
    'DELETE FROM categories WHERE id = $1 AND business_id = $2 RETURNING id',
    [id, request.business.id]
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Category not found.');
  await auditCategory(env, request, 'category_deleted', id, {});
  return json({ success: true });
}
