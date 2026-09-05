// Central error handling — mirrors the old Express errorHandler middleware,
// adapted to return a Response instead of calling res.json(). Matches the
// API response envelope from section 54 (also used directly by
// middleware/tenant.js, auth.js, permissions.js for their own error cases).
import { json, HttpError } from '../utils/http.js';

export function errorResponse(err) {
  if (err instanceof HttpError) {
    return json({ success: false, error: { code: err.code || 'REQUEST_ERROR', message: err.message } }, err.status);
  }

  // Anything unexpected: log server-side for debugging (visible via
  // `npx wrangler tail`), but never leak internals to the client.
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  return json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' } }, 500);
}

export function notFoundResponse() {
  return json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404);
}
