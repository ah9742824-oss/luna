// Generates public/sitemap.xml and public/robots.txt before each build,
// using the real deploy URL from VITE_SITE_URL (never a hardcoded Luna
// domain — section 64/81: this frontend template is reused for other
// clients, so the sitemap must be generated per-deployment, not baked in).
//
// Only STATIC, public, indexable routes are listed (section 64) — cart,
// checkout, profile, order-tracking, and admin pages are private/dynamic
// and are excluded via robots.txt instead of listed here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const siteUrl = (process.env.VITE_SITE_URL || 'https://example.com').replace(/\/$/, '');

const staticRoutes = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/menu', priority: '0.9', changefreq: 'daily' },
  { path: '/about', priority: '0.5', changefreq: 'monthly' },
  { path: '/gallery', priority: '0.5', changefreq: 'monthly' },
  { path: '/contact', priority: '0.5', changefreq: 'monthly' },
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticRoutes
  .map(
    (r) => `  <url>
    <loc>${siteUrl}${r.path}</loc>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

const robots = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /cart
Disallow: /checkout
Disallow: /orders
Disallow: /profile
Disallow: /login
Disallow: /register

Sitemap: ${siteUrl}/sitemap.xml
`;

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(publicDir, 'robots.txt'), robots);

// Cloudflare Pages (and most CI systems) set CI=true automatically for
// build-server builds — a real production deploy is (almost) always a CI
// build, while `npm run build` on a developer's own laptop usually isn't.
// Using that as the signal means: local builds still work with the
// example.com placeholder (so `npm run build` never breaks for a
// developer who hasn't set up a domain yet), but a real Cloudflare Pages
// deploy FAILS LOUDLY instead of silently shipping a fake sitemap/OG URL
// to real search engines and social previews (section 64) — exactly the
// "not accidentally deployed" requirement from the Phase 8 spec.
const isLikelyCiBuild = process.env.CI === 'true' || process.env.CI === '1';

if (!process.env.VITE_SITE_URL) {
  if (isLikelyCiBuild) {
    console.error(
      '[generate-sitemap] FATAL: VITE_SITE_URL is not set, and this looks like a CI/production build (CI env var is set). ' +
      'Refusing to deploy sitemap.xml/robots.txt/Open Graph URLs pointing at the placeholder "https://example.com". ' +
      'Set VITE_SITE_URL to your real Cloudflare Pages domain (or custom domain) in the Pages project\'s environment variables.'
    );
    process.exit(1);
  }
  console.warn(
    '[generate-sitemap] VITE_SITE_URL is not set — sitemap.xml/robots.txt were generated with the placeholder ' +
    '"https://example.com". Set VITE_SITE_URL to your real deployed domain before shipping to production. ' +
    '(This is only a warning, not a build failure, because this does not look like a CI build.)'
  );
} else {
  console.log(`[generate-sitemap] Generated sitemap.xml / robots.txt for ${siteUrl}`);
}
