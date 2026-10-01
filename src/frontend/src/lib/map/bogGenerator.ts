// A bit-exact TypeScript port of the backend's `Bjarnoy.Domain.World.BogGenerator` (see that file's own
// doc comment and `docs/design/bog.md` for the design): lakes with a river running through them, bog moss
// around them, the occasional extra river sunk into a lake or spawned by a creek spring, and an enclosed
// sea pocket turned into a lake with a bog ring, all within the art's map rules (R1-R12).
//
// Like `riverGenerator.ts` (which calls it from inside the green pipeline) this is pure and mirrors the C#
// statement for statement, because the result is compared cell for cell against
// `src/shared/bog-generation-golden.json` and against the server's own output for whole worlds. Keep the
// iteration orders, the tie-breaks and the hash salts identical to the C# when changing either side.
import { coordKey, hexDistance, type AxialCoord } from '../hex/coords';
import { hash2, valueNoise } from './worldGenerator';
import { TILE_ORIENTATIONS } from './types';
import type { BogTile, BogTileKind, RiverTile, Terrain } from './types';

/** Land tiles an island needs per bog site — mirrors `WorldGenerationOptions.BogTilesPerSite`. */
export const BOG_TILES_PER_SITE = 6000;
/** Most through-river bog sites one island gets — mirrors `BogMaxSites`. */
export const BOG_MAX_SITES = 3;
/** Radius of a site's disc (+2 on a large island) — mirrors `BogSiteRadius`. */
export const BOG_SITE_RADIUS = 7;
/** Land tiles from which an island counts as large — mirrors `BogLargeIslandTiles`. */
export const BOG_LARGE_ISLAND_TILES = 15000;
/** Lake size knob (large islands: `BOG_LAKE_MAX_LARGE`) — mirrors `BogLakeMax`. */
export const BOG_LAKE_MAX = 12;
export const BOG_LAKE_MAX_LARGE = 18;
/** Tiles of a river before/after which a site may anchor — mirrors `BogMinFromSpring` / `BogMinFromMouth`. */
export const BOG_MIN_FROM_SPRING = 4;
export const BOG_MIN_FROM_MOUTH = 6;
/** Per-site chance of sinking an extra river / spawning one — mirrors `BogSinkChance` / `BogSpawnChance`. */
export const BOG_SINK_CHANCE = 0.15;
export const BOG_SPAWN_CHANCE = 0.05;
/** Enclosed sea pockets (mirrors `BogPocketMinTiles`, `BogPocketMaxTiles`, `BogPocketRadius`, `BogMaxSinkReroute`). */
export const BOG_POCKET_MIN_TILES = 3;
export const BOG_POCKET_MAX_TILES = 400;
export const BOG_POCKET_RADIUS = 4;
export const BOG_MAX_SINK_REROUTE = 12;
/**
 * A landing spot needs plain bog moss within this many hexes — mirrors `WorldGenerationOptions.BogReach`
 * (`docs/design/bog.md`, "Decisions"): the Clay Brickworks and the bog-ore works stand on plain bog only.
 */
export const BOG_REACH = 12;
/**
 * The bog guarantee — mirrors `WorldGenerationOptions.BogGuaranteeMinTiles` / `BogGuaranteeRadius` (`docs/design/bog.md`): an island of
 * at least this many land tiles that has a landing-spot candidate with no plain bog within `BOG_REACH` of one is given a bog.
 */
export const BOG_GUARANTEE_MIN_TILES = 150;
export const BOG_GUARANTEE_RADIUS = 5;

const SINK_EXTRA_REACH = 6;
const MAX_CREEK_LENGTH = 40;
const MAX_SITE_ATTEMPTS = 60;
const GUARANTEE_MIN_FROM_SPRING = 2;
const GUARANTEE_MIN_FROM_MOUTH = 3;
const GUARANTEE_LAKE_MAX = 8;
const GUARANTEE_MIN_COAST_DIST = 4;
const MAX_SPAWN_ATTEMPTS = 80;
const MAX_SPRING_CANDIDATES = 6;

/** Counters `generateRivers` fills for the preview tool and the tests. */
export interface BogStats {
  sites: number;
  sinks: number;
  spawns: number;
  pocketsFound: number;
  pocketsFilled: number;
  pocketSinks: number;
  /** Islands the bog guarantee acted on, of them without any bog, bogs it placed (through river / spawn) and islands it could not help. */
  guaranteeIslands: number;
  guaranteeWithoutBog: number;
  guaranteeThrough: number;
  guaranteeSpawns: number;
  guaranteeMissed: number;
  /** Sites dropped because their water features could not get a full ring of bog (rule R12): the normal pass, and the guarantee's attempts. */
  paddingRejected: number;
  guaranteePaddingRejected: number;
  /** Grass and forest tiles enclosed by a bog that turned to moss. */
  holeTiles: number;
}

export function emptyBogStats(): BogStats {
  return {
    sites: 0,
    sinks: 0,
    spawns: 0,
    pocketsFound: 0,
    pocketsFilled: 0,
    pocketSinks: 0,
    guaranteeIslands: 0,
    guaranteeWithoutBog: 0,
    guaranteeThrough: 0,
    guaranteeSpawns: 0,
    guaranteeMissed: 0,
    paddingRejected: 0,
    guaranteePaddingRejected: 0,
    holeTiles: 0,
  };
}

const DQ = [1, 1, 0, -1, -1, 0];
const DR = [0, -1, -1, 0, 1, 1];

const nb = (c: AxialCoord, d: number): AxialCoord => ({ q: c.q + DQ[d]!, r: c.r + DR[d]! });
const opp = (d: number): number => (d + 3) % 6;
const sameCoord = (a: AxialCoord, b: AxialCoord): boolean => a.q === b.q && a.r === b.r;
const cmp = (a: AxialCoord, b: AxialCoord): number => a.q - b.q || a.r - b.r;

function dirOf(from: AxialCoord, to: AxialCoord): number {
  for (let d = 0; d < 6; d++) if (sameCoord(nb(from, d), to)) return d;
  throw new Error(`(${to.q},${to.r}) is not a neighbour of (${from.q},${from.r})`);
}

function popCount(mask: number): number {
  let n = 0;
  for (let d = 0; d < 6; d++) n += (mask >> d) & 1;
  return n;
}

/** Number of separate cyclic runs of set bits in a 6-bit direction mask (0 for none or all six). */
function runs(mask: number): number {
  if (mask === 0 || mask === 63) return 0;
  let n = 0;
  for (let d = 0; d < 6; d++) if (((mask >> d) & 1) === 1 && ((mask >> ((d + 5) % 6)) & 1) === 0) n++;
  return n;
}

/** The directions of a contiguous water run in ascending cyclic order, starting where the run starts — mirrors `BogGenerator.WaterRun`. */
export function waterRun(mask: number): number[] {
  const run: number[] = [];
  if (mask === 0) return run;
  let start = 0;
  for (let d = 0; d < 6; d++) {
    if (((mask >> d) & 1) === 1 && ((mask >> ((d + 5) % 6)) & 1) === 0) {
      start = d;
      break;
    }
  }
  for (let k = 0; k < 6; k++) {
    const d = (start + k) % 6;
    if (((mask >> d) & 1) === 1) run.push(d);
    else break;
  }
  return run;
}

/** A set of hexes that iterates in insertion order and hands the coordinates back. */
export class HexSet implements Iterable<AxialCoord> {
  private readonly m = new Map<string, AxialCoord>();

  constructor(items?: Iterable<AxialCoord>) {
    if (items) for (const c of items) this.add(c);
  }

  add(c: AxialCoord): boolean {
    const k = coordKey(c);
    if (this.m.has(k)) return false;
    this.m.set(k, { q: c.q, r: c.r });
    return true;
  }

  has(c: AxialCoord): boolean {
    return this.m.has(coordKey(c));
  }

  delete(c: AxialCoord): void {
    this.m.delete(coordKey(c));
  }

  clear(): void {
    this.m.clear();
  }

  get size(): number {
    return this.m.size;
  }

  [Symbol.iterator](): Iterator<AxialCoord> {
    return this.m.values();
  }
}

const sorted = (tiles: Iterable<AxialCoord>): AxialCoord[] => [...tiles].sort(cmp);

/** The river paths a green island's bog placement works on — mirrors `BogPaths`. */
export class BogPaths {
  readonly forcedOut = new Map<string, number>();
  readonly bogIn = new Map<string, number>();
  readonly requireRiver = new Set<string>();
  paths: AxialCoord[][];
  merged: boolean[];

  constructor(paths: AxialCoord[][], merged: boolean[]) {
    this.paths = paths;
    this.merged = merged;
  }

  clone(): BogPaths {
    const copy = new BogPaths(
      this.paths.map((p) => p.map((c) => ({ q: c.q, r: c.r }))),
      [...this.merged],
    );
    for (const [k, v] of this.forcedOut) copy.forcedOut.set(k, v);
    for (const [k, v] of this.bogIn) copy.bogIn.set(k, v);
    for (const c of this.requireRiver) copy.requireRiver.add(c);
    return copy;
  }
}

interface Site {
  id: number;
  anchor: AxialCoord;
  pocket: boolean;
  lake: HexSet;
  ring: HexSet;
  creeks: AxialCoord[];
  core: HexSet;
  radius: number;
  up: AxialCoord | null;
  down: AxialCoord | null;
}

interface Saved {
  lake: AxialCoord[];
  bog: AxialCoord[];
  buffer: Map<string, number>;
  creek: Map<string, { in: number; out: number }>;
  mouth: Map<string, { in: number; out: number; water: number }>;
  spring: Map<string, number>;
  sites: number;
  paths: BogPaths;
}

interface Route {
  mouth: AxialCoord;
  water: number;
  tiles: AxialCoord[];
  dirs: number[];
}

interface RouteState {
  tile: AxialCoord;
  dir: number;
}

const stateKey = (tile: AxialCoord, dir: number): string => `${tile.q},${tile.r},${dir}`;

export type WidthTrial = (bp: BogPaths) => RiverTile[];
export type TraceRiver = (exit: AxialCoord, startIn: number, bp: BogPaths, blocked: HexSet) => AxialCoord[] | null;

/** Mirrors `BogGenerator`. */
export class BogGenerator {
  private readonly islandLand: Set<string>;
  private readonly lake = new HexSet();
  private readonly bog = new HexSet();
  private readonly lakeBuffer = new Map<string, number>();
  private readonly creek = new Map<string, { in: number; out: number }>();
  private readonly mouth = new Map<string, { in: number; out: number; water: number }>();
  private readonly spring = new Map<string, number>();
  private readonly sites: Site[] = [];
  private coastDist = new Map<string, number>();
  private readonly islandTiles: AxialCoord[];
  private readonly terrainOf: (c: AxialCoord) => Terrain;
  private readonly isLand: (c: AxialCoord) => boolean;
  private readonly seed: number;
  private readonly stats: BogStats | undefined;

  /** The water tiles of accepted pockets: sea that became lake. */
  readonly pocketWater = new HexSet();
  /** The bog ring tiles of accepted pockets (and the island tiles filled into their lakes): drainage treats them as blocked. */
  readonly pocketRing = new HexSet();

  constructor(
    islandTiles: AxialCoord[],
    terrainOf: (c: AxialCoord) => Terrain,
    isLand: (c: AxialCoord) => boolean,
    seed: number,
    stats?: BogStats,
  ) {
    this.islandTiles = islandTiles;
    this.terrainOf = terrainOf;
    this.isLand = isLand;
    this.seed = seed;
    this.stats = stats;
    this.islandLand = new Set(islandTiles.map((c) => coordKey(c)));
  }

  private inIsland(c: AxialCoord): boolean {
    return this.islandLand.has(coordKey(c));
  }

  private lakeMask(t: AxialCoord, lake: HexSet): number {
    let mask = 0;
    for (let d = 0; d < 6; d++) if (lake.has(nb(t, d))) mask |= 1 << d;
    return mask;
  }

  private static neighboursOf(set: HexSet): HexSet {
    const result = new HexSet();
    for (const t of set) {
      for (let d = 0; d < 6; d++) {
        const n = nb(t, d);
        if (!set.has(n)) result.add(n);
      }
    }
    return result;
  }

  private static minDistance(t: AxialCoord, set: Iterable<AxialCoord>): number {
    let best = Number.MAX_SAFE_INTEGER;
    for (const s of set) {
      const d = hexDistance(t, s);
      if (d < best) best = d;
    }
    return best;
  }

  // ---------------------------------------------------------------- pockets

  /** Finds enclosed sea pockets and turns the ones that satisfy every rule into lakes with a bog ring — mirrors `FindPockets`. */
  findPockets(): void {
    if (this.islandTiles.length === 0) return;

    let minQ = Number.MAX_SAFE_INTEGER;
    let maxQ = -Number.MAX_SAFE_INTEGER;
    let minR = Number.MAX_SAFE_INTEGER;
    let maxR = -Number.MAX_SAFE_INTEGER;
    for (const t of this.islandTiles) {
      minQ = Math.min(minQ, t.q);
      maxQ = Math.max(maxQ, t.q);
      minR = Math.min(minR, t.r);
      maxR = Math.max(maxR, t.r);
    }
    minQ--;
    maxQ++;
    minR--;
    maxR++;
    const w = maxQ - minQ + 1;
    const h = maxR - minR + 1;
    const state = new Uint8Array(w * h); // 0 water not yet seen, 1 island land, 2 open sea
    for (const t of this.islandTiles) state[(t.r - minR) * w + (t.q - minQ)] = 1;

    const queue: number[] = [];
    for (let q = 0; q < w; q++) {
      for (const r of [0, h - 1]) {
        const idx = r * w + q;
        if (state[idx] === 0) {
          state[idx] = 2;
          queue.push(idx);
        }
      }
    }
    for (let r = 0; r < h; r++) {
      for (const q of [0, w - 1]) {
        const idx = r * w + q;
        if (state[idx] === 0) {
          state[idx] = 2;
          queue.push(idx);
        }
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const idx = queue[head]!;
      const q = (idx % w) + minQ;
      const r = Math.floor(idx / w) + minR;
      for (let d = 0; d < 6; d++) {
        const n = nb({ q, r }, d);
        const nq = n.q - minQ;
        const nr = n.r - minR;
        if (nq < 0 || nr < 0 || nq >= w || nr >= h) continue;
        const ni = nr * w + nq;
        if (state[ni] === 0) {
          state[ni] = 2;
          queue.push(ni);
        }
      }
    }

    // Remaining water cells are enclosed: group them.
    const seen = new Set<number>();
    let components: AxialCoord[][] = [];
    for (let r = 0; r < h; r++) {
      for (let q = 0; q < w; q++) {
        const idx = r * w + q;
        if (state[idx] !== 0 || seen.has(idx)) continue;
        seen.add(idx);
        const comp: AxialCoord[] = [];
        const pending: number[] = [idx];
        while (pending.length > 0) {
          const cur = pending.pop()!;
          const c = { q: (cur % w) + minQ, r: Math.floor(cur / w) + minR };
          comp.push(c);
          for (let d = 0; d < 6; d++) {
            const n = nb(c, d);
            const nq = n.q - minQ;
            const nr = n.r - minR;
            if (nq < 0 || nr < 0 || nq >= w || nr >= h) continue;
            const ni = nr * w + nq;
            if (state[ni] === 0 && !seen.has(ni)) {
              seen.add(ni);
              pending.push(ni);
            }
          }
        }
        components.push(comp);
      }
    }

    // Nothing but sea-level water may be in the pocket: another landmass inside it means it is not ours.
    components = components.filter((c) => !c.some((t) => this.isLand(t)));
    for (const comp of components) {
      if (comp.length < BOG_POCKET_MIN_TILES || comp.length > BOG_POCKET_MAX_TILES) continue;
      if (this.stats) this.stats.pocketsFound++;
      if (this.tryBuildPocket(comp) && this.stats) this.stats.pocketsFilled++;
    }

    // The pockets' rings are now bog: re-measure the distance to anything a bog site must keep away from.
    this.coastDist = this.computeCoastDist([...this.bog, ...this.lake]);
  }

  private tryBuildPocket(water: AxialCoord[]): boolean {
    const lake = new HexSet(water);
    const origWater = new HexSet(water);

    // R1: an island tile touching the lake by four or more edges, or by two separate runs, fills up.
    for (let iteration = 0; iteration < 24; iteration++) {
      const add: AxialCoord[] = [];
      for (const t of sorted(BogGenerator.neighboursOf(lake))) {
        const mask = this.lakeMask(t, lake);
        if (popCount(mask) >= 4 || runs(mask) > 1) add.push(t);
      }
      if (add.length === 0) break;
      for (const t of add) {
        if (!this.inIsland(t) || this.terrainOf(t) === 'mountain' || this.bog.has(t) || this.lake.has(t)) return false;
        lake.add(t);
      }
    }

    for (const t of BogGenerator.neighboursOf(lake)) {
      const mask = this.lakeMask(t, lake);
      if (popCount(mask) > 3 || runs(mask) !== 1) return false;
    }

    // Open sea: non-island water that is not this pocket.
    const openSea = (t: AxialCoord): boolean => !this.inIsland(t) && !lake.has(t) && !this.pocketWater.has(t);
    const hasOpenSeaNeighbour = (t: AxialCoord): boolean => {
      for (let d = 0; d < 6; d++) if (openSea(nb(t, d))) return true;
      return false;
    };

    let ring = new HexSet();
    const distance = new Map<string, number>();
    const frontier = sorted(BogGenerator.neighboursOf(lake));
    for (const t of frontier) distance.set(coordKey(t), 1);

    const radius = BOG_POCKET_RADIUS;
    let layer = frontier;
    for (let d = 1; d <= radius; d++) {
      const next: AxialCoord[] = [];
      for (const t of layer) {
        const keep = d === 1 || d <= 2 || valueNoise(t.q, t.r, this.seed + 79, 3.0) > (d - 1.0) / radius;
        if (!keep) continue;

        if (!this.inIsland(t)) {
          if (d <= 2) return false;
          continue;
        }

        if (this.terrainOf(t) === 'mountain' || openSea(t) || hasOpenSeaNeighbour(t)) {
          if (d <= 2) return false;
          continue;
        }

        if (this.bog.has(t) || this.lake.has(t)) return false;

        ring.add(t);
        const ns: AxialCoord[] = [];
        for (let k = 0; k < 6; k++) ns.push(nb(t, k));
        for (const n of ns.sort(cmp)) {
          if (!lake.has(n) && !ring.has(n) && !distance.has(coordKey(n))) {
            distance.set(coordKey(n), d + 1);
            next.push(n);
          }
        }
      }
      next.sort(cmp);
      layer = next;
    }

    // R7 for the whole ring: nothing touches the open sea. (Sand is fine here: the pocket is inside the island, its own
    // beach and the sand beside it turn to bog as far as the ring reaches; see docs/design/bog.md.)
    for (const t of ring) {
      for (let d = 0; d < 6; d++) {
        const n = nb(t, d);
        if (lake.has(n) || ring.has(n)) continue;
        if (openSea(n)) return false;
      }
    }

    // Separate lakes are at least three apart: nothing of an earlier bog may touch this one.
    for (const t of [...lake, ...ring]) {
      for (let d = 0; d < 6; d++) {
        const n = nb(t, d);
        if ((this.lake.has(n) || this.bog.has(n)) && !lake.has(n) && !ring.has(n)) return false;
      }
    }

    // Every ring tile must be reachable from the lake through ring tiles (the noisy edge can strand some).
    const connected = new HexSet();
    const stack: AxialCoord[] = [];
    for (const t of BogGenerator.neighboursOf(lake)) {
      if (ring.has(t) && connected.add(t)) stack.push(t);
    }
    while (stack.length > 0) {
      const c = stack.pop()!;
      for (let d = 0; d < 6; d++) {
        const n = nb(c, d);
        if (ring.has(n) && connected.add(n)) stack.push(n);
      }
    }

    if (connected.size !== ring.size) {
      // A stranded piece would have to be dropped, and the sand rule may need it: keep only the connected part
      // when nothing was dropped that touches sand, else give the pocket up.
      for (const t of [...ring].filter((x) => !connected.has(x))) {
        for (let d = 0; d < 6; d++) if (connected.has(nb(t, d))) return false;
      }
      ring = connected;
    }

    const site: Site = {
      id: this.sites.length,
      anchor: water[0]!,
      pocket: true,
      lake: new HexSet(),
      ring: new HexSet(),
      creeks: [],
      core: new HexSet(),
      radius,
      up: null,
      down: null,
    };
    for (const t of lake) {
      site.lake.add(t);
      this.lake.add(t);
    }
    for (const t of ring) {
      site.ring.add(t);
      site.core.add(t);
      this.bog.add(t);
      this.pocketRing.add(t);
    }
    for (const t of origWater) this.pocketWater.add(t);
    for (const t of lake) if (this.inIsland(t)) this.pocketRing.add(t);

    this.addBuffer(site);
    this.sites.push(site);
    return true;
  }

  private addBuffer(site: Site): void {
    for (const t of site.lake) {
      for (let dq = -2; dq <= 2; dq++) {
        for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) {
          this.lakeBuffer.set(coordKey({ q: t.q + dq, r: t.r + dr }), site.id);
        }
      }
    }
  }

  /** Distance from every island tile to the nearest sand, tile next to non-island water, or (when given) bog. */
  private computeCoastDist(extraSources: AxialCoord[] | null): Map<string, number> {
    const dist = new Map<string, number>();
    const queue: AxialCoord[] = [];
    for (const t of this.islandTiles) {
      let source = this.terrainOf(t) === 'sand';
      for (let d = 0; d < 6 && !source; d++) source = !this.inIsland(nb(t, d));
      if (source) {
        dist.set(coordKey(t), 0);
        queue.push(t);
      }
    }
    if (extraSources) {
      for (const t of extraSources) {
        if (this.inIsland(t) && !dist.has(coordKey(t))) {
          dist.set(coordKey(t), 0);
          queue.push(t);
        }
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head]!;
      const dc = dist.get(coordKey(c))!;
      for (let d = 0; d < 6; d++) {
        const n = nb(c, d);
        if (this.inIsland(n) && !dist.has(coordKey(n))) {
          dist.set(coordKey(n), dc + 1);
          queue.push(n);
        }
      }
    }
    return dist;
  }

  // ---------------------------------------------------------------- sites

  /** A grass or forest tile away from the coast, from any bog and from other lakes — mirrors `Allowed`. */
  private allowed(t: AxialCoord, ownSite = -1): boolean {
    if (!this.inIsland(t)) return false;
    const terrain = this.terrainOf(t);
    if (terrain !== 'grass' && terrain !== 'forest') return false;
    const cd = this.coastDist.get(coordKey(t));
    if (cd === undefined || cd <= 2) return false;
    if (this.bog.has(t) || this.lake.has(t)) return false;
    const owner = this.lakeBuffer.get(coordKey(t));
    return owner === undefined || owner === ownSite;
  }

  /** No neighbour of the tile is a mountain (a mountain cannot become padding, rule R12) — mirrors `MountainFree`. */
  private anyNeighbour(c: AxialCoord, pred: (n: AxialCoord) => boolean): boolean {
    for (let d = 0; d < 6; d++) if (pred(nb(c, d))) return true;
    return false;
  }

  private mountainFree(t: AxialCoord): boolean {
    for (let d = 0; d < 6; d++) {
      const n = nb(t, d);
      if (this.inIsland(n) && this.terrainOf(n) === 'mountain') return false;
    }
    return true;
  }

  /** Through-river sites, then sinks and spawns, then the pockets' own sinks — mirrors `PlaceSites`. Mutates `bp`. */
  placeSites(bp: BogPaths, widthTrial: WidthTrial, traceRiver: TraceRiver): void {
    const wanted = Math.min(BOG_MAX_SITES, Math.max(1, Math.floor(this.islandTiles.length / BOG_TILES_PER_SITE)));
    const large = this.islandTiles.length >= BOG_LARGE_ISLAND_TILES;
    const radius = BOG_SITE_RADIUS + (large ? 2 : 0);
    let placed = 0;

    const anchors: { tile: AxialCoord; path: number; index: number; score: number }[] = [];
    for (let p = 0; p < bp.paths.length; p++) {
      const path = bp.paths[p]!;
      const trunkBonus = !bp.merged[p] ? 3.0 : 0.0;
      for (let i = BOG_MIN_FROM_SPRING; i <= path.length - 1 - BOG_MIN_FROM_MOUTH; i++) {
        const tile = path[i]!;
        const cd = this.coastDist.get(coordKey(tile));
        if (cd === undefined || cd < radius + 1) continue;
        anchors.push({ tile, path: p, index: i, score: cd + trunkBonus + hash2(tile.q, tile.r, this.seed + 73) });
      }
    }

    anchors.sort((a, b) => {
      const byScore = b.score - a.score;
      if (byScore !== 0) return byScore;
      const byTile = cmp(a.tile, b.tile);
      return byTile !== 0 ? byTile : a.path !== b.path ? a.path - b.path : a.index - b.index;
    });

    let attempts = 0;
    const siteAnchors: AxialCoord[] = [];
    for (const anchor of anchors) {
      if (placed >= wanted || attempts >= MAX_SITE_ATTEMPTS) break;
      if (siteAnchors.some((s) => hexDistance(s, anchor.tile) < 2 * radius + 4)) continue;

      // The path may have been cut by an earlier site: find the anchor tile again.
      let pIndex = -1;
      let iIndex = -1;
      for (let p = 0; p < bp.paths.length && pIndex < 0; p++) {
        const idx = bp.paths[p]!.findIndex((c) => sameCoord(c, anchor.tile));
        if (idx >= 0) {
          pIndex = p;
          iIndex = idx;
        }
      }

      if (pIndex < 0 || iIndex < BOG_MIN_FROM_SPRING || iIndex > bp.paths[pIndex]!.length - 1 - BOG_MIN_FROM_MOUTH) continue;
      if (!this.discIsClear(anchor.tile, 2)) continue;

      attempts++;
      const count = pathCount(bp);
      const saved = this.save(bp);
      const site = this.tryPlaceSite(
        bp,
        count,
        pIndex,
        iIndex,
        radius,
        large ? BOG_LAKE_MAX_LARGE : BOG_LAKE_MAX,
        BOG_MIN_FROM_SPRING,
        widthTrial,
      );
      if (site === null) continue;

      const sunk = hash2(site.anchor.q, site.anchor.r, this.seed + 83) < BOG_SINK_CHANCE && this.trySink(bp, site, radius + SINK_EXTRA_REACH, widthTrial);
      const spawned = hash2(site.anchor.q, site.anchor.r, this.seed + 89) < BOG_SPAWN_CHANCE && this.trySpawn(bp, site, widthTrial, traceRiver);
      this.buildRegion(bp, site);

      // Rule R12: a ring of bog around every water feature; a site that cannot get it is dropped whole.
      if (!this.tryPad(bp, site)) {
        this.restore(saved, bp);
        if (this.stats) this.stats.paddingRejected++;
        continue;
      }

      placed++;
      siteAnchors.push(anchor.tile);
      if (this.stats) {
        this.stats.sites++;
        if (sunk) this.stats.sinks++;
        if (spawned) this.stats.spawns++;
      }
    }

    // Pockets: the nearest river within reach sinks into each.
    for (const site of this.sites.filter((s) => s.pocket)) {
      const saved = this.save(bp);
      const core = new HexSet(site.core);
      const creeks = [...site.creeks];
      if (!this.trySink(bp, site, BOG_MAX_SINK_REROUTE, widthTrial)) continue;

      if (this.tryPad(bp, site)) {
        if (this.stats) this.stats.pocketSinks++;
      } else {
        this.restore(saved, bp);
        site.core.clear();
        for (const t of core) site.core.add(t);
        site.creeks.length = 0;
        site.creeks.push(...creeks);
        if (this.stats) this.stats.paddingRejected++;
      }
    }

    this.placeGuarantee(bp, widthTrial, traceRiver);
    this.fillHoles(bp);
  }

  /** `TryPad` for the guarantee's attempts, counting the sites it had to drop — mirrors `PadOrCount`. */
  private padOrCount(bp: BogPaths, site: Site): boolean {
    if (this.tryPad(bp, site)) return true;
    if (this.stats) this.stats.guaranteePaddingRejected++;
    return false;
  }

  /**
   * Rule R12: every lake, shore, mouth, creek and spring tile of `site` has all six neighbours inside the bog. Missing ones become
   * plain moss when they are grass or forest that is not a river and does not touch the sea or sand (R7); a creek tile may touch the
   * river its own flow links lead to. Returns false (and changes nothing) when a neighbour cannot be padded — mirrors `TryPad`.
   */
  private tryPad(bp: BogPaths, site: Site): boolean {
    const count = pathCount(bp);
    const pending = new HexSet();
    const features = new HexSet(site.core);
    for (const t of site.lake) features.add(t);
    for (const f of sorted(features)) {
      const fk = coordKey(f);
      const isLake = this.lake.has(f);
      let inDir = -1;
      let outDir = -1;
      const m = this.mouth.get(fk);
      const c = this.creek.get(fk);
      const sp = this.spring.get(fk);
      if (m !== undefined) {
        inDir = m.in;
        outDir = m.out;
      } else if (c !== undefined) {
        inDir = c.in;
        outDir = c.out;
      } else if (sp !== undefined) {
        outDir = sp;
      } else if (!isLake && this.lakeMask(f, this.lake) === 0) {
        continue;
      }

      for (let d = 0; d < 6; d++) {
        const n = nb(f, d);
        if (this.bog.has(n) || this.lake.has(n) || pending.has(n)) continue;
        if (count.has(coordKey(n))) {
          if (d === inDir || d === outDir) continue;
          return false;
        }

        if (!this.canPad(n)) return false;
        pending.add(n);
      }
    }

    for (const t of pending) this.bog.add(t);
    return true;
  }

  /** A grass or forest tile of the island that touches neither the open sea nor sand, so moss on it keeps rule R7 — mirrors `CanPad`. */
  private canPad(n: AxialCoord): boolean {
    if (!this.inIsland(n)) return false;
    const terrain = this.terrainOf(n);
    if (terrain !== 'grass' && terrain !== 'forest') return false;
    for (let d = 0; d < 6; d++) {
      const m = nb(n, d);
      if (this.bog.has(m) || this.lake.has(m)) continue;
      if (!this.inIsland(m) || this.terrainOf(m) === 'sand') return false;
    }
    return true;
  }

  /**
   * Fills the holes a noisy bog outline leaves: every connected group of non-bog island tiles that no path leaves without crossing
   * bog (or lake) turns its grass and forest, except river tiles, into plain moss — mirrors `FillHoles`.
   */
  fillHoles(bp: BogPaths | null): void {
    const count = bp === null ? new Map<string, number>() : pathCount(bp);
    const seen = new Set<string>();
    const fill: AxialCoord[] = [];
    const land = this.islandTiles.filter((t) => this.inIsland(t));
    for (const start of sorted(land)) {
      const sk = coordKey(start);
      if (this.bog.has(start) || this.lake.has(start) || seen.has(sk)) continue;
      seen.add(sk);
      const group: AxialCoord[] = [];
      const stack: AxialCoord[] = [start];
      let open = false;
      while (stack.length > 0) {
        const c = stack.pop()!;
        group.push(c);
        for (let d = 0; d < 6; d++) {
          const n = nb(c, d);
          if (this.bog.has(n) || this.lake.has(n)) continue;
          if (!this.inIsland(n)) {
            open = true;
          } else if (!seen.has(coordKey(n))) {
            seen.add(coordKey(n));
            stack.push(n);
          }
        }
      }

      if (!open) {
        for (const t of group) {
          const terrain = this.terrainOf(t);
          if ((terrain === 'grass' || terrain === 'forest') && !count.has(coordKey(t))) fill.push(t);
        }
      }
    }

    for (const t of fill) this.bog.add(t);
    if (this.stats) this.stats.holeTiles += fill.length;
  }

  private discIsClear(anchor: AxialCoord, radius: number): boolean {
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
        if (!this.allowed({ q: anchor.q + dq, r: anchor.r + dr })) return false;
      }
    }
    return true;
  }

  private tryPlaceSite(
    bp: BogPaths,
    count: Map<string, number>,
    p: number,
    i: number,
    radius: number,
    lakeMax: number,
    minFromSpring: number,
    widthTrial: WidthTrial,
  ): Site | null {
    const path = bp.paths[p]!;
    const a = path[i]!;
    const disc = new HexSet();
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) disc.add({ q: a.q + dq, r: a.r + dr });
    }

    let i0 = -1;
    let i1 = -1;
    for (let k = 0; k < path.length; k++) {
      if (disc.has(path[k]!)) {
        if (i0 < 0) i0 = k;
        i1 = k;
      }
    }

    if (i0 < Math.max(2, minFromSpring + 1) || i1 > path.length - 2) return null;
    if (bp.merged[p] && i1 + 1 === path.length - 1) return null;
    for (let k = i0 - 1; k <= i1 + 1; k++) if (count.get(coordKey(path[k]!)) !== 1) return null;

    const inP = new Set(path.map((c) => coordKey(c)));
    const isOther = (t: AxialCoord): boolean => (count.get(coordKey(t)) ?? 0) - (inP.has(coordKey(t)) ? 1 : 0) > 0;
    const grown = this.growLake(a, disc, radius, lakeMax, isOther);
    if (grown === null) return null;
    const { lake, mouthDir } = grown;

    const up = path[i0 - 1]!;
    const down = path[i1 + 1]!;
    const creekOk = (t: AxialCoord): boolean =>
      disc.has(t) && this.allowed(t) && this.mountainFree(t) && !lake.has(t) && !isOther(t) && this.lakeMask(t, lake) === 0;

    // Rule R12: a creek tile may touch only the river tile it is linked to (and the stretch of this river that the lake replaces).
    const removedTiles = new HexSet(path.slice(i0, i1 + 1));
    const keptRiverBeside = (t: AxialCoord, link: AxialCoord): boolean => {
      for (let d = 0; d < 6; d++) {
        const n = nb(t, d);
        if (!sameCoord(n, link) && count.has(coordKey(n)) && !removedTiles.has(n)) return true;
      }
      return false;
    };
    const creekOkIn = (t: AxialCoord): boolean => creekOk(t) && !keptRiverBeside(t, up);
    const creekOkOut = (t: AxialCoord): boolean => creekOk(t) && !keptRiverBeside(t, down);

    const inRoutes = this.routesFrom(up, dirOf(up, path[i0 - 2]!), creekOkIn, mouthDir);
    const outRoutes = this.routesFrom(down, i1 + 2 < path.length ? dirOf(down, path[i1 + 2]!) : -1, creekOkOut, mouthDir);
    if (inRoutes.size === 0 || outRoutes.size === 0) return null;

    const byLengthThenMouth = (x: Route, y: Route): number => x.tiles.length - y.tiles.length || x.mouth.q - y.mouth.q || x.mouth.r - y.mouth.r;
    const inList = [...inRoutes.values()].sort(byLengthThenMouth);
    const outList = [...outRoutes.values()].sort(byLengthThenMouth);
    let bestIn: Route | null = null;
    let bestOut: Route | null = null;
    let bestTotal = Number.MAX_SAFE_INTEGER;
    for (const ri of inList) {
      for (const ro of outList) {
        if (sameCoord(ri.mouth, ro.mouth) || hexDistance(ri.mouth, ro.mouth) < 3) continue;

        const total = ri.tiles.length + ro.tiles.length;
        if (total >= bestTotal) continue;

        let overlap = false;
        for (const t of ri.tiles) {
          if (ro.tiles.some((x) => sameCoord(x, t)) || sameCoord(t, ro.mouth)) {
            overlap = true;
            break;
          }
        }

        if (overlap || ri.tiles.some((x) => sameCoord(x, ro.mouth))) continue;

        bestTotal = total;
        bestIn = ri;
        bestOut = ro;
      }
    }

    if (bestIn === null || bestOut === null) return null;

    // Trial: the river with its segment replaced must keep every river tile, and its upstream must widen in time.
    const trial = bp.clone();
    const head = path.slice(0, i0);
    const tail = path.slice(i1 + 1);
    trial.paths[p] = head;
    trial.merged[p] = false;
    trial.paths.splice(p + 1, 0, tail);
    trial.merged.splice(p + 1, 0, bp.merged[p]!);
    trial.forcedOut.set(coordKey(up), bestIn.dirs[0]!);
    trial.requireRiver.add(coordKey(up));
    trial.bogIn.set(coordKey(down), bestOut.dirs[0]!);
    if (!this.trialOk(trial, widthTrial, [...head, ...tail], trial.requireRiver)) return null;

    // Commit.
    bp.paths[p] = head;
    bp.merged[p] = false;
    bp.paths.splice(p + 1, 0, tail);
    bp.merged.splice(p + 1, 0, trial.merged[p + 1]!);
    bp.forcedOut.set(coordKey(up), bestIn.dirs[0]!);
    bp.requireRiver.add(coordKey(up));
    bp.bogIn.set(coordKey(down), bestOut.dirs[0]!);

    const site: Site = {
      id: this.sites.length,
      anchor: a,
      pocket: false,
      lake: new HexSet(),
      ring: new HexSet(),
      creeks: [],
      core: new HexSet(),
      radius,
      up,
      down,
    };
    for (const t of lake) {
      site.lake.add(t);
      site.core.add(t);
      this.lake.add(t);
    }

    this.addBuffer(site);
    this.commitRoute(site, bestIn, true, lake);
    this.commitRoute(site, bestOut, false, lake);
    this.sites.push(site);
    return site;
  }

  /**
   * Grows a lake of 3 to `lakeMax` (plus notch fill) tiles from `a` inside `disc`, fills every notch (R1) and checks the shore is fit.
   * Returns the lake and the mouth candidates (shore tiles with one lake neighbour, and that neighbour's direction), or null —
   * mirrors `GrowLake`.
   */
  private growLake(
    a: AxialCoord,
    disc: HexSet,
    radius: number,
    lakeMax: number,
    isOther: (t: AxialCoord) => boolean,
  ): { lake: HexSet; mouthDir: Map<string, number> } | null {
    const nearOther = (t: AxialCoord): boolean => {
      if (isOther(t)) return true;
      for (let d = 0; d < 6; d++) if (isOther(nb(t, d))) return true;
      return false;
    };

    const target = 3 + Math.floor(hash2(a.q, a.r, this.seed + 71) * (lakeMax - 3));
    const growOk = (t: AxialCoord): boolean => hexDistance(t, a) <= radius - 3 && disc.has(t) && this.allowed(t) && !nearOther(t);

    if (!growOk(a)) return null;

    const lake = new HexSet([a]);
    while (lake.size < target) {
      let best: AxialCoord | null = null;
      let bestHash = -1.0;
      for (const t of sorted(BogGenerator.neighboursOf(lake))) {
        if (!growOk(t)) continue;
        const h = hash2(t.q, t.r, this.seed + 75);
        if (h > bestHash) {
          bestHash = h;
          best = t;
        }
      }
      if (best === null) break;
      lake.add(best);
    }

    if (lake.size < 3) return null;

    // R1: fill notches until every shore tile touches one contiguous run of at most three lake tiles.
    for (let iteration = 0; iteration < 24; iteration++) {
      const add: AxialCoord[] = [];
      for (const t of sorted(BogGenerator.neighboursOf(lake))) {
        const mask = this.lakeMask(t, lake);
        if (popCount(mask) >= 4 || runs(mask) > 1) add.push(t);
      }
      if (add.length === 0) break;
      for (const t of add) {
        if (!growOk(t)) return null;
        lake.add(t);
      }
      if (lake.size > lakeMax + 6) return null;
    }

    if (lake.size > lakeMax + 6) return null;

    const shore = sorted(BogGenerator.neighboursOf(lake));
    for (const t of shore) {
      const mask = this.lakeMask(t, lake);
      if (popCount(mask) > 3 || runs(mask) !== 1 || !this.allowed(t) || isOther(t) || !disc.has(t) || !this.mountainFree(t)) return null;

      // Rule R12: the ring beyond the shore is padded with moss, so no other river may run there.
      for (let d = 0; d < 6; d++) if (isOther(nb(t, d))) return null;
    }

    // Mouth candidates: a shore tile with exactly one lake neighbour.
    const mouthDir = new Map<string, number>();
    for (const t of shore) {
      const mask = this.lakeMask(t, lake);
      if (popCount(mask) === 1) {
        for (let d = 0; d < 6; d++) if (((mask >> d) & 1) === 1) mouthDir.set(coordKey(t), d);
      }
    }

    return { lake, mouthDir };
  }

  private trialOk(trial: BogPaths, widthTrial: WidthTrial, mustSurvive: Iterable<AxialCoord>, mustBeRiver: Set<string>): boolean {
    const tiles = widthTrial(trial);
    const byCoord = new Map<string, RiverTile>();
    for (const t of tiles) byCoord.set(coordKey(t), t);

    for (const c of mustSurvive) if (!byCoord.has(coordKey(c))) return false;

    for (const c of mustBeRiver) {
      const tile = byCoord.get(c);
      if (tile === undefined || (tile.width ?? 'river') === 'stream') return false;
    }

    return true;
  }

  /**
   * Every creek route from `start` (a river tile) to a mouth: a search over (tile, direction of the last step) states in which
   * every step goes straight on or turns by 60 degrees off straight, through creek-fit tiles that touch no lake tile, ending
   * on a mouth candidate reached heading straight at its lake edge. Returns the shortest route to each mouth reached.
   */
  private routesFrom(
    start: AxialCoord,
    forbiddenFirstDir: number,
    creekOk: (t: AxialCoord) => boolean,
    mouthDir: Map<string, number>,
  ): Map<string, Route> {
    const routes = new Map<string, Route>();
    const parent = new Map<string, RouteState | null>();
    const depth = new Map<string, number>();
    const queue: RouteState[] = [];

    const visit = (origin: AxialCoord, fromState: RouteState | null, dir: number, d: number): void => {
      const n = nb(origin, dir);
      const nk = coordKey(n);
      const w = mouthDir.get(nk);
      if (w !== undefined && w === dir && !this.mouth.has(nk)) {
        if (!routes.has(nk)) {
          // The search runs over (tile, direction) states, so a route can loop back across its own track to come at a
          // mouth from the right side. That would lay one creek tile twice (two flows in one tile, rule R3): it is not a
          // route, and a later state may still reach the same mouth cleanly.
          const route = buildRoute(n, w, fromState, dir, parent);
          if (new Set(route.tiles.map((t) => coordKey(t))).size === route.tiles.length) routes.set(nk, route);
        }
        return;
      }

      if (d > MAX_CREEK_LENGTH || !creekOk(n) || this.mouth.has(nk) || this.creek.has(nk)) return;

      const key = stateKey(n, dir);
      if (depth.has(key)) return;

      depth.set(key, d);
      parent.set(key, fromState);
      queue.push({ tile: n, dir });
    };

    for (let d0 = 0; d0 < 6; d0++) if (d0 !== forbiddenFirstDir) visit(start, null, d0, 1);

    for (let head = 0; head < queue.length; head++) {
      const state = queue[head]!;
      const d = depth.get(stateKey(state.tile, state.dir))!;
      for (const turn of [0, 1, 5]) visit(state.tile, state, (state.dir + turn) % 6, d + 1);
    }

    return routes;
  }

  /** Records a route's creek tiles and its mouth. `forward`: flow goes from the start tile into the lake. */
  private commitRoute(site: Site, route: Route, forward: boolean, lake: HexSet): void {
    // Tiles t_1..t_k, then the mouth; dirs[j] is the direction of the step into tile j (dirs[0] leaves the start).
    for (let j = 0; j < route.tiles.length; j++) {
      const t = route.tiles[j]!;
      const toward = opp(route.dirs[j]!); // toward the start tile
      const away = route.dirs[j + 1]!; // toward the next tile (or the mouth)
      this.creek.set(coordKey(t), forward ? { in: toward, out: away } : { in: away, out: toward });
      this.bog.add(t);
      site.creeks.push(t);
      site.core.add(t);
    }

    const w = route.water;
    this.mouth.set(coordKey(route.mouth), forward ? { in: opp(w), out: w, water: w } : { in: w, out: opp(w), water: w });
    this.bog.add(route.mouth);
    site.creeks.push(route.mouth);
    site.core.add(route.mouth);
    for (const t of BogGenerator.neighboursOf(lake)) {
      this.bog.add(t);
      site.core.add(t);
    }
  }

  // ---------------------------------------------------------------- sink and spawn

  /** Leads the nearest other river within reach into the lake by a new inflow mouth — mirrors `TrySink`. */
  private trySink(bp: BogPaths, site: Site, reach: number, widthTrial: WidthTrial): boolean {
    const count = pathCount(bp);
    const protectedPaths = new Set<number>();
    for (let p = 0; p < bp.paths.length; p++) {
      const path = bp.paths[p]!;
      if ((site.up !== null && path.some((c) => sameCoord(c, site.up!))) || (site.down !== null && path.some((c) => sameCoord(c, site.down!)))) {
        protectedPaths.add(p);
      }
    }

    const candidates: { path: number; index: number; distance: number }[] = [];
    for (let p = 0; p < bp.paths.length; p++) {
      if (protectedPaths.has(p)) continue;

      const path = bp.paths[p]!;
      let bestIndex = -1;
      let bestDistance = Number.MAX_SAFE_INTEGER;
      for (let j = BOG_MIN_FROM_SPRING; j < path.length; j++) {
        const d = BogGenerator.minDistance(path[j]!, site.lake);
        if (d <= reach && d < bestDistance) {
          bestDistance = d;
          bestIndex = j;
        }
      }
      if (bestIndex >= 0) candidates.push({ path: p, index: bestIndex, distance: bestDistance });
    }

    candidates.sort((x, y) => x.distance - y.distance || x.path - y.path);

    const lake = site.lake;
    const mouthDir = new Map<string, number>();
    const lakeMouths: AxialCoord[] = [];
    for (const [key] of this.mouth) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      const m = { q, r };
      if (this.lakeMask(m, lake) !== 0) lakeMouths.push(m);
    }
    for (const t of sorted(BogGenerator.neighboursOf(lake))) {
      const mask = this.lakeMask(t, lake);
      const tk = coordKey(t);
      if (popCount(mask) !== 1 || this.mouth.has(tk) || this.creek.has(tk) || !this.inIsland(t)) continue;

      // The mouths of one lake keep three apart.
      if (lakeMouths.some((m) => hexDistance(m, t) < 3)) continue;

      for (let d = 0; d < 6; d++) if (((mask >> d) & 1) === 1) mouthDir.set(tk, d);
    }

    if (mouthDir.size === 0) return false;

    let tried = 0;
    for (const cand of candidates) {
      if (tried++ >= 4) break;

      const p = cand.path;
      const j = cand.index;
      const path = bp.paths[p]!;
      const t = path[j]!;
      if (count.get(coordKey(t)) !== 1) continue;

      // Nothing may join the part that is dropped.
      let dependents = false;
      const removed = new HexSet(path.slice(j + 1));
      if (bp.merged[p] && removed.size > 0) removed.delete(path[path.length - 1]!);

      for (let q = 0; q < bp.paths.length && !dependents; q++) {
        const other = bp.paths[q]!;
        if (q !== p && bp.merged[q] && removed.has(other[other.length - 1]!)) dependents = true;
      }

      if (dependents) continue;

      const creekOk = (c: AxialCoord): boolean =>
        (site.ring.has(c) || this.allowed(c, site.id)) &&
        this.mountainFree(c) &&
        !lake.has(c) &&
        !count.has(coordKey(c)) &&
        this.lakeMask(c, lake) === 0 &&
        hexDistance(c, t) <= reach + MAX_CREEK_LENGTH &&
        !this.anyNeighbour(c, (n) => !sameCoord(n, t) && count.has(coordKey(n)));

      const routes = this.routesFrom(t, dirOf(t, path[j - 1]!), creekOk, mouthDir);
      if (routes.size === 0) continue;

      const route = [...routes.values()].sort((x, y) => x.tiles.length - y.tiles.length || x.mouth.q - y.mouth.q || x.mouth.r - y.mouth.r)[0]!;
      const trial = bp.clone();
      trial.paths[p] = path.slice(0, j + 1);
      trial.merged[p] = false;
      trial.forcedOut.set(coordKey(t), route.dirs[0]!);
      trial.requireRiver.add(coordKey(t));
      if (!this.trialOk(trial, widthTrial, trial.paths[p]!, trial.requireRiver)) continue;

      bp.paths[p] = trial.paths[p]!;
      bp.merged[p] = false;
      bp.forcedOut.set(coordKey(t), route.dirs[0]!);
      bp.requireRiver.add(coordKey(t));
      this.commitRoute(site, route, true, lake);
      return true;
    }

    return false;
  }

  /** A creek spring inside the bog whose creek leaves it and continues as a normal river — mirrors `TrySpawn`. */
  private trySpawn(bp: BogPaths, site: Site, widthTrial: WidthTrial, traceRiver: TraceRiver): boolean {
    const region = this.computeRegion(bp, site);
    const count = pathCount(bp);
    const lake = site.lake;
    const springCandidates = [...region]
      .filter(
        (t) =>
          !this.creek.has(coordKey(t)) &&
          !this.mouth.has(coordKey(t)) &&
          BogGenerator.minDistance(t, lake) >= 3 &&
          BogGenerator.minDistance(t, site.creeks) >= 2 &&
          !count.has(coordKey(t)) &&
          this.mountainFree(t),
      )
      .sort((a, b) => hash2(b.q, b.r, this.seed + 97) - hash2(a.q, a.r, this.seed + 97) || a.q - b.q || a.r - b.r)
      .slice(0, 3);

    for (const s of springCandidates) {
      const creekOk = (c: AxialCoord): boolean =>
        region.has(c) &&
        !count.has(coordKey(c)) &&
        !lake.has(c) &&
        this.lakeMask(c, lake) === 0 &&
        !this.creek.has(coordKey(c)) &&
        !this.mouth.has(coordKey(c)) &&
        this.mountainFree(c) &&
        !this.anyNeighbour(c, (n) => count.has(coordKey(n)));

      // Breadth-first over (tile, heading), exits are tiles just outside the region.
      const parent = new Map<string, RouteState | null>();
      const depth = new Map<string, number>();
      const queue: RouteState[] = [];
      const exits: { exit: AxialCoord; dir: number; from: RouteState | null }[] = [];

      const visit = (origin: AxialCoord, fromState: RouteState | null, dir: number, d: number): void => {
        const n = nb(origin, dir);
        if (!this.inIsland(n) || sameCoord(n, s) || d > MAX_CREEK_LENGTH) return;

        if (!region.has(n)) {
          if (!count.has(coordKey(n)) && !this.bog.has(n) && !this.lake.has(n) && this.lakeMask(n, lake) === 0 && !this.pocketRing.has(n)) {
            exits.push({ exit: n, dir, from: fromState });
          }
          return;
        }

        const key = stateKey(n, dir);
        if (!creekOk(n) || depth.has(key)) return;

        depth.set(key, d);
        parent.set(key, fromState);
        queue.push({ tile: n, dir });
      };

      for (let d0 = 0; d0 < 6; d0++) visit(s, null, d0, 1);

      for (let head = 0; head < queue.length && exits.length < 4; head++) {
        const state = queue[head]!;
        const d = depth.get(stateKey(state.tile, state.dir))!;
        for (const turn of [0, 1, 5]) visit(state.tile, state, (state.dir + turn) % 6, d + 1);
      }

      for (const { exit, dir, from } of exits.slice(0, 4)) {
        const route = buildRoute(exit, dir, from, dir, parent);
        const blocked = new HexSet(this.bog);
        for (const t of this.lake) blocked.add(t);
        for (const t of route.tiles) blocked.add(t);
        blocked.add(s);

        // Rule R12: the spawned river keeps off the creek's neighbours (only its own start touches the creek).
        for (const t of [...route.tiles, s, ...site.core]) for (let d = 0; d < 6; d++) blocked.add(nb(t, d));
        blocked.delete(exit);
        const traced = traceRiver(exit, opp(dir), bp, blocked);
        if (traced === null) continue;

        const trial = bp.clone();
        trial.paths.push(traced);
        trial.merged.push(count.has(coordKey(traced[traced.length - 1]!)));
        trial.bogIn.set(coordKey(exit), opp(dir));

        // A tile of the new river that is also on another path is a junction; the rest must survive the width pass.
        if (!this.trialOk(trial, widthTrial, traced.filter((c) => !count.has(coordKey(c))), trial.requireRiver)) continue;

        bp.paths.push(traced);
        bp.merged.push(count.has(coordKey(traced[traced.length - 1]!)));
        bp.bogIn.set(coordKey(exit), opp(dir));

        // Creek: spring s, tiles t_1..t_k, then the river at `exit`.
        this.spring.set(coordKey(s), route.dirs[0]!);
        this.bog.add(s);
        site.creeks.push(s);
        site.core.add(s);
        for (let j = 0; j < route.tiles.length; j++) {
          const t = route.tiles[j]!;
          this.creek.set(coordKey(t), { in: opp(route.dirs[j]!), out: route.dirs[j + 1]! });
          this.bog.add(t);
          site.creeks.push(t);
          site.core.add(t);
        }

        return true;
      }
    }

    return false;
  }

  // ---------------------------------------------------------------- guarantee

  /** Whether the guarantee is on for this island (by its size) — mirrors `GuaranteeApplies`. */
  get guaranteeApplies(): boolean {
    return this.islandTiles.length >= BOG_GUARANTEE_MIN_TILES;
  }

  /** The guarantee alone, for an island with no river candidates at all: only a spawn bog — mirrors `PlaceGuaranteeOnly`. */
  placeGuaranteeOnly(bp: BogPaths, widthTrial: WidthTrial, traceRiver: TraceRiver): void {
    this.placeGuarantee(bp, widthTrial, traceRiver);
    this.fillHoles(bp);
  }

  private static within(c: AxialCoord, radius: number): AxialCoord[] {
    const result: AxialCoord[] = [];
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) result.push({ q: c.q + dq, r: c.r + dr });
    }
    return result;
  }

  /** Landing-spot candidates by terrain alone — mirrors `GuaranteeCandidates`. */
  private guaranteeCandidates(): AxialCoord[] {
    const result: AxialCoord[] = [];
    for (const tile of this.islandTiles) {
      if (this.terrainOf(tile) !== 'grass') continue;

      let forest = 0;
      let grass = 0;
      for (let d = 0; d < 6; d++) {
        const n = nb(tile, d);
        if (!this.inIsland(n)) continue;
        const terrain = this.terrainOf(n);
        if (terrain === 'forest') forest++;
        else if (terrain === 'grass') grass++;
      }
      if (forest < 1 || grass < 2) continue;

      let coastal = false;
      for (const nearby of BogGenerator.within(tile, 2)) {
        if (!this.inIsland(nearby)) {
          coastal = true;
          break;
        }
      }
      if (!coastal) result.push(tile);
    }
    return result;
  }

  /** Whether `c` is still a candidate with the bog placed so far laid over the terrain — mirrors `StillCandidate`. */
  private stillCandidate(c: AxialCoord): boolean {
    if (this.bog.has(c) || this.lake.has(c)) return false;

    let forest = 0;
    let grass = 0;
    for (let d = 0; d < 6; d++) {
      const n = nb(c, d);
      if (!this.inIsland(n) || this.lake.has(n) || this.bog.has(n)) continue;
      const terrain = this.terrainOf(n);
      if (terrain === 'forest') forest++;
      else if (terrain === 'grass') grass++;
    }
    if (forest < 1 || grass < 2) return false;

    for (const nearby of BogGenerator.within(c, 2)) if (this.lake.has(nearby)) return false;
    return true;
  }

  /** How many candidates are still candidates and have plain bog moss within `reach` — mirrors `CoveredCandidates`. */
  private coveredCandidates(candidates: AxialCoord[], reach: number): number {
    const reachSet = new HexSet();
    for (const t of this.bog) {
      const tk = coordKey(t);
      if (this.lake.has(t) || this.creek.has(tk) || this.mouth.has(tk) || this.spring.has(tk) || this.lakeMask(t, this.lake) !== 0) continue;
      for (const n of BogGenerator.within(t, reach)) reachSet.add(n);
    }
    if (reachSet.size === 0) return 0;

    let covered = 0;
    for (const c of candidates) if (reachSet.has(c) && this.stillCandidate(c)) covered++;
    return covered;
  }

  /** For every tile, how many candidates lie within `reach` of it — mirrors `CoverageMap`. */
  private static coverageMap(candidates: AxialCoord[], reach: number): Map<string, number> {
    const map = new Map<string, number>();
    for (const c of candidates) {
      for (const n of BogGenerator.within(c, reach)) {
        const k = coordKey(n);
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    }
    return map;
  }

  private save(bp: BogPaths): Saved {
    return {
      lake: [...this.lake],
      bog: [...this.bog],
      buffer: new Map(this.lakeBuffer),
      creek: new Map(this.creek),
      mouth: new Map(this.mouth),
      spring: new Map(this.spring),
      sites: this.sites.length,
      paths: bp.clone(),
    };
  }

  private restore(saved: Saved, bp: BogPaths): void {
    this.lake.clear();
    for (const t of saved.lake) this.lake.add(t);
    this.bog.clear();
    for (const t of saved.bog) this.bog.add(t);
    this.lakeBuffer.clear();
    for (const [k, v] of saved.buffer) this.lakeBuffer.set(k, v);
    this.creek.clear();
    for (const [k, v] of saved.creek) this.creek.set(k, v);
    this.mouth.clear();
    for (const [k, v] of saved.mouth) this.mouth.set(k, v);
    this.spring.clear();
    for (const [k, v] of saved.spring) this.spring.set(k, v);
    this.sites.length = saved.sites;
    bp.paths.length = 0;
    for (const path of saved.paths.paths) bp.paths.push(path.map((c) => ({ q: c.q, r: c.r })));
    bp.merged.length = 0;
    bp.merged.push(...saved.paths.merged);
    bp.forcedOut.clear();
    for (const [k, v] of saved.paths.forcedOut) bp.forcedOut.set(k, v);
    bp.bogIn.clear();
    for (const [k, v] of saved.paths.bogIn) bp.bogIn.set(k, v);
    bp.requireRiver.clear();
    for (const c of saved.paths.requireRiver) bp.requireRiver.add(c);
  }

  /** The bog guarantee — mirrors `PlaceGuarantee`. */
  private placeGuarantee(bp: BogPaths, widthTrial: WidthTrial, traceRiver: TraceRiver): void {
    if (!this.guaranteeApplies) return;

    const candidates = this.guaranteeCandidates();
    if (candidates.length === 0 || this.coveredCandidates(candidates, BOG_REACH) > 0) return;

    if (this.stats) {
      this.stats.guaranteeIslands++;
      if (this.sites.length === 0) this.stats.guaranteeWithoutBog++;
    }

    const coverage = BogGenerator.coverageMap(candidates, BOG_REACH);
    if (this.guaranteeThrough(bp, candidates, coverage, widthTrial)) {
      if (this.stats) this.stats.guaranteeThrough++;
      return;
    }

    if (this.guaranteeSpawn(bp, candidates, coverage, widthTrial, traceRiver)) {
      if (this.stats) this.stats.guaranteeSpawns++;
      return;
    }

    if (this.stats) this.stats.guaranteeMissed++;
  }

  private guaranteeThrough(bp: BogPaths, candidates: AxialCoord[], coverage: Map<string, number>, widthTrial: WidthTrial): boolean {
    const radius = BOG_GUARANTEE_RADIUS;
    const anchors: { tile: AxialCoord; path: number; index: number; cover: number; hash: number }[] = [];
    for (let p = 0; p < bp.paths.length; p++) {
      const path = bp.paths[p]!;
      for (let i = GUARANTEE_MIN_FROM_SPRING; i <= path.length - 1 - GUARANTEE_MIN_FROM_MOUTH; i++) {
        const tile = path[i]!;
        const cover = coverage.get(coordKey(tile)) ?? 0;
        const cd = this.coastDist.get(coordKey(tile));
        if (cover === 0 || cd === undefined || cd < GUARANTEE_MIN_COAST_DIST) continue;
        anchors.push({ tile, path: p, index: i, cover, hash: hash2(tile.q, tile.r, this.seed + 103) });
      }
    }

    anchors.sort((a, b) => {
      const byCover = b.cover - a.cover;
      if (byCover !== 0) return byCover;
      const byHash = b.hash - a.hash;
      if (byHash !== 0) return byHash;
      const byTile = cmp(a.tile, b.tile);
      return byTile !== 0 ? byTile : a.path !== b.path ? a.path - b.path : a.index - b.index;
    });

    let attempts = 0;
    for (const anchor of anchors) {
      if (attempts >= MAX_SITE_ATTEMPTS) break;
      if (!this.discIsClear(anchor.tile, 2)) continue;

      attempts++;
      const saved = this.save(bp);
      const site = this.tryPlaceSite(bp, pathCount(bp), anchor.path, anchor.index, radius, GUARANTEE_LAKE_MAX, GUARANTEE_MIN_FROM_SPRING, widthTrial);
      if (site !== null) {
        this.buildRegion(bp, site);
        if (this.padOrCount(bp, site) && this.coveredCandidates(candidates, BOG_REACH) > 0) return true;
      }

      this.restore(saved, bp);
    }

    return false;
  }

  private guaranteeSpawn(
    bp: BogPaths,
    candidates: AxialCoord[],
    coverage: Map<string, number>,
    widthTrial: WidthTrial,
    traceRiver: TraceRiver,
  ): boolean {
    const count = pathCount(bp);
    const anchors: { tile: AxialCoord; cover: number; hash: number }[] = [];
    for (const tile of this.islandTiles) {
      const cover = coverage.get(coordKey(tile)) ?? 0;
      const cd = this.coastDist.get(coordKey(tile));
      if (cover === 0 || cd === undefined || cd < GUARANTEE_MIN_COAST_DIST || !this.allowed(tile)) continue;
      anchors.push({ tile, cover, hash: hash2(tile.q, tile.r, this.seed + 107) });
    }

    anchors.sort((a, b) => {
      const byCover = b.cover - a.cover;
      if (byCover !== 0) return byCover;
      const byHash = b.hash - a.hash;
      return byHash !== 0 ? byHash : cmp(a.tile, b.tile);
    });

    let attempts = 0;
    for (const anchor of anchors) {
      if (attempts >= MAX_SPAWN_ATTEMPTS) break;
      if (BogGenerator.within(anchor.tile, 3).some((c) => count.has(coordKey(c)))) continue;

      attempts++;
      const saved = this.save(bp);
      if (this.trySpawnSite(bp, anchor.tile, widthTrial, traceRiver)) {
        if (this.padOrCount(bp, this.sites[this.sites.length - 1]!) && this.coveredCandidates(candidates, BOG_REACH) > 0) return true;
      }

      this.restore(saved, bp);
    }

    return false;
  }

  /** A small bog on river-free ground with a spring creek into its lake and a river out of it — mirrors `TrySpawnSite`. */
  private trySpawnSite(bp: BogPaths, a: AxialCoord, widthTrial: WidthTrial, traceRiver: TraceRiver): boolean {
    const radius = BOG_GUARANTEE_RADIUS;
    const count = pathCount(bp);
    const isOther = (t: AxialCoord): boolean => count.has(coordKey(t));
    const disc = new HexSet(BogGenerator.within(a, radius));
    const grown = this.growLake(a, disc, radius, GUARANTEE_LAKE_MAX, isOther);
    if (grown === null) return false;

    const { lake, mouthDir } = grown;
    const creekOk = (t: AxialCoord): boolean =>
      disc.has(t) &&
      this.allowed(t) &&
      this.mountainFree(t) &&
      !lake.has(t) &&
      !isOther(t) &&
      this.lakeMask(t, lake) === 0 &&
      !this.anyNeighbour(t, isOther);

    const springs = sorted(disc)
      .filter((t) => creekOk(t) && BogGenerator.minDistance(t, lake) >= 3)
      .sort((x, y) => hash2(y.q, y.r, this.seed + 109) - hash2(x.q, x.r, this.seed + 109) || x.q - y.q || x.r - y.r)
      .slice(0, MAX_SPRING_CANDIDATES);

    for (const s of springs) {
      const inRoutes = this.routesFrom(s, -1, creekOk, mouthDir);
      if (inRoutes.size === 0) continue;

      const inRoute = [...inRoutes.values()].sort((x, y) => x.tiles.length - y.tiles.length || x.mouth.q - y.mouth.q || x.mouth.r - y.mouth.r)[0]!;
      const taken = new HexSet(inRoute.tiles);
      taken.add(s);
      taken.add(inRoute.mouth);
      const outOk = (t: AxialCoord): boolean => creekOk(t) && !taken.has(t);

      const mouthTiles = [...mouthDir.keys()]
        .map((k) => {
          const [q, r] = k.split(',').map(Number) as [number, number];
          return { q, r };
        })
        .sort(cmp);
      for (const mouth of mouthTiles) {
        if (sameCoord(mouth, inRoute.mouth) || hexDistance(mouth, inRoute.mouth) < 3) continue;

        const water = mouthDir.get(coordKey(mouth))!;
        const { exits, parent } = this.outflowExits(mouth, opp(water), lake, disc, count, taken, outOk);
        for (const { exit, dir, from } of exits.slice(0, 4)) {
          const flow = buildRoute(exit, dir, from, dir, parent);
          const blocked = new HexSet(this.bog);
          for (const t of this.lake) blocked.add(t);
          for (const t of lake) blocked.add(t);
          for (const t of BogGenerator.neighboursOf(lake)) blocked.add(t);
          for (const t of taken) blocked.add(t);
          for (const t of flow.tiles) blocked.add(t);
          blocked.add(mouth);

          // Rule R12: the spawned river keeps off the creeks' neighbours (only its own start touches the creek).
          for (const t of [...flow.tiles, ...inRoute.tiles, s, ...BogGenerator.neighboursOf(lake)]) for (let d = 0; d < 6; d++) blocked.add(nb(t, d));
          blocked.delete(exit);
          const traced = traceRiver(exit, opp(dir), bp, blocked);
          if (traced === null) continue;

          const trial = bp.clone();
          trial.paths.push(traced);
          trial.merged.push(count.has(coordKey(traced[traced.length - 1]!)));
          trial.bogIn.set(coordKey(exit), opp(dir));
          if (!this.trialOk(trial, widthTrial, traced.filter((c) => !count.has(coordKey(c))), trial.requireRiver)) continue;

          // Commit: the lake, the spring's creek into it, the creek out of it (reversed: it is laid out from the river tile).
          const site: Site = {
            id: this.sites.length,
            anchor: a,
            pocket: false,
            lake: new HexSet(),
            ring: new HexSet(),
            creeks: [],
            core: new HexSet(),
            radius,
            up: null,
            down: null,
          };
          for (const t of lake) {
            site.lake.add(t);
            site.core.add(t);
            this.lake.add(t);
          }

          this.addBuffer(site);
          this.spring.set(coordKey(s), inRoute.dirs[0]!);
          this.bog.add(s);
          site.creeks.push(s);
          site.core.add(s);
          this.commitRoute(site, inRoute, true, lake);

          const back: Route = { mouth, water, tiles: [], dirs: [] };
          for (let j = flow.tiles.length - 1; j >= 0; j--) back.tiles.push(flow.tiles[j]!);
          for (let j = flow.dirs.length - 1; j >= 0; j--) back.dirs.push(opp(flow.dirs[j]!));

          this.commitRoute(site, back, false, lake);
          this.sites.push(site);

          bp.paths.push(traced);
          bp.merged.push(count.has(coordKey(traced[traced.length - 1]!)));
          bp.bogIn.set(coordKey(exit), opp(dir));
          this.buildRegion(bp, site);
          return true;
        }
      }
    }

    return false;
  }

  /** The free tiles a creek leaving `mouth` in direction `first` can reach the outside of the disc by — mirrors `OutflowExits`. */
  private outflowExits(
    mouth: AxialCoord,
    first: number,
    lake: HexSet,
    disc: HexSet,
    count: Map<string, number>,
    taken: HexSet,
    creekOk: (t: AxialCoord) => boolean,
  ): { exits: { exit: AxialCoord; dir: number; from: RouteState | null }[]; parent: Map<string, RouteState | null> } {
    const parent = new Map<string, RouteState | null>();
    const depth = new Map<string, number>();
    const queue: RouteState[] = [];
    const exits: { exit: AxialCoord; dir: number; from: RouteState | null }[] = [];

    const visit = (origin: AxialCoord, fromState: RouteState | null, dir: number, d: number): void => {
      const n = nb(origin, dir);
      if (!this.inIsland(n) || d > MAX_CREEK_LENGTH) return;

      // A creek tile stays inside the disc on fit ground; anything else that is free land is where the river starts.
      if (disc.has(n) && creekOk(n)) {
        const key = stateKey(n, dir);
        if (depth.has(key)) return;
        depth.set(key, d);
        parent.set(key, fromState);
        queue.push({ tile: n, dir });
        return;
      }

      const nk = coordKey(n);
      if (
        !taken.has(n) &&
        !count.has(nk) &&
        !this.bog.has(n) &&
        !this.lake.has(n) &&
        !this.lakeBuffer.has(nk) &&
        !lake.has(n) &&
        this.lakeMask(n, lake) === 0 &&
        !this.pocketRing.has(n)
      ) {
        exits.push({ exit: n, dir, from: fromState });
      }
    };

    visit(mouth, null, first, 1);
    for (let head = 0; head < queue.length && exits.length < 4; head++) {
      const state = queue[head]!;
      const d = depth.get(stateKey(state.tile, state.dir))!;
      for (const turn of [0, 1, 5]) visit(state.tile, state, (state.dir + turn) % 6, d + 1);
    }

    return { exits, parent };
  }

  // ---------------------------------------------------------------- region

  private buildRegion(bp: BogPaths, site: Site): void {
    for (const t of this.computeRegion(bp, site)) if (!site.lake.has(t)) this.bog.add(t);
  }

  /** The bog moss of a site: a noisy reach around the lake and the creeks, on fit tiles, never on or beside another river; always the core. */
  private computeRegion(bp: BogPaths, site: Site): HexSet {
    const count = pathCount(bp);
    const reach = site.radius - 2;
    const dist = new Map<string, number>();
    const coords = new Map<string, AxialCoord>();
    const queue: AxialCoord[] = [];
    for (const t of sorted([...site.core, ...site.lake])) {
      const k = coordKey(t);
      dist.set(k, 0);
      coords.set(k, t);
      queue.push(t);
    }

    for (let head = 0; head < queue.length; head++) {
      const c = queue[head]!;
      const dc = dist.get(coordKey(c))!;
      if (dc >= reach) continue;
      for (let d = 0; d < 6; d++) {
        const n = nb(c, d);
        const nk = coordKey(n);
        if (!dist.has(nk)) {
          dist.set(nk, dc + 1);
          coords.set(nk, n);
          queue.push(n);
        }
      }
    }

    const fit = (t: AxialCoord): boolean => {
      if (!this.inIsland(t)) return false;
      const terrain = this.terrainOf(t);
      if (terrain !== 'grass' && terrain !== 'forest') return false;
      const cd = this.coastDist.get(coordKey(t));
      if (cd === undefined || cd <= 2) return false;
      const owner = this.lakeBuffer.get(coordKey(t));
      if (count.has(coordKey(t)) || this.lake.has(t) || (owner !== undefined && owner !== site.id)) return false;
      for (let d = 0; d < 6; d++) if (count.has(coordKey(nb(t, d)))) return false;

      // Another bog's moss (not this site's own) is never taken over.
      return !this.bog.has(t) || site.core.has(t) || site.ring.has(t);
    };

    const region = new HexSet(site.core);
    for (const t of sorted(coords.values())) {
      const d = dist.get(coordKey(t))!;
      if (d === 0 || region.has(t)) continue;
      if (!fit(t)) continue;
      if (d === 1 || valueNoise(t.q, t.r, this.seed + 79, 3.0) > (d - 1.0) / reach) region.add(t);
    }

    // Keep only what connects to the core.
    const kept = new HexSet();
    const stack: AxialCoord[] = [];
    for (const t of sorted(site.core)) if (kept.add(t)) stack.push(t);
    while (stack.length > 0) {
      const c = stack.pop()!;
      for (let d = 0; d < 6; d++) {
        const n = nb(c, d);
        if (region.has(n) && kept.add(n)) stack.push(n);
      }
    }

    return kept;
  }

  // ---------------------------------------------------------------- output

  /** Every bog tile classified by what art it needs, sorted by (q, r) — mirrors `Classify`. */
  classify(): BogTile[] {
    const tiles: BogTile[] = [];
    for (const t of sorted(this.lake)) {
      tiles.push({ q: t.q, r: t.r, kind: 'lake', inDirections: [], outDirection: null, waterEdges: [] });
    }

    for (const t of sorted(this.bog)) {
      if (this.lake.has(t)) continue;

      const k = coordKey(t);
      const mask = this.lakeMask(t, this.lake);
      const edges = waterRun(mask);
      const m = this.mouth.get(k);
      const c = this.creek.get(k);
      const s = this.spring.get(k);
      if (m !== undefined) {
        tiles.push({ q: t.q, r: t.r, kind: 'mouth', inDirections: [TILE_ORIENTATIONS[m.in]!], outDirection: TILE_ORIENTATIONS[m.out]!, waterEdges: [TILE_ORIENTATIONS[m.water]!] });
      } else if (c !== undefined) {
        tiles.push({ q: t.q, r: t.r, kind: 'creek', inDirections: [TILE_ORIENTATIONS[c.in]!], outDirection: TILE_ORIENTATIONS[c.out]!, waterEdges: [] });
      } else if (s !== undefined) {
        tiles.push({ q: t.q, r: t.r, kind: 'creekspring', inDirections: [], outDirection: TILE_ORIENTATIONS[s]!, waterEdges: [] });
      } else {
        const kind: BogTileKind = edges.length === 0 ? 'bog' : edges.length === 1 ? 'inlet' : edges.length === 2 ? 'shore' : 'half';
        tiles.push({ q: t.q, r: t.r, kind, inDirections: [], outDirection: null, waterEdges: edges.map((d) => TILE_ORIENTATIONS[d]!) });
      }
    }

    tiles.sort((a, b) => a.q - b.q || a.r - b.r);
    return tiles;
  }
}

function pathCount(bp: BogPaths): Map<string, number> {
  const count = new Map<string, number>();
  for (const path of bp.paths) {
    for (const t of path) {
      const k = coordKey(t);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  return count;
}

function buildRoute(
  mouth: AxialCoord,
  water: number,
  lastState: RouteState | null,
  lastDir: number,
  parent: Map<string, RouteState | null>,
): Route {
  const route: Route = { mouth, water, tiles: [], dirs: [lastDir] };
  let state = lastState;
  while (state !== null) {
    route.tiles.unshift(state.tile);
    route.dirs.unshift(state.dir);
    state = parent.get(stateKey(state.tile, state.dir)) ?? null;
  }
  return route;
}
