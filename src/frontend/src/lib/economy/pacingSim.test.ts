import { describe, expect, it } from 'vitest';
import {
  constructionSlotsFor,
  feastCost,
  feastRenown,
  isOnline,
  onlineMask,
  parseClock,
  productionOnDay,
  settlerCostFrom,
  simulatePacing,
  FALLBACK_SETTLER_COST,
  PROFILE_PRESETS,
  type PacingParams,
  type Session,
} from './pacingSim';
import { def, group } from './testFixtures';
import type { BuildingDefinitionResponse } from '../../api/types';
import catalogueSnapshot from '../../data/building-catalogue.json';

const ZERO = { wood: 0, stone: 0, food: 0, iron: 0 };

function params(over: Partial<PacingParams> = {}): PacingParams {
  return {
    startStock: { ...ZERO },
    horizonDays: 2,
    producerCounts: { mill: 1 },
    settlerCost: { wood: 100, stone: 0, food: 0, iron: 0 },
    settleType: 'hall',
    sessions: PROFILE_PRESETS.always24,
    joinTime: '00:00',
    producersAhead: 0,
    ...over,
  };
}

// Tiny catalogue: 3 Longhouse levels, one wood producer with 3 levels, storage.
function tiny(): BuildingDefinitionResponse[] {
  return [
    def('longhouse', 1, { prod: { wood: 60 }, storage: 0 }),
    def('longhouse', 2, { cost: { wood: 100 }, buildSeconds: 600, prod: { wood: 60 } }),
    def('longhouse', 3, { cost: { wood: 200 }, buildSeconds: 600, prod: { wood: 60 } }),
    def('mill', 1, { prod: { wood: 60 } }),
    def('mill', 2, { cost: { wood: 60 }, buildSeconds: 600, prod: { wood: 120 } }),
    def('mill', 3, { cost: { wood: 120 }, buildSeconds: 600, prod: { wood: 240 }, reqLh: 3 }),
    def('storagehouse', 1, { storage: 1000 }),
    def('storagehouse', 2, { cost: { wood: 50 }, buildSeconds: 600, storage: 2000 }),
    def('hall', 1, { reqLh: 2, prereqs: [{ type: 'mill', level: 2 }] }),
  ];
}

describe('helpers', () => {
  it('mirrors Settlement.ConstructionSlotsFor', () => {
    expect([1, 5, 9, 10, 14, 15, 20].map(constructionSlotsFor)).toEqual([2, 2, 2, 3, 3, 4, 5]);
  });

  it('a session covers exactly its own minutes, on every day, and may wrap past midnight', () => {
    const active = PROFILE_PRESETS.active;
    expect(isOnline(active, 7 * 60)).toBe(true);
    expect(isOnline(active, 22 * 60 + 59)).toBe(true);
    expect(isOnline(active, 23 * 60)).toBe(false);
    expect(isOnline(active, 6 * 60 + 59)).toBe(false);
    expect(isOnline(active, 1440 + 12 * 60)).toBe(true);
    const night = [{ start: '23:50', minutes: 20 }];
    expect(isOnline(night, 23 * 60 + 55)).toBe(true);
    expect(isOnline(night, 5)).toBe(true);
    expect(isOnline(night, 10)).toBe(false);
    expect(onlineMask(PROFILE_PRESETS.checkins4).reduce((a, b) => a + b, 0)).toBe(40);
    expect(onlineMask(PROFILE_PRESETS.always24).reduce((a, b) => a + b, 0)).toBe(1440);
  });

  it('parses clock times', () => {
    expect(parseClock('09:30')).toBe(570);
    expect(parseClock('garbage')).toBe(0);
  });

  it('settler cost is 3x the training cost, with a fallback', () => {
    expect(settlerCostFrom({ wood: 1, stone: 2, food: 3, iron: 4 })).toEqual({ wood: 3, stone: 6, food: 9, iron: 12 });
    expect(settlerCostFrom(undefined)).toEqual(FALLBACK_SETTLER_COST);
  });
});

describe('simulatePacing on a hand-made catalogue', () => {
  it('reaches Longhouse levels in the order producers then Longhouse allow (hand-reasoned)', () => {
    // Stock 0, rate = LH 60 + mill 60 = 120/h = 2/min, cap 500 (+1000 storage).
    // Mill L1->L2 costs 60 wood -> affordable at minute 30, done at 40.
    // LH 2 needs producers >= min(lh=1,3)=1 so it may start at once it is affordable (100):
    // priority (a) LH first when affordable, but at minute 30 only 60 wood, so the mill goes.
    const r = simulatePacing(group(tiny()), params({ horizonDays: 1 }));
    expect(r.lhReachedAt[1]).toBe(0);
    expect(r.lhReachedAt[2]).toBeGreaterThan(40);
    // mill L2 (done min 40) raises rate to 180/h = 3/min: after the mill start stock ~0 at 30,
    // 3/min from 40 -> LH 2 (100 wood) affordable ~min 40+34 -> done +10.
    expect(r.lhReachedAt[2]).toBeLessThan(120);
  });

  it('a second storage house lets the Longhouse outgrow what one house can store', () => {
    // Regression: the sim used to model a single storage house, so a
    // Longhouse level costing more than one house can hold looked
    // unreachable. Settlements may build any number of storage houses.
    // Here Longhouse 2 costs 900 wood; base 500 + one house's 300 = 800
    // can never hold it, a second house (1100) can.
    const byType = group([
      def('longhouse', 1),
      def('longhouse', 2, { cost: { wood: 900 } }),
      def('lumberjack', 1, { prod: { wood: 600 } }),
      // Levels 1-10 hold 300 each: the second house may only be started once the
      // first stands at level 10, and only then does capacity grow past 800.
      def('storagehouse', 1, { cost: { wood: 50 }, storage: 300 }),
      ...Array.from({ length: 9 }, (_, i) => def('storagehouse', i + 2, { cost: { wood: 5 }, buildSeconds: 60, storage: 300 })),
    ]);
    const base = { producerCounts: { lumberjack: 1 }, horizonDays: 1 };
    const one = simulatePacing(byType, params(base));
    const two = simulatePacing(byType, params({ ...base, storageCount: 2 }));
    expect(one.lhReachedAt[2]).toBeUndefined();
    expect(two.lhReachedAt[2]).toBeGreaterThan(0);
  });

  it('never starts a second storage house while the first is below level 10', () => {
    // Ten levels of 300 storage. With only 5 levels available the first house
    // cannot reach 10, so a second (and the capacity it adds) never arrives.
    const levels = (n: number) =>
      Array.from({ length: n }, (_, i) => def('storagehouse', i + 1, { cost: { wood: 5 }, buildSeconds: 60, storage: 300 }));
    const build = (n: number) =>
      group([
        def('longhouse', 1),
        def('longhouse', 2, { cost: { wood: 900 } }),
        def('lumberjack', 1, { prod: { wood: 600 } }),
        ...levels(n),
      ]);
    const p = params({ producerCounts: { lumberjack: 1 }, horizonDays: 1, storageCount: 2 });
    expect(simulatePacing(build(5), p).lhReachedAt[2]).toBeUndefined();
    expect(simulatePacing(build(10), p).lhReachedAt[2]).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const a = simulatePacing(group(tiny()), params());
    const b = simulatePacing(group(tiny()), params());
    expect(a).toEqual(b);
  });

  it('LH milestones strictly increase', () => {
    const r = simulatePacing(group(tiny()), params({ horizonDays: 3 }));
    const minutes = Object.keys(r.lhReachedAt)
      .map(Number)
      .sort((x, y) => x - y)
      .map((l) => r.lhReachedAt[l]);
    expect(minutes.length).toBe(3);
    for (let i = 1; i < minutes.length; i++) expect(minutes[i]).toBeGreaterThan(minutes[i - 1]);
  });

  it('a Longhouse order blocks every other start while it runs', () => {
    const cat = tiny();
    // Make LH 2 instant to afford but slow to build, and give a rich start so
    // that the mill upgrade would also be affordable at the same time.
    cat[1] = def('longhouse', 2, { cost: { wood: 10 }, buildSeconds: 60 * 600, prod: { wood: 60 } });
    const r = simulatePacing(
      group(cat),
      params({ startStock: { wood: 400, stone: 0, food: 0, iron: 0 }, horizonDays: 1, producerCounts: { mill: 1 } }),
    );
    // The mill is level 1 so (a) applies immediately: LH order at minute 0, 600 minutes long,
    // with nothing else allowed to start until then. Sampled rate stays at the level-1 sum (120)
    // until the LH completes and only later grows.
    expect(r.lhReachedAt[2]).toBe(600);
    const before = r.series.rate.wood.slice(0, 10);
    expect(before.every((x) => x === 120)).toBe(true);
  });

  it('respects requiredLonghouseLevel and prerequisites when starting builds', () => {
    // mill L3 needs LH 3, so the mill cannot exceed level 2 before then.
    const r = simulatePacing(group(tiny()), params({ horizonDays: 1 }));
    const idxLh3 = Math.ceil((r.lhReachedAt[3] ?? Infinity) / 60);
    for (let i = 0; i < r.series.minute.length; i++) {
      // wood rate = LH60 + mill; mill 240 only possible once LH 3 stands
      if (r.series.lh[i] < 3) expect(r.series.rate.wood[i]).toBeLessThanOrEqual(60 + 120);
    }
    expect(idxLh3).toBeGreaterThan(0);
  });

  it('does not start a level whose prerequisite is not standing', () => {
    const cat = tiny();
    cat[4] = def('mill', 2, { cost: { wood: 60 }, buildSeconds: 600, prod: { wood: 120 }, prereqs: [{ type: 'ghost', level: 1 }] });
    const r = simulatePacing(group(cat), params({ horizonDays: 2, startStock: { wood: 5000, stone: 0, food: 0, iron: 0 } }));
    // Longhouse (60) + mill stuck at level 1 (60); the level-2 mill (120) never appears.
    expect(r.series.rate.wood.every((x) => x === 120)).toBe(true);
  });

  it('never starts a level beyond the catalogue', () => {
    const r = simulatePacing(group(tiny()), params({ horizonDays: 10 }));
    expect(Math.max(...r.series.lh)).toBe(3);
    expect(Math.max(...r.series.rate.wood)).toBe(60 + 240);
  });

  it('policy with producersAhead 0 is unchanged from the hour-granular model on the tiny catalogue', () => {
    // Golden values from the previous always-online simulator (start 00:00).
    const r = simulatePacing(group(tiny()), params({ horizonDays: 3 }));
    expect(r.lhReachedAt).toEqual({ 1: 0, 2: 60, 3: 160 });
  });

  it('the second settlement needs the settle type placeable, the renown and the settler stock', () => {
    const cost = { wood: 300, stone: 0, food: 0, iron: 0 };
    const noRenown = simulatePacing(group(tiny()), params({ horizonDays: 2, settlerCost: cost, renownThreshold: 0 }));
    expect(noRenown.secondSettlementAt).not.toBeNull();
    // hall needs LH 2
    expect(noRenown.secondSettlementAt!).toBeGreaterThanOrEqual(noRenown.lhReachedAt[2]);
    const needsRenown = simulatePacing(group(tiny()), params({ horizonDays: 2, settlerCost: cost, renownThreshold: 1e9 }));
    expect(needsRenown.secondSettlementAt).toBeNull();
  });

  it('the second settlement stays null when the settle type is never placeable', () => {
    const r = simulatePacing(group(tiny()), params({ settleType: 'nonexistent', renownThreshold: 0 }));
    expect(r.secondSettlementAt).toBeNull();
  });

  it('a sparser schedule reaches milestones no earlier than always-online play', () => {
    const always = simulatePacing(group(tiny()), params({ horizonDays: 3 }));
    const sparse = simulatePacing(group(tiny()), params({ horizonDays: 3, sessions: PROFILE_PRESETS.checkins2 }));
    expect(sparse.lhReachedAt[2]).toBeGreaterThanOrEqual(always.lhReachedAt[2]);
  });
});

describe('simulatePacing on the bundled catalogue', () => {
  const byType = group(catalogueSnapshot.data as BuildingDefinitionResponse[]);

  it('60 days run quickly and produce hourly samples', () => {
    const started = performance.now();
    const r = simulatePacing(byType, params({
      horizonDays: 60,
      producerCounts: { lumberjack: 3, quarry: 3, farm: 3 },
      startStock: { wood: 300, stone: 300, food: 200, iron: 0 },
      settleType: 'cartworkshop',
    }));
    expect(performance.now() - started).toBeLessThan(2000);
    expect(r.series.minute).toHaveLength(60 * 24 + 1);
    expect(r.lhReachedAt[2]).toBeGreaterThan(0);
  });

  it('the most-online profile reaches every Longhouse level no later than a sparser one', () => {
    // Regression: always-online used to lose to casual because it kept
    // spending on producer upgrades instead of saving for the Longhouse.
    for (const producersAhead of [0, 3]) {
      const base = {
        horizonDays: 30,
        producerCounts: { lumberjack: 3, quarry: 3, farm: 3 },
        startStock: { wood: 700, stone: 700, food: 700, iron: 0 },
        settleType: 'cartworkshop',
        producersAhead,
      };
      const most = simulatePacing(byType, params(base));
      for (const sessions of [PROFILE_PRESETS.active, PROFILE_PRESETS.checkins4, PROFILE_PRESETS.checkins2]) {
        const sparse = simulatePacing(byType, params({ ...base, sessions, joinTime: '09:00' }));
        for (const [level, at] of Object.entries(sparse.lhReachedAt)) {
          expect(most.lhReachedAt[Number(level)], `ahead ${producersAhead} LH ${level}`).toBeLessThanOrEqual(at);
        }
      }
    }
  });

  it('running producers ahead of the Longhouse makes the settlement stronger on day 14', () => {
    const base = {
      horizonDays: 20,
      producerCounts: { lumberjack: 3, quarry: 3, farm: 3 },
      startStock: { wood: 700, stone: 700, food: 700, iron: 0 },
      settleType: 'cartworkshop',
      sessions: PROFILE_PRESETS.active,
      joinTime: '09:00',
    };
    const level = simulatePacing(byType, params({ ...base, producersAhead: 0 }));
    const ahead = simulatePacing(byType, params({ ...base, producersAhead: 3 }));
    expect(productionOnDay(ahead, 14)!).toBeGreaterThan(productionOnDay(level, 14)!);
  });
});

// A producer whose levels cost nothing and take a minute: builds are limited only by the player's sessions.
function instantMill(levels: number): BuildingDefinitionResponse[] {
  return [
    def('longhouse', 1),
    ...Array.from({ length: levels }, (_, i) => def('mill', i + 1, { buildSeconds: 60, prod: { wood: 60 * (i + 1) } })),
  ];
}
const WOOD_PER_LEVEL = 60;

describe('sessions and join time', () => {
  const base = { producerCounts: { mill: 1 }, producersAhead: Infinity, renownThreshold: 0 };

  it('a 10-minute check-in starts at most 10 builds and nothing starts outside sessions', () => {
    const r = simulatePacing(
      group(instantMill(200)),
      params({ ...base, horizonDays: 1, sessions: [{ start: '20:00', minutes: 10 }], joinTime: '09:00' }),
    );
    // 20:00 is elapsed hour 11. Nothing before it, and one level per minute inside it.
    for (let h = 0; h <= 11; h++) expect(r.series.rate.wood[h]).toBe(WOOD_PER_LEVEL);
    const levels = r.series.rate.wood[r.series.rate.wood.length - 1] / WOOD_PER_LEVEL;
    expect(levels - 1).toBeGreaterThan(0);
    expect(levels - 1).toBeLessThanOrEqual(10);
  });

  it('two daily check-ins allow at most 20 starts a day', () => {
    const r = simulatePacing(
      group(instantMill(200)),
      params({ ...base, horizonDays: 3, sessions: PROFILE_PRESETS.checkins2, joinTime: '00:00' }),
    );
    const levels = r.series.rate.wood[72] / WOOD_PER_LEVEL - 1;
    expect(levels).toBeGreaterThan(30);
    expect(levels).toBeLessThanOrEqual(60);
  });

  it('the player waits for the first session after joining', () => {
    const sessions = [{ start: '08:00', minutes: 600 }];
    const early = simulatePacing(group(instantMill(50)), params({ ...base, horizonDays: 1, sessions, joinTime: '05:00' }));
    const late = simulatePacing(group(instantMill(50)), params({ ...base, horizonDays: 1, sessions, joinTime: '12:00' }));
    // Joining at 05:00 the first session is 3 h away; joining at 12:00 the player is already in one.
    expect(early.series.rate.wood[2]).toBe(WOOD_PER_LEVEL);
    expect(early.series.rate.wood[4]).toBeGreaterThan(WOOD_PER_LEVEL);
    expect(late.series.rate.wood[1]).toBeGreaterThan(WOOD_PER_LEVEL);
  });

  it('a player with no sessions never builds', () => {
    const r = simulatePacing(group(instantMill(20)), params({ ...base, horizonDays: 2, sessions: [] }));
    expect(Math.max(...r.series.rate.wood)).toBe(WOOD_PER_LEVEL);
  });
});

describe('producersAhead', () => {
  const cat = () => [
    def('longhouse', 1),
    def('longhouse', 2, { cost: { wood: 1e9 } }),
    ...Array.from({ length: 10 }, (_, i) => def('mill', i + 1, { buildSeconds: 60, prod: { wood: 60 * (i + 1) } })),
  ];
  const maxRate = (producersAhead: number) =>
    Math.max(...simulatePacing(group(cat()), params({ horizonDays: 1, producerCounts: { mill: 1 }, producersAhead })).series.rate.wood);

  it('0 keeps producers level with the Longhouse; more lets them pass it; Infinity is limited by the catalogue', () => {
    expect(maxRate(0)).toBe(60);
    expect(maxRate(3)).toBe(240);
    expect(maxRate(Infinity)).toBe(600);
  });

  it('the Longhouse does not wait for a producer that storage cannot hold the next level of', () => {
    const blocked = [
      def('longhouse', 1),
      def('longhouse', 2, { cost: { wood: 10 } }),
      def('mill', 1, { prod: { wood: 60 } }),
      def('mill', 2, { cost: { wood: 1e6 }, prod: { wood: 120 } }),
      def('mill', 3, { prod: { wood: 180 } }),
    ];
    const r = simulatePacing(
      group(blocked),
      params({ horizonDays: 1, producerCounts: { mill: 1 }, producersAhead: 1, startStock: { wood: 100, stone: 0, food: 0, iron: 0 } }),
    );
    expect(r.lhReachedAt[2]).toBeGreaterThan(0);
  });
});

describe('renown and the second settlement', () => {
  const NO_COST = { ...ZERO };
  const cat = () => [def('longhouse', 1), def('mill', 1), def('hall', 1)];

  it('accrues renown per standing building level per hour', () => {
    // Longhouse 1 + mill 1 = 2 levels -> 2 renown/h, for the 1441 simulated minutes.
    const one = simulatePacing(group(cat()), params({ horizonDays: 1 }));
    expect(one.renown).toBeCloseTo((2 * 1441) / 60, 6);
    const two = simulatePacing(group(cat()), params({ horizonDays: 1, renownPerLevelHour: 2 }));
    expect(two.renown).toBeCloseTo(2 * one.renown, 6);
  });

  it('the second settlement waits for the renown threshold', () => {
    const r = simulatePacing(group(cat()), params({ horizonDays: 2, renownThreshold: 24, settlerCost: NO_COST }));
    // 2 renown per hour: 24 renown after 12 h.
    expect(r.secondSettlementAt).toBeGreaterThanOrEqual(719);
    expect(r.secondSettlementAt).toBeLessThanOrEqual(722);
    expect(simulatePacing(group(cat()), params({ horizonDays: 2, renownThreshold: 0, settlerCost: NO_COST })).secondSettlementAt).toBe(0);
  });
});

describe('feasts', () => {
  const cat = () => [
    def('longhouse', 1, { storage: 100000 }),
    def('longhouse', 2, { buildSeconds: 60, storage: 100000 }),
    def('townsquare', 1, { reqLh: 2 }),
  ];
  const rich = { wood: 10000, stone: 10000, food: 10000, iron: 0 };
  const feastParams = (over: Partial<PacingParams> = {}) =>
    params({ producerCounts: {}, startStock: rich, feasts: true, renownThreshold: 1e9, ...over });

  it('uses the design formulas', () => {
    expect(feastCost(1)).toBe(800);
    expect(feastCost(3)).toBeCloseTo(1250, 6);
    expect(feastRenown(1)).toBe(3500);
    expect(feastRenown(2)).toBeCloseTo(4025, 6);
  });

  it('starts nothing without the option, or before the Town Square unlock level', () => {
    expect(simulatePacing(group(cat()), feastParams({ feasts: false, horizonDays: 1 })).feastsHeld).toBe(0);
    const locked = [def('longhouse', 1, { storage: 100000 }), def('townsquare', 1, { reqLh: 2 })];
    expect(simulatePacing(group(locked), feastParams({ horizonDays: 1 })).feastsHeld).toBe(0);
  });

  it('grants the renown only after 12 hours, one feast at a time', () => {
    const early = simulatePacing(group(cat()), feastParams({ horizonDays: 0.4 }));
    expect(early.feastsHeld).toBe(1);
    expect(early.renown).toBeLessThan(3500);
    const later = simulatePacing(group(cat()), feastParams({ horizonDays: 0.6 }));
    expect(later.renown).toBeGreaterThanOrEqual(3500);
    // Three windows of 12 h fit into 1.5 days of continuous play, not 2160.
    const long = simulatePacing(group(cat()), feastParams({ horizonDays: 1.5 }));
    expect(long.feastsHeld).toBe(3);
  });

  it('takes the feast gain from the params', () => {
    const r = simulatePacing(group(cat()), feastParams({ horizonDays: 0.6, feastGain: () => 123456 }));
    expect(r.renown).toBeGreaterThanOrEqual(123456);
  });

  it('needs the stock to cover the feast', () => {
    const poor = simulatePacing(group(cat()), feastParams({ horizonDays: 1, startStock: { wood: 700, stone: 700, food: 700, iron: 0 } }));
    expect(poor.feastsHeld).toBe(0);
  });

  it('only starts feasts inside a session', () => {
    const r = simulatePacing(
      group(cat()),
      feastParams({ horizonDays: 2, sessions: [{ start: '20:00', minutes: 10 }], joinTime: '09:00' }),
    );
    // First session at elapsed 11 h; the 12 h feast ends at 23 h, the next session is at 35 h.
    expect(r.feastsHeld).toBe(2);
    expect(simulatePacing(group(cat()), feastParams({ horizonDays: 2, sessions: [] })).feastsHeld).toBe(0);
  });
});

describe('feasts on the bundled catalogue (economy.md §6 tuning)', () => {
  const byType = group(catalogueSnapshot.data as BuildingDefinitionResponse[]);
  const run = (sessions: Session[], feasts: boolean, horizonDays = 60) =>
    simulatePacing(byType, {
      startStock: { wood: 700, stone: 700, food: 700, iron: 0 },
      horizonDays,
      producerCounts: { lumberjack: 3, quarry: 3, farm: 3 },
      settlerCost: settlerCostFrom(undefined),
      settleType: 'cartworkshop',
      storageCount: 2,
      joinTime: '09:00',
      producersAhead: 3,
      sessions,
      feasts,
    });
  const day = (minute: number | null) => (minute ?? Infinity) / 1440;

  it('the active player founds the 2nd settlement around day 6 with feasts and around day 13 without', () => {
    const withFeasts = run(PROFILE_PRESETS.active, true);
    const without = run(PROFILE_PRESETS.active, false);
    expect(day(withFeasts.secondSettlementAt)).toBeGreaterThan(4.5);
    expect(day(withFeasts.secondSettlementAt)).toBeLessThan(6.6);
    expect(day(without.secondSettlementAt)).toBeGreaterThan(13);
    expect(day(without.secondSettlementAt)).toBeLessThan(14.5);
  });

  it('renown, not the Longhouse 10 unlock, is what binds the active player with feasts', () => {
    const r = run(PROFILE_PRESETS.active, true);
    expect(day(r.renownReachedAt)).toBeGreaterThan(day(r.lhReachedAt[10] ?? null) + 1);
  });

  it('the 4-check-ins player still settles around day 13 with feasts', () => {
    const r = run(PROFILE_PRESETS.checkins4, true);
    expect(day(r.secondSettlementAt)).toBeGreaterThan(12);
    expect(day(r.secondSettlementAt)).toBeLessThan(15);
  });

  it('feasts multiply day-30 renown by 3-6x, so the later thresholds still mean something', () => {
    const ratio = run(PROFILE_PRESETS.active, true, 30).renown / run(PROFILE_PRESETS.active, false, 30).renown;
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(6);
  });
});

describe('growth flattening', () => {
  // One mill whose levels take a day each: production doubles until level 4, then stops.
  const cat = () => [
    def('longhouse', 1),
    ...[1, 2, 3, 4].map((l) => def('mill', l, { buildSeconds: 86400, prod: { wood: 60 * 2 ** (l - 1) } })),
  ];
  it('is the first day after day 2 that production grew less than 5% over the previous day', () => {
    const r = simulatePacing(group(cat()), params({ horizonDays: 8, producerCounts: { mill: 1 }, producersAhead: Infinity }));
    // 60, 120, 240, 480 on days 0-3, then flat.
    expect(r.growthFlattensAt).toBe(4);
  });

  it('is null while production is still growing at the end of the horizon', () => {
    const r = simulatePacing(group(cat()), params({ horizonDays: 3.9, producerCounts: { mill: 1 }, producersAhead: Infinity }));
    expect(r.growthFlattensAt).toBeNull();
  });
});
