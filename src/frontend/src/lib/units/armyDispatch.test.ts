import { describe, expect, it } from 'vitest';
import type { UnitDefinitionResponse } from '../../api/types';
import {
  armyStatusLabel,
  buildAttackDispatchRequest,
  buildFieldOrderRequest,
  buildHuntDispatchRequest,
  garrisonCanHunt,
  isHuntUnit,
  buildMoveDispatchRequest,
  buildFoundDispatchRequest,
  dispatchHasDestination,
  dispatchTargetCoord,
  isRouteDestination,
  buildSupportDispatchRequest,
  canFieldOrderArmy,
  classifyUnitSelection,
  formatEta,
  breachesWalls,
  canSiegeDamage,
  hasSiegeEngineSelected,
  selectedSiegeTargets,
  siegeTargetKindOf,
  isFieldOrderMidMarch,
  exceedsShipCapacity,
  maxAffordableProvisions,
  shipSlotUsage,
  routeToWaypointsAndDestination,
  shoreBuildings,
  targetBuildingPickerMode,
  totalSpeed,
  totalUpkeepPerHour,
  trainingSite,
} from './armyDispatch';

function unit(overrides: Partial<UnitDefinitionResponse> & { type: string }): UnitDefinitionResponse {
  return {
    class: 'infantry',
    attack: 0,
    defense: 0,
    speed: 1,
    visionRadius: 2,
    carryCapacity: 0,
    foodCarryCapacity: 10,
    cargoSlots: 0,
    shipSlots: 0,
    upkeepPerHour: 1,
    trainingCost: { wood: 0, stone: 0, food: 0, iron: 0 },
    trainingSeconds: 0,
    requiredLonghouseLevel: 1,
    requiredUnitType: null,
    requiredBuildingType: 'longhouse',
    siegeTargets: [],
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

// The units of a test dispatch, all leaving from one spot: the shape `DispatchArmyRequest.from` wants.
const at = (counts: Record<string, number>) => {
  const units = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([unit, count]) => ({ unit, count }));
  return units.length > 0 ? [{ spot: { q: 0, r: 0 }, units }] : [];
};
const spot = { q: 7, r: 1 };

describe('buildMoveDispatchRequest', () => {
  it('returns null when no units are selected', () => {
    expect(buildMoveDispatchRequest(at({ spearman: 0 }), [{ q: 1, r: 1 }], 100)).toBeNull();
  });

  it('returns null when no route has been drawn yet', () => {
    expect(buildMoveDispatchRequest(at({ spearman: 5 }), [], 100)).toBeNull();
  });

  it('builds a move request, omitting waypoints when the route is destination-only', () => {
    const request = buildMoveDispatchRequest(at({ spearman: 5, axeman: 0 }), [{ q: 2, r: -2 }], 50);
    expect(request).toEqual({
      from: [{ spot: { q: 0, r: 0 }, units: [{ unit: 'spearman', count: 5 }] }],
      waypoints: undefined,
      destination: { q: 2, r: -2 },
      provisions: 50,
      mission: 'move',
    });
  });

  it('carries intermediate waypoints through for a multi-hop route', () => {
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    const request = buildMoveDispatchRequest(at({ spearman: 3 }), route, 20);
    expect(request?.waypoints).toEqual([{ q: 0, r: 0 }, { q: 1, r: 0 }]);
    expect(request?.destination).toEqual({ q: 2, r: 0 });
  });
});

describe('buildFoundDispatchRequest', () => {
  it('returns null without units or without a route', () => {
    expect(buildFoundDispatchRequest(at({ settler: 0 }), [{ q: 1, r: 1 }], 10)).toBeNull();
    expect(buildFoundDispatchRequest(at({ settler: 5 }), [], 10)).toBeNull();
  });

  it('is a move-shaped request with mission found: last hex is the destination', () => {
    const route = [{ q: 0, r: 0 }, { q: 3, r: -1 }];
    expect(buildFoundDispatchRequest(at({ settler: 5, karve: 0 }), route, 40)).toEqual({
      from: [{ spot: { q: 0, r: 0 }, units: [{ unit: 'settler', count: 5 }] }],
      waypoints: [{ q: 0, r: 0 }],
      destination: { q: 3, r: -1 },
      provisions: 40,
      mission: 'found',
    });
  });

  it('carries ships and land escorts next to the settlers', () => {
    const request = buildFoundDispatchRequest(at({ settler: 5, karve: 1, spearman: 4 }), [{ q: 2, r: 0 }], 12);
    expect(request?.from[0].units).toEqual(
      expect.arrayContaining([{ unit: 'settler', count: 5 }, { unit: 'karve', count: 1 }, { unit: 'spearman', count: 4 }]),
    );
    expect(request?.from[0].units).toHaveLength(3);
  });

  it('matches the move request except for the mission', () => {
    const route = [{ q: 1, r: 1 }, { q: 2, r: 2 }];
    const counts = { settler: 5, karve: 1 };
    expect({ ...buildFoundDispatchRequest(at(counts), route, 7), mission: 'move' }).toEqual(
      buildMoveDispatchRequest(at(counts), route, 7),
    );
  });
});

describe('isRouteDestination', () => {
  it('marks the last hex of a move or found route only', () => {
    expect(isRouteDestination('move', 1, 2)).toBe(true);
    expect(isRouteDestination('found', 1, 2)).toBe(true);
    expect(isRouteDestination('found', 0, 2)).toBe(false);
    expect(isRouteDestination('attack', 1, 2)).toBe(false);
    expect(isRouteDestination('hunt', 1, 2)).toBe(false);
  });
});

describe('dispatchHasDestination', () => {
  const base = { targetSettlementId: null, targetCamp: null, route: [] };
  it('needs a route for move and found', () => {
    expect(dispatchHasDestination({ ...base, mission: 'found' })).toBe(false);
    expect(dispatchHasDestination({ ...base, mission: 'found', route: [{ q: 1, r: 0 }] })).toBe(true);
    expect(dispatchHasDestination({ ...base, mission: 'move', route: [{ q: 1, r: 0 }] })).toBe(true);
  });
  it('needs a target settlement for attack and support, a camp for hunt', () => {
    expect(dispatchHasDestination({ ...base, mission: 'attack', route: [{ q: 1, r: 0 }] })).toBe(false);
    expect(dispatchHasDestination({ ...base, mission: 'support', targetSettlementId: 's1' })).toBe(true);
    expect(dispatchHasDestination({ ...base, mission: 'hunt', targetCamp: { q: 0, r: 0 } })).toBe(true);
  });
});


describe('buildAttackDispatchRequest', () => {
  it('returns null when no units are selected', () => {
    expect(buildAttackDispatchRequest(at({ spearman: 0 }), [], 100, 'target-1')).toBeNull();
  });

  it('returns null when no target settlement is chosen', () => {
    expect(buildAttackDispatchRequest(at({ spearman: 5 }), [], 100, null)).toBeNull();
  });

  it('builds an attack request with no waypoints when the route is empty (a direct route)', () => {
    const request = buildAttackDispatchRequest(at({ spearman: 5, axeman: 0 }), [], 50, 'target-1');
    expect(request).toEqual({
      from: [{ spot: { q: 0, r: 0 }, units: [{ unit: 'spearman', count: 5 }] }],
      waypoints: undefined,
      provisions: 50,
      mission: 'attack',
      targetSettlementId: 'target-1',
    });
  });

  it('treats every clicked hex as a waypoint — never a destination, unlike a move dispatch', () => {
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    const request = buildAttackDispatchRequest(at({ spearman: 3 }), route, 20, 'target-1');
    expect(request?.waypoints).toEqual([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }]);
    expect(request?.destination).toBeUndefined();
  });

  it('omits targetBuildingCoord when no preferred target building was picked', () => {
    const request = buildAttackDispatchRequest(at({ catapult: 3 }), [], 20, 'target-1');
    expect(request?.targetBuildingCoord).toBeUndefined();
  });

  it('carries a preferred target building coordinate through when one was picked', () => {
    const request = buildAttackDispatchRequest(at({ catapult: 3 }), [], 20, 'target-1', { q: 4, r: -2 });
    expect(request?.targetBuildingCoord).toEqual({ q: 4, r: -2 });
  });

  it('treats an explicit null target building the same as "no preference"', () => {
    const request = buildAttackDispatchRequest(at({ catapult: 3 }), [], 20, 'target-1', null);
    expect(request?.targetBuildingCoord).toBeUndefined();
  });
});

describe('siege engines by target', () => {
  const byType = {
    spearman: unit({ type: 'spearman' }),
    catapult: unit({ type: 'catapult', class: 'siege', siegeTargets: ['towers', 'buildings'] }),
    ram: unit({ type: 'ram', class: 'siege', siegeTargets: ['walls', 'towers'] }),
  };

  it('sorts building types into walls, towers and the rest, like SiegeResolver.KindOf', () => {
    expect(siegeTargetKindOf('palisade')).toBe('walls');
    expect(siegeTargetKindOf('palisadegate')).toBe('walls');
    expect(siegeTargetKindOf('tower')).toBe('towers');
    expect(siegeTargetKindOf('bridge')).toBe('buildings');
    expect(siegeTargetKindOf('longhouse')).toBe('buildings');
  });

  it('has no siege engine when only ordinary units, or zero engines, are selected', () => {
    expect(hasSiegeEngineSelected({ spearman: 5 }, byType)).toBe(false);
    expect(hasSiegeEngineSelected({}, byType)).toBe(false);
    expect(hasSiegeEngineSelected({ spearman: 5, catapult: 0, ram: 0 }, byType)).toBe(false);
  });

  it('has one as soon as a catapult or a ram is selected', () => {
    expect(hasSiegeEngineSelected({ spearman: 5, catapult: 2 }, byType)).toBe(true);
    expect(hasSiegeEngineSelected({ ram: 1 }, byType)).toBe(true);
  });

  it('collects what the selected engines can damage', () => {
    expect([...selectedSiegeTargets({ ram: 1 }, byType)].sort()).toEqual(['towers', 'walls']);
    expect([...selectedSiegeTargets({ catapult: 1 }, byType)].sort()).toEqual(['buildings', 'towers']);
    expect([...selectedSiegeTargets({ catapult: 1, ram: 1 }, byType)].sort()).toEqual(['buildings', 'towers', 'walls']);
    expect(selectedSiegeTargets({ spearman: 9 }, byType).size).toBe(0);
  });

  it('lets rams damage walls and towers only, catapults everything but walls', () => {
    expect(canSiegeDamage({ ram: 1 }, byType, 'palisade')).toBe(true);
    expect(canSiegeDamage({ ram: 1 }, byType, 'palisadegate')).toBe(true);
    expect(canSiegeDamage({ ram: 1 }, byType, 'tower')).toBe(true);
    expect(canSiegeDamage({ ram: 1 }, byType, 'bridge')).toBe(false);
    expect(canSiegeDamage({ ram: 1 }, byType, 'longhouse')).toBe(false);
    expect(canSiegeDamage({ catapult: 1 }, byType, 'palisade')).toBe(false);
    expect(canSiegeDamage({ catapult: 1 }, byType, 'tower')).toBe(true);
    expect(canSiegeDamage({ catapult: 1 }, byType, 'bridge')).toBe(true);
    expect(canSiegeDamage({ catapult: 1 }, byType, 'longhouse')).toBe(true);
    expect(canSiegeDamage({ spearman: 3 }, byType, 'longhouse')).toBe(false);
  });

  it('says which unit types breach walls', () => {
    expect(breachesWalls('ram', byType)).toBe(true);
    expect(breachesWalls('catapult', byType)).toBe(false);
    expect(breachesWalls('spearman', byType)).toBe(false);
    expect(breachesWalls('nope', byType)).toBe(false);
  });
});

describe('buildSupportDispatchRequest', () => {
  it('returns null when no units are selected', () => {
    expect(buildSupportDispatchRequest(at({ spearman: 0 }), [], 100, 'target-1', spot)).toBeNull();
  });

  it('returns null when no target settlement is chosen', () => {
    expect(buildSupportDispatchRequest(at({ spearman: 5 }), [], 100, null, spot)).toBeNull();
  });

  it('builds a support request with no waypoints when the route is empty (a direct route)', () => {
    const request = buildSupportDispatchRequest(at({ spearman: 5, axeman: 0 }), [], 50, 'target-1', spot);
    expect(request).toEqual({
      from: [{ spot: { q: 0, r: 0 }, units: [{ unit: 'spearman', count: 5 }] }],
      waypoints: undefined,
      provisions: 50,
      mission: 'support',
      targetSettlementId: 'target-1',
      targetBuildingCoord: spot,
    });
  });

  it('returns null without the host garrison spot it joins', () => {
    expect(buildSupportDispatchRequest(at({ spearman: 5 }), [], 100, 'target-1', null)).toBeNull();
  });

  it('treats every clicked hex as a waypoint — never a destination, same as an attack dispatch', () => {
    const route = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }];
    const request = buildSupportDispatchRequest(at({ spearman: 3 }), route, 20, 'target-1', spot);
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

  it('reports "fleet" once any ship is selected: the land units become its passengers', () => {
    expect(classifyUnitSelection({ spearman: 1, karve: 1 }, byType)).toBe('fleet');
  });

  it('ignores unit types missing from the catalogue', () => {
    expect(classifyUnitSelection({ unknown: 5 }, byType)).toBe('none');
  });
});

describe('ship slots', () => {
  const byType = {
    spearman: unit({ type: 'spearman', class: 'infantry', cargoSlots: 1 }),
    bowman: unit({ type: 'bowman', class: 'infantry', cargoSlots: 2 }),
    ram: unit({ type: 'ram', class: 'siege', cargoSlots: 10 }),
    karve: unit({ type: 'karve', class: 'ship', shipSlots: 10, speed: 8 }),
    longship: unit({ type: 'longship', class: 'ship', shipSlots: 20, speed: 10 }),
  };

  it('has no slot usage for a land army', () => {
    expect(shipSlotUsage({ spearman: 5, ram: 1 }, byType)).toBeNull();
    expect(exceedsShipCapacity({ spearman: 50 }, byType)).toBe(false);
  });

  it('counts the slots the passengers need against the slots the ships offer', () => {
    expect(shipSlotUsage({ karve: 1, longship: 1, spearman: 4, bowman: 3 }, byType)).toEqual({ needed: 10, offered: 30 });
    expect(shipSlotUsage({ karve: 1 }, byType)).toEqual({ needed: 0, offered: 10 });
  });

  it('is over capacity only when the passengers need more than the ships offer', () => {
    expect(exceedsShipCapacity({ karve: 1, spearman: 10 }, byType)).toBe(false);
    expect(exceedsShipCapacity({ karve: 1, spearman: 11 }, byType)).toBe(true);
    expect(exceedsShipCapacity({ karve: 1, ram: 1 }, byType)).toBe(false);
    expect(exceedsShipCapacity({ karve: 1, ram: 2 }, byType)).toBe(true);
    expect(exceedsShipCapacity({ longship: 1, ram: 2 }, byType)).toBe(false);
  });

  it('moves a fleet at its slowest ship; passengers do not slow it', () => {
    const slow = { ...byType, ram: unit({ type: 'ram', class: 'siege', cargoSlots: 10, speed: 1 }) };
    expect(totalSpeed({ karve: 1, longship: 1, ram: 1 }, slow)).toBe(8);
    expect(totalSpeed({ spearman: 2, ram: 1 }, { ...slow, spearman: unit({ type: 'spearman', speed: 4 }) })).toBe(1);
    expect(totalSpeed({}, slow)).toBe(0);
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

describe('buildFieldOrderRequest (mission, target and split)', () => {
  it('a plain move stays a destination-only order (no mission key: the ArmyPanel flow is unchanged)', () => {
    expect(buildFieldOrderRequest([{ q: 3, r: -1 }])).toEqual({ destination: { q: 3, r: -1 } });
  });

  it('carries the mission and the leaving units of a split move', () => {
    expect(
      buildFieldOrderRequest([{ q: 3, r: -1 }], { mission: 'move', units: { spearman: 4, archer: 0 } }),
    ).toEqual({ destination: { q: 3, r: -1 }, mission: 'move', units: [{ unit: 'spearman', count: 4 }] });
  });

  it('an attack names its target settlement and building and sends no destination', () => {
    const request = buildFieldOrderRequest([], {
      mission: 'attack',
      targetSettlementId: 'rival-1',
      targetBuildingCoord: { q: 2, r: 5 },
      units: { spearman: 3 },
    });

    expect(request).toEqual({
      mission: 'attack',
      targetSettlementId: 'rival-1',
      targetBuildingCoord: { q: 2, r: 5 },
      units: [{ unit: 'spearman', count: 3 }],
    });
    expect(request).not.toHaveProperty('destination');
  });

  it('a support carries the host garrison spot it joins', () => {
    const request = buildFieldOrderRequest([], { mission: 'support', targetSettlementId: 'own-2', targetBuildingCoord: { q: 1, r: 1 } });

    expect(request?.targetBuildingCoord).toEqual({ q: 1, r: 1 });
    expect(request?.targetSettlementId).toBe('own-2');
  });

  it('a support without a garrison spot is incomplete', () => {
    expect(buildFieldOrderRequest([], { mission: 'support', targetSettlementId: 'own-2' })).toBeNull();
  });

  it('an attack or support without a target settlement is incomplete', () => {
    expect(buildFieldOrderRequest([], { mission: 'attack' })).toBeNull();
    expect(buildFieldOrderRequest([{ q: 1, r: 1 }], { mission: 'support', targetSettlementId: null })).toBeNull();
  });

  it('a hunt goes to the camp hex', () => {
    expect(buildFieldOrderRequest([{ q: 7, r: -3 }], { mission: 'hunt' })).toEqual({ destination: { q: 7, r: -3 }, mission: 'hunt' });
  });

  it('a selection that leaves no unit sends nothing', () => {
    expect(buildFieldOrderRequest([{ q: 3, r: -1 }], { mission: 'move', units: { spearman: 0 } })).toBeNull();
  });

  it('whole army (units null) sends no units list', () => {
    expect(buildFieldOrderRequest([{ q: 3, r: -1 }], { mission: 'move', units: null })).toEqual({ destination: { q: 3, r: -1 }, mission: 'move' });
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

describe('isFieldOrderMidMarch', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');

  it('is false for an army with no active movement (standing at home or supporting)', () => {
    expect(isFieldOrderMidMarch({ movement: null }, now)).toBe(false);
  });

  it('is false for an army already heading home — Recall, not a field order, owns that leg', () => {
    expect(
      isFieldOrderMidMarch({ movement: { isReturning: true, arrivesAt: '2026-01-01T13:00:00Z' } }, now),
    ).toBe(false);
  });

  it('is false once the active leg has already arrived — a "move on", not an "append goal"', () => {
    expect(
      isFieldOrderMidMarch({ movement: { isReturning: false, arrivesAt: '2026-01-01T11:00:00Z' } }, now),
    ).toBe(false);
  });

  it('is true while still travelling to a not-yet-reached destination', () => {
    expect(
      isFieldOrderMidMarch({ movement: { isReturning: false, arrivesAt: '2026-01-01T13:00:00Z' } }, now),
    ).toBe(true);
  });
});

describe('buildHuntDispatchRequest', () => {
  it('returns null without units or a camp target', () => {
    expect(buildHuntDispatchRequest(at({ spearman: 0 }), [], 10, { q: 1, r: 2 })).toBeNull();
    expect(buildHuntDispatchRequest(at({ spearman: 3 }), [], 10, null)).toBeNull();
  });

  it('sends the camp hex as the destination with a hunt mission and the route as waypoints', () => {
    expect(buildHuntDispatchRequest(at({ spearman: 3, axeman: 0 }), [{ q: 0, r: 1 }], 40, { q: 4, r: -2 })).toEqual({
      from: [{ spot: { q: 0, r: 0 }, units: [{ unit: 'spearman', count: 3 }] }],
      waypoints: [{ q: 0, r: 1 }],
      destination: { q: 4, r: -2 },
      provisions: 40,
      mission: 'hunt',
    });
    expect(buildHuntDispatchRequest(at({ spearman: 1 }), [], 0, { q: 4, r: -2 })?.waypoints).toBeUndefined();
  });

  it('only land units may hunt', () => {
    const byType = { spearman: unit({ type: 'spearman', class: 'infantry' }), longship: unit({ type: 'longship', class: 'ship' }) };
    expect(isHuntUnit('spearman', byType)).toBe(true);
    expect(isHuntUnit('longship', byType)).toBe(false);
    expect(isHuntUnit('unknown', byType)).toBe(false);
  });

  it('a camp at sea (the whale road) is hunted by a fleet: ships, with land units as passengers', () => {
    const byType = { spearman: unit({ type: 'spearman', class: 'infantry' }), longship: unit({ type: 'longship', class: 'ship' }) };
    expect(isHuntUnit('longship', byType, true)).toBe(true);
    expect(isHuntUnit('spearman', byType, true)).toBe(true);
    expect(isHuntUnit('unknown', byType, true)).toBe(false);
  });

  it('the hunt ring action needs land units at home for a land camp and a ship for a camp at sea', () => {
    const byType = { spearman: unit({ type: 'spearman', class: 'infantry' }), longship: unit({ type: 'longship', class: 'ship' }) };
    const landOnly = [{ unit: 'spearman', count: 4 }, { unit: 'longship', count: 0 }];
    const shipsOnly = [{ unit: 'spearman', count: 0 }, { unit: 'longship', count: 2 }];
    expect(garrisonCanHunt(landOnly, byType, false)).toBe(true);
    expect(garrisonCanHunt(landOnly, byType, true)).toBe(false);
    expect(garrisonCanHunt(shipsOnly, byType, false)).toBe(false);
    expect(garrisonCanHunt(shipsOnly, byType, true)).toBe(true);
  });
});

describe('targetBuildingPickerMode', () => {
  const byType = {
    karve: unit({ type: 'karve', class: 'ship', siegeTargets: ['walls', 'towers', 'buildings'] }),
    catapult: unit({ type: 'catapult', class: 'siege', siegeTargets: ['towers', 'buildings'] }),
    ram: unit({ type: 'ram', class: 'siege', siegeTargets: ['walls', 'towers'] }),
    spearman: unit({ type: 'spearman', class: 'infantry' }),
  };

  it('requires a building for a fleet attack once a target settlement is chosen', () => {
    expect(targetBuildingPickerMode('attack', true, { karve: 3 }, byType, 'fleet')).toBe('required');
  });

  it('offers an optional building for a land attack with siege engines, none without', () => {
    expect(targetBuildingPickerMode('attack', true, { catapult: 2 }, byType, 'land')).toBe('optional');
    expect(targetBuildingPickerMode('attack', true, { ram: 2 }, byType, 'land')).toBe('optional');
    expect(targetBuildingPickerMode('attack', true, { spearman: 5 }, byType, 'land')).toBe('none');
  });

  it('names no building without a target settlement or for other missions', () => {
    expect(targetBuildingPickerMode('attack', false, { karve: 3 }, byType, 'fleet')).toBe('none');
    expect(targetBuildingPickerMode('support', true, { karve: 3 }, byType, 'fleet')).toBe('none');
    expect(targetBuildingPickerMode('move', true, { karve: 3 }, byType, 'fleet')).toBe('none');
  });
});

describe('shoreBuildings', () => {
  // Land at q >= 0, sea at q < 0.
  const coast = { isLand: (q: number) => q >= 0 };

  it('keeps only buildings on a shoreline hex or a sea hex', () => {
    const farm = { q: 3, r: 0, type: 'farm' };
    const hut = { q: 0, r: 0, type: 'fishing_hut' };
    const dock = { q: -1, r: 0, type: 'dockyard' };
    expect(shoreBuildings([farm, hut, dock], coast)).toEqual([hut, dock]);
  });
});

describe('a fleet attack request', () => {
  it('carries the chosen shore building as the target building', () => {
    const request = buildAttackDispatchRequest(at({ karve: 3 }), [], 30, 'target-1', { q: 9, r: 0 });
    expect(request?.targetBuildingCoord).toEqual({ q: 9, r: 0 });
  });
});

describe('trainingSite', () => {
  const centre = { q: 0, r: 0 };
  const byType = {
    thrall: unit({ type: 'thrall', speed: 5, requiredBuildingType: 'barracks' }),
    spearman: unit({ type: 'spearman', speed: 4, requiredBuildingType: 'barracks' }),
    bowman: unit({ type: 'bowman', speed: 4, requiredBuildingType: 'archeryrange' }),
    settler: unit({ type: 'settler', speed: 4, requiredBuildingType: 'cartworkshop' }),
  };
  const barracks = { q: 2, r: 0, type: 'barracks' };
  const range = { q: -2, r: 0, type: 'archeryrange' };

  it('is the building that trained the units', () => {
    expect(trainingSite(centre, [barracks, range], { spearman: 3 }, byType)).toEqual({ q: 2, r: 0 });
    expect(trainingSite(centre, [barracks, range], { bowman: 3 }, byType)).toEqual({ q: -2, r: 0 });
  });

  it('uses the building of the slowest unit type in a mixed army', () => {
    expect(trainingSite(centre, [barracks, range], { thrall: 2, bowman: 2 }, byType)).toEqual({ q: -2, r: 0 });
  });

  it('breaks equal speeds by the lowest unit type', () => {
    expect(trainingSite(centre, [barracks, range], { bowman: 1, spearman: 1 }, byType)).toEqual({ q: 2, r: 0 });
  });

  it('takes the nearest of several, ties by q then r', () => {
    const far = { q: 4, r: 0, type: 'barracks' };
    expect(trainingSite(centre, [far, barracks], { spearman: 1 }, byType)).toEqual({ q: 2, r: 0 });
    const a = { q: 3, r: 0, type: 'barracks' };
    const b = { q: 2, r: 1, type: 'barracks' };
    expect(trainingSite(centre, [a, b], { spearman: 1 }, byType)).toEqual({ q: 2, r: 1 });
  });

  it('falls back to the centre without the building or without units', () => {
    expect(trainingSite(centre, [range], { spearman: 1 }, byType)).toEqual(centre);
    expect(trainingSite(centre, [barracks], {}, byType)).toEqual(centre);
    expect(trainingSite(centre, [barracks], { spearman: 0 }, byType)).toEqual(centre);
  });
});

describe('dispatchTargetCoord', () => {
  const base = { mission: 'move', targetSettlementId: null, targetCamp: null, targetBuildingCoord: null, route: [] as { q: number; r: number }[] };
  const centreOf = (id: string) => (id === 'host' ? { q: 10, r: 0 } : undefined);

  it('is the last clicked hex of a move or a founding', () => {
    expect(dispatchTargetCoord({ ...base, route: [{ q: 1, r: 1 }, { q: 4, r: 2 }] }, centreOf)).toEqual({ q: 4, r: 2 });
    expect(dispatchTargetCoord({ ...base, mission: 'found', route: [{ q: 3, r: 3 }] }, centreOf)).toEqual({ q: 3, r: 3 });
    expect(dispatchTargetCoord(base, centreOf)).toBeNull();
  });

  it('is the camp of a hunt', () => {
    expect(dispatchTargetCoord({ ...base, mission: 'hunt', targetCamp: { q: 5, r: -1 } }, centreOf)).toEqual({ q: 5, r: -1 });
  });

  it('is the settlement of an attack, and the named garrison spot of a support', () => {
    expect(dispatchTargetCoord({ ...base, mission: 'attack', targetSettlementId: 'host' }, centreOf)).toEqual({ q: 10, r: 0 });
    expect(dispatchTargetCoord({ ...base, mission: 'support', targetSettlementId: 'host' }, centreOf)).toEqual({ q: 10, r: 0 });
    expect(
      dispatchTargetCoord({ ...base, mission: 'support', targetSettlementId: 'host', targetBuildingCoord: { q: 12, r: 1 } }, centreOf),
    ).toEqual({ q: 12, r: 1 });
    expect(dispatchTargetCoord({ ...base, mission: 'attack' }, centreOf)).toBeNull();
  });
});
