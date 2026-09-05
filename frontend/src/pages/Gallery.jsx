import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useDocumentHead } from '../hooks/useDocumentHead.js';
import GalleryGrid from '../components/GalleryGrid.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function Gallery() {
  const { t, lang } = useLanguage();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);

  useDocumentHead({ title: t('gallery_title') });

  useEffect(() => {
    api.get('/gallery').then(setImages).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <section className="section">
      <div className="container">
        <h1 className="section-title">{t('gallery_title')}</h1>
        <p className="section-subtitle">{lang === 'ar' ? 'لحظات من أجوائنا' : 'Moments from our space'}</p>
        {loading ? (
          <LoadingSpinner label={t('common_loading')} />
        ) : images.length === 0 ? (
          <div className="empty-state">{lang === 'ar' ? 'لا توجد صور حالياً.' : 'No photos yet.'}</div>
        ) : (
          <GalleryGrid images={images} />
        )}
      </div>
    </section>
  );
}
