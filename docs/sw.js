// Offline support: the first visit saves every file the app needs; later visits work with no connection.
// Bump VERSION whenever any file below changes so phones pick up the new copy on their next online launch.
const VERSION = 'shinykitt-v1';
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'worker.js',
  'manifest.webmanifest',
  'engine/pf.js',
  'engine/pf.wasm',
  'fonts/vt323.woff2',
  'fonts/press-start-2p.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first (instant, works offline); refresh the cache in the background when online.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(event.request, { ignoreSearch: true });
      const refresh = fetch(event.request)
        .then((res) => { if (res.ok) cache.put(event.request, res.clone()); return res; })
        .catch(() => null);
      return hit || (await refresh) || new Response('Offline and not cached yet', { status: 503 });
    })
  );
});
