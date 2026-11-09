import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './locale';
// Eagerly imported so every namespace file under src/i18n/locales/<locale>/*.json
// is checked without hand-maintaining a file list here.
const localeModules = import.meta.glob('./locales/*/*.json', { eager: true });
const namespaces = [
    ...new Set(Object.keys(localeModules)
        .filter((p) => p.startsWith(`./locales/${SUPPORTED_LOCALES[0]}/`))
        .map((p) => p.split('/').pop().replace(/\.json$/, ''))),
];
function messagesFor(locale, namespace) {
    return localeModules[`./locales/${locale}/${namespace}.json`]?.default;
}
function collectKeys(obj, prefix = '') {
    if (obj === null || typeof obj !== 'object')
        return [prefix];
    return Object.entries(obj).flatMap(([key, value]) => collectKeys(value, prefix ? `${prefix}.${key}` : key));
}
function placeholders(value) {
    return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}
describe('locale message parity', () => {
    it('found at least one namespace to check', () => {
        expect(namespaces.length).toBeGreaterThan(0);
    });
    for (const namespace of namespaces) {
        describe(`namespace: ${namespace}`, () => {
            // A namespace intentionally shipped English-only (e.g. the admin
            // surface, deferred until translated — see i18n/index.ts's
            // fallbackLocale) has no file for that locale at all. That's fine;
            // what's not fine is a locale file that exists but is only partially
            // translated, so parity is only checked among the locales present.
            const presentLocales = SUPPORTED_LOCALES.filter((locale) => messagesFor(locale, namespace) !== undefined);
            const messagesByLocale = Object.fromEntries(presentLocales.map((locale) => [locale, messagesFor(locale, namespace)]));
            it('has identical key sets across every locale that has this namespace', () => {
                const [first, ...rest] = presentLocales;
                const baseline = collectKeys(messagesByLocale[first]).sort();
                for (const locale of rest) {
                    expect(collectKeys(messagesByLocale[locale]).sort(), `locale "${locale}"`).toEqual(baseline);
                }
            });
            it('has no empty strings', () => {
                for (const locale of presentLocales) {
                    const flat = collectKeys(messagesByLocale[locale]);
                    const getValue = (keyPath) => keyPath.split('.').reduce((acc, k) => acc[k], messagesByLocale[locale]);
                    for (const key of flat) {
                        expect(getValue(key), `${locale}:${key}`).not.toBe('');
                    }
                }
            });
            it('has matching interpolation placeholders across locales', () => {
                const flatten = (obj, prefix = '') => obj === null || typeof obj !== 'object'
                    ? [[prefix, String(obj)]]
                    : Object.entries(obj).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
                const [first, ...rest] = presentLocales;
                const baseline = Object.fromEntries(flatten(messagesByLocale[first]));
                for (const locale of rest) {
                    const entries = Object.fromEntries(flatten(messagesByLocale[locale]));
                    for (const key of Object.keys(baseline)) {
                        expect(placeholders(entries[key] ?? ''), `${locale}:${key}`).toEqual(placeholders(baseline[key]));
                    }
                }
            });
        });
    }
});
