import {
  getGallery,
  getAdminGallery,
  createGalleryImage,
  updateGalleryVisibility,
  reorderGallery,
  deleteGalleryImage,
} from '../controllers/galleryController.js';

import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

export function registerGalleryRoutes(router) {
  // Public gallery — returns visible images only
  router.get('/api/gallery', getGallery);

  // Admin gallery — returns all images, including hidden ones
  router.get(
    '/api/admin/gallery',
    requireAuth,
    requirePermission('gallery.manage'),
    getAdminGallery
  );

  // Add image
  router.post(
    '/api/gallery',
    requireAuth,
    requirePermission('gallery.manage'),
    createGalleryImage
  );

  // Hide / show image
  router.patch(
    '/api/gallery/:id/visibility',
    requireAuth,
    requirePermission('gallery.manage'),
    updateGalleryVisibility
  );

  // Reorder images
  router.post(
    '/api/gallery/reorder',
    requireAuth,
    requirePermission('gallery.manage'),
    reorderGallery
  );

  // Delete image
  router.delete(
    '/api/gallery/:id',
    requireAuth,
    requirePermission('gallery.manage'),
    deleteGalleryImage
  );
}
