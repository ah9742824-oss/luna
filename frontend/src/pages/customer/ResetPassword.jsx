import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { resetPassword } from '../../services/customerAuthService.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useDocumentHead } from '../../hooks/useDocumentHead.js';

export default function ResetPassword() {
  const { lang } = useLanguage();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useDocumentHead({ title: lang === 'ar' ? 'تعيين كلمة مرور جديدة' : 'Set a new password' });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError(lang === 'ar' ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' : 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      // A real backend rejection (invalid/expired/already-used token) —
      // shown as-is, never a fake success.
      setError(err.message || (lang === 'ar' ? 'الرابط غير صالح أو منتهي الصلاحية.' : 'This link is invalid or has expired.'));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <section className="section">
        <div className="container">
          <div className="error-banner" role="alert">{lang === 'ar' ? 'رابط غير صالح.' : 'Invalid reset link.'}</div>
          <Link to="/forgot-password" className="btn btn-outline">{lang === 'ar' ? 'طلب رابط جديد' : 'Request a new link'}</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="login-shell" style={{ minHeight: 'auto', background: 'none', padding: 0 }}>
        <div className="login-card">
          <h1>{lang === 'ar' ? 'تعيين كلمة مرور جديدة' : 'Set a new password'}</h1>
          {done ? (
            <div className="success-banner" role="status">{lang === 'ar' ? 'تم تحديث كلمة المرور بنجاح. جارٍ تحويلك لتسجيل الدخول...' : 'Password updated successfully. Redirecting to log in...'}</div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && <div className="error-banner" role="alert">{error}</div>}
              <div className="form-group">
                <label htmlFor="new-password">{lang === 'ar' ? 'كلمة المرور الجديدة' : 'New password'}</label>
                <input id="new-password" className="form-control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
              <button className="btn btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
                {loading ? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ كلمة المرور' : 'Save password')}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
