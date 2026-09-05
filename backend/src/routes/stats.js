import { getStats } from '../controllers/statsController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

export function registerStatsRoutes(router) {
  router.get('/api/stats', requireAuth, requirePermission('statistics.view'), getStats);
}
