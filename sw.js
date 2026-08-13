/* Service worker — offline app shell for Falkirk Fury Basketball fixtures.
 * Stale-while-revalidate for the app's own files so it opens with no connection
 * yet stays up to date. Bump CACHE when any shell file changes.
 */
var CACHE = 'fury-v1';

// All same-origin files that make up the app shell. Relative paths so this
// works both at the domain root and under /FalkirkFuryBasketballClub/ on Pages.
var SHELL = [
  '.',
  'index.html',
  'styles.css',
  'parser.js',
  'fixtures.js',
  'calendar.js',
  'share.js',
  'app.js',
  'data/fixtures.json',
  'vendor/xlsx.full.min.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
          return res;
        }).catch(function () {
          return cached || (req.mode === 'navigate' ? cache.match('index.html') : undefined);
        });
        return cached || network;
      });
    })
  );
});
