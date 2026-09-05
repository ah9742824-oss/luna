import { getGallery, createGalleryImage, deleteGalleryImage } from '../controllers/galleryController.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

export function registerGalleryRoutes(router) {
  router.get('/api/gallery', getGallery);
  router.post('/api/gallery', requireAuth, requirePermission('gallery.manage'), createGalleryImage);
  router.delete('/api/gallery/:id', requireAuth, requirePermission('gallery.manage'), deleteGalleryImage);
}
