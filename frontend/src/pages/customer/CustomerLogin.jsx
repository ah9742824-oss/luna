import { useState } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { useCustomerAuth } from '../../hooks/useCustomerAuth.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useDocumentHead } from '../../hooks/useDocumentHead.js';
import { isCustomerLoggedIn } from '../../services/customerAuthService.js';

export default function CustomerLogin() {
  const { login } = useCustomerAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useDocumentHead({ title: t('login_title') });

  if (isCustomerLoggedIn()) return <Navigate to={location.state?.from?.pathname || '/orders'} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const isEmail = identifier.includes('@');
      await login(isEmail ? { email: identifier, password } : { phone: identifier, password });
      navigate(location.state?.from?.pathname || '/orders', { replace: true });
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
          <h1>{t('login_title')}</h1>
          <p className="subtitle">{t('login_subtitle')}</p>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="login-identifier">{t('login_identifier')}</label>
              <input id="login-identifier" className="form-control" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="login-password">{t('login_password')}</label>
              <input id="login-password" className="form-control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <p style={{ textAlign: 'end', marginTop: -8, marginBottom: 16 }}>
              <Link to="/forgot-password" style={{ fontSize: '.85rem' }}>{lang === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?'}</Link>
            </p>
            <button className="btn btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
              {loading ? t('common_loading') : t('login_submit')}
            </button>
          </form>
          <p className="summary-note" style={{ textAlign: 'center', marginTop: 16 }}>
            {t('login_no_account')} <Link to="/register">{t('login_register_link')}</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
