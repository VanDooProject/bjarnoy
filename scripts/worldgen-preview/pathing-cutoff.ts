// Why does making mountains and wide rivers impassable cut land off? For every island: the walkable
// regions outside the largest one ("cut-off regions"), what impassable hexes enclose each, and how
// many mountain hexes touch the sea, a wide river or a lake.
//
//   cd src/frontend && npx tsx ../../scripts/worldgen-preview/pathing-cutoff.ts --seeds 1-8 --radius 1000
import { coordKey, neighbors, parseKey, type AxialCoord } from '../../src/frontend/src/lib/hex/coords';
import { DEFAULT_GENERATION, type WorldSeed } from '../../src/frontend/src/lib/map/worldGenerator';
import { findLandmasses } from './landmasses';
import { buildPathingWorld, type PathingWorld } from './pathing-world';

const LAND = new Set(['grass', 'sand', 'forest', 'bog']);
export const isWalkable = (pw: PathingWorld, c: AxialCoord): boolean => LAND.has(pw.terrainAt(c)) && !pw.isWideRiver(c);

export interface Region {
  island: number;
  tiles: string[];
  /** Which kinds of impassable hex border the region. */
  enclosedBy: ('mountain' | 'sea' | 'wide river' | 'lake')[];
}

/** The decided rules' cut-off regions of one island (every walkable region but the largest). */
export function cutoffRegions(tiles: readonly AxialCoord[], pw: PathingWorld, island = 0): Region[] {
  const walkable = new Set<string>();
  for (const t of tiles) if (isWalkable(pw, t)) walkable.add(coordKey(t));
  const seen = new Set<string>();
  const regions: string[][] = [];
  for (const k of walkable) {
    if (seen.has(k)) continue;
    const region = [k];
    seen.add(k);
    for (let i = 0; i < region.length; i++) {
      for (const n of neighbors(parseKey(region[i]!))) {
        const nk = coordKey(n);
        if (walkable.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          region.push(nk);
        }
      }
    }
    regions.push(region);
  }
  regions.sort((a, b) => b.length - a.length);
  return regions.slice(1).map((r) => {
    const kinds = new Set<Region['enclosedBy'][number]>();
    for (const k of r) {
      for (const n of neighbors(parseKey(k))) {
        if (walkable.has(coordKey(n))) continue;
        const t = pw.terrainAt(n);
        if (t === 'mountain') kinds.add('mountain');
        else if (t === 'sea') kinds.add('sea');
        else if (t === 'lake') kinds.add('lake');
        else if (pw.isWideRiver(n)) kinds.add('wide river');
      }
    }
    return { island, tiles: r, enclosedBy: [...kinds].sort() as Region['enclosedBy'] };
  });
}

function parseSeeds(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(',')) {
    const [a, b] = part.split('-').map(Number) as [number, number | undefined];
    for (let s = a; s <= (b ?? a); s++) out.push(s);
  }
  return out;
}

function main(): void {
  const args = process.argv.slice(2);
  const opt = (n: string, d: string) => (args.includes(n) ? args[args.indexOf(n) + 1]! : d);
  const seeds = parseSeeds(opt('--seeds', '1-8'));
  const radius = Number(opt('--radius', '1000'));
  let mountains = 0;
  const mt = { sea: 0, wideRiver: 0, anyRiver: 0, lake: 0, sand: 0, coastalIsland: 0 };
  const classes = new Map<string, { regions: number; hexes: number }>();
  const sizes = [0, 0, 0, 0];
  const sizeHexes = [0, 0, 0, 0];
  let regionsTotal = 0;
  let cutHexes = 0;
  const examples: { seed: number; island: number; size: number; cls: string; at: string }[] = [];
  for (const seed of seeds) {
    const world: WorldSeed = { seed, generation: { ...DEFAULT_GENERATION, worldRadius: radius } };
    const pw = buildPathingWorld(world);
    const { landmasses } = findLandmasses(world, false, true);
    landmasses.filter((l) => l.tiles >= 6).forEach((island, index) => {
      for (const c of island.tileList!) {
        if (pw.terrainAt(c) !== 'mountain') continue;
        mountains++;
        const ns = neighbors(c);
        if (ns.some((n) => pw.terrainAt(n) === 'sea')) mt.sea++;
        if (ns.some((n) => pw.isWideRiver(n))) mt.wideRiver++;
        if (ns.some((n) => pw.isRiver(n))) mt.anyRiver++;
        if (ns.some((n) => pw.terrainAt(n) === 'lake')) mt.lake++;
        if (ns.some((n) => pw.terrainAt(n) === 'sand')) mt.sand++;
      }
      for (const r of cutoffRegions(island.tileList!, pw, index)) {
        const cls = r.enclosedBy.length ? r.enclosedBy.join(' + ') : '(nothing: island of its own)';
        const e = classes.get(cls) ?? { regions: 0, hexes: 0 };
        e.regions++;
        e.hexes += r.tiles.length;
        classes.set(cls, e);
        const b = r.tiles.length < 10 ? 0 : r.tiles.length < 100 ? 1 : r.tiles.length < 1000 ? 2 : 3;
        sizes[b]!++;
        sizeHexes[b]! += r.tiles.length;
        regionsTotal++;
        cutHexes += r.tiles.length;
        examples.push({ seed, island: index, size: r.tiles.length, cls, at: r.tiles[0]! });
      }
    });
    console.error(`seed ${seed} done`);
  }
  const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;
  console.log(`seeds ${seeds.join(',')} radius ${radius}`);
  console.log(`\nmountain hexes ${mountains}`);
  console.log(`  adjacent to sea ${mt.sea} (${pct(mt.sea, mountains)})`);
  console.log(`  adjacent to sand ${mt.sand} (${pct(mt.sand, mountains)})`);
  console.log(`  adjacent to a wide river ${mt.wideRiver} (${pct(mt.wideRiver, mountains)}), to any river ${mt.anyRiver} (${pct(mt.anyRiver, mountains)})`);
  console.log(`  adjacent to a lake ${mt.lake} (${pct(mt.lake, mountains)})`);
  console.log(`\ncut-off regions ${regionsTotal}, hexes ${cutHexes}`);
  for (const [cls, v] of [...classes].sort((a, b) => b[1].hexes - a[1].hexes)) console.log(`  ${cls}: ${v.regions} regions, ${v.hexes} hexes (${pct(v.hexes, cutHexes)})`);
  console.log('\nsize: <10 / 10-99 / 100-999 / >=1000');
  console.log(`  regions ${sizes.join(' / ')}`);
  console.log(`  hexes   ${sizeHexes.join(' / ')}`);
  examples.sort((a, b) => b.size - a.size);
  console.log('\nlargest regions');
  for (const e of examples.slice(0, 8)) console.log(`  seed ${e.seed} island ${e.island}: ${e.size} hexes, ${e.cls}, first hex ${e.at}`);
  const small = examples.filter((e) => e.size >= 12 && e.size <= 40);
  console.log('\nsmall examples');
  for (const e of small.slice(0, 8)) console.log(`  seed ${e.seed} island ${e.island}: ${e.size} hexes, ${e.cls}, first hex ${e.at}`);
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) main();
