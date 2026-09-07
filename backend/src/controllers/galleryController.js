import { query, tenantQuery } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import {
  isNonEmptyString,
  isValidUrlIfProvided,
  isNumberIfProvided,
  isPositiveInteger,
} from '../utils/validate.js';

export async function getGallery(request, env) {
  const result = await query(
    env,
    `SELECT *
     FROM gallery
     WHERE business_id = $1
       AND is_visible = TRUE
     ORDER BY display_order ASC, id ASC`,
    [request.business.id]
  );

  return json(result.rows);
}

export async function getAdminGallery(request, env) {
  const result = await query(
    env,
    `SELECT *
     FROM gallery
     WHERE business_id = $1
     ORDER BY display_order ASC, id ASC`,
    [request.business.id]
  );

  return json(result.rows);
}

export async function createGalleryImage(request, env) {
  const body = await request.json().catch(() => ({}));
  const { image_url, caption, display_order } = body;

  if (!isNonEmptyString(image_url)) {
    throw new HttpError(400, 'image_url is required.');
  }

  if (!isValidUrlIfProvided(image_url)) {
    throw new HttpError(400, 'image_url must be a valid URL.');
  }

  if (!isNumberIfProvided(display_order)) {
    throw new HttpError(400, 'display_order must be a number.');
  }

  const result = await tenantQuery(
    env,
    request.business.id,
    `INSERT INTO gallery
      (business_id, image_url, caption, display_order, is_visible)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING *`,
    [
      request.business.id,
      image_url,
      caption || '',
      display_order ?? 0,
    ]
  );

  return json(result.rows[0], 201);
}

export async function updateGalleryVisibility(request, env) {
  const { id } = request.params;

  if (!isPositiveInteger(id)) {
    throw new HttpError(400, 'Invalid gallery image id.');
  }

  const body = await request.json().catch(() => ({}));

  if (typeof body.is_visible !== 'boolean') {
    throw new HttpError(400, 'is_visible must be a boolean.');
  }

  const result = await tenantQuery(
    env,
    request.business.id,
    `UPDATE gallery
     SET is_visible = $1
     WHERE id = $2
       AND business_id = $3
     RETURNING *`,
    [
      body.is_visible,
      id,
      request.business.id,
    ]
  );

  if (result.rows.length === 0) {
    throw new HttpError(404, 'Image not found.');
  }

  return json(result.rows[0]);
}

export async function reorderGallery(request, env) {
  const body = await request.json().catch(() => ({}));
  const items = body.items;

  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, 'items must be a non-empty array.');
  }

  for (const item of items) {
    if (!item || !isPositiveInteger(item.id)) {
      throw new HttpError(400, 'Each item must contain a valid id.');
    }

    if (!isNumberIfProvided(item.display_order)) {
      throw new HttpError(400, 'Each item must contain a valid display_order.');
    }
  }

  return tenantQuery(
    env,
    request.business.id,
    async (client) => {
      for (const item of items) {
        const result = await client.query(
          `UPDATE gallery
           SET display_order = $1
           WHERE id = $2
             AND business_id = $3`,
          [
            item.display_order,
            item.id,
            request.business.id,
          ]
        );

        if (result.rowCount === 0) {
          throw new HttpError(404, `Gallery image ${item.id} not found.`);
        }
      }

      const result = await client.query(
        `SELECT *
         FROM gallery
         WHERE business_id = $1
         ORDER BY display_order ASC, id ASC`,
        [request.business.id]
      );

      return json(result.rows);
    }
  );
}

export async function deleteGalleryImage(request, env) {
  const { id } = request.params;

  if (!isPositiveInteger(id)) {
    throw new HttpError(400, 'Invalid gallery image id.');
  }

  const result = await tenantQuery(
    env,
    request.business.id,
    `DELETE FROM gallery
     WHERE id = $1
       AND business_id = $2
     RETURNING id`,
    [
      id,
      request.business.id,
    ]
  );

  if (result.rows.length === 0) {
    throw new HttpError(404, 'Image not found.');
  }

  return json({ success: true });
}
