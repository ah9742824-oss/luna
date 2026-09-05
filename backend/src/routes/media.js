import { uploadMedia } from '../controllers/mediaController.js';
import { requireAuth } from '../middleware/auth.js';

// No requirePermission() here — mediaController.uploadMedia() checks the
// right permission itself once it knows `purpose` from the body (see that
// file's docstring). requireAuth still runs first so request.user exists.
export function registerMediaRoutes(router) {
  router.post('/api/admin/uploads', requireAuth, uploadMedia);
}
