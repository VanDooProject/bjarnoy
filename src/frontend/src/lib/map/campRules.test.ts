import { describe, expect, it } from 'vitest';
import {
  campHexBuildable,
  campThreatensTowers,
  defensePower,
  effectiveLevel,
  estimatedLoot,
  fullGarrison,
  lootKindsOf,
  lootPool,
  lootPoolByKind,
  towerThreatAt,
} from './campRules';

describe('campRules', () => {
  it('full garrison defense power matches the design numbers', () => {
    const p = (l: number, s: 'weak' | 'strong') => defensePower(fullGarrison(l, s), s);
    expect(p(1, 'strong')).toBe(195);
    expect(p(5, 'strong')).toBe(815);
    expect(p(10, 'strong')).toBe(1590);
    expect(p(25, 'strong')).toBe(3915);
    expect(p(1, 'weak')).toBe(66);
    expect(p(5, 'weak')).toBe(245);
    expect(p(25, 'weak')).toBe(1265);
  });

  it('garrison tiers: alpha count never goes negative for weak camps', () => {
    expect(fullGarrison(1, 'weak')).toEqual({ young: 3, adult: 5, alpha: 0 });
    expect(fullGarrison(1, 'strong')).toEqual({ young: 3, adult: 6, alpha: 0 });
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

  it('estimated loot scales the pool by the garrison fraction and adds leftover', () => {
    const full = fullGarrison(1, 'weak');
    const half = { young: 0, adult: 0, alpha: 0 };
    const leftover = { wood: 0, stone: 0, food: 7, iron: 0 };
    expect(estimatedLoot('deerglade', 1, full, full, leftover).food).toBe(457);
    expect(estimatedLoot('deerglade', 1, half, full, leftover).food).toBe(7);
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
