import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useDocumentHead } from '../hooks/useDocumentHead.js';

export default function Contact() {
  const { cafeInfo } = useOutletContext();
  const { t, lang } = useLanguage();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sent, setSent] = useState(false);

  useDocumentHead({ title: t('contact_title') });

  const address = lang === 'ar' ? cafeInfo?.address_ar : cafeInfo?.address;
  const workingHoursText = lang === 'ar' ? cafeInfo?.working_hours?.text_ar : cafeInfo?.working_hours?.text;
  const mapsUrl = cafeInfo?.social_links?.google_maps;

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleSubmit(e) {
    e.preventDefault();
    // This form doesn't have a dedicated backend endpoint yet. It opens the
    // visitor's email client pre-filled with their message, which works
    // with zero extra backend setup on free hosting — a real action, not a
    // fake "message sent" confirmation with nothing behind it.
    const subject = encodeURIComponent(lang === 'ar' ? `رسالة من ${form.name}` : `Message from ${form.name}`);
    const body = encodeURIComponent(`${form.message}\n\n${lang === 'ar' ? 'من' : 'From'}: ${form.name} (${form.email})`);
    window.location.href = `mailto:${cafeInfo?.email || ''}?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <section className="section">
      <div className="container">
        <h1 className="section-title">{t('contact_title')}</h1>
        <p className="section-subtitle">{lang === 'ar' ? 'يسعدنا سماع رأيك' : "We'd love to hear from you"}</p>

        <div className="info-grid" style={{ marginBottom: 48 }}>
          <div className="card info-card">
            <div className="icon" aria-hidden="true">📞</div>
            <h3>{lang === 'ar' ? 'الهاتف' : 'Phone'}</h3>
            <p>{cafeInfo?.phone || '—'}</p>
          </div>
          <div className="card info-card">
            <div className="icon" aria-hidden="true">💬</div>
            <h3>WhatsApp</h3>
            {cafeInfo?.whatsapp ? (
              <a className="btn btn-primary btn-sm" href={`https://wa.me/${cafeInfo.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">
                {lang === 'ar' ? 'راسلنا الآن' : 'Message us'}
              </a>
            ) : <p>—</p>}
          </div>
          <div className="card info-card">
            <div className="icon" aria-hidden="true">📍</div>
            <h3>{lang === 'ar' ? 'العنوان' : 'Address'}</h3>
            <p>{address || '—'}</p>
          </div>
          <div className="card info-card">
            <div className="icon" aria-hidden="true">🕐</div>
            <h3>{lang === 'ar' ? 'أوقات العمل' : 'Opening hours'}</h3>
            <p>{workingHoursText || '—'}</p>
          </div>
        </div>

        {mapsUrl && (
          <div className="card" style={{ marginBottom: 48, overflow: 'hidden' }}>
            <iframe
              title={lang === 'ar' ? 'موقعنا على الخريطة' : 'Our location on the map'}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(address || '')}&output=embed`}
              width="100%"
              height="360"
              style={{ border: 0 }}
              loading="lazy"
            />
          </div>
        )}

        <div className="card" style={{ maxWidth: 560, margin: '0 auto', padding: 32 }}>
          <h3>{lang === 'ar' ? 'أرسل لنا رسالة' : 'Send us a message'}</h3>
          {sent && <div className="success-banner" role="status">{lang === 'ar' ? 'تم فتح تطبيق البريد لإرسال رسالتك!' : 'Your email app has been opened to send your message!'}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="contact-name">{lang === 'ar' ? 'الاسم' : 'Name'}</label>
              <input id="contact-name" className="form-control" name="name" value={form.name} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="contact-email">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
              <input id="contact-email" className="form-control" type="email" name="email" value={form.email} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="contact-message">{lang === 'ar' ? 'الرسالة' : 'Message'}</label>
              <textarea id="contact-message" className="form-control" name="message" value={form.message} onChange={handleChange} required />
            </div>
            <button className="btn btn-primary" type="submit" style={{ width: '100%' }}>{lang === 'ar' ? 'إرسال' : 'Send'}</button>
          </form>
        </div>
      </div>
    </section>
  );
}
