import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useCustomerAuth } from '../../hooks/useCustomerAuth.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useDocumentHead } from '../../hooks/useDocumentHead.js';
import { isCustomerLoggedIn } from '../../services/customerAuthService.js';

export default function CustomerRegister() {
  const { register } = useCustomerAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useDocumentHead({ title: t('register_title') });

  if (isCustomerLoggedIn()) return <Navigate to="/orders" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() && !phone.trim()) {
      setError(lang === 'ar' ? 'أدخل البريد الإلكتروني أو رقم الهاتف.' : 'Enter an email or phone number.');
      return;
    }
    if (password.length < 8) {
      setError(lang === 'ar' ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' : 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await register({ name, email: email.trim() || undefined, phone: phone.trim() || undefined, password });
      navigate('/orders', { replace: true });
    } catch (err) {
      setError(err.message || t('common_error_generic'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section">
      <div className="login-shell" style={{ minHeight: 'auto', background: 'none', padding: 0 }}>
        <div className="login-card">
          <h1>{t('register_title')}</h1>
          <p className="subtitle">{t('register_subtitle')}</p>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="register-name">{t('register_name')}</label>
              <input id="register-name" className="form-control" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="register-email">{t('register_email')}</label>
              <input id="register-email" className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="register-phone">{t('register_phone')}</label>
              <input id="register-phone" className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="register-password">{t('register_password')}</label>
              <input id="register-password" className="form-control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <button className="btn btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? t('common_loading') : t('register_submit')}
            </button>
          </form>
          <p className="summary-note" style={{ textAlign: 'center', marginTop: 16 }}>
            {t('register_has_account')} <Link to="/login">{t('register_login_link')}</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
