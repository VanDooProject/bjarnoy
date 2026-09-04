// Hex tile art comes from the VanDooProject/bg_assets_hextile git submodule
// at src/frontend/vendor/bg_assets_hextile (see that directory's own
// README) — not copied in, so `git submodule update --init` (or a checkout
// with `submodules: true`, as .github/workflows/frontend-ci.yml uses) is
// required before this module resolves. Every tile is a single 200x300 PNG
// per camera rotation, a flat-top hex "plate" (top face 200x92, starting at
// y=140) with a thick earthen skirt below it and, for taller assets, props
// rising above it.
//
// Where the pack has one, we use its base/top split — ground-only under
// hextiles/base, props/building-only under hextiles/top, sharing the same
// 200x300 framing as the composited root file — instead of the single
// composited image. Per that directory's own README, this exists "so realm
// borders, or mouse hover effects can be placed between top-ing and base
// tile": HexMapRenderer draws base, then the border/hover layers, then top,
// so a border or hover highlight sits on the ground and tucks *under* a
// tile's trees/building rather than being sliced across their canopy.
// Terrains the pack doesn't split (sand, mountain, sea/coastal water) and
// one building it doesn't split (tower) fall back to their single
// composited image as the base layer, with no top layer.
//
// Every hex renders with one of the pack's six camera rotations
// (`TileOrientation`) and, where the pack has more than one look for a
// terrain/building, a numbered variant (terrain) or level (building) —
// see `worldGenerator.ts`'s `orientationAt`/`variantAt` and
// `Tile.buildingLevel`. Rather than one hand-written `import` per
// orientation/variant/level combination (100+ once every family is
// covered), each asset *family* actually used — e.g. every `grasstile_*`
// file — is pulled in with one `import.meta.glob`, scoped to that family's
// filename prefix so unused families (of which the pack has a few — no
// quarry art exists, for instance) are still never bundled.
import { Assets, Texture } from 'pixi.js';
import type { RiverTile, Terrain, Tile, TileOrientation } from './types';
import {
  bendOrientationOf,
  mouthOrientationOf,
  springOrientationOf,
  straightOrientationOf,
  TILE_ORIENTATIONS,
} from './types';

export const TILE_ART_NATIVE_W = 200;
export const TILE_ART_NATIVE_H = 300;
// Sprites are scaled uniformly from a *width* reference (sprite.width is set
// to the display tile width; height follows the native H/W aspect ratio),
// so every pixel measurement taken off the native art — including this
// vertical offset — has to be expressed as a fraction of the native WIDTH
// (200), not the native height, or it scales by the wrong factor and the
// art ends up misaligned with the (width-scaled) hex-top polygons used for
// borders/fog.
/** Fraction of the tile width down to where the flat top face begins (140 / 200). */
export const TILE_ART_TOPFACE_Y_FRAC = 140 / 200;
/** Top-face height as a fraction of the tile width (92 / 200). */
export const TILE_ART_TOPFACE_H_FRAC = 92 / 200;

// 'sawmillriver'/'sawmillbend' aren't real `Tile['buildingType']` values —
// a Sawmill's wire building type always stays 'sawmill' (see
// `WorldModel.sawmillArtVariantOf`) — they're purely extra texture-lookup
// keys for its two river-adjacent art families.
export type TextureKey = Terrain | NonNullable<Tile['buildingType']> | 'sawmillriver' | 'sawmillbend';

type OrientationMap<T> = Record<TileOrientation, T>;

// Every file in each glob'd family, keyed by its full module path (Vite
// resolves these to hashed asset URLs at build time — the string value,
// not the path key, is what we actually use).
type AssetModules = Record<string, string>;

const ROOT_TERRAIN = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/{watertile,coastalwatertile,sandtile,mountaintile}_*.png',
  { eager: true, import: 'default' },
) as AssetModules;
// Single composited image per orientation, no levels, no base/top split —
// same shape as the plain root terrains above.
const ROOT_BUILDING_PLAIN = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/{fishinghutbuilding,magictower}_*.png',
  { eager: true, import: 'default' },
) as AssetModules;
const SPLIT_TERRAIN_BASE = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/base/{grasstile,foresttile}_*_base.png',
  { eager: true, import: 'default' },
) as AssetModules;
const SPLIT_TERRAIN_TOP = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/top/{grasstile,foresttile}_*.png',
  { eager: true, import: 'default' },
) as AssetModules;
const ROOT_BUILDING_LEVELED = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/{towerbuilding,dockyard}_*.png',
  { eager: true, import: 'default' },
) as AssetModules;
const SPLIT_BUILDING_BASE = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/base/{vikinghut,greathall,farm_crop,farm_pumpkin,thorshrine,freyjashrine,lumberjackhut,storagebuilding,archerybuilding,bigstoragehouse,barracks,sawmill}_*_base.png',
  { eager: true, import: 'default' },
) as AssetModules;
const SPLIT_BUILDING_TOP = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/top/{vikinghut,greathall,farm_crop,farm_pumpkin,thorshrine,freyjashrine,lumberjackhut,storagebuilding,archerybuilding,bigstoragehouse,barracks,sawmill}_*.png',
  { eager: true, import: 'default' },
) as AssetModules;
// fisherhut/sawmillriver/sawmillbend are also base/top split, but — unlike
// every family above, whose base is one level-invariant tint — their *base*
// layer itself carries a level rung too (e.g.
// `base/fisherhut_E_level000_base.png`), so it needs `buildIndexed` (like
// `ROOT_BUILDING_LEVELED` below) rather than `buildPlain`. Their glob is
// `sawmill_*` (not `sawmillriver_*`)-safe because the pack always puts an
// underscore right after the family name — "sawmillriver_..." never matches
// a "sawmill_*" pattern, so this doesn't collide with plain `sawmill`'s own
// glob above.
const SPLIT_BUILDING_BASE_LEVELED = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/base/{fisherhut,sawmillriver,sawmillbend}_*_level*_base.png',
  { eager: true, import: 'default' },
) as AssetModules;
const SPLIT_BUILDING_TOP_LEVELED = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/top/{fisherhut,sawmillriver,sawmillbend}_*_level*.png',
  { eager: true, import: 'default' },
) as AssetModules;
// One glob per river shape (not a single `rivertile_*` prefix glob): the
// four shapes' filenames share the `rivertile_` prefix with an extra infix
// (`bend_`/`spring_`/`y_narrow_`) before the orientation token, so a plain
// prefix match (as buildPlain/buildIndexed use for every other family) can't
// tell "straight" apart from the other three by prefix alone — keeping each
// shape in its own glob result is what does. This also sidesteps the pack's
// one stray `rivertile_SE_x2.png` in `top/`, which doesn't fit any shape's
// exact orientation-suffixed pattern.
//
// Each pattern is a plain string literal (not built from a shared constant):
// Vite's import.meta.glob is resolved by statically parsing the source text
// of this exact call, not by evaluating a runtime expression, so the brace
// alternation has to be written out at every call site or Vite can't see it.
const RIVER_BASE_STRAIGHT = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/base/rivertile_{E,NE,NW,W,SW,SE}_base.png',
  { eager: true, import: 'default' },
) as AssetModules;
const RIVER_BASE_BEND = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/base/rivertile_bend_{E,NE,NW,W,SW,SE}_base.png',
  { eager: true, import: 'default' },
) as AssetModules;
// The 120°-off-straight turn (RiverTileShape.Bend60) — a distinct art family
// from the 60°-off-straight `bend` above, not a variant of it. Its filename
// prefix is `rivertile_bend60_`, which the plain `bend` glob above can't
// match (`bend_` requires an underscore right after "bend", and "60" sits
// there instead), so it needs its own glob rather than colliding with it.
const RIVER_BASE_BEND60 = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/base/rivertile_bend60_{E,NE,NW,W,SW,SE}_base.png',
  { eager: true, import: 'default' },
) as AssetModules;
const RIVER_BASE_SPRING = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/base/rivertile_spring_{E,NE,NW,W,SW,SE}_base.png',
  { eager: true, import: 'default' },
) as AssetModules;
const RIVER_BASE_CONFLUENCE = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/base/rivertile_y_narrow_{E,NE,NW,W,SW,SE}_base.png',
  { eager: true, import: 'default' },
) as AssetModules;
const RIVER_TOP_STRAIGHT = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/top/rivertile_{E,NE,NW,W,SW,SE}.png',
  { eager: true, import: 'default' },
) as AssetModules;
const RIVER_TOP_BEND = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/top/rivertile_bend_{E,NE,NW,W,SW,SE}.png',
  { eager: true, import: 'default' },
) as AssetModules;
const RIVER_TOP_BEND60 = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/top/rivertile_bend60_{E,NE,NW,W,SW,SE}.png',
  { eager: true, import: 'default' },
) as AssetModules;
const RIVER_TOP_SPRING = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/top/rivertile_spring_{E,NE,NW,W,SW,SE}.png',
  { eager: true, import: 'default' },
) as AssetModules;
const RIVER_TOP_CONFLUENCE = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/top/rivertile_y_narrow_{E,NE,NW,W,SW,SE}.png',
  { eager: true, import: 'default' },
) as AssetModules;

/** The orientation token embedded in every filename, e.g. `..._NE_...` or `..._NE.png`. */
const ORIENTATION_RE = /_(NE|NW|SW|SE|E|W)(?:_|\.)/;
/** A numbered terrain-variant suffix, e.g. `_variant001.png`. */
const VARIANT_RE = /_variant(\d{3})\.png$/;
/**
 * A numbered building-level suffix, e.g. `_level004.png` (a top/root file)
 * or `_level004_base.png` (a leveled base file — see
 * `SPLIT_BUILDING_BASE_LEVELED`).
 */
const LEVEL_RE = /_level(\d{3})(?:_base)?\.png$/;

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function orientationOf(path: string): TileOrientation {
  const match = ORIENTATION_RE.exec(basename(path));
  if (!match) {
    throw new Error(`textures.ts: couldn't find an orientation token in "${path}"`);
  }
  return match[1] as TileOrientation;
}

/**
 * A terrain-variant family (grass/forest top) has a plain, unsuffixed file
 * as well as numbered `variantNNN` ones — the plain file is index 0 and
 * `variantNNN` is index `NNN + 1`. A building-level family (tower, hut/
 * longhouse/farm top) has no plain file at all — every rung is a numbered
 * `levelNNN`, which *is* its index directly, `000` included.
 */
function explicitIndexOf(path: string): number | null {
  const base = basename(path);
  const variant = VARIANT_RE.exec(base);
  if (variant) return Number(variant[1]) + 1;
  const level = LEVEL_RE.exec(base);
  if (level) return Number(level[1]);
  return null;
}

function emptyOrientationMap<T>(fill: () => T): OrientationMap<T> {
  const map = {} as OrientationMap<T>;
  for (const orientation of TILE_ORIENTATIONS) {
    map[orientation] = fill();
  }
  return map;
}

/** Builds a plain (one file per orientation, no variant/level) lookup from a glob result. */
function buildPlain(modules: AssetModules, prefix: string): OrientationMap<string> {
  const map = {} as Partial<OrientationMap<string>>;
  for (const [path, url] of Object.entries(modules)) {
    if (!basename(path).startsWith(prefix)) continue;
    map[orientationOf(path)] = url;
  }
  return map as OrientationMap<string>;
}

/**
 * Builds an indexed (variant or level) lookup from a glob result: per
 * orientation, an array ordered `[plain-or-000, 001, 002, ...]` — the same
 * ordering `variantAt`/a building's level number already index into
 * directly, so no separate offset table is needed at render time.
 */
function buildIndexed(modules: AssetModules, prefix: string): OrientationMap<string[]> {
  const byOrientation = emptyOrientationMap<Map<number, string>>(() => new Map());
  for (const [path, url] of Object.entries(modules)) {
    if (!basename(path).startsWith(prefix)) continue;
    const orientation = orientationOf(path);
    const index = explicitIndexOf(path) ?? 0;
    byOrientation[orientation].set(index, url);
  }
  const result = {} as OrientationMap<string[]>;
  for (const orientation of TILE_ORIENTATIONS) {
    const entries = byOrientation[orientation];
    result[orientation] = Array.from({ length: entries.size }, (_, i) => {
      const url = entries.get(i);
      if (!url) {
        throw new Error(`textures.ts: "${prefix}" is missing index ${i} for orientation ${orientation}`);
      }
      return url;
    });
  }
  return result;
}

const SOURCES = {
  base: {
    sea: buildPlain(ROOT_TERRAIN, 'watertile_'),
    sand: buildPlain(ROOT_TERRAIN, 'sandtile_'),
    mountain: buildPlain(ROOT_TERRAIN, 'mountaintile_'),
    grass: buildPlain(SPLIT_TERRAIN_BASE, 'grasstile_'),
    forest: buildPlain(SPLIT_TERRAIN_BASE, 'foresttile_'),
    hut: buildPlain(SPLIT_BUILDING_BASE, 'vikinghut_'),
    longhouse: buildPlain(SPLIT_BUILDING_BASE, 'greathall_'),
    shrineofthor: buildPlain(SPLIT_BUILDING_BASE, 'thorshrine_'),
    shrineoffreyja: buildPlain(SPLIT_BUILDING_BASE, 'freyjashrine_'),
    farm: buildPlain(SPLIT_BUILDING_BASE, 'farm_crop_'),
    pumpkinfarm: buildPlain(SPLIT_BUILDING_BASE, 'farm_pumpkin_'),
    lumberjack: buildPlain(SPLIT_BUILDING_BASE, 'lumberjackhut_'),
    storagehouse: buildPlain(SPLIT_BUILDING_BASE, 'storagebuilding_'),
    archeryrange: buildPlain(SPLIT_BUILDING_BASE, 'archerybuilding_'),
    greatstorehouse: buildPlain(SPLIT_BUILDING_BASE, 'bigstoragehouse_'),
    barracks: buildPlain(SPLIT_BUILDING_BASE, 'barracks_'),
    // Flat/inland sawmill only — 'sawmillriver'/'sawmillbend' are separate
    // TextureKeys below (baseIndexed), since (unlike this family) their base
    // layer varies by level too.
    sawmill: buildPlain(SPLIT_BUILDING_BASE, 'sawmill_'),
    // Unlike towerbuilding, the pack draws the fishing hut with a real
    // per-orientation sprite (its dock visibly points a different way in
    // each of the six files) rather than one image reused at every
    // rotation — see `TerrainSampler.FishingHutOrientation` on the backend
    // for why that orientation has to be computed per building instead of
    // read off the coastal-water tile it stands on.
    fishinghut: buildPlain(ROOT_BUILDING_PLAIN, 'fishinghutbuilding_'),
    magictower: buildPlain(ROOT_BUILDING_PLAIN, 'magictower_'),
  } satisfies Partial<Record<TextureKey, OrientationMap<string>>>,
  /**
   * Coastal water is a rendering variant of `sea`, not a `TextureKey` of its
   * own — and the pack gives it 3 variants per orientation (plain +
   * `variant000`/`variant001`), same shape as grass/forest's top layer.
   */
  coastalBase: buildIndexed(ROOT_TERRAIN, 'coastalwatertile_'),
  /**
   * Tower and Dockyard aren't base/top split, so their level swap replaces
   * the *base* texture outright, with no top layer at all. FisherHut and
   * Sawmill's two river-adjacent families (`sawmillriver`/`sawmillbend`)
   * are base/top split like most buildings — they just also need their
   * *base* layer indexed by level (see `SPLIT_BUILDING_BASE_LEVELED`), so
   * they belong here too, each paired with its own leveled `top` entry
   * below rather than going without one.
   */
  baseIndexed: {
    tower: buildIndexed(ROOT_BUILDING_LEVELED, 'towerbuilding_'),
    dockyard: buildIndexed(ROOT_BUILDING_LEVELED, 'dockyard_'),
    fisherhut: buildIndexed(SPLIT_BUILDING_BASE_LEVELED, 'fisherhut_'),
    sawmillriver: buildIndexed(SPLIT_BUILDING_BASE_LEVELED, 'sawmillriver_'),
    sawmillbend: buildIndexed(SPLIT_BUILDING_BASE_LEVELED, 'sawmillbend_'),
  } satisfies Partial<Record<TextureKey, OrientationMap<string[]>>>,
  top: {
    grass: buildIndexed(SPLIT_TERRAIN_TOP, 'grasstile_'),
    forest: buildIndexed(SPLIT_TERRAIN_TOP, 'foresttile_'),
    hut: buildIndexed(SPLIT_BUILDING_TOP, 'vikinghut_'),
    longhouse: buildIndexed(SPLIT_BUILDING_TOP, 'greathall_'),
    shrineofthor: buildIndexed(SPLIT_BUILDING_TOP, 'thorshrine_'),
    shrineoffreyja: buildIndexed(SPLIT_BUILDING_TOP, 'freyjashrine_'),
    farm: buildIndexed(SPLIT_BUILDING_TOP, 'farm_crop_'),
    pumpkinfarm: buildIndexed(SPLIT_BUILDING_TOP, 'farm_pumpkin_'),
    lumberjack: buildIndexed(SPLIT_BUILDING_TOP, 'lumberjackhut_'),
    storagehouse: buildIndexed(SPLIT_BUILDING_TOP, 'storagebuilding_'),
    archeryrange: buildIndexed(SPLIT_BUILDING_TOP, 'archerybuilding_'),
    greatstorehouse: buildIndexed(SPLIT_BUILDING_TOP, 'bigstoragehouse_'),
    barracks: buildIndexed(SPLIT_BUILDING_TOP, 'barracks_'),
    sawmill: buildIndexed(SPLIT_BUILDING_TOP, 'sawmill_'),
    fisherhut: buildIndexed(SPLIT_BUILDING_TOP_LEVELED, 'fisherhut_'),
    sawmillriver: buildIndexed(SPLIT_BUILDING_TOP_LEVELED, 'sawmillriver_'),
    sawmillbend: buildIndexed(SPLIT_BUILDING_TOP_LEVELED, 'sawmillbend_'),
  } satisfies Partial<Record<TextureKey, OrientationMap<string[]>>>,
  /**
   * The art pack's four river shapes — a `RiverTileShape.Mouth` (see
   * `types.ts`) has no art of its own and renders with `straight`, same as
   * a plain through-flow tile.
   */
  riverBase: {
    straight: buildPlain(RIVER_BASE_STRAIGHT, ''),
    bend: buildPlain(RIVER_BASE_BEND, ''),
    bend60: buildPlain(RIVER_BASE_BEND60, ''),
    spring: buildPlain(RIVER_BASE_SPRING, ''),
    confluence: buildPlain(RIVER_BASE_CONFLUENCE, ''),
  } satisfies Record<RiverArtShape, OrientationMap<string>>,
  riverTop: {
    straight: buildPlain(RIVER_TOP_STRAIGHT, ''),
    bend: buildPlain(RIVER_TOP_BEND, ''),
    bend60: buildPlain(RIVER_TOP_BEND60, ''),
    spring: buildPlain(RIVER_TOP_SPRING, ''),
    confluence: buildPlain(RIVER_TOP_CONFLUENCE, ''),
  } satisfies Record<RiverArtShape, OrientationMap<string>>,
};

/** The art pack's river shapes — `RiverTileShape`'s `mouth` maps onto `straight`/`bend` (see `SOURCES.riverBase`). */
type RiverArtShape = 'straight' | 'bend' | 'bend60' | 'spring' | 'confluence';

export interface TileTextures {
  base: Partial<Record<TextureKey, OrientationMap<Texture>>>;
  coastalBase: OrientationMap<Texture[]>;
  baseIndexed: Partial<Record<TextureKey, OrientationMap<Texture[]>>>;
  top: Partial<Record<TextureKey, OrientationMap<Texture[]>>>;
  riverBase: Record<RiverArtShape, OrientationMap<Texture>>;
  riverTop: Record<RiverArtShape, OrientationMap<Texture>>;
}

let loaded: TileTextures | null = null;
let loading: Promise<TileTextures> | null = null;

export function loadTileTextures(): Promise<TileTextures> {
  if (loaded) return Promise.resolve(loaded);
  if (loading) return loading;

  const aliases: { alias: string; src: string }[] = [];
  const record = (alias: string, src: string) => {
    aliases.push({ alias, src });
    return alias;
  };

  const aliasedBase: Partial<Record<TextureKey, OrientationMap<string>>> = {};
  for (const [key, map] of Object.entries(SOURCES.base)) {
    aliasedBase[key as TextureKey] = mapOrientations(map, (o, url) => record(`base:${key}:${o}`, url));
  }
  const aliasedCoastalBase = mapOrientationArrays(SOURCES.coastalBase, (o, i, url) => record(`coastal:${o}:${i}`, url));
  const aliasedBaseIndexed: Partial<Record<TextureKey, OrientationMap<string[]>>> = {};
  for (const [key, map] of Object.entries(SOURCES.baseIndexed)) {
    aliasedBaseIndexed[key as TextureKey] = mapOrientationArrays(map, (o, i, url) =>
      record(`baseIndexed:${key}:${o}:${i}`, url),
    );
  }
  const aliasedTop: Partial<Record<TextureKey, OrientationMap<string[]>>> = {};
  for (const [key, map] of Object.entries(SOURCES.top)) {
    aliasedTop[key as TextureKey] = mapOrientationArrays(map, (o, i, url) => record(`top:${key}:${o}:${i}`, url));
  }
  const aliasedRiverBase = {} as Record<RiverArtShape, OrientationMap<string>>;
  for (const [shape, map] of Object.entries(SOURCES.riverBase)) {
    aliasedRiverBase[shape as RiverArtShape] = mapOrientations(map, (o, url) => record(`riverBase:${shape}:${o}`, url));
  }
  const aliasedRiverTop = {} as Record<RiverArtShape, OrientationMap<string>>;
  for (const [shape, map] of Object.entries(SOURCES.riverTop)) {
    aliasedRiverTop[shape as RiverArtShape] = mapOrientations(map, (o, url) => record(`riverTop:${shape}:${o}`, url));
  }

  loading = Assets.load(aliases.map((a) => ({ alias: a.alias, src: a.src }))).then(
    (textures: Record<string, Texture>) => {
      const resolve = (alias: string) => textures[alias];
      const base: TileTextures['base'] = {};
      for (const [key, map] of Object.entries(aliasedBase)) {
        base[key as TextureKey] = mapOrientations(map, (_o, alias) => resolve(alias));
      }
      const coastalBase = mapOrientationArrays(aliasedCoastalBase, (_o, _i, alias) => resolve(alias));
      const baseIndexed: TileTextures['baseIndexed'] = {};
      for (const [key, map] of Object.entries(aliasedBaseIndexed)) {
        baseIndexed[key as TextureKey] = mapOrientationArrays(map, (_o, _i, alias) => resolve(alias));
      }
      const top: TileTextures['top'] = {};
      for (const [key, map] of Object.entries(aliasedTop)) {
        top[key as TextureKey] = mapOrientationArrays(map, (_o, _i, alias) => resolve(alias));
      }
      const riverBase = {} as Record<RiverArtShape, OrientationMap<Texture>>;
      for (const [shape, map] of Object.entries(aliasedRiverBase)) {
        riverBase[shape as RiverArtShape] = mapOrientations(map, (_o, alias) => resolve(alias));
      }
      const riverTop = {} as Record<RiverArtShape, OrientationMap<Texture>>;
      for (const [shape, map] of Object.entries(aliasedRiverTop)) {
        riverTop[shape as RiverArtShape] = mapOrientations(map, (_o, alias) => resolve(alias));
      }

      loaded = { base, coastalBase, baseIndexed, top, riverBase, riverTop };
      return loaded;
    },
  );
  return loading;
}

function mapOrientations<T, U>(map: OrientationMap<T>, fn: (o: TileOrientation, v: T) => U): OrientationMap<U> {
  const result = {} as OrientationMap<U>;
  for (const orientation of TILE_ORIENTATIONS) {
    result[orientation] = fn(orientation, map[orientation]);
  }
  return result;
}

function mapOrientationArrays<T, U>(
  map: OrientationMap<T[]>,
  fn: (o: TileOrientation, i: number, v: T) => U,
): OrientationMap<U[]> {
  const result = {} as OrientationMap<U[]>;
  for (const orientation of TILE_ORIENTATIONS) {
    result[orientation] = map[orientation].map((v, i) => fn(orientation, i, v));
  }
  return result;
}

/**
 * `sawmillVariant` overrides a Sawmill tile's texture key to one of its two
 * river-adjacent families — see `WorldModel.sawmillArtVariantOf`, which
 * derives it from the tile's neighbours (a Sawmill's own hex is never
 * itself a river tile — `HexMapRenderer.rebuildTerrain` renders a river
 * tile's own art instead of any building standing "on" it). Ignored for
 * every other building/terrain.
 */
export function textureKeyFor(tile: Tile, sawmillVariant?: 'sawmillriver' | 'sawmillbend'): TextureKey {
  if (tile.buildingType === 'sawmill' && sawmillVariant) return sawmillVariant;
  return tile.buildingType ?? tile.terrain;
}

/** Clamps an index into `[0, length)` — the shared fallback for both terrain variants and building levels: an index the art pack doesn't have falls back to its richest known one. */
function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

/**
 * The base (ground) layer texture for a tile — coastal water overrides the
 * plain sea texture, and a leveled-but-unsplit building (tower) swaps its
 * whole base texture by level instead of layering a top. A building on the
 * water (the fishing hut) takes priority over both: its own texture
 * (below, via `textureKeyFor`) replaces the water tile entirely rather than
 * layering on top of it, since the pack draws the hut with its own base
 * already included.
 */
export function baseTextureFor(
  textures: TileTextures,
  tile: Tile,
  sawmillVariant?: 'sawmillriver' | 'sawmillbend',
): Texture {
  const orientation = tile.orientation ?? 'SE';
  if (tile.terrain === 'sea' && tile.isCoastalWater && !tile.buildingType) {
    const arr = textures.coastalBase[orientation];
    return arr[clampIndex(tile.variant ?? 0, arr.length)];
  }
  const key = textureKeyFor(tile, sawmillVariant);
  const indexed = textures.baseIndexed[key];
  if (indexed) {
    const arr = indexed[orientation];
    return arr[clampIndex(tile.buildingLevel ?? 1, arr.length)];
  }
  // A building with no art of its own in the pack (e.g. Lumberjack/Quarry —
  // see the module doc comment above) renders as its bare terrain instead of
  // throwing; BuildingModal.vue's own `art` computed falls back the same way.
  const base = textures.base[key] ?? textures.base[tile.terrain];
  return base![orientation];
}

/** The top (props/building) layer texture for a tile, or `undefined` if this key has no top layer. */
export function topTextureFor(
  textures: TileTextures,
  tile: Tile,
  sawmillVariant?: 'sawmillriver' | 'sawmillbend',
): Texture | undefined {
  const key = textureKeyFor(tile, sawmillVariant);
  const orientation = tile.orientation ?? 'SE';
  const arr = textures.top[key]?.[orientation];
  if (!arr) return undefined;
  const index = tile.buildingType ? (tile.buildingLevel ?? 1) : (tile.variant ?? 0);
  return arr[clampIndex(index, arr.length)];
}

/**
 * Which art file (family + rotation) a river tile renders with.
 *
 * None of these families' filename index matches the screen edge it
 * actually touches (the isometric projection reflects direction indices,
 * not just relabels them — see `docs/design/river-generation.md`'s "Art
 * pack orientation convention"), so every shape resolves its orientation
 * through the derived helpers in `types.ts` rather than using
 * `inDirections`/`outDirection` as a `TileOrientation` directly.
 *
 * `bend` is directional (`bendOrientationOf`); `bend60` — the sharper
 * 120°-off-straight turn, a separate art family from `bend` — is directional
 * the same way, reusing `bendOrientationOf` (it takes an in/out direction
 * pair, not an angle, so the same anchor logic applies); `spring` has only
 * an outflow (`springOrientationOf`); `straight` orients by whichever of
 * `inDirections[0]`/`outDirection` is available, since `straightOrientationOf`
 * gives the same file either way (`docs/design/river-generation.md` again).
 *
 * `mouth` has no art of its own — it renders as `straight` or `bend`
 * depending on the actual angle to the sea (`mouthOrientationOf`;
 * `seaDirection` is the caller's own terrain lookup, since a `RiverTile`
 * carries none), not the inflow's geometric opposite `straight` alone
 * would assume.
 *
 * `confluence` (`y_narrow`) is asymmetric — two fixed arms plus a third at
 * a fixed offset, not a simple rotated pair — and hasn't been pixel-verified
 * the way the other three families have, so it keeps the untransformed
 * `outDirection ?? inDirections[0]` this whole function used before this
 * fix, rather than risk applying a derived formula that wasn't measured
 * against it. Known-unfixed; see "Art pack orientation convention".
 */
// Exported (only) so textures.test.ts can check the shape/orientation this
// picks without going through loadTileTextures' real asset pipeline
// (Pixi's Assets.load needs a browser `document`, which this repo's node-
// environment vitest config doesn't provide).
export function riverArtFor(
  river: RiverTile,
  seaDirection: TileOrientation | null,
): { shape: 'straight' | 'bend' | 'bend60' | 'spring' | 'confluence'; orientation: TileOrientation } {
  if (river.shape === 'bend' && river.outDirection && river.inDirections[0]) {
    return { shape: 'bend', orientation: bendOrientationOf(river.inDirections[0], river.outDirection) };
  }
  if (river.shape === 'bend60' && river.outDirection && river.inDirections[0]) {
    return { shape: 'bend60', orientation: bendOrientationOf(river.inDirections[0], river.outDirection) };
  }
  if (river.shape === 'spring' && river.outDirection) {
    return { shape: 'spring', orientation: springOrientationOf(river.outDirection) };
  }
  if (river.shape === 'confluence') {
    return { shape: 'confluence', orientation: river.outDirection ?? river.inDirections[0] ?? 'SE' };
  }
  if (river.shape === 'mouth' && river.inDirections[0]) {
    return mouthOrientationOf(river.inDirections[0], seaDirection);
  }

  const direction = river.inDirections[0] ?? river.outDirection;
  return { shape: 'straight', orientation: direction ? straightOrientationOf(direction) : 'SE' };
}

/**
 * A river tile's own base/top textures, overriding whatever the underlying
 * terrain would have drawn. `seaDirection` (only meaningful for a `Mouth`
 * tile — see `riverArtFor`) is the caller's own terrain lookup
 * (`WorldModel.seaFacingDirectionOf`), since a `RiverTile` carries none.
 */
export function riverTexturesFor(
  textures: TileTextures,
  river: RiverTile,
  seaDirection: TileOrientation | null = null,
): { base: Texture; top: Texture } {
  const { shape, orientation } = riverArtFor(river, seaDirection);
  return { base: textures.riverBase[shape][orientation], top: textures.riverTop[shape][orientation] };
}
