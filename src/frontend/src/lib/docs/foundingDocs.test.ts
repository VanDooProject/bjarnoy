import { describe, expect, it } from 'vitest';
import {
  FOUNDING_CREWS,
  MINIMUM_SPACING,
  crewCostMultiplier,
  feastCost,
  feastRenown,
  foundingStock,
  renownRequired,
} from './foundingDocs';
import catalogue from '../../data/building-catalogue.json';
import units from '../../data/unit-catalogue.json';

describe('foundingDocs', () => {
  it('doubles the crew price with every settlement already held', () => {
    expect([1, 2, 3, 4].map(crewCostMultiplier)).toEqual([1, 2, 4, 8]);
    expect(crewCostMultiplier(0)).toBe(1);
  });

  it('asks 55,000 renown for the 2nd settlement and doubles it from there', () => {
    expect([1, 2, 3, 4, 5].map(renownRequired)).toEqual([0, 55_000, 110_000, 220_000, 440_000]);
  });

  it('prices a feast at 800 of each resource and 3,500 renown at level 1, growing with the level', () => {
    expect(feastCost(1)).toBe(800);
    expect(feastRenown(1)).toBe(3500);
    expect(feastCost(2)).toBe(1000);
    expect(feastRenown(2)).toBe(4025);
  });

  it('starts a new settlement with 700 of wood, stone and food and no iron, given the level-1 Longhouse store', () => {
    const longhouse = catalogue.data.find((d) => d.type === 'longhouse' && d.level === 1)!;
    expect(foundingStock(longhouse.storageCapacity.wood)).toEqual({ wood: 700, stone: 700, food: 700, iron: 0 });
  });

  it('founds with exactly three crews, 15 hexes clear of every claim', () => {
    expect(FOUNDING_CREWS).toBe(3);
    expect(MINIMUM_SPACING).toBe(15);
  });

  it('trains Settler crews at the Cart Workshop, so the page can name it from the unit catalogue', () => {
    const crew = units.data.find((u) => u.type === 'settlercrew')!;
    expect(crew.requiredBuildingType).toBe('cartworkshop');
    expect(crew.foodCarryCapacity * FOUNDING_CREWS).toBe(120);
  });
});
