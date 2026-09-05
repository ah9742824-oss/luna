// Shared password-reset token logic for both actor types (admin `profiles`
// and `customers`) — one implementation, used by both authController.js and
// customerController.js, so the security properties (token hashing,
// expiry, single-use, generic responses) can't drift between the two.
import bcrypt from 'bcryptjs';
import { query, withTenantClient } from '../config/db.js';
import { sendPasswordResetEmail } from './email/index.js';

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function generateRawToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashToken(rawToken) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Called by both POST /api/auth/forgot-password (admin) and
// POST /api/customers/forgot-password. Always returns the same
// { requested: true } shape regardless of whether the account exists or
// the email actually sent — section 12/80: never let this endpoint be used
// to enumerate valid admin/customer accounts by email.
export async function requestPasswordReset(env, { businessId, actorType, actorId, email, resetBaseUrl, businessName }) {
  if (!actorId) {
    // No matching account — still "succeed" from the caller's perspective.
    return { requested: true };
  }

  const rawToken = generateRawToken();
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  await withTenantClient(env, businessId, async (client) => {
    // Invalidate any previous still-valid token for this account first —
    // only the newest request's link should ever work (prevents an old,
    // possibly-intercepted email link from remaining valid indefinitely).
    if (actorType === 'profile') {
      await client.query('DELETE FROM password_reset_tokens WHERE profile_id = $1 AND used_at IS NULL', [actorId]);
      await client.query(
        `INSERT INTO password_reset_tokens (business_id, actor_type, profile_id, token_hash, expires_at) VALUES ($1,'profile',$2,$3,$4)`,
        [businessId, actorId, tokenHash, expiresAt]
      );
    } else {
      await client.query('DELETE FROM password_reset_tokens WHERE customer_id = $1 AND used_at IS NULL', [actorId]);
      await client.query(
        `INSERT INTO password_reset_tokens (business_id, actor_type, customer_id, token_hash, expires_at) VALUES ($1,'customer',$2,$3,$4)`,
        [businessId, actorId, tokenHash, expiresAt]
      );
    }
  });

  const resetUrl = `${resetBaseUrl}?token=${rawToken}`;
  await sendPasswordResetEmail(env, { to: email, resetUrl, businessName });

  return { requested: true };
}

// Called by both POST /api/auth/reset-password and
// POST /api/customers/reset-password. Verifies the raw token (by hashing
// and comparing — the raw value is never stored), checks expiry and
// single-use, then updates the password. Returns { success: boolean }.
export async function consumePasswordReset(env, { businessId, actorType, rawToken, newPassword }) {
  const tokenHash = await hashToken(rawToken);

  const result = await query(
    env,
    `SELECT * FROM password_reset_tokens
     WHERE business_id = $1 AND actor_type = $2 AND token_hash = $3 AND used_at IS NULL AND expires_at > NOW()`,
    [businessId, actorType, tokenHash]
  );
  const tokenRow = result.rows[0];
  if (!tokenRow) {
    return { success: false, reason: 'invalid_or_expired' };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await withTenantClient(env, businessId, async (client) => {
    // Mark the token used FIRST, inside the same transaction as the
    // password update — an error partway through never leaves a
    // still-valid, still-unused token lying around.
    await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [tokenRow.id]);
    if (actorType === 'profile') {
      await client.query('UPDATE profiles SET password_hash = $1 WHERE id = $2 AND business_id = $3', [passwordHash, tokenRow.profile_id, businessId]);
    } else {
      await client.query('UPDATE customers SET password_hash = $1 WHERE id = $2 AND business_id = $3', [passwordHash, tokenRow.customer_id, businessId]);
    }
  });

  return { success: true };
}
