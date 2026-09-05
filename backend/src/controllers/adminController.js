// Miscellaneous admin-only read endpoints that don't warrant their own file:
// customer directory (section 48), invoices (section 37), notifications
// (section 49), and the audit log (section 58). All business-scoped and
// read-heavy — no pricing/security logic lives here.
import { query } from '../config/db.js';
import { json, HttpError } from '../utils/http.js';
import { isPositiveInteger } from '../utils/validate.js';

// GET /api/admin/customers — directory with order-count/spend summary
// (section 48). Respects privacy: no password_hash, ever.
export async function listCustomers(request, env) {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));
  const offset = (page - 1) * pageSize;

  const countResult = await query(env, 'SELECT COUNT(*)::int AS n FROM customers WHERE business_id = $1', [request.business.id]);
  const result = await query(
    env,
    `SELECT c.id, c.name, c.email, c.phone, c.is_active, c.created_at,
            COUNT(o.id)::int AS total_orders,
            COALESCE(SUM(o.total) FILTER (WHERE o.status = 'completed'), 0) AS total_spent
     FROM customers c
     LEFT JOIN orders o ON o.customer_id = c.id AND o.business_id = c.business_id
     WHERE c.business_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC
     LIMIT $2 OFFSET $3`,
    [request.business.id, pageSize, offset]
  );
  return json({ success: true, data: result.rows, meta: { page, pageSize, total: countResult.rows[0].n } });
}

// GET /api/admin/customers/:id
export async function getCustomerById(request, env) {
  const { id } = request.params;
  if (!isPositiveInteger(id)) throw new HttpError(400, 'Invalid customer id.');
  const customerResult = await query(
    env,
    'SELECT id, name, email, phone, is_active, created_at FROM customers WHERE id = $1 AND business_id = $2',
    [id, request.business.id]
  );
  if (customerResult.rows.length === 0) throw new HttpError(404, 'Customer not found.');

  const ordersResult = await query(
    env,
    'SELECT id, order_number, status, total, created_at FROM orders WHERE customer_id = $1 AND business_id = $2 ORDER BY created_at DESC',
    [id, request.business.id]
  );
  const addressesResult = await query(env, 'SELECT * FROM customer_addresses WHERE customer_id = $1 AND business_id = $2', [id, request.business.id]);

  return json({ success: true, data: { ...customerResult.rows[0], orders: ordersResult.rows, addresses: addressesResult.rows } });
}

// GET /api/admin/invoices/:orderId
export async function getInvoiceByOrder(request, env) {
  const { orderId } = request.params;
  if (!isPositiveInteger(orderId)) throw new HttpError(400, 'Invalid order id.');
  const result = await query(env, 'SELECT * FROM invoices WHERE order_id = $1 AND business_id = $2', [orderId, request.business.id]);
  if (result.rows.length === 0) throw new HttpError(404, 'Invoice not found.');
  return json({ success: true, data: result.rows[0] });
}

// GET /api/admin/notifications — business-wide admin notifications
// (customer_id IS NULL rows only; customer-targeted notifications are
// served separately via /api/customer/notifications).
export async function listAdminNotifications(request, env) {
  const result = await query(
    env,
    'SELECT * FROM notifications WHERE business_id = $1 AND customer_id IS NULL ORDER BY created_at DESC LIMIT 50',
    [request.business.id]
  );
  return json({ success: true, data: result.rows });
}

// PATCH /api/admin/notifications/:id/read
export async function markAdminNotificationRead(request, env) {
  const { id } = request.params;
  const result = await query(
    env,
    'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND business_id = $2 AND customer_id IS NULL RETURNING *',
    [id, request.business.id]
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Notification not found.');
  return json({ success: true, data: result.rows[0] });
}

// GET /api/customer/notifications
export async function listCustomerNotifications(request, env) {
  const result = await query(
    env,
    'SELECT * FROM notifications WHERE business_id = $1 AND customer_id = $2 ORDER BY created_at DESC LIMIT 50',
    [request.business.id, request.customer.id]
  );
  return json({ success: true, data: result.rows });
}

// PATCH /api/customer/notifications/:id/read
export async function markCustomerNotificationRead(request, env) {
  const { id } = request.params;
  const result = await query(
    env,
    'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND business_id = $2 AND customer_id = $3 RETURNING *',
    [id, request.business.id, request.customer.id]
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Notification not found.');
  return json({ success: true, data: result.rows[0] });
}

// GET /api/admin/audit-logs — section 58, gated by the audit_log.view
// permission (already seeded in migration 0001).
export async function listAuditLogs(request, env) {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10) || 50));
  const offset = (page - 1) * pageSize;

  const countResult = await query(env, 'SELECT COUNT(*)::int AS n FROM audit_logs WHERE business_id = $1', [request.business.id]);
  const result = await query(
    env,
    `SELECT al.*, p.name AS profile_name FROM audit_logs al
     LEFT JOIN profiles p ON p.id = al.profile_id
     WHERE al.business_id = $1 ORDER BY al.created_at DESC LIMIT $2 OFFSET $3`,
    [request.business.id, pageSize, offset]
  );
  return json({ success: true, data: result.rows, meta: { page, pageSize, total: countResult.rows[0].n } });
}
