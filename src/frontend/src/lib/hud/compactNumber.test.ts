import { describe, expect, it } from 'vitest';
import { formatCompactNumber, formatFullNumber, formatHudNumber } from './compactNumber';

describe('formatFullNumber', () => {
  it('groups digits per locale', () => {
    expect(formatFullNumber(3000, 'en')).toBe('3,000');
    expect(formatFullNumber(3000, 'de')).toBe('3.000');
  });

  it('truncates fractional values (never rounds up)', () => {
    expect(formatFullNumber(400.9, 'en')).toBe('400');
  });

  it('renders negative values with a plain minus sign', () => {
    expect(formatFullNumber(-60, 'en')).toBe('-60');
  });
});

describe('formatCompactNumber boundaries', () => {
  it('999 stays full (below the 1,000 threshold)', () => {
    expect(formatCompactNumber(999, 'en')).toBe('999');
  });

  it('1,000 becomes "1k" (a trailing .0 is dropped)', () => {
    expect(formatCompactNumber(1000, 'en')).toBe('1k');
  });

  it('9,950 keeps one decimal in the low-k range', () => {
    expect(formatCompactNumber(9950, 'en')).toBe('9.9k');
  });

  it('10,000 drops the decimal once in the high-k range', () => {
    expect(formatCompactNumber(10000, 'en')).toBe('10k');
  });

  it('999,999 stays in "k" notation, not rolled over to "1000k"', () => {
    expect(formatCompactNumber(999999, 'en')).toBe('999k');
  });

  it('1,000,000 becomes "1M"', () => {
    expect(formatCompactNumber(1000000, 'en')).toBe('1M');
  });

  it('formats a value above 1M with one decimal', () => {
    expect(formatCompactNumber(1200000, 'en')).toBe('1.2M');
  });

  it('3,600 drops to one decimal, "3.6k"', () => {
    expect(formatCompactNumber(3600, 'en')).toBe('3.6k');
  });

  it('a bare 3,000 has no trailing decimal, "3k"', () => {
    expect(formatCompactNumber(3000, 'en')).toBe('3k');
  });

  it('negative rates keep their sign in short notation', () => {
    expect(formatCompactNumber(-3600, 'en')).toBe('-3.6k');
    expect(formatCompactNumber(-60, 'en')).toBe('-60');
  });

  it('uses the German decimal separator (comma)', () => {
    expect(formatCompactNumber(3600, 'de')).toBe('3,6k');
    expect(formatCompactNumber(1200000, 'de')).toBe('1,2M');
  });
});

describe('formatHudNumber', () => {
  it('picks full or compact by the short flag', () => {
    expect(formatHudNumber(3600, 'en', false)).toBe('3,600');
    expect(formatHudNumber(3600, 'en', true)).toBe('3.6k');
  });
});
