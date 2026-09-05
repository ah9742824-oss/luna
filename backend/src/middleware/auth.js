// Verifies the JWT sent by the admin dashboard. Used as router middleware:
// if it returns a Response, the router stops and sends that response.
// If it returns nothing, the router continues to the next handler with
// request.user populated.
//
// Uses @tsndr/cloudflare-worker-jwt (built on the Workers-native WebCrypto
// API) instead of the Node "jsonwebtoken" package, so JWT verification does
// not depend on the nodejs_compat crypto shim at all — only the "pg" driver
// still needs nodejs_compat, for its net/tls usage.
//
// MUST run after resolveTenant (middleware/tenant.js) on any route that uses
// it, because it cross-checks the token's businessId against request.business
// — this is what stops an admin token issued for Business A from being
// replayed against Business B's API surface (X-Business-Slug: business-b).
import jwt from '@tsndr/cloudflare-worker-jwt';
import { json } from '../utils/http.js';

export async function requireAuth(request, env) {
  if (!env.JWT_SECRET) {
    // Fail safely: never allow requests through unauthenticated because
    // secrets are misconfigured.
    return json({ success: false, error: { code: 'SERVER_MISCONFIGURED', message: 'Authentication is not available.' } }, 500);
  }

  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, 401);
  }

  try {
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (!isValid) {
      return json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token.' } }, 401);
    }
    const { payload } = jwt.decode(token);
    // payload: { id (profile id), businessId, email, roleKey, exp }

    // SECURITY FIX (Phase 7 audit): admin and customer JWTs are signed with
    // the SAME env.JWT_SECRET (see customerAuth.js), so a customer's
    // otherwise-valid token would previously pass signature verification
    // here too. Without this check, request.user would be set to a
    // *customer* payload (which has no roleKey), and GET /api/auth/me would
    // then query `profiles WHERE id = $customerId` — a real cross-privilege
    // leak whenever a profiles.id happens to numerically coincide with the
    // caller's customer id in the same business (quite likely for early
    // accounts, since both tables are independent SERIAL sequences starting
    // at 1). requirePermission()-gated routes happened to fail safe already
    // (no role matches an undefined roleKey), but requireAuth-only routes
    // like /me did not. Explicitly reject any token carrying a customer
    // `type` claim here, so this is closed for every current and future
    // admin-only route, not patched per-endpoint.
    if (payload.type === 'customer') {
      return json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid session.' } }, 401);
    }

    if (request.business && payload.businessId !== request.business.id) {
      // Token was issued for a different business — never allow cross-tenant
      // token reuse even if the caller sends a different X-Business-Slug.
      return json({ success: false, error: { code: 'BUSINESS_MISMATCH', message: 'This token is not valid for the requested business.' } }, 401);
    }

    request.user = payload;
  } catch (err) {
    return json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token.' } }, 401);
  }
  // no return value -> router continues to the actual controller
}

// Used on routes that are public but behave differently for logged-in admins
// (e.g. GET /api/reviews?all=true). Only validates the token if one was sent;
// never blocks the request for missing/invalid auth.
export async function optionalAuth(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ') || !env.JWT_SECRET) return;

  try {
    const token = header.slice(7);
    const isValid = await jwt.verify(token, env.JWT_SECRET);
    if (isValid) {
      const payload = jwt.decode(token).payload;
      // Same token-type check as requireAuth above — a customer token must
      // never populate request.user, even on an "optional" admin route.
      if (payload.type !== 'customer' && (!request.business || payload.businessId === request.business.id)) {
        request.user = payload;
      }
    }
  } catch (err) {
    // Invalid token on an optional-auth route: just treat as anonymous.
  }
}
