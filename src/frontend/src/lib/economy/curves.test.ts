import { describe, expect, it } from 'vitest';
import { curvesFor } from './curves';
import { def } from './testFixtures';

describe('curvesFor', () => {
  const defs = [
    def('farm', 2, { cost: { wood: 20, stone: 0, food: 10, iron: 0 }, buildSeconds: 120, prod: { food: 30 } }),
    def('farm', 1, { cost: { wood: 10, stone: 5, food: 0, iron: 0 }, buildSeconds: 60, prod: { food: 10 } }),
    def('farm', 3, { cost: { wood: 40, stone: 0, food: 0, iron: 0 }, buildSeconds: 240, prod: { food: 30 } }),
  ];

  it('sorts by level and sums cost, minutes and production', () => {
    const c = curvesFor(defs);
    expect(c.map((p) => p.level)).toEqual([1, 2, 3]);
    expect(c[0]).toMatchObject({ totalCost: 15, buildMinutes: 1, productionPerHour: 10 });
    expect(c[1]).toMatchObject({ totalCost: 30, buildMinutes: 2, productionPerHour: 30 });
    expect(c[0].cost.stone).toBe(5);
  });

  it('pays back a level against the production it adds over the previous level', () => {
    const c = curvesFor(defs);
    expect(c[0].paybackHours).toBeCloseTo(15 / 10);
    expect(c[1].paybackHours).toBeCloseTo(30 / 20);
  });

  it('gives null payback when a level adds no production', () => {
    expect(curvesFor(defs)[2].paybackHours).toBeNull();
    const storage = curvesFor([def('storagehouse', 1, { storage: 1000 })]);
    expect(storage[0].paybackHours).toBeNull();
  });
});
