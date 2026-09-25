// Pure data for the Wasted Lands docs page's "turning island" (WastedIsland.vue):
// a made-up island, not from a real world, whose hexes swap living art for
// wasted art as a blight-stage slider advances. No Vue/DOM dependency here —
// everything is plain data so it can be unit tested directly
// (wastedIsland.test.ts).
//
// The island lives on the same axial lattice as the real game
// (src/lib/hex/coords.ts, src/lib/hex/geometry.ts) and reuses the `showcase`
// atlas category's pre-composited, high-res frames (src/lib/map/atlas.ts) —
// the same source the docs' other art thumbnails use — for every ordinary
// land tile. A giant (the Utgard/volcano flowers) is the one exception: it
// draws exactly like the in-game map does — 7 normal `showcase` ground
// plates (one per covered hex, draw layer "base") plus 7 per-hex top parts
// from the runtime's own `buildings-static`/`terrain` atlas categories (draw
// layer "top", see `giantTiles.ts`) — rather than one pre-composited
// `showcase` giant frame, whose own raised ground plates' dirt side skirts
// would otherwise paint over the neighbouring island hexes.
import { coordKey, hexDistance, neighbors, type AxialCoord } from '../hex/coords';
import { isoGridPosition } from '../hex/geometry';
import { findAtlasFrame, type AtlasFrameRect } from '../map/atlas';
import { giantCoverage } from '../map/giantTiles';
import { TILE_ORIENTATIONS, type TileOrientation } from '../map/types';

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
const TOP_FACE_Y = 280;
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

    const [livingPrefix, livingSuffix] = livingArt(kind, c);
    const [wastedPrefix, wastedSuffix] = wastedArt(kind, c);

    records.push({
      q: c.q,
      r: c.r,
      kind,
      livingPrefix,
      livingSuffix,
      wastedPrefix,
      wastedSuffix,
      baseOrientIndex: hashInt(c.q, c.r, SALT.orientation, 6),
      turnsAt,
      delay: hashFloat(c.q, c.r, SALT.delay),
    });
  }

  cachedHexes = records;
  return records;
}

/** `[framePrefix, frameSuffix]` for a living hex's frame name (orientation slots between them): `${prefix}_<O>${suffix}`. */
function livingArt(kind: IslandHexRecord['kind'], c: AxialCoord): [string, string] {
  switch (kind) {
    case 'grass': {
      const n = hashInt(c.q, c.r, SALT.livingVariant, 4); // '', variant000..002
      return ['grasstile', n === 0 ? '' : `_variant${String(n - 1).padStart(3, '0')}`];
    }
    case 'forest': {
      const n = hashInt(c.q, c.r, SALT.livingVariant, 3); // '', variant000..001
      return ['foresttile', n === 0 ? '' : `_variant${String(n - 1).padStart(3, '0')}`];
    }
    case 'sand':
      return ['sandtile', ''];
    case 'mountain':
      return ['mountaintile', '_level000'];
    case 'coast': {
      const n = hashInt(c.q, c.r, SALT.livingVariant, 3); // '', variant000..001
      return ['coastalwatertile', n === 0 ? '' : `_variant${String(n - 1).padStart(3, '0')}`];
    }
    case 'sea':
      return ['watertile', ''];
  }
}

/** Same shape as `livingArt`, for the wasted counterpart. */
function wastedArt(kind: IslandHexRecord['kind'], c: AxialCoord): [string, string] {
  switch (kind) {
    case 'grass': {
      const n = hashInt(c.q, c.r, SALT.wastedVariant, 6); // '', variant001..005
      return ['wasteland', n === 0 ? '' : `_variant${String(n).padStart(3, '0')}`];
    }
    case 'forest': {
      const n = hashInt(c.q, c.r, SALT.wastedVariant, 2); // '', variant001
      return ['deadforest', n === 0 ? '' : '_variant001'];
    }
    case 'sand': {
      const n = hashInt(c.q, c.r, SALT.wastedVariant, 2); // '', variant001
      return ['blacksand', n === 0 ? '' : '_variant001'];
    }
    case 'mountain':
      return ['mountaintile_jagged', '_level000'];
    case 'coast': {
      const n = hashInt(c.q, c.r, SALT.wastedVariant, 4); // '', variant000..002
      return ['blacksandcoast', n === 0 ? '' : `_variant${String(n - 1).padStart(3, '0')}`];
    }
    case 'sea':
      return ['taintedwater', ''];
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

export const GIANT_HEXES_FOR_TESTS = {
  utgard: UTGARD_HEXES,
  volcano: VOLCANO_HEXES,
};
