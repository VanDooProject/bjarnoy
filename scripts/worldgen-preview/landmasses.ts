// The landmasses of a world, found the way the backend's WorldGenerator does: scan each
// island cell's footprint box at stride 2 (even column / even row) for land, flood-fill every
// landmass found once. Uses the real terrain functions; cost scales with the land, not the radius.
import { oddQToAxial, neighbors } from '../../src/frontend/src/lib/hex/coords';
import {
  enumerateIslandShapes,
  terrainAt,
  wastedTerrainAt,
  type IslandShape,
  type WorldSeed,
} from '../../src/frontend/src/lib/map/worldGenerator';

export interface Landmass {
  tiles: number;
  /** Lowest (q, r) hex — how the backend orders islands. */
  lowest: { q: number; r: number };
  /** Bounding box of the landmass in axial (q, r), for drawing only the islands a window shows. */
  bounds: { minQ: number; maxQ: number; minR: number; maxR: number };
}

const key = (q: number, r: number) => `${q},${r}`;

export function findLandmasses(world: WorldSeed, wasted = false): { landmasses: Landmass[]; shapes: IslandShape[] } {
  const isLand = wasted
    ? (q: number, r: number) => wastedTerrainAt(q, r, world) !== 'sea'
    : (q: number, r: number) => terrainAt(q, r, world) !== 'sea';
  const shapes = enumerateIslandShapes(world, wasted);
  const visited = new Set<string>();
  const landmasses: Landmass[] = [];

  for (const shape of shapes) {
    const firstCol = shape.minCol + (shape.minCol & 1);
    const firstRow = shape.minRow + (shape.minRow & 1);
    for (let col = firstCol; col <= shape.maxCol; col += 2) {
      for (let row = firstRow; row <= shape.maxRow; row += 2) {
        const start = oddQToAxial({ col, row });
        if (visited.has(key(start.q, start.r)) || !isLand(start.q, start.r)) continue;

        let tiles = 1;
        let lowest = { q: start.q, r: start.r };
        const bounds = { minQ: start.q, maxQ: start.q, minR: start.r, maxR: start.r };
        visited.add(key(start.q, start.r));
        const stack = [start];
        const sea = new Set<string>();
        while (stack.length > 0) {
          const c = stack.pop()!;
          for (const n of neighbors(c)) {
            const k = key(n.q, n.r);
            if (visited.has(k) || sea.has(k)) continue;
            if (!isLand(n.q, n.r)) {
              sea.add(k);
              continue;
            }
            visited.add(k);
            tiles++;
            if (n.q < bounds.minQ) bounds.minQ = n.q;
            if (n.q > bounds.maxQ) bounds.maxQ = n.q;
            if (n.r < bounds.minR) bounds.minR = n.r;
            if (n.r > bounds.maxR) bounds.maxR = n.r;
            if (n.q < lowest.q || (n.q === lowest.q && n.r < lowest.r)) lowest = { q: n.q, r: n.r };
            stack.push(n);
          }
        }
        landmasses.push({ tiles, lowest, bounds });
      }
    }
  }
  landmasses.sort((a, b) => a.lowest.q - b.lowest.q || a.lowest.r - b.lowest.r);
  return { landmasses, shapes };
}

/** Size buckets of the size distribution line; the class ranges of the requirements page are among the edges. */
export const SIZE_BUCKETS: readonly { label: string; max: number }[] = [
  { label: '<100', max: 100 },
  { label: '100-1K', max: 1000 },
  { label: '1K-5K', max: 5000 },
  { label: '5K-15K', max: 15000 },
  { label: '15K-40K', max: 40000 },
  { label: '>40K', max: Infinity },
];

export function sizeDistribution(landmasses: readonly Landmass[]): { label: string; count: number }[] {
  const counts = SIZE_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const l of landmasses) counts[SIZE_BUCKETS.findIndex((b) => l.tiles < b.max)].count++;
  return counts;
}

/** Every land hex of the landmass containing `start`, in (q, r) order (a flood fill, like the backend's). */
export function landmassTiles(world: WorldSeed, wasted: boolean, start: { q: number; r: number }): { q: number; r: number }[] {
  const isLand = wasted
    ? (q: number, r: number) => wastedTerrainAt(q, r, world) !== 'sea'
    : (q: number, r: number) => terrainAt(q, r, world) !== 'sea';
  const seen = new Set<string>([key(start.q, start.r)]);
  const tiles = [{ q: start.q, r: start.r }];
  const stack = [{ q: start.q, r: start.r }];
  while (stack.length > 0) {
    const c = stack.pop()!;
    for (const n of neighbors(c)) {
      const k = key(n.q, n.r);
      if (seen.has(k) || !isLand(n.q, n.r)) continue;
      seen.add(k);
      tiles.push({ q: n.q, r: n.r });
      stack.push({ q: n.q, r: n.r });
    }
  }
  tiles.sort((a, b) => a.q - b.q || a.r - b.r);
  return tiles;
}
