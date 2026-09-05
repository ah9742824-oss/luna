import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Only the app SHELL (JS/CSS/HTML/icons/fonts) is precached — never
      // API responses. Real online ordering data must always come from a
      // live network request; caching it would silently show a customer
      // stale prices, stale order status, or let them "place an order"
      // while offline that never actually reaches the backend. See the
      // runtimeCaching NetworkOnly rule for /api/ below, which makes that
      // explicit rather than leaving it to workbox's default behavior.
      includeAssets: ['favicon-32x32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'LUNA Café',
        short_name: 'LUNA Café',
        description: 'اطلب من لونا كافيه — قهوة مختصة وأجواء دافئة',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        background_color: '#fdf6ec',
        theme_color: '#6f4e37',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the built app shell only.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Every backend call — orders, prices, availability, auth,
            // stats — is ALWAYS network-only. Never served from cache,
            // never queued for "background sync" pretending to be a real
            // order. If there's no network, these calls simply fail, and
            // the UI shows a real error state (see error handling already
            // built in every page from Phase 3/4) rather than a fake
            // success.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            // Remote menu/gallery/business photos — safe to cache: they're
            // just images, not transactional data, and a slightly stale
            // photo is harmless (unlike a stale price or stale order
            // status, which are never cached here).
            urlPattern: ({ url }) => url.hostname === 'images.unsplash.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'remote-images',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
