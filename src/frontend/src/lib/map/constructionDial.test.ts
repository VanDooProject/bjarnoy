import { describe, expect, it } from 'vitest';
import type { BuildOrderResponse } from '../../api/types';
import { makePendingOrder } from '../hud/pendingBuild';
import {
  rejectDialAt,
  skipHudOwnedDials,
  dialPhase,
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
  hexPerimeterSegment,
  pendingDotFrame,
  polygonPerimeterPath,
  polylinePartial,
  retainFinishingDials,
  dialRadiusPx,
  pickTappedDial,
  nextTapReveal,
  type ConstructionDial,
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

describe('constructionDialsFromQueue states', () => {
  it('maps building, queued and pending orders to their dial state', () => {
    const dials = constructionDialsFromQueue(
      [order({ q: 1, id: 'a' }), order({ q: 2, id: 'b', state: 'waiting' }), { ...makePendingOrder('house', { q: 3, r: 0 }) }],
      0,
    );
    expect(dials.map((d) => d.state)).toEqual(['building', 'queued', 'pending']);
  });

  it('numbers queued dials in queue order and skips pending orders', () => {
    const dials = constructionDialsFromQueue(
      [
        order({ q: 1, id: 'a', state: 'waiting' }),
        makePendingOrder('house', { q: 9, r: 0 }),
        order({ q: 2, id: 'b', state: 'building' }),
        order({ q: 3, id: 'c', state: 'waiting' }),
      ],
      0,
    );
    expect(dials.map((d) => [d.coord.q, d.queuePosition])).toEqual([
      [1, 1],
      [9, null],
      [2, null],
      [3, 2],
    ]);
  });

  it('lets a building order win over a pending or queued one on the same hex', () => {
    for (const other of [makePendingOrder('house', { q: 0, r: 0 }), order({ id: 'w', state: 'waiting' })]) {
      for (const queue of [[other, order({ id: 'b' })], [order({ id: 'b' }), other]]) {
        const dials = constructionDialsFromQueue(queue, 0);
        expect(dials).toHaveLength(1);
        expect(dials[0]).toMatchObject({ state: 'building', queuePosition: null });
      }
    }
  });
});

describe('hexPerimeterSegment', () => {
  it('starts at vertex 0 and ends mid-edge for a span shorter than one edge', () => {
    const seg = hexPerimeterSegment(0, 0, 10, 0, 1 / 12);
    const v1 = hexPerimeterPath(0, 0, 10, 1 / 6);
    expect(seg).toHaveLength(4);
    expect(seg[0]).toBeCloseTo(0);
    expect(seg[1]).toBeCloseTo(-10);
    expect(seg[2]).toBeCloseTo(v1[2] / 2);
    expect(seg[3]).toBeCloseTo((v1[3] - 10) / 2);
  });

  it('matches hexPerimeterPath when it starts at 0', () => {
    const seg = hexPerimeterSegment(3, 4, 10, 0, 0.5);
    const path = hexPerimeterPath(3, 4, 10, 0.5);
    expect(seg).toHaveLength(path.length);
    seg.forEach((v, i) => expect(v).toBeCloseTo(path[i]));
  });

  it('wraps past vertex 0 and passes through it', () => {
    const seg = hexPerimeterSegment(0, 0, 10, 11 / 12, 13 / 12);
    expect(seg).toHaveLength(6);
    // middle point is vertex 0 (top)
    expect(seg[2]).toBeCloseTo(0);
    expect(seg[3]).toBeCloseTo(-10);
    // starts mid last edge (vertex 5 -> vertex 0), ends mid first edge
    const v5 = hexPerimeterPath(0, 0, 10, 5 / 6);
    expect(seg[0]).toBeCloseTo(v5[v5.length - 2] / 2);
    expect(seg[1]).toBeCloseTo((v5[v5.length - 1] - 10) / 2);
  });

  it('is empty for a non-positive span', () => {
    expect(hexPerimeterSegment(0, 0, 10, 0.5, 0.5)).toEqual([]);
  });
});

describe('pendingDotFrame', () => {
  it('lifts and brightens a dot at the peak of its bounce', () => {
    // Dot 0 peaks at a quarter of the 700 ms cycle.
    const f = pendingDotFrame(175, 0, false);
    expect(f.lift).toBeCloseTo(1.4);
    expect(f.alpha).toBeCloseTo(1);
  });

  it('rests low and dim in the second half of the cycle', () => {
    expect(pendingDotFrame(525, 0, false)).toEqual({ lift: 0, alpha: 0.5 });
  });

  it('delays each following dot by 0.18 of a cycle', () => {
    expect(pendingDotFrame(175 + 0.18 * 700, 1, false).lift).toBeCloseTo(1.4);
    expect(pendingDotFrame(175 + 2 * 0.18 * 700, 2, false).lift).toBeCloseTo(1.4);
  });

  it('keeps the dots still and fully opaque with reduced motion', () => {
    expect(pendingDotFrame(175, 0, true)).toEqual({ lift: 0, alpha: 1 });
  });
});

describe('dialProgress', () => {
  const d = { coord: { q: 0, r: 0 }, startMs: 1000, endMs: 3000, state: 'building' as const, queuePosition: null };
  it('is 0 at start, 0.5 mid, 1 at end and clamps outside', () => {
    expect(dialProgress(d, 1000)).toBe(0);
    expect(dialProgress(d, 2000)).toBe(0.5);
    expect(dialProgress(d, 3000)).toBe(1);
    expect(dialProgress(d, 0)).toBe(0);
    expect(dialProgress(d, 9999)).toBe(1);
  });
  it('is 0 without timing', () => {
    expect(dialProgress({ coord: { q: 0, r: 0 }, startMs: null, endMs: null, state: 'pending' as const, queuePosition: null }, 5)).toBe(0);
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
  const d = { coord: { q: 0, r: 0 }, startMs: 1000, endMs: 3000, state: 'building' as const, queuePosition: null };
  it('counts down and clamps at 0', () => {
    expect(dialRemainingSeconds(d, 1000)).toBe(2);
    expect(dialRemainingSeconds(d, 2500)).toBe(0.5);
    expect(dialRemainingSeconds(d, 9000)).toBe(0);
  });
  it('is null without timing', () => {
    expect(dialRemainingSeconds({ coord: { q: 0, r: 0 }, startMs: null, endMs: null, state: 'pending' as const, queuePosition: null }, 5)).toBeNull();
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
  const dial = (q: number, endMs: number | null): ConstructionDial => ({
    coord: { q, r: 0 },
    startMs: endMs === null ? null : endMs - 10_000,
    endMs,
    state: endMs === null ? 'pending' : 'building',
    queuePosition: null,
  });
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
  it('shakes through seven keyframes over 420 ms: 0, -6, 6, -5, 5, -3, 0', () => {
    for (const [i, x] of [0, -6, 6, -5, 5, -3].entries()) expect(dialRejectFrame(i * 70, false)!.offsetX).toBeCloseTo(x);
    expect(dialRejectFrame(419.99, false)!.offsetX).toBeCloseTo(0, 1);
    expect(dialRejectFrame(35, false)!.offsetX).toBeCloseTo(-3);
    expect(dialRejectFrame(420, false)!.offsetX).toBe(0);
  });

  it('pops to 1.12 at 150 ms, back to 1 at 400 ms; flash peaks at 150 ms and settles at .35 from 500 ms', () => {
    expect(dialRejectFrame(0, false)).toMatchObject({ scale: 1, flash: 0, cross: 0, alpha: 1 });
    expect(dialRejectFrame(150, false)!.scale).toBeCloseTo(1.12);
    expect(dialRejectFrame(275, false)!.scale).toBeCloseTo(1.06);
    expect(dialRejectFrame(400, false)!.scale).toBeCloseTo(1);
    expect(dialRejectFrame(150, false)!.flash).toBeCloseTo(1);
    expect(dialRejectFrame(325, false)!.flash).toBeCloseTo(0.675);
    expect(dialRejectFrame(500, false)!.flash).toBeCloseTo(0.35);
    expect(dialRejectFrame(1000, false)!.flash).toBeCloseTo(0.35);
  });

  it('draws the cross between 150 and 450 ms', () => {
    expect(dialRejectFrame(150, false)!.cross).toBe(0);
    expect(dialRejectFrame(300, false)!.cross).toBeCloseTo(0.5);
    expect(dialRejectFrame(450, false)!.cross).toBe(1);
    expect(dialRejectFrame(1200, false)!.cross).toBe(1);
  });

  it('sends two rings from 0 and 160 ms that each last 700 ms', () => {
    expect(dialRejectFrame(0, false)!.rings).toHaveLength(1);
    expect(dialRejectFrame(0, false)!.rings[0]).toEqual({ scale: 1, alpha: 0.9 });
    expect(dialRejectFrame(350, false)!.rings).toHaveLength(2);
    expect(dialRejectFrame(350, false)!.rings[0].scale).toBeCloseTo(1 + 1.1 * 0.75);
    expect(dialRejectFrame(350, false)!.rings[0].alpha).toBeCloseTo(0.45);
    expect(dialRejectFrame(750, false)!.rings).toHaveLength(1);
    expect(dialRejectFrame(900, false)!.rings).toEqual([]);
  });

  it('holds full opacity until 1150 ms, then fades and shrinks by 40 % to the end', () => {
    expect(dialRejectFrame(1150, false)).toMatchObject({ scale: 1, alpha: 1 });
    const mid = dialRejectFrame(1325, false)!;
    expect(mid.alpha).toBeCloseTo(0.5);
    expect(mid.scale).toBeCloseTo(0.8);
    const end = dialRejectFrame(DIAL_REJECT_MS - 0.01, false)!;
    expect(end.scale).toBeCloseTo(0.6, 2);
    expect(end.alpha).toBeCloseTo(0, 2);
  });

  it('with reduced motion has no shake, pop or rings but keeps flash, cross and fade', () => {
    for (const s of [0, 70, 150, 300]) {
      const f = dialRejectFrame(s, true)!;
      expect(f.offsetX).toBe(0);
      expect(f.scale).toBe(1);
      expect(f.rings).toEqual([]);
    }
    expect(dialRejectFrame(150, true)!.flash).toBeCloseTo(1);
    expect(dialRejectFrame(450, true)!.cross).toBe(1);
    expect(dialRejectFrame(1325, true)!.alpha).toBeCloseTo(0.5);
  });

  it('is null before the rejection and once it has played', () => {
    expect(dialRejectFrame(-1, false)).toBeNull();
    expect(dialRejectFrame(DIAL_REJECT_MS, false)).toBeNull();
    expect(DIAL_REJECT_MS).toBe(1500);
  });
});

describe('retainFinishingDials with a rejected dial', () => {
  const rejected = { coord: { q: 1, r: 1 }, startMs: null, endMs: null, state: 'pending' as const, queuePosition: null, rejectedAtMs: 1000 };

  it('keeps a rejected dial after its pending order left the queue, until its animation is over', () => {
    expect(retainFinishingDials([rejected], [], 1200)).toEqual([rejected]);
    expect(retainFinishingDials([rejected], [], 1000 + DIAL_REJECT_MS)).toEqual([]);
  });

  it('drops it when a real order now stands on that hex', () => {
    const real = { coord: { q: 1, r: 1 }, startMs: 0, endMs: 99_999, state: 'building' as const, queuePosition: null };
    expect(retainFinishingDials([rejected], [real], 1200)).toEqual([real]);
  });

  it('still drops an ordinary dial with unknown timing (a cancelled order)', () => {
    expect(retainFinishingDials([{ coord: { q: 2, r: 2 }, startMs: null, endMs: null, state: 'pending' as const, queuePosition: null }], [], 1200)).toEqual([]);
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

describe('rejectDialAt', () => {
  const at = { q: 1, r: 2 };
  const other = { coord: { q: 0, r: 0 }, startMs: 0, endMs: 1000, state: 'building' as const, queuePosition: null };

  it('turns the pending dial of the refused order into a rejected one and keeps the other hexes', () => {
    const dials = [other, { coord: at, startMs: null, endMs: null, state: 'pending' as const, queuePosition: null }];
    expect(rejectDialAt(dials, at, 500)).toEqual([other, { coord: at, startMs: null, endMs: null, state: 'pending' as const, queuePosition: null, rejectedAtMs: 500 }]);
  });

  it('adds a rejected dial when the pending dial is already gone', () => {
    expect(rejectDialAt([other], at, 500)).toEqual([other, { coord: at, startMs: null, endMs: null, state: 'pending' as const, queuePosition: null, rejectedAtMs: 500 }]);
  });

  it('keeps a running build on the hex (an upgrade refused behind it) instead of replacing it', () => {
    const running = { coord: at, startMs: 0, endMs: 9000, state: 'building' as const, queuePosition: null };
    expect(rejectDialAt([other, running], at, 500)).toEqual([other, running]);
  });
});

describe('skipHudOwnedDials', () => {
  const dial = (q: number, over: Partial<ConstructionDial> = {}): ConstructionDial => ({
    coord: { q, r: 0 },
    startMs: 0,
    endMs: 10_000,
    state: 'building',
    queuePosition: null,
    ...over,
  });

  it('draws every dial while building info is off', () => {
    const dials = [dial(1), dial(2)];
    expect(skipHudOwnedDials(dials, null)).toBe(dials);
    expect(skipHudOwnedDials(dials, new Set())).toBe(dials);
  });

  it('skips every dial on a hex with a marker, whatever state it is in, and keeps the hexes without one', () => {
    const running = dial(1);
    const queued = dial(2, { startMs: null, endMs: null, state: 'queued', queuePosition: 1 });
    const pending = dial(3, { startMs: null, endMs: null, state: 'pending' });
    const finishing = dial(4, { endMs: 4_000 });
    const rejected = dial(5, { startMs: null, endMs: null, state: 'pending', rejectedAtMs: 100 });
    const newBuild = dial(6);
    const owned = new Set(['1,0', '2,0', '3,0', '4,0', '5,0']);
    expect(skipHudOwnedDials([running, queued, pending, finishing, rejected, newBuild], owned)).toEqual([newBuild]);
  });
});

describe('dialPhase', () => {
  const base: ConstructionDial = { coord: { q: 1, r: 0 }, startMs: 0, endMs: 10_000, state: 'building', queuePosition: null };

  it('reads a running build as progress and time left', () => {
    expect(dialPhase(base, 2_500, false)).toEqual({ kind: 'building', progress: 0.25, remaining: 7.5 });
  });

  it('reads queued with its place and pending as such', () => {
    expect(dialPhase({ ...base, startMs: null, endMs: null, state: 'queued', queuePosition: 2 }, 0, false)).toEqual({ kind: 'queued', position: 2 });
    expect(dialPhase({ ...base, startMs: null, endMs: null, state: 'pending' }, 0, false)).toEqual({ kind: 'pending' });
  });

  it('plays the finish frame from the end on and is over after DIAL_FINISH_MS', () => {
    expect(dialPhase(base, 10_000 + 300, false)).toEqual({ kind: 'finish', frame: dialFinishFrame(300) });
    expect(dialPhase(base, 10_000 + DIAL_FINISH_MS, false)).toBeNull();
  });

  it('plays the rejection frame of a refused order and is over after DIAL_REJECT_MS', () => {
    const rejected: ConstructionDial = { ...base, startMs: null, endMs: null, state: 'pending', rejectedAtMs: 1_000 };
    expect(dialPhase(rejected, 1_200, true)).toEqual({ kind: 'reject', frame: dialRejectFrame(200, true) });
    expect(dialPhase(rejected, 1_000 + DIAL_REJECT_MS, false)).toBeNull();
  });
});
