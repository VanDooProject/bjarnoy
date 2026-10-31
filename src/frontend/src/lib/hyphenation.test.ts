import { beforeAll, describe, expect, it } from 'vitest';
import enCatalogue from '../i18n/locales/en/catalogue.json';
import deCatalogue from '../i18n/locales/de/catalogue.json';
import { hyphenate, hyphenationLoaded, loadHyphenation, SOFT_HYPHEN } from './hyphenation';

const parts = (word: string, lang: string) => hyphenate(word, lang).split(SOFT_HYPHEN);
const wordsOf = (catalogue: { buildings: Record<string, string> }) => [
  ...new Set(Object.values(catalogue.buildings).flatMap((name) => name.split(/\s+/).filter(Boolean))),
];

describe('hyphenation', () => {
  beforeAll(async () => {
    await Promise.all(['en', 'de', 'es', 'fr', 'pt'].map((lang) => loadHyphenation(lang)));
  });

  it('leaves a word alone until the language patterns are loaded, and for a language without any', () => {
    expect(hyphenationLoaded('xx')).toBe(false);
    expect(hyphenate('Waffenschmiede', 'xx')).toBe('Waffenschmiede');
  });

  it('breaks German compounds where a German reader would', () => {
    expect(parts('Waffenschmiede', 'de')).toEqual(['Waf', 'fen', 'schmie', 'de']);
    expect(parts('Hammerschmiede', 'de')).toEqual(['Ham', 'mer', 'schmie', 'de']);
    expect(parts('Druidenhütte', 'de')).toEqual(['Drui', 'den', 'hüt', 'te']);
  });

  it('keeps a hyphen the name already has and breaks each side', () => {
    expect(parts('Raseneisenerz-Grube', 'de')).toEqual(['Ra', 'sen', 'ei', 'sen', 'erz-Gru', 'be']);
    expect(hyphenate('Met-Brennerei', 'de').replaceAll(SOFT_HYPHEN, '')).toBe('Met-Brennerei');
  });

  it('breaks English words with the English patterns', () => {
    expect(parts('Weaponsmith', 'en')).toEqual(['Weapon', 'smith']);
    expect(parts('Watchtower', 'en')).toEqual(['Watch', 'tow', 'er']);
  });

  it('follows the locale: a region suffix uses the language patterns', () => {
    expect(hyphenate('Waffenschmiede', 'de-AT')).toBe(hyphenate('Waffenschmiede', 'de'));
  });

  it('has patterns ready for Spanish, French and Portuguese', () => {
    expect(parts('Carpintería', 'es')).toEqual(['Car', 'pin', 'te', 'ría']);
    expect(parts('Entrepôt', 'fr')).toEqual(['En', 'tre', 'pôt']);
    expect(parts('Armazém', 'pt')).toEqual(['Ar', 'ma', 'zém']);
  });

  it('only ever inserts soft hyphens: every catalogue name reads the same without them', () => {
    for (const [lang, catalogue] of [['en', enCatalogue], ['de', deCatalogue]] as const) {
      for (const word of wordsOf(catalogue)) {
        expect(hyphenate(word, lang).replaceAll(SOFT_HYPHEN, '')).toBe(word);
      }
    }
  });

  it('gives every long catalogue word (8+ letters) a break point, in both languages', () => {
    for (const [lang, catalogue] of [['en', enCatalogue], ['de', deCatalogue]] as const) {
      for (const word of wordsOf(catalogue).filter((w) => w.replaceAll('-', '').length >= 8)) {
        expect(hyphenate(word, lang), `${lang}: ${word}`).toContain(SOFT_HYPHEN);
      }
    }
  });
});
