import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Toast from '../../components/Toast.jsx';

const emptyForm = { id: null, customer_name: '', rating: 5, comment: '', is_enabled: true };

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [toast, setToast] = useState(null);

  function loadData() {
    setLoading(true);
    api.get('/reviews?all=true').then(setReviews).catch((err) => setToast({ type: 'error', message: err.message })).finally(() => setLoading(false));
  }
  useEffect(loadData, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.id) {
        await api.put(`/reviews/${form.id}`, form);
        setToast({ type: 'success', message: 'تم تحديث التقييم' });
      } else {
        await api.post('/reviews', form);
        setToast({ type: 'success', message: 'تمت إضافة التقييم' });
      }
      setForm(null);
      loadData();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await api.del(`/reviews/${confirmId}`);
      setToast({ type: 'success', message: 'تم حذف التقييم' });
      setConfirmId(null);
      loadData();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }

  async function toggleEnabled(r) {
    try {
      await api.put(`/reviews/${r.id}`, { ...r, is_enabled: !r.is_enabled });
      loadData();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }

  return (
    <div>
      <div className="admin-topbar">
        <h1>التقييمات</h1>
        <button className="btn btn-primary" onClick={() => setForm(emptyForm)}>+ إضافة تقييم</button>
      </div>

      {loading ? <LoadingSpinner /> : reviews.length === 0 ? (
        <div className="empty-state">لا توجد تقييمات بعد.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>الاسم</th><th>التقييم</th><th>التعليق</th><th>الحالة</th><th>إجراءات</th></tr></thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td>{r.customer_name}</td>
                  <td>{'★'.repeat(r.rating)}</td>
                  <td style={{ maxWidth: 260 }}>{r.comment}</td>
                  <td>
                    <span className={`badge ${r.is_enabled ? 'badge-available' : 'badge-unavailable'}`} style={{ cursor: 'pointer' }} onClick={() => toggleEnabled(r)}>
                      {r.is_enabled ? 'مفعّل' : 'معطّل'}
                    </span>
                  </td>
                  <td className="table-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => setForm({ ...r })}>تعديل</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmId(r.id)}>حذف</button>
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
            <h3>{form.id ? 'تعديل تقييم' : 'إضافة تقييم'}</h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>اسم العميل</label>
                <input className="form-control" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>التقييم (١-٥)</label>
                <input className="form-control" type="number" min="1" max="5" value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} required />
              </div>
              <div className="form-group">
                <label>التعليق</label>
                <textarea className="form-control" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>
                  <input type="checkbox" checked={form.is_enabled} onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })} style={{ marginInlineEnd: 8 }} />
                  عرض على الموقع
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setForm(null)}>إلغاء</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmId}
        title="حذف التقييم"
        message="هل أنت متأكد من حذف هذا التقييم؟"
        onConfirm={handleDelete}
        onCancel={() => setConfirmId(null)}
      />
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
