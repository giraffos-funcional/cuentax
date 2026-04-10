/**
 * CuentaX Service Worker
 * Network-first for navigation, cache-first for static assets.
 */

const CACHE_NAME = 'cuentax-v1';
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/dashboard/gastos',
  '/dashboard/gastos/escanear',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network first, cache fallback for navigation
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache first for static assets
  if (event.request.url.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
