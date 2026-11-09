import en from '../i18n/locales/en/intro.json';
import de from '../i18n/locales/de/intro.json';
// The intro runs before the main app (and vue-i18n) loads, so it reads the two
// JSON files directly. The main app registers the same files as its `intro`
// namespace.
const messages = { en, de };
/** Looks up a dotted key such as `skip` or `beats.fire`; returns the key itself when missing. `{name}` in the text is replaced by `params.name`. */
export function introText(locale, key, params) {
    let node = messages[locale];
    for (const part of key.split('.')) {
        if (node === null || typeof node !== 'object')
            return key;
        node = node[part];
    }
    if (typeof node !== 'string')
        return key;
    return params ? node.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole)) : node;
}
