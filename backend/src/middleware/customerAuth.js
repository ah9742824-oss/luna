// Authenticates a CUSTOMER (as opposed to an admin/staff profile — see
// middleware/auth.js). Deliberately a separate function/token shape so a
// customer token can never be mistaken for (or reused as) an admin token:
// the payload carries `type: 'customer'` and requireCustomerAuth rejects
// anything else, on top of the same business-mismatch check requireAuth
// does for admins (section 8: isolation applies to every actor, not just
// admins).
import jwt from '@tsndr/cloudflare-worker-jwt';
import { json } from '../utils/http.js';

export async function requireCustomerAuth(request, env) {
  if (!env.JWT_SECRET) {
    return json({ success: false, error: { code: 'SERVER_MISCONFIGURED', message: 'Authentication is not available.' } }, 500);
  }

  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please log in to continue.' } }, 401);
  }

  try {
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired session.' } }, 401);
    }
    const { payload } = jwt.decode(token);

    if (payload.type !== 'customer') {
      // An admin token (or anything else) presented at a customer-only route.
      return json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid session.' } }, 401);
    }
    if (request.business && payload.businessId !== request.business.id) {
      return json({ success: false, error: { code: 'BUSINESS_MISMATCH', message: 'This session is not valid for the requested business.' } }, 401);
    }

    request.customer = payload; // { id, businessId, type: 'customer', exp }
  } catch (err) {
    return json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired session.' } }, 401);
  }
}

// Populates request.customer if a valid customer token is present, but never
// blocks the request — used on routes that behave slightly differently for
// a logged-in customer (e.g. checkout pre-filling saved addresses) without
// requiring login.
export async function optionalCustomerAuth(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ') || !env.JWT_SECRET) return;
  try {
    const token = header.slice(7);
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (isValid) {
      const payload = jwt.decode(token).payload;
      if (payload.type === 'customer' && (!request.business || payload.businessId === request.business.id)) {
        request.customer = payload;
      }
    }
  } catch (err) {
    // treat as anonymous
  }
}
