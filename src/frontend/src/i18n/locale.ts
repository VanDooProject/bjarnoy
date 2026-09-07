// Pure, DOM/Vue-free locale detection and persistence helpers — unit-tested
// without mounting anything.

export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

// Matches the existing `bjarnoy.*` localStorage key convention (see
// stores/auth.ts's `bjarnoy.refreshToken`/`bjarnoy.playerId`).
export const LOCALE_STORAGE_KEY = 'bjarnoy.locale';

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function localeFromNavigatorLanguage(language: string | undefined): SupportedLocale | null {
  if (!language) return null;
  const primary = language.split('-')[0].toLowerCase();
  return isSupportedLocale(primary) ? primary : null;
}

export interface DetectLocaleOptions {
  queryLocale?: string | null;
  storedLocale?: string | null;
  userLocale?: string | null;
  navigatorLanguage?: string | null;
}

// Precedence: explicit `?lang=` override > the authenticated user's saved
// preference > a previously persisted device choice > the browser's
// language > the app default.
export function detectInitialLocale(options: DetectLocaleOptions): SupportedLocale {
  if (isSupportedLocale(options.queryLocale)) return options.queryLocale;
  if (isSupportedLocale(options.userLocale)) return options.userLocale;
  if (isSupportedLocale(options.storedLocale)) return options.storedLocale;
  const fromNavigator = localeFromNavigatorLanguage(options.navigatorLanguage ?? undefined);
  if (fromNavigator) return fromNavigator;
  return DEFAULT_LOCALE;
}

export function persistLocale(locale: SupportedLocale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // localStorage can throw in private-browsing/quota-exceeded contexts —
    // the locale still applies for this session, it just won't persist.
  }
}

export function readStoredLocale(): string | null {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}
