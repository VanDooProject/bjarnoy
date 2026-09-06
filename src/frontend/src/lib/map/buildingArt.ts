// Shared building/terrain artwork lookup, so the hex detail screen
// (BuildingModal), the ring menu's hover card, and the docs pages show the
// same picture for the same building instead of several copies of this
// glob drifting apart.
//
// Preferred source is the `showcase` atlas category (see atlas.ts): one
// higher-res, pre-composited (base + props already merged) image per
// family/orientation/level, always the `_SE` rotation — the fixed camera
// angle these surfaces render at. Families showcase doesn't have a given
// level for yet (e.g. `hut`/vikinghut isn't in showcase at all) fall back
// to the older, lower-res per-level hextiles/ PNG.
import { findAtlasFrame, type AtlasFrameRect } from './atlas';
import fishinghutUrl from '../../../vendor/bg_assets_hextile/hextiles/fishinghutbuilding_SE.png';
import magictowerUrl from '../../../vendor/bg_assets_hextile/hextiles/magictower_SE.png';

/** Either a showcase atlas frame (preferred) or a plain PNG URL fallback — <AtlasSprite>/<img> render either uniformly. */
export type ArtRef = { kind: 'atlas'; frame: AtlasFrameRect } | { kind: 'png'; url: string };

const BUILDING_ART_FAMILIES: Record<string, string> = {
  hut: 'vikinghut',
  longhouse: 'greathall',
  shrineofthor: 'thorshrine',
  shrineoffreyja: 'freyjashrine',
  farm: 'farm_crop',
  tower: 'towerbuilding',
  pumpkinfarm: 'farm_pumpkin',
  lumberjack: 'lumberjackhut',
  storagehouse: 'storagebuilding',
  archeryrange: 'archerybuilding',
  dockyard: 'dockyard',
  greatstorehouse: 'bigstoragehouse',
  barracks: 'barracks',
  fisherhut: 'fisherhut',
  // The preview card always shows the flat/inland family, regardless of
  // where (or whether) the actual tile sits next to a river — see
  // textures.ts's textureKeyFor/WorldModel.sawmillArtVariantOf for the
  // adjacency-aware picker the world-map renderer uses instead.
  sawmill: 'sawmill',
};

// fishinghut/magictower have no level suffix at all — a single composited
// image per building, unlike the families above — and showcase doesn't
// carry them yet, so these stay PNG-only.
const SINGLE_LEVEL_ART: Record<string, string> = {
  fishinghut: fishinghutUrl,
  magictower: magictowerUrl,
};

const LEVEL_RE = /_level(\d{3})\.png$/;
const buildingArtModules = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/{vikinghut,greathall,farm_crop,towerbuilding,farm_pumpkin,thorshrine,freyjashrine,lumberjackhut,storagebuilding,archerybuilding,dockyard,bigstoragehouse,barracks,fisherhut,sawmill}_SE_level*.png',
  { eager: true, import: 'default' },
) as Record<string, string>;

const pngArtByFamily: Record<string, string[]> = {};
for (const [path, url] of Object.entries(buildingArtModules)) {
  const level = LEVEL_RE.exec(path);
  if (!level) continue;
  const prefix = path.slice(path.lastIndexOf('/') + 1, path.indexOf('_SE_level'));
  (pngArtByFamily[prefix] ??= [])[Number(level[1])] = url;
}

function pngBuildingArt(family: string, level: number): string | undefined {
  const levels = pngArtByFamily[family];
  if (!levels?.length) return undefined;
  return levels[clampLevel(level, levels.length - 1)];
}

const TERRAIN_SHOWCASE_FAMILY: Record<string, string> = {
  sea: 'watertile',
  sand: 'sandtile',
  grass: 'grasstile',
  forest: 'foresttile',
  mountain: 'mountaintile',
};

/** Same fallback as `textures.ts`'s `clampIndex`: a level past this building's art rungs renders at the richest one it has. */
function clampLevel(level: number, maxLevel: number): number {
  return Math.min(Math.max(level, 0), maxLevel);
}

function showcaseBuildingFrame(family: string, level: number): AtlasFrameRect | undefined {
  // Buildings only ever go up, and the atlas has a finite top rung per
  // family — walk down from the requested level until one exists rather
  // than tracking each family's max separately.
  for (let l = clampLevel(level, 20); l >= 0; l--) {
    const frame = findAtlasFrame('showcase', `${family}_SE_level${String(l).padStart(3, '0')}`);
    if (frame) return frame;
  }
  return undefined;
}

/**
 * Art for a building at a level. Indexed by level number so the picture
 * actually changes as a building is upgraded, rather than one hardcoded
 * level per type. Returns undefined for a type with no art in the pack.
 */
export function buildingArt(type: string, level = 1): ArtRef | undefined {
  if (SINGLE_LEVEL_ART[type]) return { kind: 'png', url: SINGLE_LEVEL_ART[type] };
  const family = BUILDING_ART_FAMILIES[type];
  if (!family) return undefined;
  const frame = showcaseBuildingFrame(family, level);
  if (frame) return { kind: 'atlas', frame };
  const pngUrl = pngBuildingArt(family, level);
  return pngUrl ? { kind: 'png', url: pngUrl } : undefined;
}

/** Art for a bare hex, used when there's no building to show. Grass/forest use the decorated variant so the picture matches what the tile looks like in-game. */
export function terrainArt(terrain: string): ArtRef {
  const family = TERRAIN_SHOWCASE_FAMILY[terrain] ?? TERRAIN_SHOWCASE_FAMILY.grass!;
  const decorated = findAtlasFrame('showcase', `${family}_SE_variant000`);
  const frame = decorated ?? findAtlasFrame('showcase', `${family}_SE`) ?? findAtlasFrame('showcase', `${family}_SE_level000`);
  return { kind: 'atlas', frame: frame! };
}
