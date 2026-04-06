// ── ÉTHER Service Worker ─────────────────────────────────────────────
// Utilise self.registration.scope pour fonctionner en sous-répertoire
// (GitHub Pages : /ether/) comme en racine (localhost)

const VERSION = 'ether-v1.1';

self.addEventListener('install', e => {
  const scope = self.registration.scope;
  const ASSETS = [
    '', 'app.html', 'manifest.json',
    'src/style.css', 'src/config.js', 'src/crypto.js',
    'src/storage.js', 'src/peer.js', 'src/ui.js',
    'src/app.js', 'src/groups.js',
  ].map(p => scope + p);

  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {}) // ne pas bloquer si un asset manque
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.registration.scope)) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
