/** Converts a VAPID public key (base64url, no padding) into the `Uint8Array` `PushManager.subscribe` needs. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

const BROWSER_PATTERNS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const OS_PATTERNS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iPhone'],
  [/Android/, 'Android'],
  [/Mac OS X/, 'Mac'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

/** A human-readable default label ("Chrome on Android") — the user can rename it once device management (phase 3) lands. */
export function deviceLabelFromUserAgent(userAgent: string): string {
  const browser = BROWSER_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'Browser';
  const os = OS_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1];
  return os ? `${browser} on ${os}` : browser;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser.');
  }
  return navigator.serviceWorker.ready;
}

/** The current browser-side subscription for this origin, if any — independent of what the server has on file. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await getRegistration();
  return registration.pushManager.getSubscription();
}

/**
 * Requests notification permission (must be called from a user gesture) and
 * subscribes this browser to push, using the server's VAPID public key.
 * Throws if permission is denied — callers show the "blocked" state instead
 * of retrying.
 */
export async function subscribe(vapidPublicKey: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(`Notification permission was ${permission}.`);
  }

  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

/** Unsubscribes this browser from push. A no-op if it wasn't subscribed. */
export async function unsubscribe(): Promise<void> {
  const subscription = await currentSubscription();
  await subscription?.unsubscribe();
}
