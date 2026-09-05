import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, useOutletContext, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import { useCustomerAuth } from '../hooks/useCustomerAuth.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useDocumentHead } from '../hooks/useDocumentHead.js';
import { validateCart, createOrder } from '../services/orderService.js';
import { listAddresses } from '../services/addressService.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

function generateIdempotencyKey() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function Checkout() {
  const { items, clear } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const { cafeInfo } = useOutletContext() || {};
  const { customer, authed } = useCustomerAuth();
  const { t, lang } = useLanguage();

  useDocumentHead({ title: t('checkout_title') });

  const couponCode = location.state?.couponCode || '';
  const [idempotencyKey] = useState(generateIdempotencyKey);

  const orderTypeLabels = { pickup: t('checkout_pickup'), delivery: t('checkout_delivery'), dine_in: t('checkout_dine_in') };

  const availableTypes = useMemo(() => {
    if (!cafeInfo) return ['pickup', 'delivery', 'dine_in'];
    return [
      cafeInfo.accept_pickup !== false && 'pickup',
      cafeInfo.accept_delivery !== false && 'delivery',
      cafeInfo.accept_dine_in !== false && 'dine_in',
    ].filter(Boolean);
  }, [cafeInfo]);

  const [orderType, setOrderType] = useState('');
  useEffect(() => { if (!orderType && availableTypes.length) setOrderType(availableTypes[0]); }, [availableTypes, orderType]);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('new');
  const [addrRecipient, setAddrRecipient] = useState('');
  const [addrPhone, setAddrPhone] = useState('');
  const [addrLine, setAddrLine] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrNotes, setAddrNotes] = useState('');

  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const [pricing, setPricing] = useState(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authed) {
      setGuestName(customer?.name || '');
      setGuestPhone(customer?.phone || '');
      setGuestEmail(customer?.email || '');
      listAddresses().then((addrs) => {
        setSavedAddresses(addrs);
        const def = addrs.find((a) => a.is_default) || addrs[0];
        if (def) setSelectedAddressId(String(def.id));
      }).catch(() => {});
    }
  }, [authed, customer]);

  useEffect(() => {
    if (selectedAddressId !== 'new') {
      const addr = savedAddresses.find((a) => String(a.id) === selectedAddressId);
      if (addr) {
        setAddrRecipient(addr.recipient_name);
        setAddrPhone(addr.phone);
        setAddrLine(addr.address_line);
        setAddrCity(addr.city || '');
        setAddrNotes(addr.notes || '');
      }
    }
  }, [selectedAddressId, savedAddresses]);

  useEffect(() => {
    if (!orderType || items.length === 0) return;
    setPricingLoading(true);
    setError('');
    validateCart(orderType, items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })), couponCode)
      .then(setPricing)
      .catch((err) => { setError(err.message || t('common_error_generic')); setPricing(null); })
      .finally(() => setPricingLoading(false));
  }, [orderType, items, couponCode, t]);

  if (items.length === 0) {
    return (
      <section className="section">
        <div className="container">
          <div className="empty-state">
            <p>{t('checkout_empty_cart')}</p>
            <Link to="/menu" className="btn btn-primary" style={{ marginTop: 16 }}>{t('common_back_to_menu')}</Link>
          </div>
        </div>
      </section>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!authed && (!guestName.trim() || !guestPhone.trim())) {
      setError(lang === 'ar' ? 'الاسم ورقم الهاتف مطلوبان لإتمام الطلب كضيف.' : 'Name and phone number are required for guest checkout.');
      return;
    }
    if (orderType === 'delivery' && !addrLine.trim()) {
      setError(lang === 'ar' ? 'عنوان التوصيل مطلوب.' : 'A delivery address is required.');
      return;
    }
    if (orderType === 'dine_in' && !tableNumber.trim()) {
      setError(lang === 'ar' ? 'رقم الطاولة مطلوب.' : 'A table number is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        order_type: orderType,
        items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        payment_method: paymentMethod,
        coupon_code: couponCode || undefined,
        notes: notes || undefined,
      };
      if (!authed) {
        payload.guest_name = guestName.trim();
        payload.guest_phone = guestPhone.trim();
        payload.guest_email = guestEmail.trim() || undefined;
      }
      if (orderType === 'delivery') {
        payload.address = {
          recipient_name: addrRecipient.trim() || guestName.trim(),
          phone: addrPhone.trim() || guestPhone.trim(),
          address_line: addrLine.trim(),
          city: addrCity.trim() || undefined,
          notes: addrNotes.trim() || undefined,
        };
      }
      if (orderType === 'dine_in') {
        payload.table_number = tableNumber.trim();
      }

      const order = await createOrder(payload, idempotencyKey);
      clear();
      const query = !authed && order.access_token ? `?access_token=${encodeURIComponent(order.access_token)}` : '';
      navigate(`/orders/${order.id}${query}`, { replace: true, state: { justPlaced: true } });
    } catch (err) {
      // Real backend errors surface here as-is (unavailable product, price
      // changed since the cart page, coupon no longer valid, minimum order
      // not met, etc.) — never overridden with a generic message.
      setError(err.message || t('common_error_generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="section">
      <div className="container">
        <h1 className="section-title">{t('checkout_title')}</h1>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {!authed && (
          <p className="summary-note">
            {t('checkout_guest_prompt_prefix')} <Link to="/login" state={{ from: '/checkout' }}>{t('checkout_guest_prompt_login')}</Link> {t('checkout_guest_prompt_suffix')}
          </p>
        )}

        <form onSubmit={handleSubmit} className="checkout-layout">
          <div className="checkout-fields">
            <div className="card checkout-section">
              <h3>{t('checkout_order_type')}</h3>
              <div className="filter-bar" style={{ justifyContent: 'flex-start' }} role="radiogroup" aria-label={t('checkout_order_type')}>
                {availableTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={orderType === type}
                    className={`filter-chip ${orderType === type ? 'active' : ''}`}
                    onClick={() => setOrderType(type)}
                  >
                    {orderTypeLabels[type]}
                  </button>
                ))}
              </div>
              {availableTypes.length === 0 && <p className="error-banner">{lang === 'ar' ? 'هذا المتجر لا يستقبل طلبات حالياً.' : 'This business is not accepting orders right now.'}</p>}
            </div>

            {!authed && (
              <div className="card checkout-section">
                <h3>{t('checkout_contact_info')}</h3>
                <div className="form-group">
                  <label htmlFor="guest-name">{t('checkout_name')}</label>
                  <input id="guest-name" className="form-control" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label htmlFor="guest-phone">{t('checkout_phone')}</label>
                  <input id="guest-phone" className="form-control" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label htmlFor="guest-email">{t('checkout_email')}</label>
                  <input id="guest-email" className="form-control" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
                </div>
              </div>
            )}

            {orderType === 'delivery' && (
              <div className="card checkout-section">
                <h3>{t('checkout_address')}</h3>
                {authed && savedAddresses.length > 0 && (
                  <div className="form-group">
                    <label htmlFor="saved-address">{t('checkout_saved_address')}</label>
                    <select id="saved-address" className="form-control" value={selectedAddressId} onChange={(e) => setSelectedAddressId(e.target.value)}>
                      {savedAddresses.map((a) => (
                        <option key={a.id} value={a.id}>{a.label || a.address_line}</option>
                      ))}
                      <option value="new">{t('checkout_new_address')}</option>
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="addr-recipient">{t('checkout_recipient_name')}</label>
                  <input id="addr-recipient" className="form-control" value={addrRecipient} onChange={(e) => setAddrRecipient(e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="addr-phone">{t('checkout_recipient_phone')}</label>
                  <input id="addr-phone" className="form-control" value={addrPhone} onChange={(e) => setAddrPhone(e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="addr-line">{t('checkout_address_line')}</label>
                  <input id="addr-line" className="form-control" value={addrLine} onChange={(e) => setAddrLine(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label htmlFor="addr-city">{t('checkout_city')}</label>
                  <input id="addr-city" className="form-control" value={addrCity} onChange={(e) => setAddrCity(e.target.value)} />
                </div>
              </div>
            )}

            {orderType === 'dine_in' && (
              <div className="card checkout-section">
                <h3>{t('checkout_table_number')}</h3>
                <div className="form-group">
                  <label htmlFor="table-number" className="sr-only">{t('checkout_table_number')}</label>
                  <input id="table-number" className="form-control" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} required />
                </div>
              </div>
            )}

            <div className="card checkout-section">
              <h3>{t('checkout_payment_method')}</h3>
              <label className="payment-option">
                <input type="radio" name="payment_method" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} /> {t('checkout_pay_cash')}
              </label>
              <label className="payment-option">
                <input type="radio" name="payment_method" checked={paymentMethod === 'online'} onChange={() => setPaymentMethod('online')} /> {t('checkout_pay_online')}
              </label>
              {paymentMethod === 'online' && (
                <p className="summary-note">
                  {lang === 'ar'
                    ? 'سيتم تحويلك لصفحة دفع آمنة لإتمام العملية بعد تأكيد الطلب.'
                    : "You'll be redirected to a secure payment page to complete this after confirming the order."}
                </p>
              )}
              <label className="payment-option payment-option-disabled">
                <input type="radio" disabled /> {t('checkout_pay_card')}
              </label>
            </div>

            <div className="card checkout-section">
              <h3>{t('checkout_notes')}</h3>
              <label htmlFor="checkout-notes" className="sr-only">{t('checkout_notes')}</label>
              <textarea id="checkout-notes" className="form-control" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="cart-summary card">
            <h3>{t('checkout_summary')}</h3>
            {pricingLoading ? (
              <LoadingSpinner label={t('common_loading')} />
            ) : pricing ? (
              <>
                <div className="summary-row"><span>{t('cart_subtotal')}</span><span>{pricing.subtotal.toFixed(2)} ₪</span></div>
                {pricing.discount > 0 && <div className="summary-row summary-discount"><span>{t('cart_discount')}</span><span>-{pricing.discount.toFixed(2)} ₪</span></div>}
                {pricing.delivery_fee > 0 && <div className="summary-row"><span>{t('checkout_delivery_fee')}</span><span>{pricing.delivery_fee.toFixed(2)} ₪</span></div>}
                {pricing.tax > 0 && <div className="summary-row"><span>{t('checkout_tax')}</span><span>{pricing.tax.toFixed(2)} ₪</span></div>}
                <div className="summary-row summary-total"><span>{t('checkout_total')}</span><span>{pricing.total.toFixed(2)} ₪</span></div>
              </>
            ) : null}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={submitting || pricingLoading || !pricing || availableTypes.length === 0}>
              {submitting ? t('checkout_submitting') : t('checkout_confirm')}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
