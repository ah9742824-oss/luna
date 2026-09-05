import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { resetPassword } from '../../services/authService.js';

export default function AdminResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/admin/login'), 2000);
    } catch (err) {
      // A real backend rejection (invalid/expired/already-used token) —
      // shown as-is, never a fake success.
      setError(err.message || 'الرابط غير صالح أو منتهي الصلاحية.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="error-banner">رابط غير صالح.</div>
          <Link to="/admin/forgot-password" className="btn btn-outline" style={{ width: '100%', textAlign: 'center' }}>طلب رابط جديد</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <h1>تعيين كلمة مرور جديدة</h1>
        {done ? (
          <div className="success-banner" role="status">تم تحديث كلمة المرور بنجاح. جارٍ تحويلك لتسجيل الدخول...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="error-banner">{error}</div>}
            <div className="form-group">
              <label>كلمة المرور الجديدة</label>
              <input className="form-control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <button className="btn btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
