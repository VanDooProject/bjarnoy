// Local date-time text in the UI language's own layout, independent of the
// browser's locale: en `YYYY-MM-DD HH:mm`, de `DD.MM.YYYY HH:mm`, always 24h.
// Pure and Vue-free so the admin date field and the run-state "since" text
// share one implementation.
import { DEFAULT_LOCALE, isSupportedLocale } from '../i18n/locale';
const LAYOUTS = {
    en: {
        pattern: 'YYYY-MM-DD HH:mm',
        regex: /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/,
        order: [1, 2, 3, 4, 5],
        format: (p) => `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`,
    },
    de: {
        pattern: 'DD.MM.YYYY HH:mm',
        regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2}):(\d{2})$/,
        order: [3, 2, 1, 4, 5],
        format: (p) => `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`,
    },
};
function layoutFor(locale) {
    return LAYOUTS[isSupportedLocale(locale) ? locale : DEFAULT_LOCALE];
}
const pad = (n, width = 2) => String(n).padStart(width, '0');
/** The layout as a human-readable pattern, e.g. for a placeholder. */
export function dateTimePattern(locale) {
    return layoutFor(locale).pattern;
}
/** Formats an instant (ISO string or Date) as local time in the locale's layout. Empty for null. */
export function formatDateTime(value, locale) {
    if (!value)
        return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime()))
        return '';
    return layoutFor(locale).format({
        year: pad(d.getFullYear(), 4),
        month: pad(d.getMonth() + 1),
        day: pad(d.getDate()),
        hour: pad(d.getHours()),
        minute: pad(d.getMinutes()),
    });
}
/**
 * Parses text typed in the locale's layout as local time. Empty (or blank)
 * text is a valid "no date" (`iso: null`); anything that is not a real
 * calendar date and a 24h time is `{ ok: false }`.
 */
export function parseDateTime(text, locale) {
    const trimmed = text.trim();
    if (!trimmed)
        return { ok: true, iso: null };
    const match = layoutFor(locale).regex.exec(trimmed);
    if (!match)
        return { ok: false };
    const order = layoutFor(locale).order;
    const [year, month, day, hour, minute] = order.map((i) => Number(match[i]));
    if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59)
        return { ok: false };
    const d = new Date(year, month - 1, day, hour, minute);
    // Date rolls 31 February over into March; a real date round-trips unchanged.
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day)
        return { ok: false };
    return { ok: true, iso: d.toISOString() };
}
const RELATIVE_UNITS = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
];
/** "3 h ago" / "vor 3 Std." style text for how long before `now` the instant was. */
export function formatRelativeTime(value, now, locale) {
    const then = value instanceof Date ? value : new Date(value);
    const diff = then.getTime() - now.getTime();
    const rtf = new Intl.RelativeTimeFormat(isSupportedLocale(locale) ? locale : DEFAULT_LOCALE, {
        numeric: 'always',
        style: 'short',
    });
    for (const [unit, ms] of RELATIVE_UNITS) {
        if (Math.abs(diff) >= ms)
            return rtf.format(Math.trunc(diff / ms), unit);
    }
    return rtf.format(Math.trunc(diff / 1000), 'second');
}
