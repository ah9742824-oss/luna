// Misc admin-only read routes: customer directory, invoices, business-wide
// notifications, and the audit log. See controllers/adminController.js.
import {
  listCustomers, getCustomerById, getInvoiceByOrder, listAdminNotifications, markAdminNotificationRead, listAuditLogs,
} from '../controllers/adminController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

export function registerAdminRoutes(router) {
  router.get('/api/admin/customers', requireAuth, requirePermission('customers.view'), listCustomers);
  router.get('/api/admin/customers/:id', requireAuth, requirePermission('customers.view'), getCustomerById);

  router.get('/api/admin/invoices/:orderId', requireAuth, requirePermission('invoices.view'), getInvoiceByOrder);

  router.get('/api/admin/notifications', requireAuth, listAdminNotifications);
  router.patch('/api/admin/notifications/:id/read', requireAuth, markAdminNotificationRead);

  router.get('/api/admin/audit-logs', requireAuth, requirePermission('audit_log.view'), listAuditLogs);
}
