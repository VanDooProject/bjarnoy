// "Giant tiles": one art object spanning a centre hex plus its six
// neighbours (a 7-hex plate — the render side is documented in
// VanDooProject/3D_assets `docs/giant-tiles.md`; the game-side contract lives
// here and in WorldModel.placeGiant).
//
// The art pipeline (VanDooProject/3D_assets) renders the whole giant once per
// camera rotation and slices it into 7 per-hex TOP frames, one per covered
// hex, so each slice depth-sorts with `isoDepthKey(its own hex)` exactly like
// any other top sprite — no new draw-order logic needed. Only the top layer
// is replaced; each of the 7 hexes keeps its own normal terrain base sprite.
//
// Frame name contract: `<family>_<CAM>_level<NNN>_part<DIR>`, e.g.
// `giantmountain_SE_level000_partNE`. `<CAM>` is a `TileOrientation` (the
// orientation of the whole giant — every one of its 7 parts shares the
// anchor's orientation). `<DIR>` is a `GiantPart`: `C` for the anchor hex
// itself, or one of the six screen directions a covered neighbour hex sits
// in relative to the anchor (`GIANT_NEIGHBOR_PARTS`, derived from and
// verified against `isoGridPosition` — see `giantTiles.test.ts`).
//
// These frames deliberately bypass `classifyFamilyFrames`/`buildTileTextures`
// (textures.ts): that path indexes a family's frames by a numbered
// `variantNNN`/`levelNNN` suffix at the *end* of the name, and every part of
// one giant/level shares the same (or no) such suffix — feeding it through
// that path would collide all 7 parts onto index 0. Giants get their own
// lookup instead (`buildGiantTextures`/`giantTop`).
import type { AxialCoord } from '../hex/coords';
import { isoGridPosition, isoTopPoints, type Point } from '../hex/geometry';
import { TILE_ORIENTATIONS, type TileOrientation } from './types';

// Mirrors textures.ts's TILE_ART_NATIVE_H (300) — not imported from there to
// avoid a textures.ts <-> giantTiles.ts import cycle (textures.ts imports
// this module to build TileTextures.giants).
const NATIVE_CANVAS_H = 300;

/** One family's atlas frame, narrowed to what `classifyGiantFrames` needs — the same shape `textures.ts`'s `FamilyFrame` uses (kept as a local structural type here, not imported, to avoid a textures.ts <-> giantTiles.ts import cycle: textures.ts imports this module to build `TileTextures.giants`). */
export interface GiantFamilyFrame<T> {
  name: string;
  value: T;
}

/** A giant's own hex (`C`), or which screen direction a covered neighbour sits in relative to it. */
export type GiantPart = 'C' | 'N' | 'NE' | 'SE' | 'S' | 'SW' | 'NW';

/**
 * `neighbors()`'s (coords.ts) six axial deltas, translated to the screen
 * direction each lands in under this renderer's flat-top odd-q iso lattice
 * — index-for-index the same order as `neighbors()`/`NEIGHBOR_DIRS`, i.e.
 * axial `(1,0)` -> `SE`, `(1,-1)` -> `NE`, `(0,-1)` -> `N`, `(-1,0)` -> `NW`,
 * `(-1,1)` -> `SW`, `(0,1)` -> `S`.
 *
 * Derived from (and pixel-checked against) `isoGridPosition` in
 * `giantTiles.test.ts` rather than just asserted here: `isoGridPosition`
 * places a hex by column (`axialToOddQ().col`, which *is* the axial `q`) and
 * row, with odd columns sitting half a row lower on screen — so a neighbour
 * one column over lands either above or below the anchor's own row instead
 * of level with it, and only the neighbours with the *same* column
 * (`(0,-1)`/`(0,1)`) land a full row directly above/below.
 */
export const GIANT_NEIGHBOR_PARTS: readonly Exclude<GiantPart, 'C'>[] = ['SE', 'NE', 'N', 'NW', 'SW', 'S'];

export const GIANT_PARTS: readonly GiantPart[] = ['C', ...GIANT_NEIGHBOR_PARTS];

function isGiantPart(value: string): value is GiantPart {
  return (GIANT_PARTS as readonly string[]).includes(value);
}

/** One giant's frames, resolved per orientation + part. Generic over the resolved value for the same reason `ClassifiedFamily` is (see `textures.test.ts`) — unit-testable with plain strings, no Pixi dependency. */
export type GiantTextureMap<T> = Record<TileOrientation, Partial<Record<GiantPart, T>>>;

const GIANT_FRAME_RE = /_(NE|NW|SW|SE|E|W)_level\d{3}_part(C|N|NE|SE|S|SW|NW)$/;

/** Parses a giant frame name's orientation + part, or `null` if it doesn't match the `..._<CAM>_level<NNN>_part<DIR>` shape at all. */
export function parseGiantFrameName(name: string): { orientation: TileOrientation; part: GiantPart } | null {
  const match = GIANT_FRAME_RE.exec(name);
  if (!match) return null;
  const [, cam, dir] = match;
  if (!isGiantPart(dir)) return null;
  return { orientation: cam as TileOrientation, part: dir };
}

/**
 * Groups one giant family's frames (already filtered to that family, e.g.
 * via `framesOfFamily(atlas, 'giantmountain')`) into `GiantTextureMap` —
 * purely from each frame's own name, no Pixi/Texture dependency (mirrors
 * `classifyFamilyFrames`'s own split for the same reason: unit-testable with
 * plain strings — see `giantTiles.test.ts`).
 *
 * A frame whose name doesn't parse as a giant frame at all (shouldn't happen
 * for a family that only ever renders giants, but cheap to be defensive
 * about) is silently skipped rather than thrown on.
 */
export function classifyGiantFrames<T>(frames: GiantFamilyFrame<T>[]): GiantTextureMap<T> {
  const result = {} as GiantTextureMap<T>;
  for (const orientation of TILE_ORIENTATIONS) result[orientation] = {};
  for (const { name, value } of frames) {
    const parsed = parseGiantFrameName(name);
    if (!parsed) continue;
    result[parsed.orientation][parsed.part] = value;
  }
  return result;
}

/**
 * One `buildings-anim` clip narrowed to what `classifyGiantClips` needs — a
 * local structural type (not `AtlasClip` from `atlas.ts`) for the same
 * import-cycle reason `GiantFamilyFrame` is kept local: `textures.ts` imports
 * this module to build `TileTextures.giantAnims`.
 */
export interface GiantFamilyClip {
  family: string;
  orientation: string;
  giant_part?: string;
  frames: string[];
  fps: number;
  playback: 'loop' | 'pingpong';
}

/**
 * Groups one giant family's `buildings-anim` clips (already filtered to that
 * family) into a `GiantTextureMap`, purely from each clip's own
 * `orientation`/`giant_part` fields — no Pixi/Texture dependency, mirroring
 * `classifyGiantFrames`'s split of static frames for the same reason
 * (unit-testable with plain strings — see `giantTiles.test.ts`).
 *
 * `resolveFrame` resolves one clip frame name against the loaded atlas's
 * textures; a clip with any frame missing (a page that failed to parse) is
 * dropped entirely rather than partially resolved, same as
 * `classifyFamilyClips` in textures.ts. A clip whose `orientation` isn't a
 * `TileOrientation` or whose `giant_part` isn't a `GiantPart` is skipped —
 * shouldn't happen for a family that only ever renders giants, but cheap to
 * be defensive about (mirrors `classifyGiantFrames`'s own silent skip).
 */
export function classifyGiantClips<T>(
  clips: GiantFamilyClip[],
  resolveFrame: (name: string) => T | undefined,
): GiantTextureMap<{ textures: T[]; fps: number; playback: 'loop' | 'pingpong' }> {
  const result = {} as GiantTextureMap<{ textures: T[]; fps: number; playback: 'loop' | 'pingpong' }>;
  for (const orientation of TILE_ORIENTATIONS) result[orientation] = {};
  for (const clip of clips) {
    const orientation = clip.orientation as TileOrientation;
    if (!TILE_ORIENTATIONS.includes(orientation)) continue;
    if (!clip.giant_part || !isGiantPart(clip.giant_part)) continue;
    const frameValues = clip.frames.map(resolveFrame);
    if (frameValues.some((v) => v === undefined)) continue;
    result[orientation][clip.giant_part] = { textures: frameValues as T[], fps: clip.fps, playback: clip.playback };
  }
  return result;
}

/**
 * The top-layer value for one part of one giant family, or `undefined` if
 * there's no such frame (e.g. the real art hasn't landed yet — callers must
 * degrade gracefully). Generic over the resolved value for the same reason
 * `classifyGiantFrames` is — unit-testable with plain strings, no Pixi
 * dependency (`textures.ts`'s `giantTopTextureFor` is the real, `Texture`-
 * typed caller).
 */
export function giantTop<T>(
  giants: Partial<Record<string, GiantTextureMap<T>>>,
  family: string,
  orientation: TileOrientation,
  part: GiantPart,
): T | undefined {
  return giants[family]?.[orientation]?.[part];
}

/** One of a giant's 7 covered hexes, alongside the part it renders as. */
export interface GiantCoverage {
  coord: AxialCoord;
  part: GiantPart;
}

/**
 * The 7 hexes a giant placed at `anchor` covers, and which part each one
 * renders — the anchor itself (`C`) plus its six neighbours in
 * `neighbors()`/`GIANT_NEIGHBOR_PARTS` order. Pulled out of `WorldModel` so
 * both it and `HexMapRenderer`/tests can share one definition of "which
 * hexes does a giant at this anchor cover".
 */
export function giantCoverage(anchor: AxialCoord): GiantCoverage[] {
  // Inlines `neighbors()`'s own NEIGHBOR_DIRS (coords.ts) rather than
  // importing it, to keep the zip/part ordering visibly paired with
  // GIANT_NEIGHBOR_PARTS right here instead of two files apart.
  const deltas: AxialCoord[] = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  const out: GiantCoverage[] = [{ coord: anchor, part: 'C' }];
  for (let i = 0; i < deltas.length; i++) {
    out.push({ coord: { q: anchor.q + deltas[i].q, r: anchor.r + deltas[i].r }, part: GIANT_NEIGHBOR_PARTS[i] });
  }
  return out;
}

/**
 * `syncSpriteLayer`'s `crop` for a giant part's texture, from that texture's
 * own (untrimmed) native height alone.
 *
 * A giant frame is native width 200 (`TILE_ART_NATIVE_W`, same as every tile)
 * but height `H >= 300`, drawn so its BOTTOM edge lines up with the bottom of
 * the hex's normal 200x300 canvas — i.e. the extra height rises *above* the
 * canvas rather than extending below it. `syncSpriteLayer` already positions
 * a cropped sprite at `grid.y - TILE_TOPFACE_Y_OFFSET + cropOffsetY` where
 * `cropOffsetY` scales `crop.nativeY`, so a negative `nativeY` (this frame
 * starting `H - 300` px above where a normal tile's canvas would start) is
 * exactly what pushes the sprite up by that amount — no special-casing of
 * "full, non-sub texture" needed on top of what `splitLegacyTexture`'s crops
 * already exercise, since `syncSpriteLayer` only ever reads `nativeY`/
 * `nativeH`, never whether the texture itself is a sub-region of a larger one.
 */
export function giantCrop(nativeH: number): { nativeY: number; nativeH: number } {
  return { nativeY: NATIVE_CANVAS_H - nativeH, nativeH };
}

/** A polygon edge (world coords), in the winding order it was drawn — see `giantFootprintOutline`. */
interface Edge {
  a: Point;
  b: Point;
}

/**
 * Rounds a world-space point to a stable string key so two hexes' shared
 * edge (drawn independently, but landing on the same pixels by
 * `isoTopPoints`'s construction — they abut with no gaps or overlaps)
 * compares equal despite any floating-point noise from the two separate
 * `isoGridPosition` calls that produced it.
 */
function pointKey(p: Point): string {
  return `${Math.round(p.x * 1000)}:${Math.round(p.y * 1000)}`;
}

/**
 * The union outline (in the renderer's world coords, same space the normal
 * single-hex hover polygon is drawn in) of the 7 hexes a giant at `anchor`
 * covers — for highlighting a whole giant's footprint on hover instead of
 * just the one hex under the cursor (see HexMapRenderer's giant hover
 * layer). Generic over the giant family: it only reads `anchor` and the
 * tile geometry, never which family occupies it, so it works unchanged for
 * any future giant building.
 *
 * Every one of the 7 hexes' 6 edges is collected (42 half-edges total); an
 * edge shared by two of the hexes — walked in opposite directions by the
 * two polygons that share it, since both are traced in the same rotational
 * order — is dropped as interior. A hex-ring-of-6 around a centre hex isn't
 * just 6 spokes: consecutive ring hexes are also neighbours of *each other*,
 * so there are 12 shared edges (6 centre-to-neighbour, 6 neighbour-to-
 * neighbour around the ring), each removing one edge from each of the two
 * polygons that share it — 24 of the 42 half-edges, leaving the 18-edge
 * outer boundary that's chained into one closed loop below.
 */
export function giantFootprintOutline(anchor: AxialCoord, w: number, h: number): Point[] {
  const allEdges: Edge[] = [];
  for (const { coord } of giantCoverage(anchor)) {
    const grid = isoGridPosition(coord, w, h);
    const points = isoTopPoints(w, h).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
    for (let i = 0; i < points.length; i++) {
      allEdges.push({ a: points[i], b: points[(i + 1) % points.length] });
    }
  }

  const removed = new Set<number>();
  for (let i = 0; i < allEdges.length; i++) {
    if (removed.has(i)) continue;
    for (let j = i + 1; j < allEdges.length; j++) {
      if (removed.has(j)) continue;
      const shared = pointKey(allEdges[i].a) === pointKey(allEdges[j].b) && pointKey(allEdges[i].b) === pointKey(allEdges[j].a);
      if (shared) {
        removed.add(i);
        removed.add(j);
        break;
      }
    }
  }

  const boundary = allEdges.filter((_, i) => !removed.has(i));
  const byStartKey = new Map<string, Edge>();
  for (const edge of boundary) byStartKey.set(pointKey(edge.a), edge);

  const outline: Point[] = [];
  if (boundary.length === 0) return outline;
  const startKey = pointKey(boundary[0].a);
  let current: Edge | undefined = boundary[0];
  for (let guard = 0; current && guard <= boundary.length; guard++) {
    outline.push(current.a);
    const nextKey = pointKey(current.b);
    if (nextKey === startKey) break;
    current = byStartKey.get(nextKey);
  }
  return outline;
}
