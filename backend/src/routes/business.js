import { getBusinessInfo, updateBusinessInfo } from '../controllers/businessController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

export function registerBusinessRoutes(router) {
  router.get('/api/business', getBusinessInfo);
  router.put('/api/business', requireAuth, requirePermission('business.manage'), updateBusinessInfo);

  // Back-compat alias for the original single-tenant path. Remove once the
  // frontend fully switches to /api/business (tracked for Phase 5).
  router.get('/api/cafe', getBusinessInfo);
  router.put('/api/cafe', requireAuth, requirePermission('business.manage'), updateBusinessInfo);
}
