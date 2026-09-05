import { query, tenantQuery } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import { isNonEmptyString, isValidRating, isBooleanIfProvided, isPositiveInteger } from '../utils/validate.js';

// GET /api/reviews — public gets only enabled reviews for this business.
// GET /api/reviews?all=true — admins (valid Bearer token for this business) get everything.
export async function getReviews(request, env) {
  const url = new URL(request.url);
  const showAll = url.searchParams.get('all') === 'true' && request.user;

  const sql = showAll
    ? 'SELECT * FROM reviews WHERE business_id = $1 ORDER BY created_at DESC'
    : 'SELECT * FROM reviews WHERE business_id = $1 AND is_enabled = TRUE ORDER BY created_at DESC';

  const result = await query(env, sql, [request.business.id]);
  return json(result.rows);
}

function validateReviewBody(body) {
  const { customer_name, rating, comment, is_enabled } = body;
  if (!isNonEmptyString(customer_name)) throw new HttpError(400, 'customer_name is required.');
  if (!isValidRating(rating)) throw new HttpError(400, 'rating must be an integer between 1 and 5.');
  if (!isNonEmptyString(comment)) throw new HttpError(400, 'comment is required.');
  if (!isBooleanIfProvided(is_enabled)) throw new HttpError(400, 'is_enabled must be a boolean.');
}

// Public submission (section 39): customers can submit, but not set
// is_enabled themselves — moderation always starts disabled unless an
// authenticated admin is the one creating it.
export async function createReview(request, env) {
  const body = await request.json().catch(() => ({}));
  validateReviewBody(body);
  const { customer_name, rating, comment, is_enabled } = body;
  const enabled = request.user ? is_enabled !== false : false;

  const result = await tenantQuery(
    env,
    request.business.id,
    `INSERT INTO reviews (business_id, customer_name, rating, comment, is_enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [request.business.id, customer_name, rating, comment, enabled]
  );
  return json(result.rows[0], 201);
}

export async function updateReview(request, env) {
  const { id } = request.params;
  if (!isPositiveInteger(id)) throw new HttpError(400, 'Invalid review id.');

  const body = await request.json().catch(() => ({}));
  validateReviewBody(body);
  const { customer_name, rating, comment, is_enabled } = body;

  const result = await tenantQuery(
    env,
    request.business.id,
    `UPDATE reviews SET customer_name=$1, rating=$2, comment=$3, is_enabled=$4
     WHERE id=$5 AND business_id=$6 RETURNING *`,
    [customer_name, rating, comment, is_enabled !== false, id, request.business.id]
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Review not found.');
  return json(result.rows[0]);
}

export async function deleteReview(request, env) {
  const { id } = request.params;
  if (!isPositiveInteger(id)) throw new HttpError(400, 'Invalid review id.');
  const result = await tenantQuery(
    env,
    request.business.id,
    'DELETE FROM reviews WHERE id = $1 AND business_id = $2 RETURNING id',
    [id, request.business.id]
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Review not found.');
  return json({ success: true });
}
