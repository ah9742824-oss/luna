import { initiateOnlinePayment, handlePaymentWebhook } from '../controllers/paymentController.js';
import { optionalAuth } from '../middleware/auth.js';
import { optionalCustomerAuth } from '../middleware/customerAuth.js';

// Only the "initiate payment" route goes through normal tenant resolution
// (registered here, alongside every other business route). The webhook
// route is registered separately in worker.js, BEFORE tenant resolution —
// see that file's comment for why (an external provider sends no
// X-Business-Slug header).
export function registerPaymentRoutes(router) {
  router.post('/api/orders/:id/pay/online', optionalAuth, optionalCustomerAuth, initiateOnlinePayment);
}

export { handlePaymentWebhook };
