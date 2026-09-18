// Push notification service worker. Deliberately does NOT implement a
// `fetch` handler — this is not an offline-caching PWA, only the minimum
// iOS/Web Push needs to receive notifications while the app is closed.
// See docs/plans/push-notifications.md for the full design.

const DB_NAME = 'bjarnoy-push';
const STORE_NAME = 'state';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setFlag(key, value) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { title, body, url, tag } = payload;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const hasFocusedSameOriginClient = clientsList.some((client) => client.focused && client.url.startsWith(self.location.origin));
      if (hasFocusedSameOriginClient) return;

      await self.registration.showNotification(title, {
        body,
        tag,
        data: { url },
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        renotify: false,
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clientsList.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) await existing.navigate(targetUrl);
        return;
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

// Fires rarely (browser/OS-driven subscription rotation). The service
// worker has no access token to call the API itself, so it only flags the
// change; the app reconciles (re-PUTs the new subscription) on next open —
// see src/push/subscription.ts's reconcile().
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(setFlag('pendingResubscribe', true));
});
