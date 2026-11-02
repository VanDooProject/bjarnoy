// The art dry mask at runtime — docs/design/water-shader.md §4.4b.
//
// `build/waterDryMasks.ts` bakes, per water-based tile frame, a half-resolution
// mask of the pixels that are not plain water (rock, boat, dock, hut, ...) and
// packs them into one atlas (`virtual:water-dry-masks`). This file draws those
// masks, placed where the tile art is drawn, into one render texture covering
// the water mask's world rect. The water shader samples it with the same UVs as
// the water mask and keeps caustics and foam off whatever is dry.
//
// The bog lake layer (bogLakeShader.ts) reuses all of it: the same class draws the lake *wet* masks (`virtual:water-dry-masks`' `lake` atlas)
// of the lake hexes into a render texture of its own, over the lakes' bounding rect (`entriesWorldBounds`). The river flow layer
// (riverFlowLayer.ts) shares the drawing half, `MaskRenderTarget`.
import { Container, ImageSource, Matrix, Rectangle, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { REFERENCE_FRAME_RE, SOURCE_H, SOURCE_W, type DryMaskFrame, type MaskAtlasData } from './dryMaskCore';

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

/** Render-texture size and scale (pixels per world unit) for a world rect: `DRY_RT_PIXELS_PER_UNIT`, capped so the long side fits `maxSide`. */
export function dryRenderTargetSize(worldW: number, worldH: number, maxSide: number = DRY_RT_MAX_SIDE): { width: number; height: number; scale: number } {
  const scale = Math.min(DRY_RT_PIXELS_PER_UNIT, maxSide / Math.max(worldW, worldH));
  return { width: Math.max(1, Math.ceil(worldW * scale)), height: Math.max(1, Math.ceil(worldH * scale)), scale };
}

/** One sea hex's base art, as drawn: the texture (its `label` is the atlas frame name) and the sprite's top-left in world space. */
export interface DryEntry {
  texture: Texture;
  x: number;
  y: number;
}

/**
 * A mask layer's entries from the terrain rebuild's base entries: the base art of every hex `include` picks (the sea hexes for the
 * dry layer, the lake-water frames for the bog lake layer), at the sprite's top-left (`origin`). Skips a hex without art — the sprite
 * layer draws nothing there either, e.g. a revealed wasted coast while its atlas pack is still loading (or failed to) — and
 * legacy-split crops, which are land.
 */
export function maskEntries<C>(
  entries: Iterable<{ texture: Texture | undefined; coord: C; crop?: unknown }>,
  include: (coord: C, texture: Texture) => boolean,
  origin: (coord: C) => { x: number; y: number },
): DryEntry[] {
  const out: DryEntry[] = [];
  for (const { texture, coord, crop } of entries) {
    if (!texture || crop || !include(coord, texture)) continue;
    out.push({ texture, ...origin(coord) });
  }
  return out;
}

/**
 * Which mask atlas a layer draws: the sea hexes' dry masks, the bog lakes' wet masks, or the river water masks (river, creek and lake
 * mouth water; the bog lake layer draws the lake mouths' creek water with it, for the shore band).
 */
export type MaskKind = 'dry' | 'lake' | 'river';

interface LoadedMasks {
  data: MaskAtlasData;
  atlas: Texture;
  cells: Map<string, Texture>;
}

const masksPromises: Partial<Record<MaskKind, Promise<LoadedMasks>>> = {};

/** Decodes a build-time mask atlas once, lazily — it is not needed until a settlement view draws sea (or lakes). */
function loadMasks(kind: MaskKind): Promise<LoadedMasks> {
  masksPromises[kind] ??= (async () => {
    const data = kind === 'river' ? (await import('virtual:river-water-masks')).default : await dryAtlas(kind);
    const blob = await (await fetch(data.url)).blob();
    // 'none': keep the PNG's values as they are; Pixi premultiplies on upload, so the mask lands in the alpha channel (and rgb).
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' });
    const atlas = new Texture({ source: new ImageSource({ resource: bitmap, scaleMode: 'linear', addressMode: 'clamp-to-edge' }) });
    return { data, atlas, cells: new Map() };
  })();
  masksPromises[kind]!.catch(() => {
    delete masksPromises[kind];
  });
  return masksPromises[kind]!;
}

async function dryAtlas(kind: 'dry' | 'lake'): Promise<MaskAtlasData> {
  const { default: all } = await import('virtual:water-dry-masks');
  return kind === 'lake' ? all.lake : all;
}

function cellTexture(masks: LoadedMasks, name: string, frame: DryMaskFrame): Texture {
  let texture = masks.cells.get(name);
  if (!texture) {
    texture = new Texture({ source: masks.atlas.source, frame: new Rectangle(frame.x, frame.y, frame.sw >> 1, frame.sh >> 1) });
    masks.cells.set(name, texture);
  }
  return texture;
}

/** The world rect (min/max) covering the art canvases of `entries`, or null for none — the lake layer's render-texture rect. */
export function entriesWorldBounds(entries: readonly DryEntry[], tileWidth: number): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (entries.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const entry of entries) {
    const r = artCanvasWorldRect(entry, tileWidth);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { minX, minY, maxX, maxY };
}

/** One sprite drawn into a mask render texture: a texture, the world rect it covers, and a tint. */
export interface MaskPlacement {
  texture: Texture;
  rect: WorldRect;
  tint: number;
}

/**
 * A render texture over a world rect, filled with sprites placed in world space: the shared drawing half of the mask layers
 * below and the river flow layer (`riverFlowLayer.ts`).
 */
export class MaskRenderTarget {
  private readonly container = new Container();
  private pool: Sprite[] = [];
  private target: RenderTexture | null = null;
  private readonly maxSide: number;

  /** `maxSide`: the longest side of the render texture, in pixels. */
  constructor(maxSide: number = DRY_RT_MAX_SIDE) {
    this.maxSide = maxSide;
  }

  /** The render texture, or null before the first `render`. */
  get texture(): Texture | null {
    return this.target;
  }

  /** Clears the target and draws `placements` into it over `rect`, in order (later ones over earlier ones). Returns the (possibly new) texture to bind. */
  render(renderer: Renderer, rect: { minX: number; minY: number; maxX: number; maxY: number }, placements: readonly MaskPlacement[]): Texture {
    const { width, height, scale } = dryRenderTargetSize(rect.maxX - rect.minX, rect.maxY - rect.minY, this.maxSide);
    if (!this.target) {
      this.target = RenderTexture.create({ width, height, resolution: 1, scaleMode: 'linear' });
    } else if (this.target.width !== width || this.target.height !== height) {
      // Resized in place: the shader stays bound to the same source, so there is nothing to swap or retire.
      this.target.source.resize(width, height, 1);
    }

    let used = 0;
    for (const { texture, rect: worldRect, tint } of placements) {
      const sprite = (this.pool[used] ??= new Sprite());
      sprite.texture = texture;
      sprite.tint = tint;
      sprite.position.set(worldRect.x, worldRect.y);
      sprite.width = worldRect.w;
      sprite.height = worldRect.h;
      if (!sprite.parent) this.container.addChild(sprite);
      used++;
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

/**
 * Owns a mask render texture and the sprites drawn into it: the sea hexes' dry mask (`kind` 'dry', the default) or the bog lakes' wet
 * mask (`kind` 'lake').
 *
 * `draw` runs when the water mask is applied or the terrain base entries
 * change, never per frame.
 */
export class WaterDryLayer {
  private readonly target = new MaskRenderTarget();
  private masks: LoadedMasks | null = null;

  private readonly kind: MaskKind;

  constructor(kind: MaskKind = 'dry') {
    this.kind = kind;
  }

  /** The masks are lazily decoded; resolves when `draw` can use them. */
  async load(): Promise<void> {
    this.masks = await loadMasks(this.kind);
  }

  get ready(): boolean {
    return this.masks !== null;
  }

  /** The render texture the water shader samples, or null before the first `draw`. */
  get texture(): Texture | null {
    return this.target.texture;
  }

  /**
   * Rebuilds the render texture over `rect` (the water mask's world rect; the lakes' bounds for a lake layer) from
   * `entries`, the base art of every sea (lake) hex. Returns the (possibly new)
   * texture to bind.
   */
  draw(renderer: Renderer, rect: { minX: number; minY: number; maxX: number; maxY: number }, entries: readonly DryEntry[], tileWidth: number): Texture | null {
    const masks = this.masks;
    if (!masks) return this.target.texture;
    const placements: MaskPlacement[] = [];
    for (const entry of entries) {
      const name = entry.texture.label ?? '';
      if (this.kind === 'dry' && REFERENCE_FRAME_RE.test(name)) continue;
      const frame = masks.data.frames[name];
      if (frame) placements.push({ texture: cellTexture(masks, name, frame), rect: dryCellWorldRect(entry, frame, tileWidth), tint: 0xffffff });
      // Sea-hex art that is not plain water and has no mask: all of it is dry. Black tint keeps rgb 0 and the art's own alpha, which is what the shader reads.
      // (A lake frame without a mask has no lake water to show: it draws nothing.)
      else if (this.kind === 'dry') placements.push({ texture: entry.texture, rect: artCanvasWorldRect(entry, tileWidth), tint: 0x000000 });
    }
    return this.target.render(renderer, rect, placements);
  }

  destroy(): void {
    this.target.destroy();
  }
}
