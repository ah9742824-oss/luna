import { useEffect, useState } from 'react';
import { listAdminNotifications, markAdminNotificationRead } from '../../services/adminNotificationService.js';

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  function load() {
    listAdminNotifications().then(setNotifications).catch(() => {});
  }
  useEffect(() => {
    load();
    const interval = setInterval(load, 60000); // simple polling fallback (section 78)
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function handleOpen() {
    setOpen((o) => !o);
  }

  async function handleMarkRead(id) {
    try {
      await markAdminNotificationRead(id);
      load();
    } catch { /* non-critical UX action */ }
  }

  return (
    <div className="notifications-bell">
      <button type="button" className="cart-link" onClick={handleOpen} aria-label="الإشعارات">
        🔔{unreadCount > 0 && <span className="cart-badge">{unreadCount}</span>}
      </button>
      {open && (
        <div className="notifications-panel">
          {notifications.length === 0 ? (
            <p className="summary-note" style={{ padding: 12 }}>لا توجد إشعارات.</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`notification-item ${n.is_read ? '' : 'unread'}`} onClick={() => handleMarkRead(n.id)}>
                <strong>{n.title}</strong>
                <p>{n.message}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
