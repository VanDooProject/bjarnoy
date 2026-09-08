// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  detectInitialLocale,
  isSupportedLocale,
  persistLocale,
  readStoredLocale,
} from './locale';

describe('isSupportedLocale', () => {
  it('accepts only known locale codes', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('de')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
  });
});

describe('detectInitialLocale', () => {
  it('prefers an explicit query override over everything else', () => {
    expect(
      detectInitialLocale({
        queryLocale: 'de',
        userLocale: 'en',
        storedLocale: 'en',
        navigatorLanguage: 'en-US',
      }),
    ).toBe('de');
  });

  it('falls back to the user preference over the stored device choice', () => {
    expect(
      detectInitialLocale({ queryLocale: null, userLocale: 'de', storedLocale: 'en', navigatorLanguage: 'en-US' }),
    ).toBe('de');
  });

  it('falls back to the stored device choice over the browser language', () => {
    expect(
      detectInitialLocale({ queryLocale: null, userLocale: null, storedLocale: 'de', navigatorLanguage: 'en-US' }),
    ).toBe('de');
  });

  it('falls back to the browser language mapped to a supported locale', () => {
    expect(
      detectInitialLocale({ queryLocale: null, userLocale: null, storedLocale: null, navigatorLanguage: 'de-AT' }),
    ).toBe('de');
  });

  it('falls back to the app default when nothing matches', () => {
    expect(
      detectInitialLocale({ queryLocale: null, userLocale: null, storedLocale: null, navigatorLanguage: 'fr-FR' }),
    ).toBe(DEFAULT_LOCALE);
  });

  it('ignores unsupported values at every precedence level', () => {
    expect(
      detectInitialLocale({
        queryLocale: 'fr',
        userLocale: 'es',
        storedLocale: 'it',
        navigatorLanguage: 'ja-JP',
      }),
    ).toBe(DEFAULT_LOCALE);
  });
});

describe('persistLocale / readStoredLocale', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips through localStorage under the bjarnoy.* key convention', () => {
    expect(LOCALE_STORAGE_KEY).toBe('bjarnoy.locale');
    persistLocale('de');
    expect(readStoredLocale()).toBe('de');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de');
  });
});
