import { describe, expect, it } from 'vitest';
import {
  BASE_STORAGE,
  MILLS,
  PRODUCER_TYPES,
  boostTerrainsOf,
  millBoostAt,
  neighbourBoost,
  storageHouseSteps,
} from './productionDocs';
import { RADIUS_BOOST_RESOURCE, buildingStatsFor, type BuildingKind } from '../map/buildingEconomy';
import catalogue from '../../data/building-catalogue.json';

const level1 = (type: string) => catalogue.data.find((d) => d.type === type && d.level === 1)!;

describe('productionDocs', () => {
  it('lists producers that the catalogue gives exactly one resource each, at the tabled level-1 rates', () => {
    const rates = Object.fromEntries(
      PRODUCER_TYPES.map((type) => {
        const per = level1(type).productionPerHour;
        const made = Object.entries(per).filter(([, v]) => v > 0);
        expect(made, type).toHaveLength(1);
        return [type, made[0]];
      }),
    );
    expect(rates).toEqual({
      lumberjack: ['wood', 40],
      quarry: ['stone', 40],
      reindeerherder: ['food', 40],
      farm: ['food', 40],
      pumpkinfarm: ['food', 44],
      fishinghut: ['food', 40],
      claybrickworks: ['stone', 36],
      bogoreworks: ['iron', 20],
    });
  });

  it('raises Farms but not Pumpkin Farms with the Crop Mill, as the backend does', () => {
    const cropMill = MILLS.find((m) => m.type === 'cropmill')!;
    expect(cropMill.boosts).toEqual(['farm']);
    expect(MILLS.map((m) => [m.type, m.boosts])).toEqual([
      ['sawmill', ['lumberjack']],
      ['cropmill', ['farm']],
      ['hammerschmiede', ['bogoreworks']],
    ]);
  });

  it('keeps every mill in step with the resource buildingEconomy.ts says it raises', () => {
    for (const mill of MILLS) {
      const modifier = buildingStatsFor(mill.type as BuildingKind, 1).modifier;
      expect(modifier?.kind, mill.type).toBe('radiusBoost');
      for (const target of mill.boosts) {
        const output = buildingStatsFor(target as BuildingKind, 1).output;
        expect(output?.kind === 'resourceRate' && output.resource, target).toBe(RADIUS_BOOST_RESOURCE[mill.type as BuildingKind]);
      }
    }
  });

  it('gives a mill 5% and one ring at level 1, 50% at level 10 and 100% with five rings at level 20', () => {
    expect(millBoostAt(1)).toEqual({ percent: 5, rings: 1 });
    expect(millBoostAt(5)).toEqual({ percent: 25, rings: 2 });
    expect(millBoostAt(10)).toEqual({ percent: 50, rings: 3 });
    expect(millBoostAt(20)).toEqual({ percent: 100, rings: 5 });
  });

  it('adds 10% per matching neighbour up to 50%, only for the four terrain producers', () => {
    expect(neighbourBoost()).toEqual({ perNeighbour: 10, max: 50 });
    expect(boostTerrainsOf('lumberjack')).toEqual(['forest']);
    expect(boostTerrainsOf('fishinghut')).toEqual(['sea', 'lake']);
    expect(boostTerrainsOf('bogoreworks')).toEqual(['bog', 'lake']);
    for (const none of ['farm', 'pumpkinfarm', 'reindeerherder', 'claybrickworks'] as const) {
      expect(boostTerrainsOf(none), none).toEqual([]);
    }
  });

  it('asks for one more storehouse at a higher level each time, up to four at level 25', () => {
    expect(storageHouseSteps()).toEqual([
      { nth: 2, later: false, count: 1, level: 10 },
      { nth: 3, later: false, count: 2, level: 15 },
      { nth: 4, later: false, count: 3, level: 20 },
      { nth: 5, later: true, count: 4, level: 25 },
    ]);
  });

  it('starts every resource at a storage floor of 500', () => {
    expect(BASE_STORAGE).toBe(500);
  });
});
