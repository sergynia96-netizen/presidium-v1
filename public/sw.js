const CACHE_NAME = 'presidium-v1';
const STATIC_ASSETS = ['/', '/offline.html', '/manifest.json', '/logo.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // HTML documents: network first, fallback to cache/offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('/offline.html');
        }),
    );
    return;
  }

  // Cache-first for same-origin static assets.
  if (
    url.origin === self.location.origin &&
    ['style', 'script', 'image', 'font'].includes(request.destination)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        });
      }),
    );
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  const title = payload.title || 'PRESIDIUM';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    tag: payload.tag || 'presidium-notification',
    renotify: Boolean(payload.renotify),
    silent: Boolean(payload.silent),
    data: payload.data || {},
    actions: Array.isArray(payload.actions) ? payload.actions : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action || 'open';
  const chatId = data.chatId;
  const storyId = data.storyId;

  let targetUrl = '/';
  if (action === 'open' || action === '') {
    if (chatId) targetUrl = `/?chat=${encodeURIComponent(chatId)}`;
    if (storyId) targetUrl = '/';
  } else if (action === 'reply') {
    targetUrl = chatId ? `/?chat=${encodeURIComponent(chatId)}` : '/';
  } else if (action === 'mark_read') {
    targetUrl = '/';
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({
              type: 'PUSH_NOTIFICATION_ACTION',
              action,
              data,
            });
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
