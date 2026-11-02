import { describe, expect, it } from 'vitest';
import { formatDecayWait, isOutsideRealm, secondsToNextLevelLoss } from './realmDecay';

describe('isOutsideRealm', () => {
  it('reads the server mark', () => {
    expect(isOutsideRealm({ outsideRealmSince: '2026-11-01T10:00:00Z' })).toBe(true);
    expect(isOutsideRealm({ outsideRealmSince: null })).toBe(false);
    expect(isOutsideRealm({})).toBe(false);
    expect(isOutsideRealm(undefined)).toBe(false);
  });
});

describe('secondsToNextLevelLoss', () => {
  const outside = { outsideRealmSince: '2026-11-01T10:00:00Z', nextLevelLossInSeconds: 3600 };

  it('counts down from when the answer arrived', () => {
    expect(secondsToNextLevelLoss(outside, 1_000_000, 1_000_000)).toBe(3600);
    expect(secondsToNextLevelLoss(outside, 1_000_000, 1_000_000 + 600_000)).toBe(3000);
  });

  it('never goes below zero', () => {
    expect(secondsToNextLevelLoss(outside, 0, 10_000_000)).toBe(0);
  });

  it('is null inside the realm or without a server time', () => {
    expect(secondsToNextLevelLoss({ outsideRealmSince: null, nextLevelLossInSeconds: 5 }, 0, 0)).toBeNull();
    expect(secondsToNextLevelLoss({ outsideRealmSince: 'x', nextLevelLossInSeconds: null }, 0, 0)).toBeNull();
    expect(secondsToNextLevelLoss(undefined, 0, 0)).toBeNull();
  });
});

describe('formatDecayWait', () => {
  it('names days and hours, hours and minutes, or minutes', () => {
    expect(formatDecayWait(26 * 3600, 'en')).toBe('1 day, 2 hours');
    expect(formatDecayWait(2 * 86400, 'en')).toBe('2 days');
    expect(formatDecayWait(90 * 60, 'en')).toBe('1 hour, 30 minutes');
    expect(formatDecayWait(5 * 60, 'en')).toBe('5 minutes');
    expect(formatDecayWait(10, 'en')).toBe('1 minute');
  });

  it('speaks the player language', () => {
    expect(formatDecayWait(26 * 3600, 'de')).toBe('1 Tag, 2 Stunden');
  });
});
