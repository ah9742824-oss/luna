import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import Footer from '../components/Footer.jsx';
import { api } from '../services/api.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useDocumentHead } from '../hooks/useDocumentHead.js';

export default function PublicLayout() {
  const [cafeInfo, setCafeInfo] = useState(null);
  const { lang } = useLanguage();

  useEffect(() => {
    api.get('/cafe').then(setCafeInfo).catch(() => {});
  }, []);

  const name = lang === 'ar' ? cafeInfo?.name_ar : cafeInfo?.name;
  const description = lang === 'ar' ? cafeInfo?.description_ar : cafeInfo?.description;

  // Site-wide default head tags (section 64) — individual pages call
  // useDocumentHead again with their own title/description to override
  // this default for that page specifically.
  useDocumentHead({ title: name, description, image: cafeInfo?.cover_url || cafeInfo?.logo_url });

  // Structured data (section 64) — built entirely from real business data
  // returned by the API, never hard-coded Luna-specific info.
  useEffect(() => {
    if (!cafeInfo) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'business-structured-data';
    document.getElementById('business-structured-data')?.remove();
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: cafeInfo.name_ar || cafeInfo.name,
      image: cafeInfo.logo_url || undefined,
      telephone: cafeInfo.phone || undefined,
      address: cafeInfo.address_ar || cafeInfo.address || undefined,
    });
    document.head.appendChild(script);
    return () => document.getElementById('business-structured-data')?.remove();
  }, [cafeInfo]);

  return (
    <>
      <Navbar cafeInfo={cafeInfo} />
      <main id="main-content">
        <Outlet context={{ cafeInfo }} />
      </main>
      <Footer cafeInfo={cafeInfo} />
      {cafeInfo?.whatsapp && (
        <a
          className="whatsapp-float"
          href={`https://wa.me/${cafeInfo.whatsapp.replace(/[^0-9]/g, '')}`}
          target="_blank"
          rel="noreferrer"
          aria-label={lang === 'ar' ? 'تواصل عبر واتساب' : 'Chat on WhatsApp'}
        >
          💬
        </a>
      )}
    </>
  );
}
