const CACHE = 'birdclock-static-v1';
const shell = ['./', 'index.html', 'birds.js', 'gallery.js', 'manifest.webmanifest'];
const shellUrls = new Set(shell.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(shell)));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.delete('birdclock-v2')
  ]));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !shellUrls.has(event.request.url)) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(event.request)) || Response.error();
  }));
});
