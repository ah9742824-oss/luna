import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { useCart } from '../context/CartContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useDocumentHead } from '../hooks/useDocumentHead.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { t, lang } = useLanguage();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    setAdded(false);
    api.get(`/products/${id}`)
      .then(setProduct)
      .catch((err) => setError(err.status === 404 ? t('product_not_found') : t('common_error_generic')))
      .finally(() => setLoading(false));
  }, [id, t]);

  const name = product ? (lang === 'ar' ? product.name_ar : (product.name || product.name_ar)) : '';
  useDocumentHead({ title: name || t('menu_title'), image: product?.image_url });

  if (loading) return <section className="section"><div className="container"><LoadingSpinner label={t('common_loading')} /></div></section>;

  if (error || !product) {
    return (
      <section className="section">
        <div className="container">
          <div className="error-banner" role="alert">{error || t('product_not_found')}</div>
          <Link to="/menu" className="btn btn-outline">{t('common_back_to_menu')}</Link>
        </div>
      </section>
    );
  }

  const description = lang === 'ar' ? product.description_ar : (product.description || product.description_ar);

  function handleAdd() {
    addItem(product, quantity);
    setAdded(true);
  }

  return (
    <section className="section">
      <div className="container product-detail">
        <div className="product-detail-image">
          <img
            src={product.image_url || 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800'}
            alt={name}
          />
        </div>
        <div className="product-detail-body">
          <h1>{name}</h1>
          <span className="price-tag price-tag-lg">{Number(product.price).toFixed(2)} ₪</span>
          <p>{description}</p>
          <span className={`badge ${product.is_available ? 'badge-available' : 'badge-unavailable'}`}>
            {product.is_available ? t('product_available') : t('product_unavailable')}
          </span>

          {product.is_available ? (
            <>
              <div className="qty-stepper" role="group" aria-label={lang === 'ar' ? 'الكمية' : 'Quantity'}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label={lang === 'ar' ? 'إنقاص الكمية' : 'Decrease quantity'}>−</button>
                <span className="qty-value">{quantity}</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setQuantity((q) => Math.min(50, q + 1))} aria-label={lang === 'ar' ? 'زيادة الكمية' : 'Increase quantity'}>+</button>
              </div>

              <div className="product-detail-actions">
                <button type="button" className="btn btn-primary" onClick={handleAdd}>{t('product_add_to_cart')}</button>
                {added && (
                  <button type="button" className="btn btn-outline" onClick={() => navigate('/cart')}>
                    {t('product_view_cart')}
                  </button>
                )}
              </div>
              {added && <p className="success-banner" role="status">{t('product_added')}</p>}
            </>
          ) : (
            <p className="error-banner">{t('product_unavailable_full')}</p>
          )}
        </div>
      </div>
    </section>
  );
}
