/**
 * Service Worker para Abasto
 * Estrategia: Cache-First con caché versionado y limpieza automática.
 * Soporte 100% offline tras la primera carga.
 */

const CACHE_NAME = 'abasto-v8';

// Lista exhaustiva de activos del App Shell
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/money.js',
  './js/models.js',
  './js/store.js',
  './js/parser.js',
  './js/export.js',
  './js/views/homeView.js',
  './js/views/salidaView.js',
  './js/views/standView.js',
  './js/views/resumenView.js',
  './js/views/listaView.js',
  './js/views/backupView.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Verificación y carga individual para mayor robustez
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`[SW] No se pudo precachear ${asset}:`, err);
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((oldCache) => {
            console.log(`[SW] Eliminando caché antiguo: ${oldCache}`);
            return caches.delete(oldCache);
          })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  // Solo manejar solicitudes GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Solicitudes dentro de nuestro origen
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        }).catch(() => {
          // Si falla la red y es navegación HTML, retornar index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html')
              .then((res) => res || caches.match('./') || caches.match(new URL('./index.html', self.location).href));
          }
        });
      })
    );
  }
});
