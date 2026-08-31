import { describe, expect, it } from 'vitest';
import { lerpPoint, routeProgressAt } from './armyProgress';

const PATH = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
];
const DEPARTED = 1_000_000;
const HOUR = 3_600_000;

describe('routeProgressAt', () => {
  it('sits on the first hex at departure', () => {
    const p = routeProgressAt(PATH, [0, 1, 2], DEPARTED, DEPARTED + 2 * HOUR, DEPARTED)!;
    expect(p.legIndex).toBe(0);
    expect(p.t).toBe(0);
    expect(p.arrived).toBe(false);
  });

  it('sits partway along the first leg a quarter of the way in', () => {
    const p = routeProgressAt(PATH, [0, 1, 2], DEPARTED, DEPARTED + 2 * HOUR, DEPARTED + HOUR / 2)!;
    expect(p.legIndex).toBe(0);
    expect(p.from).toEqual({ q: 0, r: 0 });
    expect(p.to).toEqual({ q: 1, r: 0 });
    expect(p.t).toBeCloseTo(0.5);
    expect(p.overall).toBeCloseTo(0.25);
  });

  it('crosses onto the second leg once the first hex is reached', () => {
    const p = routeProgressAt(PATH, [0, 1, 2], DEPARTED, DEPARTED + 2 * HOUR, DEPARTED + 1.5 * HOUR)!;
    expect(p.legIndex).toBe(1);
    expect(p.from).toEqual({ q: 1, r: 0 });
    expect(p.to).toEqual({ q: 2, r: 0 });
    expect(p.t).toBeCloseTo(0.5);
  });

  it('respects an uneven per-leg schedule instead of assuming uniform speed', () => {
    // Three hexes, but the second leg costs 3x the first (mixed terrain) —
    // halfway through the trip in wall-clock terms the army is still on the
    // *second* leg, not neatly at its midpoint, which is exactly what a
    // uniform-speed guess would get wrong.
    const schedule = [0, 1, 4];
    const arrives = DEPARTED + 4 * HOUR;
    const halfway = routeProgressAt(PATH, schedule, DEPARTED, arrives, DEPARTED + 2 * HOUR)!;
    expect(halfway.legIndex).toBe(1);
    expect(halfway.t).toBeCloseTo(1 / 3);

    // The uniform fallback would have put it a whole hex further along.
    const uniform = routeProgressAt(PATH, undefined, DEPARTED, arrives, DEPARTED + 2 * HOUR)!;
    expect(uniform.legIndex).toBe(1);
    expect(uniform.t).toBeCloseTo(0);
  });

  it('reaches each hex exactly when its cumulative hour says it does', () => {
    const schedule = [0, 1, 4];
    const arrives = DEPARTED + 4 * HOUR;
    const atSecondHex = routeProgressAt(PATH, schedule, DEPARTED, arrives, DEPARTED + HOUR)!;
    expect(atSecondHex.legIndex).toBe(1);
    expect(atSecondHex.t).toBeCloseTo(0);
  });

  it('clamps to the destination after arrival, and to the start before departure', () => {
    const arrives = DEPARTED + 2 * HOUR;
    const after = routeProgressAt(PATH, [0, 1, 2], DEPARTED, arrives, arrives + HOUR)!;
    expect(after.arrived).toBe(true);
    expect(after.from).toEqual({ q: 2, r: 0 });
    expect(after.overall).toBe(1);

    const before = routeProgressAt(PATH, [0, 1, 2], DEPARTED, arrives, DEPARTED - HOUR)!;
    expect(before.legIndex).toBe(0);
    expect(before.t).toBe(0);
  });

  it('falls back to uniform legs when the schedule does not match the path', () => {
    const arrives = DEPARTED + 2 * HOUR;
    const wrongLength = routeProgressAt(PATH, [0, 1], DEPARTED, arrives, DEPARTED + HOUR)!;
    expect(wrongLength.legIndex).toBe(1);
    expect(wrongLength.t).toBeCloseTo(0);

    const notStartingAtZero = routeProgressAt(PATH, [5, 6, 7], DEPARTED, arrives, DEPARTED + HOUR)!;
    expect(notStartingAtZero.legIndex).toBe(1);

    const goingBackwards = routeProgressAt(PATH, [0, 2, 1], DEPARTED, arrives, DEPARTED + HOUR)!;
    expect(goingBackwards.legIndex).toBe(1);
  });

  it('handles degenerate routes without dividing by zero', () => {
    expect(routeProgressAt([], [], DEPARTED, DEPARTED + HOUR, DEPARTED)).toBeNull();

    const single = routeProgressAt([{ q: 3, r: 3 }], [0], DEPARTED, DEPARTED, DEPARTED)!;
    expect(single.arrived).toBe(true);
    expect(single.from).toEqual({ q: 3, r: 3 });

    const noSpan = routeProgressAt(PATH, [0, 1, 2], DEPARTED, DEPARTED, DEPARTED)!;
    expect(noSpan.arrived).toBe(true);

    // A schedule where two hexes share a cumulative hour (a zero-cost leg).
    const zeroLeg = routeProgressAt(PATH, [0, 0, 2], DEPARTED, DEPARTED + 2 * HOUR, DEPARTED)!;
    expect(Number.isFinite(zeroLeg.t)).toBe(true);
  });

  it('advances monotonically across the whole trip', () => {
    const arrives = DEPARTED + 2 * HOUR;
    let previous = -1;
    for (let ms = DEPARTED; ms <= arrives; ms += HOUR / 20) {
      const p = routeProgressAt(PATH, [0, 1, 2], DEPARTED, arrives, ms)!;
      const absolute = p.legIndex + p.t;
      expect(absolute).toBeGreaterThanOrEqual(previous);
      previous = absolute;
    }
  });
});

describe('lerpPoint', () => {
  it('interpolates between two points', () => {
    expect(lerpPoint({ x: 0, y: 10 }, { x: 10, y: 30 }, 0.25)).toEqual({ x: 2.5, y: 15 });
  });
});
