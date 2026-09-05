import { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { isCustomerLoggedIn } from '../services/customerAuthService.js';

export default function Navbar({ cafeInfo }) {
  const [open, setOpen] = useState(false);
  const { count } = useCart();
  const { t, lang, toggleLang } = useLanguage();
  const loggedIn = isCustomerLoggedIn();

  useEffect(() => { setOpen(false); }, []);

  const links = [
    { to: '/', label: t('nav_home') },
    { to: '/menu', label: t('nav_menu') },
    { to: '/about', label: t('nav_about') },
    { to: '/gallery', label: t('nav_gallery') },
    { to: '/contact', label: t('nav_contact') },
  ];

  const businessName = lang === 'ar' ? (cafeInfo?.name_ar || 'لونا كافيه') : (cafeInfo?.name || 'LUNA Café');

  return (
    <nav className="navbar">
      <a href="#main-content" className="skip-link">{lang === 'ar' ? 'تخطَّ إلى المحتوى الرئيسي' : 'Skip to main content'}</a>
      <div className="navbar-inner">
        <NavLink to="/" className="navbar-logo">
          <img src={cafeInfo?.logo_url || 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=200'} alt={businessName} />
          <span>{businessName}</span>
        </NavLink>

        <ul className={`navbar-links ${open ? 'open' : ''}`}>
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} onClick={() => setOpen(false)} className={({ isActive }) => (isActive ? 'active' : '')}>
                {l.label}
              </NavLink>
            </li>
          ))}
          <li>
            <NavLink to={loggedIn ? '/orders' : '/login'} onClick={() => setOpen(false)} className={({ isActive }) => (isActive ? 'active' : '')}>
              {loggedIn ? t('nav_orders') : t('nav_login')}
            </NavLink>
          </li>
        </ul>

        <div className="navbar-actions">
          <button type="button" className="lang-switch" onClick={toggleLang} aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}>
            {t('nav_language')}
          </button>
          <Link to="/cart" className="cart-link" aria-label={t('nav_cart')}>
            🛒{count > 0 && <span className="cart-badge">{count}</span>}
          </Link>
          <NavLink to="/menu" className="btn btn-primary btn-sm">{t('nav_order_now')}</NavLink>
          <button className="navbar-toggle" onClick={() => setOpen((o) => !o)} aria-label={lang === 'ar' ? 'القائمة' : 'Menu'} aria-expanded={open}>
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>
    </nav>
  );
}
