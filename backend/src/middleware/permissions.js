// Server-side authorization (section 16): "Hiding UI buttons is NOT
// security." Every admin route that mutates or reveals sensitive data must
// be wrapped with requirePermission(<permission key>), in addition to
// requireAuth. Must run AFTER requireAuth (needs request.user.roleKey).
import { query } from '../config/db.js';
import { json } from '../utils/http.js';

// Extracted so both the router-level middleware below AND controllers that
// need a one-off permission check outside the normal route-declaration
// shape (e.g. mediaController.js, where the permission depends on a field
// in the request body, not just the route) can reuse the exact same
// DB-backed check — never duplicate the RBAC query logic.
export async function hasPermission(env, roleKey, permissionKey) {
  const result = await query(
    env,
    `SELECT 1
     FROM role_permissions rp
     JOIN roles r ON r.id = rp.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE r.key = $1 AND p.key = $2
     LIMIT 1`,
    [roleKey, permissionKey]
  );
  return result.rows.length > 0;
}

// Server-side authorization (section 16): "Hiding UI buttons is NOT
// security." Every admin route that mutates or reveals sensitive data must
// be wrapped with requirePermission(<permission key>), in addition to
// requireAuth. Must run AFTER requireAuth (needs request.user.roleKey).
export function requirePermission(permissionKey) {
  return async function middleware(request, env) {
    if (!request.user) {
      return json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, 401);
    }

    const allowed = await hasPermission(env, request.user.roleKey, permissionKey);
    if (!allowed) {
      return json(
        { success: false, error: { code: 'FORBIDDEN', message: `Your role does not have the '${permissionKey}' permission.` } },
        403
      );
    }
    // no return value -> router continues
  };
}
