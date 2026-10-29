import { describe, expect, it } from 'vitest';
import { bogEdgeShapes, bogEdgesOf, isBogGround, bogEdgeNeighbour, BOG_EDGE_STYLES } from './bogEdge';
import type { BogTile, Terrain, Tile } from './types';

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
const noRiver = () => false;
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

  it('leaves the edge to a river hex alone, though the river runs on grass terrain', () => {
    // Regression: river hexes are `terrain: 'grass'` with their water in the river art, so the moss lobes and rim
    // used to be drawn out over the river.
    const get = world(tile(0, 0, 'bog', 'bog'), Array(6).fill('grass'));
    const isRiver = (q: number, r: number) => q === 1 && r === 0;
    expect(bogEdgesOf(get, isRiver, origin).map((e) => e.edge)).not.toContain(3);
    expect(bogEdgesOf(get, isRiver, origin)).toHaveLength(5);
  });

  it('does not treat a bog hex as grass even when its terrain reads grass', () => {
    expect(bogEdgeNeighbour(tile(0, 0, 'grass', 'creek'), false)).toBeNull();
    expect(isBogGround(tile(0, 0, 'grass', 'creek'))).toBe(true);
  });
});

describe('bogEdgeShapes', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };
  const out = { x: 0, y: 1 };

  it('draws nothing when off', () => {
    expect(bogEdgeShapes('off', a, b, out, [1, 2, 3])).toEqual([]);
  });

  it('gives the same edge the same shape on every rebuild, and another edge a different one', () => {
    for (const style of BOG_EDGE_STYLES) {
      expect(bogEdgeShapes(style, a, b, out, [4, 5, 0])).toEqual(bogEdgeShapes(style, a, b, out, [4, 5, 0]));
    }
    expect(bogEdgeShapes('lobes', a, b, out, [4, 5, 0])).not.toEqual(bogEdgeShapes('lobes', a, b, out, [4, 5, 1]));
  });

  it('pushes the lobes onto the grass side only, a bounded distance', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const shape of bogEdgeShapes('lobesRim', a, b, out, [seed, -seed, seed % 6])) {
        for (const p of shape.points) {
          expect(p.y).toBeGreaterThanOrEqual(-2.001);
          expect(p.y).toBeLessThanOrEqual(17);
        }
      }
    }
  });

  it('draws the rim under the moss so it only shows on the outside', () => {
    const shapes = bogEdgeShapes('lobesRim', a, b, out, [1, 1, 1]);
    expect(shapes.some((s) => s.under && s.stroke)).toBe(true);
    expect(shapes.filter((s) => !s.under).every((s) => s.fill && !s.stroke)).toBe(true);
  });

  it('draws the straight border exactly on the hex edge, in the given colour', () => {
    const shapes = bogEdgeShapes('straight', a, b, out, [1, 1, 1], 0x123456);
    expect(shapes.every((s) => s.points.length === 2 && s.points[0] === a && s.points[1] === b)).toBe(true);
    expect(shapes.some((s) => s.stroke?.color === 0x123456)).toBe(true);
  });
});
