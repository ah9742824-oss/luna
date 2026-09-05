import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { listRoles, listStaff, createStaff, updateStaff } from '../../services/staffService.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import Toast from '../../components/Toast.jsx';

const emptyForm = { id: null, name: '', email: '', role: '', password: '', is_active: true };

export default function AdminStaff() {
  const { user } = useAuth();
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState(null);

  function load() {
    setLoading(true);
    Promise.all([listStaff(), listRoles()])
      .then(([s, r]) => { setStaff(s); setRoles(r); })
      .catch((err) => setToast({ type: 'error', message: err.message }))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  function openCreate() { setForm({ ...emptyForm, role: roles[0]?.key || '' }); setFormError(''); }
  function openEdit(s) { setForm({ id: s.id, name: s.name, email: s.email, role: s.role, password: '', is_active: s.is_active }); setFormError(''); }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = { name: form.name, email: form.email, role: form.role, is_active: form.is_active };
      if (form.password) payload.password = form.password;
      if (form.id) await updateStaff(form.id, payload);
      else await createStaff({ ...payload, password: form.password });
      setForm(null);
      load();
      setToast({ type: 'success', message: 'تم حفظ بيانات الموظف.' });
    } catch (err) {
      setFormError(err.message || 'تعذر حفظ البيانات.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="admin-header-row">
        <h1>فريق العمل</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ إضافة موظف</button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الدور</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}{s.id === user?.id ? ' (أنت)' : ''}</td>
                  <td>{s.email}</td>
                  <td>{s.role_name_ar || s.role}</td>
                  <td><span className={`badge ${s.is_active ? 'badge-available' : 'badge-unavailable'}`}>{s.is_active ? 'نشط' : 'موقوف'}</span></td>
                  <td>
                    {s.id !== user?.id && <button className="btn btn-outline btn-sm" onClick={() => openEdit(s)}>تعديل</button>}
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
            <h2>{form.id ? 'تعديل موظف' : 'إضافة موظف جديد'}</h2>
            {formError && <div className="error-banner">{formError}</div>}
            <form onSubmit={handleSave}>
              <div className="form-group"><label>الاسم</label><input className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div className="form-group"><label>البريد الإلكتروني</label><input className="form-control" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
              <div className="form-group">
                <label>الدور</label>
                <select className="form-control" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {roles.map((r) => <option key={r.key} value={r.key}>{r.name_ar}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{form.id ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}</label>
                <input className="form-control" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!form.id} minLength={8} />
              </div>
              {form.id && (
                <div className="form-group"><label><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> حساب نشط</label></div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>إلغاء</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
