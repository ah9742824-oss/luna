import { listRoles, listStaff, createStaff, updateStaff } from '../controllers/staffController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

export function registerStaffRoutes(router) {
  router.get('/api/admin/roles', requireAuth, listRoles);
  router.get('/api/admin/staff', requireAuth, requirePermission('staff.manage'), listStaff);
  router.post('/api/admin/staff', requireAuth, requirePermission('staff.manage'), createStaff);
  router.put('/api/admin/staff/:id', requireAuth, requirePermission('staff.manage'), updateStaff);
}
