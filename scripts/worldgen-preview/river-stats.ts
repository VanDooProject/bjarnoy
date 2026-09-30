// Acceptance statistics for the river generator over several seeds: rivers and merges per island,
// river lengths, width shares, truncated/dropped branches, inland mouths, parallel runs.
//   cd src/frontend && npx tsx ../../scripts/worldgen-preview/river-stats.ts --seeds 1-8 --radius 1000
import { coordKey, neighbors } from '../../src/frontend/src/lib/hex/coords';
import { emptyRiverStats, generateRivers } from '../../src/frontend/src/lib/map/riverGenerator';
import { DEFAULT_GENERATION, islandDepthAt, terrainAt } from '../../src/frontend/src/lib/map/worldGenerator';
import { TILE_ORIENTATIONS, type RiverTile } from '../../src/frontend/src/lib/map/types';
import { findLandmasses } from './landmasses';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const [from, to] = opt('seeds', '1-8').split('-').map(Number) as [number, number];
const radius = Number(opt('radius', '1000'));
const verbose = args.includes('--islands');

const stats = emptyRiverStats();
let islands = 0;
let islandsWithRivers = 0;
let tilesTotal = 0;
let stream = 0;
let widen = 0;
let river = 0;
let inland = 0;
let parallel = 0;
let landTiles = 0;
const lengths: number[] = [];
const mergesPer: { rivers: number; merges: number; land: number; outlets: number; straights: number }[] = [];
let ms = 0;

for (let seed = from; seed <= to; seed++) {
  const world = { seed, generation: { ...DEFAULT_GENERATION, worldRadius: radius } };
  const { landmasses } = findLandmasses(world, false, true);
  const kept = landmasses.filter((l) => l.tiles >= 6);
  const isLand = (c: { q: number; r: number }) => terrainAt(c.q, c.r, world) !== 'sea';
  const all = new Map<string, RiverTile>();
  const islandOf = new Map<string, number>();
  kept.forEach((island, index) => {
    islands++;
    const s = emptyRiverStats();
    const t0 = performance.now();
    const tiles = generateRivers(island.tileList!, (c) => terrainAt(c.q, c.r, world), (c) => islandDepthAt(c.q, c.r, world), isLand, seed, index, false, true, s);
    ms += performance.now() - t0;
    for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] += s[k];
    if (tiles.length === 0) return;
    islandsWithRivers++;
    landTiles += island.tiles;
    mergesPer.push({ rivers: s.rivers, merges: s.merges, land: island.tiles, outlets: s.outlets, straights: tiles.filter((t) => t.shape === 'straight' && (t.width ?? 'river') === 'river').length });
    for (const t of tiles) {
      all.set(coordKey(t), t);
      islandOf.set(coordKey(t), index);
    }
  });

  const rootOf = new Map<string, string>();
  const walk = (t: RiverTile) => {
    let cur = t;
    let n = 1;
    for (let g = 0; cur.outDirection && g < 1e5; g++) {
      const nx = all.get(coordKey(neighbors(cur)[TILE_ORIENTATIONS.indexOf(cur.outDirection)]!));
      if (!nx) break;
      cur = nx;
      n++;
    }
    return { end: cur, n };
  };
  for (const t of all.values()) {
    tilesTotal++;
    if (t.width === 'stream') stream++;
    else if (t.width === 'widen') widen++;
    else river++;
    const { end, n } = walk(t);
    rootOf.set(coordKey(t), coordKey(end));
    if (t.shape === 'spring') {
      lengths.push(n);
      if (end.shape !== 'mouth' || !neighbors(end).some((x) => !isLand(x))) inland++;
    }
  }
  for (const t of all.values()) {
    for (const n of neighbors(t)) {
      const o = all.get(coordKey(n));
      if (o && coordKey(n) > coordKey(t) && rootOf.get(coordKey(n)) !== rootOf.get(coordKey(t))) parallel++;
    }
  }
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
lengths.sort((a, b) => a - b);
const big = mergesPer.filter((m) => m.rivers >= 4);
const hist: Record<string, number> = {};
for (const m of mergesPer) {
  const b = m.merges >= 6 ? '6+' : String(m.merges);
  hist[b] = (hist[b] ?? 0) + 1;
}
const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1) + '%' : '-');
console.log(`seeds ${from}-${to} radius ${radius}: ${islands} islands, ${islandsWithRivers} with rivers`);
console.log(`springs ${stats.springs} outlets ${stats.outlets} rivers(paths) ${stats.rivers} merges ${stats.merges} widenings ${stats.widenings} truncated ${stats.truncatedBranches} dropped ${stats.droppedRivers} (${pct(stats.truncatedBranches + stats.droppedRivers, stats.rivers)} of rivers)`);
console.log(`rivers per island with rivers ${avg(mergesPer.map((m) => m.rivers)).toFixed(1)}; outlets per island ${avg(mergesPer.map((m) => m.outlets)).toFixed(1)}; merges per island ${avg(mergesPer.map((m) => m.merges)).toFixed(1)}; islands with >=4 rivers: ${big.length}, merges per such island ${avg(big.map((m) => m.merges)).toFixed(2)}`);
const st = mergesPer.map((m) => m.straights).sort((a, b) => a - b);
console.log(`river-width Straight tiles per island with rivers: min ${st[0] ?? 0} p10 ${st[Math.floor(st.length * 0.1)] ?? 0} median ${st[st.length >> 1] ?? 0} mean ${avg(st).toFixed(1)}; islands under 8: ${st.filter((x) => x < 8).length}; river-stream joins ${stats.riverStreamJoins}`);
console.log(`merges-per-island histogram ${JSON.stringify(hist)}`);
console.log(`spring->end length: mean ${avg(lengths).toFixed(1)} median ${lengths[lengths.length >> 1] ?? 0} p90 ${lengths[Math.floor(lengths.length * 0.9)] ?? 0} max ${lengths[lengths.length - 1] ?? 0}`);
console.log(`river-tile share: river ${pct(river, tilesTotal)} widen ${pct(widen, tilesTotal)} stream ${pct(stream, tilesTotal)} of ${tilesTotal} tiles (${pct(tilesTotal, landTiles)} of land on river islands)`);
console.log(`inland mouths ${inland}; parallel adjacent pairs ${parallel} (${((1000 * parallel) / Math.max(1, tilesTotal)).toFixed(1)}/1000 tiles); generate ${ms.toFixed(0)} ms`);
if (verbose) console.log(JSON.stringify(mergesPer));
