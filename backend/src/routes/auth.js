import { login, me, myPermissions, forgotPassword, resetPassword } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

export function registerAuthRoutes(router) {
  router.post('/api/auth/login', rateLimit('RATE_LIMITER_LOGIN', { keyPrefix: 'admin-login' }), login);
  router.get('/api/auth/me', requireAuth, me);
  router.get('/api/auth/permissions', requireAuth, myPermissions);
  router.post('/api/auth/forgot-password', rateLimit('RATE_LIMITER_AUTH', { keyPrefix: 'admin-forgot-password' }), forgotPassword);
  router.post('/api/auth/reset-password', rateLimit('RATE_LIMITER_AUTH', { keyPrefix: 'admin-reset-password' }), resetPassword);
}
