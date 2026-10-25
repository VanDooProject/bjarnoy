// The /showcase page's "One view — map and village" frame previews a real
// island through the real settlement renderer. A bare WorldModel gives that
// frame only grass and sand: rivers, bogs, giants and wildlife camps are
// generated per island by `placeGiantsForIsland`, and nothing stands on the
// ground until a settlement is founded and built up. This module does what a
// player's first minutes would — generate the island, found a village on its
// most varied stretch of ground, and raise a spread of buildings — so the frame
// shows what the section copy promises.
import { hexDistance, hexesInRadius, type AxialCoord } from '../hex/coords';
import { PREVIEW_ISLAND_RADIUS, type WorldModel } from '../map/WorldModel';
import type { Settlement, Tile } from '../map/types';

/**
 * Owner id of the showcase village. Deliberately not the page's viewer id
 * ('showcase'): the renderer switches fog on as soon as the *viewer* owns a
 * settlement, and the showcase wants the whole archipelago visible.
 */
export const SHOWCASE_VILLAGE_OWNER = 'showcase-village';

/** How far from `near` village sites are sampled, and the grid step between samples (bounds the scoring cost to a few hundred candidates). */
const SITE_SEARCH_RADIUS = 60;
const SITE_GRID_STEP = 6;
/** Longhouse level the village is raised to: the border must be wide enough to hold the whole building list. */
const VILLAGE_LONGHOUSE_LEVEL = 4;
/** How far from the longhouse buildings are tried; claimed hexes beyond it are not worth scanning. */
const BUILD_SEARCH_RADIUS = 14;

/** Buildings to raise, in order, each on the claimed hex nearest the longhouse that `placeBuilding` accepts. Mixes economy, defence, faith and coast so the frame shows variety. */
const VILLAGE_BUILDINGS: NonNullable<Tile['buildingType']>[] = [
  'hut', 'hut', 'farm', 'lumberjack', 'quarry', 'sawmill', 'storagehouse', 'tower',
  'shrineofthor', 'fishinghut', 'dockyard', 'barracks', 'smithy', 'meadery', 'townsquare', 'cropmill',
];
/** Types shown above level 1 so the frame also shows the higher-level art. */
const UPGRADED_TYPES = new Set<Tile['buildingType']>(['hut', 'farm', 'tower', 'sawmill']);

/**
 * How varied the ground within the preview crop of `at` is: distinct terrains,
 * plus rivers, giants and camps (one point each, as a feature kind), plus
 * open sea nearby (needed for the fishing hut and dockyard).
 */
function siteVariety(model: WorldModel, at: AxialCoord): number {
  const terrains = new Set<string>();
  let river = false;
  let giant = false;
  let camp = false;
  for (const c of hexesInRadius(at, PREVIEW_ISLAND_RADIUS)) {
    const tile = model.getTile(c.q, c.r);
    terrains.add(tile.terrain);
    if (model.getRiverTile(c.q, c.r)) river = true;
    if (tile.giant) giant = true;
    if (tile.camp) camp = true;
  }
  return terrains.size + (river ? 1 : 0) + (giant ? 1 : 0) + (camp ? 1 : 0) + (terrains.has('sea') ? 1 : 0);
}

/** The hex with the most varied surroundings among a coarse grid of settleable land near `near`; ties go to the one closest to `near`. */
function pickVillageSite(model: WorldModel, near: AxialCoord): AxialCoord {
  let best: AxialCoord | null = null;
  let bestScore = -1;
  let bestDistance = Infinity;
  for (const c of hexesInRadius(near, SITE_SEARCH_RADIUS)) {
    if (c.q % SITE_GRID_STEP !== 0 || c.r % SITE_GRID_STEP !== 0) continue;
    if (!model.isLand(c.q, c.r)) continue;
    const tile = model.getTile(c.q, c.r);
    if (tile.giant || tile.camp || tile.bog || model.getRiverTile(c.q, c.r)) continue;
    const score = siteVariety(model, c);
    const distance = hexDistance(near, c);
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      best = c;
      bestScore = score;
      bestDistance = distance;
    }
  }
  // The longhouse itself must also sit where the real landfall rules allow.
  return (best && model.findLandfall(best, 12)) || model.findLandfall(near) || near;
}

/**
 * Generates the island at `near`, founds a village on its most varied ground
 * and builds it up. Mutates `model`; deterministic for a given model seed
 * (the settlement id carries a timestamp, nothing else does).
 */
export function buildShowcaseVillage(
  model: WorldModel,
  near: AxialCoord,
  worldSeed: number,
): { settlement: Settlement; center: AxialCoord } {
  // Same order as stores/world.ts's foundStartingSettlement: giants, bogs and
  // camps must exist before the first territory claim (claiming is one-way).
  const provisional = model.findLandfall(near) ?? near;
  model.placeGiantsForIsland(provisional, worldSeed);

  const center = pickVillageSite(model, provisional);
  const settlement = model.foundSettlement(SHOWCASE_VILLAGE_OWNER, 'Ragnar', 'Ragnarsvik', center);
  const home = { q: settlement.q, r: settlement.r };
  while (settlement.level < VILLAGE_LONGHOUSE_LEVEL && model.upgradeBuilding(settlement.id, home)) {
    // each upgrade widens the border (and the vision around it)
  }

  // placeBuilding is the rule book (claimed, dry/coastal, river shape, tower
  // limit...): a refused hex just means "not here", so try the next nearest.
  const spots = hexesInRadius(home, BUILD_SEARCH_RADIUS)
    .filter((c) => model.getTile(c.q, c.r).ownerId === settlement.id)
    .sort((a, b) => hexDistance(home, a) - hexDistance(home, b));
  for (const type of VILLAGE_BUILDINGS) {
    const at = spots.find((c) => model.placeBuilding(settlement.id, c, type));
    if (at && UPGRADED_TYPES.has(type)) model.upgradeBuilding(settlement.id, at);
  }
  return { settlement, center };
}
