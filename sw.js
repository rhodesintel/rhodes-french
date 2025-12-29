// Rhodes French Service Worker - Offline-first caching
const CACHE_NAME = 'rhodes-french-v3.2';
const CDN_BASE = 'https://rhodesintel.github.io/rhodes-french/';

// Core assets to cache immediately (app shell)
const CORE_ASSETS = [
  './',
  './index.html',
  './js/fsi-main.js',
  './js/fsi-srs.js',
  './js/fsi-error.js',
  './js/fsi-linear.js',
  './js/fsi-auth.js',
  './data/drills.json',
  './data/confusables.json',
  './data/reverse_audio_mapping.json'
];

// Install: cache core assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching core assets');
        return cache.addAll(CORE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for assets, network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip external APIs (Firebase, GitHub API, etc.)
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('github.com') ||
      url.hostname.includes('gstatic.com')) {
    return;
  }

  // Audio files: cache on demand, fall back to network
  if (url.pathname.includes('/audio/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Audio unavailable offline - app will fall back to TTS
          return new Response('', { status: 404, statusText: 'Offline' });
        });
      })
    );
    return;
  }

  // Core assets: cache-first, background refresh
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      // Return cached immediately, update in background
      return cached || fetchPromise;
    })
  );
});

// Listen for skip waiting message
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Background sync for offline responses (future enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-progress') {
    console.log('[SW] Syncing progress...');
    // Could implement cloud sync here
  }
});
