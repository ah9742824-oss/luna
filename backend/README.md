# LUNA Café — Backend API (Cloudflare Workers + Hyperdrive + Supabase)

Production backend for LUNA Café: a Cloudflare Worker (no always-on server)
that talks to your existing Supabase PostgreSQL database through Cloudflare
Hyperdrive. The React/Vite frontend is unchanged — it only needs its API
base URL updated.

## 1. Architecture

```
React/Vite Frontend
        │  fetch(`${VITE_API_URL}/products`, ...)
        ▼
Cloudflare Worker            (src/worker.js — itty-router, fetch() handler, no app.listen())
        │  env.HYPERDRIVE.connectionString
        ▼
Cloudflare Hyperdrive        (connection pooling/acceleration to Postgres)
        │
        ▼
Supabase PostgreSQL          (your existing schema — unchanged)
```

Every request is handled fresh by `fetch(request, env, ctx)`. There is no
persistent Node.js process, no `app.listen()`, and no hardcoded port.

---

## 2. Final backend file tree

```
backend/
├── src/
│   ├── worker.js                  Worker entry point (fetch handler)
│   ├── config/
│   │   └── db.js                  Hyperdrive query helper
│   ├── middleware/
│   │   ├── auth.js                JWT verification (requireAuth/optionalAuth)
│   │   ├── cors.js                CORS headers (CLIENT_URL-based)
│   │   └── errorHandler.js        Central error → JSON response mapping
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── productController.js
│   │   ├── categoryController.js
│   │   ├── reviewController.js
│   │   ├── cafeController.js
│   │   ├── galleryController.js
│   │   └── statsController.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── products.js
│   │   ├── categories.js
│   │   ├── reviews.js
│   │   ├── cafe.js
│   │   ├── gallery.js
│   │   └── stats.js
│   └── utils/
│       ├── http.js                json()/HttpError helpers
│       ├── time.js                JWT expiry duration parsing
│       └── validate.js            Shared input-validation helpers
├── database/
│   ├── schema.sql                 Unchanged — already applied to Supabase
│   ├── seed.js                    SAFE, non-destructive, idempotent seed
│   └── seed-demo-reset.js         DESTRUCTIVE demo reset (separate, guarded)
├── package.json
├── wrangler.jsonc
├── .env.example
├── .dev.vars.example
├── .gitignore
└── README.md
```

---

## 3. Prerequisites

- Node.js 18+
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Your existing Supabase project, with `database/schema.sql` already applied (unchanged, no action needed)

---

## 4. Local development

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars   # local-only Worker secrets, gitignored
```

Edit `.dev.vars`:

```
JWT_SECRET=replace-with-a-long-random-secret
CLIENT_URL=http://localhost:5173
```

To run the Worker locally against your **real** Supabase database via Hyperdrive (simplest option, no local Postgres needed):

```bash
npx wrangler login        # one-time, opens a browser
npm run dev:remote        # wrangler dev --remote
```

Complete section 6 (Hyperdrive setup) first — remote dev uses the live Hyperdrive binding from `wrangler.jsonc`.

---

## 5. Supabase setup

Your schema is already applied — nothing to do here. If you ever need to re-apply it to a fresh Supabase project, run `database/schema.sql` once in the Supabase SQL editor; it's unchanged from your existing setup.

Get your connection string from **Project Settings → Database → Connection string (URI)**:
- Use the **Session pooler** string for the local seed scripts.
- Use the **Transaction pooler** string (port 6543) when creating the Hyperdrive configuration below — Hyperdrive is designed to work with the transaction pooler.

---

## 6. Hyperdrive setup

```bash
npx wrangler hyperdrive create luna-cafe-db \
  --connection-string="postgres://postgres:YOUR-PASSWORD@YOUR-PROJECT.supabase.co:6543/postgres"
```

Wrangler prints an **id**. Put it in `wrangler.jsonc`:

```jsonc
"hyperdrive": [
  { "binding": "HYPERDRIVE", "id": "PASTE_THE_PRINTED_ID_HERE" }
]
```

This `id` is a reference only — Cloudflare stores the real connection string encrypted on their side. It never needs to go in `.env`, `.dev.vars`, or GitHub.

> Wrangler's exact CLI flags occasionally change between versions. If this command doesn't match what you see, run `npx wrangler hyperdrive create --help` and use the current syntax.

---

## 7. Cloudflare setup, Wrangler install, and login

```bash
cd backend
npm install          # installs wrangler as a dev dependency
npx wrangler login    # opens a browser to authorize the CLI against your Cloudflare account
```

No credit card or paid plan is required for any of this — Workers Free and Hyperdrive both work on Cloudflare's free tier, and Supabase's free tier is used as-is.

---

## 8. Environment variables & secrets

| Name | Where it lives | Secret? | Used by |
|---|---|---|---|
| `HYPERDRIVE` (binding) | `wrangler.jsonc` `hyperdrive[]` | id only — not secret | Worker DB access |
| `CLIENT_URL` | `wrangler.jsonc` `vars` | no | Worker CORS |
| `JWT_EXPIRES_IN` | `wrangler.jsonc` `vars` | no | Worker auth (token lifetime) |
| `JWT_SECRET` | Cloudflare secret (`wrangler secret put`) / `.dev.vars` locally | **yes** | Worker auth — **required, no default** |
| `SUPABASE_DB_URL` | `backend/.env` (local only) | yes, local file only | `database/seed.js`, `seed-demo-reset.js` |
| `ADMIN_EMAIL` | `backend/.env` (local only) | no, but keep private | seed scripts only — **not read by the Worker** |
| `ADMIN_PASSWORD` | `backend/.env` (local only) | **yes** | seed scripts only — **required, no default; not read by the Worker** |

Set the one secret the Worker actually needs:

```bash
npx wrangler secret put JWT_SECRET
# paste a long random value when prompted
```

`ADMIN_EMAIL`/`ADMIN_PASSWORD` are **not** Worker configuration — there is no admin-creation API endpoint. They exist only so the local seed script can create/update the admin login in the database directly. Keep them in `backend/.env` (gitignored) and never commit that file.

If `JWT_SECRET` is missing when the Worker runs, every authenticated request fails safely with `500 Server misconfiguration: authentication is not available.` — the Worker never falls back to a default secret.

---

## 9. Seeding the database (safe, non-destructive, idempotent)

```bash
cd backend
cp .env.example .env
# edit .env: SUPABASE_DB_URL, ADMIN_EMAIL, ADMIN_PASSWORD
npm run seed
```

What `npm run seed` does — **and does not do**:

- Refuses to run at all if `SUPABASE_DB_URL`, `ADMIN_EMAIL`, or `ADMIN_PASSWORD` is missing (no default password, ever).
- Adds the 6 demo categories only if they don't already exist (by slug).
- Adds the 20+ demo products **only if the `products` table is currently completely empty**. If you already have real products, it leaves them untouched.
- Same empty-table-only rule for `reviews` (5 demo reviews) and `gallery` (8 demo images).
- Inserts `cafe_info` **only if no row exists yet**; never overwrites existing café info.
- Upserts the admin account by email — updates the password if that email already exists, otherwise creates one. Never creates a duplicate.
- **Never** truncates or deletes products, categories, reviews, or gallery rows.

Safe to run as often as you like, including against a café's live data.

### Destructive demo reset (separate, guarded command)

If you want to wipe demo data back to a clean slate for a portfolio deployment:

```bash
CONFIRM_RESET=yes npm run seed:demo-reset
```

This **deletes** all products, categories, reviews, and gallery rows before reseeding. It refuses to run without `CONFIRM_RESET=yes`. **Never run this against a café's real data.**

---

## 10. Deployment

```bash
cd backend
npm install
npx wrangler login
# after completing sections 6 and 8 above
npm run deploy        # wrangler deploy
```

Wrangler prints your Worker's URL, e.g. `https://luna-cafe-api.YOUR-SUBDOMAIN.workers.dev`.

> **I was not able to actually run `wrangler deploy` or connect to a live Cloudflare/Supabase account from this environment** — there's no network access here. Every file was syntax-checked, import paths were verified to resolve, and the logic was reviewed against Cloudflare's documented Hyperdrive + Workers patterns, but I have not personally confirmed a live deployment. Please treat the first `npm run dev:remote` and `npm run deploy` as your real validation step, and check `npx wrangler tail` if anything doesn't behave as expected.

---

## 11. Health check

```bash
curl https://luna-cafe-api.YOUR-SUBDOMAIN.workers.dev/healthz
curl https://luna-cafe-api.YOUR-SUBDOMAIN.workers.dev/api/health
```

Both return:

```json
{ "status": "ok" }
```

Neither endpoint touches the database, so they stay up even if Hyperdrive/Supabase is briefly unavailable — useful for uptime checks.

---

## 12. Verifying the database connection

Once deployed, confirm the Worker can actually reach Supabase through Hyperdrive with a normal, existing, non-destructive read endpoint:

```bash
curl https://luna-cafe-api.YOUR-SUBDOMAIN.workers.dev/api/categories
```

A `200` with a JSON array means Hyperdrive → Supabase is working end-to-end. A `500` here (with `/healthz` still returning `200`) almost always means the Hyperdrive `id` in `wrangler.jsonc` is missing or wrong — recheck section 6.

No endpoint dumps raw database contents beyond what was already public before (products, categories, reviews, gallery, cafe info) — the same data the public website already displays.

---

## 13. Connecting the frontend

No frontend code changes — only the API base URL:

```
# frontend/.env
VITE_API_URL=https://luna-cafe-api.YOUR-SUBDOMAIN.workers.dev/api
```

The frontend keeps calling the exact same paths: `/products`, `/categories`, `/reviews`, `/cafe`, `/gallery`, `/stats`, `/auth/login`, `/auth/me`.

Also set `CLIENT_URL` in `wrangler.jsonc` (`vars`) to your deployed frontend's real origin, e.g. `https://luna-cafe.pages.dev`, then redeploy the Worker so CORS allows it.

---

## 14. Security checklist

- ✅ Passwords hashed with bcryptjs; `password_hash` is never returned by any endpoint.
- ✅ JWT auth via `@tsndr/cloudflare-worker-jwt` (native WebCrypto, no Node crypto shim needed); `JWT_SECRET` lives only as a Cloudflare secret.
- ✅ The Worker fails safely (`500`, not silent bypass) if `JWT_SECRET` is unset — never falls back to a default.
- ✅ No default admin password anywhere — the seed script exits with an error if `ADMIN_PASSWORD` is missing.
- ✅ All admin write endpoints (`POST`/`PUT`/`DELETE` on products, categories, reviews, cafe info, gallery; `GET /api/stats`) require a valid Bearer token.
- ✅ All SQL is parameterized (`$1, $2, ...`); no string-concatenated query values.
- ✅ Input validation on products, categories, reviews, cafe info, and gallery (required fields, numeric/boolean/URL/slug/rating checks) — see `src/utils/validate.js`.
- ✅ CORS restricted to `CLIENT_URL`, not a bare `*`.
- ✅ Errors return generic JSON messages; stack traces and internals are logged server-side only (`wrangler tail`), never sent to the client.
- ✅ No database credentials, JWT secret, or personal email is hardcoded anywhere in source. Seed defaults use the generic placeholder `admin@example.com` — never a real developer address.
- ✅ `npm run seed` cannot destroy existing data; the only destructive script is separate, clearly named, and requires explicit `CONFIRM_RESET=yes`.

---

## 15. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/healthz` works, but every other route returns `500` | Hyperdrive `id` in `wrangler.jsonc` is missing/wrong, or the Hyperdrive resource wasn't created (section 6) |
| `401 Authentication required` on admin actions | Missing/expired Bearer token — log in again from `/admin/login` |
| `500 Server misconfiguration: authentication is not available` | `JWT_SECRET` was never set — run `npx wrangler secret put JWT_SECRET` |
| CORS errors in the browser console | `CLIENT_URL` in `wrangler.jsonc` doesn't match your frontend's actual origin — update and redeploy |
| Seed script exits immediately with an env var error | One of `SUPABASE_DB_URL` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` is missing from `backend/.env` |
| `409 A category with this slug already exists` | Expected — slugs are unique; use a different slug or edit the existing category |

---

## 16. Transferring this project to a café owner

1. Have the owner create their own free Cloudflare and Supabase accounts (or transfer ownership of yours).
2. Run `npm run seed` once against their database with **their** `ADMIN_EMAIL`/`ADMIN_PASSWORD` in a local `.env` (never commit it) — this only creates/updates the admin login, it does not touch any existing menu data.
3. Set a fresh `JWT_SECRET` on their Cloudflare account: `npx wrangler secret put JWT_SECRET`.
4. Update `CLIENT_URL` in `wrangler.jsonc` to their frontend's real domain and redeploy.
5. Have them log in and change the admin password via the dashboard, or re-run `npm run seed` with a new `ADMIN_PASSWORD` (it updates in place, no duplicate account).
6. Nothing in this codebase references your personal email, GitHub username, or account — it's safe to hand over as-is.

---

## 17. Cloudflare Free plan limitations

- **100,000 requests/day** on Workers Free — generous for a café site.
- Each query opens a short `pg.Client` connection to Hyperdrive per request rather than reusing a long-lived pool inside the Worker; Hyperdrive absorbs most of the real pooling cost on Cloudflare's side, but under heavy concurrent load this adds a small amount of latency per request versus a persistent pool. Not a practical concern at café-website traffic levels.
- Supabase's free tier pauses a project after a period of inactivity — the first request after a pause may be slow while it wakes up.

## 18. Remaining risks / things to double-check yourself

- `compatibility_date` is set to `2026-08-25` for this revision — confirm it's still current (or bump it) against [Cloudflare's compatibility dates](https://developers.cloudflare.com/workers/configuration/compatibility-dates/) before your first deploy.
- `pg` requires the `nodejs_compat` flag (already set) — don't remove it.
- Wrangler CLI syntax (`wrangler hyperdrive create`, `wrangler secret put`, etc.) evolves between major versions; if a command here doesn't match your installed version, run it with `--help` and use the current syntax.
- This README documents the intended, reviewed behavior of every file in this repo, but — as noted in section 10 — none of it has been exercised against a real, live Cloudflare/Supabase deployment from within this environment. Run `npm run dev:remote` as your first real check before deploying to production.

## 19. Image uploads — Supabase Storage setup

`POST /api/admin/uploads` (src/controllers/mediaController.js) uploads product/category/gallery/business images to a **real** Supabase Storage bucket — there is no fake/local-only upload path. Before it will work:

1. In the Supabase dashboard, go to **Storage** and create a bucket named exactly `business-media`.
2. Make the bucket **public** (Storage → business-media → Configuration → Public bucket). Every image this uploads is already public-facing content (menu photos, gallery, business logo/cover) shown on the storefront, so this matches how the rest of the site already treats images.
3. Set two additional Worker secrets (in **addition** to `JWT_SECRET`/`ADMIN_PASSWORD` from section 8):
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
   `SUPABASE_URL` is your project's API URL (`https://<project-ref>.supabase.co`); `SUPABASE_SERVICE_ROLE_KEY` is from Supabase dashboard → Project Settings → API — **never** put this key in the frontend, in `wrangler.jsonc` `vars`, or in any `VITE_*` variable. It only ever lives as a Worker secret and is only ever used server-side inside `mediaController.js` (section 51: "Never expose `SUPABASE_SERVICE_ROLE_KEY` to frontend code").
4. For local `wrangler dev`, add both to `.dev.vars` (gitignored) instead.
5. Until these are set, `POST /api/admin/uploads` returns a clear `500` explaining exactly what's missing — it does not silently pretend to succeed.

Upload path convention: `business-media/<business_id>/<purpose-folder>/<random-id>.<ext>` — scoped per business (section 8 isolation applies to storage paths, not just database rows), with a server-generated filename and extension derived from the validated MIME type, never from the client-supplied filename (section 97).

## 20. Payment provider setup — Paymob (online payments)

**Honest status**: `src/services/payments/paymobProvider.js` implements Paymob's documented Accept API flow (auth → order registration → payment key → iframe checkout) and its documented HMAC webhook verification, built from training knowledge of Paymob's public API. It has **not** been exercised against a live Paymob merchant account from this environment — no credentials are available here. `tests/payments.pgmem.test.mjs` verifies the HMAC cryptography itself (with a hand-computed reference signature) and every database-level guarantee (amount/currency/order/business matching, replay/duplicate protection), but that is not the same as a real end-to-end run. **Before relying on this in production**, a developer with a real Paymob merchant account must:

1. Create a Paymob account at [accept.paymob.com](https://accept.paymob.com) (Egypt-focused; supports cards and local payment methods).
2. Set up an **Integration** (e.g. "Online Card") in the Paymob dashboard and note its **Integration ID**.
3. Create an **iframe** linked to that integration and note its **Iframe ID**.
4. Get the account's **API Key** from Settings → Account Info.
5. Get the **HMAC secret** from Settings → Webhooks/HMAC — this is what verifies a webhook actually came from Paymob (section 36); without it, the webhook endpoint rejects everything with 401.
6. In the Paymob dashboard, set the **Transaction Processed Callback** (webhook) URL to:
   `https://<your-worker-domain>/api/payments/webhook/paymob`
7. Set four Worker secrets (never plain `wrangler.jsonc` vars, never in the frontend):
   ```bash
   npx wrangler secret put PAYMOB_API_KEY
   npx wrangler secret put PAYMOB_INTEGRATION_ID
   npx wrangler secret put PAYMOB_IFRAME_ID
   npx wrangler secret put PAYMOB_HMAC_SECRET
   ```
   For local `wrangler dev`, add the same four to `.dev.vars` instead.
8. **Verify the HMAC field list against Paymob's current documentation** before going live — `HMAC_FIELD_PATHS` in `paymobProvider.js` is explicitly flagged in a comment as something payment gateways occasionally change, and this environment could not cross-check it against live docs.
9. Run a real test transaction end-to-end (Paymob provides test/sandbox card numbers) and confirm in the `payment_webhook_events` table that it was recorded with `outcome = 'processed'` and the order's `payment_status` became `paid`.

Until these steps are done, `POST /api/orders/:id/pay/online` fails with a clear `500` naming exactly which secret is missing — it never fakes a successful checkout URL (section 102: "Do NOT simulate a real payment gateway").

**What's already real and doesn't need further work**: the provider abstraction (`services/payments/providerContract.js`), the cash-payment flow (unchanged from Phase 2, fully working), the webhook's signature verification logic, the amount/currency/order/business re-verification against the authoritative order row, and the atomic replay-protection unique index (migration `0004`) — none of that depends on having live credentials to be correct, and all of it is exercised by `npm test`.

**Adding a second/different provider**: implement `PaymentProvider`'s four methods in a new file under `services/payments/`, register it in `services/payments/index.js`'s `providers` map and `PAYMENT_METHOD_PROVIDER` map, and nothing in `paymentController.js`, `orderController.js`, or the frontend needs to change.

## 21. Rate limiting setup (Phase 7 security hardening)

`src/middleware/rateLimit.js` implements request throttling for the most abuse-prone endpoints — admin login, customer login/register, order creation, and coupon-code validation (section 98) — using Cloudflare's native [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), the correct primitive for this on Workers (no external service, KV, or Durable Object needed).

**Honest status**: this cannot be created or exercised inside this sandbox — it requires a real Cloudflare account. The middleware **fails open** when the binding isn't configured (requests pass through normally, with the missing binding logged) specifically so this never becomes a self-inflicted outage in dev or in this sandbox's tests. Actual throttling behavior is `Pending Cloudflare Worker runtime verification`.

To enable it for real:

1. Uncomment and configure the `unsafe.bindings` block in `wrangler.jsonc` (commented out there with the general shape) — **verify the exact syntax against Cloudflare's current Rate Limiting docs first**, since binding configuration formats do change and this could not be cross-checked against live docs from this environment.
2. Choose limits appropriate to your traffic (the commented example uses 10 login attempts/60s and 20 order-creation attempts/60s as a starting point, not a verified recommendation).
3. Deploy and confirm (e.g. via a quick load-testing tool) that a burst of requests past the configured limit gets a `429 { error: { code: 'RATE_LIMITED' } }` response.

Without this configured, the corresponding endpoints still work correctly — they're just not throttled, same as before this phase.

## 22. Password reset setup (Phase 7 — closes a real gap found in the security audit)

`POST /api/auth/forgot-password` / `POST /api/auth/reset-password` (admin) and the same two under `/api/customers/` (customer) issue a single-use, 30-minute, SHA-256-hashed reset token (migration `0005`) and never reveal whether a given email actually has an account — both endpoints always respond `{ requested: true }` regardless.

**Honest status**: actually *delivering* the reset link requires an email provider, and no credentials exist in this sandbox. `src/services/email/index.js` implements a real integration against [Resend](https://resend.com) when `RESEND_API_KEY` is configured; without it, the endpoint still behaves correctly and securely (generic response, real token generated and stored) but the email is never sent — only logged server-side with a warning (visible via `wrangler tail`, never returned to the client). To enable real delivery:

1. Create a Resend account and verify a sending domain (or use their `onboarding@resend.dev` test address for development).
2. `npx wrangler secret put RESEND_API_KEY`
3. Optionally set `RESEND_FROM_ADDRESS` in `wrangler.jsonc` vars to your verified sender.
4. Both the customer-facing (`/forgot-password`, `/reset-password`) and admin-facing (`/admin/forgot-password`, `/admin/reset-password`) reset pages are built in the frontend (Phase 8) — the flow is `/admin/login` → "نسيت كلمة المرور؟" → `/admin/forgot-password` → (email link) → `/admin/reset-password?token=...` → `/admin/login`. The old seed-script fallback (change `ADMIN_PASSWORD` in `.env`, re-run `npm run seed` — see section 9) still works too, useful when Resend isn't configured yet.

What's already real regardless of email delivery: token generation (cryptographically random, never predictable), hashing (a full database compromise never reveals a usable raw token), single-use enforcement, 30-minute expiry, and the anti-enumeration generic response — all covered by `tests/security-audit.pgmem.test.mjs`.
