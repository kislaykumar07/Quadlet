/* Quadlet PWA service worker (v6.4).
   App shell cached for offline use; API calls always go to the network. */
const CACHE = 'quadlet-v7.4';
const SHELL = ['/', '/trips', '/dashboard', '/agents',
  '/style.css?v=7.4', '/app.js?v=7.4', '/nearby-ics.js?v=7.2', '/compare.js?v=7.2', '/ai.js?v=7.2', '/travel-links.js?v=7.2', '/destinations.js?v=7.2', '/watch.js?v=7.3',
  '/mili-face.jpg?v=3.6', '/watch/slide1.jpg', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.pathname.startsWith('/api/')) return; // live API: network only, never cached
  if (e.request.mode === 'navigate') {
    // Pages: network first, cached copy when offline.
    e.respondWith(fetch(e.request).then(r => {
      const c = r.clone();
      caches.open(CACHE).then(cc => cc.put(e.request, c));
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('/'))));
    return;
  }
  if (u.origin === self.location.origin) {
    // Own files: cache first, then network.
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => {
      const c = n.clone();
      caches.open(CACHE).then(cc => cc.put(e.request, c));
      return n;
    })));
    return;
  }
  // Fonts, maps, photos: show the cached copy while the network refreshes it.
  e.respondWith(caches.match(e.request).then(r => {
    const f = fetch(e.request).then(n => {
      const c = n.clone();
      caches.open(CACHE).then(cc => cc.put(e.request, c));
      return n;
    }).catch(() => r);
    return r || f;
  }));
});
