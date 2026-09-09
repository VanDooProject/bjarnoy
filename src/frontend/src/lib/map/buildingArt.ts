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

/**
 * Terrain has no per-level "showcase" atlas art (the `terrain` webp atlas
 * only carries the runtime's split base/top layers, not a single flattened
 * picture per hex) — this is the same single, pre-composited loose PNG
 * `pngBuildingArt` falls back to for buildings, just keyed by the terrain
 * family name instead of a building family. `coastalwatertile` is the only
 * family the pack ships a decorated `_variant000`/`_variant001` loose PNG
 * for; the rest only have the plain, undecorated flattened image.
 */
const terrainArtModules = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/{watertile,coastalwatertile,sandtile,grasstile,foresttile,mountaintile,rivertile,rivertile_bend,rivertile_bend60,rivertile_spring,rivertile_y_narrow}_SE*.png',
  { eager: true, import: 'default' },
) as Record<string, string>;

const terrainPngByName: Record<string, string> = {};
for (const [path, url] of Object.entries(terrainArtModules)) {
  const name = path.slice(path.lastIndexOf('/') + 1, -'.png'.length);
  terrainPngByName[name] = url;
}

/**
 * The river art pack's five shapes (`RiverTileShape` minus `mouth`, which
 * has no art of its own — see `types.ts`'s `mouthOrientationOf`), each as
 * one flattened loose PNG rather than a runtime base/top split, same as
 * `terrainPngByName` above.
 */
const RIVER_SHAPE_FAMILY: Record<string, string> = {
  straight: 'rivertile',
  bend: 'rivertile_bend',
  bend60: 'rivertile_bend60',
  spring: 'rivertile_spring',
  confluence: 'rivertile_y_narrow',
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

/**
 * Art for one terrain-art-pack family. Tries the "showcase" atlas first
 * (currently never populated — see `terrainPngByName` above — but kept as
 * the preferred source the way `buildingArt` does, in case a future pack
 * ships it), then the flattened loose PNG. `decorated` picks the
 * `_variant000` frame/PNG when the family has one — the plain, undecorated
 * one otherwise (or always, when the family has no decorated frame at all).
 */
function terrainFamilyArt(family: string, decorated: boolean): ArtRef {
  const frame = decorated
    ? (findAtlasFrame('showcase', `${family}_SE_variant000`) ?? findAtlasFrame('showcase', `${family}_SE`))
    : (findAtlasFrame('showcase', `${family}_SE`) ?? findAtlasFrame('showcase', `${family}_SE_level000`));
  if (frame) return { kind: 'atlas', frame };
  const pngUrl = decorated
    ? (terrainPngByName[`${family}_SE_variant000`] ?? terrainPngByName[`${family}_SE`])
    : terrainPngByName[`${family}_SE`];
  if (!pngUrl) throw new Error(`buildingArt.ts: no terrain art for family "${family}"`);
  return { kind: 'png', url: pngUrl };
}

/** Art for a bare hex, used when there's no building to show. Grass/forest use the decorated variant so the picture matches what the tile looks like in-game. */
export function terrainArt(terrain: string): ArtRef {
  const family = TERRAIN_SHOWCASE_FAMILY[terrain] ?? TERRAIN_SHOWCASE_FAMILY.grass!;
  return terrainFamilyArt(family, terrain === 'grass' || terrain === 'forest');
}

/** Art for coastal (shallow) water — a rendering variant of `sea`, not a `Terrain` of its own (see `Tile.isCoastalWater`), so it isn't reachable through `terrainArt`. */
export function coastalWaterArt(): ArtRef {
  return terrainFamilyArt('coastalwatertile', false);
}

/** Art for one of a river's five drawn shapes (`mouth` renders as `straight`/`bend`, same as the map — see `mouthOrientationOf`). */
export function riverArt(shape: 'straight' | 'bend' | 'bend60' | 'spring' | 'confluence'): ArtRef {
  return terrainFamilyArt(RIVER_SHAPE_FAMILY[shape]!, false);
}
