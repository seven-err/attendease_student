/**
 * AttendEase Student Portal - Service Worker
 * Phase 6: PWA Static Application Shell Caching
 *
 * CRITICAL SECURITY CONSTRAINTS:
 * - Caches ONLY static app shell assets (HTML, CSS, JS, SVG/images, fonts).
 * - NEVER intercepts or caches Supabase API, database RPCs, or external requests.
 * - NEVER caches authentication, credentials, or issue report submissions.
 * - Zero API response caching in Service Worker Cache API.
 */

const CACHE_NAME = 'attendease-student-shell-v1';

// Static resources required to render the application shell offline
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/attendease.png',
];

// 1. Install Event: Pre-cache core shell resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn('[SW] Pre-cache non-fatal error:', err);
        });
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// 2. Activate Event: Purge old cache versions and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('attendease-student-shell-') && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

// 3. Fetch Event: Safe Static Asset Caching Strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // CONSTRAINT 1: Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // CONSTRAINT 2: NEVER intercept or cache Supabase, RPCs, or API endpoints
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/rpc/') ||
    url.pathname.includes('student_portal_')
  ) {
    // Explicitly bypass service worker — direct network request
    return;
  }

  // CONSTRAINT 3: Only cache same-origin static requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Same-origin static asset strategy: Stale-While-Revalidate for navigations & shell assets
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          // If response is valid, clone and update the static cache
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and request is a navigation, fallback to cached index.html or root
          if (request.mode === 'navigate') {
            return caches.match('/index.html').then((indexRes) => indexRes || caches.match('/'));
          }
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
