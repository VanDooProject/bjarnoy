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
import {
  loadAtlasCategory,
  loadAtlasPackCategory,
  loadOptionalAtlasCategory,
  unloadAtlasCategory,
  type AtlasClip,
  type AtlasPack,
  type AtlasPageProgress,
  type LoadedAtlas,
} from './atlas';
import {
  classifyGiantClips,
  classifyGiantFrames,
  giantTop as giantTopLookup,
  type GiantFamilyClip,
  type GiantPart,
  type GiantTextureMap,
} from './giantTiles';
import type { RiverTile, Terrain, Tile, TileOrientation } from './types';
import type { RiverVariant } from './worldGenerator';
import {
  bend60OrientationOf,
  bendOrientationOf,
  confluenceOrientationOf,
  confluenceWideOrientationOf,
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

// 'sawmillriver'/'sawmillbend'/'sawmillbend60' aren't real
// `Tile['buildingType']` values — a Sawmill's wire building type always
// stays 'sawmill' (see `riverBuildingArtFor`) — they're purely extra
// texture-lookup keys for its river-adjacent art families (one per river
// shape its vendor art has a composite for — straight, the gentler 60°-off
// bend, and the tight 60° bend60. See `riverBuildingArtFor`'s own doc
// comment for the rule that keeps a building's placement in sync with
// which of these actually has art).
// 'wasteland'/'deadforest'/'blacksand'/'wastedmountain' aren't real
// `Terrain` values either — a wasted tile's wire terrain stays
// 'grass'/'forest'/'sand'/'mountain' (see `Tile.wasted`) — they're purely the
// wasted-island art-family lookup keys `textureKeyFor` swaps to when a tile
// is wasted.
export type TextureKey =
  | Terrain
  | NonNullable<Tile['buildingType']>
  | 'sawmillriver'
  | 'sawmillbend'
  | 'sawmillbend60'
  | 'wasteland'
  | 'deadforest'
  | 'blacksand'
  | 'wastedmountain'
  | 'taintedwater';

type OrientationMap<T> = Record<TileOrientation, T>;

/**
 * The atlas source-render `family` name backing each `TextureKey` — the
 * same string the old per-family `import.meta.glob` prefix used. A key with
 * no rendered family (no art exists, e.g. Quarry) is simply absent here,
 * and `baseTextureFor` already falls back to bare terrain for that case.
 * Exported (only) so textures.test.ts can guard that a `TextureKey` maps to
 * the family its art actually ships under, the same reason `RIVER_FAMILY`
 * is exported.
 */
export const KEY_FAMILY: Partial<Record<TextureKey, string>> = {
  sea: 'watertile',
  sand: 'sandtile',
  mountain: 'mountaintile',
  grass: 'grasstile',
  forest: 'foresttile',
  hut: 'vikinghut',
  longhouse: 'greathall',
  // Thor's shrine is animated (a lightning clip in the buildings-anim
  // atlas, played like any other family's — see `animTop`).
  shrineofthor: 'torshrine',
  shrineoffreyja: 'freyjashrine',
  shrineofullr: 'ullrshrine',
  // A skerry standing in coastal water — a water-only building.
  shrineofnjord: 'njordshrine',
  // Newer, on-palette scripted art — see buildingArt.ts's matching docs-page
  // choice. Pumpkin Farm stays on the legacy `farm_pumpkin` family for now.
  farm: 'farm',
  pumpkinfarm: 'farm_pumpkin',
  lumberjack: 'lumberjack',
  storagehouse: 'storagebuilding',
  archeryrange: 'archeryrange',
  greatstorehouse: 'bigstoragehouse',
  barracks: 'barracks',
  // Shares FisherHut's leveled family now — the legacy 'fishinghutbuilding'
  // composite (still in the pack, no longer referenced) had no per-level
  // art at all. See buildingArt.ts's matching docs-page choice.
  fishinghut: 'fisherhut',
  magictower: 'magictower',
  tower: 'towerbuilding',
  dockyard: 'dockyard',
  fisherhut: 'fisherhut',
  // A Sawmill is never actually on grass (the backend requires a river
  // shape to place one — BuildingCatalogue.SawmillRiverShapes) — there is
  // deliberately no plain 'sawmill' entry here for the grass/inland family
  // the pack still ships (still referenced by buildingArt.ts's old preview
  // fallback before this fix): `textureKeyFor` never resolves to it, and no
  // other code path should either — see textureKeyFor's own doc comment and
  // textures.test.ts's "grass sawmill art is never used" guard.
  sawmillriver: 'sawmillriver',
  sawmillbend: 'sawmillbend',
  sawmillbend60: 'sawmillbend60',
  meadery: 'meadery',
  townsquare: 'townsquare',
  cropmill: 'cropmill',
  smithy: 'smithy',
  druidhut: 'druidhut',
  cartworkshop: 'cartworkshop',
  claybrickworks: 'claybrickworks',
  wasteland: 'wasteland',
  deadforest: 'deadforest',
  blacksand: 'blacksand',
  wastedmountain: 'mountaintile_jagged',
  // Open (non-coastal) water on a wasted island — see `WASTED_TEXTURE_KEY`'s
  // own doc comment for why this key exists at all despite `WorldModel`
  // itself never producing a wasted open-sea tile today.
  taintedwater: 'taintedwater',
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
const GIANT_FAMILIES: readonly string[] = [
  'giantmountain',
  'giantshrine',
  'giantvolcano',
  'giantutgard',
  'giantvolcano_wasted',
];

/**
 * A giant family's dedicated wasted-tile art variant, if the vendored pack
 * ships one — today just `giantvolcano` (a mountain-cluster giant on a
 * wasted island keeps the backend/domain family string `"giantvolcano"`
 * either way; only the art changes). `giantArtFamilyFor` is what resolves
 * this at render time, with a plain-family fallback when the wasted variant
 * has no frames loaded yet.
 */
const WASTED_GIANT_FAMILY: Partial<Record<string, string>> = {
  giantvolcano: 'giantvolcano_wasted',
};

/**
 * Which giant art family to actually look up for a placement — `family`
 * unchanged unless the anchor tile is wasted and `family` has a dedicated
 * wasted variant (see `WASTED_GIANT_FAMILY`). Callers still need their own
 * fallback to the plain family when the wasted variant's frames haven't
 * loaded (same graceful-degradation contract every other giant lookup has).
 */
export function giantArtFamilyFor(family: string, wasted: boolean): string {
  return (wasted && WASTED_GIANT_FAMILY[family]) || family;
}

/** The source's river shapes — `RiverTileShape.Mouth` (see `types.ts`) has no art of its own and renders with `straight`/`bend`, same as before. Spring is split into its two spring-capable mountain landforms (`springcorrie`/`springsaddleback`), and Confluence into its two junctions (`confluencenarrow`/`confluencewide`) rather than one fixed family each — see `riverArtFor`'s own comment. The five `..._meander`/`..._island`/`..._loop` entries are `straight`/`bend`/`bend60`'s own `RiverVariant` dressings (see `riverTexturesFor`'s `variant` parameter) — built on the same edge-crossing contract as their base shape, so they render at that same shape's orientation, just a different family lookup. */
type RiverArtShape =
  | 'straight'
  | 'straight_meander'
  | 'straight_island'
  | 'bend'
  | 'bend_meander'
  | 'bend_island'
  | 'bend60'
  | 'bend60_loop'
  | 'springcorrie'
  | 'springsaddleback'
  | 'confluencenarrow'
  | 'confluencewide';

// Exported (only) so textures.test.ts can guard the family name a shape
// resolves to, the same reason riverArtFor below is exported.
export const RIVER_FAMILY: Record<RiverArtShape, string> = {
  straight: 'rivertile',
  // See RiverArtShape's own doc comment: these three pairs are straight/
  // bend/bend60's own RiverVariant dressings, not new crossings — bend180
  // is the straight crossing's art-pack name, bend120 the bend's (see
  // docs/river-tiles.md's "How the tiles are named").
  straight_meander: 'rivertile_bend180_meander',
  straight_island: 'rivertile_bend180_island',
  bend: 'rivertile_bend',
  bend_meander: 'rivertile_bend120_meander',
  bend_island: 'rivertile_bend120_island',
  bend60: 'rivertile_bend60',
  bend60_loop: 'rivertile_bend60_loop',
  // A spring rises out of a mountain cluster (see RiverGenerator's spring
  // placement), so its art is a spring bursting from a mountain landform —
  // the flat, undecorated `rivertile_spring` this used to point at was a
  // placeholder from before the pack had that art (see buildingArt.ts's
  // matching docs-page fix). Only two of the pack's four mountain shapes
  // shipped a `_spring` cut (`MountainShape.IsSpringCapable`) — both have
  // their own base/top split (a rock prop standing above the plate),
  // unlike the old family's base-only composite.
  springcorrie: 'mountaintile_corrie_spring',
  springsaddleback: 'mountaintile_saddleback_spring',
  // The pack's two confluence junctions — y_narrow's asymmetric opposite-
  // pair-plus-branch (see `confluenceOrientationOf`) and ywide's later,
  // fully symmetric three-arms-120°-apart alternative (see
  // `confluenceWideOrientationOf`) — cover two disjoint sets of real (in1,
  // in2, out) triples between them, so both get used rather than only ever
  // reaching for one.
  confluencenarrow: 'rivertile_y_narrow',
  confluencewide: 'rivertile_ywide',
};

/** The lava-river shapes that have a dedicated wasted-island art family — see `TileTextures.lavaRiverBase`/`lavaRiverTop`'s own doc comment for why this doesn't cover every `RiverArtShape`. */
type LavaRiverShape = 'straight' | 'bend' | 'bend60' | 'springcorrie' | 'springsaddleback';

/**
 * Lava-stream art families, one per `LavaRiverShape`. Both spring shapes
 * share the one `mountaintile_volcano_lavaspring_flows` family — the pack
 * has no separate corrie/saddleback lava-spring cut, since a wasted spring
 * reads as its own volcano landform regardless of which spring-capable
 * mountain shape (`springcorrie`/`springsaddleback`) picked the tile before
 * it went wasted. It's the mountain-shape family's own convention (base+top
 * per orientation, no variants — same shape `mountaintile_saddleback_spring`/
 * `mountaintile_corrie_spring` already use), not the plain river-family one;
 * it only ever replaces a Spring tile's own overlay art
 * (`riverTexturesFor`), never the underlying mountain's base texture, which
 * stays whatever `MountainShapeAt`/`SpringMountainShapeAt` already picked
 * either way.
 */
const LAVA_RIVER_FAMILY: Record<LavaRiverShape, string> = {
  straight: 'lavastream',
  bend: 'lavastream_bend',
  bend60: 'lavastream_bend60',
  springcorrie: 'mountaintile_volcano_lavaspring_flows',
  springsaddleback: 'mountaintile_volcano_lavaspring_flows',
};

/** The orientation token embedded in every frame name, e.g. `..._NE_...` or `..._NE`. */
const ORIENTATION_RE = /_(NE|NW|SW|SE|E|W)(?:_|$)/;
/** A numbered terrain-variant suffix, e.g. `_variant001`. */
const VARIANT_RE = /_variant(\d{3})(?:_base)?$/;
/** A numbered building-level suffix, e.g. `_level004` (a top frame) or `_level004_base` (a leveled base frame — see `classifyFamilyFrames`). */
const LEVEL_RE = /_level(\d{3})(?:_base)?$/;
/**
 * A lettered alternate-pass level frame, e.g. `cropmill_E_level004a` or
 * `townsquare_E_level000b` (see `ANIM_LEVEL_RE`'s own comment for what
 * these are — a construction sub-stage some families' vendor art carries
 * alongside, or instead of, the canonical numbered rung, per that repo's
 * `docs/level-splitting.md`, "a stage of it is not a level of its own").
 * `LEVEL_RE` doesn't match these at all (no plain digit run right before
 * the end/`_base`), so without `collapseLetteredLevels` below,
 * `explicitIndexOf` would fall through to its `null` default and silently
 * collide them onto index 0 alongside (or in place of) the real level's
 * frame in `classifyFamilyFrames`.
 */
const LEVEL_LETTER_RE = /^(.+_level\d{3})([a-z])((?:_base)?)$/;
/** The plain (unlettered) counterpart `LEVEL_LETTER_RE` groups a family's lettered passes against — matches `cropmill_E_level000`/`cropmill_E_level000_base`, not `..._level000a`. */
const PLAIN_LEVEL_RE = /^(.+_level\d{3})((?:_base)?)$/;

/**
 * Collapses a family's lettered alternate-pass level frames down to one
 * frame per level/orientation/layer, before `classifyFamilyFrames` ever
 * sees them:
 *
 * - A level that also has a plain (unlettered) frame — e.g. cropmill's
 *   `level000`/`level000a`, `level004`/`level004a` — keeps only the plain
 *   one; the lettered pass is a genuine alternate (cropmill's `004a` is a
 *   second-mill composition of the same level) that has no place in the
 *   single-frame-per-level array `classifyFamilyFrames` builds.
 * - A level that has *no* plain frame at all, only lettered ones — e.g.
 *   townsquare's `level000a`/`level000b` (its own build script's level000
 *   is authored as two construction sub-stages, with no combined
 *   "level000" render) — keeps the alphabetically last lettered pass
 *   (`level000b`) standing in for the plain frame: letter order is
 *   construction order within that level, so the last pass is the closest
 *   to that level's finished look, the one every other level's plain frame
 *   represents.
 *
 * Frames with no level suffix at all (terrain composites, variant frames)
 * pass through untouched.
 */
export function collapseLetteredLevels<T>(frames: FamilyFrame<T>[]): FamilyFrame<T>[] {
  const untouched: FamilyFrame<T>[] = [];
  const plainKeyed = new Map<string, FamilyFrame<T>>();
  const letteredGroups = new Map<string, { letter: string; frame: FamilyFrame<T> }[]>();

  for (const f of frames) {
    const lettered = LEVEL_LETTER_RE.exec(f.name);
    if (lettered) {
      const key = lettered[1] + lettered[3];
      const group = letteredGroups.get(key) ?? [];
      group.push({ letter: lettered[2], frame: f });
      letteredGroups.set(key, group);
      continue;
    }
    const plain = PLAIN_LEVEL_RE.exec(f.name);
    if (plain) {
      plainKeyed.set(plain[1] + plain[2], f);
      continue;
    }
    untouched.push(f);
  }

  const result = [...untouched, ...plainKeyed.values()];
  for (const [key, group] of letteredGroups) {
    if (plainKeyed.has(key)) continue; // the plain frame already won for this level
    const last = [...group].sort((a, b) => a.letter.localeCompare(b.letter)).at(-1)!;
    result.push({ name: key, layer: last.frame.layer, value: last.frame.value });
  }
  return result;
}

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
 *
 * `sparse` (default `false`, the original contract): a genuinely broken
 * render pass leaves a hole in the middle of a level/variant sequence (e.g.
 * `level000`+`level002` with no `level001`), and the default, strict mode
 * throws on exactly that — real production bug, not something to silently
 * tolerate. Pass `sparse: true` only for a frame set that is *known* to be
 * an incomplete, in-progress load rather than the final art (see
 * `buildTileTextures`'s own `sparse` parameter): the `buildings-level1`
 * atlas alone only ever carries index 1 (nothing at index 0), and the
 * `buildings-static` atlas alone is missing index 1 by design (that frame
 * lives in `buildings-level1` instead) — both are real, expected states on
 * the newer split atlas, not bugs. In `sparse` mode a missing index is left
 * as `undefined` (the array's length is `maxIndex + 1`, not `entries.size`)
 * rather than thrown on; callers of `TileTextures.top`/`baseIndexed` walk
 * across those holes themselves (see `pickIndexed`) rather than assuming
 * every slot is filled.
 */
export function classifyFamilyFrames<T>(frames: FamilyFrame<T>[], opts?: { sparse?: boolean }): ClassifiedFamily<T> {
  const sparse = opts?.sparse ?? false;
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
      const length = sparse ? (entries.size === 0 ? 0 : Math.max(...entries.keys()) + 1) : entries.size;
      result[orientation] = Array.from({ length }, (_, i) => {
        const value = entries.get(i);
        if (value === undefined) {
          if (sparse) return undefined as unknown as T;
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
  /**
   * Seconds to hold the end of each cycle before the next one starts (the
   * atlas clip's `pause`, from 3D_assets' `anim_pause`; 0 = none) — see
   * `clipPlayback.ts`'s `clipFrameIndex`, which owns that math.
   */
  pause: number;
  /**
   * The clip's rest image (the building/tile with its moving parts held
   * still), present exactly when the source `AtlasClip.overlay` was true and
   * its `rest` frame resolved — see `classifyFamilyClips`/`classifyGiantClips`.
   * A caller that finds this set must draw it *underneath* `textures`' own
   * frames (which carry only the moving parts) rather than in place of them,
   * and must never draw both this and the plain static top texture at once
   * (that doubles the building) — `HexMapRenderer`'s overlay sprite and
   * `AnimatedBuildingSprite.vue`'s rest layer are the two real callers.
   */
  rest?: Texture;
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
): OrientationMap<Map<number, { textures: T[]; fps: number; playback: 'loop' | 'pingpong'; pause: number; rest?: T }>> {
  const byOrientation = emptyOrientationMap<
    Map<number, { textures: T[]; fps: number; playback: 'loop' | 'pingpong'; pause: number; rest?: T }>
  >(() => new Map());
  for (const clip of clips) {
    const match = ANIM_LEVEL_RE.exec(clip.name);
    if (!match) continue;
    const orientation = clip.orientation as TileOrientation;
    if (!TILE_ORIENTATIONS.includes(orientation)) continue;
    const frameValues = clip.frames.map(resolveFrame);
    if (frameValues.some((v) => v === undefined)) continue;
    // An overlay clip's frames are parts-only — without its rest image
    // resolving too, drawing them alone would show a half-built building, so
    // this drops the whole clip and falls back to the static top texture,
    // same as any frame failing to resolve above.
    let rest: T | undefined;
    if (clip.overlay) {
      if (!clip.rest) continue;
      rest = resolveFrame(clip.rest);
      if (rest === undefined) continue;
    }
    byOrientation[orientation].set(Number(match[1]), {
      textures: frameValues as T[],
      fps: clip.fps,
      playback: clip.playback,
      pause: clip.pause ?? 0,
      rest,
    });
  }
  return byOrientation;
}

/**
 * Which texture belongs on a clip's own (base/rest) sprite vs. its overlay
 * sprite (see `HexMapRenderer.ts`'s `TopAnimState.overlay`), for the frame at
 * `frameIndex` — the pure decision at the heart of that bookkeeping, kept
 * generic and side-effect-free so it's exercised directly here rather than
 * only through a Pixi sprite harness (see `textures.test.ts`). An overlay
 * clip (`clip.rest` set) always shows its rest image on `base` and the
 * current frame on `overlay`; a legacy clip has no `overlay` at all — its
 * current frame goes straight on `base`, same as before overlay clips
 * existed.
 */
export function topAnimTextures<T>(clip: { textures: T[]; rest?: T }, frameIndex: number): { base: T; overlay?: T } {
  if (clip.rest !== undefined) return { base: clip.rest, overlay: clip.textures[frameIndex] };
  return { base: clip.textures[frameIndex]! };
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
   * Lava-stream art for a wasted island's rivers — the shapes a lava
   * stream can actually take (`straight`/`bend`/`bend60`/`spring`;
   * confluence cannot occur on lava, and mouth renders with the plain
   * river art per `riverTexturesFor`'s own doc comment). Sparse: a shape
   * with no frames in the loaded atlas is simply absent.
   */
  lavaRiverBase: Partial<Record<LavaRiverShape, OrientationMap<Texture>>>;
  lavaRiverTop: Partial<Record<LavaRiverShape, OrientationMap<Texture>>>;
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
 *
 * `sparse` (default `false`): passed straight through to
 * `classifyFamilyFrames` for every *building* key (never a terrain key —
 * terrain families aren't split across `buildings-level1`/`buildings-static`
 * at all, so a real gap there is still always a bug). Set this when
 * `atlases` is known to be an incomplete slice of a building's full frame
 * set — `loadLevel1Atlases`/`loadBuildingAtlases` each build from exactly
 * one of the two categories a building's frames are now split across, so
 * each one alone is missing the other's rungs by design, not by accident.
 * Every other loader (`loadTileTextures`, `loadPackAtlases`, ...) merges
 * `buildings-level1` and `buildings-static` into the same `atlases` array
 * *before* this runs, so their combined frame pool has no real gaps and
 * strict (`sparse: false`) classification still catches a genuinely broken
 * render pass.
 */
function buildTileTextures(atlases: LoadedAtlas[], animAtlas?: LoadedAtlas, opts?: { sparse?: boolean }): TileTextures {
  const sparse = opts?.sparse ?? false;
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
    const frames = collapseLetteredLevels(framesOfFamily(merged, family));
    const keySparse = sparse && !TERRAIN_TEXTURE_KEYS.has(key);
    const classified = classifyFamilyFrames(GAPPY_VARIANT_FAMILIES.has(family) ? renumberTopVariants(frames) : frames, {
      sparse: keySparse,
    });
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
  // renumberTopVariants here too: a stale, incomplete leftover copy of
  // blacksandcoast's frames still lingers in the buildings-static atlas
  // (from before this family moved into terrain — see the wasted-islands
  // asset-bump commit), and its lone-frame-per-orientation shape is its own
  // kind of gap classifyFamilyFrames would otherwise reject outright.
  const wastedCoastalClassified = classifyFamilyFrames(renumberTopVariants(framesOfFamily(merged, WASTED_COASTAL_FAMILY)));
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
  for (const [shape, family] of Object.entries(LAVA_RIVER_FAMILY) as [LavaRiverShape, string][]) {
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
            (
              Object.entries(parts) as [
                GiantPart,
                { textures: Texture[]; fps: number; playback: 'loop' | 'pingpong'; pause: number; rest?: Texture },
              ][]
            ).map(([part, clip]) => [
              part,
              { textures: clip.textures, fps: clip.fps, playback: clip.playback, pause: clip.pause, rest: clip.rest },
            ]),
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

/**
 * Terrain families (green and wasted) belong to the terrain atlas, `a` in
 * `mergeTileTextures`. A later load may still carry a few frames under the
 * same names (bg_assets_hextile 24f0644 left stale `wasteland`/`blacksand`
 * variants in buildings-static), and a plain spread let that partial copy
 * replace the whole family: every orientation collapsed to its one stale
 * frame. Terrain keys already in `a` therefore win; everything else merges
 * as before.
 */
const TERRAIN_TEXTURE_KEYS: ReadonlySet<TextureKey> = new Set<TextureKey>([
  'sea',
  'sand',
  'grass',
  'forest',
  'mountain',
  'wasteland',
  'deadforest',
  'blacksand',
  'wastedmountain',
]);

function mergeKeyed<V>(a: Partial<Record<TextureKey, V>>, b: Partial<Record<TextureKey, V>>): Partial<Record<TextureKey, V>> {
  const merged = { ...a, ...b };
  for (const key of TERRAIN_TEXTURE_KEYS) {
    if (a[key] !== undefined) merged[key] = a[key];
  }
  return merged;
}

/**
 * Merges one orientation's per-level array element-wise, `a`'s entry
 * winning at every index it has one for — used for `top`/`baseIndexed`
 * below, whose arrays can now be genuinely sparse (see
 * `classifyFamilyFrames`'s `sparse` option): `loadLevel1Atlases` (level 1
 * only) and `loadBuildingAtlases` (everything else) each resolve with holes
 * at the other's rungs, and a later load merging in must fill those holes
 * rather than replacing the whole array — a plain `a ?? b` per key would let
 * `loadBuildingAtlases`'s array (present, but still missing level 1) wipe
 * out level 1's own entry entirely once it resolves after `loadLevel1Atlases`.
 */
function mergeIndexedArray<T>(a: (T | undefined)[] | undefined, b: (T | undefined)[] | undefined): (T | undefined)[] | undefined {
  if (!a) return b;
  if (!b) return a;
  const length = Math.max(a.length, b.length);
  const result: (T | undefined)[] = new Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = a[i] ?? b[i];
  }
  return result;
}

/** `mergeKeyed`'s per-key merge, but element-wise on each orientation's array via `mergeIndexedArray` — see that function's own doc comment for why `top`/`baseIndexed` need this instead of a whole-array `mergeKeyed`. */
function mergeKeyedArrays<T>(
  a: Partial<Record<TextureKey, OrientationMap<T[]>>>,
  b: Partial<Record<TextureKey, OrientationMap<T[]>>>,
): Partial<Record<TextureKey, OrientationMap<T[]>>> {
  const keys = new Set<TextureKey>([...(Object.keys(a) as TextureKey[]), ...(Object.keys(b) as TextureKey[])]);
  const merged: Partial<Record<TextureKey, OrientationMap<T[]>>> = {};
  for (const key of keys) {
    if (TERRAIN_TEXTURE_KEYS.has(key) && a[key] !== undefined) {
      merged[key] = a[key];
      continue;
    }
    const av = a[key];
    const bv = b[key];
    if (!av) {
      merged[key] = bv;
    } else if (!bv) {
      merged[key] = av;
    } else {
      merged[key] = mapOrientations(av, (orientation, arr) => mergeIndexedArray(arr, bv[orientation]) as T[]);
    }
  }
  return merged;
}

/**
 * Fills in a per-orientation array field from `b` wherever `a`'s own
 * orientation is empty — used for `wastedCoastalBase` below: with atlas
 * packs, `a` (the core terrain load) has none of it until the wasted pack
 * (`b`, loaded later — see `loadPackAtlases`) resolves, so `a`'s copy can no
 * longer be assumed to always already hold it the way it did before packs
 * existed.
 */
function mergeOrientationArrays<T>(a: OrientationMap<T[]>, b: OrientationMap<T[]>): OrientationMap<T[]> {
  return mapOrientations(a, (orientation, value) => (value.length > 0 ? value : b[orientation]));
}

/** Merges an already-resolved `TileTextures` with one loaded later (e.g. terrain, then buildings once they resolve, or the wasted pack once revealed) — used by `HexMapRenderer` to upgrade in place without a full reload. `coastalBase`/`riverBase`/`riverTop` only ever come from the core terrain atlas, so `a`'s copies win unconditionally; the wasted-only fields (`wastedCoastalBase`, `lavaRiverBase`/`lavaRiverTop`) instead keep `a`'s entry where it has one and fall back to `b`'s, since they may not have resolved yet in `a` (the wasted pack loads separately from — and later than — the core terrain atlas). */
export function mergeTileTextures(a: TileTextures, b: TileTextures): TileTextures {
  return {
    base: mergeKeyed(a.base, b.base),
    baseIndexed: mergeKeyedArrays(a.baseIndexed, b.baseIndexed),
    top: mergeKeyedArrays(a.top, b.top),
    animTop: mergeKeyed(a.animTop, b.animTop),
    coastalBase: a.coastalBase,
    riverBase: a.riverBase,
    riverTop: a.riverTop,
    wastedCoastalBase: mergeOrientationArrays(a.wastedCoastalBase, b.wastedCoastalBase),
    lavaRiverBase: { ...b.lavaRiverBase, ...a.lavaRiverBase },
    lavaRiverTop: { ...b.lavaRiverTop, ...a.lavaRiverTop },
    giants: { ...a.giants, ...b.giants },
    giantAnims: { ...a.giantAnims, ...b.giantAnims },
  };
}

/**
 * Drops a memoised load once it rejects, so a later call (e.g. the map's
 * "Retry" button) actually re-fetches instead of replaying the same failed
 * promise forever. `evict` runs only if the slot still holds this promise.
 */
function evictOnReject<T>(promise: Promise<T>, evict: () => void): Promise<T> {
  promise.catch(evict);
  return promise;
}

let terrainLoading: Promise<TileTextures> | null = null;
/**
 * The small `terrain` atlas alone — enough for the landing page / world map
 * background, and for `HexMapRenderer` to draw terrain-only settlement tiles
 * before building art resolves. `onPage`, like `loadAtlasCategory`'s own, is
 * only invoked on the first (uncached) call.
 */
export function loadTerrainAtlas(onPage?: AtlasPageProgress): Promise<TileTextures> {
  if (!terrainLoading) {
    const promise = loadAtlasCategory('terrain', onPage).then((atlas) => buildTileTextures([atlas]));
    terrainLoading = evictOnReject(promise, () => {
      if (terrainLoading === promise) terrainLoading = null;
    });
  }
  return terrainLoading;
}

let level1Loading: Promise<TileTextures> | null = null;
/**
 * The `buildings-level1` atlas alone — every levelless building frame
 * (shared bases, levelless tops) plus every `_level001*` frame (see
 * `atlas.ts`'s `withBuildingLevel1`'s own doc comment). Loaded via
 * `loadOptionalAtlasCategory` rather than `loadAtlasCategory`: the older,
 * currently vendored atlas has no `buildings-level1` pages at all (every
 * building frame still lives in `buildings-static`), which must resolve to
 * "nothing yet" rather than fail the whole map load the way a genuinely
 * missing *core* category would.
 *
 * Built with `sparse: true` — this atlas alone only ever has index 1 for a
 * family's `top`/`baseIndexed` arrays (nothing at index 0, or at 2/3+
 * either), which is by design here, not a broken render pass (see
 * `buildTileTextures`'s own `sparse` parameter). `HexMapRenderer` merges
 * this in *first*, so buildings render with their level-1 art immediately —
 * whatever their real level — while the larger `buildings-static` atlas is
 * still loading (see `pickIndexedEntry`'s walk).
 */
export function loadLevel1Atlases(): Promise<TileTextures> {
  if (!level1Loading) {
    const promise = loadOptionalAtlasCategory('buildings-level1').then((atlas) =>
      buildTileTextures([atlas], undefined, { sparse: true }),
    );
    level1Loading = evictOnReject(promise, () => {
      if (level1Loading === promise) level1Loading = null;
    });
  }
  return level1Loading;
}

let buildingLoading: Promise<TileTextures> | null = null;
/**
 * The (much larger) `buildings-static` atlas alone — no `buildings-anim`.
 * Its `TileTextures` has empty `coastalBase`/`riverBase`/`riverTop` (those
 * only ever come from `loadTerrainAtlas`) — merge with `mergeTileTextures`
 * rather than using this result standalone.
 *
 * `buildings-anim` used to load unconditionally alongside this (see
 * `loadAnimAtlases` below for why it's now separate and conditional): every
 * `buildings-anim`/`wasted-buildings-anim-*` clip also has a static frame
 * in this atlas, so the map renders correctly — `topAnimFor` just returns
 * undefined and the static texture draws instead — without ever loading
 * animation art at all. That's the ~319 MB of decoded GPU/RAM the split
 * exists to make optional (see `animationPreference.ts`).
 *
 * Built with `sparse: true` for the same reason `loadLevel1Atlases` is: on
 * the newer split atlas, `buildings-static` alone is missing every family's
 * index 1 by design (that frame lives in `buildings-level1` instead, loaded
 * separately and merged in via `mergeTileTextures` — see `HexMapRenderer`).
 * On the older, currently vendored atlas (no split at all) this atlas
 * already has every index, so `sparse: true` is a no-op there — nothing to
 * leave a hole for.
 */
export function loadBuildingAtlases(onPage?: AtlasPageProgress): Promise<TileTextures> {
  if (!buildingLoading) {
    const promise = loadAtlasCategory('buildings-static', onPage).then((atlas) =>
      buildTileTextures([atlas], undefined, { sparse: true }),
    );
    buildingLoading = evictOnReject(promise, () => {
      if (buildingLoading === promise) buildingLoading = null;
    });
  }
  return buildingLoading;
}

let animLoading: Promise<TileTextures> | null = null;
/**
 * `buildings-anim`'s clips, as a `TileTextures` carrying `animTop` (plus the
 * `base`/`top`/`baseIndexed` `buildTileTextures` derives from
 * `buildings-static`/`buildings-level1` along the way — harmless, already-
 * loaded duplicates of what `loadBuildingAtlases`/`loadLevel1Atlases`
 * produced, and simplest to just re-merge via `mergeTileTextures` rather
 * than hand-building a sparser shape). Loaded only while
 * `animationPreference.effective` is true (see
 * `HexMapRenderer.setAnimationsEnabled`) — this is the ~319 MB piece that
 * staying off entirely means never paying for.
 *
 * `buildings-level1` is merged into the same `buildTileTextures` call as
 * `buildings-static` here (rather than loaded and merged separately, the
 * way `HexMapRenderer` stages the plain static load) — both are folded into
 * one frame pool *before* classification runs, so it has no real gaps and
 * can use strict (non-`sparse`) classification, same as `loadTileTextures`.
 *
 * `loadAtlasCategory('buildings-static')` here reuses atlas.ts's own
 * per-category cache — by the time animations turn on, `loadBuildingAtlases`
 * has almost always already resolved it, so this only actually loads
 * `buildings-anim`'s own pages (`buildings-level1` likewise, via
 * `loadLevel1Atlases`'s own cache).
 */
export function loadAnimAtlases(): Promise<TileTextures> {
  if (!animLoading) {
    const promise = Promise.all([
      loadAtlasCategory('buildings-static'),
      loadOptionalAtlasCategory('buildings-level1'),
      loadAtlasCategory('buildings-anim'),
    ]).then(([staticAtlas, level1Atlas, animAtlas]) => buildTileTextures([staticAtlas, level1Atlas], animAtlas));
    animLoading = evictOnReject(promise, () => {
      if (animLoading === promise) animLoading = null;
    });
  }
  return animLoading;
}

/**
 * Releases `buildings-anim`'s decoded GPU textures (see
 * `atlas.ts`'s `unloadAtlasCategory`) and drops this module's own memoised
 * promise, so a later `loadAnimAtlases` call actually reloads rather than
 * replaying a reference to now-destroyed textures. The caller (
 * `HexMapRenderer.setAnimationsEnabled`) is responsible for first pointing
 * every sprite that was showing an anim texture back at its static one
 * (`releaseTopAnim`/`syncTopAnim`) — this only frees the GPU memory, it
 * doesn't touch anything still drawing with it.
 */
export function unloadAnimAtlases(): void {
  animLoading = null;
  void unloadAtlasCategory('buildings-anim');
}

const packLoading = new Map<AtlasPack, Promise<TileTextures>>();
/**
 * One pack's own terrain/building-static/building-level1 atlases
 * (`${pack}-terrain`, `${pack}-buildings-static`, `${pack}-buildings-level1`)
 * — no `${pack}-buildings-anim`, same static-only split as
 * `loadBuildingAtlases` vs. `loadAnimAtlases` above, see `loadPackAnimAtlases`
 * for the animated half. Built into a `TileTextures` the same shape
 * `loadTerrainAtlas`/`loadBuildingAtlases` produce — merge it in with
 * `mergeTileTextures` once the world reveals that pack (see
 * `HexMapRenderer`'s wasted-reveal handling). Each category loads via
 * `loadAtlasPackCategory`, which returns an empty, non-throwing
 * `LoadedAtlas` for a category the pack has no pages for yet (the currently
 * vendored atlas ships neither pack pages nor any `buildings-level1` split
 * at all) — so this never fails outright, it just contributes nothing until
 * the pack's pages actually exist.
 *
 * `buildings-static` and `buildings-level1` are merged into the same
 * `buildTileTextures` call (not loaded/merged separately the way
 * `HexMapRenderer` stages the plain, unpacked buildings) — both folded into
 * one frame pool before classification runs, so strict (non-`sparse`)
 * classification is safe here, same reasoning as `loadTileTextures`.
 */
export function loadPackAtlases(pack: AtlasPack): Promise<TileTextures> {
  const cached = packLoading.get(pack);
  if (cached) return cached;

  const promise = Promise.all([
    loadAtlasPackCategory(pack, 'terrain'),
    loadAtlasPackCategory(pack, 'buildings-static'),
    loadAtlasPackCategory(pack, 'buildings-level1'),
  ]).then(([terrain, buildings, level1]) => buildTileTextures([terrain, buildings, level1]));

  packLoading.set(pack, promise);
  return evictOnReject(promise, () => {
    if (packLoading.get(pack) === promise) packLoading.delete(pack);
  });
}

const packAnimLoading = new Map<AtlasPack, Promise<TileTextures>>();
/**
 * `${pack}-buildings-anim`'s clips — the pack half of `loadAnimAtlases`,
 * loaded only once that pack is both revealed (`maybeLoadWastedPack`) and
 * animations are enabled. Reuses `loadAtlasPackCategory`'s own per-key cache
 * for `terrain`/`buildings-static`/`buildings-level1`, so — same as
 * `loadAnimAtlases` — calling this after `loadPackAtlases(pack)` has already
 * resolved only actually loads the pack's `buildings-anim` pages.
 */
export function loadPackAnimAtlases(pack: AtlasPack): Promise<TileTextures> {
  const cached = packAnimLoading.get(pack);
  if (cached) return cached;

  const promise = Promise.all([
    loadAtlasPackCategory(pack, 'terrain'),
    loadAtlasPackCategory(pack, 'buildings-static'),
    loadAtlasPackCategory(pack, 'buildings-level1'),
    loadAtlasPackCategory(pack, 'buildings-anim'),
  ]).then(([terrain, buildings, level1, animAtlas]) => buildTileTextures([terrain, buildings, level1], animAtlas));

  packAnimLoading.set(pack, promise);
  return evictOnReject(promise, () => {
    if (packAnimLoading.get(pack) === promise) packAnimLoading.delete(pack);
  });
}

/** The pack-scoped mirror of `unloadAnimAtlases` — see its own doc comment. */
export function unloadPackAnimAtlases(pack: AtlasPack): void {
  packAnimLoading.delete(pack);
  void unloadAtlasCategory(`${pack}-buildings-anim`);
}

let combinedLoading: Promise<TileTextures> | null = null;
/**
 * All four atlases (terrain, `buildings-static`, `buildings-level1`,
 * `buildings-anim`), merged. Existing callers that don't need staged loading
 * keep using this — `buildings-level1`/`buildings-static` merge into the
 * same `buildTileTextures` call, same reasoning as `loadAnimAtlases`/
 * `loadPackAtlases`: one complete frame pool, so strict classification is
 * safe.
 */
export function loadTileTextures(): Promise<TileTextures> {
  if (!combinedLoading) {
    const promise = Promise.all([
      loadAtlasCategory('terrain'),
      loadAtlasCategory('buildings-static'),
      loadOptionalAtlasCategory('buildings-level1'),
      loadAtlasCategory('buildings-anim'),
    ]).then(([terrain, buildings, level1, animAtlas]) => buildTileTextures([terrain, buildings, level1], animAtlas));
    combinedLoading = evictOnReject(promise, () => {
      if (combinedLoading === promise) combinedLoading = null;
    });
  }
  return combinedLoading;
}

/**
 * `RiverArt` overrides both the texture key and the orientation a river-
 * gated building (Sawmill, Crop Mill) renders with — see
 * `riverBuildingArtFor`, which derives it from the river tile the building
 * actually stands on (a Sawmill/Crop Mill's own hex *is* the river tile —
 * unlike e.g. a Fishing Hut on the water, it isn't adjacent to one).
 * Threading an explicit orientation override through here, rather than
 * reading `tile.orientation`, is what keeps the building's channel lined up
 * with its river neighbours: `tile.orientation` is `worldGenerator.ts`'s
 * per-hex hash, unrelated to which way the river the building was built on
 * actually flows (see `docs/design/river-generation.md` and this fix's own
 * PR description). Ignored for every other building/terrain.
 */
export interface RiverArt {
  key: TextureKey;
  orientation: TileOrientation;
}

/**
 * A wasted tile's green terrain, mapped to the wasted-island art family it
 * renders with instead — see `docs/design/river-generation.md`'s wasted-
 * island section and `WorldModel.setWastedRevealed`. A wasted mountain is
 * the ashen `mountaintile_jagged` (the plain `mountaintile` art, base and
 * top, carries a green grass skirt).
 *
 * `sea` maps to `taintedwater` here purely so `baseTextureFor`'s own
 * "no dedicated wasted family, sit on wasteland" fallback (below) doesn't
 * fire for it — the vendored wasted pack does ship a proper open-water
 * family. This never actually changes in-game rendering today:
 * `WorldModel.getTile` only ever sets `Tile.wasted` on wasted *land*, and on
 * coastal water bordering it (`isCoastalWater`, its own `WASTED_COASTAL_FAMILY`
 * lookup in `baseTextureFor`, unrelated to this map) — never on open,
 * non-coastal sea, so a live/demo-mode wasted open-sea tile can't occur. The
 * one real caller is the Wasted Lands docs page's `StaticWorldModel`
 * (`src/lib/docs/wastedIsland.ts`'s `buildIslandTiles`), whose hand-built
 * island *does* mark its open-water ring wasted once the blight reaches it —
 * see `textures.test.ts`'s "wasted open sea resolves taintedwater" guard.
 */
const WASTED_TEXTURE_KEY: Partial<Record<Terrain, TextureKey>> = {
  grass: 'wasteland',
  forest: 'deadforest',
  sand: 'blacksand',
  mountain: 'wastedmountain',
  sea: 'taintedwater',
};

/**
 * A Sawmill is never actually on plain ground — placing one requires a
 * river shape (`BuildingCatalogue.SawmillRiverShapes`) — so its wire
 * building type never resolves to the flat/inland `sawmill` art family:
 * absent a `riverArt` override (which the render path always supplies when
 * it has the river tile in hand — see `riverBuildingArtFor`), this falls
 * back to `sawmillriver` rather than the grass family, so a caller that
 * forgets to pass one (or genuinely has no river tile to look up, e.g. a
 * stale/malformed tile) still never shows the grass sawmill. See
 * `textures.test.ts`'s "grass sawmill art is never used" guard.
 */
export function textureKeyFor(tile: Tile, riverArt?: RiverArt): TextureKey {
  if (riverArt) return riverArt.key;
  if (tile.buildingType === 'sawmill') return 'sawmillriver';
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
 * Picks the entry at `index` in a *possibly sparse* per-level array (see
 * `classifyFamilyFrames`'s `sparse` option and `buildTileTextures`'s own
 * `sparse` parameter), returning both the value and the index it actually
 * came from — a caller with a second array indexed the same way (`topTextureFor`
 * next to `topAnimFor`'s `animTop`) needs that real index to read the
 * matching slot out of it, not just the value.
 *
 * Three rungs, in order:
 * 1. Exact: `arr[index]` if it's loaded.
 * 2. Walk down from `index - 1` to `0` — the original clamp-to-richest-known
 *    fallback (`clampIndex`) generalized to a sparse array: for a fully
 *    dense array (the normal, fully-loaded case) this reduces to exactly
 *    that clamp, since walking down from an out-of-range `index` lands on
 *    the last real entry immediately.
 * 3. Walk up from `index + 1` — reached only when nothing at or below
 *    `index` is loaded, which happens exactly while only the `buildings-level1`
 *    atlas has loaded (see `loadLevel1Atlases`): index 0 (and everything
 *    below whatever level was requested) is empty, but index 1 is not, so
 *    this naturally lands on it — "every building renders its level-1 art
 *    whatever its level" falls out of this walk rather than needing its own
 *    special case.
 */
function pickIndexedEntry<T>(arr: (T | undefined)[] | undefined, index: number): { value: T; index: number } | undefined {
  if (!arr) return undefined;
  if (arr[index] !== undefined) return { value: arr[index] as T, index };
  for (let i = index - 1; i >= 0; i--) {
    if (arr[i] !== undefined) return { value: arr[i] as T, index: i };
  }
  for (let i = index + 1; i < arr.length; i++) {
    if (arr[i] !== undefined) return { value: arr[i] as T, index: i };
  }
  return undefined;
}

/** `pickIndexedEntry`, for a caller that only needs the value (most callers — `topAnimFor` is the one that also needs the resolved index). */
function pickIndexed<T>(arr: (T | undefined)[] | undefined, index: number): T | undefined {
  return pickIndexedEntry(arr, index)?.value;
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
export function baseTextureFor(textures: TileTextures, tile: Tile, riverArt?: RiverArt): Texture {
  const orientation = riverArt?.orientation ?? tile.orientation ?? 'SE';
  if (tile.terrain === 'sea' && tile.isCoastalWater && !tile.buildingType) {
    const arr = tile.wasted ? textures.wastedCoastalBase[orientation] : textures.coastalBase[orientation];
    return arr[clampIndex(tile.variant ?? 0, arr.length)];
  }
  // A giant on a wasted island (and any wasted land tile without a wasted
  // family of its own) sits on the `wasteland` base: the giant's own terrain
  // key would pick a green grass or mountain base, leaving every volcano and
  // Utgard in a bright green ring. Not routed through textureKeyFor, which
  // also decides top art — a giant draws its own top (HexMapRenderer's giant
  // branch), so only the base diverges here.
  if (tile.wasted && !tile.buildingType && (tile.giant || !WASTED_TEXTURE_KEY[tile.terrain])) {
    const wastelandBase = textures.base.wasteland;
    if (wastelandBase) return wastelandBase[orientation];
  }
  const key = textureKeyFor(tile, riverArt);
  const indexed = textures.baseIndexed[key];
  if (indexed) {
    const picked = pickIndexed(indexed[orientation], tile.buildingLevel ?? 1);
    if (picked !== undefined) return picked;
  }
  // A building with no art of its own in the pack (e.g. Lumberjack/Quarry —
  // see the module doc comment above) renders as its bare terrain instead of
  // throwing; BuildingModal.vue's own `art` computed falls back the same way.
  // Also reached while `indexed` exists but every one of its rungs is still
  // a hole (only `buildings-level1` loaded, and this particular family's
  // level 1 base frame hasn't resolved either) — same graceful degradation.
  const base = textures.base[key] ?? textures.base[tile.terrain];
  return base![orientation];
}

/** The top (props/building) layer texture for a tile, or `undefined` if this key has no top layer. */
export function topTextureFor(textures: TileTextures, tile: Tile, riverArt?: RiverArt): Texture | undefined {
  const key = textureKeyFor(tile, riverArt);
  const orientation = riverArt?.orientation ?? tile.orientation ?? 'SE';
  const arr = textures.top[key]?.[orientation];
  if (!arr) return undefined;
  const index = tile.buildingType ? (tile.buildingLevel ?? 1) : (tile.variant ?? 0);
  return pickIndexed(arr, index);
}

/**
 * The playable clip standing in for this tile's top texture, or `undefined`
 * if this exact key/orientation/level has no animation (most rungs don't —
 * see `TileTextures.animTop`'s own comment). Resolves the level index
 * identically to `topTextureFor` so the two always agree on which rung a
 * given tile is showing.
 */
export function topAnimFor(textures: TileTextures, tile: Tile, riverArt?: RiverArt): TileAnimClip | undefined {
  const key = textureKeyFor(tile, riverArt);
  const orientation = riverArt?.orientation ?? tile.orientation ?? 'SE';
  const arr = textures.top[key]?.[orientation];
  if (!arr) return undefined;
  const index = tile.buildingType ? (tile.buildingLevel ?? 1) : (tile.variant ?? 0);
  // Resolved through the same `pickIndexedEntry` walk as `topTextureFor`
  // (not a plain `clampIndex`) so the two always agree on which rung is
  // actually showing — including while only `buildings-level1` has loaded
  // and every requested level resolves to index 1's art (see
  // `pickIndexedEntry`'s own doc comment).
  const resolved = pickIndexedEntry(arr, index);
  if (!resolved) return undefined;
  return textures.animTop[key]?.[orientation]?.[resolved.index];
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
 * 120°-off-straight turn between two adjacent edges, a separate art family
 * from `bend` — has its own rotation convention (`bend60OrientationOf`: its
 * files touch edges `D`/`D+1`, not `bend`'s `D-1`/`D+1`); `spring` has only
 * an outflow (`springOrientationOf`) — which of its two art families
 * (`springcorrie`/`springsaddleback`) to use is the caller's own per-tile
 * lookup (`springShape`, mirroring the backend's
 * `TerrainSampler.SpringMountainShapeAt` — see `WorldModel.springShapeAt`),
 * since which mountain shape a spring's coordinate hashes to has nothing to
 * do with the river tile itself; `straight` orients by whichever of
 * `inDirections[0]`/`outDirection` is available, since `straightOrientationOf`
 * gives the same file either way (`docs/design/river-generation.md` again).
 *
 * `mouth` has no art of its own — it renders as `straight` or `bend`
 * depending on the actual angle to the sea (`mouthOrientationOf`;
 * `seaDirection` is the caller's own terrain lookup, since a `RiverTile`
 * carries none), not the inflow's geometric opposite `straight` alone
 * would assume.
 *
 * `confluence` has two junction assets, each pixel-verified the same way
 * the other families were (`docs/design/river-generation.md`'s "Art pack
 * orientation convention"): `y_narrow` (`confluenceOrientationOf`) is
 * asymmetric — a fixed opposite pair (the trunk) plus a third edge adjacent
 * to one end (the branch); `ywide` (`confluenceWideOrientationOf`) is fully
 * symmetric — three arms exactly 120° apart, no distinguished trunk or
 * branch. Unlike an ordinary bend, nothing on the generation side
 * constrains a confluence's (in1, in2, out) angles to one fixed relative
 * arrangement — two independently traced paths collide wherever they
 * happen to — so this tries `y_narrow` first, then `ywide` (the two never
 * both match the same triple — an opposite pair and an evenly-120°-spaced
 * triple are mutually exclusive), and only falls back to the untransformed
 * `outDirection ?? inDirections[0]` this whole function used before either
 * fix, for a triple neither asset can represent.
 */
// Exported (only) so textures.test.ts can check the shape/orientation this
// picks without going through loadTileTextures' real asset pipeline
// (Pixi's Assets.load needs a browser `document`, which this repo's node-
// environment vitest config doesn't provide).
export function riverArtFor(
  river: RiverTile,
  seaDirection: TileOrientation | null,
  springShape: 'corrie' | 'saddleback' = 'corrie',
): { shape: RiverArtShape; orientation: TileOrientation } {
  if (river.shape === 'bend' && river.outDirection && river.inDirections[0]) {
    return { shape: 'bend', orientation: bendOrientationOf(river.inDirections[0], river.outDirection) };
  }
  if (river.shape === 'bend60' && river.outDirection && river.inDirections[0]) {
    return { shape: 'bend60', orientation: bend60OrientationOf(river.inDirections[0], river.outDirection) };
  }
  if (river.shape === 'spring' && river.outDirection) {
    const shape = springShape === 'saddleback' ? 'springsaddleback' : 'springcorrie';
    return { shape, orientation: springOrientationOf(river.outDirection) };
  }
  if (river.shape === 'confluence') {
    const narrow = confluenceOrientationOf(river.inDirections, river.outDirection);
    if (narrow) return { shape: 'confluencenarrow', orientation: narrow };
    const wide = confluenceWideOrientationOf(river.inDirections, river.outDirection);
    if (wide) return { shape: 'confluencewide', orientation: wide };
    const orientation = river.outDirection ?? river.inDirections[0] ?? 'SE';
    return { shape: 'confluencenarrow', orientation };
  }
  if (river.shape === 'mouth' && river.inDirections[0]) {
    return mouthOrientationOf(river.inDirections[0], seaDirection);
  }

  const direction = river.inDirections[0] ?? river.outDirection;
  return { shape: 'straight', orientation: direction ? straightOrientationOf(direction) : 'SE' };
}

/**
 * A river-gated building's own art family/orientation, given the river tile
 * it stands on — used instead of the tile's random `orientation` hash so a
 * Sawmill/Crop Mill's channel lines up with its river neighbours (the same
 * shape is what a real placement is built on, per `BuildingCatalogue`'s
 * `SawmillRiverShapes`/`CropMillRiverShapes` and `ringCatalogue.ts`'s
 * `RIVER_SHAPES_BY_TYPE` — see that map's own doc comment for the
 * shape-matches-the-hex's-river-art rule this mirrors). `seaDirection`/
 * `springShape` are never needed here: neither building is ever placed on a
 * `mouth` or `spring` tile, the only shapes `riverArtFor` would otherwise
 * need them for.
 *
 * Returns `undefined` for a river shape this building type has no matching
 * art for (`riverBuildingAllowedHere` already keeps it from being placed
 * there in the first place — this only defends the render path against a
 * stale/malformed tile).
 */
export function riverBuildingArtFor(buildingType: string, river: RiverTile): RiverArt | undefined {
  // Gated on the river tile's own wire shape, not the art-resolved shape
  // riverArtFor returns below: a Mouth tile's art always resolves to
  // 'straight' or 'bend' (mouthOrientationOf), but Mouth itself is never a
  // valid Sawmill/Crop Mill placement (absent from both SawmillRiverShapes
  // and CropMillRiverShapes) — checking the raw shape here keeps this in
  // lockstep with riverBuildingAllowedHere instead of accidentally drawing
  // river-building art on a shape it was never actually built on.
  if (buildingType === 'sawmill') {
    if (river.shape !== 'straight' && river.shape !== 'bend' && river.shape !== 'bend60') return undefined;
  } else if (buildingType === 'cropmill') {
    if (river.shape !== 'straight') return undefined;
  } else {
    return undefined;
  }
  const { shape, orientation } = riverArtFor(river, null);
  if (buildingType === 'sawmill') {
    if (shape === 'straight') return { key: 'sawmillriver', orientation };
    if (shape === 'bend') return { key: 'sawmillbend', orientation };
    if (shape === 'bend60') return { key: 'sawmillbend60', orientation };
    return undefined;
  }
  return { key: 'cropmill', orientation };
}

/**
 * The `RiverArtShape` a `straight`/`bend`/`bend60` tile's own `RiverVariant`
 * resolves to (see `RiverArtShape`'s own doc comment) — `undefined` for
 * `'plain'` or for a shape with no variant art (spring/confluence/mouth),
 * i.e. whenever the caller should just keep drawing `shape` itself.
 */
const VARIANT_SHAPE: Partial<Record<RiverArtShape, Partial<Record<Exclude<RiverVariant, 'plain'>, RiverArtShape>>>> = {
  straight: { meander: 'straight_meander', island: 'straight_island' },
  bend: { meander: 'bend_meander', island: 'bend_island' },
  bend60: { loop: 'bend60_loop' },
};

/**
 * A river tile's own base/top textures, overriding whatever the underlying
 * terrain would have drawn. `seaDirection` (only meaningful for a `Mouth`
 * tile — see `riverArtFor`) is the caller's own terrain lookup
 * (`WorldModel.seaFacingDirectionOf`), since a `RiverTile` carries none.
 * `springShape` (only meaningful for a `Spring` tile) is likewise the
 * caller's own lookup (`WorldModel.springShapeAt`) — see `riverArtFor`.
 * `variant` (only meaningful for `straight`/`bend`/`bend60` — see
 * `WorldModel.riverVariantAt`) dresses the tile with its
 * meander/island/loop art at that same shape's own orientation, built on
 * the same edge-crossing contract as the plain tile (see
 * `docs/river-tiles.md`, "There are only three river shapes"). Falls back
 * to the plain shape's own texture if the variant family's frame for this
 * orientation hasn't loaded (the same graceful-degradation contract every
 * other keyed lookup in this module has), and is never applied to a
 * `river.wasted` tile at all — the vendored pack has no lava variant art
 * (`docs/river-tiles.md`), so a wasted river always renders plain (or lava,
 * below).
 */
export function riverTexturesFor(
  textures: TileTextures,
  river: RiverTile,
  seaDirection: TileOrientation | null = null,
  springShape: 'corrie' | 'saddleback' = 'corrie',
  variant: RiverVariant = 'plain',
): { base: Texture; top: Texture } {
  const { shape, orientation } = riverArtFor(river, seaDirection, springShape);

  // Lava streams (wasted islands) swap in the lavastream/lava-spring
  // families for the shapes that have one — straight/bend/bend60/
  // springcorrie/springsaddleback (LAVA_RIVER_FAMILY). Confluence cannot
  // occur on lava (RiverGenerator's allowConfluence: false) and mouth
  // deliberately keeps the plain river art (no dedicated lava mouth asset),
  // so every other shape falls through to the ordinary lookup below even on
  // a wasted island. The lava families share their water counterparts'
  // rotation convention (the lava spring drains over edge D+1 like the
  // mountain springs — see springOrientationOf), so the same orientation
  // applies unchanged.
  if (
    river.wasted &&
    (shape === 'straight' || shape === 'bend' || shape === 'bend60' || shape === 'springcorrie' || shape === 'springsaddleback')
  ) {
    const lavaBase = textures.lavaRiverBase[shape]?.[orientation];
    const lavaTop = textures.lavaRiverTop[shape]?.[orientation];
    if (lavaBase && lavaTop) return { base: lavaBase, top: lavaTop };
  }

  if (!river.wasted && variant !== 'plain') {
    const variantShape = VARIANT_SHAPE[shape]?.[variant];
    if (variantShape) {
      const variantBase = textures.riverBase[variantShape][orientation];
      const variantTop = textures.riverTop[variantShape][orientation];
      if (variantBase !== Texture.EMPTY && variantTop !== Texture.EMPTY) {
        return { base: variantBase, top: variantTop };
      }
    }
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
