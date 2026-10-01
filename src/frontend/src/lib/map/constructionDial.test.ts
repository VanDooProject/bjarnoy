import { describe, expect, it } from 'vitest';
import type { BuildOrderResponse } from '../../api/types';
import { constructionDialsFromQueue, dialProgress, dialRemainingSeconds, hexPerimeterPath, polygonPerimeterPath } from './constructionDial';

function order(p: Partial<BuildOrderResponse>): BuildOrderResponse {
  return {
    id: 'o', q: 0, r: 0, building: 'house', targetLevel: 1, state: 'building', slotCost: 1,
    completesInSeconds: 60, totalSeconds: 100, ...p,
  } as BuildOrderResponse;
}

describe('constructionDialsFromQueue', () => {
  it('maps a building order to epoch start/end', () => {
    const [d] = constructionDialsFromQueue([order({ q: 2, r: -1 })], 1_000_000);
    expect(d.coord).toEqual({ q: 2, r: -1 });
    expect(d.endMs).toBe(1_060_000);
    expect(d.startMs).toBe(960_000);
  });

  it('gives null timing for waiting, null-completion and zero-total orders', () => {
    const dials = constructionDialsFromQueue(
      [
        order({ q: 1, state: 'waiting' }),
        order({ q: 2, completesInSeconds: null }),
        order({ q: 3, totalSeconds: 0 }),
      ],
      0,
    );
    expect(dials).toHaveLength(3);
    for (const d of dials) expect(d).toMatchObject({ startMs: null, endMs: null });
  });

  it('keeps one dial per hex, preferring building over waiting', () => {
    const a = constructionDialsFromQueue([order({ state: 'waiting' }), order({ state: 'building' })], 0);
    const b = constructionDialsFromQueue([order({ state: 'building' }), order({ state: 'waiting' })], 0);
    for (const dials of [a, b]) {
      expect(dials).toHaveLength(1);
      expect(dials[0].endMs).not.toBeNull();
    }
  });
});

describe('dialProgress', () => {
  const d = { coord: { q: 0, r: 0 }, startMs: 1000, endMs: 3000 };
  it('is 0 at start, 0.5 mid, 1 at end and clamps outside', () => {
    expect(dialProgress(d, 1000)).toBe(0);
    expect(dialProgress(d, 2000)).toBe(0.5);
    expect(dialProgress(d, 3000)).toBe(1);
    expect(dialProgress(d, 0)).toBe(0);
    expect(dialProgress(d, 9999)).toBe(1);
  });
  it('is 0 without timing', () => {
    expect(dialProgress({ coord: { q: 0, r: 0 }, startMs: null, endMs: null }, 5)).toBe(0);
  });
});

describe('hexPerimeterPath', () => {
  const near = (a: number[], b: number[]) => {
    expect(a).toHaveLength(b.length);
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
  };
  const s = Math.sqrt(3) / 2;
  it('is empty at 0', () => expect(hexPerimeterPath(0, 0, 10, 0)).toEqual([]));
  it('traces the first edge at 1/6, top vertex to next vertex clockwise', () => {
    near(hexPerimeterPath(0, 0, 10, 1 / 6), [0, -10, 10 * s, -5]);
  });
  it('ends at the midpoint of the second edge at 0.25', () => {
    near(hexPerimeterPath(0, 0, 10, 0.25), [0, -10, 10 * s, -5, 10 * s, 0]);
  });
  it('closes back at the top vertex at 1 (7 points)', () => {
    const p = hexPerimeterPath(0, 0, 10, 1);
    expect(p).toHaveLength(14);
    near(p.slice(12), [0, -10]);
  });
  it('clamps above 1', () => expect(hexPerimeterPath(0, 0, 10, 3)).toHaveLength(14));
});

describe('dialRemainingSeconds', () => {
  const d = { coord: { q: 0, r: 0 }, startMs: 1000, endMs: 3000 };
  it('counts down and clamps at 0', () => {
    expect(dialRemainingSeconds(d, 1000)).toBe(2);
    expect(dialRemainingSeconds(d, 2500)).toBe(0.5);
    expect(dialRemainingSeconds(d, 9000)).toBe(0);
  });
  it('is null without timing', () => {
    expect(dialRemainingSeconds({ coord: { q: 0, r: 0 }, startMs: null, endMs: null }, 5)).toBeNull();
  });
});

describe('polygonPerimeterPath', () => {
  // 10 x 30 rectangle: perimeter 80, edges of unequal length.
  const rect = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 30 },
    { x: 0, y: 30 },
  ];
  it('is empty at 0', () => expect(polygonPerimeterPath(rect, 0)).toEqual([]));
  it('stops mid first edge by length, not by edge count', () => {
    expect(polygonPerimeterPath(rect, 5 / 80)).toEqual([0, 0, 5, 0]);
  });
  it('lands on a vertex exactly at the edge boundary', () => {
    expect(polygonPerimeterPath(rect, 10 / 80)).toEqual([0, 0, 10, 0]);
  });
  it('ends part-way along the long second edge', () => {
    expect(polygonPerimeterPath(rect, 25 / 80)).toEqual([0, 0, 10, 0, 10, 15]);
  });
  it('closes at vertex 0 at 1', () => {
    expect(polygonPerimeterPath(rect, 1)).toEqual([0, 0, 10, 0, 10, 30, 0, 30, 0, 0]);
  });
});
