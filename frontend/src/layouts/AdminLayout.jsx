import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import NotificationsBell from '../components/admin/NotificationsBell.jsx';

export default function AdminLayout() {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();

  // The admin dashboard is staff-facing (not part of the bilingual customer
  // experience — see i18n/translations.js's coverage note) and is always
  // Arabic/RTL, regardless of whatever language a customer previously
  // selected on the public site in the same browser session.
  useEffect(() => {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }, []);

  // Every link's visibility mirrors a real backend permission (section 16) —
  // this is a UX convenience only; the corresponding API route re-checks
  // the same permission server-side regardless of what's shown here.
  const links = [
    { to: '/admin', label: 'لوحة التحكم', end: true, permission: 'statistics.view' },
    { to: '/admin/orders', label: 'الطلبات', permission: 'orders.view' },
    { to: '/admin/products', label: 'المنتجات', permission: 'products.manage' },
    { to: '/admin/categories', label: 'الفئات', permission: 'categories.manage' },
    { to: '/admin/customers', label: 'العملاء', permission: 'customers.view' },
    { to: '/admin/coupons', label: 'الكوبونات', permission: 'coupons.manage' },
    { to: '/admin/reviews', label: 'التقييمات', permission: 'reviews.manage' },
    { to: '/admin/gallery', label: 'معرض الصور', permission: 'gallery.manage' },
    { to: '/admin/business-settings', label: 'إعدادات المتجر', permission: 'business.manage' },
    { to: '/admin/staff', label: 'فريق العمل', permission: 'staff.manage' },
    { to: '/admin/audit-log', label: 'سجل النشاطات', permission: 'audit_log.view' },
  ];

  function handleLogout() {
    logout();
    navigate('/admin/login');
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <h2>لوحة تحكم لونا</h2>
        <nav className="admin-nav">
          {links.filter((l) => can(l.permission)).map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          ))}
          <a onClick={handleLogout} style={{ cursor: 'pointer', marginTop: 12 }}>تسجيل الخروج</a>
        </nav>
      </aside>
      <main className="admin-main">
        <div className="admin-topbar">
          <NotificationsBell />
          <div>مرحباً، {user?.name || 'المسؤول'} ({user?.roleNameAr || user?.role})</div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
