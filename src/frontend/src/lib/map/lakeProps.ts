// Lake decorations that a building nearby asks for (docs/design/bog.md, "Buildings"; owner: "boats are placed on the lake if
// the according building was placed nearby; limit boat density - not every building gets a boat, only big lakes have
// multiple boats").
//
// Render-only: the server knows nothing of these. They are a pure function of (world seed, the lake, the buildings around
// it), so every client that knows the same buildings draws the same props:
//
// - A lake Fishing Hut (one on a half shore) may put a fish weir (`boglake` variant004) and, independently, a fishing boat
//   (variant006, animated, camera W) on an open-lake tile within `FISHING_HUT_PROP_REACH` of it.
// - A bog-ore works with open lake water within `ORE_WORKS_PROP_REACH` of it may put an ore boat (variant005, animated,
//   camera SW) on an open-lake tile within that reach.
// - Each qualifying building rolls `BOAT_CHANCE` per prop. A lake holds at most `lakeBoatLimit(lakeTiles)` boats in total
//   (small lakes: one), weirs and boats are at least `PROP_MIN_SPACING` hexes apart.
//
// Generation never places these variants (`textures.ts` drops them from the rolled lake variants).
import { coordKey, hexDistance, neighbors, type AxialCoord } from '../hex/coords';
import { hash2 } from './worldGenerator';

export type LakeProp = 'weir' | 'oreboat' | 'fishboat';

/** Chance that a qualifying building gets a given prop, before the density limits. */
export const BOAT_CHANCE = 0.5;
/** Open-lake hexes per boat a lake can hold: `max(1, floor(lakeTiles / TILES_PER_BOAT))`. */
export const TILES_PER_BOAT = 12;
/** Weirs and boats stand at least this many hexes apart. */
export const PROP_MIN_SPACING = 3;
/** How far from a lake Fishing Hut its weir or fishing boat may be. */
export const FISHING_HUT_PROP_REACH = 2;
/** How far from a bog-ore works its ore boat may be (its bog has to touch the lake within this). */
export const ORE_WORKS_PROP_REACH = 3;

/** A building that can ask for a lake prop: a Fishing Hut on a half shore, or a bog-ore works. */
export interface LakePropBuilding extends AxialCoord {
  type: 'fishinghut' | 'bogoreworks';
}

/** The most boats a lake of `lakeTiles` open-water hexes holds (fish weirs are not boats and do not count). */
export function lakeBoatLimit(lakeTiles: number): number {
  return Math.max(1, Math.floor(lakeTiles / TILES_PER_BOAT));
}

// Hash salts: one per roll, so a hut's weir and boat, and the tile preference of each, are independent.
const SALT_WEIR = 11;
const SALT_FISH_BOAT = 23;
const SALT_ORE_BOAT = 37;
const SALT_TILE = 101;

function roll(seed: number, salt: number, a: number, b: number): number {
  return hash2(a, b, (Math.imul(seed | 0, 31) + salt) | 0);
}

/** Splits the open-lake hexes into lakes (connected components); returns each hex's lake index and every lake's hexes. */
function lakesOf(openLake: readonly AxialCoord[]): { lakeOf: Map<string, number>; lakes: AxialCoord[][] } {
  const sorted = [...openLake].sort((a, b) => a.q - b.q || a.r - b.r);
  const byKey = new Map(sorted.map((c) => [coordKey(c), c]));
  const lakeOf = new Map<string, number>();
  const lakes: AxialCoord[][] = [];
  for (const start of sorted) {
    if (lakeOf.has(coordKey(start))) continue;
    const index = lakes.length;
    const members: AxialCoord[] = [];
    const stack = [start];
    lakeOf.set(coordKey(start), index);
    while (stack.length > 0) {
      const at = stack.pop()!;
      members.push(at);
      for (const n of neighbors(at)) {
        const k = coordKey(n);
        if (!byKey.has(k) || lakeOf.has(k)) continue;
        lakeOf.set(k, index);
        stack.push(byKey.get(k)!);
      }
    }
    members.sort((a, b) => a.q - b.q || a.r - b.r);
    lakes.push(members);
  }
  return { lakeOf, lakes };
}

/**
 * The props for a world: which open-lake hex carries which decoration.
 *
 * `openLake` is every open-lake hex (bog kind `lake`); `buildings` the buildings that may ask for a prop (any order: they
 * are taken in coordinate order, so the outcome does not depend on the order the caller found them in).
 */
export function placeLakeProps(
  seed: number,
  openLake: readonly AxialCoord[],
  buildings: readonly LakePropBuilding[],
): Map<string, LakeProp> {
  const placed = new Map<string, LakeProp>();
  if (openLake.length === 0 || buildings.length === 0) return placed;

  const { lakes } = lakesOf(openLake);
  const ordered = [...buildings].sort((a, b) => a.q - b.q || a.r - b.r);
  const placedAt: AxialCoord[] = [];

  lakes.forEach((lake) => {
    // The lake's own identity for the rolls: its lowest hex (`lake` is sorted).
    const id = lake[0]!;
    const limit = lakeBoatLimit(lake.length);
    let boats = 0;

    for (const building of ordered) {
      const reach = building.type === 'fishinghut' ? FISHING_HUT_PROP_REACH : ORE_WORKS_PROP_REACH;
      const near = lake.filter((c) => hexDistance(c, building) <= reach);
      if (near.length === 0) continue;

      const wanted: { prop: LakeProp; salt: number }[] =
        building.type === 'fishinghut'
          ? [
              { prop: 'weir', salt: SALT_WEIR },
              { prop: 'fishboat', salt: SALT_FISH_BOAT },
            ]
          : [{ prop: 'oreboat', salt: SALT_ORE_BOAT }];

      for (const { prop, salt } of wanted) {
        if (roll(seed, salt, building.q + id.q * 7, building.r + id.r * 13) >= BOAT_CHANCE) continue;
        if (prop !== 'weir' && boats >= limit) continue;

        // The building's own pseudo-random preference among the free hexes in reach, so boats do not always
        // crowd the hex nearest the building.
        const choice = near
          .filter((c) => placedAt.every((p) => hexDistance(p, c) >= PROP_MIN_SPACING))
          .sort(
            (a, b) =>
              roll(seed, salt + SALT_TILE, a.q, a.r) - roll(seed, salt + SALT_TILE, b.q, b.r) || a.q - b.q || a.r - b.r,
          )[0];
        if (!choice) continue;

        placed.set(coordKey(choice), prop);
        placedAt.push(choice);
        if (prop !== 'weir') boats++;
      }
    }
  });

  return placed;
}
