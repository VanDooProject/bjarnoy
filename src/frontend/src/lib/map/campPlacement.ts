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
import { coordKey, hexDistance, neighbors, type AxialCoord } from '../hex/coords';
import { hash2 } from './worldGenerator';
import { TILE_ORIENTATIONS } from './types';
import type { RiverTile, Terrain, TileOrientation } from './types';

export type CampStrength = 'weak' | 'strong';

/** Which ground a camp family is placed on. `bog` has no terrain yet (a later PR), so no camp is placed there. */
export type CampGround = 'grass' | 'forest' | 'sand' | 'mountain' | 'riverStraight' | 'wasteland' | 'bog';

export type CampFamily =
  | 'wolfden'
  | 'boarwallow'
  | 'bearrapids'
  | 'fenrirbrood'
  | 'sealhaulout'
  | 'eagleeyrie'
  | 'moosemire'
  | 'beaverlodge'
  | 'cranedance';

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
  { family: 'eagleeyrie', ground: 'mountain', strength: 'weak', levelSkew: 'quadratic' },
  { family: 'moosemire', ground: 'bog', strength: 'weak', levelSkew: 'quadratic' },
  { family: 'beaverlodge', ground: 'bog', strength: 'weak', levelSkew: 'quadratic' },
  { family: 'cranedance', ground: 'bog', strength: 'weak', levelSkew: 'quadratic' },
];

export function campFamilyInfo(family: string): CampFamilyInfo | undefined {
  return CAMP_FAMILIES.find((f) => f.family === family);
}

export function isStrongCampFamily(family: string): boolean {
  return campFamilyInfo(family)?.strength === 'strong';
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

/** Land tiles per seal colony — mirrors `CampGenerator.SandTilesPerSealCamp` (the sand rim would otherwise win most farthest-point picks). */
export const SandTilesPerSealCamp = 2000;

/** At most this many seal colonies per island — mirrors `CampGenerator.MaxSealCampsFor`. */
export function maxSealCampsFor(landTileCount: number): number {
  return Math.max(1, Math.floor((2 * landTileCount + SandTilesPerSealCamp) / (2 * SandTilesPerSealCamp)));
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

function familyFor(ground: CampGround): CampFamilyInfo {
  return CAMP_FAMILIES.find((f) => f.ground === ground)!;
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
  strongOpen: boolean,
  weakOpen: boolean,
): number {
  let best = -1;
  for (let i = 0; i < candidates.length; i++) {
    if (picked[i] || minDistance[i]! < MinCampSpacing) continue;
    if (restrictToUnrepresented && represented.has(candidates[i]!.info.ground)) continue;
    if (candidates[i]!.info.strength === 'strong' ? !strongOpen : !weakOpen) continue;
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

    let info: CampFamilyInfo | null;
    let orientation: TileOrientation | null = null;
    const river = riverByHex.get(coordKey(coord));
    if (river) {
      // Only a plain straight river tile may hold bearrapids; every other river tile (and
      // every wasted lava tile) is out.
      // TODO(streams PR): "River width only, not stream" once streams exist.
      if (wasted || river.shape !== 'straight') continue;
      info = familyFor('riverStraight');
      const direction = river.inDirections.length > 0 ? river.inDirections[0]! : river.outDirection;
      if (!direction) continue;
      orientation = straightOrientationOf(direction);
    } else {
      // TODO(bog PR): a plain bog tile (not lake/shore/mouth/creek) picks one of
      // moosemire / beaverlodge / cranedance by hash; bog terrain does not exist yet.
      const ground = groundOf(terrainOf(coord), wasted);
      info = ground ? familyFor(ground) : null;
    }
    if (!info) continue;

    candidates.push({ coord, info, orientation, hash: hash2(coord.q, coord.r, seed + 131) });
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
  let seals = 0;

  while (chosen.length < count) {
    // Grounds without a camp first; once none of them has an eligible tile left, any ground.
    // (The first pick: nothing is placed, so all distances tie and the hash decides.)
    const sandFull = seals >= maxSeals;
    const strongOpen = strongUsed < strongBudget;
    const weakOpen = weakUsed < weakBudget;
    let index = pickBest(candidates, minDistance, picked, represented, true, sandFull, strongOpen, weakOpen);
    if (index < 0) index = pickBest(candidates, minDistance, picked, represented, false, sandFull, strongOpen, weakOpen);
    if (index < 0) break;

    const pick = candidates[index]!;
    picked[index] = true;
    chosen.push(pick);
    represented.add(pick.info.ground);
    if (pick.info.strength === 'strong') strongUsed++;
    else weakUsed++;
    if (pick.info.ground === 'sand') seals++;
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
