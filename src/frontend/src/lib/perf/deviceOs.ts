// Which operating system the browser runs on, only to tell the player where
// their device's "reduce motion" switch lives (Profile > Graphics). A guess
// from the user agent is fine for that: a wrong one just shows a generic hint.

export type DeviceOs = 'windows' | 'macos' | 'ios' | 'android' | 'other';

/**
 * `maxTouchPoints` disambiguates iPadOS, whose Safari reports a desktop Mac
 * user agent: a "Mac" with a touch screen is an iPad.
 */
export function detectDeviceOs(userAgent: string, maxTouchPoints = 0): DeviceOs {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (/macintosh|mac os x/i.test(userAgent)) return maxTouchPoints > 1 ? 'ios' : 'macos';
  if (/windows/i.test(userAgent)) return 'windows';
  return 'other';
}

/** `detectDeviceOs` for the running browser; 'other' without a navigator (SSR, tests). */
export function currentDeviceOs(): DeviceOs {
  if (typeof navigator === 'undefined') return 'other';
  return detectDeviceOs(navigator.userAgent, navigator.maxTouchPoints);
}
