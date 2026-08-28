/* Prism AI — Service Worker
 * Estrategia (v4): todo network-first con fallback a caché.
 * Así las actualizaciones de la app llegan siempre al instante y sin
 * quedarnos con CSS/JS viejos; offline se usan las copias cacheadas.
 */
const VERSION = 'prism-ai-v4';
const PAGE_CACHE = `${VERSION}-pages`;
const PRECACHE = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGE_CACHE);
      await Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Nunca interceptar API interna (chat/proxy) ni HMR de desarrollo.
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  // Navegación, assets e iconos: network-first con fallback a caché.
  // (evita quedarnos con CSS/JS de versiones anteriores)
  event.respondWith(
    (async () => {
      const cache = await caches.open(PAGE_CACHE);
      try {
        const res = await fetch(req);
        if (res.ok && (req.mode === 'navigate' || url.origin === self.location.origin)) {
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const shell = await cache.match('/');
          if (shell) return shell;
        }
        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })()
  );
});
