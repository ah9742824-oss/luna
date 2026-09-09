import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Toast from '../../components/Toast.jsx';
import ImageUploader from '../../components/admin/ImageUploader.jsx';

const emptyForm = {
  id: null, category_id: '', name: '', name_ar: '', description: '', description_ar: '',
  price: '', image_url: '', is_available: true,
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null = form closed
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [toast, setToast] = useState(null);

  function loadData() {
    setLoading(true);
    Promise.all([api.get('/products'), api.get('/categories')])
      .then(([p, c]) => { setProducts(p); setCategories(c); })
      .catch((err) => setToast({ type: 'error', message: err.message }))
      .finally(() => setLoading(false));
  }

  useEffect(loadData, []);

  function openCreate() {
    setForm({ ...emptyForm, category_id: categories[0]?.id || '' });
  }
  function openEdit(p) {
    setForm({ ...p });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.id) {
        await api.put(`/products/${form.id}`, form);
        setToast({ type: 'success', message: 'تم تحديث المنتج بنجاح' });
      } else {
        await api.post('/products', form);
        setToast({ type: 'success', message: 'تمت إضافة المنتج بنجاح' });
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
      await api.del(`/products/${confirmId}`);
      setToast({ type: 'success', message: 'تم حذف المنتج' });
      setConfirmId(null);
      loadData();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }

  return (
    <div>
      <div className="admin-topbar">
        <h1>المنتجات</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ إضافة منتج</button>
      </div>

      {loading ? <LoadingSpinner /> : products.length === 0 ? (
        <div className="empty-state">لا توجد منتجات بعد. أضف أول منتج.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>صورة</th><th>الاسم</th><th>الفئة</th><th>السعر</th><th>الحالة</th><th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td><img src={p.image_url} alt={p.name_ar} /></td>
                  <td>{p.name_ar}</td>
                  <td>{p.category_name_ar}</td>
                  <td>{Number(p.price).toFixed(2)} ₪</td>
                  <td>
                    <span className={`badge ${p.is_available ? 'badge-available' : 'badge-unavailable'}`}>
                      {p.is_available ? 'متوفر' : 'غير متوفر'}
                    </span>
                  </td>
                  <td className="table-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(p)}>تعديل</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmId(p.id)}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3>{form.id ? 'تعديل منتج' : 'إضافة منتج'}</h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>الفئة</label>
                <select className="form-control" value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })} required>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>الاسم بالعربية</label>
                <input className="form-control" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>الاسم بالإنجليزية</label>
                <input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>الوصف بالعربية</label>
                <textarea className="form-control" value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} />
              </div>
              <div className="form-group">
                <label>السعر</label>
                <input className="form-control" type="number" step="0.01" min="0" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
            <ImageUploader
  purpose="product"
  label="صورة المنتج"
  value={form.image_url}
  onChange={(url) => setForm({ ...form, image_url: url })}
/>
              <div className="form-group">
                <label>
                  <input type="checkbox" checked={form.is_available}
                    onChange={(e) => setForm({ ...form, is_available: e.target.checked })} style={{ marginInlineEnd: 8 }} />
                  متوفر حالياً
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
        title="حذف المنتج"
        message="هل أنت متأكد من حذف هذا المنتج؟ لا يمكن التراجع عن هذا الإجراء."
        onConfirm={handleDelete}
        onCancel={() => setConfirmId(null)}
      />
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
