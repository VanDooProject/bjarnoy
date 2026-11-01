// The river flow layer at runtime — docs/design/water-shader.md §4.4d.
//
// `build/waterDryMasks.ts` bakes a river water mask per river frame
// (`virtual:river-water-masks`). This file decodes that atlas once, turns a
// frame's mask into a flow cell (riverFlow.ts) for the tile's downstream edge,
// and draws the cells, placed where the tile art is drawn, into one render
// texture covering the water mask's world rect. The water shader samples it
// with the same UVs as the water mask and draws the moving streaks on the
// river pixels.
import { BufferImageSource, Texture, type Renderer } from 'pixi.js';
import type { RiverTile, BogTile, TileOrientation } from '../types';
import { topFaceEdgeIndex } from '../riverPath';
import type { DryMaskFrame, WaterDryMasksData } from './dryMaskCore';
import { dryCellWorldRect, MaskRenderTarget, type MaskPlacement } from './waterDryMask';
import { computeRiverFlow, topFacePolygonTexels } from './riverFlow';

/** One river or bog-creek hex's base art, as drawn, and where its water goes. */
export interface RiverFlowEntry {
  /** The base art texture; its `label` is the atlas frame name. */
  texture: Texture;
  /** The sprite's top-left in world space. */
  x: number;
  y: number;
  /** The downstream side. */
  outDirection: TileOrientation;
  /** The side the flow fades away from, so the lake of a bog lake mouth stays still. */
  fadeDirection?: TileOrientation;
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
): { outDirection: TileOrientation; fadeDirection?: TileOrientation } | null {
  if (river) {
    if (river.wasted) return null;
    const outDirection = river.outDirection ?? (river.shape === 'mouth' ? seaDirection : null);
    return outDirection ? { outDirection } : null;
  }
  if (bog && (bog.kind === 'creek' || bog.kind === 'creekspring' || bog.kind === 'mouth') && bog.outDirection) {
    if (bog.kind !== 'mouth') return { outDirection: bog.outDirection };
    const creekEdge = [bog.inDirections[0], bog.outDirection].find((d) => d !== undefined && !bog.waterEdges.includes(d));
    return { outDirection: bog.outDirection, fadeDirection: creekEdge };
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

/**
 * Owns the river flow render texture, the flow cells computed for it and the sprites drawn into it.
 *
 * `draw` runs when the water mask is applied or the terrain base entries change, never per frame.
 */
export class RiverFlowLayer {
  private readonly target = new MaskRenderTarget();
  private masks: LoadedRiverMasks | null = null;
  private readonly cells = new Map<string, Texture>();

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

  private cellTexture(masks: LoadedRiverMasks, name: string, frame: DryMaskFrame, entry: RiverFlowEntry): Texture {
    const outEdge = topFaceEdgeIndex(entry.outDirection);
    const fadeEdge = entry.fadeDirection ? topFaceEdgeIndex(entry.fadeDirection) : undefined;
    const key = `${name}|${outEdge}|${fadeEdge ?? ''}`;
    let texture = this.cells.get(key);
    if (!texture) {
      const { mask, cw, ch } = cropAtlasCell(masks.alpha, masks.data.width, frame);
      const flow = computeRiverFlow({ mask, cw, ch, polygon: topFacePolygonTexels(frame.sx, frame.sy), outEdge, fadeEdge });
      texture = new Texture({ source: new BufferImageSource({ resource: flow, width: cw, height: ch, scaleMode: 'linear', addressMode: 'clamp-to-edge' }) });
      this.cells.set(key, texture);
    }
    return texture;
  }

  /**
   * Rebuilds the render texture over `rect` (the water mask's world rect) from `entries`, the base art of every river and
   * bog-creek hex. Entries whose frame has no river mask are skipped. Returns the (possibly new) texture to bind.
   */
  draw(renderer: Renderer, rect: { minX: number; minY: number; maxX: number; maxY: number }, entries: readonly RiverFlowEntry[], tileWidth: number): Texture | null {
    const masks = this.masks;
    if (!masks) return this.target.texture;
    const placements: MaskPlacement[] = [];
    for (const entry of entries) {
      const name = entry.texture.label ?? '';
      const frame = masks.data.frames[name];
      if (frame) placements.push({ texture: this.cellTexture(masks, name, frame, entry), rect: dryCellWorldRect(entry, frame, tileWidth), tint: 0xffffff });
    }
    return this.target.render(renderer, rect, placements);
  }

  destroy(): void {
    this.target.destroy();
    for (const texture of this.cells.values()) texture.destroy(true);
    this.cells.clear();
  }
}
