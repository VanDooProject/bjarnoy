// Wildlife camp placement — a bit-exact TypeScript port of the backend's
// `Bjarnoy.Domain.World.CampGenerator.PlaceCore` (see that file's own doc
// comment and `docs/design/wildlife-camps.md`): candidate tiles by ground, then
// farthest-point sampling with a minimum spacing, weighted so every ground the
// island has gets a camp before any ground gets a second. Pure and
// side-effect-free; `campPlacement.golden.test.ts` asserts it against the same
// `src/shared/camp-placement-golden.json` fixture the backend's
// `CampPlacementGoldenTests` asserts its own `PlaceCore` against.
//
// The shared family table (`CAMP_FAMILIES`), the guard-range formula and every
// tuning default below are mirrored one to one by `Camp.cs` / `CampGenerator.cs`.
import { coordKey, hexDistance, hexesInRadius, neighbors, type AxialCoord } from '../hex/coords';
import { hash2 } from './worldGenerator';
import { TILE_ORIENTATIONS } from './types';
import type { RiverTile, Terrain, TileOrientation } from './types';

export type CampStrength = 'weak' | 'strong';

/**
 * Which ground a camp family is placed on. `bog` is plain bog moss only (not a lake, shore, mouth or creek);
 * `sea` is open sea far from any shore (a water camp, placed by `placeWhaleRoads`).
 */
export type CampGround = 'grass' | 'forest' | 'sand' | 'mountain' | 'riverStraight' | 'wasteland' | 'bog' | 'sea';

export type CampFamily =
  | 'wolfden'
  | 'boarwallow'
  | 'bearrapids'
  | 'fenrirbrood'
  | 'sealhaulout'
  | 'walrushaulout'
  | 'eagleeyrie'
  | 'moosemire'
  | 'beaverlodge'
  | 'cranedance'
  | 'harewarren'
  | 'deerglade'
  | 'otterslide'
  | 'whaleroad';

export interface CampFamilyInfo {
  family: CampFamily;
  ground: CampGround;
  strength: CampStrength;
  /** Both skews favour low levels. `quadratic`: `u^2` (weak camps); `cubic`: `u^3` (strong camps). */
  levelSkew: 'quadratic' | 'cubic';
}

/** The shared camp family table — mirrors `CampFamilies.All`. */
export const CAMP_FAMILIES: readonly CampFamilyInfo[] = [
  { family: 'wolfden', ground: 'grass', strength: 'strong', levelSkew: 'cubic' },
  { family: 'boarwallow', ground: 'forest', strength: 'strong', levelSkew: 'cubic' },
  { family: 'bearrapids', ground: 'riverStraight', strength: 'strong', levelSkew: 'cubic' },
  { family: 'fenrirbrood', ground: 'wasteland', strength: 'strong', levelSkew: 'cubic' },
  { family: 'sealhaulout', ground: 'sand', strength: 'weak', levelSkew: 'quadratic' },
  { family: 'walrushaulout', ground: 'sand', strength: 'strong', levelSkew: 'cubic' },
  { family: 'eagleeyrie', ground: 'mountain', strength: 'strong', levelSkew: 'cubic' },
  { family: 'moosemire', ground: 'bog', strength: 'strong', levelSkew: 'cubic' },
  { family: 'beaverlodge', ground: 'bog', strength: 'weak', levelSkew: 'quadratic' },
  { family: 'cranedance', ground: 'bog', strength: 'weak', levelSkew: 'quadratic' },
  // The weak camps of grass, forest and river (3D_assets hextile130-132), after the strong ones so
  // each ground's first family keeps its candidate hash (placeCamps).
  { family: 'harewarren', ground: 'grass', strength: 'weak', levelSkew: 'quadratic' },
  { family: 'deerglade', ground: 'forest', strength: 'weak', levelSkew: 'quadratic' },
  { family: 'otterslide', ground: 'riverStraight', strength: 'weak', levelSkew: 'quadratic' },
  // The first water camp (3D_assets hextile134), last so no land family's candidate hash moves; it is placed
  // by its own sea pass (`placeWhaleRoads`), never by `placeCamps`.
  { family: 'whaleroad', ground: 'sea', strength: 'strong', levelSkew: 'cubic' },
];

export function campFamilyInfo(family: string): CampFamilyInfo | undefined {
  return CAMP_FAMILIES.find((f) => f.family === family);
}

export function isStrongCampFamily(family: string): boolean {
  return campFamilyInfo(family)?.strength === 'strong';
}

/** True for a water camp (a family on open sea) — mirrors `CampFamilies.IsWater`. */
export function isWaterCampFamily(family: string): boolean {
  return campFamilyInfo(family)?.ground === 'sea';
}

/** One strong camp per this many land tiles (rounded) — mirrors `CampGenerator.StrongCampTilesPer`. */
export const StrongCampTilesPer = 1500;

/** One weak camp per this many land tiles (rounded) — mirrors `CampGenerator.WeakCampTilesPer`. */
export const WeakCampTilesPer = 600;

/** No island gets more strong camps than this — mirrors `CampGenerator.MaxStrongCampsPerIsland`. */
export const MaxStrongCampsPerIsland = 16;

/** No island gets more weak camps than this — mirrors `CampGenerator.MaxWeakCampsPerIsland`. */
export const MaxWeakCampsPerIsland = 24;

/** An island with fewer land tiles than this gets no camp at all — mirrors `CampGenerator.MinCampIslandTiles`. */
export const MinCampIslandTiles = 60;

/** Two camps are never closer than this many hex steps — mirrors `CampGenerator.MinCampSpacing`. */
export const MinCampSpacing = 6;

/** Camp levels are rolled in `1..MaxCampLevel` — mirrors `CampGenerator.MaxCampLevel`. */
export const MaxCampLevel = 5;

/**
 * A start position keeps away from a strong camp by its guard range plus this margin — it is
 * dropped when its distance to the camp is at most `GuardRange + StartPositionMargin`.
 */
export const StartPositionMargin = 2;

/**
 * The range of land a camp of `level` guards, in hex steps — mirrors `CampGenerator.GuardRange`.
 * Tuning default: weak `1 + floor(level / 2)` (1..3), strong `2 + level` (3..7).
 */
export function guardRange(level: number, strength: CampStrength): number {
  return strength === 'strong' ? 2 + level : 1 + Math.floor(level / 2);
}

/**
 * A camp's guard range by family — mirrors `Camp.GuardRange`: a water camp holds no land and locks no towers, so
 * its range is 0 (for a fleet's route that means "the camp's own hex").
 */
export function campGuardRange(family: string, level: number): number {
  if (isWaterCampFamily(family)) return 0;
  return guardRange(level, isStrongCampFamily(family) ? 'strong' : 'weak');
}

/** Land tiles per sand camp (seal or walrus) — mirrors `CampGenerator.SandTilesPerSealCamp` (the sand rim would otherwise win most farthest-point picks). */
export const SandTilesPerSealCamp = 2000;

/** At most this many sand camps (seal and walrus together) per island — mirrors `CampGenerator.MaxSealCampsFor`. */
export function maxSealCampsFor(landTileCount: number): number {
  return Math.max(1, Math.floor((2 * landTileCount + SandTilesPerSealCamp) / (2 * SandTilesPerSealCamp)));
}

/** Land tiles per eagle eyrie — mirrors `CampGenerator.MountainTilesPerEyrieCamp` (mountains would otherwise take a large share of the strong budget). */
export const MountainTilesPerEyrieCamp = 2000;

/** At most this many eagle eyries per island — mirrors `CampGenerator.MaxEyrieCampsFor`. */
export function maxEyrieCampsFor(landTileCount: number): number {
  return Math.max(1, Math.floor((2 * landTileCount + MountainTilesPerEyrieCamp) / (2 * MountainTilesPerEyrieCamp)));
}

function budgetFor(landTileCount: number, tilesPer: number, max: number): number {
  if (landTileCount < MinCampIslandTiles) return 0;
  return Math.min(Math.max(Math.floor((2 * landTileCount + tilesPer) / (2 * tilesPer)), 0), max);
}

/** The strong-camp budget of an island — mirrors `CampGenerator.StrongCountFor`. */
export function strongCountFor(landTileCount: number): number {
  return budgetFor(landTileCount, StrongCampTilesPer, MaxStrongCampsPerIsland);
}

/** The weak-camp budget of an island — mirrors `CampGenerator.WeakCountFor`. */
export function weakCountFor(landTileCount: number): number {
  return budgetFor(landTileCount, WeakCampTilesPer, MaxWeakCampsPerIsland);
}

/** The most camps an island is offered (both budgets, at least one from 60 tiles) — mirrors `CampGenerator.CampCountFor`. */
export function campCountFor(landTileCount: number): number {
  if (landTileCount < MinCampIslandTiles) return 0;
  return Math.max(1, strongCountFor(landTileCount) + weakCountFor(landTileCount));
}

/**
 * The art rotation of a straight river tile flowing through `direction` — mirrors
 * `CampGenerator.StraightOrientationOf` (and `straightOrientationOf` in `types.ts`).
 */
function straightOrientationOf(direction: TileOrientation): TileOrientation {
  return TILE_ORIENTATIONS[(2 - TILE_ORIENTATIONS.indexOf(direction) + 6) % 6]!;
}

export interface CampPlacement {
  coord: AxialCoord;
  family: CampFamily;
  level: number;
  /** Set only for a bearrapids camp, which follows its river; every other camp takes its tile's own orientation. */
  orientation: TileOrientation | null;
}

interface Candidate {
  coord: AxialCoord;
  info: CampFamilyInfo;
  orientation: TileOrientation | null;
  hash: number;
}

/** Hash salt between a ground's families — mirrors `CampGenerator.FamilyHashSalt`. */
const FamilyHashSalt = 7919;

/** The families placed on a ground, in table order — mirrors `CampGenerator.FamiliesFor`. */
function familiesFor(ground: CampGround): CampFamilyInfo[] {
  return CAMP_FAMILIES.filter((f) => f.ground === ground);
}

/** The ground a plain land tile offers a camp, or `null` when it offers none. */
function groundOf(terrain: Terrain, wasted: boolean): CampGround | null {
  if (wasted) return terrain === 'grass' ? 'wasteland' : null;
  switch (terrain) {
    case 'grass':
      return 'grass';
    case 'forest':
      return 'forest';
    case 'sand':
      return 'sand';
    case 'mountain':
      return 'mountain';
    default:
      return null;
  }
}

function pickBest(
  candidates: Candidate[],
  minDistance: number[],
  picked: boolean[],
  represented: Set<CampGround>,
  restrictToUnrepresented: boolean,
  sandFull: boolean,
  mountainFull: boolean,
  strongOpen: boolean,
  weakOpen: boolean,
): number {
  let best = -1;
  for (let i = 0; i < candidates.length; i++) {
    if (picked[i] || minDistance[i]! < MinCampSpacing) continue;
    if (restrictToUnrepresented && represented.has(candidates[i]!.info.ground)) continue;
    if (candidates[i]!.info.strength === 'strong' ? !strongOpen : !weakOpen) continue;
    if (mountainFull && candidates[i]!.info.ground === 'mountain') continue;
    if (sandFull && candidates[i]!.info.ground === 'sand') continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const byDistance = minDistance[i]! - minDistance[best]!;
    // Equal distance and equal hash: candidates are in (q, r) order, so the earlier one stays.
    if (byDistance > 0 || (byDistance === 0 && candidates[i]!.hash > candidates[best]!.hash)) best = i;
  }
  return best;
}

function rollLevel(candidate: Candidate, seed: number): number {
  const u = hash2(candidate.coord.q, candidate.coord.r, seed + 313);
  // Weak u^2, strong u^3: only * and floor, bit-identical to C#.
  const f = candidate.info.levelSkew === 'quadratic' ? u * u : u * u * u;
  return 1 + Math.min(MaxCampLevel - 1, Math.floor(f * MaxCampLevel));
}

/**
 * The pure placement core — bit-exact mirror of `CampGenerator.PlaceCore` (backend).
 * `riverTiles` may be empty (a demo island with no rivers); `giantAnchors` are the anchors of
 * the island's giants (their 7-hex footprints are kept clear).
 */
export function placeCamps(
  islandTiles: AxialCoord[],
  terrainOf: (c: AxialCoord) => Terrain,
  riverTiles: readonly RiverTile[],
  giantAnchors: readonly AxialCoord[],
  worldSeed: number,
  islandIndex: number,
  wasted = false,
  plainBog: ReadonlySet<string> | null = null,
): CampPlacement[] {
  if (islandTiles.length < MinCampIslandTiles) return [];

  // Large prime spacing so this draws from a noise field independent of the island's
  // rivers/giants/names, the same trick the other generators use.
  const seed = worldSeed + islandIndex * 300_007;

  const blocked = new Set<string>();
  for (const anchor of giantAnchors) {
    blocked.add(coordKey(anchor));
    for (const n of neighbors(anchor)) blocked.add(coordKey(n));
  }

  const riverByHex = new Map<string, RiverTile>();
  for (const tile of riverTiles) riverByHex.set(coordKey(tile), tile);

  const sorted = [...islandTiles].sort((a, b) => a.q - b.q || a.r - b.r);
  const candidates: Candidate[] = [];
  for (const coord of sorted) {
    if (blocked.has(coordKey(coord))) continue;

    let families: CampFamilyInfo[];
    let orientation: TileOrientation | null = null;
    const river = riverByHex.get(coordKey(coord));
    if (river) {
      // Only a plain straight river-width tile may hold bearrapids (a stream or a widening tile
      // has no bearrapids art); every other river tile (and every wasted lava tile) is out.
      if (wasted || river.shape !== 'straight' || (river.width ?? 'river') !== 'river') continue;
      families = familiesFor('riverStraight');
      const direction = river.inDirections.length > 0 ? river.inDirections[0]! : river.outDirection;
      if (!direction) continue;
      orientation = straightOrientationOf(direction);
    } else {
      const terrain = terrainOf(coord);
      if (terrain === 'bog') {
        // Only plain bog moss (not a lake, shore, mouth or creek) holds a camp: the moose mire (strong) or
        // the beaver lodge / crane dance (weak), one candidate each (below).
        families = plainBog !== null && plainBog.has(coordKey(coord)) ? familiesFor('bog') : [];
      } else {
        const ground = groundOf(terrain, wasted);
        families = ground ? familiesFor(ground) : [];
      }
    }

    // One candidate per family the ground holds (sand: the walrus, strong, and the seals, weak), so
    // the two budgets decide which one a tile gets. The first family keeps the plain hash; each
    // further one draws its own. Once a tile is picked, its other candidates sit at distance 0 and
    // can never be picked (MinCampSpacing). Mirrors `CampGenerator.PlaceCore`.
    families.forEach((info, k) => {
      candidates.push({ coord, info, orientation, hash: hash2(coord.q, coord.r, seed + 131 + k * FamilyHashSalt) });
    });
  }

  // Two budgets, one shared farthest-point sampling. An island whose budgets both round to zero
  // still gets one camp, of either kind.
  let strongBudget = strongCountFor(islandTiles.length);
  let weakBudget = weakCountFor(islandTiles.length);
  const count = campCountFor(islandTiles.length);
  if (strongBudget + weakBudget === 0) {
    strongBudget = 1;
    weakBudget = 1;
  }
  let strongUsed = 0;
  let weakUsed = 0;
  const chosen: Candidate[] = [];
  if (candidates.length === 0) return [];

  const minDistance: number[] = new Array<number>(candidates.length).fill(Number.MAX_SAFE_INTEGER);
  const picked: boolean[] = new Array<boolean>(candidates.length).fill(false);
  const represented = new Set<CampGround>();
  const maxSeals = maxSealCampsFor(islandTiles.length);
  const maxEyries = maxEyrieCampsFor(islandTiles.length);
  let seals = 0;
  let eyries = 0;

  while (chosen.length < count) {
    // Grounds without a camp first; once none of them has an eligible tile left, any ground.
    // (The first pick: nothing is placed, so all distances tie and the hash decides.)
    const sandFull = seals >= maxSeals;
    const mountainFull = eyries >= maxEyries;
    const strongOpen = strongUsed < strongBudget;
    const weakOpen = weakUsed < weakBudget;
    let index = pickBest(candidates, minDistance, picked, represented, true, sandFull, mountainFull, strongOpen, weakOpen);
    if (index < 0) index = pickBest(candidates, minDistance, picked, represented, false, sandFull, mountainFull, strongOpen, weakOpen);
    if (index < 0) break;

    const pick = candidates[index]!;
    picked[index] = true;
    chosen.push(pick);
    represented.add(pick.info.ground);
    if (pick.info.strength === 'strong') strongUsed++;
    else weakUsed++;
    if (pick.info.ground === 'sand') seals++;
    if (pick.info.ground === 'mountain') eyries++;
    for (let i = 0; i < candidates.length; i++) {
      const distance = hexDistance(candidates[i]!.coord, pick.coord);
      if (distance < minDistance[i]!) minDistance[i] = distance;
    }
  }

  return chosen.map((c) => ({
    coord: c.coord,
    family: c.info.family,
    level: rollLevel(c, seed),
    orientation: c.orientation,
  }));
}

/** One whale road per this many land tiles (rounded, at least 1) — mirrors `CampGenerator.WhaleTilesPer`. */
export const WhaleTilesPer = 3000;

/** No island gets more whale roads than this — mirrors `CampGenerator.MaxWhaleCampsPerIsland`. */
export const MaxWhaleCampsPerIsland = 3;

/** A whale road lies at least this many hexes from its island's nearest land tile — mirrors `CampGenerator.WhaleMinShoreDistance`. */
export const WhaleMinShoreDistance = 6;

/** A whale road lies at most this many hexes from its island's nearest land tile — mirrors `CampGenerator.WhaleMaxShoreDistance`. */
export const WhaleMaxShoreDistance = 10;

/** No land of any island lies within this many hexes of a whale road — mirrors `CampGenerator.WhaleClearRadius`. */
export const WhaleClearRadius = 5;

/** Two whale roads of one island are never closer than this many hex steps — mirrors `CampGenerator.MinWhaleSpacing`. */
export const MinWhaleSpacing = 12;

/** Hash salts of the sea pass — mirror `CampGenerator.WhaleHashSalt` / `WhaleLevelSalt`. */
const WhaleHashSalt = 4_093;
const WhaleLevelSalt = 5_419;

/** The whale-road budget of an island — mirrors `CampGenerator.WhaleCountFor`: `clamp(round(land / WhaleTilesPer), 1, 3)`. */
export function whaleCountFor(landTileCount: number): number {
  return Math.min(Math.max(Math.floor((2 * landTileCount + WhaleTilesPer) / (2 * WhaleTilesPer)), 1), MaxWhaleCampsPerIsland);
}

interface WhaleCandidate {
  coord: AxialCoord;
  shore: number;
  hash: number;
}

/**
 * The pure sea pass (the first water camp, `whaleroad`) — bit-exact mirror of `CampGenerator.PlaceWhaleRoads`
 * (backend). For an island of at least `MinCampIslandTiles` land tiles: candidates are the hexes whose distance to
 * the island's nearest land tile is `WhaleMinShoreDistance..WhaleMaxShoreDistance` and whose nearest land of any
 * island is that island's (no land of another island at the same or a shorter distance, so none within
 * `WhaleClearRadius`). `whaleCountFor` roads are picked by farthest-point sampling at least `MinWhaleSpacing` apart
 * (first pick: best hash; ties: hash, then q, r). `isLand` answers for the whole world, wasted land included.
 */
export function placeWhaleRoads(
  islandTiles: readonly AxialCoord[],
  isLand: (c: AxialCoord) => boolean,
  worldSeed: number,
  islandIndex: number,
): CampPlacement[] {
  if (islandTiles.length < MinCampIslandTiles) return [];

  const seed = worldSeed + islandIndex * 300_007;
  const count = whaleCountFor(islandTiles.length);
  const own = new Set<string>(islandTiles.map(coordKey));

  // Distance to the nearest island tile of every hex out to WhaleMaxShoreDistance, by expanding rings from the
  // coast (a tile with a neighbour outside the island): no scan of the world.
  const shore = new Map<string, { coord: AxialCoord; d: number }>();
  let frontier: AxialCoord[] = [];
  for (const tile of islandTiles) {
    for (const n of neighbors(tile)) {
      const k = coordKey(n);
      if (!own.has(k) && !shore.has(k)) {
        shore.set(k, { coord: n, d: 1 });
        frontier.push(n);
      }
    }
  }
  for (let d = 2; d <= WhaleMaxShoreDistance; d++) {
    const next: AxialCoord[] = [];
    for (const hex of frontier) {
      for (const n of neighbors(hex)) {
        const k = coordKey(n);
        if (!own.has(k) && !shore.has(k)) {
          shore.set(k, { coord: n, d });
          next.push(n);
        }
      }
    }
    frontier = next;
  }

  const candidates: WhaleCandidate[] = [...shore.values()]
    .filter((e) => e.d >= WhaleMinShoreDistance)
    .sort((a, b) => a.coord.q - b.coord.q || a.coord.r - b.coord.r)
    .map((e) => ({ coord: e.coord, shore: e.d, hash: hash2(e.coord.q, e.coord.r, seed + WhaleHashSalt) }));
  if (candidates.length === 0) return [];

  // Open-sea validity is checked lazily, only for candidates that would win a pick (rejecting a winner is the same
  // as never having offered it): no land of another island within the candidate's own shore distance.
  const validity = new Int8Array(candidates.length);
  const isOpenSea = (i: number): boolean => {
    if (validity[i] === 0) {
      const candidate = candidates[i]!;
      validity[i] = 1;
      for (const hex of hexesInRadius(candidate.coord, candidate.shore)) {
        if (!own.has(coordKey(hex)) && isLand(hex)) {
          validity[i] = 2;
          break;
        }
      }
    }
    return validity[i] === 1;
  };

  const minDistance: number[] = new Array<number>(candidates.length).fill(Number.MAX_SAFE_INTEGER);
  const picked: boolean[] = new Array<boolean>(candidates.length).fill(false);
  const chosen: WhaleCandidate[] = [];

  while (chosen.length < count) {
    // Farthest from every road so far, at least MinWhaleSpacing from all; ties by hash, then (q, r).
    const order: number[] = [];
    for (let i = 0; i < candidates.length; i++) {
      if (!picked[i] && minDistance[i]! >= MinWhaleSpacing && validity[i] !== 2) order.push(i);
    }
    order.sort((a, b) => minDistance[b]! - minDistance[a]! || candidates[b]!.hash - candidates[a]!.hash || a - b);

    let index = -1;
    for (const i of order) {
      if (isOpenSea(i)) {
        index = i;
        break;
      }
    }
    if (index < 0) break;

    picked[index] = true;
    chosen.push(candidates[index]!);
    for (let i = 0; i < candidates.length; i++) {
      const distance = hexDistance(candidates[i]!.coord, candidates[index]!.coord);
      if (distance < minDistance[i]!) minDistance[i] = distance;
    }
  }

  return chosen.map((c) => {
    // Cubic level roll, `1 + floor(u^3 * 5)`, on the sea pass's own salt.
    const u = hash2(c.coord.q, c.coord.r, seed + WhaleLevelSalt);
    return {
      coord: c.coord,
      family: 'whaleroad' as const,
      level: 1 + Math.min(MaxCampLevel - 1, Math.floor(u * u * u * MaxCampLevel)),
      orientation: null,
    };
  });
}
