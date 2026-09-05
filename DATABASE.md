# Database Architecture

PostgreSQL (Supabase), accessed by the Worker through a Cloudflare Hyperdrive binding. Schema is built in two layers:

1. `backend/database/schema.sql` — the original single-café schema (`users`, `cafe_info`, `categories`, `products`, `reviews`, `gallery`). Kept as-is for historical/rollback reference; **`users` and `cafe_info` no longer exist in a migrated database** — migration `0002` drops them once their replacements (`profiles`, `businesses`) are populated.
2. `backend/database/migrations/000N_*.sql` — every real schema change since, applied in order by `npm run migrate` (tracked in a `schema_migrations` table, safe to re-run).

## Migration history

| File | Adds |
|---|---|
| `0001_multitenant_foundation.sql` | `businesses`, `roles`, `permissions`, `role_permissions`, `profiles`; `business_id` backfilled onto `categories`/`products`/`reviews`/`gallery`; RLS policies |
| `0002_cleanup_legacy_tables.sql` | Drops `users`, `cafe_info` (superseded by `profiles`, `businesses`) |
| `0003_orders_and_commerce_core.sql` | `customers`, `customer_addresses`, `coupons`, `orders`, `order_items`, `coupon_usage`, `payments`, `invoices`, `notifications`, `audit_logs`; order/delivery/tax settings added to `businesses` |
| `0004_payment_provider_integration.sql` | `provider_reference`/`checkout_url` on `payments`; `payment_webhook_events` |
| `0005_password_reset.sql` | `password_reset_tokens` |

## Multi-tenant isolation strategy

**Layer 1 (primary, always active):** every business-scoped table has a `business_id` column, and every application query filters by it explicitly. This is what actually enforces isolation today.

**Layer 2 (defense-in-depth, `Pending Supabase verification`):** Row Level Security, `FORCE`d, on every business-scoped table, with the identical policy shape:
```sql
USING (business_id = current_setting('app.current_business_id', true)::integer)
```
set per-transaction by the Worker (`config/db.js`'s `withTenantClient`/`tenantQuery`). **This is only real protection if the Worker's DB role does not own the tables** — see `SECURITY.md` §2 and `DEPLOYMENT.md` §2 for the exact manual verification steps against a real Supabase project (pg-mem, used by every automated test in this repo, does not implement RLS at all).

## Core tables

### `businesses`
The tenant root. `slug` (unique) is what `X-Business-Slug` resolves to. Holds profile info (`name`/`name_ar`, `description*`, `logo_url`, `cover_url`, `phone`, `whatsapp`, `email`, `address*`), `working_hours`/`social_links`/`theme_settings`/`enabled_modules` (all `jsonb`), order settings (`accept_orders`, `accept_pickup`, `accept_delivery`, `accept_dine_in`, `delivery_fee`, `minimum_order_amount`, `tax_rate_percent`, `currency`), and `order_number_prefix`/`last_order_number` (atomically incremented under a row lock at order-creation time to generate human-readable order numbers like `LUNA-10025`).

### `roles` / `permissions` / `role_permissions`
Global catalog (not business-scoped) — every business shares the same four roles and permission set. See `API.md`'s "Permission catalog reference" for the exact matrix.

### `profiles`
Admin/staff accounts. `UNIQUE (business_id, email)` — the same email can be an admin on two different businesses as two separate rows. `role_id` → `roles`.

### `customers` / `customer_addresses`
Customer accounts (optional — guest checkout is supported; see `orders.customer_id` being nullable below) and their saved delivery addresses. `UNIQUE (business_id, LOWER(email))` where email is set.

### `products` / `categories`
Menu catalog. `categories.slug` is `UNIQUE (business_id, slug)` (not globally unique — two businesses can both have a `coffee` category).

### `orders` / `order_items`
The core commerce tables.
- `orders.customer_id` is nullable; `CHECK (customer_id IS NOT NULL OR (guest_name IS NOT NULL AND guest_phone IS NOT NULL))` enforces every order has *some* identified contact.
- `subtotal`/`discount`/`delivery_fee`/`tax`/`total` are always server-computed (`services/orderPricing.js`) — never trust these as client-writable in any client integration built against this API.
- `status` is `CHECK`-constrained to the exact state machine values (`services/orderStatus.js`); transitions between them are enforced in application code, not by the database (the DB only guarantees the value is *one of* the valid statuses, not that a given transition is legal).
- `idempotency_key`: `UNIQUE (business_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
- `access_token`: `UNIQUE`, opaque, used for guest order tracking (never the sequential `id`).
- `order_items` stores **snapshots** (`product_name_snapshot`, `unit_price_snapshot`) so a later product edit never rewrites history.

### `coupons` / `coupon_usage`
`coupons.code` is `UNIQUE (business_id, UPPER(code))`. `coupon_usage` records each redemption (`UNIQUE (order_id)` — one coupon use per order) and is what usage-limit enforcement counts against.

### `payments` / `payment_webhook_events`
One `payments` row per order (`UNIQUE (order_id)`), created at order-creation time with `status = 'pending'`. `provider_reference` is `UNIQUE` (a given provider transaction/order reference can never be claimed by two different payment rows). `payment_webhook_events` is the replay-protection ledger: `UNIQUE (provider, provider_transaction_id) WHERE outcome = 'processed'` guarantees a given provider transaction id can only ever be recorded as successfully processed once, independent of any application-layer check — see `SECURITY.md` §7.

### `invoices`
One per order (`UNIQUE (order_id)`), storing a full JSON `snapshot` at creation time — an invoice never changes even if the order/business/product data it references is edited later.

### `notifications`
Either business-wide (admin-facing, `customer_id IS NULL`) or targeted at one customer — never both.

### `audit_logs`
Sensitive admin action trail (section 58): product/category/business/staff mutations, order status/payment-status changes, payment webhook outcomes. `profile_id` is nullable (some events — like a customer placing an order — have no acting admin).

### `password_reset_tokens`
Shared table for both admin (`profiles`) and customer resets, distinguished by `actor_type`; `CHECK` constraint prevents a row from ever claiming both `profile_id` and `customer_id`. Tokens are stored as a SHA-256 hash, never the raw value.

## Important foreign keys & cascade behavior

Nearly everything cascades on `businesses` deletion (`ON DELETE CASCADE`) — deleting a business removes all of its data. Within a business, `products`/`categories`/`orders`/etc. cascade similarly on their immediate parent. `order_items.product_id` uses `ON DELETE SET NULL` (deleting a product must never delete historical order line items — the snapshot columns keep the record meaningful even with a null product reference). `payments.order_id`, `invoices.order_id`, `coupon_usage.order_id` all cascade with their order.

## Indexes

Every business-scoped table has an index on `business_id` (or a composite starting with it) to support the layer-1 isolation filter efficiently. Additional targeted indexes: `orders(business_id, status)` (admin order-list filtering), `orders(created_at)`, `audit_logs(business_id, created_at)`, `notifications(business_id, customer_id, is_read)`.

## What requires live Supabase verification

Everything under "Layer 2" above, plus: the `set_updated_at()` trigger firing correctly on every table that references it, and actual query performance under real data volume (indexes are present and reasoned about, but never benchmarked against a live database from this environment). See `DEPLOYMENT.md` §2 for the exact manual steps.
