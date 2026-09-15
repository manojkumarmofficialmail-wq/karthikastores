/**
 * Karthika Stores service worker.
 *
 * - App shell (HTML/JS/CSS/icons): stale-while-revalidate, so the storefront
 *   opens instantly and offline.
 * - Catalogue GETs (/api/store, /api/catalog/*): network first with a cache
 *   fallback, so a customer on a patchy 4G connection can still browse and
 *   fill a basket; the basket itself syncs when the network returns.
 * - Everything else (auth, cart writes, orders, payments) is never cached.
 */
// Bump on every shell change: the activate handler deletes any cache whose
// key does not start with the current version, which is what stops a
// returning customer being served last release's JavaScript.
const VERSION = 'ks-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'];
const CACHEABLE_API = [/^\/api\/store($|\/)/, /^\/api\/catalog\//];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

const networkFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: { message: 'You are offline. Showing what we had saved.' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached ?? network;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (CACHEABLE_API.some((pattern) => pattern.test(url.pathname))) {
      event.respondWith(networkFirst(request, DATA_CACHE));
    }
    return;
  }

  // SPA navigations always resolve to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r ?? Response.error()))
    );
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
