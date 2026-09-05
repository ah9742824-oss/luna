// Manage OTHER admin/staff accounts on this business (section 16 RBAC).
// Deliberately separate from authController.js (which handles the calling
// admin's own login/session) — this is about a super_admin/manager
// provisioning accounts for their team.
import bcrypt from 'bcryptjs';
import { query, tenantQuery } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import { isNonEmptyString, isValidEmailIfProvided, isPositiveInteger } from '../utils/validate.js';

const SAFE_FIELDS = 'p.id, p.business_id, p.name, p.email, p.is_active, p.created_at, r.key AS role, r.name AS role_name, r.name_ar AS role_name_ar';

// GET /api/admin/roles — the role catalog, for populating a role picker.
// Read-only reference data, no permission-gate beyond being an authenticated
// admin (nothing sensitive in a role's name).
export async function listRoles(request, env) {
  const result = await query(env, 'SELECT id, key, name, name_ar FROM roles ORDER BY id');
  return json({ success: true, data: result.rows });
}

// GET /api/admin/staff
export async function listStaff(request, env) {
  const result = await query(
    env,
    `SELECT ${SAFE_FIELDS} FROM profiles p JOIN roles r ON r.id = p.role_id WHERE p.business_id = $1 ORDER BY p.created_at ASC`,
    [request.business.id]
  );
  return json({ success: true, data: result.rows });
}

function validateStaffBody(body, { requirePassword }) {
  if (!isNonEmptyString(body.name)) throw new HttpError(400, 'name is required.');
  if (!isNonEmptyString(body.email) || !isValidEmailIfProvided(body.email)) throw new HttpError(400, 'A valid email is required.');
  if (!isNonEmptyString(body.role)) throw new HttpError(400, 'role is required.');
  if (requirePassword && (!isNonEmptyString(body.password) || body.password.length < 8)) {
    throw new HttpError(400, 'password must be at least 8 characters.');
  }
}

// POST /api/admin/staff
export async function createStaff(request, env) {
  const body = await request.json().catch(() => ({}));
  validateStaffBody(body, { requirePassword: true });

  const roleResult = await query(env, 'SELECT id FROM roles WHERE key = $1', [body.role]);
  if (roleResult.rows.length === 0) throw new HttpError(400, 'Unknown role.');

  const existing = await query(env, 'SELECT id FROM profiles WHERE business_id = $1 AND email = $2', [request.business.id, body.email]);
  if (existing.rows.length > 0) throw new HttpError(409, 'An account with this email already exists on this business.');

  const passwordHash = await bcrypt.hash(body.password, 10);
  const result = await tenantQuery(
    env, request.business.id,
    `INSERT INTO profiles (business_id, role_id, name, email, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [request.business.id, roleResult.rows[0].id, body.name, body.email, passwordHash]
  );

  await tenantQuery(
    env, request.business.id,
    `INSERT INTO audit_logs (business_id, profile_id, action, resource_type, resource_id, metadata) VALUES ($1,$2,'staff_created','profile',$3,$4)`,
    [request.business.id, request.user.id, String(result.rows[0].id), JSON.stringify({ email: body.email, role: body.role })]
  ).catch((err) => console.error('audit log write failed (non-fatal):', err));

  const created = await query(env, `SELECT ${SAFE_FIELDS} FROM profiles p JOIN roles r ON r.id = p.role_id WHERE p.id = $1`, [result.rows[0].id]);
  return json({ success: true, data: created.rows[0] }, 201);
}

// PUT /api/admin/staff/:id — update name/role/is_active (and optionally
// password). A staff member can never edit their own role or deactivate
// themselves through this endpoint — prevents an admin from accidentally
// (or an attacker who compromised one session from deliberately) locking
// out or self-escalating outside of what their own role already grants.
export async function updateStaff(request, env) {
  const { id } = request.params;
  if (!isPositiveInteger(id)) throw new HttpError(400, 'Invalid staff id.');
  if (Number(id) === request.user.id) {
    throw new HttpError(400, 'Use your own account settings to change your own profile; this endpoint is for managing OTHER staff.');
  }

  const body = await request.json().catch(() => ({}));
  validateStaffBody(body, { requirePassword: false });

  const roleResult = await query(env, 'SELECT id FROM roles WHERE key = $1', [body.role]);
  if (roleResult.rows.length === 0) throw new HttpError(400, 'Unknown role.');

  const isActive = body.is_active !== false;

  // Never allow the business to end up with zero active super_admins —
  // otherwise nobody could ever grant staff.manage again.
  if (!isActive || body.role !== 'super_admin') {
    const otherActiveSuperAdmins = await query(
      env,
      `SELECT COUNT(*)::int AS n FROM profiles p JOIN roles r ON r.id = p.role_id
       WHERE p.business_id = $1 AND r.key = 'super_admin' AND p.is_active = TRUE AND p.id <> $2`,
      [request.business.id, id]
    );
    const targetWasSuperAdmin = await query(
      env,
      `SELECT r.key FROM profiles p JOIN roles r ON r.id = p.role_id WHERE p.id = $1 AND p.business_id = $2`,
      [id, request.business.id]
    );
    if (targetWasSuperAdmin.rows[0]?.key === 'super_admin' && otherActiveSuperAdmins.rows[0].n === 0) {
      throw new HttpError(400, 'Cannot demote or deactivate the last active super_admin on this business.');
    }
  }

  const sets = ['name = $1', 'email = $2', 'role_id = $3', 'is_active = $4'];
  const values = [body.name, body.email, roleResult.rows[0].id, isActive];
  if (isNonEmptyString(body.password)) {
    if (body.password.length < 8) throw new HttpError(400, 'password must be at least 8 characters.');
    values.push(await bcrypt.hash(body.password, 10));
    sets.push(`password_hash = $${values.length}`);
  }
  values.push(id, request.business.id);

  const result = await tenantQuery(
    env, request.business.id,
    `UPDATE profiles SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND business_id = $${values.length} RETURNING id`,
    values
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Staff account not found.');

  await tenantQuery(
    env, request.business.id,
    `INSERT INTO audit_logs (business_id, profile_id, action, resource_type, resource_id, metadata) VALUES ($1,$2,'staff_updated','profile',$3,$4)`,
    [request.business.id, request.user.id, String(id), JSON.stringify({ role: body.role, is_active: isActive })]
  ).catch((err) => console.error('audit log write failed (non-fatal):', err));

  const updated = await query(env, `SELECT ${SAFE_FIELDS} FROM profiles p JOIN roles r ON r.id = p.role_id WHERE p.id = $1`, [id]);
  return json({ success: true, data: updated.rows[0] });
}
