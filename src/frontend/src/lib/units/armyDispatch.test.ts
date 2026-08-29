import { describe, expect, it } from 'vitest';
import type { UnitDefinitionResponse } from '../../api/types';
import {
  armyStatusLabel,
  buildMoveDispatchRequest,
  formatEta,
  maxAffordableProvisions,
  routeToWaypointsAndDestination,
  totalUpkeepPerHour,
} from './armyDispatch';

function unit(overrides: Partial<UnitDefinitionResponse> & { type: string }): UnitDefinitionResponse {
  return {
    class: 'infantry',
    attack: 0,
    defense: 0,
    speed: 1,
    carryCapacity: 0,
    foodCarryCapacity: 10,
    upkeepPerHour: 1,
    trainingCost: { wood: 0, stone: 0, food: 0, iron: 0 },
    trainingSeconds: 0,
    requiredLonghouseLevel: 1,
    requiredUnitType: null,
    ...overrides,
  };
}

describe('routeToWaypointsAndDestination', () => {
  it('splits an empty route into no waypoints and no destination', () => {
    expect(routeToWaypointsAndDestination([])).toEqual({ waypoints: [], destination: undefined });
  });

  it('treats a single-hex route as destination-only, no waypoints', () => {
    expect(routeToWaypointsAndDestination([{ q: 3, r: -1 }])).toEqual({
      waypoints: [],
      destination: { q: 3, r: -1 },
    });
  });

  it('treats every hex but the last as an ordered intermediate waypoint', () => {
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    expect(routeToWaypointsAndDestination(route)).toEqual({
      waypoints: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      destination: { q: 2, r: 0 },
    });
  });
});

describe('buildMoveDispatchRequest', () => {
  it('returns null when no units are selected', () => {
    expect(buildMoveDispatchRequest({ spearman: 0 }, [{ q: 1, r: 1 }], 100)).toBeNull();
  });

  it('returns null when no route has been drawn yet', () => {
    expect(buildMoveDispatchRequest({ spearman: 5 }, [], 100)).toBeNull();
  });

  it('builds a move request, omitting waypoints when the route is destination-only', () => {
    const request = buildMoveDispatchRequest({ spearman: 5, axeman: 0 }, [{ q: 2, r: -2 }], 50);
    expect(request).toEqual({
      units: [{ unit: 'spearman', count: 5 }],
      waypoints: undefined,
      destination: { q: 2, r: -2 },
      provisions: 50,
      mission: 'move',
    });
  });

  it('carries intermediate waypoints through for a multi-hop route', () => {
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    const request = buildMoveDispatchRequest({ spearman: 3 }, route, 20);
    expect(request?.waypoints).toEqual([{ q: 0, r: 0 }, { q: 1, r: 0 }]);
    expect(request?.destination).toEqual({ q: 2, r: 0 });
  });
});

describe('maxAffordableProvisions', () => {
  const byType = {
    spearman: unit({ type: 'spearman', foodCarryCapacity: 10 }),
    provisioner: unit({ type: 'provisioner', foodCarryCapacity: 100 }),
  };

  it('caps at combined carry capacity when food stock is plentiful', () => {
    expect(maxAffordableProvisions({ spearman: 4 }, byType, 10_000)).toBe(40);
  });

  it('caps at the settlement food stock when that is the binding constraint', () => {
    expect(maxAffordableProvisions({ provisioner: 2 }, byType, 30)).toBe(30);
  });

  it('ignores zero-count and unknown unit types', () => {
    expect(maxAffordableProvisions({ spearman: 0, ghost: 5 }, byType, 1000)).toBe(0);
  });

  it('never returns negative provisions for an empty selection', () => {
    expect(maxAffordableProvisions({}, byType, 500)).toBe(0);
  });
});

describe('totalUpkeepPerHour', () => {
  it('sums upkeep across selected unit types, ignoring unselected ones', () => {
    const byType = {
      spearman: unit({ type: 'spearman', upkeepPerHour: 2 }),
      axeman: unit({ type: 'axeman', upkeepPerHour: 3 }),
    };
    expect(totalUpkeepPerHour({ spearman: 5, axeman: 2, ghost: 9 }, byType)).toBe(2 * 5 + 3 * 2);
  });
});

describe('formatEta', () => {
  const now = new Date('2026-08-29T12:00:00.000Z').getTime();

  it('reports "Arriving" once the target is due or past', () => {
    expect(formatEta(new Date(now).toISOString(), now)).toBe('Arriving');
    expect(formatEta(new Date(now - 5000).toISOString(), now)).toBe('Arriving');
  });

  it('formats hours and minutes for a long wait', () => {
    expect(formatEta(new Date(now + (2 * 3600 + 14 * 60) * 1000).toISOString(), now)).toBe('2h 14m');
  });

  it('formats minutes and seconds under an hour', () => {
    expect(formatEta(new Date(now + (14 * 60 + 6) * 1000).toISOString(), now)).toBe('14m 6s');
  });

  it('formats bare seconds under a minute', () => {
    expect(formatEta(new Date(now + 6000).toISOString(), now)).toBe('6s');
  });
});

describe('armyStatusLabel', () => {
  it('labels a home army', () => {
    expect(armyStatusLabel({ atHome: true, supporting: false, movement: null })).toBe('At home');
  });

  it('labels a supporting guest army', () => {
    expect(armyStatusLabel({ atHome: false, supporting: true, movement: null })).toBe('Supporting');
  });

  it('labels an outbound army as in transit', () => {
    expect(
      armyStatusLabel({ atHome: false, supporting: false, movement: { isReturning: false } }),
    ).toBe('In transit');
  });

  it('labels an army on its way home as returning', () => {
    expect(
      armyStatusLabel({ atHome: false, supporting: false, movement: { isReturning: true } }),
    ).toBe('Returning');
  });
});
