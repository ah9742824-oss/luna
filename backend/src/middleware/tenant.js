// Resolves which business a request is for, before any route handler runs.
// This is the foundation of multi-tenant isolation (section 8): every
// downstream controller reads request.business.id instead of assuming a
// single café, and every query filters by it.
//
// Resolution order:
//   1. X-Business-Slug header — set by the frontend from its build-time
//      appConfig.businessSlug (section 75). This is how one reusable
//      frontend build talks to the shared backend for its own business.
//   2. ?business=<slug> query param — convenience for manual/API testing.
//   3. env.DEFAULT_BUSINESS_SLUG — optional fallback for single-tenant
//      deployments that never send the header (keeps this backward
//      compatible with the original single-café deployment).
//
// A request that cannot be resolved to an active business is rejected
// before touching any business-scoped table.
import { query } from '../config/db.js';
import { json } from '../utils/http.js';

const BUSINESS_COLUMNS = `
  id, name, name_ar, slug, type, description, description_ar, logo_url,
  cover_url, phone, whatsapp, email, address, address_ar, latitude, longitude,
  working_hours, social_links, theme_settings, enabled_modules, accept_orders,
  is_active
`;

export async function resolveTenant(request, env) {
  const url = new URL(request.url);
  const slug =
    request.headers.get('X-Business-Slug') ||
    url.searchParams.get('business') ||
    env.DEFAULT_BUSINESS_SLUG ||
    null;

  if (!slug) {
    return json(
      { success: false, error: { code: 'BUSINESS_NOT_SPECIFIED', message: 'No business specified. Send an X-Business-Slug header.' } },
      400
    );
  }

  const result = await query(env, `SELECT ${BUSINESS_COLUMNS} FROM businesses WHERE slug = $1`, [slug]);
  const business = result.rows[0];

  if (!business) {
    return json({ success: false, error: { code: 'BUSINESS_NOT_FOUND', message: 'Unknown business.' } }, 404);
  }
  if (!business.is_active) {
    return json({ success: false, error: { code: 'BUSINESS_INACTIVE', message: 'This business is not currently active.' } }, 403);
  }

  request.business = business;
  // no return value -> router continues to the next matching handler
}
