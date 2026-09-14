import { describe, expect, it } from 'vitest';
import { PinchTracker, pinchStep, type Point } from './pinchGesture';

describe('pinchStep', () => {
  it('reports factor 2 when the touches spread to twice their distance', () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 10, y: 0 };
    const step = pinchStep(a, b, { x: -5, y: 0 }, { x: 15, y: 0 });
    expect(step.factor).toBeCloseTo(2);
  });

  it('reports factor 0.5 when the touches close to half their distance', () => {
    const step = pinchStep({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 });
    expect(step.factor).toBeCloseTo(0.5);
  });

  it('reports the midpoint of the new positions', () => {
    const step = pinchStep({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 20 }, { x: 10, y: 20 });
    expect(step.midpoint).toEqual({ x: 5, y: 20 });
  });

  it('reports pan as the delta between the previous and next midpoints', () => {
    const step = pinchStep({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 6 }, { x: 14, y: 6 });
    // prev midpoint (5, 0), next midpoint (9, 6)
    expect(step.pan).toEqual({ x: 4, y: 6 });
  });

  it('reports factor 1 for a pure translation (distance unchanged)', () => {
    const step = pinchStep({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 3, y: 3 }, { x: 13, y: 3 });
    expect(step.factor).toBeCloseTo(1);
  });

  it('guards against a near-zero previous distance instead of producing Infinity/NaN', () => {
    const step = pinchStep({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 0, y: 0 }, { x: 20, y: 20 });
    expect(step.factor).toBe(1);
    expect(Number.isFinite(step.factor)).toBe(true);
  });
});

describe('PinchTracker', () => {
  it('reports not pinching with a single tracked pointer, and move returns null', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 });
    expect(t.isPinching).toBe(false);
    expect(t.count).toBe(1);
    expect(t.move(1, { x: 5, y: 5 })).toBeNull();
  });

  it('starts pinching once a second pointer goes down, re-baselining on the first move', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 });
    t.down(2, { x: 10, y: 0 });
    expect(t.isPinching).toBe(true);
    const first = t.move(1, { x: -5, y: 0 });
    expect(first).toEqual({ midpoint: { x: 2.5, y: 0 }, factor: 1, pan: { x: 0, y: 0 } });
  });

  it('yields a real step on the second move after the pair has a baseline', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 });
    t.down(2, { x: 10, y: 0 });
    t.move(1, { x: 0, y: 0 }); // baseline, no-op position change
    const step = t.move(2, { x: 20, y: 0 });
    expect(step).not.toBeNull();
    expect(step!.factor).toBeCloseTo(2);
  });

  it('drops to a single primary pointer when one of a pinching pair lifts', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 });
    t.down(2, { x: 10, y: 0 });
    t.move(1, { x: 0, y: 0 });
    t.up(1);
    expect(t.count).toBe(1);
    expect(t.isPinching).toBe(false);
    expect(t.primary()).toEqual({ id: 2, p: { x: 10, y: 0 } });
  });

  it('ignores a third finger for geometry but still tracks it', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 });
    t.down(2, { x: 10, y: 0 });
    t.move(1, { x: 0, y: 0 }); // baseline
    t.down(3, { x: 50, y: 50 });
    expect(t.count).toBe(3);
    // Third finger down forces the next move to re-baseline rather than jump.
    const rebaseline = t.move(1, { x: 0, y: 0 });
    expect(rebaseline).toEqual({ midpoint: { x: 5, y: 0 }, factor: 1, pan: { x: 0, y: 0 } });
    // The third finger's own move is ignored (not part of the tracked pair).
    expect(t.move(3, { x: 60, y: 60 })).toBeNull();
  });

  it('forms a fresh baseline for the remaining two pointers after one of three lifts', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 });
    t.down(2, { x: 10, y: 0 });
    t.down(3, { x: 50, y: 50 });
    t.up(3);
    expect(t.count).toBe(2);
    const step = t.move(1, { x: 0, y: 0 });
    expect(step).toEqual({ midpoint: { x: 5, y: 0 }, factor: 1, pan: { x: 0, y: 0 } });
  });

  it('treats up of an unknown pointer id as a no-op', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 });
    t.up(99);
    expect(t.count).toBe(1);
  });

  it('returns null for a move on a pointer that was never tracked', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 });
    expect(t.move(2, { x: 1, y: 1 })).toBeNull();
  });

  it('clear() resets all tracked pointers', () => {
    const t = new PinchTracker();
    t.down(1, { x: 0, y: 0 });
    t.down(2, { x: 10, y: 0 });
    t.clear();
    expect(t.count).toBe(0);
    expect(t.isPinching).toBe(false);
    expect(t.primary()).toBeNull();
  });
});
