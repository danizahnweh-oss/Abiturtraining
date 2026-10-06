const CACHE_NAME = 'myabiflow-v169-privacy';
const STATIC_ASSETS = [
  './',
  './index.html',
  './impressum.html',
  './shared-v4.css',
  './shared.js',
  './tour.js',
  './logo.png',
  './wave-icon.webp'
];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        STATIC_ASSETS.map(asset =>
          cache.add(asset).catch(e => console.warn('SW skip', asset, e))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('myabiflow-') && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API and HTML, cache-first for other assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Nur öffentliche, statische Dateien ohne Parameter dürfen in den Offline-Cache.
  // Insbesondere Transkripte (/session/), Tutor, KI-Proxy und externe Antworten
  // bleiben im Netzwerk. Ein angemeldeter Request wird niemals zwischengespeichert.
  const privateRequest = ['Authorization', 'X-Access-Token', 'X-Teacher-Token', 'X-Teacher-Auth-Token']
    .some(header => event.request.headers.has(header));
  const dynamicPath = /^\/(api|session|ws|v1beta|tutor|health)(\/|$)/.test(url.pathname);
  const staticPath = url.pathname === '/' || url.pathname === '/manifest.json' ||
    /\.(html|js|css|woff2?|png|jpe?g|gif|ico|svg|webp|mp4)$/.test(url.pathname);
  if (event.request.method !== 'GET' || url.origin !== location.origin ||
      url.search || privateRequest || dynamicPath || !staticPath) return;

  // HTML + shared.js: network-first so updates arrive immediately
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/shared.js') || url.pathname.endsWith('/wr-materials.js')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok && !response.headers.get('Cache-Control')?.includes('no-store')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match(url.href).then(exactUrlMatch => {
            if (exactUrlMatch) return exactUrlMatch;
            if (url.pathname === '/' || url.pathname === '') {
              return caches.match('./index.html');
            }
            return new Response('Offline - diese Seite ist derzeit nicht im Cache verfügbar.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          });
        }
        return new Response('Offline', { status: 503 });
      }))
    );
    return;
  }

  // Other static assets: cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Nie eine HTML-Fehlerseite als JS/CSS cachen (verhindert MIME-type-Fehler)
        const ct = response.headers.get('Content-Type') || '';
        const isJsOrCss = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
        const wrongMime = isJsOrCss && ct.includes('text/html');
        if (response.ok && !response.headers.get('Cache-Control')?.includes('no-store') && !wrongMime) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => new Response('Offline', { status: 503 }))
  );
});
