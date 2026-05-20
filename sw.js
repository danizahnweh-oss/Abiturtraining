const CACHE_NAME = 'myabiflow-v141';
const STATIC_ASSETS = [
  './',
  './index.html',
  './impressum.html',
  './shared-v4.css',
  './shared.js',
  './tour.js',
  './logo.png'
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

  // API calls auf gleicher Origin: network only, JSON-Fehler bei offline
  // WICHTIG: Origin-Check zuerst, sonst werden externe Worker-APIs (z.B. CF-Worker
  // unter *.workers.dev) fälschlich als "Offline" gemeldet, sobald deren Response
  // den SW passiert.
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() =>
      new Response(JSON.stringify({ error: 'Offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      })
    ));
    return;
  }

  // External resources (fonts, CDN scripts/CSS): cache-first with network fallback
  if (url.hostname !== location.hostname) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      }).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // HTML + shared.js: network-first so updates arrive immediately
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/shared.js')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
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
        if (response.ok && event.request.method === 'GET' && !wrongMime) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => new Response('Offline', { status: 503 }))
  );
});
