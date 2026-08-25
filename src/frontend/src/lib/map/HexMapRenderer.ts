// The performance-critical piece. A plain class (no Vue, no reactivity)
// wrapping a single PixiJS (WebGL) canvas.
//
// Why this shape, vs. the legacy Angular renderer it replaces
// (legacy/frontend/map/src/components/{map,chunk,tile}): that version gave
// every tile its own Angular component backed by an SVG element, so panning
// across a few hundred hexes meant a few hundred live DOM nodes plus Angular
// change detection over all of them. Here:
//  - the map is one PixiJS scene graph with a *pool* of reused Sprites (one
//    or two per visible hex — see the base/top split below) plus a few
//    Graphics layers (borders, hover, fog) — Pixi batches sprites sharing a
//    texture into very few WebGL draw calls, and every one of our tile
//    textures is reused across the whole map;
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
//
// Each hex draws as up to two stacked sprites, base (ground) and top
// (props/building) — see textures.ts — with the border and hover
// highlight layers sandwiched in between, so a realm border or a hover
// highlight sits on the ground and tucks under a tile's trees or building
// instead of slicing across their canopy. Fog-of-war dimming sits above
// everything, since a scouted-but-not-currently-visible hex needs to dim
// its whole tile, props included.
import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { AxialCoord } from '../hex/coords';
import { coordKey } from '../hex/coords';
import { isoDepthKey, isoGridPosition, isoPixelToAxial, isoTopPoints } from '../hex/geometry';
import type { Camera } from './camera';
import { screenToWorld, visibleWorldRect, worldToScreen } from './camera';
import type { WorldModel } from './WorldModel';
import type { Settlement, Terrain, Tile } from './types';
import {
  TILE_ART_NATIVE_H,
  TILE_ART_NATIVE_W,
  TILE_ART_TOPFACE_H_FRAC,
  TILE_ART_TOPFACE_Y_FRAC,
  loadTileTextures,
  textureKeyFor,
  type TileTextures,
} from './textures';

export type RenderMode = 'world' | 'settlement';

const GOLD = 0xffc55c;
const RIVAL = 0xe2705f;
const FOG_SCOUTED = 0x0b1116;
const HOVER_FILL = 0xffffff;
const HOVER_STROKE = 0xffe9c2;

// zip 7: islands on the world map are "small hexes (no images (yet))" —
// unlike the settlement view, which renders full tile-art sprites, the
// world map draws flat coloured hex faces. Tones lifted from the design
// doc's IslandMap terrain-tone table (prototypes/landing_pages/README.md).
const WORLD_TERRAIN_FILL: Record<Terrain, number> = {
  sea: 0x215a7a, // unused (open sea has no tile at all in world mode)
  sand: 0xe0c882,
  grass: 0x7ba844,
  forest: 0x4e6f2b,
  mountain: 0x8d8f92,
};

// zip 7's own prototype (prototypes/worldmap/Viking Realm.dc.html, sea()
// method, "playful" style — the one shown in docs/design/img/worldmap.png)
// is the source of truth for the sea: short scattered wave squiggles, never
// touching land, each gently swelling in place rather than drifting.
const WAVE_COLOR = 0xffffff;
const WAVE_ALPHA = 0.42;
const WAVE_STEP_X = 40;
const WAVE_STEP_Y = 22;
const WAVE_WIDTH = 22;
const WAVE_DENSITY = 0.62; // fraction of grid points that get a wave, per the prototype's `dens`

function hash01(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}

interface WavePoint {
  x: number;
  y: number;
  phase: number;
  periodMs: number;
}

interface SpriteLayer {
  pool: Sprite[];
  active: Map<string, Sprite>;
  container: Container;
}

function createSpriteLayer(): SpriteLayer {
  const container = new Container();
  container.sortableChildren = true;
  return { pool: [], active: new Map(), container };
}

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
  private terrainBase = createSpriteLayer();
  private terrainTop = createSpriteLayer();
  private terrainFlat = new Graphics();
  private waveLayer = new Graphics();
  private wavePoints: WavePoint[] = [];
  private borderLayer = new Graphics();
  private hoverLayer = new Graphics();
  private fogLayer = new Graphics();
  private markerLayer = new Graphics();
  private labelPool: Text[] = [];
  private labelsUsed = 0;

  private textures: TileTextures | null = null;

  private camera: Camera;
  private viewport = { width: 0, height: 0 };
  private lastBuiltCamera: Camera | null = null;
  private cullQueued = false;
  private destroyed = false;

  private dragging = false;
  private dragMoved = 0;
  private lastPointer = { x: 0, y: 0 };
  private hoveredKey: string | null = null;
  // zip 4: "world view is already on screen and moving when the page loads" —
  // a gentle idle drift on the world map, cancelled on first user input.
  private idleDrift: boolean;

  private options: HexMapRendererOptions;

  constructor(options: HexMapRendererOptions) {
    this.options = options;
    this.idleDrift = options.mode === 'world';
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
    // World mode never renders tile-art sprites (see WORLD_TERRAIN_FILL
    // above), so it has no need for the (large, submodule-backed) texture
    // pack at all — only settlement mode loads it.
    this.textures = this.options.mode === 'settlement' ? await loadTileTextures() : null;
    if (this.destroyed) return;

    this.world.addChild(
      this.terrainBase.container,
      this.waveLayer,
      this.terrainFlat,
      this.borderLayer,
      this.hoverLayer,
      this.terrainTop.container,
      this.fogLayer,
    );
    app.stage.addChild(this.world, this.markerLayer);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
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
    if (this.options.mode === 'world') this.drawWaves();
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
    if (!this.dragging) {
      this.updateHover(e);
      return;
    }
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

  private onPointerLeave = () => {
    this.setHoveredCoord(null);
  };

  private updateHover(e: PointerEvent) {
    const canvas = this.app?.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      this.setHoveredCoord(null);
      return;
    }
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(this.camera, screen, this.viewport);
    this.setHoveredCoord(isoPixelToAxial(world, TILE_W, TILE_H));
  }

  private setHoveredCoord(coord: AxialCoord | null) {
    const key = coord ? coordKey(coord) : null;
    if (key === this.hoveredKey) return;
    this.hoveredKey = key;
    this.hoverLayer.clear();
    if (!coord) return;

    const { worldModel, mode } = this.options;
    if (mode === 'settlement' && !worldModel.isExplored(coord.q, coord.r)) return;
    const tile = worldModel.getTile(coord.q, coord.r);
    if (mode === 'world' && tile.terrain === 'sea') return;

    const grid = isoGridPosition(coord, TILE_W, TILE_H);
    const flat = isoTopPoints(TILE_W, TILE_H).flatMap((p) => [grid.x + p.x, grid.y + p.y]);
    this.hoverLayer
      .poly(flat)
      .fill({ color: HOVER_FILL, alpha: 0.28 })
      .stroke({ width: 4, color: HOVER_STROKE, alpha: 1 });
  }

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
    if (!this.app) return;
    if (this.options.mode === 'settlement' && !this.textures) return;
    this.lastBuiltCamera = { ...this.camera };
    const coords = this.visibleCoords();
    this.rebuildTerrain(coords);
    this.rebuildBordersAndFog(coords);
    this.rebuildMarkers();
    if (this.options.mode === 'world') this.rebuildWaves();
  }

  private rebuildTerrain(coords: AxialCoord[]) {
    if (this.options.mode === 'world') {
      this.rebuildTerrainFlat(coords);
      return;
    }

    const { worldModel } = this.options;
    const textures = this.textures!;
    const baseEntries = new Map<string, { texture: Texture; coord: AxialCoord }>();
    const topEntries = new Map<string, { texture: Texture; coord: AxialCoord }>();

    for (const c of coords) {
      if (!worldModel.isExplored(c.q, c.r)) continue; // true fog: not drawn
      const tile = worldModel.getTile(c.q, c.r);

      const key = coordKey(c);
      const textureKey = textureKeyFor(tile);
      baseEntries.set(key, { texture: textures.base[textureKey], coord: c });
      const topTexture = textures.top[textureKey];
      if (topTexture) topEntries.set(key, { texture: topTexture, coord: c });
    }

    this.syncSpriteLayer(this.terrainBase, baseEntries);
    this.syncSpriteLayer(this.terrainTop, topEntries);
  }

  // zip 7: world-map islands are flat coloured hexes, not tile art — see
  // WORLD_TERRAIN_FILL. Drawn straight into one Graphics layer rather than
  // pooled sprites since there's no texture (and thus no batching benefit)
  // to share.
  private rebuildTerrainFlat(coords: AxialCoord[]) {
    const { worldModel } = this.options;
    this.terrainFlat.clear();
    const top = isoTopPoints(TILE_W, TILE_H);
    // Each hex is its own fill, so float rounding at shared edges between
    // adjacent land hexes can leave a hairline gap the sea shows through.
    // Nudging every vertex outward from the hex centre by a hair makes
    // neighbouring fills overlap instead of abutting exactly.
    const cx = top.reduce((s, p) => s + p.x, 0) / top.length;
    const cy = top.reduce((s, p) => s + p.y, 0) / top.length;
    const inflated = top.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const pad = 0.75;
      return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad };
    });

    for (const c of coords) {
      const tile = worldModel.getTile(c.q, c.r);
      if (tile.terrain === 'sea') continue; // open sea is just the background

      const grid = isoGridPosition(c, TILE_W, TILE_H);
      const flat = inflated.flatMap((p) => [grid.x + p.x, grid.y + p.y]);
      this.terrainFlat.poly(flat).fill({ color: WORLD_TERRAIN_FILL[tile.terrain] });
    }
  }

  /** True if the given coord or any of its neighbours is land — waves never sit this close to shore. */
  private isNearLand(coord: AxialCoord): boolean {
    const { worldModel } = this.options;
    if (worldModel.getTile(coord.q, coord.r).terrain !== 'sea') return true;
    return NEIGHBOR_DIRS.some(
      (d) => worldModel.getTile(coord.q + d.q, coord.r + d.r).terrain !== 'sea',
    );
  }

  // Recomputes which open-water grid points get a wave squiggle for the
  // current viewport — same cadence as terrain (only on a cull rebuild).
  // Animating them (drawWaves, every tick) is a separate, much cheaper step.
  private rebuildWaves() {
    const margin = TILE_W;
    const rect = visibleWorldRect(this.camera, this.viewport, margin);
    const points: WavePoint[] = [];

    const yStart = Math.floor(rect.minY / WAVE_STEP_Y) * WAVE_STEP_Y;
    const xStart = Math.floor(rect.minX / WAVE_STEP_X) * WAVE_STEP_X;
    for (let y = yStart; y < rect.maxY; y += WAVE_STEP_Y) {
      for (let x = xStart; x < rect.maxX; x += WAVE_STEP_X) {
        if (hash01(x, y, 1) > WAVE_DENSITY) continue;
        const jx = x + (hash01(x, y, 2) - 0.5) * 16;
        const jy = y + (hash01(x, y, 3) - 0.5) * 12;
        if (this.isNearLand(isoPixelToAxial({ x: jx, y: jy }, TILE_W, TILE_H))) continue;
        points.push({
          x: jx,
          y: jy,
          phase: hash01(x, y, 4) * Math.PI * 2,
          periodMs: (3.4 + hash01(x, y, 5) * 3.2) * 1000,
        });
      }
    }
    this.wavePoints = points;
  }

  // zip 7 prototype's `vr-swell`: each wave nudges up-and-right and back,
  // independently timed — not a scrolling/drifting pattern.
  private drawWaves() {
    if (this.wavePoints.length === 0) {
      this.waveLayer.clear();
      return;
    }
    const now = Date.now();
    this.waveLayer.clear();
    for (const p of this.wavePoints) {
      const s = (Math.sin((now / p.periodMs) * Math.PI * 2 + p.phase) + 1) / 2;
      const x = p.x + s * 7;
      const y = p.y - s * 3;
      this.waveLayer
        .moveTo(x, y)
        .quadraticCurveTo(x + WAVE_WIDTH / 4, y - 4.5, x + WAVE_WIDTH / 2, y)
        .quadraticCurveTo(x + (WAVE_WIDTH * 3) / 4, y + 4.5, x + WAVE_WIDTH, y)
        .stroke({ width: 2, color: WAVE_COLOR, alpha: WAVE_ALPHA, cap: 'round' });
    }
  }

  private syncSpriteLayer(
    layer: SpriteLayer,
    entries: Map<string, { texture: Texture; coord: AxialCoord }>,
  ) {
    for (const [key, { texture, coord }] of entries) {
      let sprite = layer.active.get(key);
      const isNew = !sprite;
      if (!sprite) {
        sprite = layer.pool.pop() ?? new Sprite();
        layer.active.set(key, sprite);
      }
      sprite.texture = texture;
      sprite.width = TILE_W;
      sprite.height = TILE_CANVAS_H;
      const grid = isoGridPosition(coord, TILE_W, TILE_H);
      sprite.position.set(grid.x, grid.y - TILE_TOPFACE_Y_OFFSET);
      sprite.zIndex = isoDepthKey(coord);
      if (isNew) layer.container.addChild(sprite);
    }

    for (const [key, sprite] of layer.active) {
      if (entries.has(key)) continue;
      layer.container.removeChild(sprite);
      layer.pool.push(sprite);
      layer.active.delete(key);
    }
    layer.container.sortChildren();
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
    canvas?.removeEventListener('pointerleave', this.onPointerLeave);
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
