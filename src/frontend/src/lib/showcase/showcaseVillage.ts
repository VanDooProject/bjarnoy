// The /showcase page's "One view — map and village" frame previews a real
// island through the real settlement renderer. A bare WorldModel gives that
// frame only grass and sand: rivers, bogs, giants and wildlife camps are
// generated per island by `placeGiantsForIsland`, and nothing stands on the
// ground until a settlement is founded and built up. This module does what a
// player's first minutes would — generate the island, found a village beside
// its bog land (the richest art the island has: ponds, birches, ore pools,
// peat cuttings, creeks and lakes, rather than wall-to-wall forest and
// mountain), and raise a spread of buildings — so the frame shows what the
// section copy promises.
import { hexDistance, hexesInRadius, neighbors, type AxialCoord } from '../hex/coords';
import { PREVIEW_ISLAND_RADIUS, type WorldModel } from '../map/WorldModel';
import { riverBuildingAllowedHere } from '../map/ringCatalogue';
import { campFamilyInfo, type CampFamily, type CampGround } from '../map/campPlacement';
import { maxLevelFor } from '../map/buildingEconomy';
import { giantCoverage } from '../map/giantTiles';
import { RETIRED_BOG_VARIANTS } from '../map/textures';
import { straightOrientationOf, TILE_ORIENTATIONS, type Settlement, type Tile, type TileOrientation } from '../map/types';

/**
 * Owner id of the showcase village. Deliberately not the page's viewer id
 * ('showcase'): the renderer switches fog on as soon as the *viewer* owns a
 * settlement, and the showcase wants the whole archipelago visible.
 */
export const SHOWCASE_VILLAGE_OWNER = 'showcase-village';

/**
 * Radius (hexes) of the frame's crop around the bog centre: wider than the
 * landing page's `PREVIEW_ISLAND_RADIUS` so the village, the bog and a camp of
 * every wildlife family fit in one view. ShowcaseView passes it to the canvas
 * as `previewRadius` (the locked camera fits it); camps and the giant use the same crop. Site
 * scoring stays on the landing radius: it scans every bog hex as a candidate,
 * and the village site it picks (mills by the river) was tuned there.
 */
export const SHOWCASE_PREVIEW_RADIUS = 13;

/**
 * Radius (hexes) of what the frame draws (land and sea), wider than the camera fit
 * so the drawn disc's hexagonal outline lies outside the frame. The fit leaves the
 * frame's short axis with slack (the fitted disc is ~3x wider than tall, the frame
 * is not), so the frame's corners reach ~26 hexes from the centre on desktop
 * (570x480) and ~30 on a phone (390x405) at the fit zoom. The confined camera's
 * centre can move up to the edge of the island's land inside the fit radius (13
 * hexes), so a phone corner can reach ~43; the rest is a cushion.
 */
export const SHOWCASE_RENDER_RADIUS = 48;

/** Open sea kept around the island inside the hero world map's cap, in hexes. */
export const SHOWCASE_WORLD_SEA_MARGIN = 14;

/**
 * The hero world map's cap: the hex disc `{ center, radius }` the camera is fitted to and confined to. The disc is
 * centred on the village island's land (the mean of its hexes) and reaches its farthest coast plus
 * `SHOWCASE_WORLD_SEA_MARGIN` of sea, so the island the page talks about fills the frame at the fit zoom and its
 * neighbours (a hundred-plus hexes further out) stay outside the disc. Everything the camera can see is drawn, so a
 * neighbour reaching into the frame shows whole rather than cut off.
 */
export function showcaseWorldFrame(model: WorldModel, site: AxialCoord): { center: AxialCoord; radius: number } {
  const land = model.previewIslandTiles(site);
  if (land.length === 0) return { center: site, radius: SHOWCASE_PREVIEW_RADIUS };
  const center = {
    q: Math.round(land.reduce((sum, c) => sum + c.q, 0) / land.length),
    r: Math.round(land.reduce((sum, c) => sum + c.r, 0) / land.length),
  };
  const reach = land.reduce((far, c) => Math.max(far, hexDistance(center, c)), 0);
  return { center, radius: reach + SHOWCASE_WORLD_SEA_MARGIN };
}

/** How far from `near` village sites are sampled, and the grid step between samples (bounds the scoring cost to a few hundred candidates). */
const SITE_SEARCH_RADIUS = 60;
const SITE_GRID_STEP = 6;
/** Longhouse level the village is raised to: it caps the towers (`maxTowers`: 3 at level 9) whose discs widen the border, and gates the larger buildings. */
const VILLAGE_LONGHOUSE_LEVEL = 9;
/** How far from the longhouse buildings are tried; claimed hexes beyond it are not worth scanning. */
const BUILD_SEARCH_RADIUS = 14;

type BuildingType = NonNullable<Tile['buildingType']>;

/**
 * Buildings to raise, in order, each on the claimed hex nearest the longhouse that `placeBuilding` accepts. Mixes economy, defence, faith
 * and coast so the frame shows variety. The river mills come first: they only stand on a river hex, which the nearest-first scan would
 * otherwise leave to the dry buildings' claim-order luck.
 */
const VILLAGE_BUILDINGS: BuildingType[] = [
  'sawmill', 'cropmill',
  'hut', 'hut', 'hut', 'hut', 'hut', 'farm', 'farm', 'pumpkinfarm', 'lumberjack', 'quarry', 'storagehouse', 'greatstorehouse',
  'shrineofthor', 'barracks', 'smithy', 'meadery', 'townsquare',
  'archeryrange', 'druidhut', 'cartworkshop', 'reindeerherder', 'odinstatue',
];
/** The coast buildings, placed once a tower has widened the border to the shore. */
const COAST_BUILDINGS: BuildingType[] = ['dockyard', 'fishinghut'];
/**
 * Towers widen the border (a disc of radius = tower level) and the base claim (radius 3) has room for few buildings, so they go up first;
 * each is raised to `TOWER_PLAN_LEVEL`.
 */
const BOG_SIDE_TOWER: BuildingType = 'tower';
const TOWER_PLAN_LEVEL = 3;
/** The bog's own buildings (moss, creek, lake shore) go on the claimed hexes nearest the bog. */
const BOG_BUILDINGS: BuildingType[] = ['bogoreworks', 'claybrickworks', 'hammerschmiede', 'fishinghut'];
/** How far (hexes) from the bog centre the longhouse may be moved to sit on the river. */
const RIVER_SITE_RADIUS = 5;
/** The river buildings the village wants a river hex for. */
const RIVER_MILLS = ['sawmill', 'cropmill'] as const;
/**
 * Every building is raised to this level once the village stands (or its own
 * ceiling, `maxLevelFor`), so the frame shows the richest art each family has:
 * the art pack's top rungs sit around level 4-7, and a level past a family's
 * top rung renders at that rung.
 */
const SHOWCASE_BUILDING_LEVEL = 7;

/** Whether a Sawmill or Crop Mill (`type`, or either when omitted) may stand on `c`'s river tile — the same rule `WorldModel.placeBuilding` applies. */
function riverMillAllowed(model: WorldModel, c: AxialCoord, type?: (typeof RIVER_MILLS)[number]): boolean {
  const river = model.getRiverTile(c.q, c.r);
  if (!river) return false;
  const variant = model.riverVariantAt(c, river.shape);
  return (type ? [type] : RIVER_MILLS).some((t) => riverBuildingAllowedHere(t, river.shape, variant, river.width));
}

/** River hexes within the crop of `at` a Sawmill or Crop Mill may stand on. */
function millRiverHexes(model: WorldModel, at: AxialCoord): number {
  return hexesInRadius(at, PREVIEW_ISLAND_RADIUS).filter((c) => riverMillAllowed(model, c)).length;
}

/**
 * The longhouse site for the village: within `RIVER_SITE_RADIUS` of the frame's
 * bog `center` (and inside its crop), the landfall-valid hex whose claim has the
 * most river hexes a Sawmill or Crop Mill may stand on (each is wanted, so the
 * counts are capped), plus dry grass for the rest of the village. Ties go to the
 * hex nearest the bog. Null when no hex nearby has a mill-capable river hex.
 */
function pickRiverSite(model: WorldModel, center: AxialCoord): AxialCoord | null {
  const inCrop = new Set(model.previewCropTiles(center).map((c) => `${c.q},${c.r}`));
  const seen = new Set<string>();
  let best: AxialCoord | null = null;
  let bestScore = -Infinity;
  for (const candidate of hexesInRadius(center, RIVER_SITE_RADIUS)) {
    if (!model.isLand(candidate.q, candidate.r)) continue;
    const site = model.findLandfall(candidate, 2);
    if (!site || hexDistance(center, site) > RIVER_SITE_RADIUS || !inCrop.has(`${site.q},${site.r}`)) continue;
    const key = `${site.q},${site.r}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let sawmills = 0;
    let cropmills = 0;
    let dry = 0;
    for (const c of hexesInRadius(site, VILLAGE_CLAIM_RADIUS)) {
      const tile = model.getTile(c.q, c.r);
      if (tile.giant || tile.camp) continue;
      if (riverMillAllowed(model, c)) {
        if (riverMillAllowed(model, c, 'sawmill')) sawmills++;
        if (riverMillAllowed(model, c, 'cropmill')) cropmills++;
      } else if (!tile.bog && !model.getRiverTile(c.q, c.r) && (tile.terrain === 'grass' || tile.terrain === 'sand')) dry++;
    }
    if (sawmills + cropmills === 0) continue;
    const score = Math.min(sawmills, 4) * 10 + Math.min(cropmills, 4) * 10 + Math.min(dry, 24) - hexDistance(center, site);
    if (score > bestScore) {
      best = site;
      bestScore = score;
    }
  }
  return best;
}

/** Distance from `c` to the nearest bog hex of `bogs` (Infinity without any). */
function distanceToBog(bogs: AxialCoord[], c: AxialCoord): number {
  let best = Infinity;
  for (const b of bogs) best = Math.min(best, hexDistance(b, c));
  return best;
}

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

/** Bog sites are scored on a sub-grid of the island's bog hexes: plenty of candidates, a bounded cost. */
const BOG_SITE_GRID_STEP = 2;
/** Dry hexes (grass/sand) a bog site needs within the crop so the village itself has room to stand. */
const MIN_DRY_HEXES = 24;
/** The longhouse's border at VILLAGE_LONGHOUSE_LEVEL reaches about this far: only buildable ground inside it hosts the village. */
const VILLAGE_CLAIM_RADIUS = 4;
/** Bog-lake hexes a bog site's crop should hold, so the frame shows open water inside the bog. */
const MIN_LAKE_HEXES = 3;
/** Mill-capable river hexes in a bog site's crop that still add to its score. */
const MAX_SCORED_MILL_HEXES = 6;

/**
 * Bog looks shown in the frame. Every bog family numbers its looks from 0, and
 * look 0 is the plain, undecorated ground; the rest carry the decoration
 * (ponds, birches, ore pools, peat cuttings...). The renderer picks a family's
 * look as `variant % count`, with counts of 9 (moss), 4 (lake), 3 (creeks,
 * inlet, shore) and 2 (spring, half shore, mouth) in the art pack — these
 * values are non-zero modulo every one of them, so no family falls back to its
 * plain look (and moss still shows six different decorations).
 */
export const DECORATED_BOG_VARIANTS = [1, 5, 7, 11, 13, 17] as const;

/**
 * The most bog-rich spot on the island that still leaves the village room to
 * stand: bog hexes (and distinct bog kinds — moss, lake, shore, creek...) count
 * for it, forest and mountain against it (plain filler next to the bog art),
 * and rivers, giants and camps add a little. Null when the island has no bog.
 */
function pickBogSite(model: WorldModel): AxialCoord | null {
  let best: AxialCoord | null = null;
  let bestScore = -Infinity;
  let bestTier = -1;
  for (const bog of model.listBogTiles()) {
    if (bog.q % BOG_SITE_GRID_STEP !== 0 || bog.r % BOG_SITE_GRID_STEP !== 0) continue;
    let bogHexes = 0;
    let dry = 0;
    let filler = 0;
    let feature = 0;
    let lake = 0;
    let dryNear = 0;
    const kinds = new Set<string>();
    for (const c of hexesInRadius(bog, PREVIEW_ISLAND_RADIUS)) {
      const tile = model.getTile(c.q, c.r);
      if (tile.bog) {
        bogHexes++;
        kinds.add(tile.bog.kind);
        if (tile.bog.kind === 'lake') lake++;
      } else if (tile.terrain === 'grass' || tile.terrain === 'sand') dry++;
      else if (tile.terrain === 'forest' || tile.terrain === 'mountain') filler++;
      if (tile.giant || tile.camp || model.getRiverTile(c.q, c.r)) feature++;
      if (!tile.bog && (tile.terrain === 'grass' || tile.terrain === 'sand') && hexDistance(bog, c) <= VILLAGE_CLAIM_RADIUS) dryNear++;
    }
    if (dry < MIN_DRY_HEXES) continue;
    // Rivers a Sawmill / Crop Mill can stand on: the village is moved onto them (`pickRiverSite`), so the crop must hold some.
    const mills = Math.min(millRiverHexes(model, bog), MAX_SCORED_MILL_HEXES);
    const score = mills * 12 + bogHexes * 2 + kinds.size * 6 + Math.min(lake, 8) * 3 + Math.min(dryNear, 24) * 8 + Math.min(feature, 10) - filler * 2;
    // A lake-less site only competes when no site shows a lake at all.
    const lakeTier = lake >= MIN_LAKE_HEXES ? 1 : 0;
    if (lakeTier > bestTier || (lakeTier === bestTier && score > bestScore)) {
      best = { q: bog.q, r: bog.r };
      bestScore = score;
      bestTier = lakeTier;
    }
  }
  return best;
}

/** mulberry32: a tiny seeded PRNG, so the showcase looks differ per seed but are the same every run. */
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

/** Fisher-Yates with the seeded PRNG (the input is not mutated). */
function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Moss looks the art pack has (the renderer shows a moss hex's look as `variant % 9`). */
const MOSS_LOOKS = 9;
const GRASS_LOOKS = 4;
const FOREST_LOOKS = 3;

/** A giant is an anchor plus its six neighbours. */
const GIANT_PLATE_HEXES = 7;
/** A giant needs this much of its 7-hex plate inside the crop when the strict (fully inside) anchors run out. */
const GIANT_FALLBACK_MIN_PARTS = 4;
const GIANT_MIN_DISTANCE = 3;
const GIANT_MAX_DISTANCE = 6;
const GIANT_FALLBACK_MAX_DISTANCE = 8;
/** Giants and camps keep this many hexes clear of the longhouse (giant) or this far from it (camps). */
const GIANT_HOME_CLEARANCE = 2;
/** A giant's plate stays this many hexes from every village building. */
const GIANT_BUILDING_CLEARANCE = 2;
const CAMP_MIN_HOME_DISTANCE = 4;
const CAMP_MIN_SPACING = 3;
/** Fallback spacing when a family finds no spot at CAMP_MIN_SPACING. */
const CAMP_RELAXED_SPACING = 2;

/** Whether the crop already shows a giant. */
function cropHasGiant(model: WorldModel, crop: AxialCoord[]): boolean {
  return crop.some((c) => model.getTile(c.q, c.r).giant);
}

/**
 * The real generator rarely drops a giant into the village's crop, but the
 * frame promises one: places a giant mountain on the crop's grass/forest,
 * clear of the longhouse (and, as buildings are already up, of those — the
 * model refuses a footprint with a building), of rivers (the giant's art would
 * cover the animated river art) and of bog. Anchors are tried nearest-first
 * from `center`, seeded-shuffled within one distance. The fallback accepts a
 * plate partly outside the crop (>= 4 of 7 hexes inside) and reaches farther.
 */
function ensureGiantMountain(model: WorldModel, center: AxialCoord, home: AxialCoord, seed: number, buildings: AxialCoord[]) {
  const crop = model.previewCropTiles(center, SHOWCASE_PREVIEW_RADIUS);
  if (cropHasGiant(model, crop)) return;
  const inCrop = new Set(crop.map((c) => `${c.q},${c.r}`));
  const rand = mulberry32(seed ^ 0x9e3779b1);
  const candidates = shuffled(crop, rand);
  const attempt = (minDistance: number, maxDistance: number, minParts: number) => {
    const anchors = candidates
      .filter((c) => {
        const d = hexDistance(center, c);
        return d >= minDistance && d <= maxDistance;
      })
      .sort((a, b) => hexDistance(center, a) - hexDistance(center, b)); // stable: ties keep the shuffle
    for (const anchor of anchors) {
      const plate = giantCoverage(anchor).map((p) => p.coord);
      if (plate.some((c) => hexDistance(home, c) <= GIANT_HOME_CLEARANCE)) continue;
      if (plate.some((c) => model.getRiverTile(c.q, c.r) || model.getTile(c.q, c.r).bog)) continue;
      if (plate.some((c) => buildings.some((b) => hexDistance(b, c) < GIANT_BUILDING_CLEARANCE))) continue;
      if (plate.filter((c) => inCrop.has(`${c.q},${c.r}`)).length < minParts) continue;
      if (model.placeGiant(anchor, 'giantmountain')) return true;
    }
    return false;
  };
  if (attempt(GIANT_MIN_DISTANCE, GIANT_MAX_DISTANCE, GIANT_PLATE_HEXES)) return;
  // The anchor must be in the crop, but the fallback may reach out to distance 8 of it.
  attempt(GIANT_MIN_DISTANCE, GIANT_FALLBACK_MAX_DISTANCE, GIANT_FALLBACK_MIN_PARTS);
}

/**
 * The families the frame shows one camp of, in placement order: the scarce
 * grounds (bog, river) first so they get the spots, then grass, forest, shore.
 * Strong boar wallow is optional — the generator's own camps often cover it.
 */
const SHOWCASE_CAMP_FAMILIES: CampFamily[] = [
  'moosemire', 'beaverlodge', 'cranedance', 'bearrapids',
  'wolfden', 'harewarren', 'deerglade', 'boarwallow', 'sealhaulout',
];

/** A straight river-width tile — the only river shape with bearrapids art (mirrors `placeCamps`). */
function straightRiverOrientation(model: WorldModel, c: AxialCoord): TileOrientation | null {
  const river = model.getRiverTile(c.q, c.r);
  if (!river || river.wasted || river.shape !== 'straight' || (river.width ?? 'river') !== 'river') return null;
  const direction = river.inDirections.length > 0 ? river.inDirections[0] : river.outDirection;
  return direction ? straightOrientationOf(direction) : null;
}

/** The ground a hex offers a camp, using `placeCamps`'s own rules; sand counts only on the shore (a sea hex within 1), as the generator's inland sand is a known artefact. */
function campGroundOf(model: WorldModel, c: AxialCoord, tile: Tile): CampGround | null {
  if (model.getRiverTile(c.q, c.r)) return straightRiverOrientation(model, c) ? 'riverStraight' : null;
  if (tile.bog) return tile.bog.kind === 'bog' ? 'bog' : null;
  if (tile.terrain === 'grass' || tile.terrain === 'forest') return tile.terrain;
  if (tile.terrain === 'sand' && neighbors(c).some((n) => model.getTile(n.q, n.r).terrain === 'sea')) return 'sand';
  return null;
}

/**
 * Wildlife camps are sparse (one per 600-1500 land tiles), so the crop shows
 * few of them. Adds, on top of the generator's own camps, one camp of each
 * family in `SHOWCASE_CAMP_FAMILIES` the crop does not show yet where its
 * ground exists: away from the longhouse, giants, buildings and other camps,
 * as spread out as the crop allows. A family without ground in the crop is skipped.
 */
function ensureCamps(model: WorldModel, center: AxialCoord, home: AxialCoord, seed: number) {
  const crop = model.previewCropTiles(center, SHOWCASE_PREVIEW_RADIUS);
  const camps = crop.filter((c) => model.getTile(c.q, c.r).camp).map((c) => ({ q: c.q, r: c.r }));
  const present = new Set(crop.map((c) => model.getTile(c.q, c.r).camp?.family));
  const rand = mulberry32(seed ^ 0x85ebca6b);
  const hexes = shuffled(crop, rand).filter((c) => {
    const tile = model.getTile(c.q, c.r);
    return !tile.giant && !tile.camp && !tile.buildingType && hexDistance(home, c) >= CAMP_MIN_HOME_DISTANCE;
  });
  const added: { family: string; coord: AxialCoord; level: number; orientation: TileOrientation }[] = [];
  for (const family of SHOWCASE_CAMP_FAMILIES) {
    if (present.has(family)) continue;
    const ground = campFamilyInfo(family)!.ground;
    const nearest = (c: AxialCoord) => camps.reduce((d, o) => Math.min(d, hexDistance(o, c)), Infinity);
    let best: { c: AxialCoord; tile: Tile; spread: number } | null = null;
    for (const spacing of [CAMP_MIN_SPACING, CAMP_RELAXED_SPACING]) {
      for (const c of hexes) {
        const tile = model.getTile(c.q, c.r);
        if (campGroundOf(model, c, tile) !== ground) continue;
        const spread = nearest(c);
        if (spread < spacing || (best && spread <= best.spread)) continue;
        best = { c, tile, spread };
      }
      if (best) break;
    }
    if (!best) continue;
    const { c, tile } = best;
    const orientation = ground === 'riverStraight' ? straightRiverOrientation(model, c)! : (tile.orientation ?? 'SE');
    added.push({ family, coord: { q: c.q, r: c.r }, level: 1 + Math.floor(rand() * 3), orientation });
    camps.push({ q: c.q, r: c.r });
  }
  model.setCamps(added);
}

/** The looks a hex may take: moss 1..8 (compared mod 9, never the plain 0), grass/forest by their counts, other bog kinds from the decorated list too. */
function allowedLooks(tile: Tile): number[] {
  // Moss has 7 non-plain looks it still shows: more than a hex has neighbours, so a distinct one always exists.
  if (tile.bog?.kind === 'bog') {
    return Array.from({ length: MOSS_LOOKS - 1 }, (_, i) => i + 1).filter((v) => !RETIRED_BOG_VARIANTS.bog?.has(v));
  }
  if (tile.bog) return [...DECORATED_BOG_VARIANTS];
  if (tile.terrain === 'grass') return Array.from({ length: GRASS_LOOKS }, (_, i) => i);
  if (tile.terrain === 'forest') return Array.from({ length: FOREST_LOOKS }, (_, i) => i);
  return [];
}

/** What the renderer resolves a hex's look to, for comparing neighbours. */
function lookKey(tile: Tile): string {
  const variant = tile.variant ?? 0;
  return `${tile.terrain}:${tile.bog ? tile.bog.kind : ''}:${tile.bog?.kind === 'bog' ? variant % MOSS_LOOKS : variant}`;
}

/**
 * The generator's own looks often repeat side by side (and the old linear hash
 * striped the bog), which reads as a flat pattern. Walks the crop in a random
 * order and gives each plain grass/forest/bog hex a look none of its already
 * assigned neighbours shows. Only `variant` (and, for freely rotatable moss,
 * grass and forest, `orientation`) changes: terrain never does, and river,
 * shore, creek, lake and mouth orientations encode connectivity.
 */
export function diversifyLooks(model: WorldModel, center: AxialCoord, seed: number, radius = SHOWCASE_RENDER_RADIUS) {
  const rand = mulberry32(seed ^ 0xc2b2ae35);
  const done = new Set<string>();
  for (const c of shuffled(model.previewCropTiles(center, radius), rand)) {
    const tile = model.getTile(c.q, c.r);
    const key = `${c.q},${c.r}`;
    if (tile.buildingType || tile.giant || tile.camp) continue;
    const looks = allowedLooks(tile);
    if (looks.length === 0) continue;
    const taken = new Set<string>();
    for (const n of neighbors(c)) {
      if (done.has(`${n.q},${n.r}`)) taken.add(lookKey(model.getTile(n.q, n.r)));
    }
    const fresh = looks.filter((v) => !taken.has(lookKey({ ...tile, variant: v })));
    const pool = fresh.length > 0 ? fresh : looks;
    tile.variant = pool[Math.floor(rand() * pool.length)];
    const rotatable = tile.terrain === 'grass' || tile.terrain === 'forest' || tile.bog?.kind === 'bog';
    if (rotatable && !model.getRiverTile(c.q, c.r)) {
      tile.orientation = TILE_ORIENTATIONS[Math.floor(rand() * TILE_ORIENTATIONS.length)];
    }
    done.add(key);
  }
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
 * Generates the island at `near`, founds a village beside its bog land (or, on
 * an island without bog, on its most varied ground) and builds it up. Mutates `model`; deterministic for a given model seed
 * (the settlement id carries a timestamp, nothing else does).
 */
export function buildShowcaseVillage(
  model: WorldModel,
  near: AxialCoord,
  worldSeed: number,
): { settlement: Settlement; center: AxialCoord; frameCenter: AxialCoord } {
  // Same order as stores/world.ts's foundStartingSettlement: giants, bogs and
  // camps must exist before the first territory claim (claiming is one-way).
  const provisional = model.findLandfall(near) ?? near;
  model.placeGiantsForIsland(provisional, worldSeed);

  // The frame centres on the bog; the longhouse goes on the river within reach
  // of it (the animated river buildings), else on the nearest good dry hex.
  const bogSite = pickBogSite(model);
  const center = bogSite ?? pickVillageSite(model, provisional);
  const landfall = bogSite ? (pickRiverSite(model, bogSite) ?? model.findLandfall(bogSite, 4) ?? bogSite) : center;
  const settlement = model.foundSettlement(SHOWCASE_VILLAGE_OWNER, 'Ragnar', 'Ragnarsvik', landfall);
  const home = { q: settlement.q, r: settlement.r };
  while (settlement.level < VILLAGE_LONGHOUSE_LEVEL && model.upgradeBuilding(settlement.id, home)) {
    // each upgrade widens the border (and the vision around it)
  }

  // placeBuilding is the rule book (claimed, dry/coastal, river shape, tower
  // limit...): a refused hex just means "not here", so try the next nearest.
  const claimedSpots = () =>
    hexesInRadius(home, BUILD_SEARCH_RADIUS).filter((c) => model.getTile(c.q, c.r).ownerId === settlement.id);
  const place = (type: BuildingType, spots: AxialCoord[]) => {
    return spots.find((c) => model.placeBuilding(settlement.id, c, type));
  };
  const byHome = claimedSpots().sort((a, b) => hexDistance(home, a) - hexDistance(home, b));
  // River hexes are kept for the mills: any other building would take them from the animated art.
  const dry = () => claimedSpots().filter((c) => !model.getRiverTile(c.q, c.r));
  const nearHome = () => dry().sort((a, b) => hexDistance(home, a) - hexDistance(home, b));
  const isMill = (type: BuildingType) => (RIVER_MILLS as readonly string[]).includes(type);
  for (const type of VILLAGE_BUILDINGS.filter(isMill)) place(type, byHome);

  // Towers go up while the base claim still has free hexes (it fills fast): each is raised so its disc
  // widens the border. The first sits on the claimed hex nearest the bog (so the bog buildings have claimed
  // moss, creek and shore to stand on), the second nearest the sea, the third farthest from both.
  const bogs = hexesInRadius(home, BUILD_SEARCH_RADIUS).filter((c) => model.getTile(c.q, c.r).bog);
  const seas = hexesInRadius(home, BUILD_SEARCH_RADIUS + 4).filter((c) => model.getTile(c.q, c.r).terrain === 'sea');
  const byDistanceTo = (targets: AxialCoord[]) => (spots: AxialCoord[]) =>
    spots.sort((a, b) => distanceToBog(targets, a) - distanceToBog(targets, b) || hexDistance(home, a) - hexDistance(home, b));
  const byBog = byDistanceTo(bogs);
  const towers: AxialCoord[] = [];
  const raiseTower = (spot: AxialCoord | undefined) => {
    if (!spot) return;
    towers.push(spot);
    const tile = model.getTile(spot.q, spot.r);
    while ((tile.buildingLevel ?? 1) < TOWER_PLAN_LEVEL && model.upgradeBuilding(settlement.id, spot)) {
      // one level per call
    }
  };
  if (bogs.length > 0) raiseTower(place(BOG_SIDE_TOWER, byBog(dry())));
  // Two hexes inland where it can, so the tower leaves the shore hexes themselves to the dockyard and fishing hut.
  if (seas.length > 0) {
    const inland = dry().filter((c) => distanceToBog(seas, c) >= 2);
    raiseTower(place(BOG_SIDE_TOWER, byDistanceTo(seas)(inland.length > 0 ? inland : dry())));
  }
  const apart = (c: AxialCoord) => towers.reduce((d, t) => Math.min(d, hexDistance(t, c)), Infinity);
  raiseTower(place(BOG_SIDE_TOWER, dry().sort((a, b) => apart(b) - apart(a) || hexDistance(home, a) - hexDistance(home, b))));

  if (bogs.length > 0) {
    const bogSpots = byBog(dry());
    for (const type of BOG_BUILDINGS) place(type, bogSpots);
  }
  for (const type of VILLAGE_BUILDINGS.filter((t) => !isMill(t))) place(type, nearHome());
  // The coast last: its buildings need shore hexes, which nothing else should have taken.
  const shore = byDistanceTo(seas);
  for (const type of COAST_BUILDINGS) place(type, shore(dry()));
  const buildings = hexesInRadius(home, BUILD_SEARCH_RADIUS + 4).filter((c) => model.getTile(c.q, c.r).buildingType);
  // Only now, with the layout settled: raising levels afterwards moves nothing already standing.
  for (const c of buildings) {
    const tile = model.getTile(c.q, c.r);
    // A tower's claim disc is as wide as its level: past TOWER_PLAN_LEVEL it would shade far more sea than land around the coast.
    const target = tile.buildingType === 'tower' ? TOWER_PLAN_LEVEL : Math.min(SHOWCASE_BUILDING_LEVEL, maxLevelFor(tile.buildingType!));
    while ((tile.buildingLevel ?? 1) < target && model.upgradeBuilding(settlement.id, c)) {
      // one level per call
    }
  }
  // Buildings first, so the giant and camps avoid them.
  ensureGiantMountain(model, center, home, worldSeed, buildings);
  ensureCamps(model, center, home, worldSeed);
  diversifyLooks(model, center, worldSeed);
  return { settlement, center, frameCenter: frameCenterBetween(model, center, { q: settlement.q, r: settlement.r }) };
}

/**
 * Where the frame's camera centres: halfway from the bog site (`center`, what the
 * village was planned around) towards the longhouse, so the village sits well
 * inside the wider frame instead of at its edge. The crop is flood-filled from
 * this hex, so it must be land on the same island; the nearest land on the way
 * back to `center` is taken otherwise.
 */
function frameCenterBetween(model: WorldModel, center: AxialCoord, home: AxialCoord): AxialCoord {
  const steps = hexDistance(center, home);
  for (let k = Math.round(steps / 2); k > 0; k--) {
    const c = hexLerp(center, home, k / steps);
    if (model.isLand(c.q, c.r)) return c;
  }
  return center;
}

/** The hex a fraction `t` of the way from `a` to `b` (cube lerp + round). */
function hexLerp(a: AxialCoord, b: AxialCoord, t: number): AxialCoord {
  const x = a.q + (b.q - a.q) * t;
  const z = a.r + (b.r - a.r) * t;
  const y = -x - z;
  let rx = Math.round(x);
  const ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy <= dz) rz = -rx - ry;
  return { q: rx, r: rz };
}
