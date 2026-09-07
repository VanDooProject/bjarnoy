import { createI18n } from 'vue-i18n';
import enCommon from './locales/en/common.json';
import deCommon from './locales/de/common.json';
import enCatalogue from './locales/en/catalogue.json';
import deCatalogue from './locales/de/catalogue.json';
import enLanding from './locales/en/landing.json';
import deLanding from './locales/de/landing.json';
import enOnboarding from './locales/en/onboarding.json';
import deOnboarding from './locales/de/onboarding.json';
import enDemoModeBadge from './locales/en/demoModeBadge.json';
import deDemoModeBadge from './locales/de/demoModeBadge.json';
import enLogin from './locales/en/login.json';
import deLogin from './locales/de/login.json';
import enRegister from './locales/en/register.json';
import deRegister from './locales/de/register.json';
import enAccountRestrictedBanner from './locales/en/accountRestrictedBanner.json';
import deAccountRestrictedBanner from './locales/de/accountRestrictedBanner.json';
import enHud from './locales/en/hud.json';
import deHud from './locales/de/hud.json';
import enApiErrors from './locales/en/apiErrors.json';
import deApiErrors from './locales/de/apiErrors.json';
import enGuild from './locales/en/guild.json';
import deGuild from './locales/de/guild.json';
import enMessages from './locales/en/messages.json';
import deMessages from './locales/de/messages.json';
import enProfile from './locales/en/profile.json';
import deProfile from './locales/de/profile.json';
import enLeaderboard from './locales/en/leaderboard.json';
import deLeaderboard from './locales/de/leaderboard.json';
import enReports from './locales/en/reports.json';
import deReports from './locales/de/reports.json';
import enSimulator from './locales/en/simulator.json';
import deSimulator from './locales/de/simulator.json';
import { datetimeFormats, numberFormats } from './formats';
import {
  DEFAULT_LOCALE,
  detectInitialLocale,
  persistLocale,
  readStoredLocale,
  type SupportedLocale,
} from './locale';
function queryLocale(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('lang');
  } catch {
    return null;
  }
}

const initialLocale = detectInitialLocale({
  queryLocale: queryLocale(),
  storedLocale: readStoredLocale(),
  navigatorLanguage: typeof navigator !== 'undefined' ? navigator.language : null,
});

// Not type-parameterized against MessageSchema: vue-i18n's generics for
// createI18n require every message/format bag to satisfy an index-signature
// shape that a hand-written nested interface doesn't have. `useI18n<{
// message: MessageSchema }>()` (see schema.ts) is where per-component
// call-sites get typed `t()` keys instead.
export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: DEFAULT_LOCALE,
  // Fallback/missing warnings are noise once a namespace intentionally has
  // no `de` translation yet (e.g. the admin surface for now) — the throwing
  // `missing` handler in src/test/i18n.ts is what actually catches an
  // unextracted key, in unit tests.
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: {
      common: enCommon,
      catalogue: enCatalogue,
      landing: enLanding,
      onboarding: enOnboarding,
      demoModeBadge: enDemoModeBadge,
      login: enLogin,
      register: enRegister,
      accountRestrictedBanner: enAccountRestrictedBanner,
      hud: enHud,
      apiErrors: enApiErrors,
      guild: enGuild,
      messages: enMessages,
      profile: enProfile,
      leaderboard: enLeaderboard,
      reports: enReports,
      simulator: enSimulator,
    },
    de: {
      common: deCommon,
      catalogue: deCatalogue,
      landing: deLanding,
      onboarding: deOnboarding,
      demoModeBadge: deDemoModeBadge,
      login: deLogin,
      register: deRegister,
      accountRestrictedBanner: deAccountRestrictedBanner,
      hud: deHud,
      apiErrors: deApiErrors,
      guild: deGuild,
      messages: deMessages,
      profile: deProfile,
      leaderboard: deLeaderboard,
      reports: deReports,
      simulator: deSimulator,
    },
  },
  datetimeFormats,
  numberFormats,
});

export function setLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale;
  persistLocale(locale);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

// Apply the detected locale to <html lang> on boot (main.ts calls this once).
export function initLocale(): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = i18n.global.locale.value;
  }
}

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from './locale';
