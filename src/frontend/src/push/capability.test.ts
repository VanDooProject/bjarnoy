// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushSupport } from './capability';

const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1';

function stubNavigator(userAgent: string, standalone?: boolean) {
  vi.stubGlobal('navigator', {
    userAgent,
    maxTouchPoints: 0,
    serviceWorker: {},
    ...(standalone !== undefined ? { standalone } : {}),
  });
}

function stubPushApi(present: boolean) {
  if (present) {
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', class {});
  } else {
    // `vi.stubGlobal(name, undefined)` still leaves the property present
    // (`in` only cares about the key existing), so absence must delete it.
    Reflect.deleteProperty(window, 'PushManager');
    Reflect.deleteProperty(window, 'Notification');
  }
}

beforeEach(() => {
  window.matchMedia = () => ({ matches: false }) as MediaQueryList;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pushSupport', () => {
  it('is unsupported without the Push API', () => {
    stubNavigator(ANDROID_CHROME_UA);
    stubPushApi(false);
    expect(pushSupport()).toBe('unsupported');
  });

  it('is supported on a desktop/Android browser with the Push API', () => {
    stubNavigator(ANDROID_CHROME_UA);
    stubPushApi(true);
    expect(pushSupport()).toBe('supported');
  });

  it('needs a Home Screen install on iOS Safari outside standalone mode', () => {
    stubNavigator(IOS_SAFARI_UA, false);
    stubPushApi(true);
    expect(pushSupport()).toBe('needs-install');
  });

  it('is supported on iOS Safari once installed to the Home Screen', () => {
    stubNavigator(IOS_SAFARI_UA, true);
    stubPushApi(true);
    expect(pushSupport()).toBe('supported');
  });
});
