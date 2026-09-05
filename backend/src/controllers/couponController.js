import { query, tenantQuery, withTenantClient } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import { isNonEmptyString, isPositiveInteger, isNonNegativeNumber, isBooleanIfProvided } from '../utils/validate.js';
import { applyCoupon } from '../services/orderPricing.js';

function validateCouponBody(body) {
  const { code, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, expires_at, is_active } = body;
  if (!isNonEmptyString(code)) throw new HttpError(400, 'code is required.');
  if (!['percentage', 'fixed_amount'].includes(type)) throw new HttpError(400, "type must be 'percentage' or 'fixed_amount'.");
  if (!isNonNegativeNumber(value) || Number(value) <= 0) throw new HttpError(400, 'value must be a positive number.');
  if (type === 'percentage' && Number(value) > 100) throw new HttpError(400, 'A percentage coupon cannot exceed 100.');
  if (minimum_order_amount !== undefined && !isNonNegativeNumber(minimum_order_amount)) throw new HttpError(400, 'minimum_order_amount must be a non-negative number.');
  if (maximum_discount_amount !== undefined && maximum_discount_amount !== null && !isNonNegativeNumber(maximum_discount_amount)) {
    throw new HttpError(400, 'maximum_discount_amount must be a non-negative number.');
  }
  if (usage_limit !== undefined && usage_limit !== null && !isPositiveInteger(usage_limit)) throw new HttpError(400, 'usage_limit must be a positive integer.');
  if (expires_at !== undefined && expires_at !== null && Number.isNaN(Date.parse(expires_at))) throw new HttpError(400, 'expires_at must be a valid date.');
  if (!isBooleanIfProvided(is_active)) throw new HttpError(400, 'is_active must be a boolean.');
}

// GET /api/admin/coupons
export async function listCoupons(request, env) {
  const result = await query(env, 'SELECT * FROM coupons WHERE business_id = $1 ORDER BY created_at DESC', [request.business.id]);
  return json({ success: true, data: result.rows });
}

// POST /api/admin/coupons
export async function createCoupon(request, env) {
  const body = await request.json().catch(() => ({}));
  validateCouponBody(body);
  const { code, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, expires_at, is_active } = body;

  try {
    const result = await tenantQuery(
      env,
      request.business.id,
      `INSERT INTO coupons (business_id, code, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, expires_at, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [request.business.id, code.toUpperCase(), type, value, minimum_order_amount || 0, maximum_discount_amount ?? null, usage_limit ?? null, expires_at || null, is_active !== false]
    );
    return json({ success: true, data: result.rows[0] }, 201);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'A coupon with this code already exists.');
    throw err;
  }
}

// PUT /api/admin/coupons/:id
export async function updateCoupon(request, env) {
  const { id } = request.params;
  if (!isPositiveInteger(id)) throw new HttpError(400, 'Invalid coupon id.');
  const body = await request.json().catch(() => ({}));
  validateCouponBody(body);
  const { code, type, value, minimum_order_amount, maximum_discount_amount, usage_limit, expires_at, is_active } = body;

  try {
    const result = await tenantQuery(
      env,
      request.business.id,
      `UPDATE coupons SET code=$1, type=$2, value=$3, minimum_order_amount=$4, maximum_discount_amount=$5, usage_limit=$6, expires_at=$7, is_active=$8
       WHERE id=$9 AND business_id=$10 RETURNING *`,
      [code.toUpperCase(), type, value, minimum_order_amount || 0, maximum_discount_amount ?? null, usage_limit ?? null, expires_at || null, is_active !== false, id, request.business.id]
    );
    if (result.rows.length === 0) throw new HttpError(404, 'Coupon not found.');
    return json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'A coupon with this code already exists.');
    throw err;
  }
}

// DELETE /api/admin/coupons/:id
export async function deleteCoupon(request, env) {
  const { id } = request.params;
  if (!isPositiveInteger(id)) throw new HttpError(400, 'Invalid coupon id.');
  const result = await tenantQuery(env, request.business.id, 'DELETE FROM coupons WHERE id = $1 AND business_id = $2 RETURNING id', [id, request.business.id]);
  if (result.rows.length === 0) throw new HttpError(404, 'Coupon not found.');
  return json({ success: true });
}

// POST /api/coupons/validate — public, read-only preview used by the cart
// page BEFORE checkout. Reuses the exact same applyCoupon() logic that
// createOrder() uses, so the preview can never drift from what checkout
// actually charges. Does NOT record a usage (no coupon_usage row) — only
// createOrder does that, inside the same transaction as the real order.
export async function validateCouponCode(request, env) {
  const body = await request.json().catch(() => ({}));
  const { code, subtotal } = body;
  if (!isNonEmptyString(code)) throw new HttpError(400, 'code is required.');
  if (!isNonNegativeNumber(subtotal)) throw new HttpError(400, 'subtotal must be a non-negative number.');

  const result = await withTenantClient(env, request.business.id, async (client) => {
    const { coupon, discount } = await applyCoupon(client, request.business.id, code, Number(subtotal), request.customer?.id);
    return { valid: true, code: coupon.code, type: coupon.type, discount };
  });

  return json({ success: true, data: result });
}
