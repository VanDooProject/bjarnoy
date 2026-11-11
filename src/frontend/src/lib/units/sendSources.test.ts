import { describe, expect, it } from 'vitest';
import type { ArmyResponse, UnitDefinitionResponse } from '../../api/types';
import type { FeasibilityEnv } from './fieldOrderFeasibility';
import { evaluateSendSources, homeSourceId, missionFor, type SendRealm, type SendTarget } from './sendSources';

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
    trainingCost: { wood: 0, stone: 0, food: 0, iron: 0 },
    trainingSeconds: 0,
    requiredLonghouseLevel: 1,
    requiredUnitType: null,
    requiredBuildingType: 'longhouse',
    siegeTargets: [],
    ...overrides,
  };
}

const byType = {
  spearman: unit({ type: 'spearman' }),
  longship: unit({ type: 'longship', class: 'ship', speed: 4 }),
};
const NOW = Date.parse('2026-11-09T12:00:00Z');
const env: FeasibilityEnv = {
  byType,
  worldSpeedFactor: 1,
  now: NOW,
  route: (from, to) => ({ path: [from, to], cost: Math.abs(to.q - from.q) + Math.abs(to.r - from.r) }),
};

function army(overrides: Partial<ArmyResponse> & { id: string }): ArmyResponse {
  return {
    settlementId: 's1',
    mission: 'move',
    targetSettlementId: null,
    atHome: false,
    supporting: false,
    position: { q: 10, r: 0 },
    provisions: 200,
    totalSpeed: 2,
    totalUpkeepPerHour: 10,
    visionRadius: 2,
    stacks: [{ unit: 'spearman', count: 10 }],
    movement: {
      departedAt: '2026-11-09T08:00:00Z',
      path: [
        { q: 0, r: 0 },
        { q: 10, r: 0 },
      ],
      cumulativeHours: [0, 5],
      edgeHours: [0, 2.5],
      arrivesAt: '2026-11-09T10:00:00Z', // arrived: standing
      returnPath: [],
      returnCumulativeHours: [],
      returnEdgeHours: [],
      turnAroundAt: '2026-11-10T00:00:00Z',
      returnArrivesAt: '2026-11-10T05:00:00Z',
      isReturning: false,
      isStranded: false,
      isFleeing: false,
    },
    starvesAt: null,
    ...overrides,
  };
}

const target: SendTarget = { mission: 'move', coord: { q: 4, r: 0 }, campAtSea: false };
const homeGarrison = [{ unit: 'spearman', count: 8 }];

const HOME = 'home:r1';

function realm(overrides: Partial<SendRealm> & { realmId: string }): SendRealm {
  return { name: overrides.realmId, current: false, garrison: homeGarrison, armies: [], ...overrides };
}

function run(armies: ArmyResponse[], opts: { garrison?: typeof homeGarrison; isPremium?: boolean; target?: SendTarget; env?: FeasibilityEnv } = {}) {
  return evaluateSendSources({
    target: opts.target ?? target,
    realms: [realm({ realmId: 'r1', current: true, garrison: opts.garrison ?? homeGarrison, armies })],
    isPremium: opts.isPremium ?? false,
    byType,
    env: opts.env ?? env,
  });
}

describe('evaluateSendSources', () => {
  it('lists home first, then the armies that can go quickest first, then the ones that cannot', () => {
    const near = army({ id: 'near', position: { q: 6, r: 0 } });
    const returning = army({ id: 'ret', movement: { ...army({ id: 'x' }).movement!, isReturning: true } });
    const far = army({ id: 'far' });
    far.movement!.path = [
      { q: 0, r: 0 },
      { q: 30, r: 0 },
    ];

    const rows = run([returning, far, near]);

    expect(rows.map((r) => r.id)).toEqual([HOME, 'near', 'far', 'ret']);
    expect(rows[1]!.travelMinutes).toBeLessThan(rows[2]!.travelMinutes!);
  });

  it('home can go when the garrison holds units', () => {
    expect(run([])[0]).toMatchObject({ id: HOME, ok: true });
    expect(run([], { garrison: [] })[0]).toMatchObject({ id: HOME, ok: false, block: 'noUnits' });
    expect(run([], { garrison: [{ unit: 'spearman', count: 0 }] })[0]?.ok).toBe(false);
  });

  it('a supporting army must be recalled first', () => {
    const rows = run([army({ id: 'a', supporting: true, movement: null, targetSettlementId: 'host' })], { garrison: [] });

    expect(rows[1]).toMatchObject({ ok: false, block: 'supporting', locked: false });
  });

  it('a returning army cannot take an order', () => {
    const returning = army({ id: 'a' });
    returning.movement!.isReturning = true;

    expect(run([returning])[1]).toMatchObject({ ok: false, block: 'returning' });
  });

  it('only move and found missions are orderable', () => {
    expect(run([army({ id: 'a', mission: 'attack' })])[1]).toMatchObject({ ok: false, block: 'notOrderable' });
    expect(run([army({ id: 'b', mission: 'found' })])[1]?.ok).toBe(true);
  });

  it('a marching army is locked behind premium, with the travel time still known', () => {
    const marching = army({ id: 'a' });
    marching.movement!.arrivesAt = '2026-11-09T15:00:00Z';

    const free = run([marching])[1]!;
    const premium = run([marching], { isPremium: true })[1]!;

    expect(free).toMatchObject({ ok: false, block: 'premium', locked: true, standing: false });
    expect(free.travelMinutes).not.toBeNull();
    expect(premium).toMatchObject({ ok: true, locked: false, standing: false });
  });

  it('a standing army whose route is still being searched is blocked as pending, not locked and not unreachable', () => {
    const pending: FeasibilityEnv = { ...env, route: () => 'pending' };

    const row = run([army({ id: 'a' })], { env: pending })[1]!;

    expect(row).toMatchObject({ ok: false, block: 'pending', locked: false, travelMinutes: null });
  });

  it('pending rows sort after the ones that can go, behind them by id', () => {
    const pending: FeasibilityEnv = { ...env, route: (from, to) => (from.q === 10 ? 'pending' : { path: [from, to], cost: 3 }) };
    const ready = army({ id: 'z-ready' });
    ready.movement!.path = [{ q: 0, r: 0 }, { q: 4, r: 4 }];
    ready.position = { q: 4, r: 4 };

    expect(run([army({ id: 'a' }), ready], { env: pending }).map((r) => r.id)).toEqual([HOME, 'z-ready', 'a']);
  });

  it('the premium lock wins over a pending route', () => {
    const pending: FeasibilityEnv = { ...env, route: () => 'pending' };
    const marching = army({ id: 'a' });
    marching.movement!.arrivesAt = '2026-11-09T15:00:00Z';

    expect(run([marching], { env: pending })[1]).toMatchObject({ ok: false, block: 'premium', locked: true });
    expect(run([marching], { env: pending, isPremium: true })[1]).toMatchObject({ ok: false, block: 'pending', locked: false });
  });

  it('a standing army is free', () => {
    expect(run([army({ id: 'a' })])[1]).toMatchObject({ ok: true, standing: true });
  });

  it('a hunt on land needs land units, a hunt at sea ships', () => {
    const ships = army({ id: 'ships', stacks: [{ unit: 'longship', count: 2 }] });
    const landers = army({ id: 'land' });
    const landHunt: SendTarget = { mission: 'hunt', coord: { q: 4, r: 0 }, campAtSea: false };
    const seaHunt: SendTarget = { mission: 'hunt', coord: { q: 4, r: 0 }, campAtSea: true };

    const onLand = run([ships, landers], { target: landHunt });
    const atSea = run([ships, landers], { target: seaHunt });

    expect(onLand.find((r) => r.id === 'ships')).toMatchObject({ ok: false, block: 'wrongClass' });
    expect(onLand.find((r) => r.id === 'land')?.ok).toBe(true);
    expect(atSea.find((r) => r.id === 'land')).toMatchObject({ ok: false, block: 'wrongClass' });
    expect(atSea.find((r) => r.id === 'ships')?.ok).toBe(true);
    // The garrison holds land units only: it cannot hunt at sea.
    expect(atSea[0]).toMatchObject({ id: HOME, ok: false, block: 'wrongClass' });
  });

  it('an army that cannot reach the target, or cannot afford the way home, is listed but cannot go', () => {
    const noRoute = { ...env, route: (from: { q: number; r: number }, to: { q: number; r: number }) => (to.q === 4 ? null : { path: [from, to], cost: 1 }) };
    const hungry = army({ id: 'hungry', provisions: 5 });

    const unreachable = evaluateSendSources({ target, realms: [realm({ realmId: 'r1', current: true, garrison: [], armies: [army({ id: 'a' })] })], isPremium: false, byType, env: noRoute });
    const noFood = run([hungry], { garrison: [] });

    expect(unreachable[1]).toMatchObject({ ok: false, block: 'unreachable' });
    expect(noFood[1]).toMatchObject({ ok: false, block: 'noFood' });
  });

  it('an army at home (folded back) is not a field source', () => {
    expect(run([army({ id: 'a', atHome: true, movement: null })]).map((r) => r.id)).toEqual([HOME]);
  });

  describe('several realms', () => {
    const own: SendTarget = { ...target, ownRealmId: 'r1', supportSpot: { q: 5, r: 5 } };

    function many(t: SendTarget, realms: SendRealm[], e: FeasibilityEnv = env) {
      return evaluateSendSources({ target: t, realms, isPremium: false, byType, env: e });
    }

    it('lists one home row per realm, named after the realm, with its units counted', () => {
      const rows = many(target, [
        realm({ realmId: 'r1', name: 'Bjarnoy', current: true }),
        realm({ realmId: 'r2', name: 'Vik', garrison: [{ unit: 'spearman', count: 3 }] }),
        realm({ realmId: 'r3', name: 'Empty', garrison: [] }),
      ]);

      expect(rows.map((r) => [r.id, r.realmName, r.unitCount, r.ok])).toEqual([
        [homeSourceId('r1'), 'Bjarnoy', 8, true],
        [homeSourceId('r2'), 'Vik', 3, true],
        [homeSourceId('r3'), 'Empty', 0, false],
      ]);
      expect(rows[2]).toMatchObject({ block: 'noUnits' });
    });

    it('the realm that owns the target hex moves there, the others support it at the named garrison spot', () => {
      const rows = many(own, [realm({ realmId: 'r1', current: true }), realm({ realmId: 'r2' }), realm({ realmId: 'r3' })]);

      expect(rows.find((r) => r.realmId === 'r1')).toMatchObject({ mission: 'move', targetSettlementId: null, targetBuildingCoord: null });
      for (const id of ['r2', 'r3']) {
        expect(rows.find((r) => r.realmId === id)).toMatchObject({
          mission: 'support',
          targetSettlementId: 'r1',
          targetBuildingCoord: { q: 5, r: 5 },
          targetCoord: { q: 5, r: 5 },
        });
      }
    });

    it('a field army supports the owning realm too: its route is planned to the garrison spot, not the tapped hex', () => {
      const routed: { to: { q: number; r: number } }[] = [];
      const spy: FeasibilityEnv = { ...env, route: (from, to) => (routed.push({ to }), { path: [from, to], cost: 1 }) };

      const rows = many(own, [realm({ realmId: 'r1', current: true }), realm({ realmId: 'r2', armies: [army({ id: 'a2' })] })], spy);

      expect(rows.find((r) => r.id === 'a2')).toMatchObject({ ok: true, mission: 'support', realmId: 'r2' });
      expect(routed[0]!.to).toEqual({ q: 5, r: 5 });
    });

    it('targets the player does not own keep their mission for every realm', () => {
      const attack: SendTarget = { mission: 'attack', coord: { q: 4, r: 0 }, campAtSea: false, targetSettlementId: 'rival' };
      const hunt: SendTarget = { mission: 'hunt', coord: { q: 4, r: 0 }, campAtSea: false };
      const realms = [realm({ realmId: 'r1', current: true }), realm({ realmId: 'r2' })];

      expect(many(attack, realms).map((r) => [r.mission, r.targetSettlementId])).toEqual([
        ['attack', 'rival'],
        ['attack', 'rival'],
      ]);
      expect(many(hunt, realms).map((r) => r.mission)).toEqual(['hunt', 'hunt']);
      expect(many(target, realms).map((r) => r.mission)).toEqual(['move', 'move']);
    });

    it('the open realm comes first, the other realms follow by travel time with blocked rows last', () => {
      const near = army({ id: 'near', position: { q: 6, r: 0 } });
      const far = army({ id: 'far' });
      far.movement!.path = [
        { q: 0, r: 0 },
        { q: 30, r: 0 },
      ];
      const returning = army({ id: 'ret', movement: { ...army({ id: 'x' }).movement!, isReturning: true } });

      const rows = many(target, [
        realm({ realmId: 'r2', name: 'Vik', garrison: [], armies: [far, returning] }),
        realm({ realmId: 'r1', name: 'Bjarnoy', current: true, garrison: [], armies: [army({ id: 'own' })] }),
        realm({ realmId: 'r3', name: 'Ness', garrison: [], armies: [near] }),
      ]);

      expect(rows.map((r) => r.id)).toEqual([homeSourceId('r1'), 'own', 'near', 'far', homeSourceId('r3'), homeSourceId('r2'), 'ret']);
      expect(rows[0]).toMatchObject({ current: true });
    });
  });

  describe('missionFor', () => {
    it('is a plain move without an owning realm, and a support from every other realm with one', () => {
      expect(missionFor(target, 'r2').mission).toBe('move');
      const own: SendTarget = { ...target, ownRealmId: 'r1', supportSpot: { q: 1, r: 1 } };
      expect(missionFor(own, 'r1').mission).toBe('move');
      expect(missionFor(own, 'r2')).toMatchObject({ mission: 'support', targetSettlementId: 'r1', coord: { q: 1, r: 1 } });
    });
  });
});
