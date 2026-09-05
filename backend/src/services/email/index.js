// Email sending abstraction. Password reset (section 12) needs SOME way to
// deliver a reset link out-of-band from the API response — returning the
// token directly in the response would let anyone reset anyone's password
// just by knowing their email/phone, which defeats the entire point.
//
// HONEST STATUS: no email provider credentials exist in this sandbox. This
// file implements a real integration against Resend (resend.com — a
// straightforward transactional email API) when RESEND_API_KEY is
// configured, and otherwise logs the attempt server-side and returns
// { sent: false } — it NEVER claims an email was sent when it wasn't.
// Callers (passwordReset.js) are written to give the same generic
// "if that account exists, a reset link was sent" response to the client
// EITHER WAY, so the missing-provider case is invisible to an attacker
// probing for valid accounts (section 12/80) — only server-side logs (and
// the `sent` field, never returned to the client) reveal it wasn't
// actually delivered.
export async function sendPasswordResetEmail(env, { to, resetUrl, businessName }) {
  if (!env.RESEND_API_KEY) {
    console.warn(
      `[email] RESEND_API_KEY not configured — password reset email NOT sent to ${to}. ` +
      `Reset link (for manual/dev use only, never log this in production): ${resetUrl}`
    );
    return { sent: false, reason: 'not_configured' };
  }

  const fromAddress = env.RESEND_FROM_ADDRESS || 'onboarding@resend.dev';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject: `${businessName} — Password reset request`,
        html: `<p>Someone requested a password reset for your ${businessName} account.</p>
               <p><a href="${resetUrl}">Click here to reset your password</a>. This link expires in 30 minutes.</p>
               <p>If you didn't request this, you can safely ignore this email.</p>`,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('Resend API error:', res.status, errText.slice(0, 300));
      return { sent: false, reason: 'provider_error' };
    }
    return { sent: true };
  } catch (err) {
    console.error('Resend request failed:', err);
    return { sent: false, reason: 'network_error' };
  }
}
