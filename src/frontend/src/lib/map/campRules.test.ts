import { describe, expect, it } from 'vitest';
import {
  campHexBuildable,
  beastStats,
  calmHours,
  campThreatensTowers,
  defensePower,
  effectiveLevel,
  estimatedLoot,
  fullGarrison,
  lootKindsOf,
  lootPool,
  lootPoolByKind,
  NaglfarLootPool,
  towerThreatAt,
} from './campRules';

describe('campRules', () => {
  it('full garrison defense power matches the design numbers', () => {
    const p = (l: number, family: string) => defensePower(fullGarrison(family, l), family);
    expect(p(1, 'wolfden')).toBe(195);
    expect(p(5, 'wolfden')).toBe(815);
    expect(p(10, 'wolfden')).toBe(1590);
    expect(p(25, 'wolfden')).toBe(3915);
    expect(p(1, 'deerglade')).toBe(66);
    expect(p(5, 'deerglade')).toBe(245);
    expect(p(25, 'deerglade')).toBe(1265);
  });

  it('garrison tiers: alpha count never goes negative for weak camps', () => {
    expect(fullGarrison('deerglade', 1)).toEqual({ young: 3, adult: 5, alpha: 0 });
    expect(fullGarrison('wolfden', 1)).toEqual({ young: 3, adult: 6, alpha: 0 });
  });

  it('effective level rises per 10 clears and caps at 100', () => {
    expect(effectiveLevel(3, 9)).toBe(3);
    expect(effectiveLevel(3, 10)).toBe(4);
    expect(effectiveLevel(99, 50)).toBe(100);
  });

  it('loot pool follows base x L^0.7', () => {
    expect(Math.round(lootPool(1, 'strong'))).toBe(1800);
    expect(lootPool(5, 'strong')).toBeCloseTo(5550, -1);
    expect(Math.round(lootPool(1, 'weak'))).toBe(450);
    expect(lootPool(25, 'weak')).toBeCloseTo(4280, -1);
  });

  it('loot kinds: food always, iron for strong, ++ doubles a share', () => {
    expect(lootKindsOf('deerglade').map((s) => s.kind)).toEqual(['food']);
    expect(lootKindsOf('wolfden').map((s) => s.kind)).toEqual(['food', 'wood', 'iron']);
    const boar = lootPoolByKind('boarwallow', 1);
    expect(boar.food).toBe(1200);
    expect(boar.iron).toBe(600);
  });

  it('the whale road is strong but pays food only (no automatic iron)', () => {
    expect(lootKindsOf('whaleroad')).toEqual([{ kind: 'food' }]);
    expect(lootPoolByKind('whaleroad', 1)).toEqual({ wood: 0, stone: 0, food: 1800, iron: 0 });
    expect(lootPoolByKind('whaleroad', 5).food).toBe(Math.floor(lootPool(5, 'strong')));
    expect(lootKindsOf('walrushaulout').map((s) => s.kind)).toContain('iron');
  });

  it('a water camp (guard range 0) never threatens a tower, even on its own hex', () => {
    const whale = { q: 0, r: 0, guardRange: 0, strong: true };
    expect(towerThreatAt([whale], { q: 0, r: 0 })).toBeUndefined();
  });

  it('estimated loot scales the pool by the garrison fraction and adds leftover', () => {
    const full = fullGarrison('deerglade', 1);
    const half = { young: 0, adult: 0, alpha: 0 };
    const leftover = { wood: 0, stone: 0, food: 7, iron: 0 };
    expect(estimatedLoot('deerglade', 1, full, full, leftover).food).toBe(457);
    expect(estimatedLoot('deerglade', 1, half, full, leftover).food).toBe(7);
  });

  describe('Naglfar', () => {
    it('has a fixed crew of 100 rime ships and the Naglfar, whatever the level', () => {
      expect(fullGarrison('naglfar', 1)).toEqual({ young: 0, adult: 100, alpha: 1 });
      expect(fullGarrison('naglfar', 40)).toEqual({ young: 0, adult: 100, alpha: 1 });
    });

    it('beast stats follow the family: rime ship 300/300, Naglfar 30000/30000, total 60000', () => {
      expect(beastStats('naglfar', 'adult')).toEqual({ attack: 300, defense: 300 });
      expect(beastStats('naglfar', 'alpha')).toEqual({ attack: 30000, defense: 30000 });
      expect(beastStats('naglfar', 'young')).toEqual({ attack: 0, defense: 0 });
      expect(defensePower(fullGarrison('naglfar', 1), 'naglfar')).toBe(60000);
      expect(beastStats('wolfden', 'adult')).toEqual({ attack: 25, defense: 30 });
    });

    it('pays iron 3000 / wood 1500 / brick 1500 from a fixed 6000 pool', () => {
      expect(NaglfarLootPool).toBe(6000);
      expect(lootKindsOf('naglfar').map((s) => s.kind)).toEqual(['stone', 'wood', 'iron']);
      expect(lootPoolByKind('naglfar', 1)).toEqual({ wood: 1500, stone: 1500, food: 0, iron: 3000 });
      expect(lootPoolByKind('naglfar', 30)).toEqual({ wood: 1500, stone: 1500, food: 0, iron: 3000 });
    });

    it('estimated loot is the whole pool while crewed (not scaled by the crew left), nothing once beaten, leftover ignored', () => {
      const full = fullGarrison('naglfar', 1);
      const few = { young: 0, adult: 1, alpha: 0 };
      const none = { young: 0, adult: 0, alpha: 0 };
      const leftover = { wood: 9, stone: 9, food: 9, iron: 9 };
      expect(estimatedLoot('naglfar', 1, few, full, leftover)).toEqual({ wood: 1500, stone: 1500, food: 0, iron: 3000 });
      expect(estimatedLoot('naglfar', 1, none, full, leftover)).toEqual({ wood: 0, stone: 0, food: 0, iron: 0 });
    });

    it('is calm for 1 h after a fight where other camps are calm for 24 h; it never threatens a tower', () => {
      expect(calmHours('naglfar')).toBe(1);
      expect(calmHours('wolfden')).toBe(24);
      const naglfar = { family: 'naglfar', q: 0, r: 0, guardRange: 8, strong: true };
      expect(towerThreatAt([naglfar], { q: 5, r: 0 })).toBeUndefined();
    });
  });
});

describe('tower warning helper', () => {
  const strong = { q: 0, r: 0, guardRange: 3, strong: true };

  it('finds a strong camp whose guard range covers the hex, by hex distance', () => {
    expect(towerThreatAt([strong], { q: 3, r: 0 })).toBe(strong);
    expect(towerThreatAt([strong], { q: 4, r: 0 })).toBeUndefined();
  });

  it('a camp with unknown state (demo) counts as aggressive; live calm, empty, removed or weak camps do not threaten', () => {
    expect(campThreatensTowers(strong)).toBe(true);
    expect(campThreatensTowers({ ...strong, aggressive: true })).toBe(true);
    expect(campThreatensTowers({ ...strong, aggressive: false })).toBe(false);
    expect(campThreatensTowers({ ...strong, empty: true })).toBe(false);
    expect(campThreatensTowers({ ...strong, removed: true })).toBe(false);
    expect(campThreatensTowers({ ...strong, strong: false })).toBe(false);
    expect(towerThreatAt([{ ...strong, aggressive: false }], { q: 1, r: 0 })).toBeUndefined();
  });

  it('buildable only when empty and never Fenrir\'s brood', () => {
    expect(campHexBuildable({ family: 'wolfden' })).toBe(false);
    expect(campHexBuildable({ family: 'wolfden', empty: true })).toBe(true);
    expect(campHexBuildable({ family: 'fenrirbrood', empty: true })).toBe(false);
  });
});
