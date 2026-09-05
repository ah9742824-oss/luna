import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function ProductCard({ product }) {
  const { addItem } = useCart();
  const { t, lang } = useLanguage();
  const name = lang === 'ar' ? product.name_ar : (product.name || product.name_ar);
  const description = lang === 'ar' ? product.description_ar : (product.description || product.description_ar);

  return (
    <div className="card product-card">
      <Link to={`/menu/${product.id}`}>
        <img
          src={product.image_url || 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600'}
          alt={name}
          loading="lazy"
        />
      </Link>
      <div className="product-card-body">
        <div className="product-card-top">
          <Link to={`/menu/${product.id}`}><h3>{name}</h3></Link>
          <span className="price-tag">{Number(product.price).toFixed(2)} ₪</span>
        </div>
        <p>{description}</p>
        <span className={`badge ${product.is_available ? 'badge-available' : 'badge-unavailable'}`}>
          {product.is_available ? t('product_available') : t('product_unavailable')}
        </span>
        {product.is_available && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => addItem(product, 1)}>
            {t('product_add_to_cart')}
          </button>
        )}
      </div>
    </div>
  );
}
