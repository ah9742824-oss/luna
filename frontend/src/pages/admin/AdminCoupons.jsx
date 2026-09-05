import { useEffect, useState } from 'react';
import { listCoupons, createCoupon, updateCoupon, deleteCoupon } from '../../services/couponAdminService.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Toast from '../../components/Toast.jsx';

const emptyForm = {
  id: null, code: '', type: 'percentage', value: '', minimum_order_amount: 0,
  maximum_discount_amount: '', usage_limit: '', expires_at: '', is_active: true,
};

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [toast, setToast] = useState(null);
  const [formError, setFormError] = useState('');

  function load() {
    setLoading(true);
    listCoupons().then(setCoupons).catch((err) => setToast({ type: 'error', message: err.message })).finally(() => setLoading(false));
  }
  useEffect(load, []);

  function openCreate() { setForm({ ...emptyForm }); setFormError(''); }
  function openEdit(c) {
    setForm({
      ...c, value: c.value, minimum_order_amount: c.minimum_order_amount,
      maximum_discount_amount: c.maximum_discount_amount ?? '', usage_limit: c.usage_limit ?? '',
      expires_at: c.expires_at ? c.expires_at.slice(0, 10) : '',
    });
    setFormError('');
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        code: form.code, type: form.type, value: Number(form.value),
        minimum_order_amount: Number(form.minimum_order_amount) || 0,
        maximum_discount_amount: form.maximum_discount_amount === '' ? null : Number(form.maximum_discount_amount),
        usage_limit: form.usage_limit === '' ? null : Number(form.usage_limit),
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        is_active: form.is_active,
      };
      if (form.id) await updateCoupon(form.id, payload);
      else await createCoupon(payload);
      setForm(null);
      load();
      setToast({ type: 'success', message: 'تم حفظ الكوبون.' });
    } catch (err) {
      setFormError(err.message || 'تعذر حفظ الكوبون.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteCoupon(confirmId);
      setConfirmId(null);
      load();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }

  return (
    <div>
      <div className="admin-header-row">
        <h1>الكوبونات</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ كوبون جديد</button>
      </div>

      {loading ? <LoadingSpinner /> : coupons.length === 0 ? (
        <div className="empty-state"><p>لا توجد كوبونات بعد.</p></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>الكود</th><th>النوع</th><th>القيمة</th><th>الحد الأدنى</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>{c.type === 'percentage' ? 'نسبة مئوية' : 'مبلغ ثابت'}</td>
                  <td>{c.value}{c.type === 'percentage' ? '%' : ' ₪'}</td>
                  <td>{c.minimum_order_amount} ₪</td>
                  <td><span className={`badge ${c.is_active ? 'badge-available' : 'badge-unavailable'}`}>{c.is_active ? 'مفعّل' : 'موقوف'}</span></td>
                  <td className="table-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(c)}>تعديل</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmId(c.id)}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? 'تعديل الكوبون' : 'كوبون جديد'}</h2>
            {formError && <div className="error-banner">{formError}</div>}
            <form onSubmit={handleSave}>
              <div className="form-group"><label>الكود</label><input className="form-control" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required /></div>
              <div className="form-group">
                <label>النوع</label>
                <select className="form-control" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="percentage">نسبة مئوية</option>
                  <option value="fixed_amount">مبلغ ثابت</option>
                </select>
              </div>
              <div className="form-group"><label>القيمة</label><input className="form-control" type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required /></div>
              <div className="form-group"><label>الحد الأدنى للطلب</label><input className="form-control" type="number" min="0" step="0.01" value={form.minimum_order_amount} onChange={(e) => setForm({ ...form, minimum_order_amount: e.target.value })} /></div>
              {form.type === 'percentage' && (
                <div className="form-group"><label>أقصى قيمة خصم (اختياري)</label><input className="form-control" type="number" min="0" step="0.01" value={form.maximum_discount_amount} onChange={(e) => setForm({ ...form, maximum_discount_amount: e.target.value })} /></div>
              )}
              <div className="form-group"><label>عدد مرات الاستخدام المسموحة (اختياري)</label><input className="form-control" type="number" min="1" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} /></div>
              <div className="form-group"><label>تاريخ الانتهاء (اختياري)</label><input className="form-control" type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></div>
              <div className="form-group"><label><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> مفعّل</label></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>إلغاء</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!confirmId} title="حذف الكوبون" message="هل تريد حذف هذا الكوبون؟" onConfirm={handleDelete} onCancel={() => setConfirmId(null)} />
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
