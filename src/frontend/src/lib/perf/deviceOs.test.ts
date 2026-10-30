import { describe, expect, it } from 'vitest';
import { detectDeviceOs } from './deviceOs';

const UA = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};

describe('detectDeviceOs', () => {
  it.each([
    ['windows', UA.windows, 'windows'],
    ['mac', UA.mac, 'macos'],
    ['iphone', UA.iphone, 'ios'],
    ['ipad', UA.ipad, 'ios'],
    ['android', UA.android, 'android'],
    ['linux', UA.linux, 'other'],
    ['empty', '', 'other'],
  ])('%s -> %s', (_name, ua, expected) => {
    expect(detectDeviceOs(ua)).toBe(expected);
  });

  it('treats a touch-screen "Mac" (iPadOS desktop-class Safari) as iOS', () => {
    expect(detectDeviceOs(UA.mac, 5)).toBe('ios');
    expect(detectDeviceOs(UA.mac, 0)).toBe('macos');
  });

  it('is not fooled by Android user agents that also say "Linux"', () => {
    expect(detectDeviceOs(UA.android)).toBe('android');
  });
});
