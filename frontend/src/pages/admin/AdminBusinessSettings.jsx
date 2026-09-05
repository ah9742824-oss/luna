import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import Toast from '../../components/Toast.jsx';
import ImageUploader from '../../components/admin/ImageUploader.jsx';
import MenuQrCode from '../../components/admin/MenuQrCode.jsx';

export default function AdminBusinessSettings() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/business').then((data) => setForm(data)).catch((err) => setError(err.message));
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.put('/business', form);
      setForm(updated);
      setToast({ type: 'success', message: 'تم حفظ إعدادات المتجر.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!form) return <LoadingSpinner />;

  const textFields = [
    ['name_ar', 'اسم المتجر (عربي)'],
    ['name', 'اسم المتجر (إنجليزي)'],
    ['description_ar', 'الوصف (عربي)', 'textarea'],
    ['description', 'الوصف (إنجليزي)', 'textarea'],
    ['phone', 'رقم الهاتف'],
    ['whatsapp', 'رقم واتساب (مع رمز الدولة، بدون +)'],
    ['email', 'البريد الإلكتروني'],
    ['address_ar', 'العنوان (عربي)'],
    ['address', 'العنوان (إنجليزي)'],
  ];

  return (
    <div>
      <h1>إعدادات المتجر</h1>

      <div className="card checkout-section" style={{ maxWidth: 720 }}>
        <form onSubmit={handleSave}>
          <h3>البيانات الأساسية</h3>
          {textFields.map(([key, label, type]) => (
            <div className="form-group" key={key}>
              <label>{label}</label>
              {type === 'textarea' ? (
                <textarea className="form-control" value={form[key] || ''} onChange={(e) => update(key, e.target.value)} />
              ) : (
                <input className="form-control" value={form[key] || ''} onChange={(e) => update(key, e.target.value)} />
              )}
            </div>
          ))}

          <ImageUploader purpose="business" label="الشعار (Logo)" value={form.logo_url} onChange={(url) => update('logo_url', url)} />
          <ImageUploader purpose="business" label="صورة الغلاف" value={form.cover_url} onChange={(url) => update('cover_url', url)} />

          <h3 style={{ marginTop: 28 }}>ساعات العمل</h3>
          <div className="form-group">
            <label>نص ساعات العمل (عربي)</label>
            <input
              className="form-control"
              value={form.working_hours?.text_ar || ''}
              onChange={(e) => update('working_hours', { ...(form.working_hours || {}), text_ar: e.target.value })}
              placeholder="مثال: يومياً من ٩ ص حتى ١١ م"
            />
          </div>
          <div className="form-group">
            <label>نص ساعات العمل (إنجليزي)</label>
            <input
              className="form-control"
              value={form.working_hours?.text || ''}
              onChange={(e) => update('working_hours', { ...(form.working_hours || {}), text: e.target.value })}
              placeholder="e.g. Daily 9am - 11pm"
            />
          </div>

          <h3 style={{ marginTop: 28 }}>إعدادات الطلبات (القسم 68/70 من المواصفة)</h3>
          <div className="form-group">
            <label><input type="checkbox" checked={form.accept_orders !== false} onChange={(e) => update('accept_orders', e.target.checked)} /> استقبال الطلبات مفعّل</label>
          </div>
          <div className="form-group">
            <label><input type="checkbox" checked={form.accept_pickup !== false} onChange={(e) => update('accept_pickup', e.target.checked)} /> السماح بالاستلام من الفرع</label>
          </div>
          <div className="form-group">
            <label><input type="checkbox" checked={form.accept_delivery !== false} onChange={(e) => update('accept_delivery', e.target.checked)} /> السماح بالتوصيل</label>
          </div>
          <div className="form-group">
            <label><input type="checkbox" checked={form.accept_dine_in !== false} onChange={(e) => update('accept_dine_in', e.target.checked)} /> السماح بالتناول داخل المتجر</label>
          </div>
          <div className="form-group">
            <label>رسوم التوصيل</label>
            <input className="form-control" type="number" min="0" step="0.01" value={form.delivery_fee ?? 0} onChange={(e) => update('delivery_fee', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label>الحد الأدنى لطلب التوصيل</label>
            <input className="form-control" type="number" min="0" step="0.01" value={form.minimum_order_amount ?? 0} onChange={(e) => update('minimum_order_amount', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label>نسبة الضريبة (%)</label>
            <input className="form-control" type="number" min="0" max="100" step="0.01" value={form.tax_rate_percent ?? 0} onChange={(e) => update('tax_rate_percent', Number(e.target.value))} />
          </div>

          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</button>
        </form>
      </div>

      <MenuQrCode />

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
