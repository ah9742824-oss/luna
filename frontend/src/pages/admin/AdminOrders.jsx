import { useEffect, useState } from 'react';
import { listOrders, getOrder, updateOrderStatus, updatePaymentStatus, getInvoice } from '../../services/adminOrderService.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import Toast from '../../components/Toast.jsx';

// Exactly the statuses that exist in the backend state machine
// (backend/src/services/orderStatus.js) — nothing invented here. The
// backend re-validates every transition regardless of which one is picked
// here (section 16: hiding/limiting UI options is not the security boundary).
const STATUSES = ['new', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];
const STATUS_LABELS = {
  new: 'جديد', accepted: 'مقبول', preparing: 'قيد التحضير', ready: 'جاهز',
  out_for_delivery: 'في الطريق', delivered: 'تم التسليم', completed: 'مكتمل', cancelled: 'ملغي',
};
const PAYMENT_STATUS_LABELS = { unpaid: 'غير مدفوع', paid: 'مدفوع', failed: 'فشل', refunded: 'مسترد' };

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [selected, setSelected] = useState(null);
  const [invoice, setInvoice] = useState(null);

  function load(page = 1) {
    setLoading(true);
    const params = { page, pageSize: meta.pageSize };
    if (statusFilter) params.status = statusFilter;
    listOrders(params)
      .then(({ data, meta: m }) => { setOrders(data); setMeta(m); })
      .catch((err) => setToast({ type: 'error', message: err.message }))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(1); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openOrder(id) {
    setInvoice(null);
    try {
      const order = await getOrder(id);
      setSelected(order);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }

  async function handleStatusChange(newStatus) {
    try {
      const updated = await updateOrderStatus(selected.id, newStatus);
      setSelected(updated);
      setToast({ type: 'success', message: 'تم تحديث حالة الطلب.' });
      load(meta.page);
    } catch (err) {
      // Real backend rejection (e.g. an invalid transition) surfaces as-is.
      setToast({ type: 'error', message: err.message });
    }
  }

  async function handlePaymentStatusChange(newStatus) {
    try {
      const updated = await updatePaymentStatus(selected.id, newStatus);
      setSelected(updated);
      setToast({ type: 'success', message: 'تم تحديث حالة الدفع.' });
      load(meta.page);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }

  async function handleViewInvoice() {
    try {
      const inv = await getInvoice(selected.id);
      setInvoice(inv);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  }

  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));

  return (
    <div>
      <h1>إدارة الطلبات</h1>

      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <button className={`filter-chip ${statusFilter === '' ? 'active' : ''}`} onClick={() => setStatusFilter('')}>الكل</button>
        {STATUSES.map((s) => (
          <button key={s} className={`filter-chip ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : orders.length === 0 ? (
        <div className="empty-state"><p>لا توجد طلبات {statusFilter ? `بحالة "${STATUS_LABELS[statusFilter]}"` : ''}.</p></div>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>النوع</th><th>الحالة</th><th>الدفع</th><th>الإجمالي</th><th></th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.order_number}</td>
                    <td>{new Date(o.created_at).toLocaleString('ar-EG')}</td>
                    <td>{o.order_type}</td>
                    <td><span className={`badge ${o.status === 'cancelled' ? 'badge-unavailable' : 'badge-available'}`}>{STATUS_LABELS[o.status] || o.status}</span></td>
                    <td>{PAYMENT_STATUS_LABELS[o.payment_status] || o.payment_status}</td>
                    <td>{Number(o.total).toFixed(2)} ₪</td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => openOrder(o.id)}>التفاصيل</button></td>
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
            <h2>طلب رقم {selected.order_number}</h2>
            {selected.items.map((item) => (
              <div key={item.id} className="summary-row"><span>{item.product_name_ar_snapshot} × {item.quantity}</span><span>{Number(item.subtotal).toFixed(2)} ₪</span></div>
            ))}
            <div className="summary-row summary-total"><span>الإجمالي</span><span>{Number(selected.total).toFixed(2)} ₪</span></div>

            <div className="form-group">
              <label>حالة الطلب</label>
              <select className="form-control" value={selected.status} onChange={(e) => handleStatusChange(e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>حالة الدفع</label>
              <select className="form-control" value={selected.payment_status} onChange={(e) => handlePaymentStatusChange(e.target.value)}>
                {Object.keys(PAYMENT_STATUS_LABELS).map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>)}
              </select>
            </div>

            {invoice ? (
              <div className="card" style={{ padding: 16, marginTop: 12 }}>
                <h3>الفاتورة {invoice.invoice_number}</h3>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '.8rem' }}>{JSON.stringify(invoice.snapshot, null, 2)}</pre>
              </div>
            ) : (
              <button type="button" className="btn btn-outline btn-sm" onClick={handleViewInvoice}>عرض الفاتورة</button>
            )}

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
