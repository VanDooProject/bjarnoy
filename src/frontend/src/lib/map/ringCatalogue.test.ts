import { describe, expect, it } from 'vitest';
import { formatBuildTime, longhouseLock } from './ringCatalogue';

describe('formatBuildTime', () => {
  it('renders the level-1 catalogue durations the way the design card shows them', () => {
    // BuildingCatalogue.cs: Producer 4 min, Tower 8 min, Longhouse 10, Shrine 12.
    expect(formatBuildTime(240)).toBe('4:00');
    expect(formatBuildTime(480)).toBe('8:00');
    expect(formatBuildTime(600)).toBe('10:00');
    expect(formatBuildTime(720)).toBe('12:00');
  });

  it('grows an hours field rather than showing 90 minutes', () => {
    // Duration(base, level) = base * 1.5^(level-1), so upgrades pass an hour
    // quickly — a shrine is already 1:31:00 at level 4.
    expect(formatBuildTime(3600)).toBe('1:00:00');
    expect(formatBuildTime(5460)).toBe('1:31:00');
  });

  it('pads seconds and floors a negative to zero', () => {
    expect(formatBuildTime(65)).toBe('1:05');
    expect(formatBuildTime(-10)).toBe('0:00');
  });
});

describe('longhouseLock', () => {
  it('locks a building the settlement has not levelled up to yet', () => {
    // The watchtower is RequiredLonghouseLevel 2 at level 1.
    expect(longhouseLock(2, 1)).toBe('Requires longhouse 2');
    expect(longhouseLock(3, 1)).toBe('Requires longhouse 3');
  });

  it('does not lock a building the settlement already qualifies for', () => {
    expect(longhouseLock(1, 1)).toBeUndefined();
    expect(longhouseLock(2, 3)).toBeUndefined();
  });

  it('does not lock a type with no catalogue entry at all', () => {
    // "hut" is demo-only and has no backend definition, so there is no gate to
    // report — it must not read as locked.
    expect(longhouseLock(undefined, 1)).toBeUndefined();
  });
});
