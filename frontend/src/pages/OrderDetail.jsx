import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useLocation, Link } from 'react-router-dom';
import { getOrder } from '../services/orderService.js';
import { initiateOnlinePayment } from '../services/paymentService.js';
import { isCustomerLoggedIn } from '../services/customerAuthService.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useDocumentHead } from '../hooks/useDocumentHead.js';
import OrderStatusTimeline from '../components/OrderStatusTimeline.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function OrderDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { t, lang } = useLanguage();
  const accessToken = searchParams.get('access_token');

  const orderTypeLabels = { pickup: t('checkout_pickup'), delivery: t('checkout_delivery'), dine_in: t('checkout_dine_in') };
  const paymentMethodLabels = { cash: t('checkout_pay_cash'), card: lang === 'ar' ? 'بطاقة ائتمان' : 'Card', online: lang === 'ar' ? 'دفع إلكتروني' : 'Online payment' };

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payError, setPayError] = useState('');
  const [payLoading, setPayLoading] = useState(false);

  useDocumentHead({ title: order ? `${t('order_title')} ${order.order_number}` : t('orders_title') });

  useEffect(() => {
    setLoading(true);
    setError('');
    getOrder(id, accessToken)
      .then(setOrder)
      // The backend returns 404 (not 403) for both "doesn't exist" and "not
      // yours to see" — section 33/96, so order existence can't be probed.
      .catch(() => setError(t('order_not_found')))
      .finally(() => setLoading(false));
  }, [id, accessToken, t]);

  if (loading) return <section className="section"><div className="container"><LoadingSpinner label={t('common_loading')} /></div></section>;

  async function handlePayNow() {
    setPayError('');
    setPayLoading(true);
    try {
      // Real request to the real backend endpoint (paymentController.js) —
      // never fabricates a "paid" state client-side. If the provider isn't
      // configured yet (no Paymob credentials — see backend/README.md),
      // the backend returns a real 500 with a clear message, shown as-is
      // below rather than hidden behind a fake success.
      const { checkout_url } = await initiateOnlinePayment(order.id, accessToken);
      window.location.href = checkout_url;
    } catch (err) {
      setPayError(err.message || t('common_error_generic'));
    } finally {
      setPayLoading(false);
    }
  }


  if (error || !order) {
    return (
      <section className="section">
        <div className="container">
          <div className="error-banner" role="alert">{error || t('order_not_found')}</div>
          {!isCustomerLoggedIn() && <Link to="/login" className="btn btn-outline">{t('nav_login')}</Link>}
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container order-detail">
        {location.state?.justPlaced && (
          <div className="success-banner" role="status">
            {t('order_placed_success')} <strong>{order.order_number}</strong>
            {accessToken && <> — {t('order_save_link')}</>}
          </div>
        )}

        <h1 className="section-title" style={{ textAlign: 'start' }}>{t('order_title')} {order.order_number}</h1>

        <OrderStatusTimeline status={order.status} orderType={order.order_type} />

        <div className="order-detail-grid">
          <div className="card order-detail-section">
            <h3>{t('order_products')}</h3>
            {order.items.map((item) => (
              <div key={item.id} className="summary-row">
                <span>{lang === 'ar' ? item.product_name_ar_snapshot : (item.product_name_snapshot || item.product_name_ar_snapshot)} × {item.quantity}</span>
                <span>{Number(item.subtotal).toFixed(2)} ₪</span>
              </div>
            ))}
            <div className="summary-row"><span>{t('cart_subtotal')}</span><span>{Number(order.subtotal).toFixed(2)} ₪</span></div>
            {Number(order.discount) > 0 && <div className="summary-row summary-discount"><span>{t('cart_discount')}</span><span>-{Number(order.discount).toFixed(2)} ₪</span></div>}
            {Number(order.delivery_fee) > 0 && <div className="summary-row"><span>{t('checkout_delivery_fee')}</span><span>{Number(order.delivery_fee).toFixed(2)} ₪</span></div>}
            {Number(order.tax) > 0 && <div className="summary-row"><span>{t('checkout_tax')}</span><span>{Number(order.tax).toFixed(2)} ₪</span></div>}
            <div className="summary-row summary-total"><span>{t('checkout_total')}</span><span>{Number(order.total).toFixed(2)} ₪</span></div>
          </div>

          <div className="card order-detail-section">
            <h3>{t('order_details')}</h3>
            <div className="summary-row"><span>{t('order_type_label')}</span><span>{orderTypeLabels[order.order_type] || order.order_type}</span></div>
            <div className="summary-row"><span>{t('order_payment_method')}</span><span>{paymentMethodLabels[order.payment_method] || order.payment_method}</span></div>
            <div className="summary-row"><span>{t('order_payment_status')}</span><span>{order.payment_status === 'paid' ? t('order_paid') : order.payment_status === 'unpaid' ? t('order_unpaid') : order.payment_status}</span></div>
            {order.payment_method === 'online' && order.payment_status === 'unpaid' && (
              <div style={{ marginTop: 12 }}>
                {payError && <div className="error-banner" role="alert">{payError}</div>}
                <button type="button" className="btn btn-primary btn-sm" disabled={payLoading} onClick={handlePayNow}>
                  {payLoading ? t('common_loading') : (lang === 'ar' ? 'ادفع الآن' : 'Pay now')}
                </button>
              </div>
            )}
            {order.table_number && <div className="summary-row"><span>{t('checkout_table_number')}</span><span>{order.table_number}</span></div>}
            {order.address_snapshot && (
              <>
                <div className="summary-row"><span>{t('checkout_address')}</span><span>{order.address_snapshot.address_line}</span></div>
                {order.address_snapshot.city && <div className="summary-row"><span>{t('checkout_city')}</span><span>{order.address_snapshot.city}</span></div>}
              </>
            )}
            {order.notes && <div className="summary-row"><span>{t('checkout_notes')}</span><span>{order.notes}</span></div>}
          </div>
        </div>
      </div>
    </section>
  );
}
