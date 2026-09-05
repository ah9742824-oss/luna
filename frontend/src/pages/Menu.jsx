import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useDocumentHead } from '../hooks/useDocumentHead.js';
import ProductCard from '../components/ProductCard.jsx';
import CategoryFilter from '../components/CategoryFilter.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function Menu() {
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [active, setActive] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useDocumentHead({ title: t('menu_title') });

  useEffect(() => {
    setLoading(true);
    Promise.all([api.get('/categories'), api.get('/products')])
      .then(([c, p]) => { setCategories(c); setProducts(p); })
      .catch(() => setError(t('common_error_generic')))
      .finally(() => setLoading(false));
  }, [t]);

  const visible = products
    .filter((p) => active === 'all' || p.category_slug === active)
    .filter((p) => !search || `${p.name} ${p.name_ar}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="section">
      <div className="container">
        <h1 className="section-title">{t('menu_title')}</h1>

        {error && <div className="error-banner" role="alert">{error}</div>}

        <div className="form-group" style={{ maxWidth: 360, margin: '0 auto 20px' }}>
          <label htmlFor="menu-search" className="sr-only">{t('menu_search_placeholder')}</label>
          <input
            id="menu-search"
            className="form-control"
            placeholder={t('menu_search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {!loading && categories.length > 0 && (
          <CategoryFilter categories={categories} active={active} onChange={setActive} allLabel={t('menu_all')} />
        )}

        {loading ? (
          <LoadingSpinner label={t('common_loading')} />
        ) : visible.length === 0 ? (
          <div className="empty-state">{t('menu_empty')}</div>
        ) : (
          <div className="product-grid">
            {visible.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </section>
  );
}
