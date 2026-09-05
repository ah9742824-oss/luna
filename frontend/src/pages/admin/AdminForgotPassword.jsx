import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../../services/authService.js';

export default function AdminForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // The backend always responds the same way whether or not this email
      // has an admin account (anti-enumeration) — one generic message.
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'حدث خطأ ما.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <h1>استعادة كلمة المرور</h1>
        <p className="subtitle">للوصول إلى لوحة تحكم لونا</p>
        {submitted ? (
          <div className="success-banner" role="status">
            إذا كان هذا البريد الإلكتروني مرتبطاً بحساب مسؤول، فسنرسل رابط استعادة كلمة المرور إليه.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="error-banner">{error}</div>}
            <div className="form-group">
              <label>البريد الإلكتروني</label>
              <input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button className="btn btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'جارٍ الإرسال...' : 'إرسال رابط الاستعادة'}
            </button>
          </form>
        )}
        <p className="summary-note" style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/admin/login">العودة لتسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
