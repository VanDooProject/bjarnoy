import { describe, expect, it } from 'vitest';
import { FAVOUR_LEVELS, MAX_EFFECT_BONUS_PERCENT, RUNES, SHRINE_GODS, favourAt, runeSlots } from './shrineDocs';
import { maxLevelFor, type BuildingKind } from '../map/buildingEconomy';
import catalogue from '../../data/building-catalogue.json';

describe('shrineDocs', () => {
  it('lists only buildings that are shrines in the catalogue, all with the same maximum level', () => {
    const types = new Set(catalogue.data.map((d) => d.type));
    for (const { type } of SHRINE_GODS) {
      expect(types.has(type), type).toBe(true);
      expect(maxLevelFor(type as BuildingKind), type).toBe(5);
    }
    expect(FAVOUR_LEVELS.at(-1)).toBe(5);
  });

  it('gives a war god +10% at level 1 growing by 3% a level to +22%', () => {
    expect(favourAt('shrineofthor', 1)).toEqual({ kind: 'percent', percent: 10 });
    expect(favourAt('shrineofthor', 3)).toEqual({ kind: 'percent', percent: 16 });
    expect(favourAt('shrineofnjord', 5)).toEqual({ kind: 'percent', percent: 22 });
  });

  it("gives Odin 2% off build times and 2 vision rings per level", () => {
    expect(favourAt('odinstatue', 1)).toEqual({ kind: 'odin', buildTimePercent: 2, visionRings: 2 });
    expect(favourAt('odinstatue', 5)).toEqual({ kind: 'odin', buildTimePercent: 10, visionRings: 10 });
  });

  it('opens one rune slot at levels 1-2, two at 3-4 and three at 5', () => {
    expect([1, 2, 3, 4, 5].map(runeSlots)).toEqual([1, 1, 2, 2, 3]);
  });

  it('keeps every rune below the per-kind cap and each rarity above the last', () => {
    for (const rune of RUNES) {
      expect(rune.percent[0]).toBeLessThan(rune.percent[1]);
      expect(rune.percent[1]).toBeLessThan(rune.percent[2]);
      expect(rune.percent[2]).toBeLessThan(MAX_EFFECT_BONUS_PERCENT);
    }
  });
});
