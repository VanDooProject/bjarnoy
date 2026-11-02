// The Wasted Lands docs page's Utgard example map (UtgardExample.vue): a small hand-built wasted island whose defences are not placed
// here at all: `placeEndgame` (lib/map/endgamePlacement.ts, the golden-tested port of the backend's EndgameGenerator) decides the Utgard
// wall rings, their gates and the Jötun watchtowers, and they are tagged on the tiles exactly as the world model tags them
// (`Tile.utgardWall` / `Tile.jotunTower`, see `WorldModel.setUtgardWalls`), so the game's own renderer draws them the way it does on a
// real wasted island. Only the island itself (land out to radius 14 round Utgard's anchor, a bay cutting into the east side across the outer
// ring so a wall run ends at the shore) is laid out by hand.
import { coordKey, neighbors, parseKey, type AxialCoord } from '../hex/coords';
import { InnerRingLevel, OuterRingLevel, RingBands, placeEndgame } from '../map/endgamePlacement';
import { giantCoverage } from '../map/giantTiles';
import { UtgardFamily } from '../map/giantPlacement';
import { generateRivers } from '../map/riverGenerator';
import type { RiverTile, Terrain, Tile } from '../map/types';
import { DEFAULT_GENERATION, defaultOrientation, variantForTerrain, wastedVariantAt, type WorldSeed } from '../map/worldGenerator';

export const UTGARD_EXAMPLE_WORLD: WorldSeed = { seed: 5, generation: DEFAULT_GENERATION };

/** Utgard's anchor: the centre hex of its seven. */
export const UTGARD_CENTRE: AxialCoord = { q: 0, r: 0 };

/** The two rings the endgame generator builds: the band of distances from the anchor their wall may wander in, and the wall level they stand at. */
export const UTGARD_RINGS = [
  { id: 'inner', band: RingBands.inner, level: InnerRingLevel },
  { id: 'outer', band: RingBands.outer, level: OuterRingLevel },
] as const;

/** Land reaches this far from Utgard's anchor; one more ring of coastal water goes round it. */
const LAND_RADIUS = 14;

/** The bay that cuts into the island's east side and reaches the outer ring, so a wall run ends in a shore piece. */
const BAY: readonly AxialCoord[] = [0, 1, 2].flatMap((r) => Array.from({ length: 9 }, (_, i) => ({ q: 6 + i, r })));
const BAY_KEYS = new Set(BAY.map(coordKey));

/**
 * Two small mountain ranges (clusters of two or more hexes, what a spring needs), far enough out that none of them is one of
 * Utgard's seven hexes. The lava streams are traced from them by the game's own river generator.
 */
const MOUNTAINS: readonly AxialCoord[] = [
  { q: -5, r: 2 },
  { q: -5, r: 3 },
  { q: 2, r: -5 },
  { q: 3, r: -5 },
];
const MOUNTAIN_KEYS = new Set(MOUNTAINS.map(coordKey));

/** The island's terrain by hex: land out to `LAND_RADIUS`, the bay as sea, the two ranges as mountain. */
function terrainOf(c: AxialCoord): Terrain {
  if (Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(-c.q - c.r)) > LAND_RADIUS || BAY_KEYS.has(coordKey(c))) return 'sea';
  return MOUNTAIN_KEYS.has(coordKey(c)) ? 'mountain' : 'grass';
}

/**
 * The river generator's `depthAt` of a hand-built island: it grows toward the coast (the tracer prefers the higher value, like the
 * game's `wastedDepthAt`), so it is the island's greatest inland distance minus a hex's own distance to the nearest sea hex. `null`
 * for the sea.
 */
function depthOf(land: ReadonlySet<string>): (c: AxialCoord) => number | null {
  const depth = new Map<string, number>();
  let frontier = [...land].map(parseKey).filter((c) => neighbors(c).some((n) => !land.has(coordKey(n))));
  for (const c of frontier) depth.set(coordKey(c), 1);
  for (let d = 2; frontier.length > 0; d++) {
    const next: AxialCoord[] = [];
    for (const c of frontier) {
      for (const n of neighbors(c)) {
        if (land.has(coordKey(n)) && !depth.has(coordKey(n))) {
          depth.set(coordKey(n), d);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  const deepest = Math.max(...depth.values());
  return (c) => (depth.has(coordKey(c)) ? deepest + 1 - depth.get(coordKey(c))! : null);
}

/** The island's land hexes (Utgard's seven included). */
function landHexes(): AxialCoord[] {
  const land: AxialCoord[] = [];
  for (let q = -LAND_RADIUS; q <= LAND_RADIUS; q++) {
    for (let r = Math.max(-LAND_RADIUS, -q - LAND_RADIUS); r <= Math.min(LAND_RADIUS, -q + LAND_RADIUS); r++) {
      if (terrainOf({ q, r }) !== 'sea') land.push({ q, r });
    }
  }
  return land;
}

/** The island's lava streams, traced by the game's own generator (`generateRivers`, wasted) over the hand-built land. */
export function buildUtgardExampleStreams(): RiverTile[] {
  const land = landHexes();
  const landKeys = new Set(land.map(coordKey));
  return generateRivers(land, terrainOf, depthOf(landKeys), (c) => landKeys.has(coordKey(c)), UTGARD_EXAMPLE_WORLD.seed, 0, true, false);
}

export type UtgardExampleKind = 'utgard' | 'wall' | 'gate' | 'tower' | 'mountain' | 'lava' | 'wasteland' | 'coast';

/** What a hovered hex is; `stream` is the lava stream on it, if any (a stream's art replaces the ground under it). */
export function utgardExampleKindOf(tile: Tile, stream?: RiverTile): UtgardExampleKind {
  if (tile.giant) return 'utgard';
  if (stream) return 'lava';
  if (tile.utgardWall) return tile.utgardWall.isGate ? 'gate' : 'wall';
  if (tile.jotunTower) return 'tower';
  if (tile.terrain === 'mountain') return 'mountain';
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
      orientation: defaultOrientation(c.q, c.r, UTGARD_EXAMPLE_WORLD),
      // A wasted land hex rolls its look with the game's own weights (`WorldModel.getTile`), not the living grass roll.
      variant:
        terrain === 'sea'
          ? variantForTerrain(c.q, c.r, UTGARD_EXAMPLE_WORLD, terrain)
          : wastedVariantAt(c.q, c.r, UTGARD_EXAMPLE_WORLD, terrain),
      ...(terrain === 'sea' ? { isCoastalWater: true } : {}),
      ...extra,
    });
  };
  const land = landHexes();
  for (let q = -LAND_RADIUS; q <= LAND_RADIUS; q++) {
    for (let r = Math.max(-LAND_RADIUS, -q - LAND_RADIUS); r <= Math.min(LAND_RADIUS, -q + LAND_RADIUS); r++) place({ q, r }, terrainOf({ q, r }));
  }
  for (const { coord, part } of giantCoverage(UTGARD_CENTRE)) {
    place(coord, 'grass', { orientation: 'SE', giant: { family: 'giantutgard', anchor: UTGARD_CENTRE, part, orientation: 'SE' } });
  }
  const streamKeys = new Set(buildUtgardExampleStreams().map(coordKey));
  const sites = placeEndgame(land, terrainOf, (c) => streamKeys.has(coordKey(c)), [{ anchor: UTGARD_CENTRE, family: UtgardFamily }], new Set(), UTGARD_EXAMPLE_WORLD.seed, 0);
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
