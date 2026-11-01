// The art dry mask at runtime — docs/design/water-shader.md §4.4b.
//
// `build/waterDryMasks.ts` bakes, per water-based tile frame, a half-resolution
// mask of the pixels that are not plain water (rock, boat, dock, hut, ...) and
// packs them into one atlas (`virtual:water-dry-masks`). This file draws those
// masks, placed where the tile art is drawn, into one render texture covering
// the water mask's world rect. The water shader samples it with the same UVs as
// the water mask and keeps caustics and foam off whatever is dry.
import { Container, ImageSource, Matrix, Rectangle, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { REFERENCE_FRAME_RE, SOURCE_H, SOURCE_W, type DryMaskFrame, type WaterDryMasksData } from './dryMaskCore';

/** Render-texture pixels per world unit: one, finer than a mask cell texel (2 source px = ~1.7 units), so the RT adds no blockiness of its own at close zoom. */
export const DRY_RT_PIXELS_PER_UNIT = 1;
/** Longest side of the render texture. */
export const DRY_RT_MAX_SIDE = 2048;

/** A world-space axis-aligned rect. */
export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where a mask cell lands in world space: the art sprite's top-left (`origin`, the
 * full 200x300 canvas scaled to `tileWidth` wide) plus the cell's source rect
 * scaled by `tileWidth / SOURCE_W`.
 */
export function dryCellWorldRect(origin: { x: number; y: number }, frame: Pick<DryMaskFrame, 'sx' | 'sy' | 'sw' | 'sh'>, tileWidth: number): WorldRect {
  const k = tileWidth / SOURCE_W;
  return { x: origin.x + frame.sx * k, y: origin.y + frame.sy * k, w: frame.sw * k, h: frame.sh * k };
}

/** The art canvas (the full 200x300 source) as a world rect, for art without a mask cell. */
export function artCanvasWorldRect(origin: { x: number; y: number }, tileWidth: number): WorldRect {
  const k = tileWidth / SOURCE_W;
  return { x: origin.x, y: origin.y, w: SOURCE_W * k, h: SOURCE_H * k };
}

/** Render-texture size and scale (pixels per world unit) for a world rect: `DRY_RT_PIXELS_PER_UNIT`, capped so the long side fits `DRY_RT_MAX_SIDE`. */
export function dryRenderTargetSize(worldW: number, worldH: number): { width: number; height: number; scale: number } {
  const scale = Math.min(DRY_RT_PIXELS_PER_UNIT, DRY_RT_MAX_SIDE / Math.max(worldW, worldH));
  return { width: Math.max(1, Math.ceil(worldW * scale)), height: Math.max(1, Math.ceil(worldH * scale)), scale };
}

/** One sea hex's base art, as drawn: the texture (its `label` is the atlas frame name) and the sprite's top-left in world space. */
export interface DryEntry {
  texture: Texture;
  x: number;
  y: number;
}

interface LoadedMasks {
  data: WaterDryMasksData;
  atlas: Texture;
  cells: Map<string, Texture>;
}

let masksPromise: Promise<LoadedMasks> | null = null;

/** Decodes the build-time mask atlas once, lazily — it is not needed until a settlement view draws sea. */
function loadMasks(): Promise<LoadedMasks> {
  masksPromise ??= (async () => {
    const { default: data } = await import('virtual:water-dry-masks');
    const blob = await (await fetch(data.url)).blob();
    // 'none': keep the PNG's values as they are; Pixi premultiplies on upload, so the mask lands in the alpha channel (and rgb).
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
    const atlas = new Texture({ source: new ImageSource({ resource: bitmap, scaleMode: 'linear', addressMode: 'clamp-to-edge' }) });
    return { data, atlas, cells: new Map() };
  })();
  masksPromise.catch(() => {
    masksPromise = null;
  });
  return masksPromise;
}

function cellTexture(masks: LoadedMasks, name: string, frame: DryMaskFrame): Texture {
  let texture = masks.cells.get(name);
  if (!texture) {
    texture = new Texture({ source: masks.atlas.source, frame: new Rectangle(frame.x, frame.y, frame.sw >> 1, frame.sh >> 1) });
    masks.cells.set(name, texture);
  }
  return texture;
}

/**
 * Owns the dry-mask render texture and the sprites drawn into it.
 *
 * `draw` runs when the water mask is applied or the terrain base entries
 * change, never per frame.
 */
export class WaterDryLayer {
  private readonly container = new Container();
  private pool: Sprite[] = [];
  private target: RenderTexture | null = null;
  private masks: LoadedMasks | null = null;

  /** The masks are lazily decoded; resolves when `draw` can use them. */
  async load(): Promise<void> {
    this.masks = await loadMasks();
  }

  get ready(): boolean {
    return this.masks !== null;
  }

  /** The render texture the water shader samples, or null before the first `draw`. */
  get texture(): Texture | null {
    return this.target;
  }

  /**
   * Rebuilds the render texture over `rect` (the water mask's world rect) from
   * `entries`, the base art of every sea hex. Returns the (possibly new)
   * texture to bind.
   */
  draw(renderer: Renderer, rect: { minX: number; minY: number; maxX: number; maxY: number }, entries: readonly DryEntry[], tileWidth: number): Texture | null {
    const masks = this.masks;
    if (!masks) return this.target;
    const { width, height, scale } = dryRenderTargetSize(rect.maxX - rect.minX, rect.maxY - rect.minY);
    if (!this.target) {
      this.target = RenderTexture.create({ width, height, resolution: 1, scaleMode: 'linear' });
    } else if (this.target.width !== width || this.target.height !== height) {
      // Resized in place: the shader stays bound to the same source, so there is nothing to swap or retire.
      this.target.source.resize(width, height, 1);
    }

    let used = 0;
    const place = (texture: Texture, worldRect: WorldRect, tint: number) => {
      const sprite = (this.pool[used] ??= new Sprite());
      sprite.texture = texture;
      sprite.tint = tint;
      sprite.position.set(worldRect.x, worldRect.y);
      sprite.width = worldRect.w;
      sprite.height = worldRect.h;
      if (!sprite.parent) this.container.addChild(sprite);
      used++;
    };
    for (const entry of entries) {
      const name = entry.texture.label ?? '';
      if (REFERENCE_FRAME_RE.test(name)) continue;
      const frame = masks.data.frames[name];
      if (frame) place(cellTexture(masks, name, frame), dryCellWorldRect(entry, frame, tileWidth), 0xffffff);
      // Sea-hex art that is not plain water and has no mask: all of it is dry. Black tint keeps rgb 0 and the art's own alpha, which is what the shader reads.
      else place(entry.texture, artCanvasWorldRect(entry, tileWidth), 0x000000);
    }
    for (let i = used; i < this.pool.length; i++) {
      if (this.pool[i].parent) this.container.removeChild(this.pool[i]);
    }

    // World -> render-texture pixels: scale, then shift the rect's top-left to the origin.
    const transform = new Matrix(scale, 0, 0, scale, -rect.minX * scale, -rect.minY * scale);
    renderer.render({ container: this.container, target: this.target, transform, clear: true, clearColor: [0, 0, 0, 0] });
    return this.target;
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.pool = [];
    this.target?.destroy(true);
    this.target = null;
  }
}
