# Security Model — LUNA Café / Business Website Core

This document describes the verified security architecture as of Phase 7 (Security & Testing audit). It states plainly what has been tested and how, and what still requires verification against a real, live environment this sandbox does not have access to.

**How to read the verification tags used throughout:**
- `Verified locally` — exercised by an automated test in `backend/tests/*.pgmem.test.mjs`, run against an in-memory PostgreSQL-compatible engine (pg-mem). Real logic, real SQL, real crypto — but not a live Postgres/Cloudflare/provider environment.
- `Pending Supabase verification` — depends on real Postgres/RLS behavior that pg-mem cannot execute (it doesn't implement Row Level Security or triggers).
- `Pending Cloudflare Worker runtime verification` — depends on the actual `fetch()` handler running in Cloudflare's real Workers runtime (this sandbox runs Node, not `workerd`).
- `Pending live provider verification` — depends on a real external account/credentials (Paymob, Resend, Cloudflare Rate Limiting) not available here.

---

## 1. Authentication model

Two entirely separate authentication systems share the same backend, deliberately:

| | Admin/staff (`profiles`) | Customer (`customers`) |
|---|---|---|
| Middleware | `middleware/auth.js` (`requireAuth`/`optionalAuth`) | `middleware/customerAuth.js` (`requireCustomerAuth`/`optionalCustomerAuth`) |
| Token storage (frontend) | `luna_admin_token` | `luna_customer_token` |
| JWT payload | `{ id, businessId, email, roleKey, exp }` | `{ id, businessId, type: 'customer', exp }` |
| Password hashing | bcrypt (cost 10) | bcrypt (cost 10) |

**Token-type separation (Verified locally, includes a real Phase 7 fix):** both token types are signed with the same `JWT_SECRET`, so signature validity alone doesn't distinguish them. `requireAuth`/`optionalAuth` explicitly reject any token carrying `type: 'customer'`; `requireCustomerAuth`/`optionalCustomerAuth` explicitly reject any token that does *not* carry `type: 'customer'`. **Phase 7 finding**: the admin-side check was missing before this phase — a customer's valid JWT would previously pass `requireAuth`'s signature+business checks and populate `request.user` with a customer payload (no `roleKey`). On `requirePermission`-gated routes this failed safe (no role matches an undefined `roleKey`), but `GET /api/auth/me` (auth-only, no permission gate) would then query `profiles WHERE id = $customerId` — a real cross-privilege read whenever a `profiles.id` numerically coincided with the caller's own customer id in the same business (likely for early accounts, since both tables are independent `SERIAL` sequences starting at 1). **Fixed** in this phase; covered by `tests/security-audit.pgmem.test.mjs`.

**Cross-business token reuse (Verified locally):** both `requireAuth` and `requireCustomerAuth` compare the token's `businessId` against the business resolved from the request's `X-Business-Slug` header, rejecting any mismatch with `401 BUSINESS_MISMATCH`.

## 2. Business isolation (multi-tenant)

Two layers, by design (see `backend/src/config/db.js` for the full rationale):

1. **Application layer (primary, always active):** every controller query touching a business-scoped table includes an explicit `WHERE business_id = $N`. This is what actually protects data today.
2. **Database layer (defense-in-depth):** Row Level Security is enabled + `FORCE`d on every business-scoped table (migrations `0001`, `0003`, `0004`, `0005`), keyed on the session variable `app.current_business_id`, set per-transaction by `withTenantClient`/`tenantQuery`.

**Known, documented gap:** RLS is only real protection if the Postgres role the Worker connects as is *not* a table owner/superuser — Supabase's default `postgres` role bypasses RLS entirely (`FORCE ROW LEVEL SECURITY` does not apply to the owner). Until a dedicated least-privilege DB role is created for the Worker connection (see `backend/README.md` §16-18), layer 2 is inert and layer 1 is the *only* real protection. This is explicitly `Pending Supabase verification`.

**Verified locally** (via 34+ adversarial cross-business tests across `orders`, `staff-rbac`, `payments`, and `security-audit` suites): businesses/customers/orders/products/categories/reviews/gallery/coupons/staff/payments/addresses/password-reset-tokens all reject cross-business read/update/delete attempts at the application-layer query level.

## 3. RBAC (role-based access control)

Four roles (`super_admin`, `manager`, `staff`, `content_manager`), a global permission catalog, and a `role_permissions` join table (migration `0001`). Every admin-mutating route is wrapped in `requirePermission(<key>)`, which queries the database directly — the permission matrix is never hard-coded per-route or duplicated in the frontend. The frontend's nav visibility (`useAuth().can()`) is a UX convenience only; every route re-checks server-side regardless (section 16: "hiding UI buttons is not security").

**Verified locally:** the exact permission matrix (all 4 roles × 14 permissions) is asserted in `tests/staff-rbac.pgmem.test.mjs`; cross-business staff isolation and last-active-`super_admin` protection (a business can never end up with zero super_admins) are also covered.

## 4. Row Level Security / triggers — exact status

- **Policies exist and are `FORCE`d** on every business-scoped table added since Phase 1 (`categories`, `products`, `reviews`, `gallery`, `profiles`, `customers`, `customer_addresses`, `coupons`, `orders`, `order_items`, `coupon_usage`, `payments`, `invoices`, `notifications`, `audit_logs`, `payment_webhook_events`, `password_reset_tokens`).
- **Intent verified by code review** every policy in this codebase follows the identical shape: `USING (business_id = current_setting('app.current_business_id', true)::integer)`.
- **`Pending Supabase verification`**: pg-mem (the test engine used throughout this project) does not implement RLS or triggers at all — every `*.pgmem.test.mjs` suite explicitly skips those statements when building its schema (see each file's `isSkipped()`/`isPostgresOnlyFeature()` helper) and says so in comments. **No test in this repository has ever executed a real RLS policy.** Before production use, a real Supabase project must be used to: (a) confirm the Worker's DB role does not own the tables, (b) attempt cross-business queries as that role and confirm RLS actually blocks what the application layer already blocks, (c) confirm the `set_updated_at()` trigger fires correctly on every table that has it.

## 5. Secrets

Never committed, never in `wrangler.jsonc` `vars`, never sent to the frontend: `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMOB_API_KEY`/`PAYMOB_INTEGRATION_ID`/`PAYMOB_IFRAME_ID`/`PAYMOB_HMAC_SECRET`, `RESEND_API_KEY`. All are `wrangler secret put` values or local-only `.dev.vars` entries (gitignored). `ADMIN_PASSWORD`/`SUPABASE_DB_URL` exist only in the local `.env` used by one-off scripts (`seed.js`, `migrate.js`) — never deployed with the Worker. Verified by a repo-wide secret-pattern grep before every checkpoint ZIP (see each phase's completion report).

## 6. Upload security

`POST /api/admin/uploads` (`mediaController.js`): MIME allowlist (JPEG/PNG/WEBP/GIF only — no SVG, no executables), 5MB size cap, server-generated random filenames (client filename is *never* used, closing filename-injection/path-traversal), business-scoped storage paths (`<business_id>/<purpose>/<random-id>.<ext>`), and per-`purpose` permission checks (`products.manage`/`categories.manage`/`gallery.manage`/`business.manage`) resolved from the database, not a client-supplied role claim. **Verified locally** for the authorization-mapping logic (`tests/staff-rbac.pgmem.test.mjs` §7); actual upload-to-Supabase-Storage behavior is `Pending live provider verification` (needs real `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` and a `business-media` bucket — see `backend/README.md` §19).

## 7. Order & payment security

- **Server-side pricing (Verified locally):** `services/orderPricing.js` re-reads product prices from the database with `FOR UPDATE` row locks; a client-supplied price/subtotal/discount/tax/total/delivery-fee is never read anywhere in the order-creation path.
- **Idempotency (Verified locally):** a unique index on `(business_id, idempotency_key)` plus in-transaction race handling on `23505` conflicts.
- **Guest order access (Verified locally):** an opaque, 24-random-byte `access_token` — never the sequential id — with ownership checked via `canAccessOrder()` (admin OR owning customer OR matching guest token), returning `404` (not `403`) on failure so order existence can't be probed.
- **Payment webhook (Verified locally, real crypto):** HMAC-SHA512 signature verification (via Web Crypto, cross-checked against an independently-computed reference signature in `tests/payments.pgmem.test.mjs`) happens *before* anything in the payload is trusted; amount/currency/order/business are then independently re-verified against the authoritative `orders` row (never the payload's own claims); a real unique-index-backed replay/duplicate guard (`payment_webhook_events`, migration `0004`) makes a second delivery of the same `(provider, transaction_id)` a guaranteed no-op, not a "best effort" check.
- **`payment_status = 'paid'` is set in exactly one code path in this entire codebase**: inside the webhook handler, after all of the above verification. No admin endpoint, no order-creation endpoint, and no client input can set it directly — `updatePaymentStatus` (admin, cash-only) explicitly refuses to do this for `payment_method = 'online'` orders.
- **`Pending live provider verification`:** the Paymob adapter's exact HMAC field list has not been cross-checked against Paymob's live documentation from this sandbox (flagged directly in `paymobProvider.js` and `backend/README.md` §20) and has never processed a real transaction.
- **`Pending Cloudflare Worker runtime verification`:** the webhook route's actual `fetch()`-level HTTP handling (registered before tenant resolution — see `worker.js`) has not run in a real Workers runtime.

## 8. Password reset (added in Phase 7 — closes a real gap found during the audit)

- Single-use, 30-minute-expiry, SHA-256-hashed tokens (raw token is *never* stored — `migration 0005`); admin (`profiles`) and customer tokens share one table but are strictly separated by `actor_type`, enforced both in every query and by a `CHECK` constraint preventing a row from claiming both a `profile_id` and a `customer_id`.
- **Anti-enumeration (Verified locally):** `forgot-password` always responds `{ requested: true }` whether or not the email matches an account.
- **`Pending live provider verification`:** actual email delivery requires `RESEND_API_KEY` (see `backend/README.md` §22); without it the endpoint is still fully secure, it just doesn't deliver anything (logged server-side only, never returned to the client).
- Both customer-facing (`/forgot-password`, `/reset-password`) and admin-facing (`/admin/forgot-password`, `/admin/reset-password`) reset pages are built (Phase 8), plus the pre-existing `ADMIN_PASSWORD` + re-seed fallback.

## 9. Rate limiting

`middleware/rateLimit.js` uses Cloudflare's native Rate Limiting binding on admin login, customer login/register, order creation, and coupon-code validation. **Fails open** (requests pass through) when the binding isn't configured, by design — a missing rate limiter must never become a self-inflicted outage. **`Pending Cloudflare Worker runtime verification`** — this binding cannot be created or exercised in this sandbox; see `backend/README.md` §21 for exact setup steps and the honest caveat that the binding config syntax should be re-checked against Cloudflare's current docs before relying on it.

## 10. CORS (hardened in Phase 7 — two real bugs found and fixed)

**Phase 7 findings:** the original CORS config (a) only ever allowed a single origin from `CLIENT_URL`, which is a real gap for this project's stated multi-business architecture (many client frontends, realistically many domains), and (b) never included `PATCH` in `Access-Control-Allow-Methods` or `X-Business-Slug`/`Idempotency-Key` in `Access-Control-Allow-Headers` — meaning a real browser would have failed CORS preflight on every order-status update, every notification-read, and *every single API request* (since `X-Business-Slug` is sent on every call), despite every local/pg-mem test passing (those never exercise real browser CORS preflight). **Fixed**: `CLIENT_URL` now accepts a comma-separated origin allowlist, checked against the request's real `Origin` header (never reflecting an untrusted origin); `PATCH`, `X-Business-Slug`, and `Idempotency-Key` are now allowed. **Verified locally** (`tests/security-audit.pgmem.test.mjs` §1-5: allowed origin accepted, second configured origin accepted, untrusted origin never echoed back, required methods/headers present, server-to-server calls with no `Origin` header don't error). **`Pending Cloudflare Worker runtime verification`** for actual browser behavior.

## 11. Customer privacy / sensitive data exposure

- `password_hash` is never included in any customer- or admin-facing SELECT column list (verified by direct inspection of `PUBLIC_FIELDS`/`SAFE_FIELDS` constants in `customerController.js`/`staffController.js`, and asserted in `tests/security-audit.pgmem.test.mjs` §11).
- Service-role/API secrets are never returned in any API response (they're Worker-secret-only, never read into a response body anywhere in the controllers).
- Guest `access_token` is only ever included in the order-creation response (once, to the creator) and required as an explicit query param to view that order again — never listed in any other endpoint's response to a third party.

## 12. Error handling

`middleware/errorHandler.js`: `HttpError`-thrown messages (controller-authored, safe) reach the client as-is; any other unexpected error is logged server-side (`console.error`, visible only via `wrangler tail`) and returns a generic `"Something went wrong on the server."` — never a raw stack trace or database error string. **Phase 7 fix:** `paymentController.initiateOnlinePayment` previously let a provider-adapter error (e.g. "Paymob is not configured: PAYMOB_API_KEY is missing") fall through to that generic branch, hiding useful (and non-sensitive) configuration-status information from the deploying merchant; it's now caught and re-thrown as an `HttpError` so the real, safe message reaches the client as documented.

## 13. Database constraints (defense against malformed/adversarial input)

`CHECK` constraints reject: negative/invalid order totals, invalid `order_type`/`status`/`payment_status` enum values, an order with neither a `customer_id` nor guest contact info, a zero-or-negative order-item quantity, a `password_reset_tokens` row claiming both actor types at once. Unique indexes enforce: one order number per business, one idempotency key per business, one coupon code per business (case-insensitive), one `provider_reference`/processed `(provider, transaction_id)` pair globally. All `Verified locally` across the test suites.

## 14. Summary — what's real vs. what needs live verification

| Area | Status |
|---|---|
| Application-layer business isolation | Verified locally |
| RBAC permission matrix | Verified locally |
| Token-type separation (admin/customer) | Verified locally (real fix in Phase 7) |
| Order pricing/idempotency/ownership | Verified locally |
| Payment webhook signature/replay/amount verification | Verified locally (crypto + logic); live Paymob transaction pending |
| Password reset security properties | Verified locally; live email delivery pending |
| CORS allowlist/header/method logic | Verified locally; live browser behavior pending |
| RLS policies exist with correct intent | Verified by code review; live Postgres enforcement pending |
| Rate limiting | Implemented, fails open; live Cloudflare enforcement pending |
| File upload authorization mapping | Verified locally; live Supabase Storage upload pending |
