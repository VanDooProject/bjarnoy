// Language-aware hyphenation for short UI labels (the ring menu's bubble labels).
//
// Why a library instead of CSS `hyphens: auto`: the browser only hyphenates when it has a dictionary for the
// page language. Android and macOS/iOS Chrome/Safari ship them; desktop Chrome downloads them lazily after first
// use; Chromium on Linux (headless included) and Firefox on some platforms have none or not for every language.
// The result would differ per device, and the label-fitting code needs to know the lines the player really gets.
// So the break points come from Liang's TeX patterns (`hyphen` on npm), inserted as soft hyphens (U+00AD) that
// every engine honours with `hyphens: manual` (the default) — the same breaks everywhere, per language.
//
// Patterns are big (German ~750 KB), so each language loads on its own, only when it is the active locale.

type Hyphenate = (text: string) => string;

interface HyphenModule {
  hyphenateSync?: Hyphenate;
  default?: { hyphenateSync?: Hyphenate };
}

// One loader per language we have (or will soon have) a locale for; add the rest when their locale ships.
const LOADERS: Record<string, () => Promise<HyphenModule>> = {
  en: () => import('hyphen/en'),
  de: () => import('hyphen/de'),
  es: () => import('hyphen/es'),
  fr: () => import('hyphen/fr'),
  pt: () => import('hyphen/pt'),
};

const SOFT_HYPHEN = '­';
const loaded = new Map<string, Hyphenate>();
const loading = new Map<string, Promise<void>>();

const primary = (lang: string) => lang.split('-')[0].toLowerCase();

/** Loads the patterns for `lang` (a no-op if it has none or they are loaded). Resolves once `hyphenate` can use them. */
export function loadHyphenation(lang: string): Promise<void> {
  const key = primary(lang);
  const loader = LOADERS[key];
  if (!loader || loaded.has(key)) return Promise.resolve();
  let pending = loading.get(key);
  if (!pending) {
    pending = loader()
      .then((mod) => {
        const fn = mod.hyphenateSync ?? mod.default?.hyphenateSync;
        if (fn) loaded.set(key, fn);
      })
      .catch(() => undefined)
      .finally(() => loading.delete(key));
    loading.set(key, pending);
  }
  return pending;
}

export function hyphenationLoaded(lang: string): boolean {
  return loaded.has(primary(lang));
}

/**
 * `word` with soft hyphens at the language's break points ("Waffenschmiede" -> "Waf-fen-schmie-de", the dashes
 * being U+00AD). Returns the word unchanged until `loadHyphenation(lang)` has resolved, or for a language
 * without patterns. A hyphen already in the word ("Raseneisenerz-Grube") stays and each side is hyphenated.
 */
export function hyphenate(word: string, lang: string): string {
  const fn = loaded.get(primary(lang));
  return fn ? fn(word) : word;
}

export { SOFT_HYPHEN };
