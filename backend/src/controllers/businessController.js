// Replaces the old single-row cafeController.js: business profile data now
// lives on the businesses table itself (section 11), keyed by request.business
// (resolved per-request by middleware/tenant.js from X-Business-Slug).
import { query, tenantQuery } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import { isValidUrlIfProvided, isNonEmptyString } from '../utils/validate.js';

const PUBLIC_COLUMNS = `
  id, name, name_ar, slug, type, description, description_ar, logo_url, cover_url,
  phone, whatsapp, email, address, address_ar, latitude, longitude, working_hours,
  social_links, theme_settings, enabled_modules, accept_orders,
  accept_delivery, accept_pickup, accept_dine_in, delivery_fee, minimum_order_amount, tax_rate_percent, currency
`;

// GET /api/business — current business profile (public: powers the homepage)
export async function getBusinessInfo(request, env) {
  const result = await query(env, `SELECT ${PUBLIC_COLUMNS} FROM businesses WHERE id = $1`, [request.business.id]);
  if (result.rows.length === 0) throw new HttpError(404, 'Business not found.');
  return json({ success: true, data: result.rows[0] });
}

function validateBusinessBody(body) {
  if (body.name !== undefined && !isNonEmptyString(body.name)) throw new HttpError(400, 'name must not be empty.');
  if (body.name_ar !== undefined && !isNonEmptyString(body.name_ar)) throw new HttpError(400, 'name_ar must not be empty.');
  const urlFields = ['logo_url', 'cover_url'];
  for (const field of urlFields) {
    if (!isValidUrlIfProvided(body[field])) throw new HttpError(400, `${field} must be a valid URL.`);
  }
  const numericFields = ['delivery_fee', 'minimum_order_amount', 'tax_rate_percent'];
  for (const field of numericFields) {
    if (body[field] !== undefined && (typeof body[field] !== 'number' || body[field] < 0)) {
      throw new HttpError(400, `${field} must be a non-negative number.`);
    }
  }
  if (body.tax_rate_percent !== undefined && body.tax_rate_percent > 100) {
    throw new HttpError(400, 'tax_rate_percent cannot exceed 100.');
  }
}

// PUT /api/business — admin only (business.manage permission), always scoped
// to request.business.id — an admin can never edit a different business by
// guessing an id, because there is no :id in this route at all.
export async function updateBusinessInfo(request, env) {
  const body = await request.json().catch(() => ({}));
  validateBusinessBody(body);

  const fields = [
    'name', 'name_ar', 'description', 'description_ar', 'logo_url', 'cover_url',
    'phone', 'whatsapp', 'email', 'address', 'address_ar', 'latitude', 'longitude',
    'working_hours', 'social_links', 'theme_settings', 'accept_orders',
    'accept_delivery', 'accept_pickup', 'accept_dine_in', 'delivery_fee', 'minimum_order_amount', 'tax_rate_percent',
  ];

  const sets = [];
  const values = [];
  for (const field of fields) {
    if (body[field] !== undefined) {
      values.push(
        ['working_hours', 'social_links', 'theme_settings'].includes(field)
          ? JSON.stringify(body[field])
          : body[field]
      );
      sets.push(`${field} = $${values.length}`);
    }
  }

  if (sets.length === 0) throw new HttpError(400, 'No valid fields provided.');

  values.push(request.business.id);
  const result = await query(
    env,
    `UPDATE businesses SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${PUBLIC_COLUMNS}`,
    values
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Business not found.');

  await tenantQuery(
    env, request.business.id,
    `INSERT INTO audit_logs (business_id, profile_id, action, resource_type, resource_id, metadata) VALUES ($1,$2,'business_settings_changed','business',$1,$3)`,
    [request.business.id, request.user.id, JSON.stringify({ fields_changed: Object.keys(body) })]
  ).catch((err) => console.error('audit log write failed (non-fatal):', err));

  return json({ success: true, data: result.rows[0] });
}
