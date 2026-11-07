import { describe, expect, it } from 'vitest';
import { mapLoadFraction } from './introLoad';

describe('mapLoadFraction', () => {
  it('is 0 while no group has reported', () => {
    expect(mapLoadFraction({ terrain: null, buildings: null, animations: null }, false)).toBe(0);
  });
  it('sums loaded over total across the groups that reported', () => {
    expect(mapLoadFraction({ terrain: { loaded: 2, total: 4 }, buildings: { loaded: 1, total: 4 }, animations: null }, false)).toBe(3 / 8);
    expect(mapLoadFraction({ terrain: { loaded: 4, total: 4 }, buildings: { loaded: 0, total: 4 }, animations: { loaded: 1, total: 8 } }, false)).toBe(5 / 16);
  });
  it('ignores a group that reported a zero total', () => {
    expect(mapLoadFraction({ terrain: { loaded: 0, total: 0 }, buildings: null, animations: null }, false)).toBe(0);
  });
  it('stays below 1 while the groups that reported are done but the tiles are not loaded', () => {
    const f = mapLoadFraction({ terrain: { loaded: 4, total: 4 }, buildings: null, animations: null }, false);
    expect(f).toBeLessThan(1);
    expect(Math.floor(f * 100)).toBe(99);
  });
  it('is 1 once the tiles are loaded, whatever the groups say', () => {
    expect(mapLoadFraction({ terrain: { loaded: 1, total: 4 }, buildings: null, animations: null }, true)).toBe(1);
    expect(mapLoadFraction({ terrain: null, buildings: null, animations: null }, true)).toBe(1);
  });
});
