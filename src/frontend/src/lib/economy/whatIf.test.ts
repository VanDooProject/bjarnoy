import { describe, expect, it } from 'vitest';
import { applyWhatIf, defaultWhatIf } from './whatIf';
import { group } from './testFixtures';
import type { BuildingDefinitionResponse, ResourceLine } from '../../api/types';
import catalogueSnapshot from '../../data/building-catalogue.json';

const live = group(catalogueSnapshot.data as BuildingDefinitionResponse[]);
const RES = ['wood', 'stone', 'food', 'iron'] as const;
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-3 * Math.max(Math.abs(a), Math.abs(b), 1);
const lineNear = (a: ResourceLine, b: ResourceLine) => RES.every((r) => near(a[r], b[r]));

describe('applyWhatIf', () => {
  it('with default knobs reproduces the live catalogue within rounding', () => {
    const w = applyWhatIf(live, defaultWhatIf());
    expect(Object.keys(w).sort()).toEqual(Object.keys(live).sort());
    for (const [type, defs] of Object.entries(live)) {
      expect(w[type]).toHaveLength(defs.length);
      for (const d of defs) {
        const n = w[type].find((x) => x.level === d.level)!;
        expect(lineNear(n.cost, d.cost), `${type} ${d.level} cost`).toBe(true);
        expect(lineNear(n.productionPerHour, d.productionPerHour), `${type} ${d.level} production`).toBe(true);
        expect(Math.abs(n.buildSeconds - d.buildSeconds), `${type} ${d.level} time`).toBeLessThanOrEqual(1);
        expect(n.storageCapacity).toEqual(d.storageCapacity);
        expect(n.requiredLonghouseLevel).toBe(d.requiredLonghouseLevel);
        expect(n.prerequisites).toEqual(d.prerequisites);
      }
    }
  });

  it('never mutates its input', () => {
    const before = structuredClone(live);
    const w = applyWhatIf(live, { ...defaultWhatIf(), costGrowth: 2 });
    expect(live).toEqual(before);
    expect(w.lumberjack).not.toBe(live.lumberjack);
    w.lumberjack[0].cost.wood = 1e9;
    expect(live.lumberjack[0].cost.wood).not.toBe(1e9);
  });

  it('a changed growth factor changes the curve from level 2 on, level 1 stays', () => {
    const w = applyWhatIf(live, { ...defaultWhatIf(), costGrowth: 1.5, timeGrowth: 1.5, productionGrowth: 1.1 });
    const [l1, l5] = [live.quarry[0], live.quarry[4]];
    expect(w.quarry[0].cost).toEqual(l1.cost);
    expect(w.quarry[4].cost.wood).toBeCloseTo(l1.cost.wood * 1.5 ** 4, 6);
    expect(w.quarry[4].buildSeconds).toBe(Math.round(l1.buildSeconds * 1.5 ** 4));
    expect(w.quarry[4].productionPerHour.stone).toBeCloseTo(l1.productionPerHour.stone * 1.1 ** 4, 6);
    expect(w.quarry[4].cost.wood).toBeGreaterThan(l5.cost.wood);
  });

  it('the Longhouse has its own growth factors and stays linear in production', () => {
    const w = applyWhatIf(live, { ...defaultWhatIf(), longhouseCostGrowth: 1.5, productionGrowth: 3 });
    const lh1 = live.longhouse[0];
    expect(w.longhouse[9].cost.stone).toBeCloseTo(lh1.cost.stone * 1.5 ** 9, 6);
    expect(w.longhouse[9].productionPerHour.wood).toBeCloseTo(lh1.productionPerHour.wood * 10, 6);
  });

  it('level-1 multipliers scale whole curves and only their own group', () => {
    const w = applyWhatIf(live, { ...defaultWhatIf(), producerCostScale: 2, longhouseCostScale: 0.5, timeScale: 3 });
    expect(w.farm[3].cost.wood).toBeCloseTo(live.farm[3].cost.wood * 2, 3);
    expect(w.longhouse[3].cost.wood).toBeCloseTo(live.longhouse[3].cost.wood * 0.5, 3);
    expect(Math.abs(w.farm[3].buildSeconds - live.farm[3].buildSeconds * 3)).toBeLessThanOrEqual(3);
    expect(w.farm[3].productionPerHour).toEqual(live.farm[3].productionPerHour);
  });
});
