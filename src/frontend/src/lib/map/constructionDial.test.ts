import { describe, expect, it } from 'vitest';
import type { BuildOrderResponse } from '../../api/types';
import {
  constructionDialsFromQueue,
  DIAL_HOVER_MS,
  DIAL_LABEL_BASE_PX,
  DIAL_MIN_LABEL_PX,
  dialHoverStep,
  dialScale,
  DIAL_FINISH_MS,
  DIAL_REJECT_MS,
  dialFinishFrame,
  dialRejectFrame,
  dialProgress,
  dialRemainingSeconds,
  hexPerimeterPath,
  polygonPerimeterPath,
  polylinePartial,
  retainFinishingDials,
  dialRadiusPx,
  pickTappedDial,
  nextTapReveal,
} from './constructionDial';

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

describe('polylinePartial', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  it('is empty at 0', () => expect(polylinePartial(pts, 0)).toEqual([]));
  it('stops mid first segment', () => expect(polylinePartial(pts, 0.25)).toEqual([0, 0, 5, 0]));
  it('runs into the second segment', () => expect(polylinePartial(pts, 0.75)).toEqual([0, 0, 10, 0, 10, 5]));
  it('does not close at 1 (open path)', () => expect(polylinePartial(pts, 1)).toEqual([0, 0, 10, 0, 10, 10]));
});

describe('dialFinishFrame', () => {
  it('is null before the end and once the animation is over', () => {
    expect(dialFinishFrame(-1)).toBeNull();
    expect(dialFinishFrame(DIAL_FINISH_MS)).toBeNull();
    expect(dialFinishFrame(2599)).not.toBeNull();
  });
  it('starts at rest with full flash and one ring', () => {
    const f = dialFinishFrame(0)!;
    expect(f).toMatchObject({ scale: 1, flash: 1, check: 0, alpha: 1 });
    expect(f.rings[0]).toEqual({ scale: 1, alpha: 0.9 });
    expect(f.rings[1].alpha).toBe(0);
  });
  it('pops to 1.22 at 180ms and is back to 1 at 480ms', () => {
    expect(dialFinishFrame(180)!.scale).toBeCloseTo(1.22, 6);
    expect(dialFinishFrame(480)!.scale).toBeCloseTo(1, 6);
    expect(dialFinishFrame(1000)!.scale).toBe(1);
  });
  it('flash decays linearly to 0 by 400ms', () => {
    expect(dialFinishFrame(200)!.flash).toBeCloseTo(0.5, 6);
    expect(dialFinishFrame(400)!.flash).toBe(0);
  });
  it('draws the check from 200ms to 520ms', () => {
    expect(dialFinishFrame(200)!.check).toBe(0);
    expect(dialFinishFrame(360)!.check).toBeCloseTo(0.5, 6);
    expect(dialFinishFrame(520)!.check).toBe(1);
  });
  it('staggers two shockwaves lasting 700ms each', () => {
    const f = dialFinishFrame(160)!;
    expect(f.rings[1]).toEqual({ scale: 1, alpha: 0.9 });
    expect(f.rings[0].scale).toBeGreaterThan(1);
    const late = dialFinishFrame(700)!;
    expect(late.rings[0].alpha).toBe(0);
    expect(late.rings[1].alpha).toBeGreaterThan(0);
    expect(dialFinishFrame(860)!.rings.every((r) => r.alpha === 0)).toBe(true);
    expect(dialFinishFrame(500)!.rings[0].scale).toBeLessThanOrEqual(2.1);
  });
  it('holds alpha 1 until 1900ms then fades linearly to 0', () => {
    expect(dialFinishFrame(1900)!.alpha).toBe(1);
    expect(dialFinishFrame(2250)!.alpha).toBeCloseTo(0.5, 6);
    expect(dialFinishFrame(2599)!.alpha).toBeCloseTo(1 / 700, 6);
  });
});

describe('retainFinishingDials', () => {
  const now = 100_000;
  const dial = (q: number, endMs: number | null) => ({ coord: { q, r: 0 }, startMs: endMs === null ? null : endMs - 10_000, endMs });
  it('keeps a just-finished dial that vanished from next', () => {
    const out = retainFinishingDials([dial(1, now - 500)], [], now);
    expect(out).toEqual([dial(1, now - 500)]);
  });
  it('clamps endMs to now when the server finished early', () => {
    const [d] = retainFinishingDials([dial(1, now + 3000)], [], now);
    expect(d.endMs).toBe(now);
    expect(d.startMs).toBe(now + 3000 - 10_000);
  });
  it('drops cancelled (far future / unknown timing) dials', () => {
    expect(retainFinishingDials([dial(1, now + 60_000), dial(2, null)], [], now)).toEqual([]);
  });
  it('drops dials whose animation already expired', () => {
    expect(retainFinishingDials([dial(1, now - DIAL_FINISH_MS)], [], now)).toEqual([]);
  });
  it('does not duplicate a coord still present in next', () => {
    const next = [dial(1, now + 9000)];
    expect(retainFinishingDials([dial(1, now - 100)], next, now)).toEqual(next);
  });
});

describe('dialRejectFrame', () => {
  it('shakes +-4 px over 280 ms: still at 0, -4 at a quarter, +4 at the middle, -2 at three quarters, still again at the end', () => {
    expect(dialRejectFrame(0)).toEqual({ offsetX: 0, scale: 1, alpha: 1 });
    expect(dialRejectFrame(70)!.offsetX).toBeCloseTo(-4);
    expect(dialRejectFrame(140)!.offsetX).toBeCloseTo(4);
    expect(dialRejectFrame(210)!.offsetX).toBeCloseTo(-2);
    expect(dialRejectFrame(279.99)!.offsetX).toBeCloseTo(0, 1);
  });

  it('interpolates between the shake keyframes', () => {
    expect(dialRejectFrame(35)!.offsetX).toBeCloseTo(-2);
    expect(dialRejectFrame(105)!.offsetX).toBeCloseTo(0);
  });

  it('keeps full size and opacity during the shake, then shrinks to .6 and fades over the next 200 ms', () => {
    expect(dialRejectFrame(200)).toMatchObject({ scale: 1, alpha: 1 });
    expect(dialRejectFrame(280)).toEqual({ offsetX: 0, scale: 1, alpha: 1 });
    const mid = dialRejectFrame(380)!;
    expect(mid.offsetX).toBe(0);
    expect(mid.scale).toBeCloseTo(0.8);
    expect(mid.alpha).toBeCloseTo(0.5);
    const end = dialRejectFrame(DIAL_REJECT_MS - 0.01)!;
    expect(end.scale).toBeCloseTo(0.6, 2);
    expect(end.alpha).toBeCloseTo(0, 2);
  });

  it('is null before the rejection and once it has played', () => {
    expect(dialRejectFrame(-1)).toBeNull();
    expect(dialRejectFrame(DIAL_REJECT_MS)).toBeNull();
    expect(DIAL_REJECT_MS).toBe(480);
  });
});

describe('retainFinishingDials with a rejected dial', () => {
  const rejected = { coord: { q: 1, r: 1 }, startMs: null, endMs: null, rejectedAtMs: 1000 };

  it('keeps a rejected dial after its pending order left the queue, until its animation is over', () => {
    expect(retainFinishingDials([rejected], [], 1200)).toEqual([rejected]);
    expect(retainFinishingDials([rejected], [], 1000 + DIAL_REJECT_MS)).toEqual([]);
  });

  it('drops it when a real order now stands on that hex', () => {
    const real = { coord: { q: 1, r: 1 }, startMs: 0, endMs: 99_999 };
    expect(retainFinishingDials([rejected], [real], 1200)).toEqual([real]);
  });

  it('still drops an ordinary dial with unknown timing (a cancelled order)', () => {
    expect(retainFinishingDials([{ coord: { q: 2, r: 2 }, startMs: null, endMs: null }], [], 1200)).toEqual([]);
  });
});

describe('dialScale', () => {
  it('has no floor: a zoomed-out dial shrinks with the map', () => {
    expect(dialScale(0.38 / 0.85, 0).zs).toBeCloseTo(0.38 / 0.85);
    expect(dialScale(0.1, 0).zs).toBeCloseTo(0.1);
  });

  it('keeps growing past the default size when zoomed in', () => {
    expect(dialScale(1.5, 0).zs).toBe(1.5);
  });

  it('hides the label below the minimum on-screen size and shows it at/above', () => {
    const edge = DIAL_MIN_LABEL_PX / DIAL_LABEL_BASE_PX;
    expect(dialScale(edge - 0.01, 0).showLabel).toBe(false);
    expect(dialScale(edge, 0).showLabel).toBe(true);
    expect(dialScale(1, 0).showLabel).toBe(true);
  });

  it('accounts for the rejection shrink when judging the label size', () => {
    expect(dialScale(0.8, 0, 1).showLabel).toBe(true);
    expect(dialScale(0.8, 0, 0.6).showLabel).toBe(false);
  });

  it('hover lifts a small dial to its default size and forces the label', () => {
    const small = dialScale(0.3, 0);
    expect(small.showLabel).toBe(false);
    const hovered = dialScale(0.3, 1);
    expect(hovered.zs).toBe(1);
    expect(hovered.showLabel).toBe(true);
  });

  it('hover never shrinks a dial that is already bigger than the default', () => {
    for (const t of [0, 0.25, 0.5, 1]) expect(dialScale(1.4, t).zs).toBe(1.4);
  });

  it('grows monotonically while the hover tween runs', () => {
    const sizes = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => dialScale(0.3, t).zs);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
  });
});

describe('dialHoverStep', () => {
  it('eases 0 -> 1 over DIAL_HOVER_MS while hovered', () => {
    let t = 0;
    t = dialHoverStep(t, true, DIAL_HOVER_MS / 2, false);
    expect(t).toBeCloseTo(0.5);
    t = dialHoverStep(t, true, DIAL_HOVER_MS, false);
    expect(t).toBe(1);
  });

  it('eases back to 0 when the pointer leaves', () => {
    let t = 1;
    t = dialHoverStep(t, false, DIAL_HOVER_MS / 4, false);
    expect(t).toBeCloseTo(0.75);
    t = dialHoverStep(t, false, DIAL_HOVER_MS, false);
    expect(t).toBe(0);
  });

  it('jumps instantly under reduced motion', () => {
    expect(dialHoverStep(0, true, 1, true)).toBe(1);
    expect(dialHoverStep(1, false, 1, true)).toBe(0);
  });

  it('ignores a negative delta', () => {
    expect(dialHoverStep(0.5, true, -50, false)).toBe(0.5);
  });
});

describe('dial touch hit test', () => {
  const dials = [
    { key: 'a', cx: 100, cy: 100, r: 7 },
    { key: 'b', cx: 110, cy: 100, r: 7 },
    { key: 'big', cx: 300, cy: 300, r: 40 },
  ];

  it('scales the radius with zoom and reject shrink', () => {
    expect(dialRadiusPx(1)).toBeCloseTo(27.5);
    expect(dialRadiusPx(0.22)).toBeCloseTo(6.05);
    expect(dialRadiusPx(1, 0.6)).toBeCloseTo(16.5);
  });

  it('hits a tiny dial only on its drawn disc, so the tile under it stays tappable', () => {
    expect(pickTappedDial({ x: 100, y: 106 }, [dials[0]])).toBe('a');
    expect(pickTappedDial({ x: 100, y: 108 }, [dials[0]])).toBeNull();
  });

  it('hits a big dial anywhere on its drawn disc', () => {
    expect(pickTappedDial({ x: 335, y: 300 }, dials)).toBe('big');
    expect(pickTappedDial({ x: 345, y: 300 }, dials)).toBeNull();
  });

  it('picks the nearest centre when several dials are hit', () => {
    expect(pickTappedDial({ x: 104, y: 100 }, dials)).toBe('a');
    expect(pickTappedDial({ x: 106, y: 100 }, dials)).toBe('b');
  });

  it('returns null with no dials', () => {
    expect(pickTappedDial({ x: 0, y: 0 }, [])).toBeNull();
  });
});

describe('nextTapReveal', () => {
  it('reveals a tapped dial', () => expect(nextTapReveal(null, 'a')).toBe('a'));
  it('switches to another tapped dial', () => expect(nextTapReveal('a', 'b')).toBe('b'));
  it('closes the revealed dial when tapped again', () => expect(nextTapReveal('a', 'a')).toBeNull());
  it('closes on a tap elsewhere', () => expect(nextTapReveal('a', null)).toBeNull());
});
