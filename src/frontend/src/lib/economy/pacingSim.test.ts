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
    // The tower-added producers are their own tests; the rest of the hand-made catalogues keep the owned set.
    producersPerTower: 0,
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
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30].map(constructionSlotsFor)).toEqual([2, 2, 2, 3, 3, 4, 4, 5, 5, 6, 11, 16]);
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

  it('settler cost is 5x the training cost (one founding party), with a fallback', () => {
    expect(settlerCostFrom({ wood: 1, stone: 2, food: 3, iron: 4 })).toEqual({ wood: 5, stone: 10, food: 15, iron: 20 });
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

  // Storage House: 3 levels holding 300 / 600 / 900 in total, level 1 stands from the start. A new house costs 5 wood.
  const houses = (cost = 5) => [1, 2, 3].map((l) => def('storagehouse', l, { cost: { wood: cost }, buildSeconds: 60, storage: 300 * l }));
  const richLumberjack = def('lumberjack', 1, { prod: { wood: 6000 } });
  const maxStock = (r: ReturnType<typeof simulatePacing>) => Math.max(...r.series.stock.wood);

  it('builds no storage while nothing costs more than the current capacity', () => {
    const byType = group([def('longhouse', 1), def('longhouse', 2, { cost: { wood: 300 } }), richLumberjack, ...houses()]);
    const r = simulatePacing(byType, params({ producerCounts: { lumberjack: 1 }, horizonDays: 1 }));
    // 500 base + the level-1 house (300): the stock never grows past it because no storage is ever started.
    expect(maxStock(r)).toBe(800);
  });

  it('upgrades a Storage House when the next Longhouse level costs more than the capacity', () => {
    // 1300 wood: base 500 + house level 3 (900) = 1400 holds it, level 1 (800) does not.
    const byType = group([def('longhouse', 1), def('longhouse', 2, { cost: { wood: 1300 } }), richLumberjack, ...houses()]);
    const r = simulatePacing(byType, params({ producerCounts: { lumberjack: 1 }, horizonDays: 1 }));
    expect(r.lhReachedAt[2]).toBeGreaterThan(0);
  });

  it('places a new Storage House once none can be upgraded, so any number of them can stand', () => {
    // 1500 wood: one maxed house gives 500 + 900 = 1400, only a second house (+300) holds it.
    const byType = group([def('longhouse', 1), def('longhouse', 2, { cost: { wood: 1500 } }), richLumberjack, ...houses()]);
    const r = simulatePacing(byType, params({ producerCounts: { lumberjack: 1 }, horizonDays: 1 }));
    expect(r.lhReachedAt[2]).toBeGreaterThan(0);
  });

  it('builds storage for a producer level that does not fit either', () => {
    const byType = group([
      def('longhouse', 1),
      def('lumberjack', 1, { prod: { wood: 6000 } }),
      def('lumberjack', 2, { cost: { wood: 1300 }, prod: { wood: 7000 } }),
      ...houses(),
    ]);
    const r = simulatePacing(byType, params({ producerCounts: { lumberjack: 1 }, horizonDays: 1, producersAhead: 3 }));
    expect(r.series.rate.wood.at(-1)).toBe(7000 + 15 * 0);
  });

  describe('Great Storehouse', () => {
    // Storage House: 2 levels (300 / 600); a new house can never be afforded, so exactly one house is maxed.
    // Great Storehouse: 2 levels (5000 / 10000), behind a level-2 Storage House.
    const great = [
      def('greatstorehouse', 1, { cost: { wood: 5 }, buildSeconds: 60, storage: 5000, prereqs: [{ type: 'storagehouse', level: 2 }] }),
      def('greatstorehouse', 2, { cost: { wood: 5 }, buildSeconds: 60, storage: 10000 }),
    ];
    const stuck = [
      def('storagehouse', 1, { cost: { wood: 1e9 }, storage: 300 }),
      def('storagehouse', 2, { cost: { wood: 5 }, buildSeconds: 60, storage: 600 }),
    ];
    const cat = (lhCost: number) => group([
      def('longhouse', 1),
      def('longhouse', 2, { cost: { wood: lhCost } }),
      def('lumberjack', 1, { prod: { wood: 600000 } }),
      ...stuck,
      ...great,
    ]);

    it('builds a Great Storehouse once a Storage House stands at its prerequisite level', () => {
      // 500 + 600 + 10000 = 11100 holds 11000.
      const r = simulatePacing(cat(11000), params({ producerCounts: { lumberjack: 1 }, horizonDays: 1 }));
      expect(r.lhReachedAt[2]).toBeGreaterThan(0);
    });

    it('the n-th Great Storehouse needs n Storage Houses at max level', () => {
      // Only one house can ever be maxed (a new one costs 1e9), so only one Great Storehouse: 11100 is the ceiling.
      const r = simulatePacing(cat(12000), params({ producerCounts: { lumberjack: 1 }, horizonDays: 1 }));
      expect(r.lhReachedAt[2]).toBeUndefined();
      expect(maxStock(r)).toBe(11100);
    });

    it('the second Great Storehouse comes once a second Storage House is maxed', () => {
      const withHouses = group([
        def('longhouse', 1),
        def('longhouse', 2, { cost: { wood: 20000 } }),
        def('lumberjack', 1, { prod: { wood: 600000 } }),
        def('storagehouse', 1, { cost: { wood: 5 }, storage: 300 }),
        def('storagehouse', 2, { cost: { wood: 5 }, buildSeconds: 60, storage: 600 }),
        ...great,
      ]);
      // 500 + 2 x 600 + 2 x 10000 = 21700 holds 20000; one Great Storehouse alone (11700) does not.
      const r = simulatePacing(withHouses, params({ producerCounts: { lumberjack: 1 }, horizonDays: 1 }));
      expect(r.lhReachedAt[2]).toBeGreaterThan(0);
    });
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

describe('producers per tower', () => {
  // Longhouse 1-3 cost nothing; Longhouse 3 allows the first tower (MaxTowers). A mill is one level of 60 wood/h.
  const cat = () => [
    def('longhouse', 1),
    def('longhouse', 2, { buildSeconds: 60 }),
    def('longhouse', 3, { buildSeconds: 60 }),
    def('mill', 1, { prod: { wood: 60 } }),
  ];
  const finalRate = (over: Partial<PacingParams>) =>
    simulatePacing(group(cat()), params({ horizonDays: 1, ...over })).series.rate.wood.at(-1);

  it('adds one more producer of each owned type for every tower the Longhouse allows', () => {
    expect(finalRate({ producersPerTower: 0 })).toBe(60);
    expect(finalRate({ producersPerTower: 1 })).toBe(120);
    expect(finalRate({ producersPerTower: 2 })).toBe(180);
  });

  it('adds none before the Longhouse allows a tower (level 3)', () => {
    const r = simulatePacing(group(cat()), params({ horizonDays: 1, producersPerTower: 1 }));
    const atLh2 = r.series.rate.wood[Math.floor((r.lhReachedAt[3] ?? 0) / 60)];
    expect(r.lhReachedAt[2]).toBeLessThan(r.lhReachedAt[3]);
    expect(atLh2).toBe(60);
  });

  it('adds a producer at each tower step: 1 tower for Longhouse 3-6, 2 at 7', () => {
    const levels = [1, 2, 3, 4, 5, 6, 7].map((l) => def('longhouse', l, { buildSeconds: 60 }));
    const byType = group([...levels, def('mill', 1, { prod: { wood: 60 } })]);
    const r = simulatePacing(byType, params({ horizonDays: 1, producersPerTower: 1 }));
    expect(r.series.rate.wood.at(-1)).toBe(60 * 3);
  });

  it('tower-added producers do not hold the Longhouse back', () => {
    // The tower mill costs far more than the settlement can afford, but fits in storage: it would block level 4 if it counted.
    const byType = group([
      def('longhouse', 1, { storage: 1e6 }),
      def('longhouse', 2, { buildSeconds: 60, storage: 1e6 }),
      def('longhouse', 3, { buildSeconds: 60, storage: 1e6 }),
      def('longhouse', 4, { cost: { wood: 10 }, buildSeconds: 60, storage: 1e6 }),
      def('mill', 1, { cost: { wood: 1e5 }, prod: { wood: 60 } }),
    ]);
    const r = simulatePacing(byType, params({ horizonDays: 1, producersPerTower: 1 }));
    expect(r.lhReachedAt[4]).toBeGreaterThan(0);
  });

  it('upgrades the starting set before the tower-added producers', () => {
    // Stock for one purchase only: the starting mill's level 2 (gain 1.4/h) or the tower mill's level 1 (gain 0.6/h, cheaper).
    const byType = group([
      def('longhouse', 1),
      def('longhouse', 2, { buildSeconds: 60 }),
      def('longhouse', 3, { buildSeconds: 60 }),
      def('mill', 1, { cost: { wood: 60 }, prod: { wood: 0.6 } }),
      def('mill', 2, { cost: { wood: 100 }, prod: { wood: 2 }, reqLh: 3 }),
    ]);
    const r = simulatePacing(byType, params({
      horizonDays: 1,
      producersPerTower: 1,
      producersAhead: 0,
      startStock: { wood: 100, stone: 0, food: 0, iron: 0 },
    }));
    expect(r.series.rate.wood.at(-1)).toBe(2);
  });
});

describe('investing while saving for the Longhouse', () => {
  // The starting mill is maxed (one level), so the Longhouse is wanted all the time; level 4 is out of reach for a long while.
  const cat = (towerMillCost: number) => group([
    def('longhouse', 1, { storage: 1e6 }),
    def('longhouse', 2, { buildSeconds: 60, storage: 1e6 }),
    def('longhouse', 3, { buildSeconds: 60, storage: 1e6 }),
    def('longhouse', 4, { cost: { wood: 100000 }, storage: 1e6 }),
    def('mill', 1, { cost: { wood: towerMillCost }, prod: { wood: 60 } }),
  ]);
  const run = (towerMillCost: number) =>
    simulatePacing(cat(towerMillCost), params({ horizonDays: 2, producersPerTower: 1 })).series.rate.wood.at(-1);

  it('starts a producer that pays back before the Longhouse would be affordable', () => {
    // 60 wood for +60/h pays back in an hour; the Longhouse is more than a day away.
    expect(run(60)).toBe(120);
  });

  it('leaves out a producer that would take longer to pay back than the wait for the Longhouse', () => {
    // 1e6 wood for +60/h takes about 16 000 h; the Longhouse is ~1 700 h away.
    expect(run(1e6)).toBe(60);
  });
});

describe('paying for the settle building', () => {
  const cat = () => [
    def('longhouse', 1),
    def('lumberjack', 1, { prod: { wood: 60 } }),
    def('townsquare', 1, { cost: { wood: 100 } }),
    def('townsquare', 2, { cost: { wood: 100 } }),
    def('townsquare', 3, { cost: { wood: 100 } }),
    def('cartworkshop', 1, { cost: { wood: 100 }, prereqs: [{ type: 'townsquare', level: 3 }] }),
  ];
  const run = (over: Partial<PacingParams> = {}) =>
    simulatePacing(group(cat()), params({ horizonDays: 2, producerCounts: { lumberjack: 1 }, settleType: 'cartworkshop', renownThreshold: 0, ...over }));

  it('builds the Town Square to level 3 and then the Cart Workshop, paying each, before the 2nd settlement', () => {
    // 400 wood for the chain and the building at 60/h from the lumberjack: not before the money is there.
    const r = run();
    expect(r.secondSettlementAt).not.toBeNull();
    expect(r.secondSettlementAt!).toBeGreaterThanOrEqual(400);
  });

  it('never settles when the prerequisite chain cannot be paid for', () => {
    expect(run({ horizonDays: 0.2 }).secondSettlementAt).toBeNull();
  });
});

describe('simulatePacing on the bundled catalogue', () => {
  const byType = group(catalogueSnapshot.data as BuildingDefinitionResponse[]);

  it('60 days run quickly and produce hourly samples', () => {
    const started = performance.now();
    const r = simulatePacing(byType, params({
      horizonDays: 60,
      producerCounts: { lumberjack: 3, quarry: 3, reindeerherder: 3 },
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
        producerCounts: { lumberjack: 3, quarry: 3, reindeerherder: 3 },
        startStock: { wood: 700, stone: 700, food: 700, iron: 0 },
        settleType: 'cartworkshop',
        producersAhead,
      };
      const most = simulatePacing(byType, params(base));
      for (const sessions of [PROFILE_PRESETS.active, PROFILE_PRESETS.checkins4, PROFILE_PRESETS.checkins2]) {
        const sparse = simulatePacing(byType, params({ ...base, sessions, joinTime: '09:00' }));
        for (const [level, at] of Object.entries(sparse.lhReachedAt)) {
          // The greedy player may order its builds differently and land a level up to an hour later; the regression this
          // guards was always-online falling behind by many hours.
          expect(most.lhReachedAt[Number(level)], `ahead ${producersAhead} LH ${level}`).toBeLessThanOrEqual(at + 60);
        }
      }
    }
  });

  it('running producers ahead of the Longhouse makes the settlement stronger on day 30', () => {
    // By day 60 both have every producer maxed (one builder slot every second Longhouse level), so the mid game is where it shows.
    const base = {
      horizonDays: 35,
      producerCounts: { lumberjack: 3, quarry: 3, reindeerherder: 3 },
      startStock: { wood: 700, stone: 700, food: 700, iron: 0 },
      settleType: 'cartworkshop',
      sessions: PROFILE_PRESETS.active,
      joinTime: '09:00',
    };
    const level = simulatePacing(byType, params({ ...base, producersAhead: 0 }));
    const ahead = simulatePacing(byType, params({ ...base, producersAhead: 3 }));
    expect(productionOnDay(ahead, 30)!).toBeGreaterThan(productionOnDay(level, 30)!);
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
    // Longhouse 1 + mill 1 = 2 levels -> 2 renown/h, for the 1441 simulated minutes (no settle building in this catalogue).
    const one = simulatePacing(group([def('longhouse', 1), def('mill', 1)]), params({ horizonDays: 1 }));
    expect(one.renown).toBeCloseTo((2 * 1441) / 60, 6);
    const two = simulatePacing(group([def('longhouse', 1), def('mill', 1)]), params({ horizonDays: 1, renownPerLevelHour: 2 }));
    expect(two.renown).toBeCloseTo(2 * one.renown, 6);
  });

  it('the second settlement waits for the renown threshold', () => {
    const r = simulatePacing(group(cat()), params({ horizonDays: 2, renownThreshold: 24, settlerCost: NO_COST }));
    // 2 renown per hour, 3 once the hall (the settle building) is built a minute in: 24 renown after 8 h.
    expect(r.secondSettlementAt).toBeGreaterThanOrEqual(479);
    expect(r.secondSettlementAt).toBeLessThanOrEqual(483);
    expect(simulatePacing(group(cat()), params({ horizonDays: 2, renownThreshold: 0, settlerCost: NO_COST })).secondSettlementAt).toBe(1);
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
      // Iron only comes from the bog-ore works now (the Longhouse makes none), and the Settler costs iron: two works, as the
      // Quarry is no longer placed anew and the Clay Brickworks is the start's brick source.
      producerCounts: { lumberjack: 3, claybrickworks: 3, reindeerherder: 3, bogoreworks: 2 },
      settlerCost: settlerCostFrom(undefined),
      settleType: 'cartworkshop',
      joinTime: '09:00',
      producersAhead: 3,
      sessions,
      feasts,
    });
  const day = (minute: number | null) => (minute ?? Infinity) / 1440;

  // The simulated outcomes with the build-time curves of economy.md section 9 and one builder slot every second Longhouse
  // level (construction-slots.md): active d10.0 with feasts and d16.6 without, 4 check-ins d17.0 with feasts, 2 check-ins d29.5.
  it('the active player founds the 2nd settlement around day 10 with feasts and around day 16.6 without', () => {
    const withFeasts = run(PROFILE_PRESETS.active, true, 90);
    const without = run(PROFILE_PRESETS.active, false, 90);
    expect(day(withFeasts.secondSettlementAt)).toBeGreaterThan(9.2);
    expect(day(withFeasts.secondSettlementAt)).toBeLessThan(10.8);
    expect(day(without.secondSettlementAt)).toBeGreaterThan(15.8);
    expect(day(without.secondSettlementAt)).toBeLessThan(17.4);
  });

  it('the Longhouse 10 unlock, not renown, is what binds the active player with feasts', () => {
    const r = run(PROFILE_PRESETS.active, true, 90);
    expect(day(r.renownReachedAt)).toBeLessThan(day(r.lhReachedAt[10] ?? null) - 0.3);
    expect(day(r.secondSettlementAt) - day(r.lhReachedAt[10] ?? null)).toBeLessThan(0.3);
  });

  it('the 4-check-ins player settles around day 17 with feasts and the 2-check-ins player around day 29.5', () => {
    const four = run(PROFILE_PRESETS.checkins4, true, 90);
    expect(day(four.secondSettlementAt)).toBeGreaterThan(16.2);
    expect(day(four.secondSettlementAt)).toBeLessThan(17.8);
    const two = run(PROFILE_PRESETS.checkins2, true, 90);
    expect(day(two.secondSettlementAt)).toBeGreaterThan(28.7);
    expect(day(two.secondSettlementAt)).toBeLessThan(30.3);
  });

  it('the active player reaches Longhouse 10 around day 10.3 and the 4-check-ins player around day 16.9', () => {
    expect(day(run(PROFILE_PRESETS.active, false, 90).lhReachedAt[10] ?? null)).toBeGreaterThan(9.5);
    expect(day(run(PROFILE_PRESETS.active, false, 90).lhReachedAt[10] ?? null)).toBeLessThan(11.1);
    expect(day(run(PROFILE_PRESETS.checkins4, true, 90).lhReachedAt[10] ?? null)).toBeGreaterThan(16.1);
    expect(day(run(PROFILE_PRESETS.checkins4, true, 90).lhReachedAt[10] ?? null)).toBeLessThan(17.7);
  });

  it('the active player reaches Longhouse 30 around day 255', () => {
    const r = run(PROFILE_PRESETS.active, false, 300);
    expect(day(r.lhReachedAt[30] ?? null)).toBeGreaterThan(246);
    expect(day(r.lhReachedAt[30] ?? null)).toBeLessThan(264);
  });

  it('feasts multiply day-30 renown by 2-4x, so the later thresholds still mean something', () => {
    const ratio = run(PROFILE_PRESETS.active, true, 30).renown / run(PROFILE_PRESETS.active, false, 30).renown;
    expect(ratio).toBeGreaterThan(2);
    expect(ratio).toBeLessThan(4);
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

describe('a producer that unlocks late (the bog-ore works)', () => {
  // Longhouse 1-4 with a fast Longhouse, and an iron producer that opens at Longhouse 3.
  function ironCatalogue(): BuildingDefinitionResponse[] {
    return [
      def('longhouse', 1, { storage: 100000 }),
      ...[2, 3, 4].map((l) => def('longhouse', l, { cost: { wood: 10 }, buildSeconds: 60, storage: 100000 })),
      def('mill', 1, { prod: { wood: 100 } }),
      def('ore', 1, { prod: { iron: 50 }, reqLh: 3, cost: { wood: 10 }, buildSeconds: 60 }),
      def('ore', 2, { prod: { iron: 60 }, reqLh: 3, cost: { wood: 10 }, buildSeconds: 60 }),
    ];
  }

  it('makes no iron before its Longhouse level, and starts making it once it is placed', () => {
    const result = simulatePacing(
      group(ironCatalogue()),
      params({ producerCounts: { mill: 1, ore: 1 }, startStock: { wood: 1000, stone: 0, food: 0, iron: 0 }, horizonDays: 1, producersAhead: 3 }),
    );
    const reachedLh3 = Math.ceil(result.lhReachedAt[3]! / 60);
    expect(result.lhReachedAt[3]).toBeDefined();
    expect(result.series.rate.iron.slice(0, reachedLh3).every((r) => r === 0)).toBe(true);
    expect(result.series.rate.iron.at(-1)).toBeGreaterThan(0);
  });

  it('does not start a producer whose level 1 is open from the start at level 0', () => {
    const result = simulatePacing(
      group(ironCatalogue()),
      params({ producerCounts: { mill: 1 }, startStock: { wood: 1000, stone: 0, food: 0, iron: 0 }, horizonDays: 1 }),
    );
    expect(result.series.rate.wood[0]).toBeGreaterThan(0);
  });
});

// docs/design/economy.md section 8: the bog-ore works' level-1 iron increment (4/h) was tuned in this lab so iron stays the indirect
// gate for the army: there is no iron at all before the works stand (LH 3, the Longhouse makes none),
// and with three works iron income settles at about 0.4 to 0.5 of the wood income, where a unit costs about half the wood.
describe('iron on the bundled catalogue (bog-ore works P1 tuning)', () => {
  const byType = group(catalogueSnapshot.data as BuildingDefinitionResponse[]);
  const run = (works: number) =>
    simulatePacing(byType, params({
      horizonDays: 80,
      producerCounts: { lumberjack: 3, quarry: 3, farm: 3, claybrickworks: 1, bogoreworks: works },
      startStock: { wood: 700, stone: 700, food: 700, iron: 0 },
      settleType: 'cartworkshop',
      sessions: PROFILE_PRESETS.active,
      joinTime: '09:00',
      producersAhead: 3,
    }));
  const hourAt = (r: ReturnType<typeof run>, lh: number) => Math.ceil(r.lhReachedAt[lh]! / 60);

  it('makes no iron until the bog-ore works open at Longhouse 3, and some from Longhouse 4 on', () => {
    const r = run(3);
    for (let lh = 1; lh <= 2; lh++) {
      expect(r.series.rate.iron[hourAt(r, lh)], `LH ${lh}`).toBe(0);
    }
    expect(r.series.rate.iron[hourAt(r, 4)]).toBeGreaterThan(0);
  });

  it('builds no bog-ore works before Longhouse 3', () => {
    const r = run(3);
    const before = hourAt(r, 3) - 1;
    expect(r.series.rate.iron.slice(0, before + 1).every((rate) => rate === 0)).toBe(true);
  });

  it('never makes iron without a bog-ore works', () => {
    const r = run(0);
    expect(r.series.rate.iron.every((rate) => rate === 0)).toBe(true);
    expect(r.series.stock.iron.every((stock) => stock === 0)).toBe(true);
  });

  it('keeps iron income at about a third to a half of wood income with three works from Longhouse 8 on', () => {
    const r = run(3);
    for (const lh of [8, 10, 15]) {
      const h = hourAt(r, lh);
      const ratio = r.series.rate.iron[h]! / r.series.rate.wood[h]!;
      expect(ratio, `LH ${lh}`).toBeGreaterThan(0.3);
      expect(ratio, `LH ${lh}`).toBeLessThan(0.6);
    }
  });

  it('is a much smaller share with one works (iron stays scarce), and never zero once the works stand', () => {
    const one = run(1);
    const h = hourAt(one, 10);
    expect(one.series.rate.iron[h]!).toBeGreaterThan(0);
    // Every tower adds one more works too, so the gap to three works narrows: still clearly less iron per wood.
    const three = run(3);
    expect(one.series.rate.iron[h]! / one.series.rate.wood[h]!).toBeLessThan(0.75 * (three.series.rate.iron[hourAt(three, 10)]! / three.series.rate.wood[hourAt(three, 10)]!));
  });

  it('pays for a first Spearman from one bog-ore works once the Barracks open at Longhouse 5', () => {
    const r = run(1);
    const h = hourAt(r, 5);
    // Spearman: 40 iron. A single works has banked more than that by the time LH 5 lands.
    expect(r.series.stock.iron[h]!).toBeGreaterThanOrEqual(40);
  });
});
