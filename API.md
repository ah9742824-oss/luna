# API Reference

Base URL: `<your-worker-domain>/api` (locally: `http://localhost:5000/api` when running `wrangler dev` — the actual port `wrangler dev` picks is printed on start).

Every request (except the payment webhook and health checks) must include:

```
X-Business-Slug: <business-slug>
```

identifying which business the request is for (section 8). Admin requests additionally need `Authorization: Bearer <admin JWT>`; customer requests need `Authorization: Bearer <customer JWT>`. **The two token types are never interchangeable** — see `SECURITY.md` §1.

## Response envelope (section 54)

Success:
```json
{ "success": true, "data": { /* ... */ }, "meta": { "page": 1, "pageSize": 20, "total": 57 } }
```
`meta` only appears on paginated list endpoints (admin orders, admin customers, admin audit logs). A handful of simple/legacy read endpoints (`GET /api/products`, `/api/categories`, `/api/reviews`, `/api/gallery`) return a bare array instead of the envelope — noted per-endpoint below.

Error:
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

## Idempotency

`POST /api/orders` requires an `Idempotency-Key` header (or `idempotency_key` body field) — see the Orders section.

---

## Health

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/healthz` | none | No tenant resolution, no DB touch. |
| GET | `/api/health` | none | Same as above. |

## Authentication — Admin (`/api/auth/*`)

| Method | Path | Auth | Permission | Rate-limited |
|---|---|---|---|---|
| POST | `/api/auth/login` | none | — | `RATE_LIMITER_LOGIN` |
| GET | `/api/auth/me` | admin JWT | — | — |
| GET | `/api/auth/permissions` | admin JWT | — | — |
| POST | `/api/auth/forgot-password` | none | — | `RATE_LIMITER_AUTH` |
| POST | `/api/auth/reset-password` | none | — | `RATE_LIMITER_AUTH` |

`POST /api/auth/login` — body `{ email, password }` → `{ token, user: { id, name, email, role, roleName, roleNameAr } }`. Scoped to the resolved business — the same email can be a profile on two different businesses; only the one matching `X-Business-Slug` is checked.

`POST /api/auth/forgot-password` — body `{ email }` → always `{ requested: true }`, whether or not the email matches an account (anti-enumeration — section 12/80). Generates a single-use, 30-minute, SHA-256-hashed reset token and emails it via Resend if configured (see `backend/README.md` §22).

`POST /api/auth/reset-password` — body `{ token, password }` → `{ reset: true }` or a `400` if the token is invalid/expired/already used.

## Authentication — Customer (`/api/customers/*`)

| Method | Path | Auth | Rate-limited |
|---|---|---|---|
| POST | `/api/customers/register` | none | `RATE_LIMITER_AUTH` |
| POST | `/api/customers/login` | none | `RATE_LIMITER_AUTH` |
| POST | `/api/customers/forgot-password` | none | `RATE_LIMITER_AUTH` |
| POST | `/api/customers/reset-password` | none | `RATE_LIMITER_AUTH` |
| GET | `/api/customers/me` | customer JWT | — |
| PUT | `/api/customers/me` | customer JWT | — |
| GET/POST | `/api/customers/me/addresses` | customer JWT | — |
| PUT/DELETE | `/api/customers/me/addresses/:id` | customer JWT | — |
| GET | `/api/customer/notifications` | customer JWT | — |
| PATCH | `/api/customer/notifications/:id/read` | customer JWT | — |

`POST /api/customers/register` — body `{ name, password, email?, phone? }` (at least one of email/phone required, password ≥8 chars) → `{ token, customer }`, `201`.

`POST /api/customers/login` — body `{ email or phone, password }` → `{ token, customer }` (`password_hash` never included in the response — see `SECURITY.md` §11).

Address endpoints are always scoped to the authenticated customer's own `customer_id` — see `SECURITY.md` §2 for the cross-customer isolation test coverage.

## Business (public catalog + admin settings)

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/api/business` (alias: `/api/cafe`) | none | — |
| PUT | `/api/business` (alias: `/api/cafe`) | admin JWT | `business.manage` |

`GET` returns the current business's public profile (name, description, contact info, `working_hours`, `social_links`, `enabled_modules`, `accept_orders`/`accept_delivery`/`accept_pickup`/`accept_dine_in`, `delivery_fee`, `minimum_order_amount`, `tax_rate_percent`, `currency`). The `/api/cafe` alias exists only for backward compatibility with the original single-café frontend paths — new integrations should use `/api/business`.

## Categories

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/api/categories` | none | — (bare array response) |
| POST | `/api/categories` | admin JWT | `categories.manage` |
| PUT/DELETE | `/api/categories/:id` | admin JWT | `categories.manage` |

## Products

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/api/products` (optional `?category=<slug>&available=true`) | none | — (bare array response) |
| GET | `/api/products/:id` | none | — |
| POST | `/api/products` | admin JWT | `products.manage` |
| PUT/DELETE | `/api/products/:id` | admin JWT | `products.manage` |

Mutations write to `audit_logs` automatically (section 58).

## Cart & Orders

| Method | Path | Auth | Permission | Notes |
|---|---|---|---|---|
| POST | `/api/cart/validate` | optional customer | — | Real-time server-computed pricing preview |
| POST | `/api/orders` | optional customer | — | Rate-limited; requires `Idempotency-Key` |
| GET | `/api/orders/:id` (optional `?access_token=`) | optional customer | — | Ownership-checked, see below |
| GET | `/api/customer/orders` | customer JWT | — | Own orders only |
| GET | `/api/admin/orders` (`?status=&page=&pageSize=`) | admin JWT | `orders.view` | Paginated |
| GET | `/api/admin/orders/:id` | admin JWT | `orders.view` | |
| PATCH | `/api/admin/orders/:id/status` | admin JWT | `orders.manage` | Enforces the state machine |
| PATCH | `/api/admin/orders/:id/payment-status` | admin JWT | `orders.manage` | Refuses `paid` for `payment_method: 'online'` |

**`POST /api/orders`** — the security-critical endpoint. Body: `{ order_type, items: [{ product_id, quantity }], payment_method, guest_name?, guest_phone?, guest_email?, address?, table_number?, coupon_code?, notes? }`. **Never** accepts a price/subtotal/discount/tax/delivery_fee/total/payment_status field — all monetary values are computed server-side from the live `products` table (section 29). Requires header `Idempotency-Key: <client-generated-uuid>` — a retry with the same key returns the original order instead of creating a duplicate (`200` instead of `201`). Response includes `access_token`, an opaque token for guest order tracking (only returned once, at creation).

**`GET /api/orders/:id`** — visible to: an authenticated admin (via the separate `/api/admin/orders/:id`, not this path), the owning customer (via JWT), or a caller presenting `?access_token=<the exact token from order creation>`. Returns `404` (not `403`) for every other case, including a genuinely nonexistent order — order existence cannot be probed.

**`PATCH /api/admin/orders/:id/status`** — body `{ status }`, one of `new, accepted, preparing, ready, out_for_delivery, delivered, completed, cancelled`. Rejects any transition not in the state machine (e.g. `new` → `completed` directly) with `409`, regardless of what the admin UI shows.

## Coupons

| Method | Path | Auth | Permission | Rate-limited |
|---|---|---|---|---|
| POST | `/api/coupons/validate` | optional customer | — | `RATE_LIMITER_ORDERS` |
| GET/POST | `/api/admin/coupons` | admin JWT | `coupons.manage` | — |
| PUT/DELETE | `/api/admin/coupons/:id` | admin JWT | `coupons.manage` | — |

`POST /api/coupons/validate` — body `{ code, subtotal }` → `{ valid, code, type, discount }`. Read-only preview; does not record a usage. Uses the exact same validation logic (`services/orderPricing.js`) as real checkout, so the preview can never drift from what's actually charged.

## Reviews

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/api/reviews` (optional `?all=true`, admin only) | optional admin | — (bare array response) |
| POST/PUT/DELETE | `/api/reviews`, `/api/reviews/:id` | admin JWT | `reviews.manage` |

Public GET returns only `is_enabled = true` reviews unless the caller is an authenticated admin with `?all=true`. **Note**: review *submission* is currently admin-only (there is no public customer-facing review-creation endpoint) — see `README.md`'s feature inventory.

## Gallery

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/api/gallery` | none | — (bare array response) |
| POST/DELETE | `/api/gallery`, `/api/gallery/:id` | admin JWT | `gallery.manage` |

## Media upload

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/admin/uploads` | admin JWT | Permission depends on `purpose` in the body (see below) |

Body: `{ purpose: 'product'|'category'|'gallery'|'business', mime_type, content_base64 }`. `purpose` determines the required permission (`products.manage`/`categories.manage`/`gallery.manage`/`business.manage`) and the storage folder — checked server-side against the caller's real role, not a client-supplied claim. MIME allowlist: JPEG/PNG/WEBP/GIF only, 5MB max. Returns `{ url, path }`, `201`. Real upload to Supabase Storage — requires `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` configured (`backend/README.md` §19) or fails with a clear `500`.

## Payments

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/orders/:id/pay/online` | optional customer | Ownership-checked, same rule as viewing the order |
| POST | `/api/payments/webhook/:provider` | none (server-to-server) | Signature-verified; registered before tenant resolution |

**`POST /api/orders/:id/pay/online`** — no body. Only valid for `payment_method: 'online'` orders that aren't already paid/refunded. Idempotent: a repeated call while a checkout is still pending returns the same `checkout_url` instead of registering a new provider order. Returns `{ checkout_url }` or a `502` with the real (non-sensitive) reason if the provider isn't configured/reachable.

**`POST /api/payments/webhook/:provider`** — called by the payment provider's own servers, never by the frontend. Currently `:provider` is only ever `paymob`. Verifies the provider's HMAC signature before trusting anything in the body; independently re-verifies amount, currency, order, and business against the authoritative `orders` row; atomically rejects replayed/duplicate deliveries via a unique database index. See `SECURITY.md` §7 for the full security model. **`payment_status = 'paid'` is set nowhere else in this codebase.**

## Admin — Customers, Invoices, Notifications, Audit Log, Staff, Statistics

| Method | Path | Auth | Permission |
|---|---|---|---|
| GET | `/api/admin/customers` (`?page=&pageSize=`) | admin JWT | `customers.view` |
| GET | `/api/admin/customers/:id` | admin JWT | `customers.view` |
| GET | `/api/admin/invoices/:orderId` | admin JWT | `invoices.view` |
| GET | `/api/admin/notifications` | admin JWT | — (any authenticated admin) |
| PATCH | `/api/admin/notifications/:id/read` | admin JWT | — |
| GET | `/api/admin/audit-logs` (`?page=&pageSize=`) | admin JWT | `audit_log.view` |
| GET | `/api/admin/roles` | admin JWT | — (any authenticated admin; read-only reference data) |
| GET | `/api/admin/staff` | admin JWT | `staff.manage` |
| POST | `/api/admin/staff` | admin JWT | `staff.manage` |
| PUT | `/api/admin/staff/:id` | admin JWT | `staff.manage` |
| GET | `/api/stats` | admin JWT | `statistics.view` |

`PUT /api/admin/staff/:id` — cannot be used on your own account (use `/api/auth/me`-derived flows instead), and refuses to demote/deactivate the last active `super_admin` on a business (`SECURITY.md` §3).

---

## Permission catalog reference

`products.manage`, `categories.manage`, `orders.view`, `orders.manage`, `customers.view`, `customers.manage`, `reviews.manage`, `gallery.manage`, `coupons.manage`, `invoices.view`, `business.manage`, `statistics.view`, `staff.manage`, `audit_log.view`. Full role → permission matrix: `super_admin` has all of them; `manager` has all except `staff.manage`; `staff` has only `orders.view`/`orders.manage`; `content_manager` has `products.manage`/`categories.manage`/`gallery.manage`/`reviews.manage`. Verified exhaustively in `backend/tests/staff-rbac.pgmem.test.mjs`.

## Error codes seen in practice

`VALIDATION_ERROR` (400 — bad input), `UNAUTHENTICATED` (401 — missing/invalid token), `INVALID_TOKEN` (401 — wrong token type or corrupt token), `BUSINESS_MISMATCH` (401 — token issued for a different business), `FORBIDDEN` (403 — valid session, insufficient permission), `NOT_FOUND` (404), `RATE_LIMITED` (429, only when a Rate Limiting binding is configured), `INTERNAL_ERROR` (500 — generic, never leaks internals; see `SECURITY.md` §12).
