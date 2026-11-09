import { describe, expect, it } from 'vitest';
import { dateTimePattern, formatDateTime, formatRelativeTime, parseDateTime } from './dateTimeFormat';
describe('dateTimeFormat', () => {
    const local = new Date(2026, 2, 5, 7, 4); // 5 March 2026, 07:04 local
    it('formats local time in each locale layout, 24h', () => {
        expect(formatDateTime(local, 'en')).toBe('2026-03-05 07:04');
        expect(formatDateTime(local, 'de')).toBe('05.03.2026 07:04');
        expect(formatDateTime(new Date(2026, 2, 5, 19, 30), 'en')).toBe('2026-03-05 19:30');
    });
    it('shows the pattern per locale and falls back to en for unknown locales', () => {
        expect(dateTimePattern('en')).toBe('YYYY-MM-DD HH:mm');
        expect(dateTimePattern('de')).toBe('DD.MM.YYYY HH:mm');
        expect(dateTimePattern('fr')).toBe('YYYY-MM-DD HH:mm');
    });
    it('round-trips an ISO instant through text in both locales', () => {
        for (const locale of ['en', 'de']) {
            const iso = local.toISOString();
            const parsed = parseDateTime(formatDateTime(iso, locale), locale);
            expect(parsed).toEqual({ ok: true, iso });
        }
    });
    it('treats empty and blank text as no date, and null as empty text', () => {
        expect(parseDateTime('', 'en')).toEqual({ ok: true, iso: null });
        expect(parseDateTime('   ', 'de')).toEqual({ ok: true, iso: null });
        expect(formatDateTime(null, 'en')).toBe('');
    });
    it('rejects text in the other locale layout or with impossible values', () => {
        expect(parseDateTime('05.03.2026 07:04', 'en')).toEqual({ ok: false });
        expect(parseDateTime('2026-03-05 07:04', 'de')).toEqual({ ok: false });
        expect(parseDateTime('2026-13-01 07:04', 'en')).toEqual({ ok: false });
        expect(parseDateTime('2026-02-31 07:04', 'en')).toEqual({ ok: false });
        expect(parseDateTime('2026-03-05 24:00', 'en')).toEqual({ ok: false });
        expect(parseDateTime('2026-03-05 07:61', 'en')).toEqual({ ok: false });
        expect(parseDateTime('2026-03-05 7:04 PM', 'en')).toEqual({ ok: false });
        expect(parseDateTime('soon', 'en')).toEqual({ ok: false });
    });
    it('formats how long ago an instant was in the locale', () => {
        const now = new Date(2026, 2, 5, 12, 0);
        const threeHoursAgo = new Date(2026, 2, 5, 9, 0);
        expect(formatRelativeTime(threeHoursAgo, now, 'en')).toMatch(/3 h.*ago/);
        expect(formatRelativeTime(threeHoursAgo, now, 'de')).toMatch(/vor 3 Std/);
        expect(formatRelativeTime(new Date(2026, 2, 2, 12, 0), now, 'en')).toMatch(/3 days? ago/);
    });
});
