// Shared building/terrain artwork lookup, so the hex detail screen
// (BuildingModal) and the ring menu's hover card show the same picture for
// the same building instead of two copies of this glob drifting apart.
//
// Each building family ships one composited (base + props already merged)
// image per level, e.g. `greathall_SE_level000.png` .. `_level004.png`,
// always the `_SE` rotation — the fixed camera angle both surfaces render at.
import grassUrl from '../../../vendor/bg_assets_hextile/hextiles/grasstile_SE.png';
import forestUrl from '../../../vendor/bg_assets_hextile/hextiles/foresttile_SE.png';
import mountainUrl from '../../../vendor/bg_assets_hextile/hextiles/mountaintile_SE.png';
import sandUrl from '../../../vendor/bg_assets_hextile/hextiles/sandtile_SE.png';
import fishinghutUrl from '../../../vendor/bg_assets_hextile/hextiles/fishinghutbuilding_SE.png';
import magictowerUrl from '../../../vendor/bg_assets_hextile/hextiles/magictower_SE.png';

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
};

// fishinghut/magictower have no level suffix at all — a single composited
// image per building, unlike the families above.
const SINGLE_LEVEL_ART: Record<string, string> = {
  fishinghut: fishinghutUrl,
  magictower: magictowerUrl,
};

export const TERRAIN_ART: Record<string, string> = {
  grass: grassUrl,
  forest: forestUrl,
  mountain: mountainUrl,
  sand: sandUrl,
};

const LEVEL_RE = /_level(\d{3})\.png$/;
const buildingArtModules = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/{vikinghut,greathall,farm_crop,towerbuilding,farm_pumpkin,thorshrine,freyjashrine,lumberjackhut,storagebuilding}_SE_level*.png',
  { eager: true, import: 'default' },
) as Record<string, string>;

const artByPrefix: Record<string, string[]> = {};
for (const [path, url] of Object.entries(buildingArtModules)) {
  const level = LEVEL_RE.exec(path);
  if (!level) continue;
  const prefix = path.slice(path.lastIndexOf('/') + 1, path.indexOf('_SE_level'));
  (artByPrefix[prefix] ??= [])[Number(level[1])] = url;
}
const BUILDING_ART_BY_LEVEL: Record<string, string[]> = {};
for (const [key, prefix] of Object.entries(BUILDING_ART_FAMILIES)) {
  BUILDING_ART_BY_LEVEL[key] = artByPrefix[prefix] ?? [];
}

/** Same fallback as `textures.ts`'s `clampIndex`: a level past this building's art rungs renders at the richest one it has. */
function artForLevel(levels: string[], level: number): string {
  return levels[Math.min(Math.max(level, 0), levels.length - 1)];
}

/**
 * Art for a building at a level. Indexed by level number so the picture
 * actually changes as a building is upgraded, rather than one hardcoded
 * level per type. Returns undefined for a type with no art in the pack.
 */
export function buildingArt(type: string, level = 1): string | undefined {
  if (SINGLE_LEVEL_ART[type]) return SINGLE_LEVEL_ART[type];
  const levels = BUILDING_ART_BY_LEVEL[type];
  return levels?.length ? artForLevel(levels, level) : undefined;
}

/** Art for a bare hex, used when there's no building to show. */
export function terrainArt(terrain: string): string {
  return TERRAIN_ART[terrain] ?? grassUrl;
}
