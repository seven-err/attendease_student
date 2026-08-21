import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Use the existing manifest from public/
      manifest: false,
      workbox: {
        // Precache all build output (HTML, hashed JS/CSS, icons)
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,ico,woff,woff2}'],
        // NEVER cache Supabase API calls
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/rest\//, /^\/rpc\//, /supabase\.co/],
        // Clean up old Workbox and hand-written SW caches automatically
        cleanupOutdatedCaches: true,
        // Skip waiting so new SW takes over immediately (no stale page served)
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Same-origin static assets — stale-while-revalidate
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin &&
              !url.pathname.startsWith('/rest/') &&
              !url.pathname.startsWith('/rpc/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'attendease-student-shell-v3',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // Keep SW off in dev
      },
    }),
  ],
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
  },
});
