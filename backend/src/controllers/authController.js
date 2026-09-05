import bcrypt from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { query } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import { parseDurationToSeconds } from '../utils/time.js';
import { requestPasswordReset, consumePasswordReset } from '../services/passwordReset.js';
import { isNonEmptyString } from '../utils/validate.js';

// POST /api/auth/login
// Scoped to request.business (set by middleware/tenant.js): the same email
// can exist as a profile on two different businesses and this only ever
// authenticates against the business the request was made for.
export async function login(request, env) {
  if (!env.JWT_SECRET) {
    throw new HttpError(500, 'Server misconfiguration: authentication is not available.');
  }

  const body = await request.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) {
    throw new HttpError(400, 'Email and password are required.');
  }

  const result = await query(
    env,
    `SELECT p.*, r.key AS role_key, r.name AS role_name, r.name_ar AS role_name_ar
     FROM profiles p
     JOIN roles r ON r.id = p.role_id
     WHERE p.email = $1 AND p.business_id = $2`,
    [email, request.business.id]
  );
  const profile = result.rows[0];
  if (!profile || !profile.is_active) {
    throw new HttpError(401, 'Invalid email or password.');
  }

  const isMatch = await bcrypt.compare(password, profile.password_hash);
  if (!isMatch) {
    throw new HttpError(401, 'Invalid email or password.');
  }

  const expiresInSeconds = parseDurationToSeconds(env.JWT_EXPIRES_IN || '7d');
  const token = await jwt.sign(
    {
      id: profile.id,
      businessId: profile.business_id,
      email: profile.email,
      roleKey: profile.role_key,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    },
    env.JWT_SECRET
  );

  // password_hash is never included in the response.
  return json({
    success: true,
    data: {
      token,
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role_key,
        roleName: profile.role_name,
        roleNameAr: profile.role_name_ar,
      },
    },
  });
}

// GET /api/auth/permissions — the calling admin's own permission key list,
// straight from the DB (source of truth). The frontend uses this to decide
// which admin nav links/buttons to show — purely a UX convenience: every
// action is re-checked server-side by requirePermission() regardless of
// what the UI displays (section 16, "hiding UI buttons is not security").
export async function myPermissions(request, env) {
  const result = await query(
    env,
    `SELECT p.key FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     JOIN roles r ON r.id = rp.role_id
     WHERE r.key = $1 ORDER BY p.key`,
    [request.user.roleKey]
  );
  return json({ success: true, data: result.rows.map((r) => r.key) });
}
export async function me(request, env) {
  const result = await query(
    env,
    `SELECT p.id, p.name, p.email, p.is_active, r.key AS role_key, r.name AS role_name, r.name_ar AS role_name_ar
     FROM profiles p
     JOIN roles r ON r.id = p.role_id
     WHERE p.id = $1 AND p.business_id = $2`,
    [request.user.id, request.business.id]
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Profile not found.');
  const profile = result.rows[0];
  if (!profile.is_active) throw new HttpError(401, 'Account is deactivated.');
  return json({
    success: true,
    data: { id: profile.id, name: profile.name, email: profile.email, role: profile.role_key, roleName: profile.role_name, roleNameAr: profile.role_name_ar },
  });
}

// POST /api/auth/forgot-password — { email }. Always responds the same way
// regardless of whether the email matches an account (section 12/80: never
// let this endpoint reveal which admin emails exist on this business).
export async function forgotPassword(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!isNonEmptyString(body.email)) throw new HttpError(400, 'email is required.');

  const result = await query(env, 'SELECT id FROM profiles WHERE business_id = $1 AND email = $2 AND is_active = TRUE', [request.business.id, body.email]);
  const clientUrl = env.CLIENT_URL ? env.CLIENT_URL.split(',')[0].trim() : '';

  await requestPasswordReset(env, {
    businessId: request.business.id,
    actorType: 'profile',
    actorId: result.rows[0]?.id,
    email: body.email,
    resetBaseUrl: `${clientUrl}/admin/reset-password`,
    businessName: request.business.name_ar || request.business.name,
  });

  return json({ success: true, data: { requested: true } });
}

// POST /api/auth/reset-password — { token, password }.
export async function resetPassword(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!isNonEmptyString(body.token)) throw new HttpError(400, 'token is required.');
  if (!isNonEmptyString(body.password) || body.password.length < 8) throw new HttpError(400, 'password must be at least 8 characters.');

  const result = await consumePasswordReset(env, {
    businessId: request.business.id, actorType: 'profile', rawToken: body.token, newPassword: body.password,
  });
  if (!result.success) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');

  return json({ success: true, data: { reset: true } });
}
