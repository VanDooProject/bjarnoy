import { createI18n } from 'vue-i18n';
import enCommon from '../i18n/locales/en/common.json';
import { datetimeFormats, numberFormats } from '../i18n/formats';

// A component-test-scoped i18n instance that *throws* on a missing/unresolved
// key instead of silently rendering the key string — so a component migrated
// to i18n but referencing a typo'd or unextracted key fails its test, rather
// than passing with visibly wrong text. `messages` merges in whatever
// namespace(s) the component under test actually needs, beyond `common`.
export function createTestI18n(messages: Record<string, unknown> = {}) {
  return createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en: { common: enCommon, ...messages } },
    datetimeFormats,
    numberFormats,
    missing: (_locale, key) => {
      throw new Error(`Missing i18n key in test: ${key}`);
    },
  });
}
