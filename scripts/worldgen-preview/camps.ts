// The `camps` layer: the wildlife camps of the islands in view, generated with the real client
// port of the backend's pipeline (rivers -> giants -> camps, `campPlacement.ts`), island by island
// in the backend's own index order so the picture matches what a server world holds. Drawn as a
// marker per family, coloured by strength (strong / weak) with a ring at the guard range.
import type { AxialCoord } from '../../src/frontend/src/lib/hex/coords';
import {
  CAMP_FAMILIES,
  guardRange,
  placeCamps,
  type CampFamily,
  type CampStrength,
} from '../../src/frontend/src/lib/map/campPlacement';
import { generateRivers } from '../../src/frontend/src/lib/map/riverGenerator';
import { placeGiants } from '../../src/frontend/src/lib/map/giantPlacement';
import {
  islandDepthAt,
  terrainAt,
  wastedDepthAt,
  wastedTerrainAt,
  type WorldSeed,
} from '../../src/frontend/src/lib/map/worldGenerator';
import type { Terrain } from '../../src/frontend/src/lib/map/types';
import { findLandmasses, landmassTiles } from './landmasses';
import type { Layer, MarkerShape, OverlayCanvas, PreviewContext, Rgb } from './layers';

/** `WorldGenerationOptions.MinimumIslandTiles`' default: smaller landmasses are not islands. */
const MINIMUM_ISLAND_TILES = 6;

export const STRONG_CAMP_COLOUR: Rgb = [255, 64, 200];
export const WEAK_CAMP_COLOUR: Rgb = [64, 230, 255];

/** One marker shape per placeable family (the bog families are not placed yet, so have none). */
export const CAMP_MARKERS: Partial<Record<CampFamily, MarkerShape>> = {
  wolfden: 'disc',
  boarwallow: 'square',
  bearrapids: 'diamond',
  fenrirbrood: 'triangle',
  sealhaulout: 'hollowDisc',
  eagleeyrie: 'triangleDown',
};

export interface PreviewCamp {
  q: number;
  r: number;
  family: CampFamily;
  level: number;
  strong: boolean;
  guardRange: number;
  islandIndex: number;
  wasted: boolean;
}

export interface CampsResult {
  camps: PreviewCamp[];
  /** Camps of each island generated (one entry per island in view, in index order). */
  perIsland: number[];
  islands: number;
}

/** The camps of one island — the backend's `WorldGenerator.BuildIslands` order: rivers, then giants, then camps. */
export function campsOfIsland(
  world: WorldSeed,
  tiles: AxialCoord[],
  index: number,
  wasted: boolean,
): PreviewCamp[] {
  const terrainOf = (c: AxialCoord): Terrain => (wasted ? wastedTerrainAt(c.q, c.r, world) : terrainAt(c.q, c.r, world));
  const depthAt = (c: AxialCoord) => (wasted ? wastedDepthAt(c.q, c.r, world) : islandDepthAt(c.q, c.r, world));
  const globalIsLand = (c: AxialCoord) => terrainAt(c.q, c.r, world) !== 'sea';
  const rivers = generateRivers(tiles, terrainOf, depthAt, globalIsLand, world.seed, index, wasted, !wasted);
  const riverKeys = new Set(rivers.map((t) => `${t.q},${t.r}`));
  const giants = placeGiants(tiles, terrainOf, world.seed, index, (c) => riverKeys.has(`${c.q},${c.r}`), wasted);
  return placeCamps(tiles, terrainOf, rivers, giants.map((g) => g.anchor), world.seed, index, wasted).map((p) => {
    const strength: CampStrength = CAMP_FAMILIES.find((f) => f.family === p.family)!.strength;
    return {
      q: p.coord.q,
      r: p.coord.r,
      family: p.family,
      level: p.level,
      strong: strength === 'strong',
      guardRange: guardRange(p.level, strength),
      islandIndex: index,
      wasted,
    };
  });
}

const cache = new WeakMap<PreviewContext, CampsResult>();

/** All camps of the islands the window shows (memoised per picture: the overlay and the stats share it). */
export function campsFor(context: PreviewContext): CampsResult {
  const hit = cache.get(context);
  if (hit) return hit;

  const { world, window: win, windowed } = context;
  const green = findLandmasses(world).landmasses.filter((l) => l.tiles >= MINIMUM_ISLAND_TILES);
  const wasted = findLandmasses(world, true).landmasses.filter((l) => l.tiles >= MINIMUM_ISLAND_TILES);
  // Island indices are the backend's: green islands in lowest-(q, r) order, wasted ones after them.
  const islands = [
    ...green.map((landmass, i) => ({ landmass, index: i, wasted: false })),
    ...wasted.map((landmass, i) => ({ landmass, index: green.length + i, wasted: true })),
  ];
  const reach = win.size / 2 + 12;
  const camps: PreviewCamp[] = [];
  const perIsland: number[] = [];
  for (const { landmass, index, wasted: isWasted } of islands) {
    if (windowed) {
      const b = landmass.bounds;
      if (b.maxQ < win.q - reach || b.minQ > win.q + reach || b.maxR < win.r - reach || b.minR > win.r + reach) continue;
    }
    const tiles = landmassTiles(world, isWasted, landmass.lowest);
    const found = campsOfIsland(world, tiles, index, isWasted);
    perIsland.push(found.length);
    camps.push(...found);
  }

  const result = { camps, perIsland, islands: perIsland.length };
  cache.set(context, result);
  return result;
}

function familyLabel(family: string): string {
  return family.toUpperCase();
}

const PLACED_FAMILIES = CAMP_FAMILIES.filter((f) => CAMP_MARKERS[f.family]);

export const campsLayer: Layer = {
  id: 'camps',
  description: 'wildlife camps: a marker per family, ring = guard range, magenta strong / cyan weak',
  legend: [
    ...PLACED_FAMILIES.map((f) => ({
      label: `${familyLabel(f.family)}`,
      colour: f.strength === 'strong' ? STRONG_CAMP_COLOUR : WEAK_CAMP_COLOUR,
      shape: CAMP_MARKERS[f.family],
    })),
    { label: 'strong camp / guard range', colour: STRONG_CAMP_COLOUR, shape: 'ring' as const },
    { label: 'weak camp / guard range', colour: WEAK_CAMP_COLOUR, shape: 'ring' as const },
  ],
  colourAt: () => null,
  overlay(canvas: OverlayCanvas, context: PreviewContext) {
    const { camps } = campsFor(context);
    const markerRadius = Math.max(3, Math.min(9, canvas.scale * 0.9));
    const colourOf = (camp: PreviewCamp) => (camp.strong ? STRONG_CAMP_COLOUR : WEAK_CAMP_COLOUR);
    // Rings first, so no ring is drawn over another camp's marker.
    for (const camp of camps) {
      const { x, y } = canvas.toPixel(camp.q, camp.r);
      // Guard range in hex steps; a hex is sqrt(3) * scale across its flats.
      canvas.marker(x, y, 'ring', (camp.guardRange + 0.5) * Math.sqrt(3) * canvas.scale, colourOf(camp));
    }
    for (const camp of camps) {
      const { x, y } = canvas.toPixel(camp.q, camp.r);
      canvas.marker(x, y, CAMP_MARKERS[camp.family] ?? 'disc', markerRadius, colourOf(camp));
    }
  },
  stats(context: PreviewContext): string[] {
    const { camps, perIsland, islands } = campsFor(context);
    const sorted = [...perIsland].sort((a, b) => a - b);
    const median = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!;
    const strong = camps.filter((c) => c.strong).length;
    const byFamily = CAMP_FAMILIES.filter((f) => CAMP_MARKERS[f.family])
      .map((f) => `${familyLabel(f.family)} ${camps.filter((c) => c.family === f.family).length}`)
      .join('  ');
    const scope = context.windowed ? 'ISLANDS IN VIEW' : 'ISLANDS';
    return [
      `CAMPS ${camps.length}  ${scope} ${islands} (${perIsland.filter((n) => n > 0).length} WITH CAMPS)  PER ISLAND MIN ${sorted[0] ?? 0} MEDIAN ${median} MAX ${sorted[sorted.length - 1] ?? 0}  STRONG ${strong} WEAK ${camps.length - strong}`,
      `CAMPS BY FAMILY  ${byFamily}`,
    ];
  },
};
