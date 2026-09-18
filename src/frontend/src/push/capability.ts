/**
 * Whether this browser can receive Web Push notifications right now.
 *
 * - `supported`: the Push API is available and (on iOS) the site is already
 *   installed to the Home Screen.
 * - `needs-install`: iOS Safari supports Web Push, but only for a site
 *   installed to the Home Screen — plain in-browser Safari has no prompt at
 *   all. See docs/plans/push-notifications.md's iOS risk note.
 * - `unsupported`: no Push API (older/unusual browsers).
 */
export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

function isIosSafari(userAgent: string): boolean {
  const isIosDevice = /iP(hone|ad|od)/.test(userAgent);
  // iPadOS 13+ reports as "Macintosh" with touch support — the standard
  // sniff for "this is actually an iPad".
  const isIpadOnMac = userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1;
  return isIosDevice || isIpadOnMac;
}

function isStandalone(): boolean {
  // `navigator.standalone` is Safari-specific (true once Home-Screen
  // installed); `display-mode: standalone` is the cross-browser PWA signal.
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export function pushSupport(): PushSupport {
  const hasPushApi =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  if (!hasPushApi) {
    return 'unsupported';
  }

  if (isIosSafari(navigator.userAgent) && !isStandalone()) {
    return 'needs-install';
  }

  return 'supported';
}
