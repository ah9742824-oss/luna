# Creating a New Client (New Business Frontend)

This is the core value of the reusable architecture (section 74/81): **one backend, many frontends.** Adding a new client — a restaurant, a bakery, a store — never requires touching the backend.

```text
Clone frontend
   ↓
Set BUSINESS_SLUG
   ↓
Set API URL
   ↓
Configure branding
   ↓
Configure enabled modules
   ↓
Configure VITE_SITE_URL
   ↓
Build
   ↓
Deploy to Cloudflare Pages
```

## What stays in the reusable backend (never touched per-client)

- Every route/controller/service under `backend/src/` — multi-tenant by construction, resolves the business from `X-Business-Slug` on every request.
- The database schema and migrations.
- Authentication, RBAC, payment provider integration, RLS policies.

## What belongs to each client frontend

Everything under `frontend/` is a template, cloned once per client:

- `.env` (`VITE_BUSINESS_SLUG`, `VITE_API_URL`, `VITE_SITE_URL`) — the only backend-facing config that changes.
- `src/index.css` — colors, fonts, spacing (currently LUNA Café's coffee/cream palette).
- Copy/branding hardcoded in components (hero text fallbacks, About page copy, translation strings in `src/i18n/translations.js`) — see "What to customize" below.
- `frontend/public/*.png` — PWA icons, favicon.
- A separate Cloudflare Pages project (own deploy, own domain).

## Step-by-step

### 1. Create the business row on the shared backend

```sql
INSERT INTO businesses (name, name_ar, slug, type, order_number_prefix)
VALUES ('Restaurant X', 'مطعم إكس', 'restaurant-x', 'restaurant', 'RESTX');
```

(Or build a small internal admin tool for this later — not required for the MVP; a direct SQL insert against the migrated schema is sufficient and safe, since every table this row's children depend on already has `business_id` foreign keys pointing at it.)

Then create the first `super_admin` profile for that business (via `database/seed.js`-style logic, or directly):

```sql
INSERT INTO profiles (business_id, role_id, name, email, password_hash)
VALUES (
  (SELECT id FROM businesses WHERE slug = 'restaurant-x'),
  (SELECT id FROM roles WHERE key = 'super_admin'),
  'Owner Name', 'owner@restaurant-x.com',
  -- generate with: node -e "require('bcryptjs').hash('a-real-password', 10).then(console.log)"
  '<bcrypt hash>'
);
```

### 2. Clone the frontend

```bash
cp -r frontend restaurant-x-frontend
cd restaurant-x-frontend
rm -rf node_modules dist
```

(Or, more realistically for an actual second repo: a fresh `git clone` of the frontend as its own repository, per section 6's "Repository strategy" — separate repos, one reusable backend, multiple frontend repos.)

### 3. Set BUSINESS_SLUG and API URL

```bash
cp .env.example .env
```
Edit `.env`:
```
VITE_API_URL=https://luna-cafe-api.<your-subdomain>.workers.dev/api   # same backend for every client
VITE_BUSINESS_SLUG=restaurant-x                                        # the ONLY thing that changes per client
VITE_SITE_URL=https://restaurant-x.pages.dev                           # this client's own domain
```

### 4. Configure branding

- `src/index.css`: update the `:root` CSS custom properties (`--color-coffee`, `--color-cream`, etc.) to the new client's palette.
- `frontend/public/`: replace `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, `apple-touch-icon.png`, `favicon-32x32.png` with the new client's logo/icon (same filenames — `vite.config.js`'s PWA manifest references them by these exact names, so keeping the names avoids a config change).
- `vite.config.js`: update the `VitePWA` plugin's `manifest.name`/`short_name`/`description`/`theme_color`/`background_color` for this client.
- Hardcoded fallback copy (used only before the API's real business data has loaded, or when it lacks a description): `src/pages/Home.jsx`, `src/pages/About.jsx` — search for the Arabic/English fallback strings and adjust if the new client's default tone should differ. **Real business name/description/contact info always comes from the API** (`GET /api/business`) once loaded — these fallbacks are cosmetic only.
- `src/i18n/translations.js`: mostly generic UI strings, no per-client change needed unless the new client wants different wording for something specific.

### 5. Configure enabled modules

Set via the business row itself (`businesses.enabled_modules` jsonb — editable through `PUT /api/business` from the admin dashboard's Business Settings page, or directly in SQL): `{ "ordering": true, "reviews": true, "gallery": true, "coupons": true, "delivery": true, "pickup": true, "dine_in": false, "bookings": false }`. The frontend's `src/config/appConfig.js` has a local default copy used only before the real business data loads.

Also set the order-type toggles directly on `businesses` (`accept_pickup`/`accept_delivery`/`accept_dine_in`) — a store that doesn't do dine-in should have `accept_dine_in = false`, and the Checkout page automatically hides that option (see `frontend/src/pages/Checkout.jsx`'s `availableTypes`).

### 6. Build and deploy

```bash
npm install
VITE_SITE_URL=https://restaurant-x.pages.dev npm run build
npx wrangler pages deploy dist --project-name=restaurant-x-frontend
```

(Or connect the new frontend repo to a new Cloudflare Pages project via the dashboard, and set the three `VITE_*` variables in that project's environment variables instead of a local `.env` — same effect, see `DEPLOYMENT.md` §4.)

### 7. Update backend CORS

The shared backend's `CLIENT_URL` (in `wrangler.jsonc`) must include the new client's Pages domain, comma-separated with every other client already there:

```jsonc
"CLIENT_URL": "https://luna-cafe.pages.dev,https://restaurant-x.pages.dev"
```

Redeploy the Worker (`cd backend && npm run deploy`) after this change — see `DEPLOYMENT.md` §6 / `SECURITY.md` §10.

## What's NOT built yet (future, per MASTER PROMPT V2 section 76/81)

An in-dashboard "create a new client" wizard is explicitly a future module, not part of the MVP — today, onboarding a new client is the manual (but straightforward, ~15 minute) process above. This is intentional per the master prompt's guidance not to over-build (section 73/103): the reusable *architecture* is real and complete; a self-service provisioning UI on top of it is future work.
