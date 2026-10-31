// The Wasted Lands docs page's Utgard example map (UtgardExample.vue): a small hand-built wasted island whose defences are not placed
// here at all: `placeEndgame` (lib/map/endgamePlacement.ts, the golden-tested port of the backend's EndgameGenerator) decides the Utgard
// wall rings, their gates and the Jötun watchtowers, and they are tagged on the tiles exactly as the world model tags them
// (`Tile.utgardWall` / `Tile.jotunTower`, see `WorldModel.setUtgardWalls`), so the game's own renderer draws them the way it does on a
// real wasted island. Only the island itself (land out to radius 9 round Utgard's anchor, a bay cutting into the east side to the outer
// ring so a wall run ends at the shore) is laid out by hand.
import { coordKey, neighbors, type AxialCoord } from '../hex/coords';
import { InnerRingLevel, InnerRingRadius, OuterRingLevel, OuterRingRadius, placeEndgame } from '../map/endgamePlacement';
import { giantCoverage } from '../map/giantTiles';
import { UtgardFamily } from '../map/giantPlacement';
import type { Terrain, Tile } from '../map/types';
import { DEFAULT_GENERATION, defaultOrientation, variantForTerrain, type WorldSeed } from '../map/worldGenerator';

const EXAMPLE_WORLD: WorldSeed = { seed: 5, generation: DEFAULT_GENERATION };

/** Utgard's anchor: the centre hex of its seven. */
export const UTGARD_CENTRE: AxialCoord = { q: 0, r: 0 };

/** The two rings the endgame generator builds: radius from the anchor and the wall level they stand at. */
export const UTGARD_RINGS = [
  { id: 'inner', radius: InnerRingRadius, level: InnerRingLevel },
  { id: 'outer', radius: OuterRingRadius, level: OuterRingLevel },
] as const;

/** Land reaches this far from Utgard's anchor; one more ring of coastal water goes round it. */
const LAND_RADIUS = 9;

/** The bay that cuts into the island's east side and reaches the outer ring, so a wall run ends in a shore piece. */
const BAY: readonly AxialCoord[] = [
  { q: 5, r: 1 },
  { q: 6, r: 0 },
  { q: 4, r: 2 },
  { q: 6, r: 1 },
  { q: 5, r: 2 },
];
const BAY_KEYS = new Set(BAY.map(coordKey));

/** The island's terrain by hex: land out to `LAND_RADIUS`, the bay as sea. */
function terrainOf(c: AxialCoord): Terrain {
  return Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(-c.q - c.r)) > LAND_RADIUS || BAY_KEYS.has(coordKey(c)) ? 'sea' : 'grass';
}

export type UtgardExampleKind = 'utgard' | 'wall' | 'gate' | 'tower' | 'wasteland' | 'coast';

export function utgardExampleKindOf(tile: Tile): UtgardExampleKind {
  if (tile.giant) return 'utgard';
  if (tile.utgardWall) return tile.utgardWall.isGate ? 'gate' : 'wall';
  if (tile.jotunTower) return 'tower';
  return tile.terrain === 'sea' ? 'coast' : 'wasteland';
}

/** The island as the map tiles the game's own renderer draws, defences from `placeEndgame`. */
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
  const land: AxialCoord[] = [];
  for (let q = -LAND_RADIUS; q <= LAND_RADIUS; q++) {
    for (let r = Math.max(-LAND_RADIUS, -q - LAND_RADIUS); r <= Math.min(LAND_RADIUS, -q + LAND_RADIUS); r++) {
      const c = { q, r };
      const terrain = terrainOf(c);
      place(c, terrain);
      if (terrain !== 'sea') land.push(c);
    }
  }
  for (const { coord, part } of giantCoverage(UTGARD_CENTRE)) {
    place(coord, 'grass', { orientation: 'SE', giant: { family: 'giantutgard', anchor: UTGARD_CENTRE, part, orientation: 'SE' } });
  }
  const sites = placeEndgame(land, terrainOf, () => false, [{ anchor: UTGARD_CENTRE, family: UtgardFamily }], new Set(), EXAMPLE_WORLD.seed, 0);
  for (const w of sites.walls) {
    const tile = tiles.get(coordKey(w.coord))!;
    tile.utgardWall = { ring: w.ring, piece: w.piece, dir: w.dir, isGate: w.isGate, level: w.level };
  }
  for (const c of sites.towers) tiles.get(coordKey(c))!.jotunTower = { orientation: tiles.get(coordKey(c))!.orientation ?? 'SE', level: 2 };
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
