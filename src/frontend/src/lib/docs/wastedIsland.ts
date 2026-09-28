// Pure data for the Wasted Lands docs page's "turning island" (WastedIsland.vue):
// a made-up island, not from a real world, whose hexes swap living art for
// wasted art as a blight-stage slider advances. No Vue/DOM dependency here —
// everything is plain data so it can be unit tested directly
// (wastedIsland.test.ts).
//
// The island lives on the same axial lattice as the real game
// (src/lib/hex/coords.ts, src/lib/hex/geometry.ts). Its one real classifier,
// `classifyIsland`, is shared by two very different consumers:
//
//   - `buildIslandTiles` turns it into a plain `Tile[]` (src/lib/map/types.ts)
//     for `StaticWorldModel`, so the docs page can hand it straight to the
//     real `HexMapRenderer` — the same terrain/orientation/variant/giant
//     lookups (`textures.ts`, `giantTiles.ts`) an actual in-game island uses,
//     rather than a second, hand-maintained rendering of the same data. This
//     is what `WastedIsland.vue` actually draws.
//   - `buildIsland` is the older hand-positioned-DOM-sprite rendering this
//     replaced — kept test-only (wastedIsland.test.ts) as a from-first-
//     principles regression check that every frame name it derives (living
//     and wasted, ordinary tile and giant part alike) still resolves in the
//     vendored atlas, independent of whichever renderer actually draws the
//     page. It reuses the `showcase` atlas category's pre-composited,
//     high-res frames (src/lib/map/atlas.ts) for every ordinary land tile,
//     and for a giant, 7 `showcase` ground plates (draw layer "base") plus 7
//     per-hex top parts from `buildings-static`/`terrain` (draw layer "top",
//     see `giantTiles.ts`) — see its own doc comment for why a giant is
//     drawn per-hex rather than as one pre-composited frame.
import { coordKey, hexDistance, neighbors, type AxialCoord } from '../hex/coords';
import { isoGridPosition } from '../hex/geometry';
import { findAtlasClip, findAtlasFrame, type AtlasClip, type AtlasFrameRect } from '../map/atlas';
import { giantCoverage, GIANT_PARTS } from '../map/giantTiles';
import { TILE_ORIENTATIONS, type Tile, type TileOrientation } from '../map/types';

/** One island hex's terrain family, or one of the two giants. */
export type IslandKind = 'grass' | 'forest' | 'mountain' | 'sand' | 'coast' | 'sea' | 'utgard' | 'volcano';

export interface IslandPlacement {
  /** Stable across rotations (keyed on the hex's pre-rotation coordinate), so Vue can key a `v-for` on it without a rotation causing every sprite to remount. */
  key: string;
  kind: IslandKind;
  livingFrame: string;
  wastedFrame: string;
  /** The atlas category `livingFrame`/`wastedFrame` resolve in — `"showcase"` for every ground/land tile (ordinary or a giant's own per-hex base plate), or a giant's per-hex top part's own category (`"buildings-static"`/`"terrain"`). */
  category: string;
  /** Top-left of this placement's *untrimmed source canvas* at 1x (400x600 for a tile or a giant's per-hex base plate) — see the module doc below for how a resolved frame's own `spriteSourceSize` offsets into it. A giant top part (`giantTopPart: true`) instead anchors its box to this same reference's canvas *bottom*, scaled 2x — see `resolveIslandFrame`'s caller (`WastedIsland.vue`'s `spriteBox`). */
  x: number;
  y: number;
  /** Painter's-algorithm sort key — render placements in ascending order (ties: x, then `"base"` before `"top"`). */
  depth: number;
  /** Blight stage (1..4) at which this placement turns from living to wasted. */
  turnsAt: number;
  /** Per-hex delay fraction (0..1) for staggering the cross-fade. */
  delay: number;
  /** The (rotated) hex this placement covers — always exactly one; a giant's 7-hex footprint is 14 single-hex placements (7 base + 7 top), not one 7-hex placement. */
  hexes: AxialCoord[];
  /** Draw layer — mirrors the game's terrainBase/terrainTop split: every ordinary tile (a single pre-composited base+top frame) and every giant's per-hex top part live in `"top"`; only a giant's own per-hex ground plate lives in `"base"`. Rendering is one depth-sorted pass over both, with a hex's `"base"` plate just before its `"top"` part (see `buildIsland`). */
  layer: 'base' | 'top';
  /** Groups placements that should highlight together on hover and share one caption identity — a giant's 14 placements (7 base + 7 top) all share one value (e.g. `"utgard"`); every other placement's group is just its own `key`. */
  hoverGroup: string;
  /** True only for a giant's per-hex top part: 1x art (native width 200, height varies per part) rendered at 2x into the island's showcase-pixel space, anchored to the bottom of the hex's normal canvas rather than its top-left. */
  giantTopPart: boolean;
}

// Showcase geometry (see VanDooProject/3D_assets docs/asset-inventory.md and
// scripts/build_atlas.py): a tile's source canvas is 400x600 with its top
// face's bounding box starting at y=280. A giant's per-hex top part is 1x
// terrain/buildings-static art (native width 200, height varies per part)
// rendered at 2x into this same 400-wide, 600-tall space, anchored to the
// bottom of that canvas rather than its top-left — see `TILE_SOURCE_H` and
// `WastedIsland.vue`'s `spriteBox`.
const TILE_W = 400;
const TOP_FACE_H = 184;
/** A tile's top face's own bounding-box y-offset within its 400x600 source canvas — also usable by a standalone giant layout (e.g. `AnimatedGiant.vue`) that needs the same `g.y - TOP_FACE_Y` placement math `buildIsland` uses. */
export const TOP_FACE_Y = 280;
/** A tile's full source-canvas height (400x600) — also the reference a giant top part's 2x-scaled box anchors its bottom edge to (see `giantTopPart` on `IslandPlacement`). */
export const TILE_SOURCE_H = 600;
/** Native (1x) canvas height a giant top part's `sourceSize.h` is measured against — mirrors `giantTiles.ts`'s `giantCrop`/`NATIVE_CANVAS_H`. */
export const GIANT_PART_NATIVE_CANVAS_H = 300;

const ISLAND_RADIUS = 5;
const ORIGIN: AxialCoord = { q: 0, r: 0 };
const VOLCANO_CENTER: AxialCoord = { q: -3, r: 1 };

// ---------------------------------------------------------------------------
// Deterministic hashing — no Math.random, so the island (and its tests) are
// exactly reproducible. FNV-1a-ish: cheap, fine avalanche for our purposes.
// ---------------------------------------------------------------------------

function hash32(q: number, r: number, salt: number): number {
  let h = 0x811c9dc5;
  for (const v of [q, r, salt]) {
    h ^= v | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** A hash of (q, r, salt) as a float in [0, 1) — `salt` picks an independent draw for the same hex (orientation, variant, delay, ...). */
function hashFloat(q: number, r: number, salt: number): number {
  return hash32(q, r, salt) / 0x100000000;
}

function hashInt(q: number, r: number, salt: number, count: number): number {
  return Math.floor(hashFloat(q, r, salt) * count);
}

const SALT = {
  landExtend: 1,
  kind: 2,
  livingVariant: 3,
  wastedVariant: 4,
  orientation: 5,
  delay: 6,
  beach: 7,
} as const;

// ---------------------------------------------------------------------------
// Hex enumeration + rotation
// ---------------------------------------------------------------------------

function hexesInDistance(center: AxialCoord, radius: number): AxialCoord[] {
  const out: AxialCoord[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) out.push({ q: center.q + dq, r: center.r + dr });
  }
  return out;
}

/** Rotates an axial coord by `steps` x 60 degrees about the origin (cube-coordinate rotation) — used to spin the whole island's layout for `buildIsland`'s rotation argument. */
export function rotateAxial(c: AxialCoord, steps: number): AxialCoord {
  const n = ((steps % 6) + 6) % 6;
  let x = c.q;
  let z = c.r;
  let y = -x - z;
  for (let i = 0; i < n; i++) {
    const nx = -z;
    const ny = -x;
    const nz = -y;
    x = nx;
    y = ny;
    z = nz;
  }
  return { q: x, r: z };
}

// ---------------------------------------------------------------------------
// Static classification — computed once, independent of rotation (kind,
// variant and orientation are properties of the hex itself; only screen
// position and the orientation *label* rotate with the viewer).
// ---------------------------------------------------------------------------

interface IslandHexRecord {
  q: number;
  r: number;
  kind: Exclude<IslandKind, 'utgard' | 'volcano'>;
  livingPrefix: string;
  livingSuffix: string;
  wastedPrefix: string;
  wastedSuffix: string;
  /**
   * The array index the renderer's own texture lookup expects for this
   * hex's living art (`textures.ts`'s `baseTextureFor`/`topTextureFor`
   * index into `TileTextures.coastalBase`/`.top[key]` by `Tile.variant`) —
   * derived from the exact same hash `livingArt` used to build
   * `livingPrefix`/`livingSuffix`'s `_variantNNN` suffix, so the DOM-era
   * frame name and the renderer-era `Tile.variant` can never drift apart.
   * See `livingArt`'s own doc comment for why the hash value already *is*
   * the array index, no further translation needed.
   */
  livingVariantIndex: number;
  /** `livingVariantIndex`'s wasted-state counterpart — see `wastedArt`. */
  wastedVariantIndex: number;
  baseOrientIndex: number;
  turnsAt: number;
  delay: number;
}

const UTGARD_HEXES = hexesInDistance(ORIGIN, 1);
const VOLCANO_HEXES = hexesInDistance(VOLCANO_CENTER, 1);
const GIANT_KEYS = new Set([...UTGARD_HEXES, ...VOLCANO_HEXES].map(coordKey));

function isGiantHex(c: AxialCoord): boolean {
  return GIANT_KEYS.has(coordKey(c));
}

let cachedHexes: IslandHexRecord[] | null = null;

function classifyIsland(): IslandHexRecord[] {
  if (cachedHexes) return cachedHexes;

  const all = hexesInDistance(ORIGIN, ISLAND_RADIUS).filter((c) => !isGiantHex(c));

  // Pass 1: land vs not-land, purely from distance + a hash extending the
  // core out to a ragged edge at d===4.
  // The giants' own hexes are land too: without them here, every hex
  // touching a flower would read as shoreline and turn to sand.
  const landKeys = new Set<string>(GIANT_KEYS);
  for (const c of all) {
    const d = hexDistance(c, ORIGIN);
    const land = d <= 3 || (d === 4 && hashFloat(c.q, c.r, SALT.landExtend) < 0.6);
    if (land) landKeys.add(coordKey(c));
  }

  const utgardCentreY = isoGridPosition(ORIGIN, TILE_W, TOP_FACE_H).y;

  const records: IslandHexRecord[] = [];
  for (const c of all) {
    const d = hexDistance(c, ORIGIN);
    const isLand = landKeys.has(coordKey(c));
    // A patchy beach rather than a full ring of it: only about half the
    // shoreline hexes are sand, the rest run green down to the water.
    const isEdge =
      isLand && neighbors(c).some((n) => !landKeys.has(coordKey(n))) && hashFloat(c.q, c.r, SALT.beach) < 0.45;

    let kind: IslandHexRecord['kind'];
    if (isLand) {
      if (isEdge) {
        kind = 'sand';
      } else {
        // Never forest/mountain at d===2 (the ring immediately around the
        // Utgard flower, radius 1): over the full 0..5 rotation sweep every
        // hex in that ring lands "south of Utgard, adjacent to the flower"
        // at some rotation, so it stays grass for all of them.
        const northOfUtgard = isoGridPosition(c, TILE_W, TOP_FACE_H).y < utgardCentreY;
        const nearVolcano = hexDistance(c, VOLCANO_CENTER) <= 3;
        const roll = hashFloat(c.q, c.r, SALT.kind);
        if (d <= 2) {
          kind = 'grass';
        } else if (northOfUtgard && nearVolcano) {
          kind = roll < 0.15 ? 'grass' : roll < 0.6 ? 'forest' : 'mountain';
        } else {
          kind = roll < 0.75 ? 'grass' : roll < 0.9 ? 'forest' : 'mountain';
        }
      }
    } else {
      const coastal = neighbors(c).some((n) => landKeys.has(coordKey(n)));
      kind = coastal ? 'coast' : 'sea';
    }

    const turnsAt = isLand ? 2 : kind === 'coast' ? 3 : 4;

    const living = livingArt(kind, c);
    const wasted = wastedArt(kind, c);

    records.push({
      q: c.q,
      r: c.r,
      kind,
      livingPrefix: living.prefix,
      livingSuffix: living.suffix,
      livingVariantIndex: living.index,
      wastedPrefix: wasted.prefix,
      wastedSuffix: wasted.suffix,
      wastedVariantIndex: wasted.index,
      baseOrientIndex: hashInt(c.q, c.r, SALT.orientation, 6),
      turnsAt,
      delay: hashFloat(c.q, c.r, SALT.delay),
    });
  }

  cachedHexes = records;
  return records;
}

/**
 * A hex's living-state frame name pieces (`${prefix}_<O>${suffix}`, the
 * orientation slotting between them), plus the numeric `index` that same
 * hash resolves to.
 *
 * `index` is deliberately not just "whatever the suffix says" re-parsed
 * back out — it's the exact value handed to `hashInt`, which
 * `textures.ts`'s own numbering convention (`explicitIndexOf`, see its doc
 * comment) already makes equal to the art pack's own array index: a plain
 * unsuffixed frame is index 0, and `_variantNNN` is index `NNN + 1` — so
 * `index === 0` here always means "no suffix" and `index === n` always
 * means `_variant${n - 1}`, for every one of this function's cases. That
 * identity is what lets `buildIslandTiles` (the renderer-driven path) use
 * `index` directly as `Tile.variant` and still land on the exact same
 * frame `buildIsland` (the older DOM path, driven by the suffix string
 * instead) would have drawn — one hash, two consumers, instead of the
 * frame-name and the variant-index risking drifting apart if each derived
 * its own answer from a re-rolled hash.
 */
function livingArt(kind: IslandHexRecord['kind'], c: AxialCoord): { prefix: string; suffix: string; index: number } {
  switch (kind) {
    case 'grass': {
      const n = hashInt(c.q, c.r, SALT.livingVariant, 4); // '', variant000..002
      return { prefix: 'grasstile', suffix: n === 0 ? '' : `_variant${String(n - 1).padStart(3, '0')}`, index: n };
    }
    case 'forest': {
      const n = hashInt(c.q, c.r, SALT.livingVariant, 3); // '', variant000..001
      return { prefix: 'foresttile', suffix: n === 0 ? '' : `_variant${String(n - 1).padStart(3, '0')}`, index: n };
    }
    case 'sand':
      return { prefix: 'sandtile', suffix: '', index: 0 };
    case 'mountain':
      // Fixed at `_level000` — `mountaintile`'s only rung, so the index a
      // level-suffixed family (`explicitIndexOf`'s `LEVEL_RE` branch) reads
      // is always 0 too, same as the unsuffixed families above.
      return { prefix: 'mountaintile', suffix: '_level000', index: 0 };
    case 'coast': {
      const n = hashInt(c.q, c.r, SALT.livingVariant, 3); // '', variant000..001
      return { prefix: 'coastalwatertile', suffix: n === 0 ? '' : `_variant${String(n - 1).padStart(3, '0')}`, index: n };
    }
    case 'sea':
      return { prefix: 'watertile', suffix: '', index: 0 };
  }
}

/** Same shape as `livingArt`, for the wasted counterpart. */
function wastedArt(kind: IslandHexRecord['kind'], c: AxialCoord): { prefix: string; suffix: string; index: number } {
  switch (kind) {
    case 'grass': {
      const n = hashInt(c.q, c.r, SALT.wastedVariant, 6); // '', variant001..005
      return { prefix: 'wasteland', suffix: n === 0 ? '' : `_variant${String(n).padStart(3, '0')}`, index: n };
    }
    case 'forest': {
      const n = hashInt(c.q, c.r, SALT.wastedVariant, 2); // '', variant001
      return { prefix: 'deadforest', suffix: n === 0 ? '' : '_variant001', index: n };
    }
    case 'sand': {
      const n = hashInt(c.q, c.r, SALT.wastedVariant, 2); // '', variant001
      return { prefix: 'blacksand', suffix: n === 0 ? '' : '_variant001', index: n };
    }
    case 'mountain':
      return { prefix: 'mountaintile_jagged', suffix: '_level000', index: 0 };
    case 'coast': {
      const n = hashInt(c.q, c.r, SALT.wastedVariant, 4); // '', variant000..002
      return { prefix: 'blacksandcoast', suffix: n === 0 ? '' : `_variant${String(n - 1).padStart(3, '0')}`, index: n };
    }
    case 'sea':
      // Open (non-coastal) water bordering a wasted island renders as
      // `taintedwater` — see `textures.ts`'s `WASTED_TEXTURE_KEY.sea` for
      // the renderer-side mapping this frame name mirrors. `taintedwater`
      // has exactly one frame per orientation (no `_variantNNN` at all), so
      // index is always 0, same as its living `watertile` counterpart.
      return { prefix: 'taintedwater', suffix: '', index: 0 };
  }
}

function orientationAt(baseIndex: number, rotation: number): TileOrientation {
  const idx = (((baseIndex + rotation) % 6) + 6) % 6;
  return TILE_ORIENTATIONS[idx]!;
}

// ---------------------------------------------------------------------------
// Placements (rotation-dependent)
// ---------------------------------------------------------------------------

export function buildIsland(rotation: number): IslandPlacement[] {
  const topLayer: IslandPlacement[] = [];
  const baseLayer: IslandPlacement[] = [];

  for (const record of classifyIsland()) {
    const original = { q: record.q, r: record.r };
    const rotated = rotateAxial(original, rotation);
    const orientation = orientationAt(record.baseOrientIndex, rotation);
    const g = isoGridPosition(rotated, TILE_W, TOP_FACE_H);
    const key = `${record.kind}:${coordKey(original)}`;

    topLayer.push({
      key,
      kind: record.kind,
      livingFrame: `${record.livingPrefix}_${orientation}${record.livingSuffix}`,
      wastedFrame: `${record.wastedPrefix}_${orientation}${record.wastedSuffix}`,
      category: 'showcase',
      x: g.x,
      y: g.y - TOP_FACE_Y,
      depth: g.y,
      turnsAt: record.turnsAt,
      delay: record.delay,
      hexes: [rotated],
      layer: 'top',
      hoverGroup: key,
      giantTopPart: false,
    });
  }

  for (const p of giantPlacements('utgard', ORIGIN, 'giantshrine', 'giantutgard', 'buildings-static', 1, rotation)) {
    (p.layer === 'base' ? baseLayer : topLayer).push(p);
  }
  for (const p of giantPlacements(
    'volcano',
    VOLCANO_CENTER,
    'giantmountain',
    'giantvolcano_wasted',
    'terrain',
    2,
    rotation,
  )) {
    (p.layer === 'base' ? baseLayer : topLayer).push(p);
  }

  // One painter's pass over every placement, by hex depth. An ordinary tile
  // is a single pre-composited frame (its ground and its props in one), so
  // it can't be split into the game's terrainBase/terrainTop layers the way
  // a giant can: drawing all giant ground plates first would let the tiles
  // behind a giant paint their dirt skirts over its plates. Sorting ground
  // with ground by depth keeps every skirt under the tile in front of it,
  // and within one hex the giant's plate goes down before its top part.
  const LAYER_ORDER = { base: 0, top: 1 } as const;
  return [...baseLayer, ...topLayer].sort(
    (a, b) => a.depth - b.depth || positionOf(a).x - positionOf(b).x || LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer],
  );
}

// Depth tie-break needs a placement's own (single) hex's x.
function positionOf(p: IslandPlacement): { x: number } {
  return isoGridPosition(p.hexes[0]!, TILE_W, TOP_FACE_H);
}

/**
 * Exposed only for wastedIsland.test.ts: the raw per-hex classification
 * `buildIsland`/`buildIslandTiles` both build on, so a test can check
 * `buildIslandTiles`'s `Tile.variant` directly against the index it was
 * derived from (`record.livingVariantIndex`/`wastedVariantIndex`) instead of
 * reverse-parsing a resolved frame name's suffix — which, per
 * `livingArt`/`wastedArt`'s own doc comment, isn't even one consistent
 * convention across families (a gappy wasted family's `_variantNNN` numbers
 * from 1, not 0).
 */
export function islandHexRecordsForTests(): readonly IslandHexRecord[] {
  return classifyIsland();
}

// ---------------------------------------------------------------------------
// Tile[] for the real HexMapRenderer (WastedIsland.vue) — a fixed hand-built
// world for `StaticWorldModel`, replacing `buildIsland`'s own hand-positioned
// DOM sprites. Reuses exactly the same classification (`classifyIsland`) and
// giant placement (`giantCoverage`) `buildIsland` does, so the two can never
// disagree about which hex is which kind or which giant covers what — only
// how each hex gets *drawn* differs (the renderer's textures.ts lookups
// instead of a resolved atlas frame positioned by hand).
// ---------------------------------------------------------------------------

/** One giant's placement, independent of rotation — mirrors `giantPlacements`'s own two call sites in `buildIsland` (kept as a small table here rather than a third near-duplicate function, since a `Tile`'s giant field needs less than a DOM placement does: no top-part frame name/category, no ground-plate placement). */
const GIANT_DEFS: readonly {
  kind: 'utgard' | 'volcano';
  center: AxialCoord;
  livingFamily: NonNullable<Tile['giant']>['family'];
  wastedFamily: NonNullable<Tile['giant']>['family'];
  turnsAt: number;
}[] = [
  { kind: 'utgard', center: ORIGIN, livingFamily: 'giantshrine', wastedFamily: 'giantutgard', turnsAt: 1 },
  { kind: 'volcano', center: VOLCANO_CENTER, livingFamily: 'giantmountain', wastedFamily: 'giantvolcano', turnsAt: 2 },
];

/**
 * `buildIslandTiles`'s per-hex bookkeeping that isn't itself a `Tile` field —
 * the caption identity (`kind`/`turnsAt`) and cross-fade stagger (`delay`) a
 * hovered/rebuilding hex needs. Cached per rotation (`classifyIsland` and
 * `giantCoverage` are already pure/cheap, but `WastedIsland.vue` calls
 * `islandHexInfo`/`delayFraction` once per hover-move and once per rebuilt
 * hex respectively, and re-deriving the whole island's rotation from scratch
 * on every mouse move would be needless work for data that only actually
 * changes when the rotate buttons are clicked).
 */
interface RotatedHexInfo {
  kind: IslandKind;
  turnsAt: number;
  delay: number;
}

const rotatedInfoCache = new Map<number, Map<string, RotatedHexInfo>>();

function rotatedInfoFor(rotation: number): Map<string, RotatedHexInfo> {
  const cached = rotatedInfoCache.get(rotation);
  if (cached) return cached;

  const map = new Map<string, RotatedHexInfo>();
  for (const record of classifyIsland()) {
    const rotated = rotateAxial({ q: record.q, r: record.r }, rotation);
    map.set(coordKey(rotated), { kind: record.kind, turnsAt: record.turnsAt, delay: record.delay });
  }
  for (const def of GIANT_DEFS) {
    const rotatedCenter = rotateAxial(def.center, rotation);
    for (const { coord } of giantCoverage(rotatedCenter)) {
      map.set(coordKey(coord), { kind: def.kind, turnsAt: def.turnsAt, delay: 0 });
    }
  }
  rotatedInfoCache.set(rotation, map);
  return map;
}

/** The (rotated) hovered hex's caption identity — `kind`/`turnsAt` are exactly what `WastedIsland.vue`'s old `tileNameKey`/`captionText` needed from an `IslandPlacement`, now looked up by coordinate instead of read off a DOM placement object. `undefined` for a coordinate outside the island (open water past the crop, or between rebuilds). */
export function islandHexInfo(rotation: number, coord: AxialCoord): { kind: IslandKind; turnsAt: number } | undefined {
  const info = rotatedInfoFor(rotation).get(coordKey(coord));
  return info ? { kind: info.kind, turnsAt: info.turnsAt } : undefined;
}

/** This (rotated) hex's per-hex cross-fade stagger, 0..1 — 0 for a giant hex (its 14 old DOM placements always carried `delay: 0` too) or a coordinate outside the island. */
export function delayFraction(rotation: number, coord: AxialCoord): number {
  return rotatedInfoFor(rotation).get(coordKey(coord))?.delay ?? 0;
}

/**
 * The island as a fixed `Tile[]` for `StaticWorldModel` — everything
 * `HexMapRenderer` needs to draw it exactly like an in-game island: terrain,
 * orientation, the living/wasted art variant index (`Tile.variant` — see
 * `livingArt`/`wastedArt`'s own doc comment for why the same hash already
 * gives the renderer's own array index), and, for the two giants, `Tile.giant`.
 *
 * `stage` decides `Tile.wasted` per hex (`stage >= record.turnsAt`), so
 * calling this again after the blight slider moves rebuilds the whole
 * island's wasted/living split in one pass — `WastedIsland.vue` feeds the
 * result straight into `StaticWorldModel.setTiles` and then
 * `HexMapRenderer.forceRebuild`.
 *
 * Every water hex renders as open sea (`taintedwater` once wasted — see
 * `wastedArt`'s `'sea'` case) except the ring the docs' own classification
 * already calls `'coast'`, which renders as `isCoastalWater` (coastalwater/
 * blacksandcoast) — same water/coast split the real game's own
 * `WorldModel.getTile` draws, just fixed by hand here instead of derived
 * from a seed.
 */
export function buildIslandTiles(rotation: number, stage: number): Tile[] {
  const tiles: Tile[] = [];

  for (const record of classifyIsland()) {
    const rotated = rotateAxial({ q: record.q, r: record.r }, rotation);
    const wasted = stage >= record.turnsAt;
    tiles.push({
      q: rotated.q,
      r: rotated.r,
      terrain: record.kind === 'coast' ? 'sea' : record.kind,
      isCoastalWater: record.kind === 'coast' ? true : undefined,
      wasted,
      orientation: orientationAt(record.baseOrientIndex, rotation),
      variant: wasted ? record.wastedVariantIndex : record.livingVariantIndex,
    });
  }

  for (const def of GIANT_DEFS) {
    const rotatedCenter = rotateAxial(def.center, rotation);
    const orientation = orientationAt(5, rotation); // giants render at a fixed base camera ('SE') — mirrors giantPlacements.
    const wasted = stage >= def.turnsAt;
    for (const { coord, part } of giantCoverage(rotatedCenter)) {
      tiles.push({
        q: coord.q,
        r: coord.r,
        terrain: 'grass',
        wasted,
        orientation,
        giant: { family: wasted ? def.wastedFamily : def.livingFamily, anchor: rotatedCenter, part, orientation },
      });
    }
  }

  return tiles;
}

/**
 * The 14 per-hex placements (7 ground-plate bases + 7 top parts) that draw
 * one giant, replacing its old single pre-composited `showcase` frame — see
 * this module's doc comment. `livingFamily`/`wastedFamily` are the giant's
 * `<family>_<O>_level000_part<DIR>` top-part families (e.g. `giantshrine` /
 * `giantutgard`); `topCategory` is the atlas category those parts live in
 * (`buildings-static` for the Utgard flower, `terrain` for the volcano).
 */
function giantPlacements(
  kind: 'utgard' | 'volcano',
  center: AxialCoord,
  livingFamily: string,
  wastedFamily: string,
  topCategory: string,
  turnsAt: number,
  rotation: number,
): IslandPlacement[] {
  const rotatedCenter = rotateAxial(center, rotation);
  const orientation = orientationAt(5, rotation); // giants render at a fixed base camera ('SE')
  const hoverGroup = kind;

  const out: IslandPlacement[] = [];
  for (const { coord, part } of giantCoverage(rotatedCenter)) {
    // The pre-rotation identity of this covered hex, for a placement key
    // that's stable across rotations (mirrors ordinary tiles' own key,
    // which is keyed on the un-rotated coordinate).
    const original = rotateAxial(coord, -rotation);
    const g = isoGridPosition(coord, TILE_W, TOP_FACE_H);
    const keyBase = `${kind}:${coordKey(original)}`;

    out.push({
      key: `${keyBase}:base`,
      kind,
      livingFrame: `grasstile_${orientation}`,
      wastedFrame: `wasteland_${orientation}`,
      category: 'showcase',
      x: g.x,
      y: g.y - TOP_FACE_Y,
      depth: g.y,
      turnsAt,
      delay: 0,
      hexes: [coord],
      layer: 'base',
      hoverGroup,
      giantTopPart: false,
    });

    out.push({
      key: `${keyBase}:top`,
      kind,
      livingFrame: `${livingFamily}_${orientation}_level000_part${part}`,
      wastedFrame: `${wastedFamily}_${orientation}_level000_part${part}`,
      category: topCategory,
      x: g.x,
      y: g.y - TOP_FACE_Y,
      depth: g.y,
      turnsAt,
      delay: 0,
      hexes: [coord],
      layer: 'top',
      hoverGroup,
      giantTopPart: true,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Frame resolution
// ---------------------------------------------------------------------------

const VARIANT_SUFFIX_RE = /_variant\d{3}$/;

/**
 * Resolves an island frame name to a real `AtlasFrameRect` in `category`
 * (`"showcase"` for every ground/land tile, or a giant top part's own
 * `"buildings-static"`/`"terrain"`), with a defensive fallback chain for an
 * atlas rename/variant-count change: drop the `_variantNNN` suffix, then
 * force orientation `SE`. Never throws — a name that resolves nowhere
 * returns `undefined` and the caller skips that sprite rather than crashing
 * the page.
 */
export function resolveIslandFrame(name: string, category: string): AtlasFrameRect | undefined {
  const direct = findAtlasFrame(category, name);
  if (direct) return direct;

  const withoutVariant = name.replace(VARIANT_SUFFIX_RE, '');
  if (withoutVariant !== name) {
    const frame = findAtlasFrame(category, withoutVariant);
    if (frame) return frame;
  }

  const seOriented = withOrientation(withoutVariant);
  if (seOriented !== withoutVariant) {
    const frame = findAtlasFrame(category, seOriented);
    if (frame) return frame;
  }
  return undefined;
}

function withOrientation(name: string): string {
  return name
    .split('_')
    .map((part) => ((TILE_ORIENTATIONS as readonly string[]).includes(part) ? 'SE' : part))
    .join('_');
}

/** True if `name` resolves in `category` without needing `resolveIslandFrame`'s fallback chain — used by tests to guard against a silent atlas rename. */
export function resolvesDirectly(name: string, category: string): boolean {
  return findAtlasFrame(category, name) !== undefined;
}

/**
 * Resolves a giant top part's frame name (e.g.
 * `giantshrine_SE_level000_partC`) to its `buildings-anim` clip, when one
 * exists — a clip's name is exactly its static top-part frame's name, so
 * this is `resolveIslandFrame`'s sibling for the `"buildings-anim"`
 * category rather than a placement's own `category` (clips live on their
 * own atlas pages, separate from the static `buildings-static`/`terrain`
 * frame they replace — see this module's doc comment and
 * `HexMapRenderer.ts`'s `giantTopAnimFor`). Only the SE-orientation
 * fallback leg applies here (a giant top part's name never carries a
 * `_variantNNN` suffix). `undefined` for a family/part with no animated
 * clip (e.g. `giantutgard`, `giantmountain`) — the caller then keeps the
 * static frame, same graceful-degradation contract `resolveIslandFrame`
 * has.
 */
export function resolveIslandClip(
  name: string,
): (AtlasClip & { frameRects: AtlasFrameRect[]; restRect?: AtlasFrameRect }) | undefined {
  const direct = findAtlasClip('buildings-anim', name);
  if (direct) return direct;
  const seOriented = withOrientation(name);
  if (seOriented !== name) return findAtlasClip('buildings-anim', seOriented);
  return undefined;
}

/** Whether `family` has an animated clip for *any* of its 7 parts at `orientation` — used to decide whether a giant card's hover-to-animate affordance applies at all (e.g. `giantvolcano_wasted` does, `giantutgard` doesn't). */
export function giantFamilyHasClip(family: string, orientation: TileOrientation): boolean {
  return GIANT_PARTS.some((part) => resolveIslandClip(`${family}_${orientation}_level000_part${part}`) !== undefined);
}

/** One resolved sprite's on-canvas box, in the island's showcase-pixel space — the shared shape `tileSpriteBox`/`giantTopPartBox` return and `WastedIsland.vue`/`AnimatedGiant.vue` position an element with. */
export interface SpriteGeom {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * An ordinary tile's (or a giant's own ground plate's) box: `rect` drawn at
 * its native size, offset within `origin`'s 400x600 source canvas by its
 * own `spriteSourceSize` trim offset.
 */
export function tileSpriteBox(origin: { x: number; y: number }, rect: AtlasFrameRect): SpriteGeom {
  return {
    left: origin.x + rect.spriteSourceSize.x,
    top: origin.y + rect.spriteSourceSize.y,
    width: rect.frame.w,
    height: rect.frame.h,
  };
}

/**
 * A giant top part's box: 1x terrain/buildings-static art (native width
 * 200, height varies per part) rendered at 2x into `origin`'s 400x600
 * source canvas, its bottom edge anchored to that canvas's own bottom
 * (mirrors the game's own `giantCrop`: the part's extra height rises
 * *above* the canvas rather than extending below it). `rect` may be the
 * part's static frame, one frame of its `buildings-anim` clip, or the
 * clip's rest image — each is trimmed on its own (a clip frame's
 * `spriteSourceSize` routinely differs from its static frame's and from
 * its sibling frames'), so each needs its own box — see `giantClipBoxes`.
 */
export function giantTopPartBox(origin: { x: number; y: number }, rect: AtlasFrameRect): SpriteGeom {
  const top = origin.y + 2 * (GIANT_PART_NATIVE_CANVAS_H - rect.sourceSize.h) + 2 * rect.spriteSourceSize.y;
  return {
    left: origin.x + 2 * rect.spriteSourceSize.x,
    top,
    width: 2 * rect.frame.w,
    height: 2 * rect.frame.h,
  };
}


/**
 * Per-frame boxes for a giant top part's clip, anchored at `origin` the same
 * way as its static frame (`giantTopPartBox`). Each frame, and the rest
 * image, gets its own box from its own trim rect — the game's Pixi sprites
 * do the same through each texture's trim/orig, so drawing a frame into the
 * static frame's box instead stretches it (the wasted volcano's centre
 * frames are ~255px tall against a 393px static frame).
 */
export function giantClipBoxes(
  origin: { x: number; y: number },
  clip: { frameRects: AtlasFrameRect[]; restRect?: AtlasFrameRect },
): { frames: SpriteGeom[]; rest?: SpriteGeom } {
  return {
    frames: clip.frameRects.map((rect) => giantTopPartBox(origin, rect)),
    rest: clip.restRect ? giantTopPartBox(origin, clip.restRect) : undefined,
  };
}
