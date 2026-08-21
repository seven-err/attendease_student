import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Use the existing manifest from public/ rather than generating a new one
      manifest: false,
      // Workbox config — mirrors the hand-written sw.js security constraints
      workbox: {
        // Precache all build output (HTML, hashed JS/CSS, icons)
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,ico,woff,woff2}'],
        // NEVER cache Supabase API calls
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/rest\//, /^\/rpc\//, /supabase\.co/],
        runtimeCaching: [
          {
            // Same-origin static assets — stale-while-revalidate (mirrors old SW logic)
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin &&
              !url.pathname.startsWith('/rest/') &&
              !url.pathname.startsWith('/rpc/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'attendease-student-shell-v2',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // Don't activate SW in dev (avoid conflicts with hot reload)
      },
    }),
  ],
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
  },
});
