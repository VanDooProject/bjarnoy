import { describe, expect, it } from 'vitest';
import { bend, buildMinutes, buildSecondsOf } from './buildTimes';

describe('buildMinutes', () => {
  it('early curve: 1, 2.83, 8 min, then doubling to the knee, then the top at the max level', () => {
    expect(buildMinutes('farm', 1, 25)).toBeCloseTo(1, 9);
    expect(buildMinutes('farm', 2, 25)).toBeCloseTo(Math.sqrt(8), 9);
    expect(buildMinutes('farm', 3, 25)).toBeCloseTo(8, 9);
    expect([4, 5, 6].map((l) => buildMinutes('farm', l, 25))).toEqual([16, 32, 64]);
    expect(buildMinutes('farm', 25, 25)).toBeCloseTo(22 * 60, 6);
    expect(buildMinutes('longhouse', 30, 30)).toBeCloseTo(26 * 60, 6);
    expect(buildMinutes('lumberjack', 25, 25)).toBeCloseTo(20 * 60, 6);
  });

  it('the tail is log-like: every step adds less than the one before', () => {
    const steps = Array.from({ length: 19 }, (_, i) => buildMinutes('farm', 7 + i, 25) - buildMinutes('farm', 6 + i, 25));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });

  it('tech curve: level-1 time, a straight line, top time', () => {
    expect(buildMinutes('barracks', 1, 20)).toBe(15);
    expect(buildMinutes('barracks', 20, 20)).toBeCloseTo(22 * 60, 6);
    expect(buildMinutes('tower', 3, 5)).toBeCloseTo((10 + 12 * 60) / 2, 6);
    expect(buildMinutes('greatstorehouse', 10, 10)).toBeCloseTo(30 * 60, 6);
  });

  it('seconds are rounded whole', () => {
    expect(buildSecondsOf('farm', 2, 25)).toBe(170);
  });

  it('bend: 0 and 1 stay, k = 0 is the identity, k > 0 is above it, k < 0 below it', () => {
    for (const k of [-3, 0, 3]) {
      expect(bend(0, k)).toBeCloseTo(0, 9);
      expect(bend(1, k)).toBeCloseTo(1, 9);
    }
    expect(bend(0.4, 0)).toBe(0.4);
    expect(bend(0.4, 3)).toBeGreaterThan(0.4);
    expect(bend(0.4, -3)).toBeLessThan(0.4);
  });
});
