import {
  register, login, me, updateMe, listAddresses, createAddress, updateAddress, deleteAddress, forgotPassword, resetPassword,
} from '../controllers/customerController.js';
import { listCustomerNotifications, markCustomerNotificationRead } from '../controllers/adminController.js';
import { requireCustomerAuth } from '../middleware/customerAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';

export function registerCustomerRoutes(router) {
  router.post('/api/customers/register', rateLimit('RATE_LIMITER_AUTH', { keyPrefix: 'customer-register' }), register);
  router.post('/api/customers/login', rateLimit('RATE_LIMITER_AUTH', { keyPrefix: 'customer-login' }), login);
  router.post('/api/customers/forgot-password', rateLimit('RATE_LIMITER_AUTH', { keyPrefix: 'customer-forgot-password' }), forgotPassword);
  router.post('/api/customers/reset-password', rateLimit('RATE_LIMITER_AUTH', { keyPrefix: 'customer-reset-password' }), resetPassword);
  router.get('/api/customers/me', requireCustomerAuth, me);
  router.put('/api/customers/me', requireCustomerAuth, updateMe);

  router.get('/api/customers/me/addresses', requireCustomerAuth, listAddresses);
  router.post('/api/customers/me/addresses', requireCustomerAuth, createAddress);
  router.put('/api/customers/me/addresses/:id', requireCustomerAuth, updateAddress);
  router.delete('/api/customers/me/addresses/:id', requireCustomerAuth, deleteAddress);

  router.get('/api/customer/notifications', requireCustomerAuth, listCustomerNotifications);
  router.patch('/api/customer/notifications/:id/read', requireCustomerAuth, markCustomerNotificationRead);
}
