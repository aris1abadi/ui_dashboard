const CACHE_NAME = 'karjoagro-ui-v4';
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './greenhouse.css',
  './app.js',
  './alpine.min.js',
  './mqtt.min.js',
  './manifest.webmanifest',
  './icon.svg',
  './offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Proxy semua request ke local controller (192.168.x.x / 10.x.x.x / 127.0.0.1) dari origin HTTPS
  if (url.protocol === 'http:' && !url.hostname.includes('.') && url.origin !== self.location.origin) {
    event.respondWith(proxyLocalRequest(request));
    return;
  }

  // Proxy request HTTP ke local IP
  if (url.protocol === 'http:' && /^(192\.168\..*|10\..*|172\.(1[6-9]|2[0-9]|3[01])\..*|127\.0\.0\.1|localhost)$/.test(url.hostname)) {
    event.respondWith(proxyLocalRequest(request));
    return;
  }

  if (request.method !== 'GET') return;

  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ ok: false, error: 'offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', responseClone));
          return response;
        })
        .catch(async () => (await caches.match('./index.html')) || caches.match('./offline.html'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
            }
            return response;
          })
          .catch(() => caches.match('./offline.html'));
      })
    );
  }
});

async function proxyLocalRequest(request) {
  try {
    // Clone request before sending karena body hanya bisa dibaca sekali
    const proxyReq = request.clone();
    const response = await fetch(proxyReq, { mode: 'cors', credentials: 'omit' });
    return response;
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
