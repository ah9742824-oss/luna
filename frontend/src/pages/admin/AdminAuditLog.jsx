import { useEffect, useState } from 'react';
import { listAuditLogs } from '../../services/auditLogService.js';
import LoadingSpinner from '../../components/LoadingSpinner.jsx';
import Toast from '../../components/Toast.jsx';

export default function AdminAuditLog() {
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 50, total: 0 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  function load(page = 1) {
    setLoading(true);
    listAuditLogs({ page, pageSize: meta.pageSize })
      .then(({ data, meta: m }) => { setLogs(data); setMeta(m); })
      .catch((err) => setToast({ type: 'error', message: err.message }))
      .finally(() => setLoading(false));
  }
  useEffect(() => load(1), []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));

  return (
    <div>
      <h1>سجل النشاطات</h1>
      {loading ? <LoadingSpinner /> : logs.length === 0 ? (
        <div className="empty-state"><p>لا توجد أنشطة مسجلة بعد.</p></div>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>التاريخ</th><th>المستخدم</th><th>الإجراء</th><th>النوع</th><th>التفاصيل</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleString('ar-EG')}</td>
                    <td>{l.profile_name || 'زائر/نظام'}</td>
                    <td>{l.action}</td>
                    <td>{l.resource_type} #{l.resource_id}</td>
                    <td><code style={{ fontSize: '.75rem' }}>{JSON.stringify(l.metadata)}</code></td>
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
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
