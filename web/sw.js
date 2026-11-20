// NEXUS service worker: app shell cache-first, fonts stale-while-revalidate. No data ever leaves the device.
const V = 'nexus-__VERSION__';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k.startsWith('nexus-')).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin === location.origin) {
    // network-first for the page (picks up updates), cache fallback offline
    if (e.request.mode === 'navigate') {
      e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put('./index.html', cp)); return r; }).catch(() => caches.match('./index.html')));
      return;
    }
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(caches.open(V + '-fonts').then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
