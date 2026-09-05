import { describe, expect, it } from 'vitest';
import type { UnitDefinitionResponse } from '../../api/types';
import {
  armyStatusLabel,
  buildAttackDispatchRequest,
  buildFieldOrderRequest,
  buildMoveDispatchRequest,
  buildSupportDispatchRequest,
  canFieldOrderArmy,
  classifyUnitSelection,
  formatEta,
  hasCatapultSelected,
  isUnitSelectableFor,
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

describe('buildAttackDispatchRequest', () => {
  it('returns null when no units are selected', () => {
    expect(buildAttackDispatchRequest({ spearman: 0 }, [], 100, 'target-1')).toBeNull();
  });

  it('returns null when no target settlement is chosen', () => {
    expect(buildAttackDispatchRequest({ spearman: 5 }, [], 100, null)).toBeNull();
  });

  it('builds an attack request with no waypoints when the route is empty (a direct route)', () => {
    const request = buildAttackDispatchRequest({ spearman: 5, axeman: 0 }, [], 50, 'target-1');
    expect(request).toEqual({
      units: [{ unit: 'spearman', count: 5 }],
      waypoints: undefined,
      provisions: 50,
      mission: 'attack',
      targetSettlementId: 'target-1',
    });
  });

  it('treats every clicked hex as a waypoint — never a destination, unlike a move dispatch', () => {
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    const request = buildAttackDispatchRequest({ spearman: 3 }, route, 20, 'target-1');
    expect(request?.waypoints).toEqual([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }]);
    expect(request?.destination).toBeUndefined();
  });

  it('omits targetBuildingCoord when no preferred target building was picked', () => {
    const request = buildAttackDispatchRequest({ catapult: 3 }, [], 20, 'target-1');
    expect(request?.targetBuildingCoord).toBeUndefined();
  });

  it('carries a preferred target building coordinate through when one was picked', () => {
    const request = buildAttackDispatchRequest({ catapult: 3 }, [], 20, 'target-1', { q: 4, r: -2 });
    expect(request?.targetBuildingCoord).toEqual({ q: 4, r: -2 });
  });

  it('treats an explicit null target building the same as "no preference"', () => {
    const request = buildAttackDispatchRequest({ catapult: 3 }, [], 20, 'target-1', null);
    expect(request?.targetBuildingCoord).toBeUndefined();
  });
});

describe('hasCatapultSelected', () => {
  it('is false when no catapults are in the selection', () => {
    expect(hasCatapultSelected({ spearman: 5 })).toBe(false);
    expect(hasCatapultSelected({})).toBe(false);
  });

  it('is false when catapult count is zero', () => {
    expect(hasCatapultSelected({ spearman: 5, catapult: 0 })).toBe(false);
  });

  it('is true when at least one catapult is selected', () => {
    expect(hasCatapultSelected({ spearman: 5, catapult: 2 })).toBe(true);
  });
});

describe('buildSupportDispatchRequest', () => {
  it('returns null when no units are selected', () => {
    expect(buildSupportDispatchRequest({ spearman: 0 }, [], 100, 'target-1')).toBeNull();
  });

  it('returns null when no target settlement is chosen', () => {
    expect(buildSupportDispatchRequest({ spearman: 5 }, [], 100, null)).toBeNull();
  });

  it('builds a support request with no waypoints when the route is empty (a direct route)', () => {
    const request = buildSupportDispatchRequest({ spearman: 5, axeman: 0 }, [], 50, 'target-1');
    expect(request).toEqual({
      units: [{ unit: 'spearman', count: 5 }],
      waypoints: undefined,
      provisions: 50,
      mission: 'support',
      targetSettlementId: 'target-1',
    });
  });

  it('treats every clicked hex as a waypoint — never a destination, same as an attack dispatch', () => {
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    const request = buildSupportDispatchRequest({ spearman: 3 }, route, 20, 'target-1');
    expect(request?.waypoints).toEqual([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }]);
    expect(request?.destination).toBeUndefined();
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

  it('labels a supporting guest army with no settlement name given', () => {
    expect(armyStatusLabel({ atHome: false, supporting: true, movement: null })).toBe('Supporting');
  });

  it('labels a supporting guest army with the host settlement name when known', () => {
    expect(
      armyStatusLabel({ atHome: false, supporting: true, movement: null }, 'Fjordholm'),
    ).toBe('Supporting Fjordholm');
  });

  it('falls back to the bare label when the settlement name is not yet known', () => {
    expect(armyStatusLabel({ atHome: false, supporting: true, movement: null }, null)).toBe('Supporting');
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

describe('classifyUnitSelection', () => {
  const byType = {
    spearman: unit({ type: 'spearman', class: 'infantry' }),
    catapult: unit({ type: 'catapult', class: 'siege' }),
    karve: unit({ type: 'karve', class: 'ship' }),
    longship: unit({ type: 'longship', class: 'ship' }),
  };

  it('reports "none" when nothing is selected', () => {
    expect(classifyUnitSelection({}, byType)).toBe('none');
    expect(classifyUnitSelection({ spearman: 0, karve: 0 }, byType)).toBe('none');
  });

  it('reports "land" for a non-ship-only selection, siege included', () => {
    expect(classifyUnitSelection({ spearman: 3, catapult: 1 }, byType)).toBe('land');
  });

  it('reports "fleet" for a ship-only selection', () => {
    expect(classifyUnitSelection({ karve: 2, longship: 1 }, byType)).toBe('fleet');
  });

  it('reports "mixed" once both families are selected', () => {
    expect(classifyUnitSelection({ spearman: 1, karve: 1 }, byType)).toBe('mixed');
  });

  it('ignores unit types missing from the catalogue', () => {
    expect(classifyUnitSelection({ unknown: 5 }, byType)).toBe('none');
  });
});

describe('isUnitSelectableFor', () => {
  const byType = {
    spearman: unit({ type: 'spearman', class: 'infantry' }),
    karve: unit({ type: 'karve', class: 'ship' }),
  };

  it('leaves every class pickable when nothing is selected yet', () => {
    expect(isUnitSelectableFor('spearman', 'none', byType)).toBe(true);
    expect(isUnitSelectableFor('karve', 'none', byType)).toBe(true);
  });

  it('locks out ships once a land selection is committed', () => {
    expect(isUnitSelectableFor('spearman', 'land', byType)).toBe(true);
    expect(isUnitSelectableFor('karve', 'land', byType)).toBe(false);
  });

  it('locks out land units once a fleet selection is committed', () => {
    expect(isUnitSelectableFor('karve', 'fleet', byType)).toBe(true);
    expect(isUnitSelectableFor('spearman', 'fleet', byType)).toBe(false);
  });

  it('locks out nothing further for an (unreachable in practice) mixed selection', () => {
    expect(isUnitSelectableFor('spearman', 'mixed', byType)).toBe(true);
    expect(isUnitSelectableFor('karve', 'mixed', byType)).toBe(true);
  });
});

describe('buildFieldOrderRequest', () => {
  it('returns null for an empty route — a field order always needs a destination', () => {
    expect(buildFieldOrderRequest([])).toBeNull();
  });

  it('treats a single-hex route as destination-only, no waypoints', () => {
    expect(buildFieldOrderRequest([{ q: 3, r: -1 }])).toEqual({
      waypoints: undefined,
      destination: { q: 3, r: -1 },
    });
  });

  it('splits a multi-hex route into waypoints plus a final destination', () => {
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    expect(buildFieldOrderRequest(route)).toEqual({
      waypoints: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      destination: { q: 2, r: 0 },
    });
  });
});

describe('canFieldOrderArmy', () => {
  it('refuses an army standing at home', () => {
    expect(canFieldOrderArmy({ atHome: true, supporting: false, mission: 'move', movement: null })).toBe(false);
  });

  it('refuses a guest army supporting elsewhere', () => {
    expect(canFieldOrderArmy({ atHome: false, supporting: true, mission: 'move', movement: null })).toBe(false);
  });

  it('refuses an army already heading home', () => {
    expect(
      canFieldOrderArmy({
        atHome: false,
        supporting: false,
        mission: 'move',
        movement: { isReturning: true },
      }),
    ).toBe(false);
  });

  it('refuses an attack/support/raid mission — out of scope for issue #156 phase 1', () => {
    for (const mission of ['attack', 'support', 'raid']) {
      expect(
        canFieldOrderArmy({ atHome: false, supporting: false, mission, movement: { isReturning: false } }),
      ).toBe(false);
    }
  });

  it('allows a standing or marching move/found army', () => {
    for (const mission of ['move', 'found']) {
      expect(
        canFieldOrderArmy({ atHome: false, supporting: false, mission, movement: { isReturning: false } }),
      ).toBe(true);
    }
  });
});
