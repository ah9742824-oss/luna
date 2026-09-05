import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useDocumentHead } from '../hooks/useDocumentHead.js';
import { validateCart } from '../services/orderService.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

// The cart page shows REAL numbers from the backend (section 27, 29) —
// display_price stored client-side is only ever a placeholder used for the
// very first render, before the first validateCart() response arrives.
export default function Cart() {
  const { items, updateItem, removeItem, clear } = useCart();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [validated, setValidated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  useDocumentHead({ title: t('cart_title') });

  const revalidate = useCallback(() => {
    if (items.length === 0) { setValidated(null); return; }
    setLoading(true);
    setError('');
    validateCart('pickup', items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })), appliedCoupon)
      .then(setValidated)
      .catch((err) => { setError(err.message || t('common_error_generic')); setValidated(null); })
      .finally(() => setLoading(false));
  }, [items, appliedCoupon, t]);

  useEffect(() => { revalidate(); }, [revalidate]);

  function handleApplyCoupon(e) {
    e.preventDefault();
    setAppliedCoupon(couponInput.trim());
  }

  if (items.length === 0) {
    return (
      <section className="section">
        <div className="container">
          <h1 className="section-title">{t('cart_title')}</h1>
          <div className="empty-state">
            <p>{t('cart_empty')}</p>
            <Link to="/menu" className="btn btn-primary" style={{ marginTop: 16 }}>{t('common_back_to_menu')}</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container">
        <h1 className="section-title">{t('cart_title')}</h1>

        {error && <div className="error-banner" role="alert">{error}</div>}

        <div className="cart-layout">
          <div className="cart-list">
            {items.map((item) => {
              const validatedLine = validated?.items?.find((v) => v.product_id === item.product_id);
              const unitPrice = validatedLine ? validatedLine.unit_price : item.display_price;
              const name = lang === 'ar' ? item.name_ar : (item.name || item.name_ar);
              return (
                <div key={item.product_id} className="cart-item card">
                  <img src={item.image_url || 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=200'} alt={name} />
                  <div className="cart-item-body">
                    <h3>{name}</h3>
                    <span className="price-tag">{Number(unitPrice ?? 0).toFixed(2)} ₪</span>
                  </div>
                  <div className="qty-stepper" role="group" aria-label={`${lang === 'ar' ? 'الكمية' : 'Quantity'} - ${name}`}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => updateItem(item.product_id, item.quantity - 1)} aria-label={lang === 'ar' ? 'إنقاص الكمية' : 'Decrease quantity'}>−</button>
                    <span className="qty-value">{item.quantity}</span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => updateItem(item.product_id, item.quantity + 1)} aria-label={lang === 'ar' ? 'زيادة الكمية' : 'Increase quantity'}>+</button>
                  </div>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(item.product_id)}>{t('common_delete')}</button>
                </div>
              );
            })}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmClear(true)}>{t('cart_clear')}</button>
          </div>

          <div className="cart-summary card">
            <h3>{t('checkout_summary')}</h3>
            <form onSubmit={handleApplyCoupon} className="coupon-form">
              <label htmlFor="coupon-code" className="sr-only">{t('cart_coupon_placeholder')}</label>
              <input
                id="coupon-code"
                className="form-control"
                placeholder={t('cart_coupon_placeholder')}
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
              />
              <button type="submit" className="btn btn-outline btn-sm" disabled={loading}>{t('cart_coupon_apply')}</button>
            </form>

            {loading ? (
              <LoadingSpinner label={t('common_loading')} />
            ) : validated ? (
              <>
                <div className="summary-row"><span>{t('cart_subtotal')}</span><span>{validated.subtotal.toFixed(2)} ₪</span></div>
                {validated.discount > 0 && (
                  <div className="summary-row summary-discount"><span>{t('cart_discount')}</span><span>-{validated.discount.toFixed(2)} ₪</span></div>
                )}
                <p className="summary-note">{t('cart_delivery_note')}</p>
              </>
            ) : null}

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 12 }}
              disabled={!validated || loading}
              onClick={() => navigate('/checkout', { state: { couponCode: appliedCoupon } })}
            >
              {t('cart_continue')}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title={t('cart_clear_confirm_title')}
        message={t('cart_clear_confirm_message')}
        onConfirm={() => { clear(); setConfirmClear(false); }}
        onCancel={() => setConfirmClear(false)}
      />
    </section>
  );
}
