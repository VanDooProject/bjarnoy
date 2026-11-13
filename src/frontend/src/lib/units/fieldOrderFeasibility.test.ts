import { describe, expect, it } from 'vitest';
import type { UnitDefinitionResponse } from '../../api/types';
import type { AxialCoord } from '../hex/coords';
import { fieldOrderFeasibility, stackCounts, type FeasibilityArmy, type FeasibilityEnv } from './fieldOrderFeasibility';

function unit(overrides: Partial<UnitDefinitionResponse> & { type: string }): UnitDefinitionResponse {
  return {
    class: 'infantry',
    attack: 0,
    defense: 0,
    speed: 2,
    visionRadius: 2,
    carryCapacity: 0,
    foodCarryCapacity: 10,
    cargoSlots: 0,
    shipSlots: 0,
    upkeepPerHour: 1,
    ranged: false,
    trainingCost: { wood: 0, stone: 0, food: 0, iron: 0 },
    trainingSeconds: 0,
    requiredLonghouseLevel: 1,
    requiredUnitType: null,
    requiredBuildingType: 'longhouse',
    requiredBuildingLevel: 1,
    siegeTargets: [],
    ...overrides,
  };
}

const byType = {
  spearman: unit({ type: 'spearman', speed: 2, upkeepPerHour: 1 }),
  ram: unit({ type: 'ram', class: 'siege', speed: 1, upkeepPerHour: 3 }),
  longship: unit({ type: 'longship', class: 'ship', speed: 4, upkeepPerHour: 2 }),
};

const HOME: AxialCoord = { q: 0, r: 0 };
const NOW = Date.parse('2026-11-09T12:00:00Z');

/** Routes along a line: the price is the hex distance, one hex-cost unit a hex. */
function lineEnv(overrides: Partial<FeasibilityEnv> = {}): FeasibilityEnv {
  return {
    byType,
    worldSpeedFactor: 1,
    now: NOW,
    route: (from, to) => ({ path: [from, to], cost: Math.abs(to.q - from.q) + Math.abs(to.r - from.r) }),
    ...overrides,
  };
}

/** A standing army 10 hexes out: it left from HOME and stands on (10, 0). */
function standing(overrides: Partial<FeasibilityArmy> = {}): FeasibilityArmy {
  return {
    provisions: 100,
    stacks: [{ unit: 'spearman', count: 10 }],
    position: { q: 10, r: 0 },
    movement: { path: [HOME, { q: 10, r: 0 }], arrivesAt: '2026-11-09T10:00:00Z', isReturning: false },
    ...overrides,
  };
}

describe('fieldOrderFeasibility', () => {
  it('is reachable when the food covers the way out and the way home from the target', () => {
    // 10 spearmen, speed 2, 10 food/h. Target (4, 0): 6 hexes out = 3 h, 4 hexes home = 2 h -> 5 h * 10 = 50 <= 100.
    const verdict = fieldOrderFeasibility(standing(), { q: 4, r: 0 }, 'move', lineEnv());

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.outboundHours).toBeCloseTo(3);
    expect(verdict.returnHours).toBeCloseTo(2);
    expect(verdict.travelMinutes).toBe(180);
    expect(verdict.fleet).toBe(false);
  });

  it('is unreachable when there is no route to the target', () => {
    const env = lineEnv({ route: (from, to) => (to.q === 4 ? null : { path: [from, to], cost: 1 }) });

    expect(fieldOrderFeasibility(standing(), { q: 4, r: 0 }, 'move', env)).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('is unreachable when there is a way out but none back home from the target', () => {
    const env = lineEnv({
      route: (from, to) => (to.q === 0 && to.r === 0 ? null : { path: [from, to], cost: Math.abs(to.q - from.q) }),
    });

    expect(fieldOrderFeasibility(standing(), { q: 4, r: 0 }, 'move', env)).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('refuses when the food does not cover outbound plus the way home', () => {
    // Target (30, 0): 20 hexes out = 10 h, 30 back = 15 h -> 25 h * 10 food/h = 250 > 100.
    expect(fieldOrderFeasibility(standing(), { q: 30, r: 0 }, 'move', lineEnv())).toEqual({ ok: false, reason: 'noFood' });
  });

  it('a split can afford what the whole army cannot: a faster leaving part, with only its share of the food', () => {
    const army = standing({
      provisions: 100,
      stacks: [
        { unit: 'spearman', count: 5 },
        { unit: 'ram', count: 5 },
      ],
    });
    // Whole army: pace 1 (the rams), upkeep 20/h. Target (8, 0): 2 h out, 8 h back = 10 h * 20 = 200 > 100.
    const near = { q: 8, r: 0 };
    expect(fieldOrderFeasibility(army, near, 'move', lineEnv())).toEqual({ ok: false, reason: 'noFood' });

    // Only the spearmen: pace 2 -> 1 h out + 4 h back = 5 h at 5 food/h = 25; their share is 5/20 of 100 = 25.
    expect(fieldOrderFeasibility(army, near, 'move', lineEnv(), { spearman: 5 }).ok).toBe(true);

    // A bit further and the same part is short of food: (12, 0): 1 h out + 6 h back = 7 h * 5 = 35 > 25.
    expect(fieldOrderFeasibility(army, { q: 12, r: 0 }, 'move', lineEnv(), { spearman: 5 })).toEqual({ ok: false, reason: 'noFood' });
  });

  it('is not possible with no units leaving', () => {
    expect(fieldOrderFeasibility(standing(), { q: 4, r: 0 }, 'move', lineEnv(), { spearman: 0 })).toEqual({
      ok: false,
      reason: 'noUnits',
    });
  });

  it('counts the hours a marching army still has to walk before the order starts', () => {
    const marching = standing({
      position: { q: 6, r: 0 },
      movement: { path: [HOME, { q: 10, r: 0 }], arrivesAt: '2026-11-09T14:00:00Z', isReturning: false },
    });

    const verdict = fieldOrderFeasibility(marching, { q: 4, r: 0 }, 'move', lineEnv());

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    // 2 h left on the current leg + 3 h from its destination to the target.
    expect(verdict.outboundHours).toBeCloseTo(5);
  });

  it('scales travel time with the world speed', () => {
    const verdict = fieldOrderFeasibility(standing(), { q: 4, r: 0 }, 'move', lineEnv({ worldSpeedFactor: 2 }));

    expect(verdict.ok && verdict.outboundHours).toBeCloseTo(1.5);
  });

  it('plans a fleet over the sea table', () => {
    const asked: boolean[] = [];
    const env = lineEnv({
      route: (from, to, fleet) => {
        asked.push(fleet);
        return { path: [from, to], cost: Math.abs(to.q - from.q) };
      },
    });

    const verdict = fieldOrderFeasibility(standing({ stacks: [{ unit: 'longship', count: 2 }] }), { q: 14, r: 0 }, 'move', env);

    expect(verdict.ok && verdict.fleet).toBe(true);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every(Boolean)).toBe(true);
  });

  it('a hunt walks to the nearest reachable hex around a camp whose own hex cannot be walked', () => {
    const camp = { q: 10, r: 4 };
    const env = lineEnv({
      route: (from, to) =>
        to.q === camp.q && to.r === camp.r ? null : { path: [from, to], cost: Math.abs(to.q - from.q) + Math.abs(to.r - from.r) },
    });

    expect(fieldOrderFeasibility(standing(), camp, 'hunt', env).ok).toBe(true);
    expect(fieldOrderFeasibility(standing(), camp, 'move', env)).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('is pending, not unreachable, while the way out is still being searched', () => {
    const env = lineEnv({ route: () => 'pending' });

    expect(fieldOrderFeasibility(standing(), { q: 4, r: 0 }, 'move', env)).toEqual({ ok: false, reason: 'pending' });
  });

  it('is pending while only the way home is still being searched', () => {
    const env = lineEnv({
      route: (from, to) => (to.q === HOME.q && to.r === HOME.r ? 'pending' : { path: [from, to], cost: Math.abs(to.q - from.q) }),
    });

    expect(fieldOrderFeasibility(standing(), { q: 4, r: 0 }, 'move', env)).toEqual({ ok: false, reason: 'pending' });
  });

  it('a hunt waits for every candidate hex around the camp, since a pending one could be the cheapest', () => {
    const camp = { q: 10, r: 4 };
    const env = lineEnv({
      route: (from, to) =>
        to.q === camp.q + 1 && to.r === camp.r ? 'pending' : { path: [from, to], cost: Math.abs(to.q - from.q) + Math.abs(to.r - from.r) },
    });

    expect(fieldOrderFeasibility(standing(), camp, 'hunt', env)).toEqual({ ok: false, reason: 'pending' });
  });

  it('no route at all is unreachable', () => {
    const env = lineEnv({ route: () => null });

    expect(fieldOrderFeasibility(standing(), { q: 4, r: 0 }, 'move', env)).toEqual({ ok: false, reason: 'unreachable' });
  });
});

describe('stackCounts', () => {
  it('does not claim a stranded army can go anywhere: its path is no way home, and the client does not know where home is', () => {
    // Stranded where it stands, and stranded on the walk to the hex it stops on: neither path starts at home.
    const standingStranded = standing({
      position: { q: 5, r: 0 },
      movement: { path: [{ q: 5, r: 0 }], arrivesAt: '2026-11-09T10:00:00Z', isReturning: false, isStranded: true },
    });
    const walking = standing({
      position: { q: 9, r: 0 },
      movement: { path: [{ q: 10, r: 0 }, { q: 9, r: 0 }, { q: 8, r: 0 }], arrivesAt: '2026-11-09T13:00:00Z', isReturning: false, isStranded: true },
    });

    expect(fieldOrderFeasibility(standingStranded, { q: 4, r: 0 }, 'move', lineEnv())).toEqual({ ok: false, reason: 'unreachable' });
    expect(fieldOrderFeasibility(walking, { q: 4, r: 0 }, 'move', lineEnv())).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('sums stacks of one unit and skips empty ones', () => {
    expect(
      stackCounts([
        { unit: 'spearman', count: 3 },
        { unit: 'spearman', count: 2 },
        { unit: 'ram', count: 0 },
      ]),
    ).toEqual({ spearman: 5 });
  });
});
