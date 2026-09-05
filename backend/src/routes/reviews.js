import {
  getReviews, createReview, updateReview, deleteReview,
} from '../controllers/reviewController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

export function registerReviewRoutes(router) {
  // Public by default; optionalAuth lets an authenticated admin pass ?all=true.
  router.get('/api/reviews', optionalAuth, getReviews);
  router.post('/api/reviews', requireAuth, requirePermission('reviews.manage'), createReview);
  router.put('/api/reviews/:id', requireAuth, requirePermission('reviews.manage'), updateReview);
  router.delete('/api/reviews/:id', requireAuth, requirePermission('reviews.manage'), deleteReview);
}
