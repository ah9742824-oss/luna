import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMyOrders } from '../../services/orderService.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useDocumentHead } from '../../hooks/useDocumentHead.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';

export default function CustomerOrders() {
  const { t, lang } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useDocumentHead({ title: t('orders_title') });

  const STATUS_LABELS = {
    new: t('status_new'), accepted: t('status_accepted'), preparing: t('status_preparing'), ready: t('status_ready'),
    out_for_delivery: t('status_out_for_delivery'), delivered: t('status_completed'), completed: t('status_completed'), cancelled: t('status_cancelled'),
  };

  useEffect(() => {
    listMyOrders()
      .then(setOrders)
      .catch((err) => setError(err.message || t('common_error_generic')))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) return <section className="section"><div className="container"><LoadingSpinner label={t('common_loading')} /></div></section>;

  return (
    <section className="section">
      <div className="container">
        <h1 className="section-title">{t('orders_title')}</h1>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {!error && orders.length === 0 ? (
          <div className="empty-state">
            <p>{t('orders_empty')}</p>
            <Link to="/menu" className="btn btn-primary" style={{ marginTop: 16 }}>{t('common_back_to_menu')}</Link>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>{t('orders_number')}</th><th>{t('orders_date')}</th><th>{t('orders_status')}</th><th>{t('orders_total')}</th><th></th></tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.order_number}</td>
                    <td>{new Date(o.created_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}</td>
                    <td><span className={`badge ${o.status === 'cancelled' ? 'badge-unavailable' : 'badge-available'}`}>{STATUS_LABELS[o.status] || o.status}</span></td>
                    <td>{Number(o.total).toFixed(2)} ₪</td>
                    <td><Link to={`/orders/${o.id}`} className="btn btn-outline btn-sm">{t('orders_details')}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
