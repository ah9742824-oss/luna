import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../services/api.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import ProductCard from '../components/ProductCard.jsx';
import ReviewCard from '../components/ReviewCard.jsx';
import GalleryGrid from '../components/GalleryGrid.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function Home() {
  const { cafeInfo } = useOutletContext();
  const { t, lang } = useLanguage();
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/products?available=true'),
      api.get('/reviews'),
      api.get('/gallery'),
    ])
      .then(([p, r, g]) => {
        setProducts(p.slice(0, 6));
        setReviews(r.slice(0, 3));
        setGallery(g.slice(0, 6));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const name = lang === 'ar' ? (cafeInfo?.name_ar || 'لونا كافيه') : (cafeInfo?.name || 'LUNA Café');
  const description = lang === 'ar' ? cafeInfo?.description_ar : cafeInfo?.description;
  const address = lang === 'ar' ? cafeInfo?.address_ar : cafeInfo?.address;
  // working_hours is stored as { text, text_ar } (see migration 0001) —
  // real business data, never hard-coded.
  const workingHoursText = lang === 'ar' ? cafeInfo?.working_hours?.text_ar : cafeInfo?.working_hours?.text;

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <h1>{name}</h1>
          <p>{description || (lang === 'ar' ? 'قهوة مختصة، حلويات طازجة، وأجواء دافئة تنتظرك كل يوم.' : 'Specialty coffee, fresh bakes, and a warm atmosphere waiting for you every day.')}</p>
          <div className="hero-cta">
            <Link to="/menu" className="btn btn-primary">{t('home_hero_secondary')}</Link>
            <Link to="/contact" className="btn btn-outline" style={{ background: 'rgba(255,255,255,.08)', color: '#fff', borderColor: '#fff' }}>
              {t('nav_contact')}
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">{t('home_featured')}</h2>
          {loading ? (
            <LoadingSpinner label={t('common_loading')} />
          ) : products.length === 0 ? (
            <div className="empty-state">{t('menu_empty')}</div>
          ) : (
            <div className="product-grid">
              {products.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </section>

      <section className="section" style={{ background: 'var(--color-cream-dark)' }}>
        <div className="container about-grid">
          <img src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800" alt={name} />
          <div>
            <h2>{t('about_title')}</h2>
            <p>{description || (lang === 'ar' ? 'مقهى دافئ في قلب المدينة يقدم قهوة مختصة وأطباق منزلية طازجة.' : 'A warm neighborhood café serving specialty coffee and fresh homemade food.')}</p>
            <Link to="/about" className="btn btn-outline">{lang === 'ar' ? 'اقرأ المزيد' : 'Read more'}</Link>
          </div>
        </div>
      </section>

      {reviews.length > 0 && (
        <section className="section">
          <div className="container">
            <h2 className="section-title">{t('home_reviews')}</h2>
            <div className="review-grid">
              {reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
            </div>
          </div>
        </section>
      )}

      {gallery.length > 0 && (
        <section className="section" style={{ background: 'var(--color-cream-dark)' }}>
          <div className="container">
            <h2 className="section-title">{t('home_gallery')}</h2>
            <GalleryGrid images={gallery} />
          </div>
        </section>
      )}

      <section className="section">
        <div className="container info-grid">
          <div className="card info-card">
            <div className="icon" aria-hidden="true">🕐</div>
            <h3>{lang === 'ar' ? 'أوقات العمل' : 'Opening hours'}</h3>
            <p>{workingHoursText || '—'}</p>
          </div>
          <div className="card info-card">
            <div className="icon" aria-hidden="true">📍</div>
            <h3>{lang === 'ar' ? 'الموقع' : 'Location'}</h3>
            <p>{address || '—'}</p>
          </div>
          <div className="card info-card">
            <div className="icon" aria-hidden="true">📞</div>
            <h3>{t('nav_contact')}</h3>
            <p>{cafeInfo?.phone || '—'}</p>
          </div>
        </div>
      </section>
    </>
  );
}
