import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { appConfig } from '../../config/appConfig.js';

// Real, working QR code generation (section 42) — rendered entirely
// client-side with the `qrcode` library, no backend round-trip needed since
// it's just encoding a URL. Initial implementation covers the one
// destination MASTER PROMPT V2 asks for at this stage: QR -> /menu.
//
// Kept ready for future QR types (table, business, campaign — section 43)
// without building them now: `target` is already a parameter, and a table
// QR would just be another target value encoding
// `${menuUrl}?table=<table_id>` instead of a hardcoded 'menu' string —
// no architectural change needed when that's actually requested.
export default function MenuQrCode() {
  const { lang } = useLanguage();
  const canvasRef = useRef(null);
  const [siteUrl, setSiteUrl] = useState(window.location.origin);
  const [error, setError] = useState('');

  const menuUrl = `${siteUrl.replace(/\/$/, '')}/menu?business=${encodeURIComponent(appConfig.businessSlug)}`;

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, menuUrl, { width: 220, margin: 2 }, (err) => {
      setError(err ? (lang === 'ar' ? 'تعذر إنشاء رمز QR.' : 'Could not generate the QR code.') : '');
    });
  }, [menuUrl, lang]);

  function handleDownloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'luna-menu-qr.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  async function handleDownloadSvg() {
    try {
      const svg = await QRCode.toString(menuUrl, { type: 'svg', margin: 2 });
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'luna-menu-qr.svg';
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(lang === 'ar' ? 'تعذر إنشاء رمز QR.' : 'Could not generate the QR code.');
    }
  }

  return (
    <div className="card checkout-section" style={{ maxWidth: 340 }}>
      <h3>{lang === 'ar' ? 'رمز QR للقائمة' : 'Menu QR code'}</h3>
      <p className="summary-note">
        {lang === 'ar'
          ? 'اطبع هذا الرمز على الطاولات أو المعلقات لتوجيه العملاء مباشرة لقائمتك.'
          : 'Print this on tables or signage to send customers straight to your menu.'}
      </p>
      <div className="form-group">
        <label htmlFor="qr-site-url">{lang === 'ar' ? 'رابط الموقع (للنشر الفعلي)' : 'Site URL (for the live deployment)'}</label>
        <input id="qr-site-url" className="form-control" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
      </div>
      {error && <div className="error-banner">{error}</div>}
      <canvas ref={canvasRef} role="img" aria-label={lang === 'ar' ? 'رمز QR لقائمة الطعام' : 'QR code linking to the menu'} />
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={handleDownloadPng}>PNG</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={handleDownloadSvg}>SVG</button>
      </div>
    </div>
  );
}
