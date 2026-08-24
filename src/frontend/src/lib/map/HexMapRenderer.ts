// The performance-critical piece. A plain class (no Vue, no reactivity)
// wrapping a single PixiJS (WebGL) canvas.
//
// Why this shape, vs. the legacy Angular renderer it replaces
// (legacy/frontend/map/src/components/{map,chunk,tile}): that version gave
// every tile its own Angular component backed by an SVG element, so panning
// across a few hundred hexes meant a few hundred live DOM nodes plus Angular
// change detection over all of them. Here:
//  - the whole map is at most a handful of PIXI.Graphics objects (one per
//    visual layer: terrain, borders, fog, markers) that PixiJS batches into
//    very few WebGL draw calls regardless of hex count;
//  - a layer is only rebuilt when the *set* of visible hexes actually
//    changes (camera moved by more than half a hex, or zoomed), never on
//    every animation frame;
//  - hex data is generated on demand and cached in WorldModel, so memory is
//    bounded by hexes actually visited, not by total world size;
//  - Vue never sees per-tile data — it only reads a few primitive refs.
import { Application, Graphics, Text } from 'pixi.js';
import type { AxialCoord } from '../hex/coords';
import { coordKey, hexDistance } from '../hex/coords';
import {
  flatTopCorners,
  flatTopPixel,
  isoDepthKey,
  isoGridPosition,
  isoSidePoints,
  isoTopPoints,
} from '../hex/geometry';
import type { Camera } from './camera';
import { screenToWorld, visibleWorldRect, worldToScreen } from './camera';
import type { WorldModel } from './WorldModel';
import type { Settlement, Terrain, Tile } from './types';

export type RenderMode = 'world' | 'settlement';

const TERRAIN_FILL: Record<Terrain, { top: number; side: number }> = {
  sea: { top: 0x1e5473, side: 0x17415a },
  sand: { top: 0xddc37e, side: 0xc7a35c },
  grass: { top: 0x5b9128, side: 0xae7330 },
  forest: { top: 0x3f7a20, side: 0xae7330 },
  mountain: { top: 0x7d8a90, side: 0x5c666b },
};

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

const WORLD_HEX_SIZE = 34;
const ISO_TILE_W = 96;
const ISO_TILE_H = 48; // 96 * 0.46, per the 92/200 ratio documented in prototypes/village_view
const ISO_SKIRT = 14; // 96 * 0.14

export class HexMapRenderer {
  private app: Application | null = null;
  private terrainLayer = new Graphics();
  private borderLayer = new Graphics();
  private fogLayer = new Graphics();
  private markerLayer = new Graphics();
  private labelPool: Text[] = [];
  private labelsUsed = 0;

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
    this.camera =
      options.mode === 'settlement'
        ? this.settlementCameraOrigin()
        : { x: 0, y: 0, zoom: 0.9 };
  }

  private settlementCameraOrigin(): Camera {
    const settlement = this.settlement();
    if (!settlement) return { x: 0, y: 0, zoom: 1 };
    const p = isoGridPosition({ q: settlement.q, r: settlement.r }, ISO_TILE_W, ISO_TILE_H);
    return { x: p.x + ISO_TILE_W / 2, y: p.y + ISO_TILE_H / 2, zoom: 1.1 };
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

    app.stage.addChild(this.terrainLayer, this.borderLayer, this.fogLayer, this.markerLayer);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    // Ticker only advances world-model resource ticks + redraws markers whose
    // labels are time-based (fleet ETAs); terrain/border/fog stay untouched
    // unless the camera moves, so this is cheap even at 60fps.
    app.ticker.add(this.onTick);

    this.rebuildAll();
  }

  resize(width: number, height: number) {
    if (!this.app) return;
    this.viewport = { width, height };
    this.app.renderer.resize(width, height);
    this.scheduleCull();
  }

  private onTick = () => {
    this.options.worldModel.tick();
    this.rebuildMarkers();
    if (this.idleDrift) {
      this.camera = { ...this.camera, x: this.camera.x + 0.18, y: this.camera.y + 0.05 };
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
    const zoom = Math.min(4, Math.max(0.2, this.camera.zoom * factor));
    this.camera = { ...this.camera, zoom };
    const after = screenToWorld(this.camera, screen, this.viewport);
    this.camera = {
      ...this.camera,
      x: this.camera.x + (before.x - after.x),
      y: this.camera.y + (before.y - after.y),
    };
    this.scheduleCull();
  };

  private handleClick(e: PointerEvent) {
    const canvas = this.app?.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(this.camera, screen, this.viewport);
    const coord = this.pixelToAxial(world);
    const tile = this.options.worldModel.getTile(coord.q, coord.r);
    this.options.onHexClick?.(coord, tile);
  }

  private pixelToAxial(world: { x: number; y: number }): AxialCoord {
    if (this.options.mode === 'world') {
      const size = WORLD_HEX_SIZE;
      const qf = (2 / 3) * (world.x / size);
      const rf = (-1 / 3) * (world.x / size) + (Math.sqrt(3) / 3) * (world.y / size);
      return cubeRound(qf, rf);
    }
    const colPitch = ISO_TILE_W * 0.75;
    const col = Math.round(world.x / colPitch);
    const row = Math.round((world.y - (col & 1 ? ISO_TILE_H / 2 : 0)) / ISO_TILE_H);
    const q = col;
    const r = row - (col - (col & 1)) / 2;
    return { q, r };
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
    const unit = this.options.mode === 'world' ? WORLD_HEX_SIZE : ISO_TILE_W;
    const moved = Math.hypot(this.camera.x - prev.x, this.camera.y - prev.y);
    return moved > unit * 0.4 || Math.abs(this.camera.zoom - prev.zoom) > 0.02;
  }

  private visibleCoords(): AxialCoord[] {
    const margin = this.options.mode === 'world' ? WORLD_HEX_SIZE * 2 : ISO_TILE_W * 2;
    const rect = visibleWorldRect(this.camera, this.viewport, margin);
    const out: AxialCoord[] = [];
    if (this.options.mode === 'world') {
      const size = WORLD_HEX_SIZE;
      const corners = [
        { x: rect.minX, y: rect.minY },
        { x: rect.maxX, y: rect.minY },
        { x: rect.minX, y: rect.maxY },
        { x: rect.maxX, y: rect.maxY },
      ].map((p) => this.pixelToAxial(p));
      const qMin = Math.min(...corners.map((c) => c.q)) - 1;
      const qMax = Math.max(...corners.map((c) => c.q)) + 1;
      const rMin = Math.min(...corners.map((c) => c.r)) - 1;
      const rMax = Math.max(...corners.map((c) => c.r)) + 1;
      for (let q = qMin; q <= qMax; q++) {
        for (let r = rMin; r <= rMax; r++) {
          const p = flatTopPixel({ q, r }, size);
          if (p.x >= rect.minX - size && p.x <= rect.maxX + size && p.y >= rect.minY - size && p.y <= rect.maxY + size) {
            out.push({ q, r });
          }
        }
      }
      return out;
    }
    const colPitch = ISO_TILE_W * 0.75;
    const colMin = Math.floor(rect.minX / colPitch) - 1;
    const colMax = Math.ceil(rect.maxX / colPitch) + 1;
    const rowMin = Math.floor(rect.minY / ISO_TILE_H) - 1;
    const rowMax = Math.ceil(rect.maxY / ISO_TILE_H) + 1;
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
    this.lastBuiltCamera = { ...this.camera };
    const coords = this.visibleCoords();
    if (this.options.mode === 'world') this.rebuildWorld(coords);
    else this.rebuildSettlement(coords);
    this.rebuildMarkers();
  }

  private toScreen(world: { x: number; y: number }) {
    return worldToScreen(this.camera, world, this.viewport);
  }

  private rebuildWorld(coords: AxialCoord[]) {
    const { worldModel } = this.options;
    const size = WORLD_HEX_SIZE;
    const corners = flatTopCorners(size * this.camera.zoom);
    this.terrainLayer.clear();
    this.borderLayer.clear();

    for (const c of coords) {
      const tile = worldModel.getTile(c.q, c.r);
      const center = this.toScreen(flatTopPixel(c, size));
      const pts = corners.flatMap((p) => [center.x + p.x, center.y + p.y]);
      const color = TERRAIN_FILL[tile.terrain].top;
      this.terrainLayer.poly(pts).fill({ color, alpha: 1 });
      if (tile.ownerId) {
        const owner = worldModel.getSettlement(tile.ownerId);
        const mine = owner?.ownerId === this.options.playerId;
        this.borderLayer
          .poly(pts)
          .stroke({ width: 2, color: mine ? GOLD : RIVAL, alpha: 0.85 });
      }
    }

    for (const settlement of worldModel.listSettlements()) {
      const center = this.toScreen(flatTopPixel({ q: settlement.q, r: settlement.r }, size));
      const mine = settlement.ownerId === this.options.playerId;
      this.markerLayer
        .circle(center.x, center.y, 6 * this.camera.zoom)
        .fill({ color: mine ? GOLD : RIVAL });
    }

    this.fogLayer.clear();
  }

  private rebuildSettlement(coords: AxialCoord[]) {
    const { worldModel } = this.options;
    const settlement = this.settlement();
    this.terrainLayer.clear();
    this.borderLayer.clear();
    this.fogLayer.clear();
    this.markerLayer.clear();
    if (!settlement) return;

    const visible = worldModel.visibleHexes(settlement);
    const borderRadius = worldModel.borderRadius(settlement);
    const sorted = [...coords].sort((a, b) => isoDepthKey(a) - isoDepthKey(b));

    for (const c of sorted) {
      const explored = worldModel.isExplored(c.q, c.r);
      if (!explored) continue; // unexplored hexes are simply not drawn (true fog)

      const tile = worldModel.getTile(c.q, c.r);
      const grid = isoGridPosition(c, ISO_TILE_W, ISO_TILE_H);
      const origin = this.toScreen({ x: grid.x, y: grid.y });
      const zoom = this.camera.zoom;
      const top = isoTopPoints(ISO_TILE_W * zoom, ISO_TILE_H * zoom).map((p) => ({
        x: origin.x + p.x,
        y: origin.y + p.y,
      }));
      const side = isoSidePoints(ISO_TILE_W * zoom, ISO_TILE_H * zoom, ISO_SKIRT * zoom).map(
        (p) => ({ x: origin.x + p.x, y: origin.y + p.y + (ISO_TILE_H * zoom) / 2 }),
      );
      const fill = TERRAIN_FILL[tile.terrain];

      if (tile.terrain !== 'sea') {
        this.terrainLayer.poly(side.flatMap((p) => [p.x, p.y])).fill({ color: fill.side });
      }
      this.terrainLayer.poly(top.flatMap((p) => [p.x, p.y])).fill({ color: fill.top });

      if (tile.buildingType) {
        const cx = top.reduce((s, p) => s + p.x, 0) / top.length;
        const cy = top.reduce((s, p) => s + p.y, 0) / top.length;
        drawBuildingSprite(this.markerLayer, tile.buildingType, cx, cy, ISO_TILE_W * zoom);
      }

      if (tile.ownerId) {
        const dist = hexDistance({ q: settlement.q, r: settlement.r }, c);
        const mine = tile.ownerId === settlement.id;
        if (dist === borderRadius || isEdgeOfClaim(worldModel, c, tile.ownerId)) {
          this.borderLayer
            .poly(top.flatMap((p) => [p.x, p.y]))
            .stroke({ width: 3, color: mine ? GOLD : RIVAL, alpha: 0.9 });
        }
      }

      const isVisible = visible.has(coordKey(c));
      if (!isVisible) {
        this.fogLayer
          .poly(top.flatMap((p) => [p.x, p.y]))
          .fill({ color: FOG_SCOUTED, alpha: 0.55 });
      }
    }
  }

  private rebuildMarkers() {
    if (!this.app || this.options.mode !== 'world') return;
    this.labelsUsed = 0;
    const size = WORLD_HEX_SIZE;
    const now = Date.now();
    for (const fleet of this.options.worldModel.listFleets()) {
      const t = Math.min(1, Math.max(0, (now - fleet.departedAt) / (fleet.etaAt - fleet.departedAt || 1)));
      const from = flatTopPixel({ q: fleet.fromQ, r: fleet.fromR }, size);
      const to = flatTopPixel({ q: fleet.toQ, r: fleet.toR }, size);
      const world = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      const screen = this.toScreen(world);
      const remainingMs = Math.max(0, fleet.etaAt - now);
      const label = this.acquireLabel();
      label.text = formatEta(remainingMs);
      label.position.set(screen.x + 8, screen.y - 8);
      label.visible = true;
    }
    for (let i = this.labelsUsed; i < this.labelPool.length; i++) this.labelPool[i].visible = false;
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

  panTo(coord: AxialCoord, animate = true) {
    const target =
      this.options.mode === 'world'
        ? flatTopPixel(coord, WORLD_HEX_SIZE)
        : (() => {
            const p = isoGridPosition(coord, ISO_TILE_W, ISO_TILE_H);
            return { x: p.x + ISO_TILE_W / 2, y: p.y + ISO_TILE_H / 2 };
          })();
    if (!animate) {
      this.camera = { ...this.camera, x: target.x, y: target.y };
      this.rebuildAll();
      return;
    }
    this.camera = { ...this.camera, x: target.x, y: target.y };
    this.scheduleCull();
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

const BUILDING_COLOR: Record<NonNullable<Tile['buildingType']>, number> = {
  longhouse: 0xffc55c,
  hut: 0xc98b4b,
  farm: 0x8fc35a,
  watchtower: 0x6f8fa8,
};

// No tile art yet (zip 7's "no images (yet)" applies here too) — buildings
// read as a simple roofed silhouette in the owner's material colour.
function drawBuildingSprite(layer: Graphics, type: NonNullable<Tile['buildingType']>, cx: number, cy: number, tileW: number) {
  const w = tileW * 0.34;
  const h = w * 0.62;
  const color = BUILDING_COLOR[type];
  layer
    .poly([cx - w / 2, cy + h / 2, cx + w / 2, cy + h / 2, cx + w / 2, cy - h / 4, cx, cy - h * 0.7, cx - w / 2, cy - h / 4])
    .fill({ color })
    .stroke({ width: 1, color: 0x0b1116, alpha: 0.6 });
}

function isEdgeOfClaim(worldModel: WorldModel, c: AxialCoord, ownerId: string): boolean {
  const dirs = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  return dirs.some((d) => worldModel.getTile(c.q + d.q, c.r + d.r).ownerId !== ownerId);
}

function cubeRound(qf: number, rf: number): AxialCoord {
  let x = qf;
  let z = rf;
  let y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);
  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

function formatEta(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
