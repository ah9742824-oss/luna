import {
  validateCart, createOrder, getOrderById, listMyOrders, listOrders, updateOrderStatus, updatePaymentStatus,
} from '../controllers/orderController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCustomerAuth, optionalCustomerAuth } from '../middleware/customerAuth.js';
import { requirePermission } from '../middleware/permissions.js';
import { rateLimit } from '../middleware/rateLimit.js';

export function registerOrderRoutes(router) {
  // Public / customer-optional (guest checkout is allowed by design).
  router.post('/api/cart/validate', optionalCustomerAuth, validateCart);
  router.post('/api/orders', rateLimit('RATE_LIMITER_ORDERS', { keyPrefix: 'order-create' }), optionalCustomerAuth, createOrder);
  // Ownership/guest-token check happens inside getOrderById itself: an order
  // is visible to its owning customer or to a caller with the correct
  // access_token. Admins use the separate /api/admin/orders/:id route below
  // (which properly gates on the orders.view permission) rather than this
  // public one, so this route intentionally does NOT run optionalAuth — an
  // admin token with a role that lacks orders.view (e.g. content_manager)
  // must not get a back door into arbitrary orders via the public path.
  router.get('/api/orders/:id', optionalCustomerAuth, getOrderById);

  // Customer-only.
  router.get('/api/customer/orders', requireCustomerAuth, listMyOrders);

  // Admin-only.
  router.get('/api/admin/orders', requireAuth, requirePermission('orders.view'), listOrders);
  router.get('/api/admin/orders/:id', requireAuth, requirePermission('orders.view'), getOrderById);
  router.patch('/api/admin/orders/:id/status', requireAuth, requirePermission('orders.manage'), updateOrderStatus);
  router.patch('/api/admin/orders/:id/payment-status', requireAuth, requirePermission('orders.manage'), updatePaymentStatus);
}
