// Giant placement v2 — a bit-exact TypeScript port of the backend's
// `Bjarnoy.Domain.World.GiantGenerator.PlaceCore` (see that file's own doc
// comment): scans an island's land hexes for mountain-cluster candidates,
// keeps the best non-overlapping handful (capped by island size), then rolls
// a single shrine anchor. Pure and side-effect-free, mirroring
// `worldGenerator.ts`'s own "server and client agree because both derive
// from the same seed" contract — `giantPlacement.golden.test.ts` asserts
// this against the same `src/shared/giant-placement-golden.json` fixture the
// backend's `GiantPlacementGoldenTests` asserts its own `PlaceCore` against.
//
// Order matters here, not just membership: callers (`stores/world.ts`'s demo
// flow) place giants in the array's own order, and the golden fixture
// compares that order directly.
import { coordKey, neighbors, type AxialCoord } from '../hex/coords';
import { hash2 } from './worldGenerator';
import type { Terrain } from './types';

/** The tile-art family a giant placement uses. Widened to match `Tile.giant.family` — see that field's own doc comment. */
export type GiantFamily = 'giantmountain' | 'giantshrine' | 'giantvolcano';

/**
 * No island start position may fall within this many hex-distance steps
 * short of a giant's footprint — i.e. a start position is dropped when its
 * distance to a giant's anchor is less than `StartPositionExclusionRadius + 1`
 * (a giant's footprint already reaches 1 step from its own anchor). Mirrors
 * `GiantGenerator.StartPositionExclusionRadius`'s own doc comment.
 */
export const StartPositionExclusionRadius = 4;

/** A candidate mountain anchor's footprint must contain at least this many Mountain hexes. */
export const MinimumMountainHexes = 3;

/** Two placed giants' anchors must be at least this many hex-distance steps apart. */
export const MinimumGiantSpacing = 4;

/** An island needs at least this many land tiles to be offered a single mountain giant. */
export const SmallIslandGiantThreshold = 150;

/** An island needs at least this many land tiles to be offered a second mountain giant. */
export const LargeIslandGiantThreshold = 450;

/** The tile-art family a mountain-cluster giant uses. */
export const MountainFamily: GiantFamily = 'giantmountain';

/** The tile-art family a shrine giant uses. */
export const ShrineFamily: GiantFamily = 'giantshrine';

/** Per-island odds that a qualifying island is offered a shrine — see `GiantGenerator.ShrineChance`. */
export const ShrineChance = 1 / 12;

export interface GiantPlacement {
  anchor: AxialCoord;
  family: GiantFamily;
}

/** The anchor and its six neighbours, anchor first — mirrors `Giant.Footprint`. */
function footprint(anchor: AxialCoord): AxialCoord[] {
  return [anchor, ...neighbors(anchor)];
}

function maxGiantsFor(landTileCount: number): number {
  if (landTileCount >= LargeIslandGiantThreshold) return 2;
  if (landTileCount >= SmallIslandGiantThreshold) return 1;
  return 0;
}

function hexDistanceAxial(a: AxialCoord, b: AxialCoord): number {
  const aq = a.q, ar = a.r, as = -a.q - a.r;
  const bq = b.q, br = b.r, bs = -b.q - b.r;
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

/** All hexes within `radius` of `center` — order doesn't matter here, unlike `hexesInRadius`'s closest-ring-first contract. */
function withinRadius(center: AxialCoord, radius: number): AxialCoord[] {
  const out: AxialCoord[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) {
      out.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return out;
}

function sortedByQR(tiles: AxialCoord[]): AxialCoord[] {
  return [...tiles].sort((a, b) => a.q - b.q || a.r - b.r);
}

interface MountainCandidate {
  anchor: AxialCoord;
  mountainCount: number;
  tieBreak: number;
}

function scoreMountainCandidate(
  anchor: AxialCoord,
  islandLand: Set<string>,
  terrainOf: (c: AxialCoord) => Terrain,
  isRiver: (c: AxialCoord) => boolean,
  seed: number,
): MountainCandidate | null {
  let mountainCount = 0;
  for (const hex of footprint(anchor)) {
    const key = coordKey(hex);
    if (!islandLand.has(key) || isRiver(hex)) return null;

    const terrain = terrainOf(hex);
    if (terrain !== 'grass' && terrain !== 'forest' && terrain !== 'mountain') return null;
    if (terrain === 'mountain') mountainCount++;
  }

  if (mountainCount < MinimumMountainHexes) return null;

  return { anchor, mountainCount, tieBreak: hash2(anchor.q, anchor.r, seed + 97) };
}

function isShrineCandidate(
  anchor: AxialCoord,
  islandLand: Set<string>,
  terrainOf: (c: AxialCoord) => Terrain,
  isRiver: (c: AxialCoord) => boolean,
  mountainAnchors: AxialCoord[],
): boolean {
  for (const hex of footprint(anchor)) {
    const key = coordKey(hex);
    if (!islandLand.has(key) || isRiver(hex)) return false;

    const terrain = terrainOf(hex);
    if (terrain !== 'grass' && terrain !== 'forest') return false;
  }

  for (const nearby of withinRadius(anchor, 2)) {
    if (!islandLand.has(coordKey(nearby))) return false;
  }

  for (const mountain of mountainAnchors) {
    if (hexDistanceAxial(anchor, mountain) < MinimumGiantSpacing) return false;
  }

  return true;
}

function pickShrineAnchor(
  islandTiles: AxialCoord[],
  islandLand: Set<string>,
  terrainOf: (c: AxialCoord) => Terrain,
  isRiver: (c: AxialCoord) => boolean,
  mountainAnchors: AxialCoord[],
  seed: number,
): AxialCoord | null {
  let best: AxialCoord | null = null;
  let bestHash = -1;

  for (const anchor of sortedByQR(islandTiles)) {
    if (!isShrineCandidate(anchor, islandLand, terrainOf, isRiver, mountainAnchors)) continue;

    const h = hash2(anchor.q, anchor.r, seed + 101);
    if (best === null || h > bestHash || (h === bestHash && (anchor.q - best.q || anchor.r - best.r) < 0)) {
      best = anchor;
      bestHash = h;
    }
  }

  return best;
}

/**
 * The pure placement core — bit-exact mirror of
 * `GiantGenerator.PlaceCore` (backend). `isRiver` defaults to "no rivers"
 * (the frontend's demo mode has no river data), matching how demo-mode
 * callers use it today.
 */
export function placeGiants(
  islandTiles: AxialCoord[],
  terrainOf: (c: AxialCoord) => Terrain,
  worldSeed: number,
  islandIndex: number,
  isRiver: (c: AxialCoord) => boolean = () => false,
): GiantPlacement[] {
  const islandLand = new Set(islandTiles.map((c) => coordKey(c)));
  const placements: GiantPlacement[] = [];

  // Large prime spacing so this draws from a noise field independent of the
  // island's rivers/names — the same trick the backend's RiverGenerator and
  // IslandNames use for their own per-index offsets.
  const seed = worldSeed + islandIndex * 200_003;

  const maxGiants = maxGiantsFor(islandTiles.length);
  const mountainAnchors: AxialCoord[] = [];

  if (maxGiants > 0) {
    const candidates: MountainCandidate[] = [];
    for (const anchor of sortedByQR(islandTiles)) {
      const candidate = scoreMountainCandidate(anchor, islandLand, terrainOf, isRiver, seed);
      if (candidate) candidates.push(candidate);
    }

    // Best first: more Mountain hexes wins; ties broken by the seed-derived
    // hash of the anchor, so placement is deterministic without depending on
    // scan order.
    candidates.sort((a, b) => b.mountainCount - a.mountainCount || b.tieBreak - a.tieBreak);

    for (const candidate of candidates) {
      if (mountainAnchors.length >= maxGiants) break;
      if (mountainAnchors.some((a) => hexDistanceAxial(a, candidate.anchor) < MinimumGiantSpacing)) continue;

      mountainAnchors.push(candidate.anchor);
      placements.push({ anchor: candidate.anchor, family: MountainFamily });
    }
  }

  // Shrines are additional — rolled independently of the mountain
  // count/cap, so even an island that got no mountain giant (or maxed out
  // its two) can still offer a shrine.
  if (islandTiles.length >= SmallIslandGiantThreshold && hash2(islandIndex, 0, worldSeed + 211) < ShrineChance) {
    const shrineAnchor = pickShrineAnchor(islandTiles, islandLand, terrainOf, isRiver, mountainAnchors, seed);
    if (shrineAnchor) placements.push({ anchor: shrineAnchor, family: ShrineFamily });
  }

  return placements;
}
