// Hex tile art is packed into a handful of WebP atlas pages (plus a JSON
// manifest per page) by VanDooProject/3D_assets' `scripts/build_atlas.py`
// (see that repo's README, "Packing into atlases", and issue #187) and
// vendored under the VanDooProject/bg_assets_hextile submodule's own
// `atlas/` directory (alongside its `hextiles/` individual PNGs, which
// buildingArt.ts still uses) — not one PNG per
// tile/orientation/level/variant as before. Every tile is still, at the
// source, a 200x300 flat-top hex "plate" (top face 200x92, starting at
// y=140) with a thick earthen skirt below it and, for taller assets, props
// rising above it; the atlas just repacks those same renders into shared
// pages instead of shipping them as individual files.
//
// Where the source has one, we use its base/top split — ground-only under
// a `layer: "base"` frame, props/building-only under `layer: "top"` —
// instead of a single composited image, same as before: HexMapRenderer
// draws base, then the border/hover layers, then top, so a border or hover
// highlight sits on the ground and tucks *under* a tile's trees/building
// rather than being sliced across their canopy. A family the source doesn't
// split (`layer: "composite"`) is treated as that family's base, with no
// top layer — same effective result as before for e.g. `sand`/`mountain`.
//
// Every hex renders with one of the source's six camera rotations
// (`TileOrientation`) and, where a terrain/building has more than one look,
// a numbered variant (terrain) or level (building) — see
// `worldGenerator.ts`'s `orientationAt`/`variantAt` and
// `Tile.buildingLevel`. Which array index a variant/level lands at is read
// straight off each frame's own name (`..._variant001`, `..._level004`),
// same convention the source files used; `classifyFamilyFrames` is the pure
// function that turns one family's frame names into that array shape (see
// its own doc comment and `textures.test.ts` — no Pixi/Texture dependency,
// so it's exercised directly rather than only through a loaded atlas).
import { Texture } from 'pixi.js';
import { loadAtlasCategory, type LoadedAtlas } from './atlas';
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
// borders/fog. Matches the atlas manifest's own `meta.bjarnoy.tile`
// geometry (200x300, top face 92 tall starting at y=140) — kept as static
// constants rather than read from a loaded atlas because callers elsewhere
// (isoGridPosition, border/fog geometry) need them before any atlas load
// resolves.
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

/** The atlas source-render `family` name backing each `TextureKey` — the same string the old per-family `import.meta.glob` prefix used. A key with no rendered family (no art exists, e.g. Quarry) is simply absent here, and `baseTextureFor` already falls back to bare terrain for that case. */
const KEY_FAMILY: Partial<Record<TextureKey, string>> = {
  sea: 'watertile',
  sand: 'sandtile',
  mountain: 'mountaintile',
  grass: 'grasstile',
  forest: 'foresttile',
  hut: 'vikinghut',
  longhouse: 'greathall',
  shrineofthor: 'thorshrine',
  shrineoffreyja: 'freyjashrine',
  farm: 'farm_crop',
  pumpkinfarm: 'farm_pumpkin',
  lumberjack: 'lumberjackhut',
  storagehouse: 'storagebuilding',
  archeryrange: 'archerybuilding',
  greatstorehouse: 'bigstoragehouse',
  barracks: 'barracks',
  // Flat/inland sawmill only — 'sawmillriver'/'sawmillbend' are separate
  // TextureKeys below, since (unlike this one) their base layer varies by
  // level too.
  sawmill: 'sawmill',
  fishinghut: 'fishinghutbuilding',
  magictower: 'magictower',
  tower: 'towerbuilding',
  dockyard: 'dockyard',
  fisherhut: 'fisherhut',
  sawmillriver: 'sawmillriver',
  sawmillbend: 'sawmillbend',
};

/** Coastal water is a rendering variant of `sea`, not a `TextureKey` of its own — see `SOURCES.coastalBase` below. */
const COASTAL_FAMILY = 'coastalwatertile';

/** The source's river shapes — `RiverTileShape.Mouth` (see `types.ts`) has no art of its own and renders with `straight`/`bend`, same as before. */
type RiverArtShape = 'straight' | 'bend' | 'bend60' | 'spring' | 'confluence';

const RIVER_FAMILY: Record<RiverArtShape, string> = {
  straight: 'rivertile',
  bend: 'rivertile_bend',
  bend60: 'rivertile_bend60',
  spring: 'rivertile_spring',
  confluence: 'rivertile_y_narrow',
};

/** The orientation token embedded in every frame name, e.g. `..._NE_...` or `..._NE`. */
const ORIENTATION_RE = /_(NE|NW|SW|SE|E|W)(?:_|$)/;
/** A numbered terrain-variant suffix, e.g. `_variant001`. */
const VARIANT_RE = /_variant(\d{3})(?:_base)?$/;
/** A numbered building-level suffix, e.g. `_level004` (a top frame) or `_level004_base` (a leveled base frame — see `classifyFamilyFrames`). */
const LEVEL_RE = /_level(\d{3})(?:_base)?$/;

function orientationOf(name: string): TileOrientation {
  const match = ORIENTATION_RE.exec(name);
  if (!match) {
    throw new Error(`textures.ts: couldn't find an orientation token in frame "${name}"`);
  }
  return match[1] as TileOrientation;
}

/**
 * A terrain-variant family (grass/forest top) has a plain, unsuffixed frame
 * as well as numbered `variantNNN` ones — the plain frame is index 0 and
 * `variantNNN` is index `NNN + 1`. A building-level family (tower, hut/
 * longhouse/farm top) has no plain frame at all — every rung is a numbered
 * `levelNNN`, which *is* its index directly, `000` included.
 */
function explicitIndexOf(name: string): number | null {
  const variant = VARIANT_RE.exec(name);
  if (variant) return Number(variant[1]) + 1;
  const level = LEVEL_RE.exec(name);
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

function mapOrientations<T, U>(map: OrientationMap<T>, fn: (o: TileOrientation, v: T) => U): OrientationMap<U> {
  const result = {} as OrientationMap<U>;
  for (const orientation of TILE_ORIENTATIONS) {
    result[orientation] = fn(orientation, map[orientation]);
  }
  return result;
}

/** One family's atlas frame, narrowed to what `classifyFamilyFrames` needs — generic over the frame's resolved value so it can be unit tested with plain strings instead of real `Texture`s (see `textures.test.ts`). */
export interface FamilyFrame<T> {
  name: string;
  layer: 'base' | 'top' | 'composite';
  value: T;
}

export interface ClassifiedFamily<T> {
  base?: OrientationMap<T>;
  baseIndexed?: OrientationMap<T[]>;
  top?: OrientationMap<T[]>;
}

/**
 * Groups one family's atlas frames into the base/baseIndexed/top shape
 * `TileTextures` needs, purely from each frame's own name and layer — no
 * Pixi/Texture dependency. `layer: "composite"` (a family the source
 * doesn't split into base/top folders) is treated as that family's base,
 * with no top, same as `"base"`.
 *
 * Whether a family's base ends up plain (`base`) or indexed (`baseIndexed`)
 * is inferred from the data rather than hardcoded per family: most
 * buildings' base is one level-invariant texture, but a few (fisherhut,
 * sawmillriver, sawmillbend) render a different base per level too — this
 * shows up simply as more than one distinct index turning up for some
 * orientation's base frames, with no family-specific rule needed either way.
 */
export function classifyFamilyFrames<T>(frames: FamilyFrame<T>[]): ClassifiedFamily<T> {
  const baseByOrientation = emptyOrientationMap<Map<number, T>>(() => new Map());
  const topByOrientation = emptyOrientationMap<Map<number, T>>(() => new Map());

  for (const { name, layer, value } of frames) {
    const orientation = orientationOf(name);
    const index = explicitIndexOf(name) ?? 0;
    (layer === 'top' ? topByOrientation : baseByOrientation)[orientation].set(index, value);
  }

  const toIndexedMap = (byOrientation: OrientationMap<Map<number, T>>): OrientationMap<T[]> => {
    const result = {} as OrientationMap<T[]>;
    for (const orientation of TILE_ORIENTATIONS) {
      const entries = byOrientation[orientation];
      result[orientation] = Array.from({ length: entries.size }, (_, i) => {
        const value = entries.get(i);
        if (value === undefined) {
          throw new Error(`textures.ts: frame set is missing index ${i} for orientation ${orientation}`);
        }
        return value;
      });
    }
    return result;
  };

  const hasAny = (byOrientation: OrientationMap<Map<number, T>>) =>
    TILE_ORIENTATIONS.some((o) => byOrientation[o].size > 0);

  const result: ClassifiedFamily<T> = {};
  if (hasAny(topByOrientation)) {
    result.top = toIndexedMap(topByOrientation);
  }
  if (hasAny(baseByOrientation)) {
    const isIndexed = TILE_ORIENTATIONS.some((o) => baseByOrientation[o].size > 1);
    if (isIndexed) {
      result.baseIndexed = toIndexedMap(baseByOrientation);
    } else {
      result.base = mapOrientations(baseByOrientation, (_o, m) => {
        const [value] = m.values();
        return value as T;
      });
    }
  }
  return result;
}

export interface TileTextures {
  base: Partial<Record<TextureKey, OrientationMap<Texture>>>;
  coastalBase: OrientationMap<Texture[]>;
  baseIndexed: Partial<Record<TextureKey, OrientationMap<Texture[]>>>;
  top: Partial<Record<TextureKey, OrientationMap<Texture[]>>>;
  riverBase: Record<RiverArtShape, OrientationMap<Texture>>;
  riverTop: Record<RiverArtShape, OrientationMap<Texture>>;
}

function framesOfFamily(atlas: LoadedAtlas, family: string): FamilyFrame<Texture>[] {
  const frames: FamilyFrame<Texture>[] = [];
  for (const [name, meta] of Object.entries(atlas.frameMeta)) {
    if (meta.family !== family) continue;
    const value = atlas.textures[name];
    if (!value) continue;
    frames.push({ name, layer: meta.layer, value });
  }
  return frames;
}

/** Builds the full `TileTextures` shape from one or more loaded atlas categories (e.g. `terrain` + `buildings-static`). A family with no matching frames in any given atlas is simply absent from the result. */
function buildTileTextures(atlases: LoadedAtlas[]): TileTextures {
  const merged: LoadedAtlas = { textures: {}, frameMeta: {}, clips: {} };
  for (const atlas of atlases) {
    Object.assign(merged.textures, atlas.textures);
    Object.assign(merged.frameMeta, atlas.frameMeta);
    Object.assign(merged.clips, atlas.clips);
  }

  const base: TileTextures['base'] = {};
  const baseIndexed: TileTextures['baseIndexed'] = {};
  const top: TileTextures['top'] = {};
  for (const [key, family] of Object.entries(KEY_FAMILY) as [TextureKey, string][]) {
    const classified = classifyFamilyFrames(framesOfFamily(merged, family));
    if (classified.base) base[key] = classified.base;
    if (classified.baseIndexed) baseIndexed[key] = classified.baseIndexed;
    if (classified.top) top[key] = classified.top;
  }

  // Coastal water's numbered variants (ripples) currently render as this
  // family's *top* frames in the source, with `base` staying a single
  // level-invariant frame per orientation — but the game only ever draws
  // one texture for a coastal-water tile (baseTextureFor, no separate top
  // layer for it), so whichever bucket actually turned out indexed is the
  // one that reproduces that variety; `baseIndexed` is preferred only in
  // case a future render puts the variants there instead.
  const coastalClassified = classifyFamilyFrames(framesOfFamily(merged, COASTAL_FAMILY));
  const coastalBase =
    coastalClassified.baseIndexed ?? coastalClassified.top ?? emptyOrientationMap<Texture[]>(() => []);

  const riverBase = {} as Record<RiverArtShape, OrientationMap<Texture>>;
  const riverTop = {} as Record<RiverArtShape, OrientationMap<Texture>>;
  for (const [shape, family] of Object.entries(RIVER_FAMILY) as [RiverArtShape, string][]) {
    const classified = classifyFamilyFrames(framesOfFamily(merged, family));
    riverBase[shape] = classified.base ?? emptyOrientationMap<Texture>(() => Texture.EMPTY);
    const topArr = classified.top ?? emptyOrientationMap<Texture[]>(() => []);
    riverTop[shape] = mapOrientations(topArr, (_o, arr) => arr[0] ?? Texture.EMPTY);
  }

  return { base, coastalBase, baseIndexed, top, riverBase, riverTop };
}

/** Merges an already-resolved `TileTextures` with one loaded later (e.g. terrain, then buildings once they resolve) — used by `HexMapRenderer` to upgrade in place without a full reload. `coastalBase`/`riverBase`/`riverTop` only ever come from the terrain atlas, so `a`'s copies win unconditionally. */
export function mergeTileTextures(a: TileTextures, b: TileTextures): TileTextures {
  return {
    base: { ...a.base, ...b.base },
    baseIndexed: { ...a.baseIndexed, ...b.baseIndexed },
    top: { ...a.top, ...b.top },
    coastalBase: a.coastalBase,
    riverBase: a.riverBase,
    riverTop: a.riverTop,
  };
}

let terrainLoading: Promise<TileTextures> | null = null;
/** The small `terrain` atlas alone — enough for the landing page / world map background, and for `HexMapRenderer` to draw terrain-only settlement tiles before building art resolves. */
export function loadTerrainAtlas(): Promise<TileTextures> {
  if (!terrainLoading) {
    terrainLoading = loadAtlasCategory('terrain').then((atlas) => buildTileTextures([atlas]));
  }
  return terrainLoading;
}

let buildingLoading: Promise<TileTextures> | null = null;
/** The (much larger) `buildings-static` atlas alone. Its `TileTextures` has empty `coastalBase`/`riverBase`/`riverTop` (those only ever come from `loadTerrainAtlas`) — merge with `mergeTileTextures` rather than using this result standalone. */
export function loadBuildingAtlases(): Promise<TileTextures> {
  if (!buildingLoading) {
    buildingLoading = loadAtlasCategory('buildings-static').then((atlas) => buildTileTextures([atlas]));
  }
  return buildingLoading;
}

let combinedLoading: Promise<TileTextures> | null = null;
/** Both atlases, merged. Existing callers that don't need staged loading keep using this. */
export function loadTileTextures(): Promise<TileTextures> {
  if (!combinedLoading) {
    combinedLoading = Promise.all([loadAtlasCategory('terrain'), loadAtlasCategory('buildings-static')]).then(
      ([terrain, buildings]) => buildTileTextures([terrain, buildings]),
    );
  }
  return combinedLoading;
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
