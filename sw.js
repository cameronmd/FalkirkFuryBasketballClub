/* Service worker — offline app shell for Falkirk Fury Basketball fixtures.
 * Network-first: when online we always serve the freshest files (so a single
 * refresh shows the latest fixtures + app after a deploy), falling back to the
 * cache only when offline. The cache is refreshed from every successful fetch.
 * Bump CACHE when any shell file changes.
 */
var CACHE = 'fury-v2';

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
  // Only handle same-origin requests; let anything else hit the network.
  if (new URL(req.url).origin !== self.location.origin) return;

  // Network-first: try the network, cache the fresh copy, and fall back to the
  // cache (or the app shell for navigations) only when the network fails.
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.open(CACHE).then(function (cache) {
        return cache.match(req).then(function (cached) {
          return cached || (req.mode === 'navigate' ? cache.match('index.html') : undefined);
        });
      });
    })
  );
});
