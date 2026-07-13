// Vivaah Ledger — Service Worker
// Version: bump this string whenever you deploy changes to force cache refresh
const CACHE_NAME = 'vivaah-ledger-v1';

// All assets to pre-cache on install
const PRECACHE_URLS = [
  '/Vivaah-Ledger/',
  '/Vivaah-Ledger/index.html',
  '/Vivaah-Ledger/manifest.json',
  '/Vivaah-Ledger/icons/icon-192x192.png',
  '/Vivaah-Ledger/icons/icon-512x512.png'
];

// ── Install: pre-cache core assets ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())   // activate immediately
  );
});

// ── Activate: delete old caches ──────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())  // take control of all open tabs
  );
});

// ── Fetch: Cache-first for same-origin, network-first for everything else ────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Same-origin requests → cache-first with network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;

        return fetch(event.request).then(response => {
          // Only cache valid responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          return response;
        }).catch(() => {
          // If the network is unavailable and it's a navigation request,
          // serve the cached index.html so the app still loads offline
          if (event.request.mode === 'navigate') {
            return caches.match('/Vivaah-Ledger/index.html');
          }
        });
      })
    );
  }
  // Cross-origin requests (CDN fonts, libs, etc.) → network-first, no caching
});
