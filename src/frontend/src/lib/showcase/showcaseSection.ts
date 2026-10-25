// The /showcase page's "One view — map and village" frame draws a small,
// hand-composed section instead of a crop of a real island: a real island is
// big patches of the same ground (wall-to-wall grass, forest, sand), which
// reads as repetition at this zoom. This module generates a section built for
// the opposite — every neighbouring hex looks different, and the section holds
// what the page's copy promises (a giant, wildlife camps, a built-up village).
//
// Pure data (a `Tile[]` for `StaticWorldModel`), deterministic per seed, no
// Vue/DOM and no Math.random, so it is unit tested directly.
import { coordKey, hexDistance, hexRing, hexesInRadius, neighbors, type AxialCoord } from '../hex/coords';
import { giantCoverage } from '../map/giantTiles';
import { guardRange, isStrongCampFamily } from '../map/campPlacement';
import { TILE_ORIENTATIONS, type Tile, type TileOrientation } from '../map/types';
import { DECORATED_BOG_VARIANTS } from './showcaseVillage';

/** Land is the disc of this radius; the ring just outside it is coastal water. */
const LAND_RADIUS = 7;
/** The giant mountain's anchor: far enough out that the village (within 3 of the centre) never touches its 7 hexes. */
const GIANT_ANCHOR_DISTANCE = 5;
const VILLAGE_MIN_DISTANCE = 1;
const VILLAGE_MAX_DISTANCE = 3;
/** Giants render at the base camera only (see `giantTiles.ts`), so all 7 parts share one fixed orientation. */
const GIANT_ORIENTATION: TileOrientation = 'SE';
/** A hex may have this many other grass-only village hexes beside it: grass has just 4 looks, 5+ grass neighbours could leave it none. */
const MAX_FEATURE_NEIGHBOURS = 2;
/** Generation retries (each draws fresh numbers from the same PRNG) when the greedy look assignment paints itself into a corner. */
const MAX_ATTEMPTS = 50;

type Ground = 'grass' | 'forest' | 'bog' | 'sand';
type BuildingType = NonNullable<Tile['buildingType']>;

/** Relative weight of each ground among the free hexes: mostly decorated bog (the richest art), then grass, then forest. */
const GROUND_WEIGHTS: Record<Exclude<Ground, 'sand'>, number> = { bog: 40, grass: 35, forest: 25 };

/**
 * Every look the art pack offers per ground: grass variants 0-3, forest 0-2,
 * one sand, and the decorated bog moss looks (look 0 is the plain moss, which
 * would be the same flat patch the section exists to avoid). Non-bog families
 * clamp the variant index, so staying in range keeps each look distinct.
 */
const LOOKS: Record<Ground, readonly number[]> = {
  grass: [0, 1, 2, 3],
  forest: [0, 1, 2],
  sand: [0],
  bog: DECORATED_BOG_VARIANTS,
};

/** The renderer shows bog moss as `variant % 9`; every other terrain by its variant. */
const MOSS_LOOKS = 9;

/**
 * What a land hex looks like, as a comparable string: terrain plus the variant
 * the renderer actually resolves (moss wraps at 9). Exported for the tests.
 */
export function lookOf(tile: Pick<Tile, 'terrain' | 'variant'>): string {
  const variant = tile.variant ?? 0;
  return `${tile.terrain}:${tile.terrain === 'bog' ? variant % MOSS_LOOKS : variant}`;
}

/** mulberry32: a tiny seeded PRNG (the section only needs "different per seed, same every time"). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private readonly next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float() {
    return this.next();
  }
  int(count: number) {
    return Math.floor(this.next() * count);
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }
  /** Fisher-Yates on a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}

/** One hex that must stand on a given ground (a building site, a camp, the beach). */
interface Feature {
  coord: AxialCoord;
  ground: Ground;
  buildingType?: BuildingType;
  buildingLevel?: number;
  camp?: { family: string; level: number };
}

/** The village: building, ground it needs, and where it may stand (distance from the centre). Order matters, the most visible ones first. */
const VILLAGE_BUILDINGS: { type: BuildingType; ground: Ground }[] = [
  { type: 'hut', ground: 'grass' },
  { type: 'hut', ground: 'grass' },
  { type: 'hut', ground: 'grass' },
  { type: 'farm', ground: 'grass' },
  { type: 'farm', ground: 'grass' },
  { type: 'storagehouse', ground: 'grass' },
  { type: 'tower', ground: 'grass' },
  { type: 'shrineofthor', ground: 'grass' },
  { type: 'barracks', ground: 'grass' },
  { type: 'smithy', ground: 'grass' },
  { type: 'meadery', ground: 'grass' },
  { type: 'townsquare', ground: 'grass' },
  { type: 'lumberjack', ground: 'forest' },
  // Bog buildings stand on plain moss (the hex keeps its decorated look).
  { type: 'bogoreworks', ground: 'bog' },
  { type: 'claybrickworks', ground: 'bog' },
];

/** Wildlife camps: the family each ground wants (`CAMP_FAMILIES`), picked for the strong/weak mix and a recognisable animal each. */
const CAMPS: { family: string; ground: Ground }[] = [
  { family: 'wolfden', ground: 'grass' },
  { family: 'boarwallow', ground: 'forest' },
  { family: 'sealhaulout', ground: 'sand' },
];

function tooCloseToAny(c: AxialCoord, others: readonly AxialCoord[], min: number): boolean {
  return others.some((o) => hexDistance(c, o) < min);
}

/** Picks every feature hex for one attempt; null when the layout cannot be fitted (the caller retries). */
function planFeatures(rng: Rng, giantHexes: Set<string>): Feature[] | null {
  const features: Feature[] = [];
  const taken = new Set<string>(giantHexes);

  // The beach: sand on alternating hexes of the outer land ring (a full sand
  // ring would put identical looks side by side, the one thing this avoids).
  const ring = hexRing({ q: 0, r: 0 }, LAND_RADIUS);
  const parity = rng.int(2);
  ring.forEach((c, i) => {
    if (i % 2 === parity && rng.float() < 0.85 && !giantHexes.has(coordKey(c))) {
      features.push({ coord: c, ground: 'sand' });
      taken.add(coordKey(c));
    }
  });

  // Longhouse first: the village is laid out around it.
  features.push({ coord: { q: 0, r: 0 }, ground: 'grass', buildingType: 'longhouse', buildingLevel: 3 });
  taken.add(coordKey({ q: 0, r: 0 }));

  const villageRing = rng.shuffle(
    hexesInRadius({ q: 0, r: 0 }, VILLAGE_MAX_DISTANCE).filter(
      (c) => hexDistance({ q: 0, r: 0 }, c) >= VILLAGE_MIN_DISTANCE,
    ),
  );
  for (const spec of VILLAGE_BUILDINGS) {
    // Grass sites are spread out (see MAX_FEATURE_NEIGHBOURS); forest/bog sites sit a little further from the centre so the village keeps its core of grass.
    const minDistance = spec.ground === 'grass' ? VILLAGE_MIN_DISTANCE : 2;
    const site = villageRing.find((c) => {
      if (taken.has(coordKey(c)) || hexDistance({ q: 0, r: 0 }, c) < minDistance) return false;
      const crowd = neighbors(c).filter((n) => features.some((f) => f.ground !== 'sand' && coordKey(f.coord) === coordKey(n))).length;
      return crowd <= MAX_FEATURE_NEIGHBOURS;
    });
    if (!site) return null;
    taken.add(coordKey(site));
    features.push({
      coord: site,
      ground: spec.ground,
      buildingType: spec.type,
      buildingLevel: 1 + rng.int(3),
    });
  }

  // Camps clear of the village and each other; the seal colony needs a beach hex.
  const campSpots: AxialCoord[] = [];
  for (const camp of CAMPS) {
    const candidates = rng.shuffle(
      hexesInRadius({ q: 0, r: 0 }, LAND_RADIUS).filter((c) => {
        const key = coordKey(c);
        if (giantHexes.has(key)) return false;
        const existing = features.find((f) => coordKey(f.coord) === key);
        if (camp.ground === 'sand') return existing?.ground === 'sand' && !existing.camp;
        return !taken.has(key) && hexDistance({ q: 0, r: 0 }, c) >= 5 && hexDistance({ q: 0, r: 0 }, c) < LAND_RADIUS;
      }),
    );
    const spot = candidates.find((c) => !tooCloseToAny(c, campSpots, 4));
    if (!spot) return null;
    campSpots.push(spot);
    const level = 1 + rng.int(3);
    const existing = features.find((f) => coordKey(f.coord) === coordKey(spot));
    if (existing) existing.camp = { family: camp.family, level };
    else {
      taken.add(coordKey(spot));
      features.push({ coord: spot, ground: camp.ground, camp: { family: camp.family, level } });
    }
  }

  return features;
}

/** The ground classes allowed at `coord`, given which looks its already-painted neighbours use. */
function pickLook(rng: Rng, allowed: readonly Ground[], forbidden: Set<string>): { ground: Ground; variant: number } | null {
  const options = allowed.flatMap((ground) =>
    LOOKS[ground]
      .filter((variant) => !forbidden.has(lookOf({ terrain: ground, variant })))
      .map((variant) => ({ ground, variant })),
  );
  if (options.length === 0) return null;
  const groundsLeft = [...new Set(options.map((o) => o.ground))];
  const weights = groundsLeft.map((g) => (g === 'sand' ? 1 : GROUND_WEIGHTS[g]));
  let roll = rng.float() * weights.reduce((a, b) => a + b, 0);
  let ground = groundsLeft[groundsLeft.length - 1]!;
  for (let i = 0; i < groundsLeft.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) {
      ground = groundsLeft[i]!;
      break;
    }
  }
  return rng.pick(options.filter((o) => o.ground === ground));
}

function attempt(rng: Rng): Tile[] | null {
  const origin = { q: 0, r: 0 };

  // The giant mountain: its 7 hexes are one art object on grass, anchored out
  // in a seeded direction.
  const anchorRing = hexRing(origin, GIANT_ANCHOR_DISTANCE);
  const anchor = anchorRing[rng.int(anchorRing.length)]!;
  const coverage = giantCoverage(anchor);
  const giantHexes = new Set(coverage.map((c) => coordKey(c.coord)));

  const features = planFeatures(rng, giantHexes);
  if (!features) return null;
  const featureAt = new Map(features.map((f) => [coordKey(f.coord), f]));

  const tiles = new Map<string, Tile>();
  for (const { coord, part } of coverage) {
    tiles.set(coordKey(coord), {
      q: coord.q,
      r: coord.r,
      terrain: 'grass',
      orientation: GIANT_ORIENTATION,
      giant: { family: 'giantmountain', anchor, part, orientation: GIANT_ORIENTATION },
    });
  }

  // Feature hexes are painted first (they have the fewest choices), then the
  // free land in random order; each takes a look none of its painted neighbours has.
  const land = hexesInRadius(origin, LAND_RADIUS).filter((c) => !giantHexes.has(coordKey(c)));
  const order = [
    ...land.filter((c) => featureAt.has(coordKey(c))),
    ...rng.shuffle(land.filter((c) => !featureAt.has(coordKey(c)))),
  ];
  for (const c of order) {
    const feature = featureAt.get(coordKey(c));
    const forbidden = new Set<string>();
    for (const n of neighbors(c)) {
      const t = tiles.get(coordKey(n));
      if (t && !t.giant) forbidden.add(lookOf(t));
    }
    const allowed: Ground[] = feature ? [feature.ground] : ['bog', 'grass', 'forest'];
    const look = pickLook(rng, allowed, forbidden);
    if (!look) return null;
    const tile: Tile = {
      q: c.q,
      r: c.r,
      terrain: look.ground,
      variant: look.variant,
      orientation: rng.pick(TILE_ORIENTATIONS),
    };
    if (look.ground === 'bog') {
      tile.bog = { q: c.q, r: c.r, kind: 'bog', inDirections: [], outDirection: null, waterEdges: [] };
    }
    if (feature?.buildingType) {
      tile.buildingType = feature.buildingType;
      tile.buildingLevel = feature.buildingLevel;
    }
    if (feature?.camp) {
      const strong = isStrongCampFamily(feature.camp.family);
      tile.camp = {
        family: feature.camp.family,
        level: feature.camp.level,
        orientation: tile.orientation ?? 'SE',
        strong,
        guardRange: guardRange(feature.camp.level, strong ? 'strong' : 'weak'),
      };
    }
    tiles.set(coordKey(c), tile);
  }

  // Outer ring: coastal water. The dockyard and fishing hut stand on it, apart
  // from each other and on the side away from the giant.
  const water = rng.shuffle(hexRing(origin, LAND_RADIUS + 1));
  const coastal: BuildingType[] = ['dockyard', 'fishinghut'];
  const used: AxialCoord[] = [];
  for (const c of water) {
    const tile: Tile = { q: c.q, r: c.r, terrain: 'sea', isCoastalWater: true };
    const type = coastal[used.length];
    const nextToGiant = neighbors(c).some((n) => giantHexes.has(coordKey(n)));
    if (type && !nextToGiant && !tooCloseToAny(c, used, 4)) {
      tile.buildingType = type;
      tile.buildingLevel = 1 + rng.int(3);
      used.push(c);
    }
    tiles.set(coordKey(c), tile);
  }
  if (used.length < coastal.length) return null;
  return [...tiles.values()];
}

/**
 * A random hex section around (0, 0), for a seed: land of radius 7 inside a
 * ring of coastal water, with no two neighbouring hexes alike, one giant
 * mountain, three wildlife camps and a built-up village around a level-3
 * longhouse. Deterministic per seed.
 */
export function buildShowcaseSection(seed: number): Tile[] {
  const rng = new Rng(seed);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const tiles = attempt(rng);
    if (tiles) return tiles;
  }
  throw new Error(`showcase section for seed ${seed}: no layout after ${MAX_ATTEMPTS} attempts`);
}
