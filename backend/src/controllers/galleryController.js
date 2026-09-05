import { query, tenantQuery } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import { isNonEmptyString, isValidUrlIfProvided, isNumberIfProvided, isPositiveInteger } from '../utils/validate.js';

export async function getGallery(request, env) {
  const result = await query(env, 'SELECT * FROM gallery WHERE business_id = $1 ORDER BY display_order ASC, id ASC', [request.business.id]);
  return json(result.rows);
}

export async function createGalleryImage(request, env) {
  const body = await request.json().catch(() => ({}));
  const { image_url, caption, display_order } = body;

  if (!isNonEmptyString(image_url)) throw new HttpError(400, 'image_url is required.');
  if (!isValidUrlIfProvided(image_url)) throw new HttpError(400, 'image_url must be a valid URL.');
  if (!isNumberIfProvided(display_order)) throw new HttpError(400, 'display_order must be a number.');

  const result = await tenantQuery(
    env,
    request.business.id,
    `INSERT INTO gallery (business_id, image_url, caption, display_order) VALUES ($1,$2,$3,$4) RETURNING *`,
    [request.business.id, image_url, caption || '', display_order || 0]
  );
  return json(result.rows[0], 201);
}

export async function deleteGalleryImage(request, env) {
  const { id } = request.params;
  if (!isPositiveInteger(id)) throw new HttpError(400, 'Invalid gallery image id.');
  const result = await tenantQuery(
    env,
    request.business.id,
    'DELETE FROM gallery WHERE id = $1 AND business_id = $2 RETURNING id',
    [id, request.business.id]
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Image not found.');
  return json({ success: true });
}
