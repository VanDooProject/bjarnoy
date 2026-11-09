import { describe, expect, it } from 'vitest';

import { isoTopPoints } from '../hex/geometry';
import { insetBorderCorners, splitBorderEdges } from './realmBorderEdges';

const ALL_EDGES: [number, number][] = [0, 1, 2, 3, 4, 5].map((i) => [i, (i + 1) % 6]);

describe('splitBorderEdges', () => {
  it('puts the upper-left, top and upper-right edges at the back', () => {
    expect(splitBorderEdges(ALL_EDGES).back).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('puts the lower-right, bottom and lower-left edges at the front', () => {
    expect(splitBorderEdges(ALL_EDGES).front).toEqual([
      [3, 4],
      [4, 5],
      [5, 0],
    ]);
  });

  it('agrees with the geometry: every front edge lies below every back edge', () => {
    const pts = isoTopPoints(200, 100);
    const midY = ([a, b]: [number, number]) => (pts[a].y + pts[b].y) / 2;
    const { back, front } = splitBorderEdges(ALL_EDGES);
    expect(Math.max(...back.map(midY))).toBeLessThan(Math.min(...front.map(midY)));
  });

  it('keeps a partial realm outline intact and loses no edge', () => {
    const partial: [number, number][] = [
      [1, 2],
      [4, 5],
    ];
    const { back, front } = splitBorderEdges(partial);
    expect(back).toEqual([[1, 2]]);
    expect(front).toEqual([[4, 5]]);
  });
});

describe('insetBorderCorners', () => {
  const top = isoTopPoints(168, 77);
  const centre = { x: 84, y: 38.5 };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  it('moves every corner of a lone hex towards its centre', () => {
    const inset = insetBorderCorners(top, [false, false, false, false, false, false], 0.1);
    inset.forEach((p, k) => {
      expect(p).not.toBeNull();
      expect(dist(p!, centre)).toBeCloseTo(dist(top[k], centre) * 0.9, 6);
    });
  });

  it('leaves no corner on the outline where both its neighbours belong to the realm', () => {
    const inset = insetBorderCorners(top, [true, true, true, true, true, true]);
    expect(inset.every((p) => p === null)).toBe(true);
  });

  it('moves a concave corner away from the neighbour that is not the realm\'s', () => {
    // Edges 0 and 1 face realm hexes; corner 1 sits between them (both owned: not on the outline), corner 0 between edge 5 (not owned) and 0.
    const owned = [true, true, false, false, false, false];
    const inset = insetBorderCorners(top, owned, 0.1);
    expect(inset[1]).toBeNull();
    // Corner 2: edge 1 owned, edge 2 not -> concave, pushed away from the neighbour across edge 2 (mirror of the centre over edge 2).
    const outside = { x: top[2].x + top[3].x - centre.x, y: top[2].y + top[3].y - centre.y };
    expect(dist(inset[2]!, outside)).toBeGreaterThan(dist(top[2], outside));
    expect(inset[2]!.x - top[2].x).toBeCloseTo(0.1 * (top[2].x - outside.x), 6);
    expect(inset[2]!.y - top[2].y).toBeCloseTo(0.1 * (top[2].y - outside.y), 6);
    // Corner 0: edge 5 not owned, edge 0 owned -> concave too, pushed away from the neighbour across edge 5.
    const outside5 = { x: top[5].x + top[0].x - centre.x, y: top[5].y + top[0].y - centre.y };
    expect(inset[0]!.x - top[0].x).toBeCloseTo(0.1 * (top[0].x - outside5.x), 6);
  });

  it('gives two realms that share an edge parallel, separate lines', () => {
    // Hex A's edge 3 (right) is shared with hex B's edge 0 (left). Neither realm owns the other's hex.
    const topA = top;
    // Neighbour across edge 3 of A is the mirror image: centre = 2 * midpoint(edge 3) - centre.
    const mid = { x: (top[3].x + top[4].x) / 2, y: (top[3].y + top[4].y) / 2 };
    const shift = { x: 2 * (mid.x - centre.x), y: 2 * (mid.y - centre.y) };
    const topB = top.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y }));
    const insetA = insetBorderCorners(topA, [false, false, false, false, false, false]);
    const insetB = insetBorderCorners(topB, [false, false, false, false, false, false]);
    // A's edge 3 is corners 3 -> 4; B's matching edge is corners 0 -> 1.
    const a0 = insetA[3]!;
    const a1 = insetA[4]!;
    const b0 = insetB[0]!;
    const b1 = insetB[1]!;
    const dir = { x: topA[4].x - topA[3].x, y: topA[4].y - topA[3].y };
    const cross = (u: { x: number; y: number }, v: { x: number; y: number }) => u.x * v.y - u.y * v.x;
    // Parallel to the shared edge on both sides.
    expect(cross(dir, { x: a1.x - a0.x, y: a1.y - a0.y })).toBeCloseTo(0, 6);
    expect(cross(dir, { x: b1.x - b0.x, y: b1.y - b0.y })).toBeCloseTo(0, 6);
    // Both lines sit off the shared edge, on opposite sides, with a gap between them.
    const len = Math.hypot(dir.x, dir.y);
    const side = (p: { x: number; y: number }) => cross(dir, { x: p.x - topA[3].x, y: p.y - topA[3].y }) / len;
    expect(Math.sign(side(a0))).not.toBe(Math.sign(side(b1)));
    expect(Math.abs(side(a0) - side(b1))).toBeGreaterThan(2.5);
  });
});
