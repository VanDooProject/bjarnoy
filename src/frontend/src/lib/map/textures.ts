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
// filename prefix so unused families (fishing hut, magic tower, pumpkin
// farm, rivers, ...) are still never bundled.
import { Assets, Texture } from 'pixi.js';
import type { Terrain, Tile, TileOrientation } from './types';
import { TILE_ORIENTATIONS } from './types';

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

export type TextureKey = Terrain | NonNullable<Tile['buildingType']>;

type OrientationMap<T> = Record<TileOrientation, T>;

// Every file in each glob'd family, keyed by its full module path (Vite
// resolves these to hashed asset URLs at build time — the string value,
// not the path key, is what we actually use).
type AssetModules = Record<string, string>;

const ROOT_TERRAIN = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/{watertile,coastalwatertile,sandtile,mountaintile}_*.png',
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
  '../../../vendor/bg_assets_hextile/hextiles/towerbuilding_*.png',
  { eager: true, import: 'default' },
) as AssetModules;
const SPLIT_BUILDING_BASE = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/base/{vikinghut,farm_crop}_*_base.png',
  { eager: true, import: 'default' },
) as AssetModules;
const SPLIT_BUILDING_TOP = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/top/{vikinghut,farm_crop}_*.png',
  { eager: true, import: 'default' },
) as AssetModules;

/** The orientation token embedded in every filename, e.g. `..._NE_...` or `..._NE.png`. */
const ORIENTATION_RE = /_(NE|NW|SW|SE|E|W)(?:_|\.)/;
/** A numbered terrain-variant suffix, e.g. `_variant001.png`. */
const VARIANT_RE = /_variant(\d{3})\.png$/;
/** A numbered building-level suffix, e.g. `_level004.png`. */
const LEVEL_RE = /_level(\d{3})\.png$/;

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
    longhouse: buildPlain(SPLIT_BUILDING_BASE, 'vikinghut_'),
    farm: buildPlain(SPLIT_BUILDING_BASE, 'farm_crop_'),
  } satisfies Partial<Record<TextureKey, OrientationMap<string>>>,
  /** Coastal water is a rendering variant of `sea`, not a `TextureKey` of its own. */
  coastalBase: buildPlain(ROOT_TERRAIN, 'coastalwatertile_'),
  /** Tower isn't base/top split, so its level swap replaces the *base* texture. */
  baseIndexed: {
    tower: buildIndexed(ROOT_BUILDING_LEVELED, 'towerbuilding_'),
  } satisfies Partial<Record<TextureKey, OrientationMap<string[]>>>,
  top: {
    grass: buildIndexed(SPLIT_TERRAIN_TOP, 'grasstile_'),
    forest: buildIndexed(SPLIT_TERRAIN_TOP, 'foresttile_'),
    hut: buildIndexed(SPLIT_BUILDING_TOP, 'vikinghut_'),
    longhouse: buildIndexed(SPLIT_BUILDING_TOP, 'vikinghut_'),
    farm: buildIndexed(SPLIT_BUILDING_TOP, 'farm_crop_'),
  } satisfies Partial<Record<TextureKey, OrientationMap<string[]>>>,
};

export interface TileTextures {
  base: Partial<Record<TextureKey, OrientationMap<Texture>>>;
  coastalBase: OrientationMap<Texture>;
  baseIndexed: Partial<Record<TextureKey, OrientationMap<Texture[]>>>;
  top: Partial<Record<TextureKey, OrientationMap<Texture[]>>>;
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
  const aliasedCoastalBase = mapOrientations(SOURCES.coastalBase, (o, url) => record(`coastal:${o}`, url));
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

  loading = Assets.load(aliases.map((a) => ({ alias: a.alias, src: a.src }))).then(
    (textures: Record<string, Texture>) => {
      const resolve = (alias: string) => textures[alias];
      const base: TileTextures['base'] = {};
      for (const [key, map] of Object.entries(aliasedBase)) {
        base[key as TextureKey] = mapOrientations(map, (_o, alias) => resolve(alias));
      }
      const coastalBase = mapOrientations(aliasedCoastalBase, (_o, alias) => resolve(alias));
      const baseIndexed: TileTextures['baseIndexed'] = {};
      for (const [key, map] of Object.entries(aliasedBaseIndexed)) {
        baseIndexed[key as TextureKey] = mapOrientationArrays(map, (_o, _i, alias) => resolve(alias));
      }
      const top: TileTextures['top'] = {};
      for (const [key, map] of Object.entries(aliasedTop)) {
        top[key as TextureKey] = mapOrientationArrays(map, (_o, _i, alias) => resolve(alias));
      }

      loaded = { base, coastalBase, baseIndexed, top };
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

export function textureKeyFor(tile: Tile): TextureKey {
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
 * whole base texture by level instead of layering a top.
 */
export function baseTextureFor(textures: TileTextures, tile: Tile): Texture {
  const orientation = tile.orientation ?? 'SE';
  if (tile.terrain === 'sea' && tile.isCoastalWater) {
    return textures.coastalBase[orientation];
  }
  const key = textureKeyFor(tile);
  const indexed = textures.baseIndexed[key];
  if (indexed) {
    const arr = indexed[orientation];
    return arr[clampIndex(tile.buildingLevel ?? 1, arr.length)];
  }
  return textures.base[key]![orientation];
}

/** The top (props/building) layer texture for a tile, or `undefined` if this key has no top layer. */
export function topTextureFor(textures: TileTextures, tile: Tile): Texture | undefined {
  const key = textureKeyFor(tile);
  const orientation = tile.orientation ?? 'SE';
  const arr = textures.top[key]?.[orientation];
  if (!arr) return undefined;
  const index = tile.buildingType ? (tile.buildingLevel ?? 1) : (tile.variant ?? 0);
  return arr[clampIndex(index, arr.length)];
}
