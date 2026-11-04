import en from '../i18n/locales/en/intro.json';
import de from '../i18n/locales/de/intro.json';

// The intro runs before the main app (and vue-i18n) loads, so it reads the two
// JSON files directly. The main app registers the same files as its `intro`
// namespace.
const messages = { en, de } as const;
export type IntroLocale = keyof typeof messages;

/** Looks up a dotted key such as `skip` or `beats.fire`; returns the key itself when missing. */
export function introText(locale: IntroLocale, key: string): string {
  let node: unknown = messages[locale];
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return key;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : key;
}

/** Reading speed assumed for narration (words per minute). */
export const READING_WPM = 230;

/** Time to read a narration line: 1 s to find it, then its words at READING_WPM. */
export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round(1000 + (words * 60000) / READING_WPM);
}
