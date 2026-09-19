import { describe, expect, it } from 'vitest';
import { formatBuildTime, formatMissingResources, longhouseLock, sawmillAllowedHere } from './ringCatalogue';

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

describe('sawmillAllowedHere', () => {
  it('excludes a sawmill from a hex with no matching river shape', () => {
    expect(sawmillAllowedHere('sawmill', false)).toBe(false);
  });

  it('allows a sawmill on a straight/bend river hex', () => {
    expect(sawmillAllowedHere('sawmill', true)).toBe(true);
  });

  it('is a no-op for every other buildable type', () => {
    expect(sawmillAllowedHere('farm', false)).toBe(true);
    expect(sawmillAllowedHere('quarry', false)).toBe(true);
  });
});

describe('formatMissingResources', () => {
  it('lists only the shortfall, not the full cost', () => {
    const cost = { wood: 100, stone: 50, food: 0, iron: 0 };
    const stock = { wood: 60, stone: 50, food: 200, iron: 10 };
    expect(formatMissingResources(cost, stock)).toBe('40 Wood');
  });

  it('lists every short resource, in wood/stone/food/iron order', () => {
    const cost = { wood: 100, stone: 50, food: 30, iron: 10 };
    const stock = { wood: 0, stone: 0, food: 0, iron: 0 };
    expect(formatMissingResources(cost, stock)).toBe('100 Wood, 50 Stone, 30 Food, 10 Iron');
  });

  it('is empty when the stock already covers the cost', () => {
    const cost = { wood: 10, stone: 10, food: 10, iron: 10 };
    const stock = { wood: 10, stone: 10, food: 10, iron: 10 };
    expect(formatMissingResources(cost, stock)).toBe('');
  });
});
