import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Toast from '../../components/Toast.jsx';

const emptyForm = { id: null, name: '', name_ar: '', slug: '', display_order: 0 };

export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [toast, setToast] = useState(null);

  function loadData() {
    setLoading(true);
    api.get('/categories').then(setCategories).catch((err) => setToast({ type: 'error', message: err.message })).finally(() => setLoading(false));
  }
  useEffect(loadData, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.id) {
        await api.put(`/categories/${form.id}`, form);
        setToast({ type: 'success', message: 'تم تحديث الفئة' });
      } else {
        await api.post('/categories', form);
        setToast({ type: 'success', message: 'تمت إضافة الفئة' });
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
      await api.del(`/categories/${confirmId}`);
      setToast({ type: 'success', message: 'تم حذف الفئة' });
      setConfirmId(null);
      loadData();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }

  return (
    <div>
      <div className="admin-topbar">
        <h1>الفئات</h1>
        <button className="btn btn-primary" onClick={() => setForm(emptyForm)}>+ إضافة فئة</button>
      </div>

      {loading ? <LoadingSpinner /> : categories.length === 0 ? (
        <div className="empty-state">لا توجد فئات بعد.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>الاسم بالعربية</th><th>الاسم بالإنجليزية</th><th>Slug</th><th>الترتيب</th><th>إجراءات</th></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>{c.name_ar}</td><td>{c.name}</td><td>{c.slug}</td><td>{c.display_order}</td>
                  <td className="table-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => setForm({ ...c })}>تعديل</button>
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
            <h3>{form.id ? 'تعديل فئة' : 'إضافة فئة'}</h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>الاسم بالعربية</label>
                <input className="form-control" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>الاسم بالإنجليزية</label>
                <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Slug (بالإنجليزية بدون مسافات)</label>
                <input className="form-control" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>ترتيب العرض</label>
                <input className="form-control" type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })} />
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
        title="حذف الفئة"
        message="سيتم حذف كل المنتجات المرتبطة بهذه الفئة أيضاً. هل تريد المتابعة؟"
        onConfirm={handleDelete}
        onCancel={() => setConfirmId(null)}
      />
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
