import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function Footer({ cafeInfo }) {
  const { t, lang } = useLanguage();
  const name = lang === 'ar' ? (cafeInfo?.name_ar || 'لونا كافيه') : (cafeInfo?.name || 'LUNA Café');
  const description = lang === 'ar' ? cafeInfo?.description_ar : cafeInfo?.description;
  const address = lang === 'ar' ? cafeInfo?.address_ar : cafeInfo?.address;
  // Real field shapes from businesses.social_links / businesses.working_hours
  // (jsonb — see migration 0001), never the old single-column cafe_info names.
  const social = cafeInfo?.social_links || {};
  const workingHoursText = lang === 'ar' ? cafeInfo?.working_hours?.text_ar : cafeInfo?.working_hours?.text;

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <h4>{name}</h4>
            <p>{description}</p>
            <div className="social-row">
              {social.instagram && <a href={social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram">📷</a>}
              {social.facebook && <a href={social.facebook} target="_blank" rel="noreferrer" aria-label="Facebook">📘</a>}
              {social.twitter && <a href={social.twitter} target="_blank" rel="noreferrer" aria-label="Twitter">🐦</a>}
            </div>
          </div>
          <div>
            <h4>{lang === 'ar' ? 'روابط سريعة' : 'Quick links'}</h4>
            <p><Link to="/menu">{t('nav_menu')}</Link></p>
            <p><Link to="/about">{t('nav_about')}</Link></p>
            <p><Link to="/gallery">{t('nav_gallery')}</Link></p>
            <p><Link to="/contact">{t('nav_contact')}</Link></p>
          </div>
          <div>
            <h4>{t('nav_contact')}</h4>
            <p>{cafeInfo?.phone}</p>
            <p>{address}</p>
          </div>
          <div>
            <h4>{lang === 'ar' ? 'أوقات العمل' : 'Opening hours'}</h4>
            <p>{workingHoursText || '—'}</p>
          </div>
        </div>
        <div className="footer-bottom">
          © {new Date().getFullYear()} {name} — {lang === 'ar' ? 'جميع الحقوق محفوظة' : 'All rights reserved'}
        </div>
      </div>
    </footer>
  );
}
