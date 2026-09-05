# Deployment Guide

Practical, ordered deployment procedure for:

```text
GitHub
   ↓
Supabase project
   ↓
Run migrations
   ↓
Configure Storage
   ↓
Configure secrets
   ↓
Create Hyperdrive binding
   ↓
Deploy Worker (backend)
   ↓
Deploy Pages (frontend)
   ↓
Set frontend environment variables
   ↓
Configure CORS origins
   ↓
Verify production API
   ↓
Verify frontend
```

**Honesty note:** every command below is real and matches this repo's actual `package.json`/`wrangler.jsonc` — nothing here is invented. None of it has been *run* against a live Cloudflare/Supabase account from this environment (no such account exists here) — see the "Production verification checklist" at the end for what's `Verified locally` vs what still needs a real run.

---

## 1. GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

`.gitignore` (root, `backend/`, `frontend/`) already excludes `node_modules/`, `.env`, `.dev.vars`, `dist/`, `.wrangler/`, and `*.log` — confirmed empty of secrets by a repo-wide grep before every phase checkpoint in this project's history.

## 2. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Get the connection string: Project Settings → Database → Connection string (URI) → note it for `SUPABASE_DB_URL`.
3. Get the API URL and service role key: Project Settings → API → note `Project URL` (for `SUPABASE_URL`) and `service_role` key (for `SUPABASE_SERVICE_ROLE_KEY` — **never** the `anon` key for this one; the service role key is what lets the Worker write to Storage on the admin's behalf).

### Run migrations

```bash
cd backend
cp .env.example .env
# Fill in SUPABASE_DB_URL, ADMIN_EMAIL, ADMIN_PASSWORD in .env
npm install
npm run migrate
```

`database/migrate.js` applies every file in `database/migrations/` in order (`0001` → `0005` as of Phase 7), tracked in a `schema_migrations` table so it's safe to re-run — already-applied migrations are skipped, never re-run or reverted. **To check the current migration level**, query the database directly: `SELECT name, applied_at FROM schema_migrations ORDER BY name;`. **Never** manually edit the production schema outside of a new numbered migration file — see `backend/README.md` "Migrations" for the reasoning.

### Seed demo data (optional, safe/non-destructive)

```bash
npm run seed
```

Creates the `luna-cafe` business (if migration `0001`'s fallback insert didn't already) plus demo categories/products/reviews/gallery **only where empty** — never overwrites existing data (see `backend/database/seed.js`'s own header comment for the exact idempotency rules). Also creates/updates the admin account from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

### Configure Storage

1. Storage → Create bucket → name it exactly `business-media` → **make it public**.
2. That's it for MVP — no folder structure needs to be created manually; `mediaController.js` creates paths on the fly (`<business_id>/<purpose>/<random-id>.<ext>`).

### RLS / triggers — what to verify manually

Every RLS policy in this project follows one shape: `USING (business_id = current_setting('app.current_business_id', true)::integer)`, `FORCE`d on every business-scoped table. This has been verified by code review but **never executed against real Postgres** (the test suite uses pg-mem, which doesn't implement RLS at all — see `SECURITY.md` §4). Before production traffic:

1. **Create a dedicated, least-privilege database role** for the Worker to connect as — **not** the default `postgres` role, which owns every table and therefore bypasses `FORCE ROW LEVEL SECURITY` entirely (this is the single most important manual step in this whole guide). Grant it only `SELECT, INSERT, UPDATE, DELETE` on the specific tables it needs, never ownership.
2. Point `SUPABASE_DB_URL` (used by Hyperdrive) at that role, not `postgres`.
3. As that role, manually attempt a cross-business query (e.g. `SET app.current_business_id = '1'; SELECT * FROM orders WHERE business_id = 2;`) and confirm it returns zero rows even with an explicit `business_id = 2` in the query — that's RLS actually blocking it, independent of the application layer's own `WHERE` clause.
4. Confirm the `set_updated_at()` trigger fires (update any row, check `updated_at` changed).

## 3. Cloudflare Workers (backend)

```bash
cd backend
npx wrangler login
```

### Hyperdrive binding

```bash
npx wrangler hyperdrive create luna-cafe-db --connection-string="<your SUPABASE_DB_URL, using the least-privilege role from step 2 above>"
```

Copy the printed `id` into `wrangler.jsonc`'s `hyperdrive[0].id` (replacing `REPLACE_WITH_YOUR_HYPERDRIVE_ID`). This id is not a secret — Cloudflare stores the actual connection string encrypted separately.

### Worker secrets (never `wrangler.jsonc` vars, never in the frontend)

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Only if enabling online payments (see backend/README.md §20):
npx wrangler secret put PAYMOB_API_KEY
npx wrangler secret put PAYMOB_INTEGRATION_ID
npx wrangler secret put PAYMOB_IFRAME_ID
npx wrangler secret put PAYMOB_HMAC_SECRET
# Only if enabling password-reset emails (see backend/README.md §22):
npx wrangler secret put RESEND_API_KEY
```

### Plain vars (edit `wrangler.jsonc` directly, then redeploy)

`CLIENT_URL` (comma-separated list of every frontend origin that will call this API — see §5 below), `JWT_EXPIRES_IN`, `CUSTOMER_JWT_EXPIRES_IN`, `DEFAULT_BUSINESS_SLUG` (optional — see the comment above it in `wrangler.jsonc`), and optionally `RESEND_FROM_ADDRESS`.

### Rate limiting (optional but recommended)

Uncomment and configure the `unsafe.bindings` block in `wrangler.jsonc` — **verify the exact syntax against Cloudflare's current Rate Limiting docs first** (flagged in the file itself; binding formats change). Without this, the API still works correctly — `middleware/rateLimit.js` fails open — it's just not throttled.

### Deploy

```bash
npm run deploy
```

This runs `wrangler deploy`, which reads `src/worker.js` as the entrypoint and `wrangler.jsonc` for bindings/vars. Note the deployed `*.workers.dev` URL (or your custom domain, §7) — this is your `VITE_API_URL` for the frontend, with `/api` appended (e.g. `https://luna-cafe-api.<your-subdomain>.workers.dev/api`).

## 4. Cloudflare Pages (frontend)

Via the Cloudflare dashboard (Pages → Create a project → Connect to GitHub), or CLI:

```bash
cd frontend
npm run build   # runs prebuild (sitemap/robots generation) then vite build
npx wrangler pages deploy dist --project-name=luna-cafe-frontend
```

**Build settings** (if configuring via the dashboard's Git integration instead of CLI):
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `frontend` (if deploying from the monorepo root)

### Frontend environment variables (set in the Pages project's dashboard, or a `.env` for local builds)

| Variable | Example | Notes |
|---|---|---|
| `VITE_API_URL` | `https://luna-cafe-api.<subdomain>.workers.dev/api` | The deployed Worker's URL from §3, plus `/api`. |
| `VITE_BUSINESS_SLUG` | `luna-cafe` | Which business this frontend build is for (§74/81 — the setting that changes for a new client). |
| `VITE_SITE_URL` | `https://luna-cafe.pages.dev` (or your custom domain) | **Required for production** — `scripts/generate-sitemap.mjs` now hard-fails the build (exit code 1) if this is unset AND the build environment looks like CI (Cloudflare Pages sets `CI=true` automatically), specifically so a placeholder `https://example.com` sitemap/robots.txt/Open Graph URL can never be accidentally deployed. Verified locally in this sandbox by running the script with `CI=true` and no `VITE_SITE_URL` set, and confirming exit code 1. |

Set these in Cloudflare Pages: Project → Settings → Environment variables (separate values for Production and Preview if they differ).

## 5. SPA routing (direct-load / refresh on client-side routes)

`frontend/public/_redirects` (a Cloudflare Pages convention, copied verbatim into `dist/` by Vite) contains `/*  /index.html  200`. This makes every route in `App.jsx` — `/menu/:id`, `/cart`, `/checkout`, `/orders/:id`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/admin`, `/admin/login`, `/admin/forgot-password`, `/admin/reset-password`, and all the rest — load correctly on a direct URL open or a page refresh, instead of Cloudflare Pages' static file server returning a real 404 for paths that don't correspond to an actual file. **Verified locally** (the file is confirmed present in `dist/` after `npm run build` — see the Phase 8 completion report); actual Cloudflare Pages routing behavior is `Pending Cloudflare Worker runtime verification` (this sandbox cannot deploy to Pages).

## 6. CORS production origins

Set `CLIENT_URL` in `wrangler.jsonc` (backend) to the **exact** production Pages URL(s), comma-separated if there's more than one frontend sharing this backend:

```jsonc
"CLIENT_URL": "https://luna-cafe.pages.dev,https://your-custom-domain.com"
```

Redeploy the Worker (`npm run deploy`) after changing this — `wrangler.jsonc` vars are baked in at deploy time, not read live. See `SECURITY.md` §10 for what was verified locally about this logic (allowlist matching, required headers/methods) versus what needs a real browser to confirm.

## 7. Custom domain readiness (optional — not required for MVP)

- **Cloudflare Pages custom domain**: Pages project → Custom domains → Add a domain you own → follow the DNS instructions Cloudflare provides (a `CNAME` to your `*.pages.dev` URL, or full Cloudflare DNS management if the domain's nameservers point at Cloudflare).
- **Worker custom domain**: Worker → Settings → Domains & Routes → Add a custom domain (e.g. `api.your-domain.com`) — then update `VITE_API_URL` in the Pages project to match, and `CLIENT_URL` in `wrangler.jsonc` if the Pages domain also changed.
- No domain purchase is required for the MVP — the free `*.pages.dev` and `*.workers.dev` subdomains work for both.

## 8. Database migrations — staying safe and repeatable

- Every schema change is a new numbered file in `backend/database/migrations/`, never a manual edit to an existing one (existing migrations are historical record — see `backend/README.md` "Migrations").
- `npm run migrate` is idempotent — safe to run on every deploy; it only applies files not yet recorded in `schema_migrations`.
- **Never** run `npm run seed:demo-reset` against production data — it's destructive by design (wipes and reseeds demo content) and requires an explicit `CONFIRM_RESET=yes` specifically to make that impossible to trigger accidentally.

---

## Production verification checklist

Run through this after every deploy. Each item is tagged with its actual verification status **in this project's history** — `Verified locally` items have an automated test backing them; everything else genuinely needs a live check against your own deployment, which this sandbox cannot perform.

| Check | Status |
|---|---|
| `GET /healthz` and `GET /api/health` return `{ status: 'ok' }` | Manual production verification required |
| Hyperdrive → Supabase connectivity (any real query succeeds) | Manual production verification required |
| Admin login (`POST /api/auth/login`) | Verified locally (logic); manual production verification required (live run) |
| Customer login/register | Verified locally (logic); manual production verification required |
| Product/category/menu loading (public GET routes) | Manual production verification required |
| Cart validate → real server-computed subtotal | Verified locally (pricing logic); manual production verification required |
| Checkout → order creation → idempotency | Verified locally; manual production verification required |
| Order tracking (guest token + logged-in customer) | Verified locally (ownership logic); manual production verification required |
| Admin order management (status/payment-status transitions) | Verified locally; manual production verification required |
| Image upload → real Supabase Storage URL | Manual production verification required (needs real bucket + secrets) |
| PWA: manifest, service worker install, offline app shell | Verified locally (build output inspected — manifest.webmanifest, sw.js, correct NetworkOnly/CacheFirst split); Pending Cloudflare Worker/browser runtime verification |
| QR code generation renders and scans to `/menu` | Verified locally (qrcode library output validated); Manual production verification required (scan with a real device) |
| CORS: configured origin accepted, untrusted origin rejected, PATCH/Idempotency-Key/X-Business-Slug allowed | Verified locally; Pending Cloudflare Worker runtime verification |
| Rate limiting (429 after threshold) | Implemented, fails open; Pending Cloudflare Rate Limiting binding + live verification |
| Payment initiation (`POST /api/orders/:id/pay/online`) | Verified locally (logic, error wrapping); Pending live Paymob credentials/transaction |
| Payment webhook (signature verification, amount/currency/order/business checks, replay protection) | Verified locally (real HMAC crypto + DB guarantees); Pending live Paymob transaction |
| Client cannot set `payment_status = paid` | Verified locally | 
| HTTPS everywhere (Cloudflare Pages + Workers are HTTPS-only by default) | Pending — inherent to the platform, confirm no mixed-content warnings after deploy |
| Error responses never leak stack traces / raw DB errors | Verified locally (`errorHandler.js` reviewed + tested) |
| RLS actually blocks cross-business access at the database layer (not just the app layer) | Pending Supabase verification — see §2 "RLS/triggers" above for the exact manual steps |
| `sitemap.xml`/`robots.txt` reflect the real production domain, not `example.com` | Verified locally (build fails in CI without `VITE_SITE_URL` — confirmed by direct test) |

**Bottom line**: this project's backend logic, security properties, and build configuration are extensively tested (223 automated checks across 5 test suites as of Phase 7, all passing, `0 failures`). What remains before calling this "production-verified" is exactly one thing repeated across every row above — an actual deploy to real Cloudflare + Supabase + (optionally) Paymob/Resend accounts, which does not exist in this sandbox.
