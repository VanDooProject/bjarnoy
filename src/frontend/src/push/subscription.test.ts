import { describe, expect, it } from 'vitest';
import { deviceLabelFromUserAgent, urlBase64ToUint8Array } from './subscription';

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url VAPID key into its raw bytes', () => {
    // "hello" base64url-encoded, no padding.
    const bytes = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });

  it('round-trips - and _ characters that differ from standard base64', () => {
    // Bytes chosen so standard base64 would contain '+' and '/'.
    const original = new Uint8Array([251, 255, 191]);
    const standard = btoa(String.fromCharCode(...original));
    const base64Url = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    expect(Array.from(urlBase64ToUint8Array(base64Url))).toEqual(Array.from(original));
  });
});

describe('deviceLabelFromUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1',
      'Safari on iPhone',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0', 'Firefox on Linux'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36', 'Chrome on Windows'],
  ])('labels %s as %s', (userAgent, expected) => {
    expect(deviceLabelFromUserAgent(userAgent)).toBe(expected);
  });

  it('falls back to a generic label for an unrecognised browser', () => {
    expect(deviceLabelFromUserAgent('SomeExoticBot/1.0')).toBe('Browser');
  });
});
