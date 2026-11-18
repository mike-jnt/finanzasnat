// Scope-specific cache: works on github.io/repository/ and custom domains.
const BASE = new URL(self.registration.scope);
const PREFIX = 'mis-finanzas-shell:' + BASE.pathname + ':';
const CACHE = PREFIX + 'v3.2.0';
const FILES = ['./','index.html','style.css','engine.js','advanced.js','storage-model.js','ui.js','app.js','advanced-ui.js','receivables-ui.js','backup.js','import-csv.js','pwa.js','mobile.js','firebase-cloud.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
const SHELL = new Set(FILES.map(path => new URL(path, BASE).href));
const INDEX = new URL('index.html', BASE).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...SHELL])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const navigation = request.mode === 'navigate' && (url.pathname === BASE.pathname || url.pathname === new URL(INDEX).pathname);
  if (!navigation && !SHELL.has(url.href)) return;
  // Do not cache Firebase requests or any user financial data.
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(navigation ? INDEX : request)) || Response.error();
  }));
});
