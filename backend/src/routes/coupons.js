import { listCoupons, createCoupon, updateCoupon, deleteCoupon, validateCouponCode } from '../controllers/couponController.js';
import { requireAuth } from '../middleware/auth.js';
import { optionalCustomerAuth } from '../middleware/customerAuth.js';
import { requirePermission } from '../middleware/permissions.js';
import { rateLimit } from '../middleware/rateLimit.js';

export function registerCouponRoutes(router) {
  // Rate-limited: without this, an attacker could brute-force guess valid
  // coupon codes by hammering this endpoint with random strings (section
  // 38 "Prevent coupon abuse").
  router.post('/api/coupons/validate', rateLimit('RATE_LIMITER_ORDERS', { keyPrefix: 'coupon-validate' }), optionalCustomerAuth, validateCouponCode);

  router.get('/api/admin/coupons', requireAuth, requirePermission('coupons.manage'), listCoupons);
  router.post('/api/admin/coupons', requireAuth, requirePermission('coupons.manage'), createCoupon);
  router.put('/api/admin/coupons/:id', requireAuth, requirePermission('coupons.manage'), updateCoupon);
  router.delete('/api/admin/coupons/:id', requireAuth, requirePermission('coupons.manage'), deleteCoupon);
}
