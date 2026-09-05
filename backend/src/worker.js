// LUNA Cafe API — Cloudflare Worker entry point.
// Replaces the old Express src/server.js: no app.listen(), no persistent
// process — every request is handled fresh through the fetch() handler below.
import { Router } from 'itty-router';
import { json } from './utils/http.js';
import { errorResponse, notFoundResponse } from './middleware/errorHandler.js';
import { withCors, handlePreflight } from './middleware/cors.js';
import { resolveTenant } from './middleware/tenant.js';

import { registerAuthRoutes } from './routes/auth.js';
import { registerProductRoutes } from './routes/products.js';
import { registerCategoryRoutes } from './routes/categories.js';
import { registerReviewRoutes } from './routes/reviews.js';
import { registerBusinessRoutes } from './routes/business.js';
import { registerGalleryRoutes } from './routes/gallery.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerCouponRoutes } from './routes/coupons.js';
import { registerCustomerRoutes } from './routes/customers.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerStaffRoutes } from './routes/staff.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerPaymentRoutes, handlePaymentWebhook } from './routes/payments.js';

const router = Router();

// Health checks — intentionally do not touch the database (and skip tenant
// resolution entirely), so they keep working even if Hyperdrive/Supabase or
// a specific business row is briefly unavailable.
router.get('/healthz', () => json({ status: 'ok' }));
router.get('/api/health', () => json({ status: 'ok' }));

// Payment provider webhook (section 36) — registered BEFORE tenant
// resolution, deliberately. An external provider's servers call this URL
// directly and send no X-Business-Slug header (they have no concept of
// it); resolveTenant would reject every webhook delivery with
// BUSINESS_NOT_SPECIFIED before the handler ever ran. handlePaymentWebhook
// resolves the business itself, from the payment reference embedded in the
// (signature-verified) payload — see paymentController.js.
router.post('/api/payments/webhook/:provider', handlePaymentWebhook);

// Multi-tenant resolution (section 8): runs for every remaining request,
// BEFORE any route handler, and populates request.business. itty-router
// keeps evaluating further route registrations as long as a handler does
// not return a Response, so this acts as global "before" middleware for
// everything registered after it.
router.all('*', resolveTenant);

registerAuthRoutes(router);
registerProductRoutes(router);
registerCategoryRoutes(router);
registerReviewRoutes(router);
registerBusinessRoutes(router);
registerGalleryRoutes(router);
registerStatsRoutes(router);
registerOrderRoutes(router);
registerCouponRoutes(router);
registerCustomerRoutes(router);
registerAdminRoutes(router);
registerStaffRoutes(router);
registerMediaRoutes(router);
registerPaymentRoutes(router);

router.all('*', () => notFoundResponse());

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return handlePreflight(env, request);
    }

    try {
      const response = await router.handle(request, env, ctx);
      return withCors(response, env, request);
    } catch (err) {
      return withCors(errorResponse(err), env, request);
    }
  },
};
