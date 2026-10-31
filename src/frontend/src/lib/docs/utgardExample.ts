// The Wasted Lands docs page's Utgard example map (UtgardExample.vue): a small hand-placed wasted island laid out by the endgame map's
// rules for Utgard's defences, drawn by the game's own renderer through a `StaticWorldModel`:
//
// - Two rings of Utgard wall are hex rings round Utgard's anchor: the inner one at radius 3 (wall level 2), the outer one at radius 6
//   (wall level 1). A ring is only built when at least 60% of its hexes can take a wall (the terrain test palisades use); where a run
//   reaches the sea it ends in a shore piece (the sea end, on coastal water). Here the outer ring's east side meets a bay.
// - Which piece each wall hex is, and how it is turned, comes from the palisade piece rules (`resolveWall`, palisadeTiles.ts), exactly as
//   for WallExample.vue; the renderer decides again from the neighbours when it draws.
// - Each ring has up to two gates, on straight pieces, as far apart as the ring allows.
// - An island gets clamp(floor(land / 120 + 0.5), 3, 6) Jötun watchtowers. They stand outside the outer ring, at least 5 hexes from each
//   other and from Utgard, never on a camp, giant or wall hex.
import { coordKey, hexDistance, neighbors, parseKey, type AxialCoord } from '../hex/coords';
import { giantCoverage } from '../map/giantTiles';
import { isRefusal, resolveWall, type PalisadePiece, type WallSet } from '../map/palisadeTiles';
import type { Terrain, Tile } from '../map/types';
import { DEFAULT_GENERATION, defaultOrientation, variantForTerrain, type WorldSeed } from '../map/worldGenerator';

const EXAMPLE_WORLD: WorldSeed = { seed: 5, generation: DEFAULT_GENERATION };

/** Utgard's anchor: the centre hex of its seven. */
export const UTGARD_CENTRE: AxialCoord = { q: 0, r: 0 };

/** The two rings: radius from the anchor and the wall level they stand at. */
export const UTGARD_RINGS = [
  { id: 'inner', radius: 3, level: 2 },
  { id: 'outer', radius: 6, level: 1 },
] as const;
export type UtgardRingId = (typeof UTGARD_RINGS)[number]['id'];

/** A ring is built when at least this share of its hexes can take a wall. */
export const RING_MIN_SHARE = 0.6;
/** Gates per ring, at most. */
export const RING_MAX_GATES = 2;
/** Watchtowers stand at least this far from each other and from Utgard. */
export const TOWER_MIN_SPACING = 5;

/** Land reaches this far from Utgard's anchor; one more ring of coastal water goes round it. */
const LAND_RADIUS = 7;

/** The bay that cuts into the island's east side and reaches the outer ring: sea hexes, two of them (ring hexes) carry a sea end. */
const BAY: readonly AxialCoord[] = [
  { q: 5, r: 1 },
  { q: 6, r: 0 },
  { q: 4, r: 2 },
  { q: 6, r: 1 },
  { q: 5, r: 2 },
];
const BAY_KEYS = new Set(BAY.map(coordKey));

/** The Jötun watchtowers, on the ring of land just outside the outer ring. */
export const UTGARD_TOWERS: readonly AxialCoord[] = [
  { q: 3, r: -7 },
  { q: -7, r: 3 },
  { q: -2, r: 7 },
];

const WALK: readonly AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Every hex at `radius` from Utgard's anchor, in order round the ring. */
export function hexRing(radius: number): AxialCoord[] {
  const out: AxialCoord[] = [];
  let at: AxialCoord = { q: UTGARD_CENTRE.q - radius, r: UTGARD_CENTRE.r + radius };
  for (const step of WALK) {
    for (let i = 0; i < radius; i++) {
      out.push(at);
      at = { q: at.q + step.q, r: at.r + step.r };
    }
  }
  return out;
}

/** The island's terrain by hex: land out to `LAND_RADIUS`, the bay as sea. */
function terrainOf(c: AxialCoord): Terrain {
  return hexDistance(c, UTGARD_CENTRE) > LAND_RADIUS || BAY_KEYS.has(coordKey(c)) ? 'sea' : 'grass';
}

/** The hexes of a ring that hold a wall: its land hexes, and the sea hexes beside its land run that carry the shore end. */
export function ringWallHexes(id: UtgardRingId): AxialCoord[] {
  const ring = UTGARD_RINGS.find((r) => r.id === id)!;
  const hexes = hexRing(ring.radius);
  // Inner ring: all land. Outer ring: the bay's sea hexes are not wall, except the two at the ends of the land runs.
  return hexes.filter((c) => terrainOf(c) === 'grass' || isShoreEnd(c, hexes));
}

/** A sea hex of the ring that touches exactly one land wall hex of the ring: where a run reaches the sea it ends here. */
function isShoreEnd(c: AxialCoord, ring: readonly AxialCoord[]): boolean {
  if (terrainOf(c) !== 'sea') return false;
  const landWalls = ring.filter((h) => terrainOf(h) === 'grass').map(coordKey);
  return neighbors(c).filter((n) => landWalls.includes(coordKey(n))).length === 1;
}

/** The share of a ring's hexes that can take a wall (land, for walls). */
export function ringBuildableShare(id: UtgardRingId): number {
  const ring = UTGARD_RINGS.find((r) => r.id === id)!;
  const hexes = hexRing(ring.radius);
  return hexes.filter((c) => terrainOf(c) === 'grass').length / hexes.length;
}

function wallSetOf(hexes: readonly AxialCoord[], gates: readonly AxialCoord[] = []): WallSet {
  return { walls: new Set(hexes.map(coordKey)), gates: new Set(gates.map(coordKey)) };
}

/** The pieces a ring's hexes resolve to by the palisade piece rules. */
export function ringPieces(id: UtgardRingId, gates: readonly AxialCoord[] = ringGates(id)): Map<string, PalisadePiece> {
  const resolved = resolveWall(wallSetOf(ringWallHexes(id), gates), terrainOf, parseKey);
  const pieces = new Map<string, PalisadePiece>();
  for (const [key, result] of resolved) if (!isRefusal(result)) pieces.set(key, result.piece);
  return pieces;
}

/**
 * A ring's gates: up to two, each on a hex that is a straight piece without them, as far apart as the ring allows (the pair of straight
 * hexes with the greatest hex distance between them; the first such pair round the ring).
 */
export function ringGates(id: UtgardRingId): AxialCoord[] {
  const hexes = ringWallHexes(id);
  const straight = resolveWall(wallSetOf(hexes), terrainOf, parseKey);
  const candidates = hexes.filter((c) => {
    const result = straight.get(coordKey(c));
    return result && !isRefusal(result) && result.piece === 'straight180';
  });
  let best: [AxialCoord, AxialCoord] | null = null;
  let bestDistance = -1;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const d = hexDistance(candidates[i]!, candidates[j]!);
      if (d > bestDistance) {
        bestDistance = d;
        best = [candidates[i]!, candidates[j]!];
      }
    }
  }
  return best ? [...best].slice(0, RING_MAX_GATES) : [];
}

export type UtgardExampleKind = 'utgard' | 'wall' | 'gate' | 'tower' | 'wasteland' | 'coast';

export function utgardExampleKindOf(tile: Tile): UtgardExampleKind {
  if (tile.giant) return 'utgard';
  if (tile.buildingType === 'palisadegate') return 'gate';
  if (tile.buildingType === 'palisade') return 'wall';
  if (tile.buildingType === 'tower') return 'tower';
  return tile.terrain === 'sea' ? 'coast' : 'wasteland';
}

/** The number of Jötun watchtowers an island of `land` land hexes gets. */
export function utgardTowerCount(land: number): number {
  return Math.min(6, Math.max(3, Math.floor(land / 120 + 0.5)));
}

/** The island as the map tiles the game's own renderer draws. */
export function buildUtgardExampleTiles(): Tile[] {
  const tiles = new Map<string, Tile>();
  const place = (c: AxialCoord, terrain: Terrain, extra: Partial<Tile> = {}): void => {
    tiles.set(coordKey(c), {
      q: c.q,
      r: c.r,
      terrain,
      wasted: true,
      orientation: defaultOrientation(c.q, c.r, EXAMPLE_WORLD),
      variant: variantForTerrain(c.q, c.r, EXAMPLE_WORLD, terrain),
      ...(terrain === 'sea' ? { isCoastalWater: true } : {}),
      ...extra,
    });
  };
  for (let q = -LAND_RADIUS; q <= LAND_RADIUS; q++) {
    for (let r = Math.max(-LAND_RADIUS, -q - LAND_RADIUS); r <= Math.min(LAND_RADIUS, -q + LAND_RADIUS); r++) {
      place({ q, r }, terrainOf({ q, r }));
    }
  }
  for (const { coord, part } of giantCoverage(UTGARD_CENTRE)) {
    place(coord, 'grass', { orientation: 'SE', giant: { family: 'giantutgard', anchor: UTGARD_CENTRE, part, orientation: 'SE' } });
  }
  for (const ring of UTGARD_RINGS) {
    const gates = new Set(ringGates(ring.id).map(coordKey));
    for (const c of ringWallHexes(ring.id)) {
      place(c, terrainOf(c), {
        buildingType: gates.has(coordKey(c)) ? 'palisadegate' : 'palisade',
        buildingLevel: ring.level,
      });
    }
  }
  for (const c of UTGARD_TOWERS) place(c, 'grass', { buildingType: 'tower', buildingLevel: 2 });
  // The sea round the land: one ring of coastal water.
  for (const t of [...tiles.values()]) {
    for (const n of neighbors(t)) if (!tiles.has(coordKey(n))) place(n, 'sea');
  }
  return [...tiles.values()];
}

/** How many land hexes the island has (what the tower count is worked out from). */
export function utgardLandHexes(tiles: readonly Tile[] = buildUtgardExampleTiles()): number {
  return tiles.filter((t) => t.terrain !== 'sea').length;
}
