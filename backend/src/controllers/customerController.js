import bcrypt from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { query, tenantQuery, withTenantClient } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import { parseDurationToSeconds } from '../utils/time.js';
import { isNonEmptyString, isValidEmailIfProvided } from '../utils/validate.js';
import { requestPasswordReset, consumePasswordReset } from '../services/passwordReset.js';

const PUBLIC_FIELDS = 'id, business_id, name, email, phone, is_active, created_at';

function validateRegisterBody(body) {
  const { name, password, email, phone } = body;
  if (!isNonEmptyString(name)) throw new HttpError(400, 'name is required.');
  if (!isNonEmptyString(password) || password.length < 8) throw new HttpError(400, 'password must be at least 8 characters.');
  if (!email && !phone) throw new HttpError(400, 'Either email or phone is required.');
  if (!isValidEmailIfProvided(email)) throw new HttpError(400, 'email is invalid.');
}

async function issueCustomerToken(env, customer) {
  const expiresInSeconds = parseDurationToSeconds(env.CUSTOMER_JWT_EXPIRES_IN || '30d');
  return jwt.sign(
    { id: customer.id, businessId: customer.business_id, type: 'customer', exp: Math.floor(Date.now() / 1000) + expiresInSeconds },
    env.JWT_SECRET
  );
}

// POST /api/customers/register
export async function register(request, env) {
  if (!env.JWT_SECRET) throw new HttpError(500, 'Server misconfiguration: authentication is not available.');
  const body = await request.json().catch(() => ({}));
  validateRegisterBody(body);
  const { name, password, email, phone } = body;

  if (email) {
    const existing = await query(env, 'SELECT id FROM customers WHERE business_id = $1 AND LOWER(email) = LOWER($2)', [request.business.id, email]);
    if (existing.rows.length > 0) throw new HttpError(409, 'An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await tenantQuery(
    env,
    request.business.id,
    `INSERT INTO customers (business_id, name, email, phone, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING ${PUBLIC_FIELDS}`,
    [request.business.id, name, email || null, phone || null, passwordHash]
  );
  const customer = result.rows[0];
  const token = await issueCustomerToken(env, customer);
  return json({ success: true, data: { token, customer } }, 201);
}

// POST /api/customers/login  { email or phone, password }
export async function login(request, env) {
  if (!env.JWT_SECRET) throw new HttpError(500, 'Server misconfiguration: authentication is not available.');
  const body = await request.json().catch(() => ({}));
  const { email, phone, password } = body;
  if ((!email && !phone) || !password) throw new HttpError(400, 'email or phone, and password, are required.');

  const result = email
    ? await query(env, 'SELECT * FROM customers WHERE business_id = $1 AND LOWER(email) = LOWER($2)', [request.business.id, email])
    : await query(env, 'SELECT * FROM customers WHERE business_id = $1 AND phone = $2', [request.business.id, phone]);

  const customer = result.rows[0];
  if (!customer || !customer.is_active) throw new HttpError(401, 'Invalid credentials.');
  const isMatch = await bcrypt.compare(password, customer.password_hash);
  if (!isMatch) throw new HttpError(401, 'Invalid credentials.');

  const token = await issueCustomerToken(env, customer);
  const { password_hash, ...safeCustomer } = customer;
  return json({ success: true, data: { token, customer: safeCustomer } });
}

// GET /api/customers/me
export async function me(request, env) {
  const result = await query(env, `SELECT ${PUBLIC_FIELDS} FROM customers WHERE id = $1 AND business_id = $2`, [request.customer.id, request.business.id]);
  if (result.rows.length === 0) throw new HttpError(404, 'Account not found.');
  return json({ success: true, data: result.rows[0] });
}

// PUT /api/customers/me
export async function updateMe(request, env) {
  const body = await request.json().catch(() => ({}));
  const { name, phone, email } = body;
  if (name !== undefined && !isNonEmptyString(name)) throw new HttpError(400, 'name must not be empty.');
  if (!isValidEmailIfProvided(email)) throw new HttpError(400, 'email is invalid.');

  const sets = [];
  const values = [];
  for (const [key, val] of Object.entries({ name, phone, email })) {
    if (val !== undefined) {
      values.push(val);
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (sets.length === 0) throw new HttpError(400, 'No valid fields provided.');
  values.push(request.customer.id, request.business.id);

  const result = await tenantQuery(
    env,
    request.business.id,
    `UPDATE customers SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND business_id = $${values.length} RETURNING ${PUBLIC_FIELDS}`,
    values
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Account not found.');
  return json({ success: true, data: result.rows[0] });
}

// ---- Addresses (section 14: "Support multiple saved delivery addresses") ----

export async function listAddresses(request, env) {
  const result = await query(
    env,
    'SELECT * FROM customer_addresses WHERE business_id = $1 AND customer_id = $2 ORDER BY is_default DESC, id DESC',
    [request.business.id, request.customer.id]
  );
  return json({ success: true, data: result.rows });
}

function validateAddressBody(body) {
  const { recipient_name, phone, address_line } = body;
  if (!isNonEmptyString(recipient_name)) throw new HttpError(400, 'recipient_name is required.');
  if (!isNonEmptyString(phone)) throw new HttpError(400, 'phone is required.');
  if (!isNonEmptyString(address_line)) throw new HttpError(400, 'address_line is required.');
}

export async function createAddress(request, env) {
  const body = await request.json().catch(() => ({}));
  validateAddressBody(body);
  const { label, recipient_name, phone, address_line, city, notes, latitude, longitude, is_default } = body;

  return withTenantClient(env, request.business.id, async (client) => {
    if (is_default) {
      await client.query('UPDATE customer_addresses SET is_default = FALSE WHERE business_id = $1 AND customer_id = $2', [request.business.id, request.customer.id]);
    }
    const result = await client.query(
      `INSERT INTO customer_addresses (business_id, customer_id, label, recipient_name, phone, address_line, city, notes, latitude, longitude, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [request.business.id, request.customer.id, label || null, recipient_name, phone, address_line, city || null, notes || null, latitude || null, longitude || null, !!is_default]
    );
    return json({ success: true, data: result.rows[0] }, 201);
  });
}

export async function updateAddress(request, env) {
  const { id } = request.params;
  const body = await request.json().catch(() => ({}));
  validateAddressBody(body);
  const { label, recipient_name, phone, address_line, city, notes, latitude, longitude, is_default } = body;

  return withTenantClient(env, request.business.id, async (client) => {
    if (is_default) {
      await client.query('UPDATE customer_addresses SET is_default = FALSE WHERE business_id = $1 AND customer_id = $2', [request.business.id, request.customer.id]);
    }
    const result = await client.query(
      `UPDATE customer_addresses SET label=$1, recipient_name=$2, phone=$3, address_line=$4, city=$5, notes=$6, latitude=$7, longitude=$8, is_default=$9
       WHERE id=$10 AND business_id=$11 AND customer_id=$12 RETURNING *`,
      [label || null, recipient_name, phone, address_line, city || null, notes || null, latitude || null, longitude || null, !!is_default, id, request.business.id, request.customer.id]
    );
    if (result.rows.length === 0) throw new HttpError(404, 'Address not found.');
    return json({ success: true, data: result.rows[0] });
  });
}

export async function deleteAddress(request, env) {
  const { id } = request.params;
  const result = await tenantQuery(
    env,
    request.business.id,
    'DELETE FROM customer_addresses WHERE id = $1 AND business_id = $2 AND customer_id = $3 RETURNING id',
    [id, request.business.id, request.customer.id]
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Address not found.');
  return json({ success: true });
}

// POST /api/customers/forgot-password — { email }. Same generic-response
// principle as authController.forgotPassword (section 12/80).
export async function forgotPassword(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!isNonEmptyString(body.email)) throw new HttpError(400, 'email is required.');

  const result = await query(env, 'SELECT id FROM customers WHERE business_id = $1 AND LOWER(email) = LOWER($2) AND is_active = TRUE', [request.business.id, body.email]);
  const clientUrl = env.CLIENT_URL ? env.CLIENT_URL.split(',')[0].trim() : '';

  await requestPasswordReset(env, {
    businessId: request.business.id,
    actorType: 'customer',
    actorId: result.rows[0]?.id,
    email: body.email,
    resetBaseUrl: `${clientUrl}/reset-password`,
    businessName: request.business.name_ar || request.business.name,
  });

  return json({ success: true, data: { requested: true } });
}

// POST /api/customers/reset-password — { token, password }.
export async function resetPassword(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!isNonEmptyString(body.token)) throw new HttpError(400, 'token is required.');
  if (!isNonEmptyString(body.password) || body.password.length < 8) throw new HttpError(400, 'password must be at least 8 characters.');

  const result = await consumePasswordReset(env, {
    businessId: request.business.id, actorType: 'customer', rawToken: body.token, newPassword: body.password,
  });
  if (!result.success) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');

  return json({ success: true, data: { reset: true } });
}
