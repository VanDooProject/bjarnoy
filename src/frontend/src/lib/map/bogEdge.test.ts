import { describe, expect, it } from 'vitest';
import {
  bogEdgeShapes,
  bogEdgesOf,
  isBogGround,
  bogEdgeNeighbour,
  FOREST_GROUND,
  RIVER_EDGE_GAP,
  STREAM_EDGE_GAP,
} from './bogEdge';
import type { BogTile, RiverTile, Terrain, Tile } from './types';

function tile(q: number, r: number, terrain: Terrain, bog?: BogTile['kind']): Tile {
  const t = { q, r, terrain } as Tile;
  if (bog) t.bog = { q, r, kind: bog, inDirections: [], outDirection: null, waterEdges: [] };
  return t;
}

// A bog hex at the origin; its six neighbours in `neighbors()` order: E, NE, NW, W, SW, SE.
const NEIGHBOURS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

function world(centre: Tile, around: Terrain[]): (q: number, r: number) => Tile {
  return (q, r) => {
    if (q === 0 && r === 0) return centre;
    const i = NEIGHBOURS.findIndex(([dq, dr]) => dq === q && dr === r);
    return tile(q, r, i >= 0 ? around[i] : 'sea');
  };
}
const noRiver = () => undefined;
const origin = { q: 0, r: 0 };

describe('bogEdgesOf', () => {
  it('borders only the edges facing grass or forest, on their shared top-face edge', () => {
    const get = world(tile(0, 0, 'bog', 'bog'), ['grass', 'bog', 'forest', 'lake', 'sand', 'mountain']);
    // E -> polygon edge 3, NW -> polygon edge 1 (EDGE_FOR_DIR, see types.ts).
    expect(bogEdgesOf(get, noRiver, origin)).toEqual([
      { edge: 3, neighbour: 'grass' },
      { edge: 1, neighbour: 'forest' },
    ]);
  });

  it('borders a bog shore hex too, but never the open lake or plain grass', () => {
    const grass: Terrain[] = Array(6).fill('grass');
    expect(bogEdgesOf(world(tile(0, 0, 'bog', 'half'), grass), noRiver, origin)).toHaveLength(6);
    expect(bogEdgesOf(world(tile(0, 0, 'lake', 'lake'), grass), noRiver, origin)).toEqual([]);
    expect(bogEdgesOf(world(tile(0, 0, 'grass'), grass), noRiver, origin)).toEqual([]);
  });

  // The river hex sits east of the bog (direction 0, polygon edge 3), so it reaches the bog towards its own west.
  const get = world(tile(0, 0, 'bog', 'bog'), Array(6).fill('grass'));
  const riverEast = (river: Partial<RiverTile>) => (q: number, r: number) =>
    q === 1 && r === 0 ? ({ q, r, shape: 'straight', inDirections: [], outDirection: null, ...river } as RiverTile) : undefined;
  const eastEdge = (getRiver: ReturnType<typeof riverEast>) => bogEdgesOf(get, getRiver, origin).find((e) => e.edge === 3);

  it('leaves the river water on a shared edge bare, but borders its banks', () => {
    // Regression: river hexes are `terrain: 'grass'` with their water in the river art, so the moss lobes and rim
    // used to be drawn out over the river where it flows into the bog.
    expect(eastEdge(riverEast({ inDirections: ['E'], outDirection: 'W' }))?.gap).toEqual(RIVER_EDGE_GAP);
    expect(eastEdge(riverEast({ inDirections: ['W'], outDirection: 'E', width: 'stream' }))?.gap).toEqual(STREAM_EDGE_GAP);
  });

  it('borders a river hex edge the water does not cross like any grass edge', () => {
    expect(eastEdge(riverEast({ inDirections: ['NE'], outDirection: 'SW' }))).toEqual({ edge: 3, neighbour: 'grass' });
  });

  it('takes the stream width on the stream arm of a mixed river tile', () => {
    expect(eastEdge(riverEast({ inDirections: ['W'], outDirection: 'E', width: 'widen' }))?.gap).toEqual(STREAM_EDGE_GAP);
    expect(eastEdge(riverEast({ inDirections: ['E'], outDirection: 'W', width: 'widen' }))?.gap).toEqual(RIVER_EDGE_GAP);
    expect(eastEdge(riverEast({ inDirections: ['W', 'NE'], outDirection: 'E', width: 'riverstream' }))?.gap).toEqual(STREAM_EDGE_GAP);
    expect(eastEdge(riverEast({ inDirections: ['NE', 'W'], outDirection: 'E', width: 'riverstream' }))?.gap).toEqual(RIVER_EDGE_GAP);
  });

  it('marks the corner where the border switches between grass and forest as flush, on both edges', () => {
    // E (polygon edge 3) faces grass, NE (polygon edge 2) faces forest: they share the corner between polygon edges 2
    // and 3, i.e. the end of edge 2 and the start of edge 3. The other corners keep their caps.
    const mixed = world(tile(0, 0, 'bog', 'bog'), ['grass', 'forest', 'sea', 'sea', 'sea', 'sea']);
    const edges = bogEdgesOf(mixed, noRiver, origin);
    expect(edges.find((e) => e.edge === 3)).toMatchObject({ neighbour: 'grass', flushStart: true });
    expect(edges.find((e) => e.edge === 3)?.flushEnd).toBeUndefined();
    expect(edges.find((e) => e.edge === 2)).toMatchObject({ neighbour: 'forest', flushEnd: true });
    expect(edges.find((e) => e.edge === 2)?.flushStart).toBeUndefined();
  });

  it('marks the switch corner flush when the border carries on along a neighbouring bog hex', () => {
    // E faces grass, NE is bog: past the shared corner the border runs between that bog hex and the same grass hex,
    // so it stays grass and the corner is not flush.
    const sameKind = world(tile(0, 0, 'bog', 'bog'), ['grass', 'bog', 'sea', 'sea', 'sea', 'sea']);
    expect(bogEdgesOf(sameKind, noRiver, origin)).toEqual([{ edge: 3, neighbour: 'grass' }]);
  });

  it('does not treat a bog hex as grass even when its terrain reads grass', () => {
    expect(bogEdgeNeighbour(tile(0, 0, 'grass', 'creek'))).toBeNull();
    expect(isBogGround(tile(0, 0, 'grass', 'creek'))).toBe(true);
  });
});

describe('bogEdgeShapes', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };
  const out = { x: 0, y: 1 };
  const NEIGHBOURS_KINDS = ['grass', 'forest'] as const;

  it('gives the same edge the same shape on every rebuild, and another edge a different one', () => {
    for (const n of NEIGHBOURS_KINDS) {
      expect(bogEdgeShapes(n, a, b, out, [4, 5, 0])).toEqual(bogEdgeShapes(n, a, b, out, [4, 5, 0]));
      expect(bogEdgeShapes(n, a, b, out, [4, 5, 0])).not.toEqual(bogEdgeShapes(n, a, b, out, [4, 5, 1]));
    }
  });

  it('pushes moss onto the grass side, a bounded distance', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const shape of bogEdgeShapes('grass', a, b, out, [seed, -seed, seed % 6])) {
        for (const p of shape.points) {
          expect(p.y).toBeGreaterThanOrEqual(-2.001);
          expect(p.y).toBeLessThanOrEqual(17);
        }
      }
    }
  });

  it('pushes the forest ground into the bog instead, with no rim and no moss on the forest', () => {
    // Moss on the forest's darker ground reads as the wrong colour, so a forest edge reaches the other way.
    for (let seed = 0; seed < 50; seed++) {
      const shapes = bogEdgeShapes('forest', a, b, out, [seed, -seed, seed % 6]);
      expect(shapes.every((s) => s.fill?.color === FOREST_GROUND && !s.stroke && !s.under)).toBe(true);
      for (const p of shapes.flatMap((s) => s.points)) {
        expect(p.y).toBeLessThanOrEqual(2.001);
        expect(p.y).toBeGreaterThanOrEqual(-17);
      }
    }
  });

  it('draws the rim under the moss so it only shows on the outside', () => {
    const shapes = bogEdgeShapes('grass', a, b, out, [1, 1, 1]);
    expect(shapes.some((s) => s.under && s.stroke)).toBe(true);
    expect(shapes.filter((s) => !s.under).every((s) => s.fill && !s.stroke)).toBe(true);
  });

  it('runs both sides of a grass/forest switch corner into the hex corner itself, with no cap', () => {
    // Regression: the grass rim ended a corner cap's reach outside the corner and the forest lobes a cap's reach
    // inside it, so the two outlines missed each other.
    for (const n of NEIGHBOURS_KINDS) {
      const shapes = bogEdgeShapes(n, a, b, out, [2, 2, 2], undefined, false, true);
      const outline = shapes.find((s) => s.points.length > 15)!.points;
      const end = outline[18];
      expect(end.x).toBeCloseTo(100, 6);
      expect(end.y).toBeCloseTo(0, 6);
      // A cap is a fan centred on its corner; the flush end gets none.
      expect(shapes.some((s) => s.points[0] === b)).toBe(false);
      expect(shapes.some((s) => s.points[0] === a)).toBe(true);
    }
  });

  it('leaves the water gap bare, and tapers the moss to nothing at the water', () => {
    for (const n of NEIGHBOURS_KINDS) {
      for (const shape of bogEdgeShapes(n, a, b, out, [3, 3, 3], RIVER_EDGE_GAP)) {
        for (const p of shape.points) expect(p.x <= 17.001 || p.x >= 82.999, `${n} at ${p.x}`).toBe(true);
      }
    }
    const lobe = bogEdgeShapes('grass', a, b, out, [3, 3, 3], RIVER_EDGE_GAP).find((s) => !s.under && s.points.length > 15)!;
    const atWater = lobe.points.find((p) => Math.abs(p.x - 17) < 1e-6 && p.y >= 0)!;
    expect(atWater.y).toBeCloseTo(0, 6);
  });
});
