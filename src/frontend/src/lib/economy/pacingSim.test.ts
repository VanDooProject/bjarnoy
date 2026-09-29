import { describe, expect, it } from 'vitest';
import {
  constructionSlotsFor,
  isOnline,
  settlerCostFrom,
  simulatePacing,
  FALLBACK_SETTLER_COST,
  type PacingParams,
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
    profile: 'always',
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

  it('casual is online only in its listed hours, on every day', () => {
    expect(isOnline('casual', 7 * 60 + 30)).toBe(true);
    expect(isOnline('casual', 8 * 60)).toBe(false);
    expect(isOnline('casual', 1440 + 22 * 60 + 59)).toBe(true);
    expect(isOnline('casual', 1440 + 23 * 60)).toBe(false);
    expect(isOnline('always', 12345)).toBe(true);
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

  it('settlers become ready once the settle type is placeable and stock covers the cost', () => {
    const r = simulatePacing(group(tiny()), params({ horizonDays: 2, settlerCost: { wood: 300, stone: 0, food: 0, iron: 0 } }));
    expect(r.settlersReadyAt).not.toBeNull();
    // hall needs LH 2
    expect(r.settlersReadyAt!).toBeGreaterThanOrEqual(r.lhReachedAt[2]);
  });

  it('settlers stay null when the settle type is never placeable', () => {
    const r = simulatePacing(group(tiny()), params({ settleType: 'nonexistent' }));
    expect(r.settlersReadyAt).toBeNull();
  });

  it('casual play reaches milestones no earlier than always-online play', () => {
    const always = simulatePacing(group(tiny()), params({ horizonDays: 3 }));
    const casual = simulatePacing(group(tiny()), params({ horizonDays: 3, profile: 'casual' }));
    expect(casual.lhReachedAt[2]).toBeGreaterThanOrEqual(always.lhReachedAt[2]);
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

  it('an always-online player reaches every Longhouse level no later than a casual one', () => {
    // Regression: always-online used to lose to casual because it kept
    // spending on producer upgrades instead of saving for the Longhouse.
    const base = {
      horizonDays: 30,
      producerCounts: { lumberjack: 3, quarry: 3, farm: 3 },
      startStock: { wood: 300, stone: 300, food: 200, iron: 0 },
      settleType: 'cartworkshop',
    };
    const always = simulatePacing(byType, params(base));
    const casual = simulatePacing(byType, params({ ...base, profile: 'casual' }));
    for (const [level, at] of Object.entries(casual.lhReachedAt)) {
      expect(always.lhReachedAt[Number(level)], `LH ${level}`).toBeLessThanOrEqual(at);
    }
  });
});
