// The performance-critical piece. A plain class (no Vue, no reactivity)
// wrapping a single PixiJS (WebGL) canvas.
//
// Why this shape, vs. the legacy Angular renderer it replaces
// (legacy/frontend/map/src/components/{map,chunk,tile}): that version gave
// every tile its own Angular component backed by an SVG element, so panning
// across a few hundred hexes meant a few hundred live DOM nodes plus Angular
// change detection over all of them. Here:
//  - the map is one PixiJS scene graph with a *pool* of reused Sprites (one
//    per visible hex) plus a couple of Graphics layers (borders, fog) —
//    Pixi batches sprites sharing a texture into very few WebGL draw calls,
//    and every one of our ~9 tile textures is reused across the whole map;
//  - the camera transform is applied to a single container every frame
//    (cheap: one position/scale write), but the *set of hexes that exist*
//    is only recomputed when the camera has moved far enough to change it
//    (cameraMovedEnough) — panning doesn't re-walk the tile data every frame;
//  - hex data is generated on demand and cached in WorldModel, so memory is
//    bounded by hexes actually visited, not by total world size;
//  - Vue never sees per-tile data — it only reads a few primitive refs.
//
// World map and settlement view share this renderer and one isometric
// lattice (docs/design/zip-brainstorms.md's world-map mockup literally
// captions itself "Same hex lattice as the settlement view, flattened") —
// they differ only in default zoom, whether fog-of-war gates what's drawn,
// and whether open sea gets a tile sprite at all.
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import type { AxialCoord } from '../hex/coords';
import { coordKey } from '../hex/coords';
import { isoDepthKey, isoGridPosition, isoPixelToAxial, isoTopPoints } from '../hex/geometry';
import type { Camera } from './camera';
import { screenToWorld, visibleWorldRect, worldToScreen } from './camera';
import type { WorldModel } from './WorldModel';
import type { Settlement, Tile } from './types';
import {
  TILE_ART_NATIVE_H,
  TILE_ART_NATIVE_W,
  TILE_ART_TOPFACE_H_FRAC,
  TILE_ART_TOPFACE_Y_FRAC,
  loadTileTextures,
  textureKeyFor,
  type TextureKey,
} from './textures';

export type RenderMode = 'world' | 'settlement';

const GOLD = 0xffc55c;
const RIVAL = 0xe2705f;
const FOG_SCOUTED = 0x0b1116;

export interface HexMapRendererOptions {
  mode: RenderMode;
  worldModel: WorldModel;
  /** Local player id, used to colour "your" territory vs. others. */
  playerId: string;
  /** Only relevant in 'settlement' mode: the settlement being viewed. */
  settlementId?: string;
  onHexClick?: (coord: AxialCoord, tile: Tile) => void;
}

// One tile-art size for both views — see the module comment above.
const TILE_W = 168;
const TILE_H = TILE_W * TILE_ART_TOPFACE_H_FRAC;
const TILE_CANVAS_H = TILE_W * (TILE_ART_NATIVE_H / TILE_ART_NATIVE_W);
const TILE_TOPFACE_Y_OFFSET = TILE_W * TILE_ART_TOPFACE_Y_FRAC;

const WORLD_DEFAULT_ZOOM = 0.22;
const SETTLEMENT_DEFAULT_ZOOM = 0.85;

export class HexMapRenderer {
  private app: Application | null = null;
  private world = new Container();
  private terrainContainer = new Container();
  private borderLayer = new Graphics();
  private fogLayer = new Graphics();
  private markerLayer = new Graphics();
  private labelPool: Text[] = [];
  private labelsUsed = 0;

  private textures: Record<TextureKey, import('pixi.js').Texture> | null = null;
  private spritePool: Sprite[] = [];
  private activeSprites = new Map<string, Sprite>();

  private camera: Camera;
  private viewport = { width: 0, height: 0 };
  private lastBuiltCamera: Camera | null = null;
  private cullQueued = false;
  private destroyed = false;

  private dragging = false;
  private dragMoved = 0;
  private lastPointer = { x: 0, y: 0 };
  // zip 4: "world view is already on screen and moving when the page loads" —
  // a gentle idle drift on the world map, cancelled on first user input.
  private idleDrift: boolean;

  private options: HexMapRendererOptions;

  constructor(options: HexMapRendererOptions) {
    this.options = options;
    this.idleDrift = options.mode === 'world';
    this.terrainContainer.sortableChildren = true;
    this.camera =
      options.mode === 'settlement'
        ? this.settlementCameraOrigin()
        : { x: 0, y: 0, zoom: WORLD_DEFAULT_ZOOM };
  }

  private settlementCameraOrigin(): Camera {
    const settlement = this.settlement();
    if (!settlement) return { x: 0, y: 0, zoom: SETTLEMENT_DEFAULT_ZOOM };
    const grid = isoGridPosition({ q: settlement.q, r: settlement.r }, TILE_W, TILE_H);
    return { x: grid.x + TILE_W / 2, y: grid.y + TILE_H / 2, zoom: SETTLEMENT_DEFAULT_ZOOM };
  }

  private settlement(): Settlement | undefined {
    if (!this.options.settlementId) return undefined;
    return this.options.worldModel.getSettlement(this.options.settlementId);
  }

  async mount(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    const app = new Application();
    await app.init({
      canvas,
      width,
      height,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      backgroundAlpha: 0,
      antialias: true,
    });
    this.app = app;
    this.viewport = { width, height };
    this.textures = await loadTileTextures();
    if (this.destroyed) return;

    this.world.addChild(this.terrainContainer, this.borderLayer, this.fogLayer);
    app.stage.addChild(this.world, this.markerLayer);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    app.ticker.add(this.onTick);

    this.applyCameraTransform();
    this.rebuildAll();
  }

  resize(width: number, height: number) {
    if (!this.app) return;
    this.viewport = { width, height };
    this.app.renderer.resize(width, height);
    this.applyCameraTransform();
    this.scheduleCull();
  }

  private applyCameraTransform() {
    this.world.scale.set(this.camera.zoom);
    this.world.position.set(
      this.viewport.width / 2 - this.camera.x * this.camera.zoom,
      this.viewport.height / 2 - this.camera.y * this.camera.zoom,
    );
  }

  private onTick = () => {
    this.options.worldModel.tick();
    this.rebuildMarkers();
    if (this.idleDrift) {
      this.camera = { ...this.camera, x: this.camera.x + 0.18, y: this.camera.y + 0.05 };
      this.applyCameraTransform();
      this.scheduleCull();
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    this.idleDrift = false;
    this.dragging = true;
    this.dragMoved = 0;
    this.lastPointer = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.dragMoved += Math.abs(dx) + Math.abs(dy);
    this.camera = {
      ...this.camera,
      x: this.camera.x - dx / this.camera.zoom,
      y: this.camera.y - dy / this.camera.zoom,
    };
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.applyCameraTransform();
    this.scheduleCull();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.dragging && this.dragMoved < 6) {
      this.handleClick(e);
    }
    this.dragging = false;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.idleDrift = false;
    const canvas = this.app?.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const before = screenToWorld(this.camera, screen, this.viewport);
    const factor = Math.exp(-e.deltaY * 0.001);
    const zoom = Math.min(4, Math.max(0.05, this.camera.zoom * factor));
    this.camera = { ...this.camera, zoom };
    const after = screenToWorld(this.camera, screen, this.viewport);
    this.camera = {
      ...this.camera,
      x: this.camera.x + (before.x - after.x),
      y: this.camera.y + (before.y - after.y),
    };
    this.applyCameraTransform();
    this.scheduleCull();
  };

  private handleClick(e: PointerEvent) {
    const canvas = this.app?.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(this.camera, screen, this.viewport);
    const coord = isoPixelToAxial(world, TILE_W, TILE_H);
    const tile = this.options.worldModel.getTile(coord.q, coord.r);
    this.options.onHexClick?.(coord, tile);
  }

  private scheduleCull() {
    if (this.cullQueued) return;
    this.cullQueued = true;
    requestAnimationFrame(() => {
      this.cullQueued = false;
      if (this.destroyed) return;
      if (this.cameraMovedEnough()) this.rebuildAll();
    });
  }

  private cameraMovedEnough(): boolean {
    const prev = this.lastBuiltCamera;
    if (!prev) return true;
    const moved = Math.hypot(this.camera.x - prev.x, this.camera.y - prev.y);
    return moved > TILE_W * 0.4 || Math.abs(this.camera.zoom - prev.zoom) / prev.zoom > 0.08;
  }

  private visibleCoords(): AxialCoord[] {
    const margin = TILE_W * 2;
    const rect = visibleWorldRect(this.camera, this.viewport, margin);
    const colPitch = TILE_W * 0.75;
    const colMin = Math.floor(rect.minX / colPitch) - 1;
    const colMax = Math.ceil(rect.maxX / colPitch) + 1;
    const rowMin = Math.floor(rect.minY / TILE_H) - 1;
    const rowMax = Math.ceil(rect.maxY / TILE_H) + 1;
    const out: AxialCoord[] = [];
    for (let col = colMin; col <= colMax; col++) {
      for (let row = rowMin; row <= rowMax; row++) {
        const q = col;
        const r = row - (col - (col & 1)) / 2;
        out.push({ q, r });
      }
    }
    return out;
  }

  private rebuildAll() {
    if (!this.app || !this.textures) return;
    this.lastBuiltCamera = { ...this.camera };
    const coords = this.visibleCoords();
    this.rebuildTerrain(coords);
    this.rebuildBordersAndFog(coords);
    this.rebuildMarkers();
  }

  private acquireSprite(): Sprite {
    return this.spritePool.pop() ?? new Sprite();
  }

  private rebuildTerrain(coords: AxialCoord[]) {
    const { worldModel, mode } = this.options;
    const textures = this.textures!;
    const desired = new Set<string>();

    for (const c of coords) {
      if (mode === 'settlement' && !worldModel.isExplored(c.q, c.r)) continue; // true fog: not drawn
      const tile = worldModel.getTile(c.q, c.r);
      if (mode === 'world' && tile.terrain === 'sea') continue; // open sea is just the background

      const key = coordKey(c);
      desired.add(key);
      let sprite = this.activeSprites.get(key);
      const isNew = !sprite;
      if (!sprite) {
        sprite = this.acquireSprite();
        this.activeSprites.set(key, sprite);
      }
      sprite.texture = textures[textureKeyFor(tile)];
      sprite.width = TILE_W;
      sprite.height = TILE_CANVAS_H;
      const grid = isoGridPosition(c, TILE_W, TILE_H);
      sprite.position.set(grid.x, grid.y - TILE_TOPFACE_Y_OFFSET);
      sprite.zIndex = isoDepthKey(c);
      if (isNew) this.terrainContainer.addChild(sprite);
    }

    for (const [key, sprite] of this.activeSprites) {
      if (desired.has(key)) continue;
      this.terrainContainer.removeChild(sprite);
      this.spritePool.push(sprite);
      this.activeSprites.delete(key);
    }
    this.terrainContainer.sortChildren();
  }

  private rebuildBordersAndFog(coords: AxialCoord[]) {
    const { worldModel, mode, playerId } = this.options;
    this.borderLayer.clear();
    this.fogLayer.clear();

    let visible: Set<string> | null = null;
    if (mode === 'settlement') {
      const settlement = this.settlement();
      if (settlement) visible = worldModel.visibleHexes(settlement);
    }

    for (const c of coords) {
      if (mode === 'settlement' && !worldModel.isExplored(c.q, c.r)) continue;
      const tile = worldModel.getTile(c.q, c.r);
      if (mode === 'world' && tile.terrain === 'sea') continue;

      const grid = isoGridPosition(c, TILE_W, TILE_H);
      const top = isoTopPoints(TILE_W, TILE_H).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
      const flat = top.flatMap((p) => [p.x, p.y]);

      if (tile.ownerId && isEdgeOfClaim(worldModel, c, tile.ownerId)) {
        const owner = worldModel.getSettlement(tile.ownerId);
        const mine = owner?.ownerId === playerId;
        this.borderLayer.poly(flat).stroke({ width: 3, color: mine ? GOLD : RIVAL, alpha: 0.9 });
      }

      if (visible && !visible.has(coordKey(c))) {
        this.fogLayer.poly(flat).fill({ color: FOG_SCOUTED, alpha: 0.55 });
      }
    }
  }

  private rebuildMarkers() {
    this.markerLayer.clear();
    if (this.options.mode !== 'world') {
      this.labelPool.forEach((l) => (l.visible = false));
      return;
    }
    const { worldModel, playerId } = this.options;
    this.labelsUsed = 0;

    for (const settlement of worldModel.listSettlements()) {
      const grid = isoGridPosition({ q: settlement.q, r: settlement.r }, TILE_W, TILE_H);
      const center = this.toScreen({ x: grid.x + TILE_W / 2, y: grid.y + TILE_H / 2 });
      const mine = settlement.ownerId === playerId;
      this.markerLayer
        .circle(center.x, center.y, 5 * this.camera.zoom + 3)
        .fill({ color: mine ? GOLD : RIVAL })
        .stroke({ width: 1.5, color: 0x0b1116, alpha: 0.8 });
    }

    const now = Date.now();
    for (const fleet of worldModel.listFleets()) {
      const t = Math.min(1, Math.max(0, (now - fleet.departedAt) / (fleet.etaAt - fleet.departedAt || 1)));
      const fromGrid = isoGridPosition({ q: fleet.fromQ, r: fleet.fromR }, TILE_W, TILE_H);
      const toGrid = isoGridPosition({ q: fleet.toQ, r: fleet.toR }, TILE_W, TILE_H);
      const world = {
        x: fromGrid.x + (toGrid.x - fromGrid.x) * t,
        y: fromGrid.y + (toGrid.y - fromGrid.y) * t,
      };
      const screen = this.toScreen(world);
      const remainingMs = Math.max(0, fleet.etaAt - now);
      const label = this.acquireLabel();
      label.text = formatEta(remainingMs);
      label.position.set(screen.x + 8, screen.y - 8);
      label.visible = true;
    }
    for (let i = this.labelsUsed; i < this.labelPool.length; i++) this.labelPool[i].visible = false;
  }

  private toScreen(world: { x: number; y: number }) {
    return worldToScreen(this.camera, world, this.viewport);
  }

  private acquireLabel(): Text {
    let label = this.labelPool[this.labelsUsed];
    if (!label) {
      label = new Text({ text: '', style: { fill: 0xe8f0f5, fontSize: 11, fontFamily: 'sans-serif' } });
      this.labelPool.push(label);
      this.markerLayer.addChild(label);
    }
    this.labelsUsed++;
    return label;
  }

  panTo(coord: AxialCoord) {
    const grid = isoGridPosition(coord, TILE_W, TILE_H);
    this.camera = { ...this.camera, x: grid.x + TILE_W / 2, y: grid.y + TILE_H / 2 };
    this.applyCameraTransform();
    this.rebuildAll();
  }

  destroy() {
    this.destroyed = true;
    const canvas = this.app?.canvas;
    canvas?.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    canvas?.removeEventListener('wheel', this.onWheel as EventListener);
    this.app?.ticker.remove(this.onTick);
    this.app?.destroy(false, { children: true });
    this.app = null;
  }
}

const NEIGHBOR_DIRS: AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function isEdgeOfClaim(worldModel: WorldModel, c: AxialCoord, ownerId: string): boolean {
  return NEIGHBOR_DIRS.some((d) => worldModel.getTile(c.q + d.q, c.r + d.r).ownerId !== ownerId);
}

function formatEta(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
