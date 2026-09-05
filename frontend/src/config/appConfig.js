// Per-client frontend configuration (section 74/75 of MASTER PROMPT V2).
// This is what makes ONE reusable backend serve MANY client frontends: each
// frontend build points at its own business via VITE_BUSINESS_SLUG, and the
// backend resolves everything from the X-Business-Slug header this sends
// (see backend/src/middleware/tenant.js). To create a new client frontend,
// copy this file's defaults / set VITE_BUSINESS_SLUG at build time — no
// backend change required.
export const appConfig = {
  businessSlug: import.meta.env.VITE_BUSINESS_SLUG || 'luna-cafe',

  // Mirrors businesses.enabled_modules on the backend (section 75). The
  // backend is the source of truth (fetched via GET /api/business); this
  // local copy is only the pre-fetch default so the UI has something to
  // render before that request resolves.
  enabledModules: {
    ordering: true,
    reviews: true,
    gallery: true,
    bookings: false,
    tables: true,
    coupons: true,
  },
};
