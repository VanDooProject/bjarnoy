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
import { Application, BlurFilter, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { AxialCoord } from '../hex/coords';
import { coordKey, hexesInRadius } from '../hex/coords';
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
// zip 9: "unexplored hexes are hidden" — a dense white mist, distinct from
// the darker grey used for the scouted-but-not-visible ring (FOG_SCOUTED).
// Drawn as a per-hex fill rather than a fixed CSS backdrop so it keeps
// covering new hexes as the camera pans past the settlement's explored
// radius, instead of a static gradient behind the terrain that peters out
// and makes the map read as a bounded box.
const FOG_UNEXPLORED = 0xe9f0f4;
const HOVER_FILL = 0xffffff;
const HOVER_STROKE = 0xffe9c2;

// zip 7: islands on the world map are "small hexes (no images (yet))" —
// unlike the settlement view, which renders full tile-art sprites, the
// world map draws flat coloured hex faces. The design doc's IslandMap
// terrain-tone table (prototypes/landing_pages/README.md) gives raw CSS
// values, but the rendered mockup (docs/design/img/worldmap.png) shows a
// visibly more muted palette on top of it — these are colour-picked
// straight from that screenshot so the app actually matches what's shown.
const WORLD_TERRAIN_FILL: Record<Terrain, number> = {
  sea: 0x215a7a, // unused (open sea has no tile at all in world mode)
  sand: 0x9c8a5c,
  grass: 0x4e7a3a,
  forest: 0x365e2f,
  mountain: 0x5f6b6d,
};

// zip 7's own prototype (prototypes/worldmap/Viking Realm.dc.html, sea()
// method, "playful" style — the one shown in docs/design/img/worldmap.png)
// is the source of truth for the sea: short scattered wave squiggles, never
// touching land, each gently swelling in place rather than drifting.
// The prototype's own numbers (stepX/stepY 46/26, wave width 26, ...) are
// sized against its own hex, which is only WW=40px wide there. Our hex is
// TILE_W=168px wide, so every wave measurement below is scaled up by the
// same ratio (168/40 = 4.2) to read at the same size relative to the hex.
const WORLD_PROTOTYPE_HEX_W = 40;
const WAVE_SCALE = 168 / WORLD_PROTOTYPE_HEX_W;
const WAVE_COLOR = 0xffffff;
const WAVE_ALPHA = 0.42;
const WAVE_STEP_X = 46 * WAVE_SCALE;
const WAVE_STEP_Y = 26 * WAVE_SCALE;
const WAVE_WIDTH = 26 * WAVE_SCALE;
const WAVE_STROKE = 2 * WAVE_SCALE;
const WAVE_JITTER_X = 16 * WAVE_SCALE;
const WAVE_JITTER_Y = 12 * WAVE_SCALE;
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
  /** zip 9: "hover = stats tooltip". Fired on every hover change, `null` on leave. */
  onHoverChange?: (info: HoverInfo | null) => void;
}

/** What the settlement view's hover tooltip needs, plus screen position to anchor it. */
export interface HoverInfo {
  screenX: number;
  screenY: number;
  title: string;
  subtitle: string;
  stat: string;
}

const BUILDING_LABELS: Record<NonNullable<Tile['buildingType']>, string> = {
  longhouse: 'Longhouse',
  hut: 'Hut',
  farm: 'Farm',
  tower: 'Watchtower',
};

const TERRAIN_LABELS: Record<Terrain, string> = {
  sea: 'Open water',
  sand: 'Shore',
  grass: 'Grassland',
  forest: 'Forest',
  mountain: 'Mountain',
};

// One tile-art size for both views — see the module comment above.
const TILE_W = 168;
const TILE_H = TILE_W * TILE_ART_TOPFACE_H_FRAC;
const TILE_CANVAS_H = TILE_W * (TILE_ART_NATIVE_H / TILE_ART_NATIVE_W);
const TILE_TOPFACE_Y_OFFSET = TILE_W * TILE_ART_TOPFACE_Y_FRAC;

const WORLD_DEFAULT_ZOOM = 0.22;
// Ceiling for the settlement camera's initial zoom — settlement level 1's
// explored radius is ~5 hexes, which at 0.85 filled almost the entire
// default viewport on its own, hiding the fog entirely until the player
// panned. zoomForFogMargin picks the real initial zoom (usually well below
// this) so FOG_MARGIN_HEXES of fog is guaranteed visible from frame one.
const SETTLEMENT_DEFAULT_ZOOM = 0.85;
// How many hexes of white (unexplored) fog zoomForFogMargin guarantees
// visible past the settlement's explored ring, on every side, at rest.
const FOG_MARGIN_HEXES = 10;
// Floor for zoomForFogMargin — a very high-level settlement's explored ring
// is already large, and without a floor the margin target would zoom out
// far enough to make individual hexes too small to read or click precisely.
const FOG_MARGIN_MIN_ZOOM = 0.22;
// Per-hex random offset (in hexes) applied to the explored-ring distance
// before it's used for the fog alpha ramp. Hex distance to the settlement is
// a perfect hexagon ring, so without this the mist's inner edge reads as a
// crisp hex-shaped cutout; the offset roughens that boundary hex-by-hex, and
// the fog layer's BlurFilter smooths the result into an irregular, cloud-like
// edge instead.
const FOG_EDGE_NOISE_HEXES = 3;
// Past this many hexes beyond the explored ring, the alpha ramp has
// saturated even at the noisiest edge (FOG_MARGIN_HEXES plus the worst-case
// FOG_EDGE_NOISE_HEXES offset) — so both rebuildBordersAndFog and
// rebuildTerrain treat it as fully opaque: fog is painted flat solid white
// (skipping the jitter/edge-noise math) and terrain sprites stop being drawn
// underneath it, since nothing could show through either way. Keeping this
// one distance shared between the two is what closes the seam where terrain
// used to disappear before the fog above it had actually reached full
// opacity.
const FOG_TERRAIN_CULL_HEXES = FOG_MARGIN_HEXES + FOG_EDGE_NOISE_HEXES;

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
    const center = { x: grid.x + TILE_W / 2, y: grid.y + TILE_H / 2 };
    return { ...center, zoom: this.zoomForFogMargin(settlement, center) };
  }

  /**
   * Picks the initial settlement zoom so at least FOG_MARGIN_HEXES of white
   * (unexplored) fog is visible past the settlement's explored ring on
   * every side, without the camera ever having to pan first — the map
   * should read as continuing under fog from the very first frame, not
   * just after the player happens to drag far enough to find the edge.
   * Falls back to SETTLEMENT_DEFAULT_ZOOM before the viewport size is known
   * (constructor time) or if a wider margin would need to zoom in past it
   * (a high-level settlement's own explored ring is already generous).
   */
  private zoomForFogMargin(settlement: Settlement, center: { x: number; y: number }): number {
    if (this.viewport.width === 0 || this.viewport.height === 0) return SETTLEMENT_DEFAULT_ZOOM;

    const targetRadius = this.options.worldModel.exploredRadius(settlement) + FOG_MARGIN_HEXES;
    let maxDx = 0;
    let maxDy = 0;
    for (const c of hexesInRadius({ q: settlement.q, r: settlement.r }, targetRadius)) {
      const g = isoGridPosition(c, TILE_W, TILE_H);
      maxDx = Math.max(maxDx, Math.abs(g.x + TILE_W / 2 - center.x));
      maxDy = Math.max(maxDy, Math.abs(g.y + TILE_H / 2 - center.y));
    }
    if (maxDx === 0 || maxDy === 0) return SETTLEMENT_DEFAULT_ZOOM;

    const zoom = Math.min((this.viewport.width / 2) / maxDx, (this.viewport.height / 2) / maxDy);
    return Math.min(SETTLEMENT_DEFAULT_ZOOM, Math.max(FOG_MARGIN_MIN_ZOOM, zoom));
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
    // zoomForFogMargin needs the real viewport size to pick a zoom — the
    // constructor ran before it, with viewport still {0,0}, so the camera
    // it produced there fell back to SETTLEMENT_DEFAULT_ZOOM. Redo it now
    // that the viewport is actually known.
    if (this.options.mode === 'settlement') this.camera = this.settlementCameraOrigin();
    // World mode never renders tile-art sprites (see WORLD_TERRAIN_FILL
    // above), so it has no need for the (large, submodule-backed) texture
    // pack at all — only settlement mode loads it.
    this.textures = this.options.mode === 'settlement' ? await loadTileTextures() : null;
    if (this.destroyed) return;

    // Softens the fog layer's hard hex edges into the mockup's blurred
    // mist-cloud look (Viking Realm.dc.html's `fogs`: a blurred radial
    // gradient per hex) instead of a flat tiled sheet — cheap since it's one
    // filter over one Graphics layer, not per-hex.
    this.fogLayer.filters = [new BlurFilter({ strength: 10, quality: 3 })];

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
    // The hover tooltip otherwise stays pinned to whatever hex was last
    // hovered while the player drags the camera underneath it — onPointerMove
    // skips updateHover entirely while dragging, so nothing would clear it
    // on its own until the drag ends over a different hex.
    this.setHoveredCoord(null);
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
    if (!coord) {
      this.options.onHoverChange?.(null);
      return;
    }

    const { worldModel, mode } = this.options;
    if (mode === 'settlement' && !worldModel.isExplored(coord.q, coord.r)) {
      this.options.onHoverChange?.(null);
      return;
    }
    const tile = worldModel.getTile(coord.q, coord.r);
    if (mode === 'world' && tile.terrain === 'sea') {
      this.options.onHoverChange?.(null);
      return;
    }

    const grid = isoGridPosition(coord, TILE_W, TILE_H);
    const flat = isoTopPoints(TILE_W, TILE_H).flatMap((p) => [grid.x + p.x, grid.y + p.y]);
    this.hoverLayer
      .poly(flat)
      .fill({ color: HOVER_FILL, alpha: 0.28 })
      .stroke({ width: 4, color: HOVER_STROKE, alpha: 1 });

    if (mode === 'settlement') this.options.onHoverChange?.(this.hoverInfoFor(tile, grid));
  }

  private hoverInfoFor(tile: Tile, grid: { x: number; y: number }): HoverInfo {
    const screen = this.toScreen({ x: grid.x + TILE_W / 2, y: grid.y + TILE_TOPFACE_Y_OFFSET });
    const owner = tile.ownerId ? this.options.worldModel.getSettlement(tile.ownerId) : undefined;
    const mine = owner?.ownerId === this.options.playerId;

    if (tile.buildingType) {
      const title = BUILDING_LABELS[tile.buildingType];
      const subtitle = owner ? (mine ? owner.name : `${owner.ownerName}'s ${owner.name}`) : title;
      return { screenX: screen.x, screenY: screen.y, title, subtitle, stat: `Level ${tile.buildingLevel ?? 1}` };
    }
    if (owner) {
      const subtitle = mine ? owner.name : `${owner.ownerName}'s ${owner.name}`;
      return {
        screenX: screen.x,
        screenY: screen.y,
        title: TERRAIN_LABELS[tile.terrain],
        subtitle,
        stat: mine ? 'Click to build here' : 'Claimed ground',
      };
    }
    return {
      screenX: screen.x,
      screenY: screen.y,
      title: TERRAIN_LABELS[tile.terrain],
      subtitle: 'Unclaimed',
      stat: '',
    };
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
      // Terrain is drawn under the fog (not just on explored ground) so it
      // can show through the thin part of the unexplored mist near the
      // scouted ring, instead of the tile popping into existence only once
      // the fog fully clears — but past FOG_TERRAIN_CULL_HEXES the mist above
      // it is guaranteed fully opaque (rebuildBordersAndFog switches to a
      // flat solid fill there), so there's nothing to gain by drawing it
      // that far out.
      if (
        !worldModel.isExplored(c.q, c.r) &&
        worldModel.distanceBeyondExplored(c.q, c.r) > FOG_TERRAIN_CULL_HEXES
      ) {
        continue;
      }
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
        const jx = x + (hash01(x, y, 2) - 0.5) * WAVE_JITTER_X;
        const jy = y + (hash01(x, y, 3) - 0.5) * WAVE_JITTER_Y;
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
      const x = p.x + s * 7 * WAVE_SCALE;
      const y = p.y - s * 3 * WAVE_SCALE;
      const bump = 4.5 * WAVE_SCALE;
      this.waveLayer
        .moveTo(x, y)
        .quadraticCurveTo(x + WAVE_WIDTH / 4, y - bump, x + WAVE_WIDTH / 2, y)
        .quadraticCurveTo(x + (WAVE_WIDTH * 3) / 4, y + bump, x + WAVE_WIDTH, y)
        .stroke({ width: WAVE_STROKE, color: WAVE_COLOR, alpha: WAVE_ALPHA, cap: 'round' });
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

  // isoTopPoints()'s 6 corners, nudged outward from the hex centre by a
  // hair so adjacent hex fills overlap instead of exactly abutting — closes
  // the hairline seams float rounding would otherwise leave between
  // neighbouring fog tiles (same trick as rebuildTerrainFlat's `inflated`).
  private inflatedTop(): { x: number; y: number }[] {
    const top = isoTopPoints(TILE_W, TILE_H);
    const cx = top.reduce((s, p) => s + p.x, 0) / top.length;
    const cy = top.reduce((s, p) => s + p.y, 0) / top.length;
    return top.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / len) * 0.75, y: p.y + (dy / len) * 0.75 };
    });
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

    const inflatedTop = this.inflatedTop();

    for (const c of coords) {
      if (mode === 'settlement' && !worldModel.isExplored(c.q, c.r)) {
        // A white mist over ground the settlement has never scouted — covers
        // every hex the camera can currently see, however far it's panned,
        // so the world reads as continuing forever under fog rather than
        // ending at a hard edge. Terrain is still drawn underneath
        // (rebuildTerrain no longer skips unexplored hexes), so instead of a
        // hard white wall right past the scouted ring, the mist fades in
        // over FOG_MARGIN_HEXES hexes — thin enough at the ring's edge to
        // let ground show through, thickening to near-opaque by the time the
        // camera's default fog margin ends. Slight per-hex alpha jitter
        // (same hash01 noise the wave layer uses) keeps it from reading as
        // one flat, obviously-tiled sheet.
        const grid = isoGridPosition(c, TILE_W, TILE_H);
        const flat = inflatedTop.flatMap((p) => [grid.x + p.x, grid.y + p.y]);
        const beyondRaw = worldModel.distanceBeyondExplored(c.q, c.r);
        if (beyondRaw > FOG_TERRAIN_CULL_HEXES) {
          // Guaranteed saturated (see FOG_TERRAIN_CULL_HEXES) — paint flat
          // solid white instead of computing jitter/edge noise for a result
          // that would round to the same fully-opaque fill anyway, and skip
          // drawing the (now-culled) terrain sprite underneath.
          this.fogLayer.poly(flat).fill({ color: FOG_UNEXPLORED, alpha: 1 });
          continue;
        }
        const jitter = hash01(c.q, c.r, 9);
        const edgeNoise = (hash01(c.q, c.r, 13) - 0.5) * 2 * FOG_EDGE_NOISE_HEXES;
        const beyond = beyondRaw + edgeNoise;
        const t = Math.min(1, Math.max(0, beyond / FOG_MARGIN_HEXES));
        const alpha = 0.1 + t * 0.8 + jitter * 0.08;
        this.fogLayer.poly(flat).fill({ color: FOG_UNEXPLORED, alpha });
        continue;
      }
      const tile = worldModel.getTile(c.q, c.r);
      if (mode === 'world' && tile.terrain === 'sea') continue;

      const grid = isoGridPosition(c, TILE_W, TILE_H);
      const top = isoTopPoints(TILE_W, TILE_H).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
      const flat = top.flatMap((p) => [p.x, p.y]);

      if (tile.ownerId) {
        const owner = worldModel.getSettlement(tile.ownerId);
        const mine = owner?.ownerId === playerId;
        const color = mine ? GOLD : RIVAL;

        // "Glow+wash" (docs/design/zip-brainstorms.md, zip 9): a soft
        // translucent fill across every owned hex ("wash"), with a
        // brighter, thicker stroke reserved for the realm's *outer* edges
        // only ("glow") — drawn as two overlapping strokes (a wide, faint
        // one under a thin, solid one) to fake a soft glow without a
        // dedicated blur filter. Previously this stroked the *entire*
        // outline of every claimed hex, including edges shared with
        // another owned hex, which drew a solid mesh over the whole realm
        // instead of a border around it.
        this.borderLayer.poly(flat).fill({ color, alpha: 0.12 });

        for (const edge of outerEdgesOf(worldModel, c, tile.ownerId)) {
          const a = top[edge[0]];
          const b = top[edge[1]];
          this.borderLayer
            .moveTo(a.x, a.y)
            .lineTo(b.x, b.y)
            .stroke({ width: 7, color, alpha: 0.25, cap: 'round' });
          this.borderLayer
            .moveTo(a.x, a.y)
            .lineTo(b.x, b.y)
            .stroke({ width: 2.5, color, alpha: 0.95, cap: 'round' });
        }
      }

      if (visible && !visible.has(coordKey(c))) {
        this.fogLayer.poly(flat).fill({ color: FOG_SCOUTED, alpha: 0.55 });
      }
    }
  }

  private rebuildMarkers() {
    this.markerLayer.clear();
    if (this.options.mode === 'settlement') {
      this.rebuildSettlementLabels();
      return;
    }
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

      // Settlers-II-style owner label under the marker (see
      // prototypes/worldmap, `world()`'s `owners`/`labels` rendering).
      const ownerLabel = this.acquireLabel();
      ownerLabel.text = settlement.ownerName;
      ownerLabel.style.fill = mine ? GOLD : RIVAL;
      ownerLabel.anchor.set(0.5, 0);
      ownerLabel.position.set(center.x, center.y + 8 * this.camera.zoom + 4);
      ownerLabel.visible = true;
    }

    for (const island of worldModel.listIslands()) {
      const grid = isoGridPosition({ q: island.q, r: island.r }, TILE_W, TILE_H);
      const center = this.toScreen({ x: grid.x + TILE_W / 2, y: grid.y + TILE_H / 2 });
      const label = this.acquireLabel();
      label.text = island.name;
      label.style.fill = 0xe8f0f5;
      label.anchor.set(0.5, 1);
      label.position.set(center.x, center.y - 6 * this.camera.zoom - 4);
      label.visible = true;
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
      label.style.fill = 0xe8f0f5;
      label.anchor.set(0, 0);
      label.position.set(screen.x + 8, screen.y - 8);
      label.visible = true;
    }
    for (let i = this.labelsUsed; i < this.labelPool.length; i++) this.labelPool[i].visible = false;
  }

  // zip 9's settlement view floats a name badge over the longhouse hex
  // itself — a dot + settlement name in a dark rounded pill, bordered in
  // the owner's colour (Viking Realm.dc.html's `labels`: "HAFRSVIK" over
  // yours, "DRAUGRVIK" over a rival's) — distinct from the HUD's top-bar
  // chip. Recomputed every tick (via the same rebuildMarkers() call world
  // mode uses for its own labels), not just on cull rebuilds, so it stays
  // glued to the hex while the camera pans.
  private rebuildSettlementLabels() {
    const { worldModel, playerId } = this.options;
    this.labelsUsed = 0;

    for (const settlement of worldModel.listSettlements()) {
      // Don't reveal a rival's name over ground you haven't scouted.
      if (!worldModel.isExplored(settlement.q, settlement.r)) continue;
      const grid = isoGridPosition({ q: settlement.q, r: settlement.r }, TILE_W, TILE_H);
      const top = this.toScreen({ x: grid.x + TILE_W / 2, y: grid.y + TILE_TOPFACE_Y_OFFSET });
      const mine = settlement.ownerId === playerId;
      const color = mine ? GOLD : RIVAL;

      // markerLayer is a sibling of the camera-scaled `world` container (see
      // mount()), so it already draws in fixed screen pixels — `top` above
      // is a screen-space point via toScreen(). Scaling the pill's own
      // geometry by camera.zoom on top of that shrank it as you zoomed out,
      // squeezing the label against its padding; the badge stays a constant
      // on-screen size at and below the settlement's default zoom, like the
      // HUD chrome. Past that zoom level it grows again — a fixed-size badge
      // reads as undersized once you've zoomed in close to the (now much
      // larger) hex art around it.
      const label = this.acquireLabel();
      label.text = settlement.name.toUpperCase();
      label.style.fill = 0xe8f0f5;
      const zoomScale = Math.max(1, this.camera.zoom / SETTLEMENT_DEFAULT_ZOOM);
      label.style.fontSize = 13 * zoomScale;
      label.anchor.set(0, 0.5);

      const dotR = 4 * zoomScale;
      const padX = 12 * zoomScale;
      const gap = 8 * zoomScale;
      const pillH = 26 * zoomScale;
      const pillW = padX * 2 + dotR * 2 + gap + label.width;
      const pillX = top.x - pillW / 2;
      const pillY = top.y - 30 * zoomScale - pillH;

      this.markerLayer
        .roundRect(pillX, pillY, pillW, pillH, pillH / 2)
        .fill({ color: 0x08121a, alpha: 0.8 })
        .stroke({ width: 1, color, alpha: 0.9 });
      this.markerLayer.circle(pillX + padX + dotR, pillY + pillH / 2, dotR).fill({ color });
      label.position.set(pillX + padX + dotR * 2 + gap, pillY + pillH / 2);
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

// isoTopPoints()'s 6 corners (P0..P5) form edges [P0,P1],[P1,P2],...,[P5,P0];
// this maps each NEIGHBOR_DIRS index to the corner-index pair of the one
// edge that actually faces that neighbour (derived by comparing each
// direction's screen-space offset to each edge's outward normal — see the
// worked-out mapping in this file's history/PR description). Used so only
// the realm's true outer edges get a border stroke, not every claimed
// hex's full hexagon outline.
const EDGE_FOR_DIR = [3, 2, 1, 0, 5, 4];

/** Corner-index pairs (into isoTopPoints()) of a claimed hex's edges that face an unclaimed/rival neighbour. */
function outerEdgesOf(worldModel: WorldModel, c: AxialCoord, ownerId: string): [number, number][] {
  const edges: [number, number][] = [];
  NEIGHBOR_DIRS.forEach((d, i) => {
    if (worldModel.getTile(c.q + d.q, c.r + d.r).ownerId === ownerId) return;
    const edge = EDGE_FOR_DIR[i];
    edges.push([edge, (edge + 1) % 6]);
  });
  return edges;
}

function formatEta(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
