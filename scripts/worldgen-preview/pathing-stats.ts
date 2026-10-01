// Whole-world statistics for the new pathing rules: with wide rivers and mountains impassable to
// land armies, how much of each island's walkable land can no longer be reached from the island's
// largest connected walkable region?
//
//   cd src/frontend && npx tsx ../../scripts/worldgen-preview/pathing-stats.ts --seeds 1-8 --radius 1000
//   ... --islands        also lists the most affected islands
//
// "Island" is a landmass found the way the backend's WorldGenerator finds them (a flood fill over
// non-sea hexes, specks under 6 tiles dropped). A hex is *walkable* when a land army may enter it:
// land terrain (grass, sand, forest, bog moss) that is not a mountain or a wide-river hex under the
// rule being measured; lakes never are. A walkable hex that is not in the island's largest walkable
// region is *unreachable* (cut off by wide rivers and mountains); hexes that are impassable
// themselves are counted apart, as `blocked`. Three rule sets are measured: the owner's (wide rivers =
// river and `riverstream` Y tiles + mountains), the same with `widen` and `riverstream` hexes also impassable (the
// ambiguity: a confluence tile is a gap in an otherwise wide line), and the old rules (rivers never block;
// only lakes cut an island).
import { coordKey, neighbors } from '../../src/frontend/src/lib/hex/coords';
import { DEFAULT_GENERATION, type WorldSeed } from '../../src/frontend/src/lib/map/worldGenerator';
import { findLandmasses } from './landmasses';
import { buildPathingWorld, isStream, type PathingWorld } from './pathing-world';

export interface IslandStat {
  island: number;
  tiles: number;
  /** Land hexes a land army can never enter under the rule set. */
  blocked: number;
  walkable: number;
  /** Walkable hexes outside the largest walkable region. */
  unreachable: number;
  components: number;
}

export interface RuleSet {
  label: string;
  walkable(pw: PathingWorld, c: { q: number; r: number }): boolean;
}

const LAND = new Set(['grass', 'sand', 'forest', 'bog', 'mountain']);

export const RULE_SETS: readonly RuleSet[] = [
  {
    label: 'old rules (rivers cross at +8, mountains cost 2)',
    walkable: (pw, c) => pw.terrainAt(c) !== 'lake' && LAND.has(pw.terrainAt(c)),
  },
  {
    label: 'decided: wide rivers (river and riverstream Y tiles) + mountains impassable, streams walkable over any terrain',
    walkable: (pw, c) => (LAND.has(pw.terrainAt(c)) && pw.terrainAt(c) !== 'mountain' && !pw.isWideRiver(c)) || (pw.terrainAt(c) === 'mountain' && isStream(pw, c)),
  },
  {
    label: 'decided + widen tiles also impassable',
    walkable: (pw, c) => {
      if (pw.terrainAt(c) === 'mountain' && isStream(pw, c)) return true;
      if (!LAND.has(pw.terrainAt(c)) || pw.terrainAt(c) === 'mountain') return false;
      const t = pw.riverAt(c);
      return !(t && (t.width === undefined || t.width === 'river' || t.width === 'widen' || t.width === 'riverstream'));
    },
  },
  {
    label: 'mountains only impassable',
    walkable: (pw, c) => LAND.has(pw.terrainAt(c)) && pw.terrainAt(c) !== 'mountain',
  },
  {
    label: 'decided, but a stream on a mountain stays blocked (the rule before streams ignored terrain)',
    walkable: (pw, c) => LAND.has(pw.terrainAt(c)) && pw.terrainAt(c) !== 'mountain' && !pw.isWideRiver(c),
  },
  {
    label: 'wide rivers only impassable',
    walkable: (pw, c) => LAND.has(pw.terrainAt(c)) && !pw.isWideRiver(c),
  },
];

export function islandStats(tiles: readonly { q: number; r: number }[], pw: PathingWorld, rule: RuleSet, index: number): IslandStat {
  const walkable = new Set<string>();
  for (const t of tiles) if (rule.walkable(pw, t)) walkable.add(coordKey(t));
  const seen = new Set<string>();
  let largest = 0;
  let components = 0;
  for (const k of walkable) {
    if (seen.has(k)) continue;
    components++;
    const [q, r] = k.split(',').map(Number) as [number, number];
    const stack = [{ q, r }];
    seen.add(k);
    let size = 0;
    while (stack.length > 0) {
      const c = stack.pop()!;
      size++;
      for (const n of neighbors(c)) {
        const nk = coordKey(n);
        if (!walkable.has(nk) || seen.has(nk)) continue;
        seen.add(nk);
        stack.push(n);
      }
    }
    largest = Math.max(largest, size);
  }
  return { island: index, tiles: tiles.length, blocked: tiles.length - walkable.size, walkable: walkable.size, unreachable: walkable.size - largest, components };
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
  const opt = (name: string, fallback: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1]! : fallback;
  };
  const seeds = parseSeeds(opt('--seeds', '1-8'));
  const radius = Number(opt('--radius', '1000'));
  const detail = args.includes('--islands');
  const totals = RULE_SETS.map(() => ({ islands: 0, land: 0, blocked: 0, walkable: 0, unreachable: 0, affected: 0, affected5: 0, affected25: 0 }));
  const worst: { seed: number; stat: IslandStat }[] = [];

  for (const seed of seeds) {
    const world: WorldSeed = { seed, generation: { ...DEFAULT_GENERATION, worldRadius: radius } };
    const started = performance.now();
    const pw = buildPathingWorld(world);
    const { landmasses } = findLandmasses(world, false, true);
    const islands = landmasses.filter((l) => l.tiles >= 6);
    const line: string[] = [];
    RULE_SETS.forEach((rule, i) => {
      const t = totals[i]!;
      let un = 0;
      let land = 0;
      let affected = 0;
      islands.forEach((island, index) => {
        const s = islandStats(island.tileList!, pw, rule, index);
        t.islands++;
        t.land += s.tiles;
        t.blocked += s.blocked;
        t.walkable += s.walkable;
        t.unreachable += s.unreachable;
        un += s.unreachable;
        land += s.tiles;
        if (s.unreachable > 0) {
          t.affected++;
          affected++;
        }
        if (s.walkable > 0 && s.unreachable / s.walkable >= 0.05) t.affected5++;
        if (s.walkable > 0 && s.unreachable / s.walkable >= 0.25) t.affected25++;
        if (i === 1 && detail) worst.push({ seed, stat: s });
      });
      line.push(`${i}: ${un}/${land} (${((100 * un) / land).toFixed(2)}%) ${affected} isl`);
    });
    console.log(`seed ${seed}: ${islands.length} islands, ${(performance.now() - started).toFixed(0)} ms | unreachable/land  ${line.join(' | ')}`);
  }

  console.log(`\nseeds ${seeds.join(',')} radius ${radius}`);
  RULE_SETS.forEach((rule, i) => {
    const t = totals[i]!;
    console.log(`\n[${i}] ${rule.label}`);
    console.log(`  islands ${t.islands}, land hexes ${t.land}, blocked (impassable land) ${t.blocked} (${((100 * t.blocked) / t.land).toFixed(1)}% of land)`);
    console.log(`  walkable ${t.walkable}; unreachable from the largest region ${t.unreachable} = ${((100 * t.unreachable) / t.walkable).toFixed(2)}% of walkable, ${((100 * t.unreachable) / t.land).toFixed(2)}% of all land`);
    console.log(
      `  islands affected ${t.affected}/${t.islands} (${((100 * t.affected) / t.islands).toFixed(1)}%); with >=5% of walkable cut off ${t.affected5}; with >=25% cut off ${t.affected25}`,
    );
  });
  if (detail) {
    worst.sort((a, b) => b.stat.unreachable - a.stat.unreachable);
    console.log('\nmost affected islands (decided rules): seed, island index, land, walkable, unreachable, components');
    for (const w of worst.slice(0, 15)) console.log(`  seed ${w.seed} island ${w.stat.island}: ${w.stat.tiles} land, ${w.stat.walkable} walkable, ${w.stat.unreachable} unreachable, ${w.stat.components} regions`);
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) main();
