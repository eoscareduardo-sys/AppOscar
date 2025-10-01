// A robust, cache-first service worker
const CACHE_NAME = 'gestion-finanzas-cache-v4'; // Version updated for robust caching & icon font
const urlsToCache = [
  '/',
  '/index.html',
  '/index.css',
  '/index.tsx',
  '/cookbook.json',
  '/metadata.json',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  // Cache the actual font file for Font Awesome for full offline support
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2'
];

// Install event: caches the app shell and static assets.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching assets');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // Force the waiting service worker to become the active service worker.
});

// Activate event: cleans up old caches.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Become the service worker for clients that are already loaded.
});

// Fetch event: serves assets from cache first.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // If we have a match in the cache, return it.
        if (response) {
          return response;
        }
        // Otherwise, fetch from the network.
        return fetch(event.request);
      }
    )
  );
});