import { describe, expect, it } from 'vitest';
import { BENCH_PROFILES, benchDefaults, runBench } from './pacingBench';
import { applyWhatIf } from './whatIf';
import { group } from './testFixtures';
import type { BuildingDefinitionResponse } from '../../api/types';
import catalogueSnapshot from '../../data/building-catalogue.json';

const live = group(catalogueSnapshot.data as BuildingDefinitionResponse[]);

describe('benchDefaults', () => {
  it('reads each producer\'s level-1 output off the live catalogue and reproduces the live catalogue', () => {
    const k = benchDefaults(live);
    expect(k.levelOneOutput.lumberjack).toBe(8);
    expect(k.levelOneOutput.bogoreworks).toBe(4);
    const w = applyWhatIf(live, k);
    for (const [type, defs] of Object.entries(live)) {
      for (const d of defs) {
        const n = w[type].find((x) => x.level === d.level)!;
        expect(n.cost.wood, `${type} ${d.level}`).toBeCloseTo(d.cost.wood, 6);
      }
    }
  });
});

describe('runBench', () => {
  const k = { ...benchDefaults(live), horizonDays: 40 };
  const r = runBench(live, k);

  it('returns the four profiles in order, with samples every 6 hours', () => {
    expect(r.profiles.map((p) => p.id)).toEqual(BENCH_PROFILES.map((p) => p.id));
    expect(r.profiles[0].lh).toHaveLength(Math.ceil((40 * 24 + 1) / 6));
    expect(r.profiles[0].prod).toHaveLength(r.profiles[0].lh.length);
  });

  it('feasts bring the 2nd settlement sooner for the same schedule', () => {
    const [withFeasts, without] = r.profiles;
    expect(withFeasts.secondSettlementAt).not.toBeNull();
    expect(without.secondSettlementAt === null || withFeasts.secondSettlementAt! < without.secondSettlementAt).toBe(true);
  });

  it('lists the Longhouse wood cost per level and moves with the Longhouse growth knob', () => {
    expect(r.lhWoodCost[0]).toBe(live.longhouse[0].cost.wood);
    const pricier = runBench(live, { ...k, longhouseCostGrowth: 1.4 });
    expect(pricier.lhWoodCost[9]).toBeGreaterThan(r.lhWoodCost[9]);
  });
});
