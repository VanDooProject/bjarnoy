// The `rivers` layer's data: every green island's rivers, traced by the REAL generator
// (src/frontend/src/lib/map/riverGenerator.ts - the TypeScript twin of the backend's
// RiverGenerator, byte-identical on the golden fixtures) over the landmasses found the way the
// backend's WorldGenerator finds them, indexed the way it indexes them (landmasses ordered by
// lowest (q, r), specks under MinimumIslandTiles dropped).
import { coordKey, neighbors } from '../../src/frontend/src/lib/hex/coords';
import { generateRiversWithBogs, emptyRiverStats, type RiverStats } from '../../src/frontend/src/lib/map/riverGenerator';
import { addViolations, checkBogRules, noViolations, type BogRuleViolations } from '../../src/frontend/src/lib/map/bogRules';
import { bogWaterExits, lakeSizes } from './bogs';
import { islandDepthAt, terrainAt, type WorldSeed } from '../../src/frontend/src/lib/map/worldGenerator';
import { TILE_ORIENTATIONS, type BogTile, type RiverTile } from '../../src/frontend/src/lib/map/types';
import { findLandmasses } from './landmasses';

const MINIMUM_ISLAND_TILES = 6; // WorldGenerationOptions.MinimumIslandTiles' default

/** One island's bogland, for the `bog` layer's footer and the acceptance statistics. */
export interface BogIsland {
  index: number;
  land: number;
  tiles: number;
  /** Sizes of its lakes (a pocket lake included). */
  lakes: number[];
  /** Through-river bogs placed (lakes on land, one outflow each). */
  sites: number;
  sinks: number;
  spawns: number;
  pocketsFound: number;
  pocketsFilled: number;
  pocketSinks: number;
  /** Bogs the guarantee placed: on a relaxed through river, and spawn bogs (a spring feeds the lake). */
  guaranteeThrough: number;
  guaranteeSpawns: number;
  violations: BogRuleViolations;
}

export interface RiverField {
  tiles: Map<string, RiverTile>;
  /** Every bog tile of every island the field covers. */
  bogs: Map<string, BogTile>;
  bogIslands: BogIsland[];
  bogViolations: BogRuleViolations;
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

let cache: { key: string; field: RiverField } | null = null;

export function computeRivers(world: WorldSeed, window?: Window): RiverField {
  // The rivers and bog layers both want this field: compute it once per (world, window).
  const cacheKey = JSON.stringify([world.seed, world.generation, window ?? null]);
  if (cache?.key === cacheKey) return cache.field;
  const field = computeRiversUncached(world, window);
  cache = { key: cacheKey, field };
  return field;
}

function computeRiversUncached(world: WorldSeed, window?: Window): RiverField {
  const started = performance.now();
  const { landmasses } = findLandmasses(world, false, true);
  const kept = landmasses.filter((l) => l.tiles >= MINIMUM_ISLAND_TILES);
  const isLand = (c: { q: number; r: number }) => terrainAt(c.q, c.r, world) !== 'sea';
  const stats = emptyRiverStats();
  const tiles = new Map<string, RiverTile>();
  const bogs = new Map<string, BogTile>();
  const bogIslands: BogIsland[] = [];
  let bogViolations = noViolations();
  const exitOf = new Map<string, string | null>();
  let islandsWithRivers = 0;

  kept.forEach((island, index) => {
    const list = island.tileList!;
    if (window) {
      const reach = window.size; // generous: any island touching the window's box
      if (!list.some((t) => Math.abs(t.q - window.q) <= reach && Math.abs(t.r - window.r) <= reach)) return;
    }
    const islandStats = emptyRiverStats();
    const { rivers, bogs: islandBogs } = generateRiversWithBogs(
      list,
      (c) => terrainAt(c.q, c.r, world),
      (c) => islandDepthAt(c.q, c.r, world),
      isLand,
      world.seed,
      index,
      false,
      true,
      islandStats,
    );
    for (const k of Object.keys(stats) as (keyof RiverStats)[]) stats[k] += islandStats[k];
    if (rivers.length > 0) islandsWithRivers++;
    for (const t of rivers) tiles.set(coordKey(t), t);
    if (islandBogs.length > 0 || islandStats.pocketsFound > 0) {
      const violations = checkBogRules(islandBogs, rivers, (c) => terrainAt(c.q, c.r, world));
      bogViolations = addViolations(bogViolations, violations);
      for (const t of islandBogs) bogs.set(coordKey(t), t);
      for (const [k, v] of bogWaterExits(islandBogs)) exitOf.set(k, v);
      bogIslands.push({
        index,
        land: list.length,
        tiles: islandBogs.length,
        lakes: lakeSizes(islandBogs),
        sites: islandStats.sites,
        sinks: islandStats.sinks,
        spawns: islandStats.spawns,
        pocketsFound: islandStats.pocketsFound,
        pocketsFilled: islandStats.pocketsFilled,
        pocketSinks: islandStats.pocketSinks,
        guaranteeThrough: islandStats.guaranteeThrough,
        guaranteeSpawns: islandStats.guaranteeSpawns,
        violations,
      });
    }
  });

  // Follow every river to its end: root = the tile it ends on.
  const rootOf = new Map<string, string>();
  // Rivers whose water ends in a lake without an outflow (sunk into an enclosed pocket): a legitimate end, not an inland mouth.
  const sank = new Set<string>();
  const endOf = (t: RiverTile): RiverTile => {
    let cur = t;
    for (let guard = 0; cur.outDirection && guard < 100000; guard++) {
      const d = TILE_ORIENTATIONS.indexOf(cur.outDirection);
      const n = neighbors(cur)[d]!;
      let next = tiles.get(coordKey(n));
      if (!next) {
        // A river may hand its water to a bog creek: follow it through the lake to the river it feeds (or to its end in a pocket).
        const back = exitOf.get(coordKey(n));
        next = back ? tiles.get(back) : undefined;
        if (!next) {
          if (exitOf.has(coordKey(n)) && back === null) sank.add(coordKey(cur));
          break;
        }
      }
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
      if (!sank.has(coordKey(end)) && (end.shape !== 'mouth' || !neighbors(end).some((n) => !isLand(n)))) inlandMouths++;
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
    bogs,
    bogIslands,
    bogViolations,
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
