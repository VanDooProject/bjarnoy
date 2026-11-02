// The river flow layer at runtime — docs/design/water-shader.md §4.4d.
//
// `build/waterDryMasks.ts` bakes a river water mask per river frame
// (`virtual:river-water-masks`). This file decodes that atlas once, turns a
// frame's mask into a ripple cell (riverFlow.ts) for the tile's downstream edge,
// and draws the cells, placed where the tile art is drawn, into one render
// texture covering the water mask's world rect. The water shader samples it
// with the same UVs as the water mask and draws the moving ripple crests on the
// river pixels.
import { BufferImageSource, Texture, type Renderer } from 'pixi.js';
import type { RiverTile, BogTile, TileOrientation } from '../types';
import { topFaceEdgeIndex } from '../riverPath';
import { SOURCE_W, type DryMaskFrame, type WaterDryMasksData } from './dryMaskCore';
import { dryCellWorldRect, MaskRenderTarget, type MaskPlacement } from './waterDryMask';
import { buildBankContext, computeRiverRipple, topFacePolygonTexels, type PlacedMask } from './riverFlow';

/** One river or bog-creek hex's base art, as drawn, and where its water goes. */
export interface RiverFlowEntry {
  /** The base art texture; its `label` is the atlas frame name. */
  texture: Texture;
  /** The sprite's top-left in world space. */
  x: number;
  y: number;
  /** The downstream side. */
  outDirection: TileOrientation;
  /** The upstream sides (none for a spring). */
  inDirections: readonly TileOrientation[];
  /** The side the flow fades away from, so the lake of a bog lake mouth stays still. */
  fadeDirection?: TileOrientation;
  /** The river hex behind each in and out edge (its base art's frame name and sprite position), when there is one. */
  neighbours?: { direction: TileOrientation; name: string; x: number; y: number }[];
}

/**
 * Where the water of a hex goes, from the data: a river's `outDirection` (a mouth without one flows towards `seaDirection`),
 * a bog creek's, creek spring's or lake mouth's. `null` for hexes that have no flow: lava streams, springs without an
 * out edge, plain bog and lake hexes. A lake mouth fades away from its creek edge (the one of in/out that is not a lake edge).
 */
export function riverFlowOf(
  river: RiverTile | undefined,
  bog: BogTile | undefined,
  seaDirection: TileOrientation | null,
): { outDirection: TileOrientation; inDirections: readonly TileOrientation[]; fadeDirection?: TileOrientation } | null {
  if (river) {
    if (river.wasted) return null;
    const outDirection = river.outDirection ?? (river.shape === 'mouth' ? seaDirection : null);
    return outDirection ? { outDirection, inDirections: river.inDirections } : null;
  }
  if (bog && (bog.kind === 'creek' || bog.kind === 'creekspring' || bog.kind === 'mouth') && bog.outDirection) {
    if (bog.kind !== 'mouth') return { outDirection: bog.outDirection, inDirections: bog.inDirections };
    const creekEdge = [bog.inDirections[0], bog.outDirection].find((d) => d !== undefined && !bog.waterEdges.includes(d));
    return { outDirection: bog.outDirection, inDirections: bog.inDirections, fadeDirection: creekEdge };
  }
  return null;
}

interface LoadedRiverMasks {
  data: WaterDryMasksData;
  /** The atlas's alpha plane (the mask), `width * height` bytes. */
  alpha: Uint8Array;
}

let masksPromise: Promise<LoadedRiverMasks> | null = null;

/** Decodes the build-time river mask atlas to its mask plane, once and lazily. */
function loadMasks(): Promise<LoadedRiverMasks> {
  masksPromise ??= (async () => {
    const { default: data } = await import('virtual:river-water-masks');
    const blob = await (await fetch(data.url)).blob();
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('river masks: no 2d context to decode the atlas');
    ctx.drawImage(bitmap, 0, 0);
    const rgba = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const alpha = new Uint8Array(bitmap.width * bitmap.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]!;
    return { data, alpha };
  })();
  masksPromise.catch(() => {
    masksPromise = null;
  });
  return masksPromise;
}

/** Copies one frame's mask cell out of the decoded atlas plane. */
export function cropAtlasCell(alpha: Uint8Array, atlasWidth: number, frame: DryMaskFrame): { mask: Uint8Array; cw: number; ch: number } {
  const cw = frame.sw >> 1;
  const ch = frame.sh >> 1;
  const mask = new Uint8Array(cw * ch);
  for (let row = 0; row < ch; row++) {
    const from = (frame.y + row) * atlasWidth + frame.x;
    mask.set(alpha.subarray(from, from + cw), row * cw);
  }
  return { mask, cw, ch };
}

/** Splits a cell's RGBA data into its top face and its rim past the face (`inside` = 1 on the face): each keeps only its own texels. */
export function splitFaceAndRim(data: Uint8Array, inside: Uint8Array): { face: Uint8Array; rim: Uint8Array } {
  const face = new Uint8Array(data.length);
  const rim = new Uint8Array(data.length);
  for (let p = 0; p < inside.length; p++) {
    const target = inside[p] ? face : rim;
    target.set(data.subarray(p * 4, p * 4 + 4), p * 4);
  }
  return { face, rim };
}

/** The bounding box of world rects; a unit box at the origin for none. */
export function boundsOf(rects: readonly { x: number; y: number; w: number; h: number }[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (rects.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return {
    minX: Math.min(...rects.map((r) => r.x)),
    minY: Math.min(...rects.map((r) => r.y)),
    maxX: Math.max(...rects.map((r) => r.x + r.w)),
    maxY: Math.max(...rects.map((r) => r.y + r.h)),
  };
}

/**
 * Owns the river flow render texture, the flow cells computed for it and the sprites drawn into it.
 *
 * `draw` runs when the water mask is applied or the terrain base entries change, never per frame.
 */
export class RiverFlowLayer {
  private readonly target = new MaskRenderTarget();
  private masks: LoadedRiverMasks | null = null;
  private readonly cells = new Map<string, { face: Texture; rim: Texture }>();
  private drawnRect: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

  /** The masks are lazily decoded; resolves when `draw` can use them. */
  async load(): Promise<void> {
    this.masks = await loadMasks();
  }

  get ready(): boolean {
    return this.masks !== null;
  }

  /** The render texture the water shader samples, or null before the first `draw`. */
  get texture(): Texture | null {
    return this.target.texture;
  }

  /**
   * The cell of one frame / edge combination as two textures: its own top face, and the rim past its in and out edges. The
   * layer draws every rim first and every face over them, so a rim only fills the strip where the neighbouring hex's own
   * art has no water (its water stops short of the edge) and never overwrites the neighbour's face with this cell's
   * version of it. Drawn in one pass, whichever hex came later overwrote up to `FACE_PAD_TEXELS` of the other's face: a
   * second, shifted seam inside the neighbour.
   */
  private cellTextures(masks: LoadedRiverMasks, name: string, frame: DryMaskFrame, entry: RiverFlowEntry, tileWidth: number): { face: Texture; rim: Texture } {
    const outEdge = topFaceEdgeIndex(entry.outDirection);
    const inEdges = entry.inDirections.map(topFaceEdgeIndex).sort((a, b) => a - b);
    const fadeEdge = entry.fadeDirection ? topFaceEdgeIndex(entry.fadeDirection) : undefined;
    // The neighbours behind the edges (frame names; where they lie is fixed by the edge) are part of the key: the distance to
    // the bank is measured on the water of both hexes of a seam.
    const neighbours = (entry.neighbours ?? [])
      .map((n) => ({ edge: topFaceEdgeIndex(n.direction), n }))
      .filter(({ n }) => masks.data.frames[n.name])
      .sort((a, b) => a.edge - b.edge);
    const key = `${name}|${outEdge}|${inEdges.join(',')}|${fadeEdge ?? ''}|${neighbours.map(({ edge, n }) => `${edge}:${n.name}`).join(',')}`;
    let pair = this.cells.get(key);
    if (!pair) {
      const { mask, cw, ch } = cropAtlasCell(masks.alpha, masks.data.width, frame);
      const polygon = topFacePolygonTexels(frame.sx, frame.sy);
      const k = tileWidth / SOURCE_W;
      const placed = (f: DryMaskFrame, o: { x: number; y: number }, m: { mask: Uint8Array; cw: number; ch: number }): PlacedMask => ({ ...m, x: o.x + f.sx * k, y: o.y + f.sy * k });
      const context = buildBankContext(
        placed(frame, entry, { mask, cw, ch }),
        polygon,
        neighbours.map(({ edge, n }) => {
          const nf = masks.data.frames[n.name]!;
          return { edge, cell: placed(nf, n, cropAtlasCell(masks.alpha, masks.data.width, nf)) };
        }),
        2 * k,
      );
      const flow = computeRiverRipple({ mask, cw, ch, polygon, inEdges, outEdge, fadeEdge, context });
      const { face, rim } = splitFaceAndRim(flow.data, flow.inside);
      const texture = (data: Uint8Array) =>
        new Texture({ source: new BufferImageSource({ resource: data, width: cw, height: ch, scaleMode: 'linear', addressMode: 'clamp-to-edge' }) });
      pair = { face: texture(face), rim: texture(rim) };
      this.cells.set(key, pair);
    }
    return pair;
  }

  /** The world rect the texture covers (the river hexes' cells), for the shader's own UVs; null before the first `draw`. */
  get rect(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    return this.drawnRect;
  }

  /**
   * Rebuilds the render texture from `entries`, the base art of every river and bog-creek hex. Entries whose frame has no
   * river mask are skipped. The texture covers only the river cells' own bounding box, not the water mask's whole region:
   * at the region's size it ran at a third of a texel per world unit, so the flow field went blocky and the seams ragged.
   * Returns the (possibly new) texture to bind.
   */
  draw(renderer: Renderer, entries: readonly RiverFlowEntry[], tileWidth: number): Texture | null {
    const masks = this.masks;
    if (!masks) return this.target.texture;
    const rims: MaskPlacement[] = [];
    const faces: MaskPlacement[] = [];
    for (const entry of entries) {
      const name = entry.texture.label ?? '';
      const frame = masks.data.frames[name];
      if (!frame) continue;
      const { face, rim } = this.cellTextures(masks, name, frame, entry, tileWidth);
      const rect = dryCellWorldRect(entry, frame, tileWidth);
      rims.push({ texture: rim, rect, tint: 0xffffff });
      faces.push({ texture: face, rect, tint: 0xffffff });
    }
    this.drawnRect = boundsOf(faces.map((p) => p.rect));
    return this.target.render(renderer, this.drawnRect, [...rims, ...faces]);
  }

  destroy(): void {
    this.target.destroy();
    for (const { face, rim } of this.cells.values()) {
      face.destroy(true);
      rim.destroy(true);
    }
    this.cells.clear();
  }
}
