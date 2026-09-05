import { useEffect, useState } from 'react';
import { listCustomers, getCustomer } from '../../services/adminCustomerService.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import Toast from '../../components/Toast.jsx';

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);

  function load(page = 1) {
    setLoading(true);
    listCustomers({ page, pageSize: meta.pageSize })
      .then(({ data, meta: m }) => { setCustomers(data); setMeta(m); })
      .catch((err) => setToast({ type: 'error', message: err.message }))
      .finally(() => setLoading(false));
  }
  useEffect(() => load(1), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function openCustomer(id) {
    try {
      setSelected(await getCustomer(id));
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }

  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));

  return (
    <div>
      <h1>العملاء</h1>
      {loading ? <LoadingSpinner /> : customers.length === 0 ? (
        <div className="empty-state"><p>لا يوجد عملاء مسجلون بعد.</p></div>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>الاسم</th><th>الهاتف</th><th>البريد الإلكتروني</th><th>عدد الطلبات</th><th>إجمالي الإنفاق</th><th></th></tr></thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.total_orders}</td>
                    <td>{Number(c.total_spent).toFixed(2)} ₪</td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => openCustomer(c.id)}>التفاصيل</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button className="btn btn-outline btn-sm" disabled={meta.page <= 1} onClick={() => load(meta.page - 1)}>السابق</button>
            <span>صفحة {meta.page} من {totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={meta.page >= totalPages} onClick={() => load(meta.page + 1)}>التالي</button>
          </div>
        </>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal-box" style={{ maxWidth: 600, textAlign: 'start' }} onClick={(e) => e.stopPropagation()}>
            <h2>{selected.name}</h2>
            <p>{selected.phone} — {selected.email || 'لا يوجد بريد إلكتروني'}</p>

            <h3>العناوين</h3>
            {selected.addresses.length === 0 ? <p className="summary-note">لا توجد عناوين محفوظة.</p> : selected.addresses.map((a) => (
              <div key={a.id} className="summary-row"><span>{a.address_line}</span></div>
            ))}

            <h3 style={{ marginTop: 16 }}>الطلبات</h3>
            {selected.orders.length === 0 ? <p className="summary-note">لا توجد طلبات بعد.</p> : selected.orders.map((o) => (
              <div key={o.id} className="summary-row"><span>{o.order_number} — {o.status}</span><span>{Number(o.total).toFixed(2)} ₪</span></div>
            ))}

            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setSelected(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
