import { describe, expect, it } from 'vitest';
import type { BuildingDefinitionResponse } from '../../api/types';
import { buildingUpgradeCost } from '../map/buildingEconomy';
import { upgradeVerdict, type UpgradeVerdictInput } from './upgradeRules';

const stock = (o: Partial<Record<'wood' | 'stone' | 'food' | 'iron', number>> = {}) => ({ wood: 0, stone: 0, food: 0, iron: 0, ...o });
const def = (level: number, over: Partial<BuildingDefinitionResponse> = {}) =>
  ({ type: 'lumberjack', level, cost: stock({ wood: 100 }), buildSeconds: 60, requiredLonghouseLevel: 1, slotCost: 1, occupiesMostSlots: false, prerequisites: [], ...over }) as BuildingDefinitionResponse;

const verdict = (over: Partial<UpgradeVerdictInput<BuildingDefinitionResponse>> = {}) =>
  upgradeVerdict({
    type: 'lumberjack',
    builtLevel: 2,
    queue: [],
    at: { q: 1, r: 2 },
    definitions: [def(1), def(2), def(3)],
    longhouseLevel: 5,
    builtLevels: { longhouse: 5 },
    storageCap: stock({ wood: 5000, stone: 5000, food: 5000, iron: 5000 }),
    ...over,
  });

describe('upgradeVerdict', () => {
  it('targets the next level with the catalogue price and no blocker', () => {
    expect(verdict()).toMatchObject({ nextLevel: 3, atMax: false, maxed: false, storageShort: false, cost: stock({ wood: 100 }) });
    expect(verdict().blockers).toEqual({ longhouse: undefined, prerequisites: [] });
  });

  it('prices a building the catalogue lacks with the client estimate', () => {
    const v = verdict({ type: 'hut', builtLevel: 1, definitions: undefined });
    expect(v.cost).toEqual(buildingUpgradeCost('hut', 2));
  });

  it('is at max only when the building stands at the last level; an order for it makes it maxed, not at max', () => {
    expect(verdict({ builtLevel: 3 })).toMatchObject({ atMax: true, maxed: true, cost: undefined });
    const queued = verdict({ queue: [{ q: 1, r: 2, kind: 'build', targetLevel: 3 }] });
    expect(queued).toMatchObject({ atMax: false, maxed: true, cost: undefined });
  });

  it('lists the Longhouse level and the missing prerequisites', () => {
    const v = verdict({
      definitions: [def(1), def(2), def(3, { requiredLonghouseLevel: 8, prerequisites: [{ type: 'barracks', level: 2 }] })],
      builtLevels: { longhouse: 5, barracks: 1 },
    });
    expect(v.blockers).toEqual({ longhouse: 8, prerequisites: [{ type: 'barracks', level: 2 }] });
  });

  it('flags a price the stores can never hold', () => {
    expect(verdict({ storageCap: stock({ wood: 99, stone: 5000, food: 5000, iron: 5000 }) }).storageShort).toBe(true);
    expect(verdict({ storageCap: stock({ wood: 100, stone: 5000, food: 5000, iron: 5000 }) }).storageShort).toBe(false);
  });
});
