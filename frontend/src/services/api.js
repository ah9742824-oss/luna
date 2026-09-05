// Small fetch wrapper shared by every service file.
import { appConfig } from '../config/appConfig.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Two independent auth contexts can be logged in in the same browser at
// once (an admin testing the site, and/or a customer shopping on it) — see
// backend/src/middleware/auth.js vs customerAuth.js, which reject each
// other's token type outright. `auth` picks which token (if any) this
// particular call attaches:
//   'admin'    (default, unchanged from before) — every existing admin
//               dashboard call keeps working with zero changes.
//   'customer' — customer-facing calls (cart/checkout/orders/profile).
//               Sends the customer token if the customer is logged in,
//               otherwise sends no Authorization header at all (guest
//               checkout) — never falls back to an admin token.
//   'none'     — always anonymous, regardless of what's logged in.
function tokenFor(auth) {
  if (auth === 'none') return null;
  if (auth === 'customer') return localStorage.getItem('luna_customer_token');
  return localStorage.getItem('luna_admin_token');
}

async function request(path, options = {}) {
  const token = tokenFor(options.auth || 'admin');

  const headers = {
    'Content-Type': 'application/json',
    // Tells the shared backend which business this frontend build belongs to
    // (section 8/75) — every request needs this, not just admin ones.
    'X-Business-Slug': appConfig.businessSlug,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Backend error envelope (section 54): { success: false, error: { code, message } }.
    // A couple of older/simple routes may still 4xx with a bare { error: "..." }
    // string — support both so nothing silently shows "[object Object]".
    const message =
      (data.error && typeof data.error === 'object' && data.error.message) ||
      (typeof data.error === 'string' && data.error) ||
      'Request failed.';
    const err = new Error(message);
    err.code = data.error && typeof data.error === 'object' ? data.error.code : undefined;
    err.status = res.status;
    throw err;
  }

  // Backend success envelope (section 54): { success: true, data: {...}, meta?: {...} }.
  // Unwrap automatically so every existing call site can keep using the
  // payload directly (e.g. api.get('/cafe') still resolves to the business
  // object, not { success, data: {...} }). Endpoints that just return a
  // bare array/object (e.g. GET /api/products) pass through unchanged.
  // When the response also carries `meta` (pagination), attach it as a
  // non-enumerable-ish extra on arrays isn't reliable, so callers that need
  // meta use requestWithMeta() below instead of the unwrapped shortcuts.
  if (data && typeof data === 'object' && data.success === true && 'data' in data) {
    return data.data;
  }
  return data;
}

// Same as request(), but returns { data, meta } untouched — for paginated
// admin list endpoints that need the total count alongside the page of rows.
async function requestWithMeta(path, options = {}) {
  const token = tokenFor(options.auth || 'admin');
  const headers = {
    'Content-Type': 'application/json',
    'X-Business-Slug': appConfig.businessSlug,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data.error && typeof data.error === 'object' && data.error.message) ||
      (typeof data.error === 'string' && data.error) ||
      'Request failed.';
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return { data: data.data, meta: data.meta };
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  del: (path, options) => request(path, options ? { ...options, method: 'DELETE' } : { method: 'DELETE' }),
  getWithMeta: (path, options) => requestWithMeta(path, options),
};
