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
import { loadAtlasCategory, type AtlasClip, type LoadedAtlas } from './atlas';
import {
  classifyGiantClips,
  classifyGiantFrames,
  giantTop as giantTopLookup,
  type GiantFamilyClip,
  type GiantPart,
  type GiantTextureMap,
} from './giantTiles';
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
// 'wasteland'/'deadforest'/'blacksand' aren't real `Terrain` values either —
// a wasted tile's wire terrain stays 'grass'/'forest'/'sand' (see
// `Tile.wasted`) — they're purely the wasted-island art-family lookup keys
// `textureKeyFor` swaps to when a tile is wasted (mountain keeps its plain
// `mountaintile` art either way — see that function's own doc comment).
export type TextureKey =
  | Terrain
  | NonNullable<Tile['buildingType']>
  | 'sawmillriver'
  | 'sawmillbend'
  | 'wasteland'
  | 'deadforest'
  | 'blacksand';

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
  // Placeholder art only — see buildingArt.ts's BUILDING_ART_FAMILIES for
  // the matching docs-page choice.
  shrineofullr: 'thorshrine',
  shrineofnjord: 'freyjashrine',
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
  wasteland: 'wasteland',
  deadforest: 'deadforest',
  blacksand: 'blacksand',
};

/** Coastal water is a rendering variant of `sea`, not a `TextureKey` of its own — see `SOURCES.coastalBase` below. */
const COASTAL_FAMILY = 'coastalwatertile';

/** Coastal water bordering a wasted island renders with this family instead of `COASTAL_FAMILY` — see `TileTextures.wastedCoastalBase`. */
const WASTED_COASTAL_FAMILY = 'blacksandcoast';

/**
 * `wasteland`/`deadforest`/`blacksand`'s numbered top variants in the
 * vendored art pack all start at `_variant001` with no `_variant000` at
 * all — a genuine gap in the source numbering (`blacksandcoast`, by
 * contrast, numbers its variants from `_variant000` like every green
 * terrain family does). `classifyFamilyFrames` deliberately treats *any*
 * numbering gap as a hard error elsewhere (see its own test): for a
 * building's level sequence a gap really does mean a broken render pass,
 * so silently tolerating one there would hide a real bug. Here it just
 * reflects how these three families happened to be numbered, so their top
 * frames are renumbered contiguously (see `renumberTopVariants`) before
 * classification instead of being fed through as-is.
 */
const GAPPY_VARIANT_FAMILIES: ReadonlySet<string> = new Set(['wasteland', 'deadforest', 'blacksand']);

/**
 * "Giant tile" families — one art object spanning a hex plus its six
 * neighbours (see `giantTiles.ts`'s own module doc comment for the full
 * contract). Kept as its own list, looked up by family name across whichever
 * atlas categories are loaded (`terrain` today; `buildings-static` once a
 * giant building exists), rather than folded into `KEY_FAMILY`: a giant's
 * frames don't carry a `TextureKey`-shaped `variantNNN`/`levelNNN` suffix at
 * the end of their name the way `classifyFamilyFrames` expects (see
 * `classifyGiantFrames`'s own doc comment), so they need their own
 * classification path entirely.
 */
const GIANT_FAMILIES: readonly string[] = ['giantmountain', 'giantshrine', 'giantvolcano', 'giantutgard'];

/** The source's river shapes — `RiverTileShape.Mouth` (see `types.ts`) has no art of its own and renders with `straight`/`bend`, same as before. */
type RiverArtShape = 'straight' | 'bend' | 'bend60' | 'spring' | 'confluence';

const RIVER_FAMILY: Record<RiverArtShape, string> = {
  straight: 'rivertile',
  bend: 'rivertile_bend',
  bend60: 'rivertile_bend60',
  spring: 'rivertile_spring',
  confluence: 'rivertile_y_narrow',
};

/**
 * Lava-stream art families, one per shape a lava stream can actually take —
 * see `TileTextures.lavaRiverBase`/`lavaRiverTop`'s own doc comment for why
 * this doesn't cover every `RiverArtShape`.
 */
const LAVA_RIVER_FAMILY: Record<'straight' | 'bend' | 'bend60', string> = {
  straight: 'lavastream',
  bend: 'lavastream_bend',
  bend60: 'lavastream_bend60',
};

/** The orientation token embedded in every frame name, e.g. `..._NE_...` or `..._NE`. */
const ORIENTATION_RE = /_(NE|NW|SW|SE|E|W)(?:_|$)/;
/** A numbered terrain-variant suffix, e.g. `_variant001`. */
const VARIANT_RE = /_variant(\d{3})(?:_base)?$/;
/** A numbered building-level suffix, e.g. `_level004` (a top frame) or `_level004_base` (a leveled base frame — see `classifyFamilyFrames`). */
const LEVEL_RE = /_level(\d{3})(?:_base)?$/;

/**
 * A clip's plain numbered level, e.g. `cropmill_E_level003` — deliberately
 * anchored at the end with no trailing letter, unlike `LEVEL_RE` above: some
 * families carry an alternate lettered pass at the same level (e.g.
 * `cropmill_E_level004a`, a second-mill variant of level004) alongside the
 * canonical one, and picking a level's clip is simpler by just ignoring the
 * lettered extras than by picking a "preferred" one.
 */
const ANIM_LEVEL_RE = /_level(\d{3})$/;

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

/**
 * Renumbers a family's `top`-layer frames to be contiguous per orientation
 * (0, 1, 2, ... in original-index order), leaving `base`/`composite` frames
 * untouched — see `GAPPY_VARIANT_FAMILIES`'s own doc comment for why this
 * exists. The renamed frame carries no real family/orientation text beyond
 * what `orientationOf`/`explicitIndexOf` need to re-derive it, since nothing
 * downstream of `classifyFamilyFrames` looks at a frame's name again.
 */
// Exported (only) so textures.test.ts can exercise the gap-renumbering
// directly, the same reason classifyFamilyFrames itself is exported.
export function renumberTopVariants<T>(frames: FamilyFrame<T>[]): FamilyFrame<T>[] {
  const byOrientation = emptyOrientationMap<{ layer: FamilyFrame<T>['layer']; value: T; index: number }[]>(() => []);
  const untouched: FamilyFrame<T>[] = [];

  for (const frame of frames) {
    if (frame.layer !== 'top') {
      untouched.push(frame);
      continue;
    }
    const orientation = orientationOf(frame.name);
    byOrientation[orientation].push({ layer: frame.layer, value: frame.value, index: explicitIndexOf(frame.name) ?? 0 });
  }

  const result = [...untouched];
  for (const orientation of TILE_ORIENTATIONS) {
    const sorted = [...byOrientation[orientation]].sort((a, b) => a.index - b.index);
    sorted.forEach((entry, i) => {
      const name = i === 0 ? `renumbered_${orientation}` : `renumbered_${orientation}_variant${String(i - 1).padStart(3, '0')}`;
      result.push({ name, layer: entry.layer, value: entry.value });
    });
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

/** One playable `buildings-anim` clip, resolved to live frame Textures — see atlas.ts's `AtlasClip` for the raw manifest shape this is built from. */
export interface TileAnimClip {
  textures: Texture[];
  fps: number;
  playback: 'loop' | 'pingpong';
}

/**
 * One family's `buildings-anim` clips (already filtered to that family — see
 * `AtlasClip.family`), grouped by orientation and keyed by level number.
 * `ANIM_LEVEL_RE` drops any lettered alternate pass (see its own comment).
 * Generic over the frame's resolved value for the same reason
 * `classifyFamilyFrames` is — unit-testable with plain strings, no Pixi
 * dependency (see `textures.test.ts`) — with a real caller supplying a
 * `Record<string, Texture>` and dropping any clip that doesn't fully resolve
 * (a page that failed to parse) before it ever reaches this function.
 */
export function classifyFamilyClips<T>(
  clips: AtlasClip[],
  resolveFrame: (name: string) => T | undefined,
): OrientationMap<Map<number, { textures: T[]; fps: number; playback: 'loop' | 'pingpong' }>> {
  const byOrientation = emptyOrientationMap<Map<number, { textures: T[]; fps: number; playback: 'loop' | 'pingpong' }>>(
    () => new Map(),
  );
  for (const clip of clips) {
    const match = ANIM_LEVEL_RE.exec(clip.name);
    if (!match) continue;
    const orientation = clip.orientation as TileOrientation;
    if (!TILE_ORIENTATIONS.includes(orientation)) continue;
    const frameValues = clip.frames.map(resolveFrame);
    if (frameValues.some((v) => v === undefined)) continue;
    byOrientation[orientation].set(Number(match[1]), {
      textures: frameValues as T[],
      fps: clip.fps,
      playback: clip.playback,
    });
  }
  return byOrientation;
}

export interface TileTextures {
  base: Partial<Record<TextureKey, OrientationMap<Texture>>>;
  coastalBase: OrientationMap<Texture[]>;
  baseIndexed: Partial<Record<TextureKey, OrientationMap<Texture[]>>>;
  top: Partial<Record<TextureKey, OrientationMap<Texture[]>>>;
  /**
   * A sparse overlay on `top`: same `TextureKey`/orientation/level indexing,
   * but only the (level, orientation) rungs the `buildings-anim` atlas
   * actually animates (e.g. a sawmill's water wheel only spins from level 3
   * on) carry an entry — every other index is `undefined`, meaning "just
   * show `top`'s own static texture for that rung", not "no art".
   */
  animTop: Partial<Record<TextureKey, OrientationMap<(TileAnimClip | undefined)[]>>>;
  riverBase: Record<RiverArtShape, OrientationMap<Texture>>;
  riverTop: Record<RiverArtShape, OrientationMap<Texture>>;
  /** Coastal water bordering a wasted island (`blacksandcoast`) — see `baseTextureFor`'s `tile.wasted` branch. */
  wastedCoastalBase: OrientationMap<Texture[]>;
  /**
   * Lava-stream art for a wasted island's rivers — only the three shapes a
   * lava stream can actually take (`straight`/`bend`/`bend60`; confluence
   * cannot occur on lava, and spring/mouth render with the plain river art
   * per `riverTexturesFor`'s own doc comment). Sparse: a shape with no
   * frames in the loaded atlas is simply absent.
   */
  lavaRiverBase: Partial<Record<'straight' | 'bend' | 'bend60', OrientationMap<Texture>>>;
  lavaRiverTop: Partial<Record<'straight' | 'bend' | 'bend60', OrientationMap<Texture>>>;
  /** Giant-tile top textures, keyed by family (e.g. `giantmountain`) — see `giantTiles.ts`. */
  giants: Partial<Record<string, GiantTextureMap<Texture>>>;
  /**
   * Giant-tile top *animations*, same family/orientation/part indexing as
   * `giants` — a sparse overlay: only a (family, orientation, part) whose
   * `buildings-anim` clip fully resolved carries an entry (mirrors
   * `animTop`'s own sparse-overlay contract). A giant frame name
   * (`<family>_<CAM>_level<NNN>_part<DIR>`) never matches `ANIM_LEVEL_RE`
   * (anchored at the end, right after the level digits) since it always has
   * a trailing `_part<DIR>`, so giant clips never leak into the regular
   * per-`TextureKey` `animTop` built below — they're read straight off
   * `animAtlas.clips` via `classifyGiantClips` instead, same as `giants`
   * reads its static frames straight off the atlas via `classifyGiantFrames`.
   */
  giantAnims: Partial<Record<string, GiantTextureMap<TileAnimClip>>>;
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

/**
 * Builds the full `TileTextures` shape from one or more loaded atlas
 * categories (e.g. `terrain` + `buildings-static`). A family with no
 * matching frames in any given atlas is simply absent from the result.
 *
 * `animAtlas` (the `buildings-anim` category) is kept separate rather than
 * folded into `atlases` above: its per-frame clip frames (`cropmill_E_
 * level003_f00`, ...) carry the same family/layer `bjarnoy` metadata as a
 * plain static frame, so merging them into the same frame pool would feed
 * `classifyFamilyFrames` a mix of real static frames and individual
 * animation frames it has no way to tell apart — corrupting the static
 * `top`/`base` index it builds. Reading `animAtlas.clips` on its own instead
 * sidesteps that entirely.
 */
function buildTileTextures(atlases: LoadedAtlas[], animAtlas?: LoadedAtlas): TileTextures {
  const merged: LoadedAtlas = { textures: {}, frameMeta: {}, clips: {} };
  for (const atlas of atlases) {
    Object.assign(merged.textures, atlas.textures);
    Object.assign(merged.frameMeta, atlas.frameMeta);
    Object.assign(merged.clips, atlas.clips);
  }

  const base: TileTextures['base'] = {};
  const baseIndexed: TileTextures['baseIndexed'] = {};
  const top: TileTextures['top'] = {};
  const animTop: TileTextures['animTop'] = {};
  for (const [key, family] of Object.entries(KEY_FAMILY) as [TextureKey, string][]) {
    const frames = framesOfFamily(merged, family);
    const classified = classifyFamilyFrames(GAPPY_VARIANT_FAMILIES.has(family) ? renumberTopVariants(frames) : frames);
    if (classified.base) base[key] = classified.base;
    if (classified.baseIndexed) baseIndexed[key] = classified.baseIndexed;
    if (classified.top) top[key] = classified.top;

    if (classified.top && animAtlas) {
      const familyClips = Object.values(animAtlas.clips).filter((clip) => clip.family === family);
      const clipsByOrientation = classifyFamilyClips(familyClips, (name) => animAtlas.textures[name]);
      const hasClips = TILE_ORIENTATIONS.some((o) => clipsByOrientation[o].size > 0);
      if (hasClips) {
        const topArr = classified.top;
        animTop[key] = mapOrientations(topArr, (o, arr) =>
          arr.map((_v, i) => clipsByOrientation[o].get(i)),
        );
      }
    }
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

  // Same base/top ambiguity as plain coastal water above, and the same
  // "whichever bucket turned out indexed" resolution — blacksandcoast's own
  // frames happen to carry per-variant base textures too (unlike plain
  // coastal water's single level-invariant base), but the game still only
  // ever draws one texture for a coastal-water tile either way.
  const wastedCoastalClassified = classifyFamilyFrames(framesOfFamily(merged, WASTED_COASTAL_FAMILY));
  const wastedCoastalBase =
    wastedCoastalClassified.baseIndexed ?? wastedCoastalClassified.top ?? emptyOrientationMap<Texture[]>(() => []);

  const riverBase = {} as Record<RiverArtShape, OrientationMap<Texture>>;
  const riverTop = {} as Record<RiverArtShape, OrientationMap<Texture>>;
  for (const [shape, family] of Object.entries(RIVER_FAMILY) as [RiverArtShape, string][]) {
    const classified = classifyFamilyFrames(framesOfFamily(merged, family));
    riverBase[shape] = classified.base ?? emptyOrientationMap<Texture>(() => Texture.EMPTY);
    const topArr = classified.top ?? emptyOrientationMap<Texture[]>(() => []);
    riverTop[shape] = mapOrientations(topArr, (_o, arr) => arr[0] ?? Texture.EMPTY);
  }

  const lavaRiverBase: TileTextures['lavaRiverBase'] = {};
  const lavaRiverTop: TileTextures['lavaRiverTop'] = {};
  for (const [shape, family] of Object.entries(LAVA_RIVER_FAMILY) as ['straight' | 'bend' | 'bend60', string][]) {
    const classified = classifyFamilyFrames(framesOfFamily(merged, family));
    if (classified.base) lavaRiverBase[shape] = classified.base;
    if (classified.top) lavaRiverTop[shape] = mapOrientations(classified.top, (_o, arr) => arr[0] ?? Texture.EMPTY);
  }

  const giants: TileTextures['giants'] = {};
  const giantAnims: TileTextures['giantAnims'] = {};
  for (const family of GIANT_FAMILIES) {
    const frames = framesOfFamily(merged, family);
    if (frames.length > 0) giants[family] = classifyGiantFrames(frames);

    if (animAtlas) {
      const familyClips: GiantFamilyClip[] = Object.values(animAtlas.clips).filter((clip) => clip.family === family);
      if (familyClips.length > 0) {
        const clipMap = classifyGiantClips(familyClips, (name) => animAtlas.textures[name]);
        const anims = mapOrientations(clipMap, (_o, parts) =>
          Object.fromEntries(
            (Object.entries(parts) as [GiantPart, { textures: Texture[]; fps: number; playback: 'loop' | 'pingpong' }][]).map(
              ([part, clip]) => [part, { textures: clip.textures, fps: clip.fps, playback: clip.playback }],
            ),
          ) as Partial<Record<GiantPart, TileAnimClip>>,
        );
        const hasAny = TILE_ORIENTATIONS.some((o) => Object.keys(anims[o]).length > 0);
        if (hasAny) giantAnims[family] = anims;
      }
    }
  }

  return {
    base,
    coastalBase,
    wastedCoastalBase,
    baseIndexed,
    top,
    animTop,
    riverBase,
    riverTop,
    lavaRiverBase,
    lavaRiverTop,
    giants,
    giantAnims,
  };
}

/** Merges an already-resolved `TileTextures` with one loaded later (e.g. terrain, then buildings once they resolve) — used by `HexMapRenderer` to upgrade in place without a full reload. `coastalBase`/`riverBase`/`riverTop` only ever come from the terrain atlas, so `a`'s copies win unconditionally. */
export function mergeTileTextures(a: TileTextures, b: TileTextures): TileTextures {
  return {
    base: { ...a.base, ...b.base },
    baseIndexed: { ...a.baseIndexed, ...b.baseIndexed },
    top: { ...a.top, ...b.top },
    animTop: { ...a.animTop, ...b.animTop },
    coastalBase: a.coastalBase,
    riverBase: a.riverBase,
    riverTop: a.riverTop,
    // Unlike plain coastal water/rivers, the wasted-island art families live
    // in the buildings-static atlas, not terrain — so these merge like
    // `top`/`base` (b's frames win) rather than being pinned to `a`.
    wastedCoastalBase:
      TILE_ORIENTATIONS.some((o) => b.wastedCoastalBase[o].length > 0) ? b.wastedCoastalBase : a.wastedCoastalBase,
    lavaRiverBase: { ...a.lavaRiverBase, ...b.lavaRiverBase },
    lavaRiverTop: { ...a.lavaRiverTop, ...b.lavaRiverTop },
    giants: { ...a.giants, ...b.giants },
    giantAnims: { ...a.giantAnims, ...b.giantAnims },
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
/**
 * The (much larger) `buildings-static` atlas, plus `buildings-anim`'s clips
 * layered on top as `animTop` (see `buildTileTextures`'s own remarks on why
 * that atlas is kept separate rather than merged into the static one). Its
 * `TileTextures` has empty `coastalBase`/`riverBase`/`riverTop` (those only
 * ever come from `loadTerrainAtlas`) — merge with `mergeTileTextures` rather
 * than using this result standalone.
 */
export function loadBuildingAtlases(): Promise<TileTextures> {
  if (!buildingLoading) {
    buildingLoading = Promise.all([
      loadAtlasCategory('buildings-static'),
      loadAtlasCategory('buildings-anim'),
    ]).then(([staticAtlas, animAtlas]) => buildTileTextures([staticAtlas], animAtlas));
  }
  return buildingLoading;
}

let combinedLoading: Promise<TileTextures> | null = null;
/** All three atlases, merged. Existing callers that don't need staged loading keep using this. */
export function loadTileTextures(): Promise<TileTextures> {
  if (!combinedLoading) {
    combinedLoading = Promise.all([
      loadAtlasCategory('terrain'),
      loadAtlasCategory('buildings-static'),
      loadAtlasCategory('buildings-anim'),
    ]).then(([terrain, buildings, animAtlas]) => buildTileTextures([terrain, buildings], animAtlas));
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
/**
 * A wasted tile's green terrain, mapped to the wasted-island art family it
 * renders with instead — see `docs/design/river-generation.md`'s wasted-
 * island section and `WorldModel.setWastedRevealed`. Mountain isn't listed:
 * a wasted mountain keeps the plain `mountaintile` art (no dedicated wasted
 * mountain family exists in the vendored pack), so it simply falls through
 * `textureKeyFor`'s lookup below unchanged. Open sea (not coastal) also
 * stays plain sea either way.
 */
const WASTED_TEXTURE_KEY: Partial<Record<Terrain, TextureKey>> = {
  grass: 'wasteland',
  forest: 'deadforest',
  sand: 'blacksand',
};

export function textureKeyFor(tile: Tile, sawmillVariant?: 'sawmillriver' | 'sawmillbend'): TextureKey {
  if (tile.buildingType === 'sawmill' && sawmillVariant) return sawmillVariant;
  if (tile.buildingType) return tile.buildingType;
  if (tile.wasted) return WASTED_TEXTURE_KEY[tile.terrain] ?? tile.terrain;
  return tile.terrain;
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
    const arr = tile.wasted ? textures.wastedCoastalBase[orientation] : textures.coastalBase[orientation];
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
 * The playable clip standing in for this tile's top texture, or `undefined`
 * if this exact key/orientation/level has no animation (most rungs don't —
 * see `TileTextures.animTop`'s own comment). Resolves the level index
 * identically to `topTextureFor` so the two always agree on which rung a
 * given tile is showing.
 */
export function topAnimFor(
  textures: TileTextures,
  tile: Tile,
  sawmillVariant?: 'sawmillriver' | 'sawmillbend',
): TileAnimClip | undefined {
  const key = textureKeyFor(tile, sawmillVariant);
  const orientation = tile.orientation ?? 'SE';
  const arr = textures.top[key]?.[orientation];
  if (!arr) return undefined;
  const index = tile.buildingType ? (tile.buildingLevel ?? 1) : (tile.variant ?? 0);
  return textures.animTop[key]?.[orientation]?.[clampIndex(index, arr.length)];
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

  // Lava streams (wasted islands) swap in the lavastream families for the
  // three shapes that have one — straight/bend/bend60. Confluence cannot
  // occur on lava (RiverGenerator's allowConfluence: false), and spring/
  // mouth deliberately keep the plain river art (no dedicated lava spring
  // asset yet), so every other shape falls through to the ordinary lookup
  // below even on a wasted island.
  if (river.wasted && (shape === 'straight' || shape === 'bend' || shape === 'bend60')) {
    const lavaBase = textures.lavaRiverBase[shape]?.[orientation];
    const lavaTop = textures.lavaRiverTop[shape]?.[orientation];
    if (lavaBase && lavaTop) return { base: lavaBase, top: lavaTop };
  }

  return { base: textures.riverBase[shape][orientation], top: textures.riverTop[shape][orientation] };
}

/**
 * A giant tile's part texture — `undefined` if this `TileTextures` has no
 * frames for `family` yet (the real art hasn't landed in the vendored atlas —
 * see `giantTiles.ts`'s module comment), or no frame for this exact
 * orientation/part. Callers (`HexMapRenderer.rebuildTerrain`) must degrade
 * gracefully to drawing the covered hexes normally when this is `undefined`.
 */
export function giantTopTextureFor(
  textures: TileTextures,
  family: string,
  orientation: TileOrientation,
  part: GiantPart,
): Texture | undefined {
  return giantTopLookup(textures.giants, family, orientation, part);
}

/**
 * A giant tile's part *animation* — `undefined` if this `TileTextures` has
 * no `buildings-anim` clip for this exact family/orientation/part (most
 * giants; a giant with static art but no animated clip is the normal case,
 * same as any other building rung with no `animTop` entry). Callers
 * (`HexMapRenderer.rebuildTerrain`) fall back to the plain static texture
 * from `giantTopTextureFor` when this is `undefined`, same as `topAnimFor`.
 */
export function giantTopAnimFor(
  textures: TileTextures,
  family: string,
  orientation: TileOrientation,
  part: GiantPart,
): TileAnimClip | undefined {
  return giantTopLookup(textures.giantAnims, family, orientation, part);
}
