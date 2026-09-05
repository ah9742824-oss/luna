// Rate limiting (section 98: "Login, Register, Password reset, Review
// submission, Order creation, Public API abuse").
//
// SECURITY FINDING (Phase 7 audit): there was NO rate limiting anywhere in
// this codebase before this file — every sensitive endpoint (login,
// register, order creation) could be hammered without limit. This is a
// real gap, fixed here using Cloudflare's native Rate Limiting binding
// (https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
// which is the correct primitive for this on Workers — no external
// service, KV, or Durable Object needed.
//
// HONEST STATUS: this binding cannot be created or exercised inside this
// sandbox (it requires a real Cloudflare account/dashboard or `wrangler`
// authenticated against one). The middleware is written to degrade safely
// when the binding is absent — see the fail-open comment below — so local
// dev and this sandbox's tests are unaffected, but the actual throttling
// behavior is `Pending Cloudflare Worker runtime verification` (see
// SECURITY.md) until configured for real. Setup steps are documented in
// backend/README.md.
import { json } from '../utils/http.js';

// Returns middleware that rate-limits by a key derived from the request
// (IP by default — the identity most meaningful before we know who's
// calling, since login/register attempts are by definition unauthenticated).
// `bindingName` selects which of the (up to 5, per Cloudflare's limit)
// configured rate-limit bindings to use, so different endpoints can have
// different thresholds (e.g. login stricter than general order creation).
export function rateLimit(bindingName, { keyPrefix } = {}) {
  return async function middleware(request, env) {
    const limiter = env[bindingName];
    if (!limiter || typeof limiter.limit !== 'function') {
      // FAIL OPEN, not closed: a missing rate-limit binding must never
      // take the whole API down (that would be a self-inflicted denial of
      // service). This is a deliberate, documented tradeoff — see the
      // module comment above and SECURITY.md.
      return;
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = `${keyPrefix || bindingName}:${ip}`;

    try {
      const { success } = await limiter.limit({ key });
      if (!success) {
        return json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' } },
          429
        );
      }
    } catch (err) {
      // A rate-limiter runtime error (not "limit exceeded" — an actual
      // failure calling the binding) also fails open, for the same reason
      // as a missing binding: a rate limiter must never become a bigger
      // outage than the abuse it's meant to prevent.
      console.error('Rate limiter error (failing open):', err);
    }
    // no return value -> router continues
  };
}
