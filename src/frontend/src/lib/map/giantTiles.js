import { hexUnionOutline } from '../hex/geometry';
import { TILE_ORIENTATIONS } from './types';
// Mirrors textures.ts's TILE_ART_NATIVE_H (300) — not imported from there to
// avoid a textures.ts <-> giantTiles.ts import cycle (textures.ts imports
// this module to build TileTextures.giants).
const NATIVE_CANVAS_H = 300;
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
export const GIANT_NEIGHBOR_PARTS = ['SE', 'NE', 'N', 'NW', 'SW', 'S'];
export const GIANT_PARTS = ['C', ...GIANT_NEIGHBOR_PARTS];
function isGiantPart(value) {
    return GIANT_PARTS.includes(value);
}
const GIANT_FRAME_RE = /_(NE|NW|SW|SE|E|W)_level\d{3}_part(C|N|NE|SE|S|SW|NW)$/;
/** Parses a giant frame name's orientation + part, or `null` if it doesn't match the `..._<CAM>_level<NNN>_part<DIR>` shape at all. */
export function parseGiantFrameName(name) {
    const match = GIANT_FRAME_RE.exec(name);
    if (!match)
        return null;
    const [, cam, dir] = match;
    if (!isGiantPart(dir))
        return null;
    return { orientation: cam, part: dir };
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
export function classifyGiantFrames(frames) {
    const result = {};
    for (const orientation of TILE_ORIENTATIONS)
        result[orientation] = {};
    for (const { name, value } of frames) {
        const parsed = parseGiantFrameName(name);
        if (!parsed)
            continue;
        result[parsed.orientation][parsed.part] = value;
    }
    return result;
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
export function classifyGiantClips(clips, resolveFrame) {
    const result = {};
    for (const orientation of TILE_ORIENTATIONS)
        result[orientation] = {};
    for (const clip of clips) {
        const orientation = clip.orientation;
        if (!TILE_ORIENTATIONS.includes(orientation))
            continue;
        if (!clip.giant_part || !isGiantPart(clip.giant_part))
            continue;
        const frameValues = clip.frames.map(resolveFrame);
        if (frameValues.some((v) => v === undefined))
            continue;
        // An overlay clip's frames are parts-only — without its rest image
        // resolving too, drawing them alone would show a half-built giant, so
        // this drops the whole clip and falls back to the static frame, same as
        // any frame failing to resolve above.
        let rest;
        if (clip.overlay) {
            if (!clip.rest)
                continue;
            rest = resolveFrame(clip.rest);
            if (rest === undefined)
                continue;
        }
        result[orientation][clip.giant_part] = { textures: frameValues, fps: clip.fps, playback: clip.playback, pause: clip.pause ?? 0, rest };
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
export function giantTop(giants, family, orientation, part) {
    return giants[family]?.[orientation]?.[part];
}
/**
 * The 7 hexes a giant placed at `anchor` covers, and which part each one
 * renders — the anchor itself (`C`) plus its six neighbours in
 * `neighbors()`/`GIANT_NEIGHBOR_PARTS` order. Pulled out of `WorldModel` so
 * both it and `HexMapRenderer`/tests can share one definition of "which
 * hexes does a giant at this anchor cover".
 */
export function giantCoverage(anchor) {
    // Inlines `neighbors()`'s own NEIGHBOR_DIRS (coords.ts) rather than
    // importing it, to keep the zip/part ordering visibly paired with
    // GIANT_NEIGHBOR_PARTS right here instead of two files apart.
    const deltas = [
        { q: 1, r: 0 },
        { q: 1, r: -1 },
        { q: 0, r: -1 },
        { q: -1, r: 0 },
        { q: -1, r: 1 },
        { q: 0, r: 1 },
    ];
    const out = [{ coord: anchor, part: 'C' }];
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
export function giantCrop(nativeH) {
    return { nativeY: NATIVE_CANVAS_H - nativeH, nativeH };
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
 * Delegates the actual edge-cancellation to `hexUnionOutline`
 * (hex/geometry.ts), which is generic over any hex set — see its own doc
 * comment for how the 42 half-edges of the 7 hexes collapse to the 18-edge
 * outer boundary.
 */
export function giantFootprintOutline(anchor, w, h) {
    return hexUnionOutline(giantCoverage(anchor).map((c) => c.coord), w, h);
}
