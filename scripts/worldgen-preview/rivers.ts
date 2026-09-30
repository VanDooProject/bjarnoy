// The `rivers` layer's data: every green island's rivers, traced by the REAL generator
// (src/frontend/src/lib/map/riverGenerator.ts - the TypeScript twin of the backend's
// RiverGenerator, byte-identical on the golden fixtures) over the landmasses found the way the
// backend's WorldGenerator finds them, indexed the way it indexes them (landmasses ordered by
// lowest (q, r), specks under MinimumIslandTiles dropped).
import { coordKey, neighbors } from '../../src/frontend/src/lib/hex/coords';
import { generateRivers, emptyRiverStats, type RiverStats } from '../../src/frontend/src/lib/map/riverGenerator';
import { islandDepthAt, terrainAt, type WorldSeed } from '../../src/frontend/src/lib/map/worldGenerator';
import { TILE_ORIENTATIONS, type RiverTile } from '../../src/frontend/src/lib/map/types';
import { findLandmasses } from './landmasses';

const MINIMUM_ISLAND_TILES = 6; // WorldGenerationOptions.MinimumIslandTiles' default

export interface RiverField {
  tiles: Map<string, RiverTile>;
  islands: number;
  islandsWithRivers: number;
  stats: RiverStats;
  riverTiles: number;
  streamTiles: number;
  widenTiles: number;
  confluences: number;
  mouths: number;
  /** Rivers whose end is not a mouth touching the sea (must be 0). */
  inlandMouths: number;
  /** Adjacent river tiles (hex distance 1) that drain to different mouths: parallel runs that never merge. */
  parallelAdjacencies: number;
  ms: number;
}

export interface Window {
  q: number;
  r: number;
  size: number;
}

export function computeRivers(world: WorldSeed, window?: Window): RiverField {
  const started = performance.now();
  const { landmasses } = findLandmasses(world, false, true);
  const kept = landmasses.filter((l) => l.tiles >= MINIMUM_ISLAND_TILES);
  const isLand = (c: { q: number; r: number }) => terrainAt(c.q, c.r, world) !== 'sea';
  const stats = emptyRiverStats();
  const tiles = new Map<string, RiverTile>();
  let islandsWithRivers = 0;

  kept.forEach((island, index) => {
    const list = island.tileList!;
    if (window) {
      const reach = window.size; // generous: any island touching the window's box
      if (!list.some((t) => Math.abs(t.q - window.q) <= reach && Math.abs(t.r - window.r) <= reach)) return;
    }
    const rivers = generateRivers(
      list,
      (c) => terrainAt(c.q, c.r, world),
      (c) => islandDepthAt(c.q, c.r, world),
      isLand,
      world.seed,
      index,
      false,
      true,
      stats,
    );
    if (rivers.length > 0) islandsWithRivers++;
    for (const t of rivers) tiles.set(coordKey(t), t);
  });

  // Follow every river to its end: root = the tile it ends on.
  const rootOf = new Map<string, string>();
  const endOf = (t: RiverTile): RiverTile => {
    let cur = t;
    for (let guard = 0; cur.outDirection && guard < 100000; guard++) {
      const d = TILE_ORIENTATIONS.indexOf(cur.outDirection);
      const n = neighbors(cur)[d]!;
      const next = tiles.get(coordKey(n));
      if (!next) break;
      cur = next;
    }
    return cur;
  };
  let inlandMouths = 0;
  let mouths = 0;
  let confluences = 0;
  let streamTiles = 0;
  let widenTiles = 0;
  for (const t of tiles.values()) {
    if (t.shape === 'confluence') confluences++;
    if (t.width === 'stream') streamTiles++;
    if (t.width === 'widen') widenTiles++;
    if (t.shape === 'mouth') {
      mouths++;
      if (!neighbors(t).some((n) => !isLand(n))) inlandMouths++;
    }
    if (t.shape === 'spring') {
      const end = endOf(t);
      if (end.shape !== 'mouth' || !neighbors(end).some((n) => !isLand(n))) inlandMouths++;
    }
    rootOf.set(coordKey(t), coordKey(endOf(t)));
  }

  let parallel = 0;
  for (const t of tiles.values()) {
    const root = rootOf.get(coordKey(t))!;
    for (const n of neighbors(t)) {
      const other = tiles.get(coordKey(n));
      if (other && coordKey(n) > coordKey(t) && rootOf.get(coordKey(n)) !== root) parallel++;
    }
  }

  return {
    tiles,
    islands: kept.length,
    islandsWithRivers,
    stats,
    riverTiles: tiles.size,
    streamTiles,
    widenTiles,
    confluences,
    mouths,
    inlandMouths,
    parallelAdjacencies: parallel,
    ms: performance.now() - started,
  };
}

export function riverStatsLines(f: RiverField): string[] {
  const perIsland = f.islandsWithRivers > 0 ? (f.stats.rivers / f.islandsWithRivers).toFixed(1) : '0';
  return [
    `RIVERS ${f.stats.rivers} ON ${f.islandsWithRivers}/${f.islands} ISLANDS (${perIsland} PER ISLAND WITH RIVERS)  SPRINGS ${f.stats.springs}  TILES ${f.riverTiles} (STREAM ${f.streamTiles}  WIDEN ${f.widenTiles})`,
    `MERGES ${f.stats.merges}  WIDENINGS ${f.stats.widenings}  TRUNCATED BRANCHES ${f.stats.truncatedBranches}  DROPPED RIVERS ${f.stats.droppedRivers}  INLAND MOUTHS ${f.inlandMouths}`,
    `PARALLEL RUNS ${f.parallelAdjacencies} ADJACENT PAIRS OF DIFFERENT RIVERS (${f.riverTiles > 0 ? ((1000 * f.parallelAdjacencies) / f.riverTiles).toFixed(1) : '0'} PER 1000 TILES)  MS RIVERS ${f.ms.toFixed(0)}`,
  ];
}
