import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../../services/customerAuthService.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useDocumentHead } from '../../hooks/useDocumentHead.js';

export default function ForgotPassword() {
  const { lang } = useLanguage();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useDocumentHead({ title: lang === 'ar' ? 'استعادة كلمة المرور' : 'Reset your password' });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // The backend always responds the same way whether or not this email
      // has an account (anti-enumeration) — so the UI shows one generic
      // success message either way, never "no account found".
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || (lang === 'ar' ? 'حدث خطأ ما.' : 'Something went wrong.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section">
      <div className="login-shell" style={{ minHeight: 'auto', background: 'none', padding: 0 }}>
        <div className="login-card">
          <h1>{lang === 'ar' ? 'استعادة كلمة المرور' : 'Reset your password'}</h1>
          {submitted ? (
            <div className="success-banner" role="status">
              {lang === 'ar'
                ? 'إذا كان هذا البريد الإلكتروني مرتبطاً بحساب، فسنرسل رابط استعادة كلمة المرور إليه.'
                : "If that email is linked to an account, we've sent a password reset link to it."}
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && <div className="error-banner" role="alert">{error}</div>}
              <div className="form-group">
                <label htmlFor="forgot-email">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
                <input id="forgot-email" className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button className="btn btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
                {loading ? (lang === 'ar' ? 'جارٍ الإرسال...' : 'Sending...') : (lang === 'ar' ? 'إرسال رابط الاستعادة' : 'Send reset link')}
              </button>
            </form>
          )}
          <p className="summary-note" style={{ textAlign: 'center', marginTop: 16 }}>
            <Link to="/login">{lang === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to log in'}</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
