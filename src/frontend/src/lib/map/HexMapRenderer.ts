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
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { AxialCoord } from '../hex/coords';
import { coordKey, hexDistance, hexesInRadius, neighbors } from '../hex/coords';
import { isoDepthKey, isoGridPosition, isoPixelToAxial, isoTopPoints } from '../hex/geometry';
import type { Camera } from './camera';
import { screenToWorld, visibleWorldRect, worldToScreen } from './camera';
import type { WorldModel } from './WorldModel';
import type { RiverTile, Settlement, Terrain, Tile } from './types';
import { BOOST_TERRAIN, buildingStatsFor, matchingNeighbourCount } from './buildingEconomy';
import { lerpPoint, routeProgressAt } from '../units/armyProgress';
import { loadMarkerIcons, type MarkerIconName, type MarkerIcons } from './markerIcons';
import { FogMaskLayer, FOG_MIST_OPAQUE_AT_RAMP } from './fog/FogMaskLayer';
import { fogMaskPlacement } from './fog/fogMaskLayout';
import {
  TILE_ART_NATIVE_H,
  TILE_ART_NATIVE_W,
  TILE_ART_TOPFACE_H_FRAC,
  TILE_ART_TOPFACE_Y_FRAC,
  baseTextureFor,
  loadTileTextures,
  riverTexturesFor,
  topTextureFor,
  type TileTextures,
} from './textures';

export type RenderMode = 'world' | 'settlement';

const GOLD = 0xffc55c;
const RIVAL = 0xe2705f;
// Distinct from GOLD (own settlements) / RIVAL (rival settlements) — trade
// carts belong to neither ownership axis, so they get their own color
// rather than borrowing one that would otherwise read as an owner cue.
const CART_COLOR = 0x8fd19e;
// Issue #159 part B: a cool, low-saturation blue for the range tint — kept
// distinct from GOLD (click-to-place highlight) and RIVAL/CART so it never
// reads as any of those existing overlay meanings.
const RANGE_TINT_COLOR = 0x5ab0e0;
const RANGE_TINT_ALPHA = 0.16;
const RANGE_OUTLINE_ALPHA = 0.55;
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

// Debug-only switches for fog v2's shader (§2.8 of map-fog-v2.md — "shader-
// era equivalents", replacing v1's per-hex jitter/blob flags). Mutated
// directly (no setter) — see main.ts's window.__fogDebug, exposed only in
// demo mode. Flipping a flag takes effect on the *next* rebuild/frame, not
// retroactively.
export interface FogDebugFlags {
  /** Isolates the unexplored (white mist) tier — off hides whiteMistLayer entirely. */
  maskUnknown: boolean;
  /** Isolates the out-of-sight (dark) tier — off hides blackFogLayer entirely. */
  maskOutOfSight: boolean;
  /** The §2.4 UV warp on/off — direct successor to v1's distJitter, but now a continuous per-pixel wobble instead of a per-hex jitter. */
  warp: boolean;
  /** The wind-drift animation (uWind/uTime) driving the warp's motion — off freezes the warp pattern in place instead of animating it. */
  drift: boolean;
  /** Bypasses the warp entirely and renders the mask texture unmodified — useful for inspecting the raw fetched mask (chunk seams, once §3's chunking lands) without the shader's own distortion on top. */
  showRawMask: boolean;
  /** Turns off the realm-border wash + outer-edge glow/stroke drawn on every owned hex — survives unchanged from v1 (§4 doesn't touch what it gates, only when it redraws). */
  realmBorders: boolean;
  /** Terrain sprites stop being culled past FOG_TERRAIN_CULL_HEXES — always draw terrain art regardless of fog distance, to see what's under the mist. */
  terrainCull: boolean;
  /** Open-water wave squiggles stop being culled past FOG_TERRAIN_CULL_HEXES — off places and animates a wave on every open-water grid point in the viewport, including the ones under opaque mist. */
  waveCull: boolean;
}
/**
 * Fog knobs that are a *value* rather than an on/off — same debug-only
 * status as FogDebugFlags, kept separate so that interface stays all-boolean
 * (FogDebugPanel renders it as a checkbox per key, and its LABELS map is
 * typed off it).
 */
export interface FogDebugTuning {
  /**
   * Multiplier on the cloud field's wind speed (FogMaskLayer's WIND). 1 is
   * the shipped rate; the panel offers a slider around it so a better one
   * can be found by eye, on a live map, instead of by rebuilding between
   * guesses. Not persisted — a reload is back to 1.
   */
  driftSpeed: number;
}
export const fogDebugTuning: FogDebugTuning = {
  driftSpeed: 1,
};

export const fogDebugFlags: FogDebugFlags = {
  maskUnknown: true,
  maskOutOfSight: true,
  warp: true,
  drift: true,
  showRawMask: false,
  realmBorders: true,
  terrainCull: true,
  waveCull: true,
};

// Per-rebuild/per-frame stats, read by FogPerfPanel — §2.8's "what's
// actually happening now" list, scoped to what this slice can honestly
// measure. `shaderPassMs` (the actual GPU cost of the fog draw) and
// `cacheHitRate` (server-side compute-cache hits, surfaced via a response
// header) are real §2.8 stats this doesn't populate yet — a GPU timer query
// extension and a header-reading fetch wrapper are both real follow-up work,
// not faked here (per §2.8's own "shouldn't be faked; absence is itself
// informative").
export interface FogPerfStats {
  /** rebuildTerrain/rebuildTerrainFlat: placing (or culling) terrain sprites/fills. Affected by terrainCull. */
  terrainMs: number;
  /** Hexes that got a terrain sprite/fill this rebuild. */
  terrainDrawnCount: number;
  /** Hexes skipped by isPastTerrainCull (terrainCull). */
  terrainCulledCount: number;
  /** rebuildBorders' per-hex loop. Affected by realmBorders. */
  bordersMs: number;
  /** True when this rebuild took the deepFogOnly shortcut — the whole viewport is certainly unexplored, so terrain/borders/waves were skipped entirely. */
  deepFogOnly: boolean;
  /** Owned hexes that drew a realm-border wash/stroke — gated by realmBorders. */
  borderedHexCount: number;
  /** rebuildMarkers: settlement/island/fleet icon placement. */
  markersMs: number;
  /** rebuildWaves: world-mode open-water squiggle placement (world mode only; 0 in settlement mode). */
  wavesMs: number;
  /** Wave squiggles kept by rebuildWaves — the ones drawWaves re-strokes every frame. */
  waveDrawnCount: number;
  /** Wave squiggles rebuildWaves dropped because opaque mist covers them (0 when waveCull is off). */
  waveCulledCount: number;
  /** Sum of the above plus the small remainder not broken out on its own. */
  totalMs: number;
  /** Hexes in the current viewport rect — the size the above times scale with. */
  hexCount: number;
  /** The fog mask fetch's own wall-clock time (stores/world.ts's fetchFogMask), independent of any renderer rebuild. */
  maskFetchMs: number;
  /** Whether a fog-mask fetch is currently in flight. */
  maskFetchInFlight: boolean;
  /** The current mask's ETag, or null before the first successful fetch — lets a debug session confirm a settlement change actually bumped the version. */
  maskVersion: string | null;
}
export const fogPerfStats: FogPerfStats = {
  terrainMs: 0,
  terrainDrawnCount: 0,
  terrainCulledCount: 0,
  bordersMs: 0,
  deepFogOnly: false,
  borderedHexCount: 0,
  markersMs: 0,
  wavesMs: 0,
  waveDrawnCount: 0,
  waveCulledCount: 0,
  totalMs: 0,
  hexCount: 0,
  maskFetchMs: 0,
  maskFetchInFlight: false,
  maskVersion: null,
};

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
  /**
   * 'settlement' mode, no `settlementId` yet (zip 6a: the landing page shows
   * a real plot of village-view terrain before anything has been founded
   * there) — where to centre the camera in lieu of a settlement's own
   * position. Ignored once `settlementId` is set.
   */
  previewCenter?: AxialCoord;
  /**
   * A single hex to keep highlighted every frame, independent of hover —
   * zip 6a's "click to place" glow on the one buildable plot before the
   * player has founded anything.
   */
  highlightCoord?: AxialCoord;
  /**
   * Multiple hexes to keep highlighted every frame alongside
   * `highlightCoord` — the landing page's live-mode start plots, since
   * founding only ever lands exactly where clicked (issue #96) and there can
   * be several unclaimed start positions worth showing at once.
   */
  highlightCoords?: AxialCoord[];
  /**
   * Fraction of the viewport width to shift the camera's subject to the
   * right of screen centre (0 = centred) — the landing page composes the
   * village against hero text on the left, so the island itself needs to
   * sit right of centre rather than directly behind the copy.
   */
  screenBiasX?: number;
  /**
   * Suppresses the name/level badge that otherwise floats above settlements
   * in 'settlement' mode. The landing page (zip 6a) reuses this same
   * renderer/mode for its pre-founding plot preview and, once founded there
   * in place (no route change yet), for the just-founded village itself;
   * the badge is village-view HUD chrome and shouldn't appear until the
   * player has actually navigated to the settlement view proper.
   *
   * Named as a "hide" flag rather than "show" so the common case (every
   * caller except the landing page) needs no prop at all: an optional
   * `boolean` prop declared only in TypeScript (no runtime default) is
   * resolved by Vue's compiler as a runtime `Boolean` type, and an *absent*
   * `Boolean` prop resolves to `false`, not `undefined` — so a `showX`
   * flag would default to hidden everywhere it isn't explicitly passed
   * `true`, not shown everywhere it isn't explicitly passed `false`.
   */
  hideSettlementBadge?: boolean;
  onHexClick?: (coord: AxialCoord, tile: Tile, screen: { x: number; y: number }) => void;
  /** zip 9: "hover = stats tooltip". Fired on every hover change, `null` on leave. */
  onHoverChange?: (info: HoverInfo | null) => void;
  /**
   * Issue #93: a draft waypoint pin (`ArmyOverlayData.draftWaypoints`) was
   * dragged onto a different hex. Fired continuously while dragging — once
   * per hex the pointer crosses, not once per pointer move — so the route
   * redraws under the finger; the store action behind it
   * (`world.moveWaypoint`) is idempotent for the same coordinate.
   */
  onWaypointMove?: (index: number, coord: AxialCoord) => void;
}

/**
 * Issue #94: the active leg an in-transit army is travelling, as the renderer
 * needs it — enough to place the marker at a fractional point between two hex
 * centres on every frame (see `routeProgressAt`), not just on the last hex
 * the backend says it reached.
 *
 * Everything here is frozen at dispatch server-side, so it stays valid
 * between polls and a `refreshArmies()` that returns the same leg produces
 * the exact same interpolation — no jump on re-sync (see `resolveArmyPoint`).
 */
export interface ArmyOverlayMovement {
  /** The active leg's route, start hex included (`MovementResponse.path`, or `returnPath` while returning). */
  path: AxialCoord[];
  /** Game-hours to reach each hex of `path` — `MovementResponse.cumulativeHours`. Empty falls back to uniform legs. */
  cumulativeHours: number[];
  departedAtMs: number;
  arrivesAtMs: number;
}

/**
 * Issue #40 phase 2: one army's marker on the settlement map — its current
 * position, and whether it's the one selected in `ArmyPanel.vue` (drawn
 * bigger and gold rather than the muted blue every other army marker gets,
 * same "selected reads as gold" convention as the settlement badge/labels
 * above).
 */
export interface ArmyOverlayMarker {
  id: string;
  /**
   * The authoritative hex the backend reports (`ArmyResponse.position`, the
   * last hex actually reached): where a stationary (`atHome`/`supporting`)
   * army stands, and the fallback for an in-transit one whose `movement` is
   * missing or unusable.
   */
  position: AxialCoord;
  selected: boolean;
  returning: boolean;
  /** Issue #94: present only while in transit — the renderer interpolates along it every frame. */
  movement?: ArmyOverlayMovement;
}

/** Issue #93: what an army is being sent *at*, marked on the target settlement's own hex. */
export interface ArmyOverlayTarget {
  coord: AxialCoord;
  /** `attack` draws crossed sword and axe; `support` a shield. */
  kind: 'attack' | 'support';
}

/**
 * Everything `setArmyOverlay` needs to draw on the settlement map: every
 * dispatched army's live marker, the selected army's full route (waypoints +
 * computed path, both ends included — mirrors `MovementResponse.Path`), an
 * in-progress dispatch's waypoint pins/line (before anything has actually
 * been sent to the backend), and any attack/support target settlement's hex.
 * All are independent — armies always show their own marker; `route` only has
 * content while an army is selected; `draftWaypoints` only has content while
 * a dispatch is being composed.
 */
export interface ArmyOverlayData {
  armies: ArmyOverlayMarker[];
  route: AxialCoord[];
  draftWaypoints: AxialCoord[];
  /** Issue #93: attack/support target indicators. Optional — an empty list draws nothing. */
  targets?: ArmyOverlayTarget[];
}

/**
 * What `drawArmyOverlay` actually placed on screen on its most recent frame
 * — read back via `lastArmyOverlayFrame()`.
 *
 * Not a test-only hook (nothing in the draw path branches on whether anyone
 * reads it): it is the same "ask the renderer where it really put things"
 * accessor `hexCenterScreen` already is, and it is the only honest way to
 * assert on a marker that lives inside a WebGL canvas — in particular that an
 * in-transit army sits *between* two hex centres rather than snapped to one.
 */
export interface ArmyOverlayFrame {
  armies: { id: string; x: number; y: number; interpolated: boolean }[];
  waypoints: { index: number; x: number; y: number }[];
  targets: { kind: ArmyOverlayTarget['kind']; x: number; y: number }[];
  /** Whether the SVG marker icon set finished loading — false means the fallback shapes are being drawn. */
  iconsReady: boolean;
}

/**
 * What the settlement view's hover tooltip needs, plus screen position to
 * anchor it. Issue #16 "better hover" wants a richer card for buildings
 * (title + level, an output rate, a modifier line, worker count, "click to
 * open") like the mockup's "Crop farm LEVEL 2 / Output +72 food/h /
 * Workers 8/8 / CLICK TO OPEN". None of that is
 * tracked per-building anywhere (the backend/WorldModel only know a
 * settlement's *aggregate* rates, not a single building's own output) so
 * `output`/`modifier`/`workers` below are derived deterministically from
 * the building's type+level+neighbours purely for display — see
 * `hoverInfoFor`'s buildingStats. Undefined fields simply don't render.
 */
export interface HoverInfo {
  screenX: number;
  screenY: number;
  title: string;
  subtitle: string;
  stat: string;
  level?: number;
  output?: string;
  modifier?: string;
  workers?: string;
  cta?: string;
  // Building stats (output/modifier/workers) are only ever populated for
  // the viewer's own buildings — see hoverInfoFor. `premiumLocked` tells
  // HexTooltip.vue to render a gated "Pro" upsell row in their place for a
  // building tile that belongs to someone else, rather than silently
  // showing nothing where the stats would be.
  premiumLocked?: boolean;
}

const BUILDING_LABELS: Record<NonNullable<Tile['buildingType']>, string> = {
  longhouse: 'Longhouse',
  hut: 'Hut',
  farm: 'Farm',
  tower: 'Watchtower',
  fishinghut: 'Fishing Hut',
  magictower: 'Magic Tower',
  pumpkinfarm: 'Pumpkin Farm',
  shrineofthor: 'Shrine of Thor',
  shrineoffreyja: 'Shrine of Freyja',
  lumberjack: 'Lumberjack',
  quarry: 'Quarry',
};

const TERRAIN_LABELS: Record<Terrain, string> = {
  sea: 'Open water',
  sand: 'Shore',
  grass: 'Grassland',
  forest: 'Forest',
  mountain: 'Mountain',
};

/**
 * The hover tooltip's terrain title (not shown at all if the tile has a
 * building — see hoverInfoFor). A river tile's art fully overrides its
 * underlying land terrain (see rebuildTerrain's `river` branch, which skips
 * the plain terrain texture entirely), so the tooltip needs to say so too
 * instead of naming whatever the river was drawn over — a river mouth on a
 * sand tile hovered as "Shore" before this, since `river` wasn't threaded
 * through to the tooltip at all.
 */
export function terrainTitleFor(tile: Tile, river: RiverTile | undefined): string {
  return river ? 'River' : TERRAIN_LABELS[tile.terrain];
}

// One tile-art size for both views — see the module comment above.
const TILE_W = 168;
const TILE_H = TILE_W * TILE_ART_TOPFACE_H_FRAC;
const TILE_CANVAS_H = TILE_W * (TILE_ART_NATIVE_H / TILE_ART_NATIVE_W);
const TILE_TOPFACE_Y_OFFSET = TILE_W * TILE_ART_TOPFACE_Y_FRAC;
// How far past the viewport edge (world-space) coordsInRect/isEntirelyDeepFog
// consider a hex "visible" — shared so the two agree on exactly the same
// rect every rebuild.
const VISIBLE_RECT_MARGIN = TILE_W * 2;

// The flat top-face diamond (isoTopPoints) spans world-y 0..TILE_H from the
// tile's grid origin, so its own vertical centre is TILE_H/2 — NOT
// TILE_TOPFACE_Y_OFFSET, which is nearly 1.5x taller than the diamond
// itself (it locates where the topface *starts* inside the taller 200x300
// native art, for sprite placement — see its one other use below). Reusing
// it as a screen-anchor offset put the hover tooltip, click ring, and
// settlement badge all noticeably below the tile they were meant to sit
// on/over, on the far edge of (or past) the tile's own front face.
const TILE_CENTER_Y_OFFSET = TILE_H / 2;

/**
 * A small pointy-top regular hexagon centred at (cx, cy) with "radius" r
 * (centre-to-vertex) — the same six-vertex shape as TopBar's inline-SVG hex
 * logo (`polygon points="50,4 93,27 93,73 50,96 7,73 7,27"`), not the
 * isometric tile's own flattened diamond top-face. Used for small HUD
 * markers (the settlement badge's icon) that should read as "a hex", not as
 * a scaled-down tile.
 */
function hexPoints(cx: number, cy: number, r: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (-90 + 60 * i);
    points.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  return points;
}

const WORLD_DEFAULT_ZOOM = 0.22;
// Ceiling for the settlement camera's initial zoom — settlement level 1's
// explored radius is ~5 hexes, which at 0.85 filled almost the entire
// default viewport on its own, hiding the fog entirely until the player
// panned. zoomForFogMargin picks the real initial zoom (usually well below
// this) so FOG_ZOOM_MARGIN_HEXES of fog is guaranteed visible from frame one.
const SETTLEMENT_DEFAULT_ZOOM = 0.85;
// zip 6a: the landing page's pre-founding preview is a bit wider than the
// settlement view's own default, so the single starter island reads as a
// place, not a crop — and how many hexes around `previewCenter` it shows at
// all (the world isn't fogged yet in preview, so without a hard cutoff any
// other island generated nearby would show too — zip 6a is one island, not
// a slice of the world map).
const PREVIEW_ZOOM = 0.6;
const PREVIEW_ISLAND_RADIUS = 7;
// How long the camera takes to ease from one position/zoom to another (see
// animateCameraTo) — used for the founding transition (zip 6a: fog should
// roll in as the camera settles, not cut instantly) rather than an abrupt
// jump.
const CAMERA_TRANSITION_MS = 1400;
// How many hexes of white (unexplored) fog zoomForFogMargin guarantees
// visible past the settlement's explored ring, on every side, at rest.
// Deliberately *not* FOG_RAMP_MARGIN_HEXES below, though it used to be the
// same constant: widening the ramp so the mist has more room to fray must
// not also pull the starting camera further out, which is a framing
// decision with nothing to do with how the fog is shaded.
const FOG_ZOOM_MARGIN_HEXES = 10;
// Width, in hexes, of the mask's unknown ramp — the distance past a
// settlement's explored ring that the R channel spends going 0 -> 255, and
// therefore the entire budget the shader has to work with: past it the mask
// is saturated and no amount of edge shaping can reach (fogShader.ts works
// in ramp units, where 1.0 is exactly this many hexes).
//
// Must stay equal to the backend generator's FogMaskOptions.UnknownMarginHexes
// and demoFogMask.ts's UNKNOWN_MARGIN_HEXES — the three describe the same
// ramp, and a mismatch silently puts the live and demo fog edges at
// different distances. Nothing derives it from the mask itself; a PNG
// carries no metadata beyond its pixel dimensions.
const FOG_RAMP_MARGIN_HEXES = 14;
// Floor for zoomForFogMargin — a very high-level settlement's explored ring
// is already large, and without a floor the margin target would zoom out
// far enough to make individual hexes too small to read or click precisely.
const FOG_MARGIN_MIN_ZOOM = 0.22;
// Step count per unit of straight-line hex distance, worst case (2/sqrt(3)).
// The fog mask measures distance the round way (hexEuclideanDistance) while
// the cull below counts steps, and a hex at straight-line distance d can be
// up to this many steps away — so the cull radius has to be scaled by it or
// it would clip ground the mist has not covered yet.
const STEPS_PER_HEX_UNIT = 2 / Math.sqrt(3);
// Past this many hexes beyond the explored ring, terrain is guaranteed to
// sit under fully opaque unknown fog: rebuildTerrain/rebuildTerrainFlat stop
// drawing sprites/fills there, and rebuildBorders stops drawing borders,
// since nothing could show through the mesh sitting over the whole viewport
// either way. isEntirelyDeepFog reuses the same threshold to skip an entire
// deep-ocean viewport's worth of terrain/wave work in world mode.
//
// Derived rather than guessed, because guessing it is expensive in both
// directions. Too small and ground pops into view at the cull boundary
// under mist that hasn't gone opaque yet; too large and every rebuild pays
// for sprites nothing can ever see — this radius is squared in the hex
// count, so the difference between a tight bound and a generous one
// measured ~30ms a frame on a software-rendered runner, which was enough to
// tip two timing-sensitive e2e specs over. FOG_MIST_OPAQUE_AT_RAMP is the
// point past which the shader's edge noise is fully shut off and the mist
// is provably alpha 1 (fogShader.ts's edgeBand), and the step-count
// conversion above is what makes the bound safe rather than merely close.
const FOG_TERRAIN_CULL_HEXES = Math.ceil(
  FOG_RAMP_MARGIN_HEXES * FOG_MIST_OPAQUE_AT_RAMP * STEPS_PER_HEX_UNIT,
);
// §1c's live army-vision radius, in hexes — mirrors the backend's
// FogVisionRadii.ArmyVisionRadiusHexes (used there for §1e's persisted-
// history growth trigger; used here for the real-time shader reveal itself,
// see fogShader.ts's own remarks on why the two stay out of sync-free of
// each other despite sharing this one number). TILE_W approximates "one hex"
// in world-space distance the same way NOISE_SCALE (FogMaskLayer.ts) does —
// good enough for a soft visual radius, not a gameplay-precision distance.
const ARMY_VISION_RADIUS_HEXES = 2;

// --- Per-rebuild settlement pruning (see fogSourcesNear) -------------------
//
// isPastTerrainCull answers "how far past the nearest settlement's explored
// ring is this?" — WorldModel.distanceBeyondExplored's min over *every*
// settlement in the game. Asking that per hex is O(hexes × settlements) per
// rebuild — a low-zoom world-map viewport over unexplored water is
// thousands of hexes, on every drag rebuild. But a settlement only ever
// changes the answer within a bounded ring around itself: past
// FOG_TERRAIN_CULL_HEXES, every hex culls the same way no matter how much
// larger the number gets.
//
// So the settlement walk is hoisted out of the per-hex work entirely: once
// per rebuild, settlements whose ring cannot reach the visible hex box are
// dropped, and the per-hex math runs over that (normally tiny, usually
// empty) list using plain q/r/radius primitives instead of re-deriving a
// Settlement's radius or allocating a coord object per settlement per hex.
// Deliberately generous — it may keep a settlement that turns out not to
// matter, but can never drop one that does, so the rendered result is
// identical to the full per-hex scan (mirrors isEntirelyDeepFog's own
// settlement-position prune above, for the same reason).

/** Inclusive axial bounding box of the hexes one rebuild is about to draw. */
interface AxialBounds {
  qMin: number;
  qMax: number;
  rMin: number;
  rMax: number;
}

/**
 * A settlement reduced to the primitives the per-hex fog math needs, so that
 * math never touches the Settlement object (and never re-derives its radius)
 * once per hex. `radius` is whichever ring the caller is measuring past —
 * the explored ring for the unexplored mist, the line-of-sight ring for the
 * scouted tint.
 */
interface FogSource {
  q: number;
  r: number;
  radius: number;
}

function axialBounds(coords: AxialCoord[]): AxialBounds | null {
  if (coords.length === 0) return null;
  let qMin = Infinity;
  let qMax = -Infinity;
  let rMin = Infinity;
  let rMax = -Infinity;
  for (const c of coords) {
    if (c.q < qMin) qMin = c.q;
    if (c.q > qMax) qMax = c.q;
    if (c.r < rMin) rMin = c.r;
    if (c.r > rMax) rMax = c.r;
  }
  return { qMin, qMax, rMin, rMax };
}

function axisGap(v: number, lo: number, hi: number): number {
  if (v < lo) return lo - v;
  if (v > hi) return v - hi;
  return 0;
}

/**
 * A lower bound on hexDistance from (q, r) to *any* hex inside `bounds` —
 * never larger than the true nearest distance, so a prune built on it can
 * only ever be too generous.
 *
 * Hex distance is max(|dq|, |dr|, |dq + dr|) (the three cube axes). Each
 * term is bounded below independently by how far the settlement sits
 * outside that axis' range over the box, and the max of three lower bounds
 * is itself a lower bound on the max.
 */
function minHexDistanceToBounds(q: number, r: number, bounds: AxialBounds): number {
  return Math.max(
    axisGap(q, bounds.qMin, bounds.qMax),
    axisGap(r, bounds.rMin, bounds.rMax),
    axisGap(q + r, bounds.qMin + bounds.rMin, bounds.qMax + bounds.rMax),
  );
}

/**
 * The once-per-rebuild prune: settlements whose ring (`radiusFor`) could
 * still land within `marginHexes` of some hex in `bounds`. See the
 * FOG_UNEXPLORED_INFLUENCE_HEXES comment above for why this is safe.
 */
function fogSourcesNear(
  settlements: Settlement[],
  radiusFor: (s: Settlement) => number,
  bounds: AxialBounds | null,
  marginHexes: number,
): FogSource[] {
  if (!bounds) return [];
  const out: FogSource[] = [];
  for (const s of settlements) {
    const radius = radiusFor(s);
    if (minHexDistanceToBounds(s.q, s.r, bounds) - radius <= marginHexes) {
      out.push({ q: s.q, r: s.r, radius });
    }
  }
  return out;
}

/**
 * WorldModel.distanceBeyondExplored's answer, against a list already pruned
 * to the settlements that can affect the current viewport. Identical result
 * for every hex the fog tiers actually discriminate at (see
 * FOG_UNEXPLORED_INFLUENCE_HEXES); further out it can report a larger
 * distance — or Infinity, when nothing near remains — which every call site
 * treats exactly the same as the true (also past-threshold) value.
 */
function distanceBeyondSources(q: number, r: number, sources: FogSource[]): number {
  let min = Infinity;
  for (const s of sources) {
    const dq = s.q - q;
    const dr = s.r - r;
    const d = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) - s.radius;
    if (d < min) min = d;
  }
  return min === Infinity ? Infinity : Math.max(0, min);
}

// The scouted (out-of-sight) tier's tint alpha at full ramp saturation — the
// fog v2 shader's uScoutedAlpha uniform (fogShader.ts) reads this directly,
// same constant both tiers' colours ultimately come from (see
// FogMaskLayerColors in FogMaskLayer.ts).
const FOG_SCOUTED_ALPHA = 0.6;
// See scheduleCull's own comment for why this exists: throttles how often a
// drag can trigger a full terrain/border/fog rebuild.
const DRAG_REBUILD_THROTTLE_MS = 150;
// Total pointer travel (summed |dx|+|dy| over the gesture) below which a
// pointerdown/up pair counts as a click on a hex rather than a camera pan.
// Used by onPointerUp for both halves of that decision: whether to open the
// ring menu, and whether there was any camera movement worth rebuilding for.
const DRAG_CLICK_SLOP_PX = 6;
// How long after the last wheel/pinch event a zoom gesture is considered
// finished, at which point onWheel's idle timer bakes one final, fully
// up-to-date (and correctly blurred) rebuild — the same guarantee
// onPointerUp gives at the end of a drag. Long enough that the gaps between
// events inside one continuous trackpad gesture don't end it early, short
// enough that the settled view sharpens up immediately to the eye.
const WHEEL_IDLE_MS = 180;

// --- Army/route overlay (issues #40 phase 2, #93, #94) ---
/** The selected army's own route colour — muted blue, distinct from the gold a draft route gets. */
const ROUTE_COLOR = 0x5ab0e6;
/** An army already turned around and heading home. */
const RETURNING_COLOR = 0x8fa3af;
/** Attack target indicator (crossed sword + axe) — the one red in the overlay, matching RIVAL's "someone else's" reading. */
const ATTACK_COLOR = 0xe2705f;
/** Support target indicator (shield) — friendly, so it borrows neither the attack red nor the draft gold. */
const SUPPORT_COLOR = 0x8fd19e;
/** On-screen pixel size of a route segment's direction arrow. */
const ROUTE_ARROW_PX = 13;
/**
 * Minimum on-screen length a route segment needs before it gets its own
 * direction arrow. Zoomed far out, neighbouring hex centres are only a few
 * pixels apart, and an arrow per segment there collapses into a smear.
 */
const ROUTE_ARROW_MIN_SEGMENT_PX = 26;
/** Pointer distance (screen px) within which a pointerdown counts as grabbing a draft waypoint pin. */
const WAYPOINT_GRAB_RADIUS_PX = 16;
/** How long an army marker takes to ease across when its leg is replaced (recall/turn-around) — see `armyPoints`. */
const ARMY_RESYNC_MS = 450;

export class HexMapRenderer {
  private app: Application | null = null;
  private world = new Container();
  private terrainBase = createSpriteLayer();
  private terrainTop = createSpriteLayer();
  private terrainFlat = new Graphics();
  private waveLayer = new Graphics();
  private wavePoints: WavePoint[] = [];
  // Mirrors rebuildAll's local `deepFogOnly` (see isEntirelyDeepFog) so
  // onTick's per-frame drawWaves call can skip redrawing wave strokes the
  // fog mesh above them would fully hide anyway — refreshed on every
  // rebuildAll, stale (matching every other rebuild-driven field) for the
  // frames between rebuilds during a drag.
  private deepFogOnly = false;
  private borderLayer = new Graphics();
  private hoverLayer = new Graphics();
  // zip 6a: "click to place" — a persistent (not hover-gated) pulsing glow
  // on `options.highlightCoord`, redrawn every tick since the pulse itself
  // is time-based, unlike everything else here which only redraws on a
  // cull rebuild (camera pan/zoom).
  private highlightLayer = new Graphics();
  // Issue #159 part B: the composing-a-dispatch/field-order range tint —
  // every hex `setRangeOverlay` hands in, drawn as a translucent fill plus
  // an outline on the boundary edges (the edges whose neighbour isn't in the
  // set), same "just stores data, drawn every tick" convention as
  // `armyOverlay`. Sits directly below `highlightLayer` (both immediately
  // above `terrainTop.container` — see mount()'s addChild order) so it tints
  // the tile tops the way the hover/highlight layers do; fog sits above
  // `world` entirely (see mount()'s own remarks), so this is automatically
  // hidden under fog with no extra check needed here.
  private rangeLayer = new Graphics();
  private rangeOverlay: AxialCoord[] | null = null;
  // Fog v2 (docs/design/map-fog-v2.md §2.4/§4): two screen-space Pixi Mesh
  // layers sampling the fetched mask texture through a shared GLSL shader —
  // see fog/FogMaskLayer.ts. blackFogLayer (out-of-sight tint) sits between
  // `world` and `markerLayer` in the stage; whiteMistLayer (never-scouted
  // mist) sits after `markerLayer` — see mount()'s addChild order. Both are
  // genuinely screen-space (no `world`-transform syncing needed, unlike v1's
  // `fogWorld`), and both stay in sync via setCamera on every camera change.
  private blackFogLayer = new FogMaskLayer('outOfSight', {
    scoutedColor: FOG_SCOUTED,
    unexploredColor: FOG_UNEXPLORED,
    scoutedAlpha: FOG_SCOUTED_ALPHA,
  });
  private whiteMistLayer = new FogMaskLayer('unknown', {
    scoutedColor: FOG_SCOUTED,
    unexploredColor: FOG_UNEXPLORED,
    scoutedAlpha: FOG_SCOUTED_ALPHA,
  });
  // The fetched (or, before the first fetch resolves, not-yet-fetched) mask
  // texture and the world-to-mask-UV placement it was decoded with — see
  // setFogMask. Null until fetchFogMask's first call resolves (or forever in
  // demo mode, which has no backend to fetch from — both layers' shader
  // already defaults an unbound mask to fully-unknown, so this is a real,
  // correct "nothing scouted yet" state, not a loading glitch).
  private fogMaskTexture: Texture | null = null;
  // The generation before `fogMaskTexture` — kept one deep so a still-fading
  // uMaskPrev never gets destroyed out from under an in-progress reveal
  // cross-fade (see setFogMask's own comment).
  private previousFogMaskTexture: Texture | null = null;
  // Eases `camera` from one position/zoom to another over time (see
  // animateCameraTo) instead of snapping — used for the founding transition
  // so the view doesn't jump.
  private cameraAnim: { from: Camera; to: Camera; startedAt: number; durationMs: number } | null = null;
  private markerLayer = new Graphics();
  private labelPool: Text[] = [];
  private labelsUsed = 0;
  // Issue #40 phase 2: see `setArmyOverlay` — drawn every tick alongside the
  // settlement badge (rebuildMarkers), same "recomputed from hex coords on
  // every rebuild" pattern as everything else in this layer, so it keeps up
  // with pan/zoom for free.
  private armyOverlay: ArmyOverlayData | null = null;
  // Issue #93/#94: the SVG marker icon set (see markerIcons.ts), drawn as
  // pooled Sprites parented to markerLayer — `Graphics` is a `Container`, so
  // they pan/zoom and fade with the rest of the marker chrome for free.
  // Null until the load resolves (and if it ever fails), which the overlay
  // draws plain vector shapes through instead of showing nothing.
  private icons: MarkerIcons | null = null;
  private iconPool: Sprite[] = [];
  private iconsUsed = 0;
  // Read back by `lastArmyOverlayFrame()` — recorded by drawArmyOverlay as it
  // draws, so it always describes the frame actually on screen.
  private armyOverlayFrame: ArmyOverlayFrame = { armies: [], waypoints: [], targets: [], iconsReady: false };
  // Issue #94 "keep it poll-tolerant": per army, the world-space point its
  // marker is currently drawn at, plus which leg produced it. Interpolating a
  // frozen leg is already jump-free across polls (same inputs, same answer),
  // so this only matters when the leg itself is *replaced* — a recall, a
  // turn-around, an army arriving — where the authoritative position can move
  // several hexes at once. Then the marker eases from where it was to where
  // it now belongs (ARMY_RESYNC_MS) instead of teleporting.
  private armyPoints = new Map<
    string,
    { x: number; y: number; leg: string; resyncFrom: { x: number; y: number } | null; resyncStartedAt: number }
  >();
  // Issue #93: which draft waypoint pin (index into
  // `ArmyOverlayData.draftWaypoints`) the pointer grabbed, if any — set on
  // pointerdown over a pin instead of starting a camera pan, cleared on
  // pointerup. `lastCoordKey` suppresses repeat callbacks while the pointer
  // moves within one hex.
  private waypointDrag: { index: number; lastCoordKey: string } | null = null;

  private textures: TileTextures | null = null;

  private camera: Camera;
  private viewport = { width: 0, height: 0 };
  private lastBuiltCamera: Camera | null = null;
  private lastRebuildAtMs = 0;
  private cullQueued = false;
  private destroyed = false;

  private dragging = false;
  private dragMoved = 0;
  // A wheel/pinch zoom is a gesture just like a drag — a continuous stream of
  // events, each one nudging `camera.zoom` — but unlike a drag it has no
  // "up" event to end it, so it's tracked with an idle timer instead (see
  // onWheel). While it's running, `isInteracting` below de-prioritises the
  // same expensive rebuild work a drag already de-prioritises.
  private wheeling = false;
  private wheelIdleTimer: ReturnType<typeof setTimeout> | null = null;
  // Issue #16 "clicking elsewhere on the map with a ring open should close
  // it, not open a new one": beginDragFrom's synthetic drag (started to
  // dismiss a ring on backdrop mousedown, see beginDragFrom below) ends in
  // onPointerUp exactly like a real click when the pointer never moved —
  // this flag tells onPointerUp that particular click is the same gesture
  // that already closed the ring, so it shouldn't also reopen one.
  private suppressNextClick = false;
  private lastPointer = { x: 0, y: 0 };
  private hoveredKey: string | null = null;
  // Issue #16 "ring menu": while a RingMenu is open, its DOM overlay sits on
  // top of the canvas, but this renderer's own pointer tracking is a
  // window-level listener (see onPointerMove below) that keeps resolving a
  // hovered hex and drawing its highlight regardless of what's visually on
  // top — so it needs an explicit lock, not just relying on DOM hit-testing.
  private interactionLocked = false;
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

  // Shifts the world-space centre left by `biasX` of the viewport (in world
  // units, at the given zoom) so the subject renders that much right of
  // screen centre — screenToWorld/worldToScreen (camera.ts) stay untouched
  // (still symmetric around viewport/2), this just changes *what* sits there.
  private biasedCenterX(worldX: number, zoom: number): number {
    const biasX = this.options.screenBiasX ?? 0;
    if (biasX === 0 || this.viewport.width === 0) return worldX;
    return worldX - (biasX * this.viewport.width) / zoom;
  }

  private settlementCameraOrigin(): Camera {
    const settlement = this.settlement();
    if (!settlement) {
      const at = this.options.previewCenter ?? { q: 0, r: 0 };
      const grid = isoGridPosition(at, TILE_W, TILE_H);
      const centerX = grid.x + TILE_W / 2;
      const centerY = grid.y + TILE_H / 2;
      return { x: this.biasedCenterX(centerX, PREVIEW_ZOOM), y: centerY, zoom: PREVIEW_ZOOM };
    }
    const grid = isoGridPosition({ q: settlement.q, r: settlement.r }, TILE_W, TILE_H);
    const center = { x: grid.x + TILE_W / 2, y: grid.y + TILE_H / 2 };
    const zoom = this.zoomForFogMargin(settlement, center);
    return { x: this.biasedCenterX(center.x, zoom), y: center.y, zoom };
  }

  /**
   * Picks the initial settlement zoom so at least FOG_ZOOM_MARGIN_HEXES of white
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

    const targetRadius = this.options.worldModel.exploredRadius(settlement) + FOG_ZOOM_MARGIN_HEXES;
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

  /**
   * Whether fog-of-war should gate what's drawn right now. True in
   * settlement mode once a settlement actually exists — zip 6a's
   * pre-founding landing-page preview has no settlement yet, and
   * `WorldModel.isExplored` would be trivially false everywhere, so fog
   * would otherwise blanket the whole preview plot (see rebuildTerrain's
   * and rebuildBorders' matching bypass). In world mode, only once
   * the local player has founded at least one settlement — before that,
   * hiding the whole map would break the onboarding flow ("click any green
   * island to make landfall": the player needs to see the world to pick a
   * spot). Once the player has a settlement of their own, the world map
   * fogs the same way the settlement view does — reusing `WorldModel`'s
   * single shared `explored`/visibility bookkeeping, so "known world" means
   * anything scouted by any settlement (this player's or a rival's), not
   * just this player's own.
   */
  private isFogActive(): boolean {
    const { mode, worldModel, playerId } = this.options;
    if (mode === 'settlement') return !!this.settlement();
    return worldModel.listSettlements().some((s) => s.ownerId === playerId);
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

    // Attached before the texture-pack await below, not after: everything
    // these handlers touch (this.app, this.camera, this.viewport,
    // worldModel.getTile) is already set by this point, and a pointer event
    // is a one-shot DOM dispatch — the browser doesn't queue it for later,
    // so a click during the (now much larger, ~150-asset) texture load
    // would otherwise just be silently lost rather than merely delayed.
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    // World mode never renders tile-art sprites (see WORLD_TERRAIN_FILL
    // above), so it has no need for the (large, submodule-backed) texture
    // pack at all — only settlement mode loads it. The army/route marker
    // icons (issues #93/#94) are settlement-only too (the world map never
    // gets an army overlay), and load alongside rather than after it: six
    // small SVGs against ~150 tile PNGs is no reason to lengthen the mount.
    if (this.options.mode === 'settlement') {
      const [textures, icons] = await Promise.all([
        loadTileTextures(),
        // The whole map failing to mount because a marker icon didn't
        // decode would be a wildly disproportionate outcome — the overlay
        // draws plain vector shapes when `icons` is null (see
        // drawArmyOverlay), so a failure here costs the icon art and
        // nothing else. Reported as a warning rather than swallowed, and
        // `lastArmyOverlayFrame().iconsReady` says so too.
        loadMarkerIcons().catch((err) => {
          console.warn('Map marker icons failed to load; falling back to plain shapes', err);
          return null;
        }),
      ]);
      this.textures = textures;
      this.icons = icons;
    } else {
      this.textures = null;
    }
    if (this.destroyed) return;

    this.world.addChild(
      this.terrainBase.container,
      this.waveLayer,
      this.terrainFlat,
      this.borderLayer,
      this.hoverLayer,
      this.terrainTop.container,
      this.rangeLayer,
      this.highlightLayer,
    );
    // §4's layer stack: the two fog quads are the only genuinely
    // screen-space `app.stage` children — everything else (terrain,
    // borders, buildings) stays nested inside `world`, camera-transformed
    // as one. blackFogLayer (out-of-sight tint) sits under markerLayer so
    // troop/settlement labels read as veiled by it rather than floating in
    // front; whiteMistLayer (never-scouted) sits over everything, since
    // nothing should show through ground that's never been seen at all.
    app.stage.addChild(this.world, this.blackFogLayer.mesh, this.markerLayer, this.whiteMistLayer.mesh);

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
    // The fog quads are genuinely screen-space (see the class-level comment
    // on blackFogLayer/whiteMistLayer) — no transform to sync, just the raw
    // camera/viewport values their shader uses to invert screen -> world
    // itself (fogShader.ts's own screenToWorld-equivalent).
    this.blackFogLayer.setCamera(this.camera, this.viewport);
    this.whiteMistLayer.setCamera(this.camera, this.viewport);
  }

  private onTick = () => {
    this.options.worldModel.tick();
    this.rebuildMarkers();
    // Issue #16 "ring menu": the settlement name badge (rebuildSettlementLabels,
    // below) floats right where the ring's own bubbles/track need to sit — it
    // stays fully opaque otherwise since it's PixiJS-rendered, not DOM, so the
    // ring's CSS z-index/opacity tricks can't touch it. `interactionLocked` is
    // already the "a ring is open" signal (see setInteractionLocked); ease the
    // whole marker layer's alpha toward hidden/shown off that same flag rather
    // than snapping.
    const targetMarkerAlpha = this.interactionLocked ? 0 : 1;
    this.markerLayer.alpha += (targetMarkerAlpha - this.markerLayer.alpha) * 0.25;
    if (this.options.mode === 'world' && !this.deepFogOnly) this.drawWaves();
    if (this.idleDrift) {
      this.camera = { ...this.camera, x: this.camera.x + 0.18, y: this.camera.y + 0.05 };
      this.applyCameraTransform();
      this.scheduleCull();
    }
    this.tickCameraAnim();
    const now = performance.now();
    // isFogActive() mirrors rebuildTerrain's/rebuildBorders' own bypass: no
    // settlement yet (settlement-mode preview) or the local player hasn't
    // founded one (world mode) means there's nothing to fog — without this,
    // both quads' placeholder (fully-unknown) texture would blanket a view
    // the rest of the renderer deliberately leaves unfogged.
    const fogActive = this.isFogActive();
    this.blackFogLayer.mesh.visible = fogActive && fogDebugFlags.maskOutOfSight;
    this.whiteMistLayer.mesh.visible = fogActive && fogDebugFlags.maskUnknown;
    const debug = { warpEnabled: fogDebugFlags.warp, showRawMask: fogDebugFlags.showRawMask };
    this.blackFogLayer.setDebug(debug);
    this.whiteMistLayer.setDebug(debug);
    this.blackFogLayer.tick(now, fogDebugFlags.drift, fogDebugTuning.driftSpeed);
    this.whiteMistLayer.tick(now, fogDebugFlags.drift, fogDebugTuning.driftSpeed);
    this.drawRangeOverlay();
    this.drawHighlight();
  };

  /**
   * Eases from the founding transition's start camera to its target (see
   * animateCameraTo) — zip 6a: the landing page's founding moment should
   * read as the camera settling into place while the fog reveals via its own
   * cross-fade (FogMaskLayer.setMaskTexture, §2.6), not an instant jump.
   */
  private tickCameraAnim() {
    const anim = this.cameraAnim;
    if (!anim) return;
    const t = Math.min(1, (performance.now() - anim.startedAt) / anim.durationMs);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
    this.camera = {
      x: anim.from.x + (anim.to.x - anim.from.x) * eased,
      y: anim.from.y + (anim.to.y - anim.from.y) * eased,
      zoom: anim.from.zoom + (anim.to.zoom - anim.from.zoom) * eased,
    };
    this.applyCameraTransform();
    if (t >= 1) {
      this.cameraAnim = null;
      this.forceRebuild();
    } else {
      this.scheduleCull();
    }
  }

  /**
   * Eases the camera from its current position/zoom to `target` instead of
   * snapping — used when a settlement is first founded (see updateOptions),
   * so the preview-to-settlement transition reads as one continuous motion.
   */
  private animateCameraTo(target: Camera, durationMs: number) {
    this.cameraAnim = { from: { ...this.camera }, to: target, startedAt: performance.now(), durationMs };
  }

  /**
   * Issue #159 part B. `points[i]`/`points[(i+1)%6]` (see `isoTopPoints`) is
   * the edge shared with `neighbors(c)[(i+3)%6]` — verified by construction:
   * direction 0 (`{q:1,r:0}`)'s neighbour grid-lands exactly on this hex's
   * edge 3, and every other direction/edge pair falls out of that one by the
   * hexagon's 180°-rotational symmetry (opposite directions/edges are
   * `+3 mod 6` apart).
   */
  private drawRangeOverlay() {
    this.rangeLayer.clear();
    const hexes = this.rangeOverlay;
    if (!hexes || hexes.length === 0) return;

    const inSet = new Set(hexes.map(coordKey));
    const topPoints = isoTopPoints(TILE_W, TILE_H);

    for (const at of hexes) {
      const grid = isoGridPosition(at, TILE_W, TILE_H);
      const flat = topPoints.flatMap((p) => [grid.x + p.x, grid.y + p.y]);
      this.rangeLayer.poly(flat).fill({ color: RANGE_TINT_COLOR, alpha: RANGE_TINT_ALPHA });

      const dirs = neighbors(at);
      for (let j = 0; j < 6; j++) {
        if (inSet.has(coordKey(dirs[j]))) continue;
        const a = topPoints[(j + 3) % 6];
        const b = topPoints[(j + 4) % 6];
        this.rangeLayer
          .moveTo(grid.x + a.x, grid.y + a.y)
          .lineTo(grid.x + b.x, grid.y + b.y)
          .stroke({ width: 2, color: RANGE_TINT_COLOR, alpha: RANGE_OUTLINE_ALPHA });
      }
    }
  }

  private drawHighlight() {
    this.highlightLayer.clear();
    const coords = [
      ...(this.options.highlightCoord ? [this.options.highlightCoord] : []),
      ...(this.options.highlightCoords ?? []),
    ];
    if (coords.length === 0) return;
    const pulse = (Math.sin(performance.now() / 420) + 1) / 2; // 0..1
    for (const at of coords) {
      const grid = isoGridPosition(at, TILE_W, TILE_H);
      const top = isoTopPoints(TILE_W, TILE_H).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
      const flat = top.flatMap((p) => [p.x, p.y]);
      this.highlightLayer
        .poly(flat)
        .fill({ color: GOLD, alpha: 0.1 + pulse * 0.1 })
        .stroke({ width: 3 + pulse * 1.5, color: GOLD, alpha: 0.6 + pulse * 0.4 });
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    // Normally unreachable while a ring is open — its backdrop overlay
    // covers the whole canvas, so a real pointerdown there hits the
    // backdrop's own handler instead of this canvas-scoped listener — but
    // kept as a defensive guard rather than relying on that DOM layering.
    if (this.interactionLocked) return;
    // Issue #93 "drag to move a placed waypoint": a pointerdown that lands on
    // a draft pin grabs *that pin* rather than starting a camera pan — the
    // two gestures are the same input, so the pin has to win the hit-test
    // first or there is no way to correct a mis-clicked hex except undoing
    // back to it.
    const grabbed = this.draftWaypointAt(this.pointerScreen(e));
    if (grabbed !== null) {
      this.idleDrift = false;
      this.waypointDrag = { index: grabbed, lastCoordKey: coordKey(this.armyOverlay!.draftWaypoints[grabbed]) };
      this.setHoveredCoord(null);
      this.setCursor('grabbing');
      return;
    }
    this.startDrag(e);
  };

  /** Pointer position relative to the canvas — the space `hexCenterScreen`/`toScreen` report in. */
  private pointerScreen(e: PointerEvent): { x: number; y: number } | null {
    const canvas = this.app?.canvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /**
   * Index of the draft waypoint pin under a screen point, or null. Hit-tested
   * against the pins' own drawn screen positions (a fixed-size marker, like
   * everything else in `markerLayer`) rather than against the hexes under
   * them, so grabbing a pin stays equally easy at every zoom level.
   */
  private draftWaypointAt(screen: { x: number; y: number } | null): number | null {
    const waypoints = this.armyOverlay?.draftWaypoints;
    if (!screen || !waypoints?.length || this.options.mode !== 'settlement') return null;
    let best: number | null = null;
    let bestDistance = WAYPOINT_GRAB_RADIUS_PX;
    waypoints.forEach((c, i) => {
      const p = this.hexCenterScreen(c);
      const distance = Math.hypot(p.x - screen.x, p.y - screen.y);
      // `<=` so a later pin wins a tie: pins are drawn in route order, so the
      // last one drawn is the one visually on top where two overlap.
      if (distance <= bestDistance) {
        best = i;
        bestDistance = distance;
      }
    });
    return best;
  }

  private setCursor(cursor: string) {
    const canvas = this.app?.canvas;
    if (canvas && canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  }

  // Issue #16 "ring menu": a mousedown on the ring's own backdrop (i.e.
  // outside any bubble) closes the ring — see RingMenu.vue's
  // outsidePointerDown emit — and the caller re-fires that same PointerEvent
  // in here so the drag it started keeps going, instead of the player
  // needing a second, separate mousedown to start panning the map.
  beginDragFrom(e: PointerEvent, opts: { suppressClick?: boolean } = {}) {
    this.interactionLocked = false;
    this.suppressNextClick = !!opts.suppressClick;
    this.startDrag(e);
  }

  private startDrag(e: PointerEvent) {
    this.idleDrift = false;
    this.dragging = true;
    this.dragMoved = 0;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    // The hover tooltip otherwise stays pinned to whatever hex was last
    // hovered while the player drags the camera underneath it — onPointerMove
    // skips updateHover entirely while dragging, so nothing would clear it
    // on its own until the drag ends over a different hex.
    this.setHoveredCoord(null);
  }

  /** Issue #16 "ring menu": disable hover highlighting/tooltip and zoom
   *  while a RingMenu is open — its bubbles float on top of the canvas, but
   *  this renderer's own hover/wheel tracking doesn't otherwise know a menu
   *  is up (see the class-level comment on `interactionLocked`). */
  setInteractionLocked(locked: boolean) {
    this.interactionLocked = locked;
    if (locked) this.setHoveredCoord(null);
  }

  private onPointerMove = (e: PointerEvent) => {
    // Issue #93: a pin drag repositions that waypoint instead of panning —
    // the hex under the pointer, resolved the same way a click is
    // (isoPixelToAxial), so the pin snaps to hexes rather than floating
    // between them. Reported only when the pointer actually crosses into a
    // different hex, so a jittery pointer doesn't fire a store write a frame.
    if (this.waypointDrag) {
      const screen = this.pointerScreen(e);
      if (!screen) return;
      const world = screenToWorld(this.camera, screen, this.viewport);
      const coord = isoPixelToAxial(world, TILE_W, TILE_H);
      if (coordKey(coord) === this.waypointDrag.lastCoordKey) return;
      this.waypointDrag.lastCoordKey = coordKey(coord);
      this.options.onWaypointMove?.(this.waypointDrag.index, coord);
      return;
    }
    if (!this.dragging) {
      if (this.interactionLocked) return;
      // "This pin is draggable" affordance, off the same hit-test the drag
      // itself uses. Cleared back to the canvas's own CSS `grab` (see
      // SettlementCanvas.vue) rather than hard-coded here.
      this.setCursor(this.draftWaypointAt(this.pointerScreen(e)) !== null ? 'pointer' : '');
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
    // A pin drag never became a camera drag (see onPointerDown), so it also
    // must not fall through to handleClick — releasing a dragged waypoint
    // would otherwise *append* a second one on the hex it was dropped on.
    if (this.waypointDrag) {
      this.waypointDrag = null;
      this.setCursor('');
      return;
    }
    if (this.dragging && this.dragMoved < DRAG_CLICK_SLOP_PX && !this.suppressNextClick) {
      this.handleClick(e);
    }
    this.suppressNextClick = false;
    // `dragging` is true for *any* pointerdown, a stationary click included,
    // so it alone doesn't say whether the camera actually moved. Gate the
    // rebuild below on the same slop threshold the click check above uses: a
    // click that never panned the map leaves every sprite exactly as it
    // already is — no reason to pay for a full rebuild.
    const wasDragging = this.dragging && this.dragMoved >= DRAG_CLICK_SLOP_PX;
    this.dragging = false;
    if (wasDragging) {
      // The drag's last queued rebuild (scheduleCull's rAF, from the final
      // pointermove) may already have fired while dragging was still true —
      // force one more, synchronous rebuild now that dragging is false to
      // guarantee the final state is fully up to date. The fog mesh itself
      // needs no equivalent step: it samples the live mask texture every
      // frame regardless of camera movement, so there is nothing to rebake.
      this.rebuildAll();
    }
  };

  private onPointerLeave = () => {
    this.setHoveredCoord(null);
  };

  private updateHover(e: PointerEvent) {
    const canvas = this.app?.canvas;
    if (!canvas) return;
    // Pointer tracking is window-level (see the class-level listeners above)
    // so drags survive leaving the canvas, but that means a plain bounding-
    // rect test always passes for HUD panels absolutely-positioned on top of
    // the canvas (e.g. the training queue, army panel) — the rect covers the
    // whole viewport regardless of what's actually under the cursor. A real
    // hit test against the element under the pointer is what those overlays
    // need; panels with `pointer-events: none` (tooltip, non-interactive
    // header/panel regions) still fall through to the canvas correctly.
    if (document.elementFromPoint(e.clientX, e.clientY) !== canvas) {
      this.setHoveredCoord(null);
      return;
    }
    const rect = canvas.getBoundingClientRect();
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
    if (this.isFogActive() && !worldModel.isExplored(coord.q, coord.r)) {
      this.options.onHoverChange?.(null);
      return;
    }
    const tile = worldModel.getTile(coord.q, coord.r);
    // Water is never a valid target to found on, so the landing page's
    // pre-founding preview (settlement mode, no settlement yet) hides the
    // hover outline over it — otherwise the player could "hover" a spot
    // they can't actually land on. Once a settlement exists (village view)
    // or in world-map mode, water is just terrain like any other hex and
    // should hover/tooltip normally, even though it's still not buildable.
    if (tile.terrain === 'sea' && mode === 'settlement' && !this.settlement()) {
      this.options.onHoverChange?.(null);
      return;
    }

    const grid = isoGridPosition(coord, TILE_W, TILE_H);
    const flat = isoTopPoints(TILE_W, TILE_H).flatMap((p) => [grid.x + p.x, grid.y + p.y]);
    this.hoverLayer
      .poly(flat)
      .fill({ color: HOVER_FILL, alpha: 0.28 })
      .stroke({ width: 4, color: HOVER_STROKE, alpha: 1 });

    if (mode === 'settlement') {
      const river = worldModel.getRiverTile(coord.q, coord.r);
      this.options.onHoverChange?.(this.hoverInfoFor(tile, grid, river));
    }
  }

  /**
   * Screen-space centre of a hex's top face — e.g. for a test/debug script
   * (see main.ts's __demoWorld-style hooks) to click a specific known hex
   * precisely, rather than guessing pixel offsets that only happen to land
   * right at one particular zoom/camera framing.
   */
  hexCenterScreen(coord: AxialCoord): { x: number; y: number } {
    // The true centre of the top-face polygon (isoTopPoints spans the full
    // 0..TILE_W / 0..TILE_H box) — not TILE_TOPFACE_Y_OFFSET, which is
    // hoverInfoFor's *tooltip anchor* point (deliberately near the top of
    // the tile, not its centre) and would click closer to this hex's
    // upper neighbour than to itself.
    const grid = isoGridPosition(coord, TILE_W, TILE_H);
    return this.toScreen({ x: grid.x + TILE_W / 2, y: grid.y + TILE_H / 2 });
  }

  private hoverInfoFor(tile: Tile, grid: { x: number; y: number }, river: RiverTile | undefined): HoverInfo {
    // Anchor at the tile's own right edge (not its centre) so the tooltip
    // — which grows rightward from screenX, see HexTooltip.vue — sits
    // clear of the hex instead of covering its right half. The edge itself
    // scales with zoom via toScreen, so the gap stays correct at any zoom
    // level rather than the fixed-pixel offset a centre anchor would need.
    const screen = this.toScreen({ x: grid.x + TILE_W, y: grid.y + TILE_CENTER_Y_OFFSET });
    const owner = tile.ownerId ? this.options.worldModel.getSettlement(tile.ownerId) : undefined;
    const mine = owner?.ownerId === this.options.playerId;

    if (tile.buildingType) {
      const title = BUILDING_LABELS[tile.buildingType];
      const subtitle = owner ? (mine ? owner.name : `${owner.ownerName}'s ${owner.name}`) : title;
      const level = tile.buildingLevel ?? 1;
      // Output/modifier/workers are only for the viewer's own buildings —
      // scouting a rival's tile shows the building and its level, but the
      // stats themselves are gated behind Premium (see HoverInfo.premiumLocked).
      const stats = mine ? this.buildingStats(tile, level) : {};
      return {
        screenX: screen.x,
        screenY: screen.y,
        title,
        subtitle,
        stat: `Level ${level}`,
        level,
        ...stats,
        premiumLocked: !mine,
        cta: mine ? 'Click to open' : undefined,
      };
    }
    const title = terrainTitleFor(tile, river);
    if (owner) {
      const subtitle = mine ? owner.name : `${owner.ownerName}'s ${owner.name}`;
      return {
        screenX: screen.x,
        screenY: screen.y,
        title,
        subtitle,
        stat: mine ? 'Click to build here' : 'Claimed ground',
      };
    }
    return {
      screenX: screen.x,
      screenY: screen.y,
      title,
      subtitle: 'Unclaimed',
      stat: '',
    };
  }

  /**
   * See the HoverInfo doc comment: output/modifier/workers aren't tracked
   * per-building anywhere, so these are derived deterministically from the
   * building's own type/level/neighbours purely so the hover card has
   * something concrete to show, matching the mockup's "Output +240 food/h /
   * Workers 8/8" for a farm. The formulas themselves live in
   * buildingEconomy.ts so BuildingModal.vue shows the exact same numbers.
   */
  private buildingStats(
    tile: Tile,
    level: number,
  ): Pick<HoverInfo, 'output' | 'modifier' | 'workers'> {
    if (!tile.buildingType) return {};
    const boostTerrain = BOOST_TERRAIN[tile.buildingType];
    const matchingNeighbours = boostTerrain ? matchingNeighbourCount(tile, boostTerrain, this.getTile) : 0;
    return buildingStatsFor(tile.buildingType, level, matchingNeighbours);
  }

  private getTile = (q: number, r: number): Tile => this.options.worldModel.getTile(q, r);

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.interactionLocked) return;
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
    this.noteWheelActivity();
    this.scheduleCull();
  };

  /**
   * Marks a wheel/pinch zoom gesture as in progress and (re)arms the timer
   * that ends it. A continuous zoom changes `camera.zoom` on every event, so
   * it crosses cameraMovedEnough()'s threshold on many successive frames —
   * exactly what scheduleCull already throttles for a drag, except a wheel
   * gesture has no pointerup to hang that on. Once the
   * events stop for WHEEL_IDLE_MS the gesture is over, so the flag clears and
   * one forced rebuild bakes the settled view — same guarantee onPointerUp
   * gives when a drag ends and tickCameraAnim gives when an animation
   * completes.
   */
  private noteWheelActivity() {
    this.wheeling = true;
    if (this.wheelIdleTimer !== null) clearTimeout(this.wheelIdleTimer);
    this.wheelIdleTimer = setTimeout(() => {
      this.wheelIdleTimer = null;
      this.wheeling = false;
      if (this.destroyed) return;
      this.forceRebuild();
    }, WHEEL_IDLE_MS);
  }

  private handleClick(e: PointerEvent) {
    const canvas = this.app?.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(this.camera, screen, this.viewport);
    const coord = isoPixelToAxial(world, TILE_W, TILE_H);
    const tile = this.options.worldModel.getTile(coord.q, coord.r);
    // Issue #16 "ring menu on click of tile": the ring anchors on the
    // clicked hex's own screen centre (same point the hover tooltip anchors
    // to) rather than the raw pointer position, so it stays centred on the
    // tile regardless of exactly where within it the player clicked.
    const grid = isoGridPosition(coord, TILE_W, TILE_H);
    const anchor = this.toScreen({ x: grid.x + TILE_W / 2, y: grid.y + TILE_CENTER_Y_OFFSET });
    this.options.onHexClick?.(coord, tile, anchor);
  }

  /**
   * True while the camera is mid-gesture — a pointer drag, an animated
   * transition (tickCameraAnim) or a wheel/pinch zoom (see noteWheelActivity)
   * — i.e. while more camera movement is expected imminently and any rebuild
   * done right now is about to be superseded. Each of the three ends with a
   * forced, fully up-to-date rebuild, so work skipped while this is true is
   * never work lost.
   */
  private get isInteracting(): boolean {
    return this.dragging || !!this.cameraAnim || this.wheeling;
  }

  private scheduleCull() {
    if (this.cullQueued) return;
    this.cullQueued = true;
    requestAnimationFrame(() => {
      this.cullQueued = false;
      if (this.destroyed) return;
      // Any ongoing camera gesture (see isInteracting: a drag, the founding
      // transition's animation, or a wheel/pinch zoom) can cross
      // cameraMovedEnough's threshold on almost every rAF — each pointermove,
      // animation step or wheel event nudges the camera or its zoom further —
      // and a rebuild re-syncs every visible terrain/border sprite, real
      // per-rebuild cost under software rendering, paid several times over
      // across a single gesture. visibleCoords already renders a
      // TILE_W*2 margin past the viewport edge, so there's slack to spend:
      // throttle rebuilds to once per DRAG_REBUILD_THROTTLE_MS instead of
      // firing on every threshold-crossing frame. Each gesture still ends
      // with one forced, fully up-to-date rebuild — onPointerUp's when a drag
      // is released, tickCameraAnim's forceRebuild() when the animation
      // completes, and noteWheelActivity's idle timer once zooming settles.
      if (this.isInteracting && performance.now() - this.lastRebuildAtMs < DRAG_REBUILD_THROTTLE_MS) {
        return;
      }
      if (this.cameraMovedEnough()) this.rebuildAll();
    });
  }

  private cameraMovedEnough(): boolean {
    const prev = this.lastBuiltCamera;
    if (!prev) return true;
    const moved = Math.hypot(this.camera.x - prev.x, this.camera.y - prev.y);
    return moved > TILE_W * 0.4 || Math.abs(this.camera.zoom - prev.zoom) / prev.zoom > 0.08;
  }

  /** Every hex axial coord whose grid position falls within `rect` (world-space). */
  private coordsInRect(rect: { minX: number; minY: number; maxX: number; maxY: number }): AxialCoord[] {
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
    const rebuildStart = performance.now();
    this.lastRebuildAtMs = rebuildStart;
    const fogActive = this.isFogActive();
    const rect = visibleWorldRect(this.camera, this.viewport, VISIBLE_RECT_MARGIN);
    const coords = this.coordsInRect(rect);
    const deepFogOnly =
      this.options.mode === 'world' && fogActive && fogDebugFlags.terrainCull && this.isEntirelyDeepFog(rect);
    this.deepFogOnly = deepFogOnly;

    let phaseStart = performance.now();
    if (deepFogOnly) {
      // isEntirelyDeepFog already confirmed every visible hex sits under
      // fully opaque unknown fog — terrain/borders drawn under it would be
      // fully hidden by the whiteMistLayer mesh regardless, so there's
      // nothing to gain by building either.
      fogPerfStats.terrainDrawnCount = 0;
      fogPerfStats.terrainCulledCount = 0;
    } else {
      this.rebuildTerrain(coords, fogActive);
    }
    fogPerfStats.terrainMs = performance.now() - phaseStart;

    phaseStart = performance.now();
    this.rebuildBorders(coords, fogActive, deepFogOnly);
    fogPerfStats.bordersMs = performance.now() - phaseStart;

    phaseStart = performance.now();
    this.rebuildMarkers();
    fogPerfStats.markersMs = performance.now() - phaseStart;

    if (this.options.mode === 'world' && !deepFogOnly) {
      // Same shortcut as terrain above — the open-water wave strokes this
      // recomputes would be drawn (by onTick's own deepFogOnly check) under
      // the same opaque backdrop, so there's nothing to gain by refreshing
      // wavePoints for hexes that are entirely hidden.
      phaseStart = performance.now();
      this.rebuildWaves(coords, fogActive);
      fogPerfStats.wavesMs = performance.now() - phaseStart;
    } else {
      fogPerfStats.wavesMs = 0;
      fogPerfStats.waveDrawnCount = 0;
      fogPerfStats.waveCulledCount = 0;
    }

    fogPerfStats.hexCount = coords.length;
    fogPerfStats.totalMs = performance.now() - rebuildStart;
  }

  /**
   * True only when it's certain no settlement's fog influence
   * (exploredRadius + FOG_TERRAIN_CULL_HEXES, converted to world-space
   * pixels) reaches anywhere into `rect` — i.e. every hex in the current
   * viewport sits under fully opaque unknown fog, so terrain/wave/border
   * work for the whole rebuild can be skipped (the fog mesh paints over all
   * of it regardless).
   *
   * This checks settlement *positions* — O(settlements) — rather than
   * scanning every visible hex's isExplored/distanceBeyondExplored. An
   * earlier version did exactly that per-hex scan, checking `coords` and
   * bailing out at the first explored hex it found — cheap in principle (no
   * geometry, just lookups), but wrong in practice: raster (column-major)
   * scan order has no relationship to distance from a settlement, so for a
   * *mixed* viewport (a settlement's own default world-map view, not a
   * deep-ocean pan) the scan could walk a large fraction of a low-zoom
   * viewport's thousands of hexes before reaching the one explored hex that
   * lets it return false — on every rebuild, even though the answer never
   * changes. Measured ~1.7x *slower* per rebuild than before this
   * optimisation existed at all, for exactly the common "looking at your
   * own island" case it was never supposed to touch. A bounding check
   * against known settlement positions answers the same question in a
   * small, fixed number of comparisons regardless of viewport hex count —
   * and, being generous rather than exact about the radius, can only ever
   * *under*-apply the optimisation (safe), never wrongly skip real content.
   */
  private isEntirelyDeepFog(rect: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
    const { worldModel } = this.options;
    for (const s of worldModel.listSettlements()) {
      const grid = isoGridPosition({ q: s.q, r: s.r }, TILE_W, TILE_H);
      // TILE_W alone already exceeds one hex's actual pixel pitch in every
      // direction, so multiplying by it (rather than the tighter per-axis
      // pitch) only ever over-, never under-, estimates how far a
      // settlement's influence reaches.
      const radiusPx = (worldModel.exploredRadius(s) + FOG_TERRAIN_CULL_HEXES) * TILE_W;
      const reaches =
        grid.x + radiusPx >= rect.minX &&
        grid.x - radiusPx <= rect.maxX &&
        grid.y + radiusPx >= rect.minY &&
        grid.y - radiusPx <= rect.maxY;
      if (reaches) return false;
    }
    return true;
  }

  /**
   * Once-per-rebuild prune of the settlement list to the ones whose
   * explored ring can still reach `bounds` (see fogSourcesNear). Shared by
   * isPastTerrainCull's two callers (rebuildTerrain, rebuildTerrainFlat) so
   * a single settlement walk replaces what would otherwise be a fresh
   * distanceBeyondExplored scan over every settlement, per hex.
   */
  private unexploredFogSources(bounds: AxialBounds | null): FogSource[] {
    const { worldModel } = this.options;
    return fogSourcesNear(worldModel.listSettlements(), (s) => worldModel.exploredRadius(s), bounds, FOG_TERRAIN_CULL_HEXES);
  }

  /**
   * Whether an unexplored hex is far enough past the scouted ring that
   * there's nothing to gain by drawing terrain there — the fog mesh above
   * it is guaranteed fully opaque (unknown ramp saturated) past
   * FOG_TERRAIN_CULL_HEXES. Shared by rebuildTerrain (settlement tile art)
   * and rebuildTerrainFlat (world-map flat fill) so the two agree.
   */
  private isPastTerrainCull(q: number, r: number, fogSources: FogSource[]): boolean {
    return distanceBeyondSources(q, r, fogSources) > FOG_TERRAIN_CULL_HEXES;
  }

  private rebuildTerrain(coords: AxialCoord[], fogActive: boolean) {
    fogPerfStats.terrainDrawnCount = 0;
    fogPerfStats.terrainCulledCount = 0;
    if (this.options.mode === 'world') {
      this.rebuildTerrainFlat(coords, fogActive);
      return;
    }

    const { worldModel } = this.options;
    const textures = this.textures!;
    const baseEntries = new Map<string, { texture: Texture; coord: AxialCoord }>();
    const topEntries = new Map<string, { texture: Texture; coord: AxialCoord }>();
    const settlement = this.settlement();
    const preview = !settlement;
    const previewCenter = this.options.previewCenter ?? { q: 0, r: 0 };
    const fogSources =
      fogActive && fogDebugFlags.terrainCull ? this.unexploredFogSources(axialBounds(coords)) : [];

    for (const c of coords) {
      // zip 6a: before a settlement exists, this is the landing page's
      // preview — one island, not a slice of the whole (unfogged) world.
      // Water isn't drawn at all (matching how world mode treats sea — see
      // rebuildTerrainFlat), and anything past a plausible single-island
      // radius is cut off so a neighbouring generated island can't show up
      // uninvited in the background.
      if (preview) {
        if (worldModel.getTile(c.q, c.r).terrain === 'sea') continue;
        if (hexDistance(c, previewCenter) > PREVIEW_ISLAND_RADIUS) continue;
      }
      // Terrain is drawn under the fog (not just on explored ground) so it
      // can show through the thin part of the unexplored mist near the
      // scouted ring, instead of the tile popping into existence only once
      // the fog fully clears — but past FOG_TERRAIN_CULL_HEXES the mist
      // above it is guaranteed fully opaque (the shader's own ramp
      // saturates), so there's nothing to gain by drawing it that far out.
      if (
        fogActive &&
        fogDebugFlags.terrainCull &&
        !worldModel.isExplored(c.q, c.r) &&
        this.isPastTerrainCull(c.q, c.r, fogSources)
      ) {
        fogPerfStats.terrainCulledCount++;
        continue;
      }
      const tile = worldModel.getTile(c.q, c.r);
      // Rivers can't be derived from the seed the way terrain/orientation/
      // variant can (a path depends on the whole island) — live mode only,
      // fetched once per island and looked up here rather than folded into
      // Tile itself, so a tile cached before that fetch lands never goes
      // stale (see WorldModel.setRiverTiles).
      const river = worldModel.getRiverTile(c.q, c.r);

      const key = coordKey(c);
      if (river) {
        // Only a Mouth's orientation actually needs this (see
        // riverTexturesFor/mouthOrientationOf) — skip the neighbour scan
        // for every other shape.
        const seaDirection = river.shape === 'mouth' ? worldModel.seaFacingDirectionOf(c) : null;
        const riverTextures = riverTexturesFor(textures, river, seaDirection);
        baseEntries.set(key, { texture: riverTextures.base, coord: c });
        topEntries.set(key, { texture: riverTextures.top, coord: c });
        continue;
      }
      baseEntries.set(key, { texture: baseTextureFor(textures, tile), coord: c });
      const topTexture = topTextureFor(textures, tile);
      if (topTexture) topEntries.set(key, { texture: topTexture, coord: c });
      fogPerfStats.terrainDrawnCount++;
    }

    this.syncSpriteLayer(this.terrainBase, baseEntries);
    this.syncSpriteLayer(this.terrainTop, topEntries);
  }

  // zip 7: world-map islands are flat coloured hexes, not tile art — see
  // WORLD_TERRAIN_FILL. Drawn straight into one Graphics layer rather than
  // pooled sprites since there's no texture (and thus no batching benefit)
  // to share.
  private rebuildTerrainFlat(coords: AxialCoord[], fogActive: boolean) {
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
    const fogSources =
      fogActive && fogDebugFlags.terrainCull ? this.unexploredFogSources(axialBounds(coords)) : [];

    for (const c of coords) {
      const tile = worldModel.getTile(c.q, c.r);
      if (tile.terrain === 'sea') continue; // open sea is just the background

      // Same cull as the settlement view's rebuildTerrain: draw the island
      // under the thin part of the unexplored mist near the scouted ring
      // (so it isn't a hard pop-in once the fog clears), but stop drawing
      // it at all once past FOG_TERRAIN_CULL_HEXES, where the mist above it
      // is guaranteed fully opaque anyway (the shader's own ramp saturates).
      if (
        fogActive &&
        fogDebugFlags.terrainCull &&
        !worldModel.isExplored(c.q, c.r) &&
        this.isPastTerrainCull(c.q, c.r, fogSources)
      ) {
        fogPerfStats.terrainCulledCount++;
        continue;
      }

      const grid = isoGridPosition(c, TILE_W, TILE_H);
      const flat = inflated.flatMap((p) => [grid.x + p.x, grid.y + p.y]);
      this.terrainFlat.poly(flat).fill({ color: WORLD_TERRAIN_FILL[tile.terrain] });
      fogPerfStats.terrainDrawnCount++;
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
  //
  // Cheap-first ordering matters here, because the grid this walks grows
  // with the visible world rect and so with how far out the camera is
  // zoomed: the density hash rejects ~38% for the cost of three multiplies,
  // the fog cull is a few subtractions over an already-pruned source list,
  // and isNearLand — 7 getTile lookups — runs only on what survives both.
  private rebuildWaves(coords: AxialCoord[], fogActive: boolean) {
    const margin = TILE_W;
    const rect = visibleWorldRect(this.camera, this.viewport, margin);
    const points: WavePoint[] = [];
    let culled = 0;

    // Same threshold, and the same reasoning, as the terrain cull: past
    // FOG_TERRAIN_CULL_HEXES the unknown ramp is saturated, so the mist
    // mesh above these strokes is provably opaque and a wave drawn there
    // cannot reach the screen. Unlike terrain this is not only a build-time
    // saving — drawWaves re-strokes every surviving point *every frame*, so
    // a wave kept here costs two quadratic curves per frame forever.
    // rebuildAll's rect uses VISIBLE_RECT_MARGIN (2 * TILE_W) against this
    // one's TILE_W, so coords strictly contains the wave grid and its
    // bounds cannot prune a source that reaches a wave.
    const fogSources =
      fogActive && fogDebugFlags.waveCull ? this.unexploredFogSources(axialBounds(coords)) : [];
    const culling = fogSources.length > 0;

    const yStart = Math.floor(rect.minY / WAVE_STEP_Y) * WAVE_STEP_Y;
    const xStart = Math.floor(rect.minX / WAVE_STEP_X) * WAVE_STEP_X;
    for (let y = yStart; y < rect.maxY; y += WAVE_STEP_Y) {
      for (let x = xStart; x < rect.maxX; x += WAVE_STEP_X) {
        if (hash01(x, y, 1) > WAVE_DENSITY) continue;
        const jx = x + (hash01(x, y, 2) - 0.5) * WAVE_JITTER_X;
        const jy = y + (hash01(x, y, 3) - 0.5) * WAVE_JITTER_Y;
        const coord = isoPixelToAxial({ x: jx, y: jy }, TILE_W, TILE_H);
        if (culling && this.isPastTerrainCull(coord.q, coord.r, fogSources)) {
          culled++;
          continue;
        }
        if (this.isNearLand(coord)) continue;
        points.push({
          x: jx,
          y: jy,
          phase: hash01(x, y, 4) * Math.PI * 2,
          periodMs: (3.4 + hash01(x, y, 5) * 3.2) * 1000,
        });
      }
    }
    this.wavePoints = points;
    fogPerfStats.waveDrawnCount = points.length;
    fogPerfStats.waveCulledCount = culled;
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

  private rebuildBorders(coords: AxialCoord[], fogActive: boolean, deepFogOnly: boolean) {
    const { worldModel, mode, playerId } = this.options;
    this.borderLayer.clear();
    fogPerfStats.borderedHexCount = 0;

    if (deepFogOnly) {
      // isEntirelyDeepFog already confirmed no settlement (any owner's) can
      // reach this viewport, so nothing in it is explored — there is no
      // border to draw and no per-hex loop worth running over what can be
      // thousands of hexes in a low-zoom world-map viewport.
      return;
    }

    if (!fogDebugFlags.realmBorders) return;

    for (const c of coords) {
      if (fogActive && !worldModel.isExplored(c.q, c.r)) continue;

      const tile = worldModel.getTile(c.q, c.r);
      if (mode === 'world' && tile.terrain === 'sea') continue;
      if (!tile.ownerId) continue;

      fogPerfStats.borderedHexCount++;
      const owner = worldModel.getSettlement(tile.ownerId);
      const mine = owner?.ownerId === playerId;
      const color = mine ? GOLD : RIVAL;

      const grid = isoGridPosition(c, TILE_W, TILE_H);
      const top = isoTopPoints(TILE_W, TILE_H).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
      const flat = top.flatMap((p) => [p.x, p.y]);

      // "Glow+wash" (docs/design/zip-brainstorms.md, zip 9): a soft
      // translucent fill across every owned hex ("wash"), with a brighter,
      // thicker stroke reserved for the realm's *outer* edges only
      // ("glow") — drawn as two overlapping strokes (a wide, faint one
      // under a thin, solid one) to fake a soft glow without a dedicated
      // blur filter. Previously this stroked the *entire* outline of every
      // claimed hex, including edges shared with another owned hex, which
      // drew a solid mesh over the whole realm instead of a border around it.
      this.borderLayer.poly(flat).fill({ color, alpha: 0.12 });

      for (const edge of outerEdgesOf(worldModel, c, tile.ownerId)) {
        const a = top[edge[0]];
        const b = top[edge[1]];
        this.borderLayer.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 7, color, alpha: 0.25, cap: 'round' });
        this.borderLayer
          .moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({ width: 2.5, color, alpha: 0.95, cap: 'round' });
      }
    }
  }

  private rebuildMarkers() {
    this.markerLayer.clear();
    // markerLayer.clear() only wipes the Graphics geometry, not the pooled
    // Sprite/Text children parented to it — each pass counts what it used and
    // hides the rest, same bookkeeping labels already do (labelsUsed).
    this.iconsUsed = 0;
    if (this.options.mode === 'settlement') {
      if (!this.options.hideSettlementBadge) this.rebuildSettlementLabels();
      this.drawArmyOverlay();
      this.hideUnusedIcons();
      return;
    }
    this.hideUnusedIcons();
    if (this.options.mode !== 'world') {
      this.labelPool.forEach((l) => (l.visible = false));
      return;
    }
    const { worldModel, playerId } = this.options;
    const fogActive = this.isFogActive();
    this.labelsUsed = 0;

    for (const settlement of worldModel.listSettlements()) {
      // Don't reveal a settlement (yours or a rival's) over ground nobody
      // has scouted — same "hidden until explored" rule as its hex.
      if (fogActive && !worldModel.isExplored(settlement.q, settlement.r)) continue;
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
      ownerLabel.style.fontWeight = 'normal';
      ownerLabel.style.fontSize = 11;
      ownerLabel.style.letterSpacing = 0;
      ownerLabel.style.dropShadow = false;
      ownerLabel.anchor.set(0.5, 0);
      ownerLabel.position.set(center.x, center.y + 8 * this.camera.zoom + 4);
      ownerLabel.visible = true;
    }

    // Issue #16 "map island names": "the one where the current player has
    // settled needs to be gold". `Settlement.islandId` (set from the
    // backend's SettlementResponse — see stores/world.ts) is the only link
    // between a settlement and an island id; demo mode never populates it,
    // so its island names simply stay neutral there, same as before.
    const myIslandId = worldModel.listSettlements().find((s) => s.ownerId === playerId)?.islandId;
    for (const island of worldModel.listIslands()) {
      if (fogActive && !worldModel.isExplored(island.q, island.r)) continue;
      const grid = isoGridPosition({ q: island.q, r: island.r }, TILE_W, TILE_H);
      const center = this.toScreen({ x: grid.x + TILE_W / 2, y: grid.y + TILE_H / 2 });
      const mineIsland = island.id === myIslandId;
      const label = this.acquireLabel();
      // Reference styling: uppercase, letter-spaced small-caps label, muted
      // gray for other islands, gold + bold for the player's own.
      label.text = island.name.toUpperCase();
      label.style.fill = mineIsland ? GOLD : 0x8fa3af;
      label.style.fontWeight = mineIsland ? 'bold' : '600';
      label.style.fontSize = 13;
      label.style.letterSpacing = 1.5;
      // Reference gives island names a soft drop shadow for legibility over
      // the water/terrain behind them — a plain fill alone washes out badly
      // over the lighter sand-colored tiles some island names sit near.
      label.style.dropShadow = { color: 0x000000, alpha: 0.6, blur: 3, distance: 1, angle: Math.PI / 2 };
      // Reference places the name below the island's shape entirely, not
      // over its tiles or clipping its bottom edge. Islands are generated at
      // varying sizes (worldGenerator's ISLAND_MIN/MAX_RADIUS), so a fixed
      // offset either overlaps a big island or floats far below a small one
      // — instead, measure the real bottom edge from the island's actual
      // (flood-filled, cached) tile footprint and clear past that.
      let bottomWorldY = grid.y + TILE_H; // this hex's own bottom vertex, as a floor
      for (const tile of worldModel.islandFootprint(island)) {
        const tileGrid = isoGridPosition(tile, TILE_W, TILE_H);
        bottomWorldY = Math.max(bottomWorldY, tileGrid.y + TILE_H);
      }
      const bottom = this.toScreen({ x: grid.x + TILE_W / 2, y: bottomWorldY });
      label.anchor.set(0.5, 0);
      label.position.set(center.x, bottom.y + 10 * this.camera.zoom + 6);
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
      // A fleet's current position is only worth showing an ETA for once
      // it's sailed into scouted waters — same rule as everything else fog
      // gates, checked against its *current* (interpolated) hex rather than
      // its endpoints so it fades into view exactly when it crosses the
      // scouted ring, not at departure or arrival.
      const fleetCoord = isoPixelToAxial(world, TILE_W, TILE_H);
      if (fogActive && !worldModel.isExplored(fleetCoord.q, fleetCoord.r)) continue;
      const screen = this.toScreen(world);
      const remainingMs = Math.max(0, fleet.etaAt - now);
      const label = this.acquireLabel();
      label.text = formatEta(remainingMs);
      label.style.fill = 0xe8f0f5;
      label.style.fontWeight = 'normal';
      label.style.fontSize = 11;
      label.style.letterSpacing = 0;
      label.style.dropShadow = false;
      label.anchor.set(0, 0);
      label.position.set(screen.x + 8, screen.y - 8);
      label.visible = true;
    }

    // Issue #46 phase 3: trade carts in transit — same interpolation +
    // fog-gating as the fleet loop just above (do not invent a second
    // scheme), plus an actual marker dot since a cart, unlike a fleet, has
    // no ship sprite of its own yet to carry the eye to its ETA label.
    for (const cart of worldModel.listCartShipments()) {
      const t = Math.min(1, Math.max(0, (now - cart.departedAt) / (cart.etaAt - cart.departedAt || 1)));
      const fromGrid = isoGridPosition({ q: cart.fromQ, r: cart.fromR }, TILE_W, TILE_H);
      const toGrid = isoGridPosition({ q: cart.toQ, r: cart.toR }, TILE_W, TILE_H);
      const world = {
        x: fromGrid.x + (toGrid.x - fromGrid.x) * t,
        y: fromGrid.y + (toGrid.y - fromGrid.y) * t,
      };
      const cartCoord = isoPixelToAxial(world, TILE_W, TILE_H);
      if (fogActive && !worldModel.isExplored(cartCoord.q, cartCoord.r)) continue;
      const screen = this.toScreen(world);

      this.markerLayer
        .circle(screen.x, screen.y, 4 * this.camera.zoom + 2)
        .fill({ color: CART_COLOR })
        .stroke({ width: 1.5, color: 0x0b1116, alpha: 0.8 });

      const remainingMs = Math.max(0, cart.etaAt - now);
      const label = this.acquireLabel();
      label.text = `${Math.round(cart.cargoAmount)} ${cart.cargoResource} · ${formatEta(remainingMs)}`;
      label.style.fill = CART_COLOR;
      label.style.fontWeight = 'normal';
      label.style.fontSize = 11;
      label.style.letterSpacing = 0;
      label.style.dropShadow = false;
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
      // Issue #16 follow-up: the badge floated above the longhouse's own
      // tile, which sits in the *middle* of the settlement's claimed hexes,
      // not its northmost edge — the reference has it clear above the whole
      // cluster instead. Same footprint-scanning approach section 6 uses for
      // world-map island labels (there: lowest tile-bottom vertex; here:
      // highest tile-top vertex), scanned over the settlement's owned disc
      // rather than a flood fill since claimed tiles are already exactly
      // that disc (`foundSettlement`/`claimTile`).
      // Measured against each tile's own art, halfway up the sprite rather
      // than its full height (grid.y - TILE_TOPFACE_Y_OFFSET / 2) — the same
      // offset `rebuildTerrain` places building/tree sprites at (see its
      // comment above) gave the badge enough clearance to never overlap a
      // treetop, but read as floating noticeably farther above the
      // settlement than the reference. Half that offset still clears a
      // bare topmost tile's own vertex (0 < TILE_TOPFACE_Y_OFFSET / 2) and
      // most of a neighbouring forest tile's canopy, while sitting closer.
      let topWorldY = grid.y - TILE_TOPFACE_Y_OFFSET / 2; // this hex's own ceiling
      for (const c of hexesInRadius({ q: settlement.q, r: settlement.r }, worldModel.borderRadius(settlement))) {
        const tileGrid = isoGridPosition(c, TILE_W, TILE_H);
        //topWorldY = Math.min(topWorldY, tileGrid.y - TILE_TOPFACE_Y_OFFSET / 4);
        topWorldY = Math.min(topWorldY, tileGrid.y);
      }
      const top = this.toScreen({ x: grid.x + TILE_W / 2, y: topWorldY });
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
      // Issue #16 "settlement badge": "above longhouse also showing its
      // level" — mockup reads "Bjornstad  you · Lv 4", with "you · Lv 4" in
      // a visibly lighter/dimmer weight than the bold settlement name, not
      // one uniform run of text. Two pooled labels side by side, rather
      // than one, since Pixi's Text has no per-run rich styling.
      const zoomScale = Math.max(1, this.camera.zoom / SETTLEMENT_DEFAULT_ZOOM);
      const nameLabel = this.acquireLabel();
      nameLabel.text = settlement.name;
      nameLabel.style.fill = 0xe8f0f5;
      nameLabel.style.fontWeight = 'bold';
      nameLabel.style.fontSize = 13 * zoomScale;
      nameLabel.style.letterSpacing = 0;
      nameLabel.style.dropShadow = false;
      nameLabel.alpha = 1;
      nameLabel.anchor.set(0, 0.5);

      const suffixLabel = this.acquireLabel();
      suffixLabel.text = mine ? `you · Lv ${settlement.level}` : `Lv ${settlement.level}`;
      suffixLabel.style.fill = 0xe8f0f5;
      suffixLabel.style.fontWeight = '400';
      suffixLabel.style.fontSize = 12 * zoomScale;
      suffixLabel.style.letterSpacing = 0;
      suffixLabel.style.dropShadow = false;
      suffixLabel.alpha = 0.6;
      suffixLabel.anchor.set(0, 0.5);

      const dotR = 4 * zoomScale;
      const padX = 12 * zoomScale;
      const gap = 8 * zoomScale;
      const nameGap = 6 * zoomScale;
      const pillH = 26 * zoomScale;
      const pillW = padX * 2 + dotR * 2 + gap + nameLabel.width + nameGap + suffixLabel.width;
      const pillX = top.x - pillW / 2;
      // `top` is already clear of every claimed tile's tallest possible art
      // (see above), so this only needs a small breathing-room margin.
      const pillY = top.y - 10 * zoomScale - pillH;

      this.markerLayer
        .roundRect(pillX, pillY, pillW, pillH, pillH / 2)
        .fill({ color: 0x08121a, alpha: 0.8 })
        .stroke({ width: 1, color, alpha: 0.9 });
      // Reference mockup: a small hex (not a round dot), matching the same
      // pointy-top hexagon TopBar's logo badge and ResourceBar's icons use
      // elsewhere in the HUD, not the isometric tile's own hex shape.
      this.markerLayer
        .poly(hexPoints(pillX + padX + dotR, pillY + pillH / 2, dotR))
        .fill({ color });
      nameLabel.position.set(pillX + padX + dotR * 2 + gap, pillY + pillH / 2);
      suffixLabel.position.set(nameLabel.x + nameLabel.width + nameGap, pillY + pillH / 2);
      nameLabel.visible = true;
      suffixLabel.visible = true;
    }
    for (let i = this.labelsUsed; i < this.labelPool.length; i++) this.labelPool[i].visible = false;
  }

  private hideUnusedIcons() {
    for (let i = this.iconsUsed; i < this.iconPool.length; i++) this.iconPool[i].visible = false;
  }

  private toScreen(world: { x: number; y: number }) {
    return worldToScreen(this.camera, world, this.viewport);
  }

  /**
   * One pooled marker-icon Sprite, positioned in screen space (markerLayer is
   * a sibling of the camera-scaled `world` container, so everything in it is
   * already in screen pixels — see rebuildSettlementLabels' own note).
   *
   * `size` is the icon's on-screen height in pixels: markers are HUD chrome
   * and keep a constant size as the camera zooms, like the settlement badge.
   * Pooled for the same reason labels are — the overlay is redrawn from
   * scratch every frame, and allocating a Sprite per marker per frame would
   * churn the GPU's batcher for no reason.
   */
  private drawIcon(
    name: MarkerIconName,
    x: number,
    y: number,
    opts: {
      size: number;
      color: number;
      alpha?: number;
      rotation?: number;
      /** Mirrors the icon horizontally — directional icons are authored pointing right (+x). */
      flipX?: boolean;
      anchorX?: number;
      anchorY?: number;
    },
  ): boolean {
    const texture = this.icons?.[name];
    if (!texture) return false;
    let sprite = this.iconPool[this.iconsUsed];
    if (!sprite) {
      sprite = new Sprite();
      this.iconPool.push(sprite);
      this.markerLayer.addChild(sprite);
    }
    this.iconsUsed++;
    sprite.texture = texture;
    sprite.anchor.set(opts.anchorX ?? 0.5, opts.anchorY ?? 0.5);
    const scale = opts.size / texture.height;
    sprite.scale.set(opts.flipX ? -scale : scale, scale);
    sprite.rotation = opts.rotation ?? 0;
    sprite.tint = opts.color;
    sprite.alpha = opts.alpha ?? 1;
    sprite.position.set(x, y);
    sprite.visible = true;
    return true;
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

  /**
   * Forces an immediate rebuild without moving the camera — rebuildAll is
   * otherwise only ever triggered by cameraMovedEnough() past a real pan/zoom
   * threshold (see scheduleCull), so something that changes rendering
   * without moving the camera (e.g. FogDebugPanel flipping a fogDebugFlags
   * toggle) has no other way to make the change visible immediately.
   */
  forceRebuild() {
    if (!this.app) return;
    this.rebuildAll();
  }

  /**
   * Issue #16 "status box": sets (or clears, passing undefined) the pulsing
   * highlight outline (drawHighlight, redrawn every tick already) without
   * going through `updateOptions` — that method unconditionally re-snaps
   * the camera back to the settlement's origin once already founded (see
   * its `wasFounded` branch below), which would cancel out a `panTo` call
   * made just before it, exactly the combination BuildQueuePanel's
   * click-to-center-and-flash needs.
   */
  setHighlight(coord: AxialCoord | undefined) {
    this.options = { ...this.options, highlightCoord: coord };
  }

  /**
   * Issue #40 phase 2: hands the renderer everything it needs to draw
   * dispatched armies, a selected army's route, and an in-progress dispatch's
   * waypoints — see `ArmyOverlayData`. Pass `null` to clear it (e.g. leaving
   * the settlement view). Like `setHighlight`, this only stores the data;
   * `rebuildMarkers` (already running every tick — see `onTick`) picks it up
   * on the very next frame without needing a forced rebuild here.
   */
  setArmyOverlay(data: ArmyOverlayData | null) {
    this.armyOverlay = data;
    // Nothing to drag once the draft is gone (dispatch confirmed/cancelled)
    // or the pin count shrank under the index being held.
    if (this.waypointDrag && this.waypointDrag.index >= (data?.draftWaypoints.length ?? 0)) {
      this.waypointDrag = null;
    }
  }

  /** What `drawArmyOverlay` placed on screen on the most recent frame — see `ArmyOverlayFrame`. */
  lastArmyOverlayFrame(): ArmyOverlayFrame {
    return this.armyOverlayFrame;
  }

  /**
   * Issue #159 part B: the reachable-range tint shown while composing a
   * dispatch or field order — see `lib/map/hexPath.ts`'s `reachableRange`,
   * which is what the store should feed in here. Pass `null` (or an empty
   * array) to clear it. Like `setArmyOverlay`, this only stores the data;
   * `onTick` (already running every frame) redraws it on the next tick.
   */
  setRangeOverlay(hexes: AxialCoord[] | null) {
    this.rangeOverlay = hexes && hexes.length > 0 ? hexes : null;
  }

  /**
   * Fog v2 (docs/design/map-fog-v2.md §2.4/§3): hands the renderer a freshly
   * fetched (or, in demo mode, generated) mask bitmap for a world of the
   * given `radius`. `radius` picks the same world-to-mask-UV placement
   * (worldMaskBounds, mirroring the backend's FogMaskLayout.WorldBounds) on
   * every call, so this is cheap to call again even when only the texture
   * itself changed. `bitmap` null is a no-op — both fog layers already
   * default an unbound mask to fully-unknown, so there's nothing useful to
   * do before the first real fetch resolves.
   */
  setFogMask(radius: number, bitmap: ImageBitmap | null) {
    if (!bitmap) return;

    const placement = fogMaskPlacement(radius, TILE_W, TILE_H);
    this.blackFogLayer.setPlacement(placement);
    this.whiteMistLayer.setPlacement(placement);

    const texture = Texture.from(bitmap);
    this.blackFogLayer.setMaskTexture(texture);
    this.whiteMistLayer.setMaskTexture(texture);

    // Both layers now hold `texture` as their current mask and the previous
    // one as uMaskPrev, mid cross-fade (FogMaskLayer.setMaskTexture, §2.6).
    // The generation *before* that is no longer referenced by either layer
    // at all, so it's safe to free now — one generation of slack rather
    // than destroying the texture still actively cross-fading out.
    this.previousFogMaskTexture?.destroy(true);
    this.previousFogMaskTexture = this.fogMaskTexture;
    this.fogMaskTexture = texture;
  }

  /** World-space centre of a hex's top face — `hexCenterScreen` before the camera transform. */
  private hexCenterWorld(coord: AxialCoord): { x: number; y: number } {
    const grid = isoGridPosition(coord, TILE_W, TILE_H);
    return { x: grid.x + TILE_W / 2, y: grid.y + TILE_H / 2 };
  }

  /**
   * Where an army's marker belongs this frame, in world space, and whether
   * that is an interpolated point rather than a hex centre.
   *
   * In transit, the answer comes from the frozen leg (`routeProgressAt`), so
   * two consecutive polls returning the same leg produce the exact same
   * point — a re-sync is invisible by construction. When the *leg itself*
   * changes (recall, turn-around, arrival) the marker eases across from
   * wherever it was rather than snapping, which is the one case polling can
   * actually make jump. A stationary army (at home, or a guest garrison) has
   * no movement at all and simply sits on its authoritative hex.
   */
  private resolveArmyPoint(
    army: ArmyOverlayMarker,
    nowMs: number,
  ): { x: number; y: number; interpolated: boolean; heading: { x: number; y: number } | null } {
    const movement = army.movement;
    const progress = movement
      ? routeProgressAt(
          movement.path,
          movement.cumulativeHours,
          movement.departedAtMs,
          movement.arrivesAtMs,
          nowMs,
        )
      : null;

    let target: { x: number; y: number };
    let interpolated = false;
    let heading: { x: number; y: number } | null = null;
    if (progress && !progress.arrived) {
      const from = this.hexCenterWorld(progress.from);
      const to = this.hexCenterWorld(progress.to);
      target = lerpPoint(from, to, progress.t);
      interpolated = progress.t > 0;
      heading = { x: to.x - from.x, y: to.y - from.y };
    } else {
      target = this.hexCenterWorld(army.position);
    }

    // `leg` identifies the schedule the point above was computed from — a new
    // one means the authoritative position may have moved discontinuously.
    const leg = movement ? `${movement.departedAtMs}:${movement.arrivesAtMs}:${movement.path.length}` : 'static';
    const previous = this.armyPoints.get(army.id);
    let point = target;
    if (previous && previous.leg !== leg) {
      previous.resyncFrom = { x: previous.x, y: previous.y };
      previous.resyncStartedAt = nowMs;
    }
    const state = previous ?? { x: target.x, y: target.y, leg, resyncFrom: null, resyncStartedAt: 0 };
    if (state.resyncFrom) {
      const t = Math.min(1, (nowMs - state.resyncStartedAt) / ARMY_RESYNC_MS);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic, matching tickCameraAnim's feel
      point = lerpPoint(state.resyncFrom, target, eased);
      if (t >= 1) state.resyncFrom = null;
    }
    state.leg = leg;
    state.x = point.x;
    state.y = point.y;
    this.armyPoints.set(army.id, state);

    return { ...point, interpolated, heading };
  }

  /**
   * Draws a route polyline with per-segment direction arrows (issue #93) —
   * a plain line reads the same in both directions and gives no clue which
   * end is the destination.
   */
  private drawRoute(points: { x: number; y: number }[], style: { color: number; alpha: number; width: number }) {
    if (points.length < 2) return;
    this.markerLayer.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) this.markerLayer.lineTo(p.x, p.y);
    this.markerLayer.stroke({ width: style.width, color: style.color, alpha: style.alpha, cap: 'round' });

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (Math.hypot(dx, dy) < ROUTE_ARROW_MIN_SEGMENT_PX) continue;
      const mid = lerpPoint(a, b, 0.5);
      const rotation = Math.atan2(dy, dx);
      if (
        !this.drawIcon('arrowhead', mid.x, mid.y, {
          size: ROUTE_ARROW_PX,
          color: style.color,
          alpha: style.alpha,
          rotation,
        })
      ) {
        // Icon-less fallback: the same triangle the sprite draws, so a
        // failed icon load costs polish rather than the direction cue itself.
        const size = ROUTE_ARROW_PX / 2;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const point = (fx: number, fy: number) => [mid.x + fx * cos - fy * sin, mid.y + fx * sin + fy * cos];
        this.markerLayer
          .poly([...point(size, 0), ...point(-size, size * 0.8), ...point(-size, -size * 0.8)])
          .fill({ color: style.color, alpha: style.alpha });
      }
    }
  }

  private drawArmyOverlay() {
    const overlay = this.armyOverlay;
    const frame: ArmyOverlayFrame = {
      armies: [],
      waypoints: [],
      targets: [],
      iconsReady: this.icons !== null,
    };
    this.armyOverlayFrame = frame;
    if (!overlay) return;

    const now = Date.now();

    // The selected army's full route (waypoints + computed path) — a muted
    // blue line, distinct from the gold in-progress-dispatch line below so a
    // player editing a *new* dispatch while another army is already selected
    // can't confuse the two. Issue #94: the part already marched is dimmed
    // and the part still ahead drawn at full strength, split at the same
    // interpolated point the marker itself sits at.
    if (overlay.route.length > 1) {
      const points = overlay.route.map((c) => this.hexCenterScreen(c));
      const selected = overlay.armies.find((a) => a.selected);
      const progress = selected?.movement
        ? routeProgressAt(
            selected.movement.path,
            selected.movement.cumulativeHours,
            selected.movement.departedAtMs,
            selected.movement.arrivesAtMs,
            now,
          )
        : null;
      // Only split when the drawn route really is the leg being travelled —
      // `route` is whichever path the caller chose to show, and a mismatched
      // length means it is not the one `progress` was measured against.
      const splitAt =
        progress && !progress.arrived && selected!.movement!.path.length === points.length ? progress : null;
      if (splitAt) {
        const marker = lerpPoint(points[splitAt.legIndex], points[splitAt.legIndex + 1], splitAt.t);
        this.drawRoute([...points.slice(0, splitAt.legIndex + 1), marker], {
          color: ROUTE_COLOR,
          alpha: 0.3,
          width: 2,
        });
        this.drawRoute([marker, ...points.slice(splitAt.legIndex + 1)], {
          color: ROUTE_COLOR,
          alpha: 0.85,
          width: 2,
        });
      } else {
        this.drawRoute(points, { color: ROUTE_COLOR, alpha: 0.8, width: 2 });
      }
    }

    // An in-progress dispatch's clicked waypoints, plus an arrowed line
    // connecting them — the "pins and a line" the design doc asks for, shown
    // before anything has actually been sent to the backend. Each pin is
    // draggable (see onPointerDown/draftWaypointAt).
    if (overlay.draftWaypoints.length > 1) {
      this.drawRoute(
        overlay.draftWaypoints.map((c) => this.hexCenterScreen(c)),
        { color: GOLD, alpha: 0.9, width: 2 },
      );
    }
    const draggedIndex = this.waypointDrag?.index ?? null;
    overlay.draftWaypoints.forEach((c, i) => {
      const p = this.hexCenterScreen(c);
      const isDestination = i === overlay.draftWaypoints.length - 1;
      const size = isDestination ? 30 : 24;
      frame.waypoints.push({ index: i, x: p.x, y: p.y });
      if (
        !this.drawIcon('waypoint-pin', p.x, p.y, {
          size: i === draggedIndex ? size * 1.15 : size,
          color: GOLD,
          alpha: isDestination ? 1 : 0.85,
        })
      ) {
        this.markerLayer
          .circle(p.x, p.y, isDestination ? 8 : 5)
          .fill({ color: GOLD, alpha: isDestination ? 0.95 : 0.7 })
          .stroke({ width: 1.5, color: 0x0b1116, alpha: 0.85 });
      }
    });

    // Issue #93: what this dispatch (or the selected army) is being sent at —
    // crossed sword and axe on an attack target's hex, a shield on a
    // support target's, so the settlement picked from a text list has a place
    // on the map rather than existing only as a name in the panel.
    for (const target of overlay.targets ?? []) {
      const p = this.hexCenterScreen(target.coord);
      frame.targets.push({ kind: target.kind, x: p.x, y: p.y });
      const color = target.kind === 'attack' ? ATTACK_COLOR : SUPPORT_COLOR;
      const drawn =
        target.kind === 'attack'
          ? this.drawIcon('sword', p.x, p.y, { size: 30, color, rotation: -Math.PI / 4 }) &&
            this.drawIcon('axe', p.x, p.y, { size: 30, color, rotation: Math.PI / 4, flipX: true })
          : this.drawIcon('shield', p.x, p.y, { size: 30, color });
      if (!drawn) {
        // Icon-less fallback: a cross for attack, a ring for support.
        if (target.kind === 'attack') {
          this.markerLayer
            .moveTo(p.x - 10, p.y - 10)
            .lineTo(p.x + 10, p.y + 10)
            .moveTo(p.x + 10, p.y - 10)
            .lineTo(p.x - 10, p.y + 10)
            .stroke({ width: 3, color, cap: 'round' });
        } else {
          this.markerLayer.circle(p.x, p.y, 10).stroke({ width: 3, color });
        }
      }
      // A ring under the marker so it reads as "this hex", not "something
      // floating near here" — the marker itself is deliberately bigger than
      // the hex it sits on at low zoom.
      this.markerLayer.circle(p.x, p.y, 18).stroke({ width: 1.5, color, alpha: 0.55 });
    }

    // Every dispatched army gets a banner marker (issue #94) at its live
    // position — interpolated along the current leg while marching, on its
    // authoritative hex while standing. Gold for the one currently selected,
    // muted blue for everything else, grey for one already turned around and
    // heading home.
    const armyVisionPoints: { x: number; y: number }[] = [];
    for (const army of overlay.armies) {
      const point = this.resolveArmyPoint(army, now);
      // §1c: only a travelling army grants live vision — one standing at
      // home or as a guest garrison already sits inside its settlement's own
      // explored/visible rings, same scope as the backend's own in-transit-
      // only condition (FogMaskService.GeneratePlayerMaskAsync).
      if (army.movement) armyVisionPoints.push({ x: point.x, y: point.y });
      const p = this.toScreen(point);
      frame.armies.push({ id: army.id, x: p.x, y: p.y, interpolated: point.interpolated });
      const color = army.selected ? GOLD : army.returning ? RETURNING_COLOR : ROUTE_COLOR;
      const size = army.selected ? 40 : 32;
      // The banner flies the way the army is marching (the icon is authored
      // pointing right — see the icon set's README), so a column's direction
      // is readable from the marker alone, without following the route line.
      const flipX = (point.heading?.x ?? 0) < 0;
      if (
        !this.drawIcon('flag', p.x, p.y, {
          size,
          color,
          // The pole's foot, not the sprite's centre, is what stands on the
          // army's position (see flag.svg's own geometry).
          anchorX: flipX ? 1 - 22.5 / 64 : 22.5 / 64,
          anchorY: 60 / 64,
          flipX,
        })
      ) {
        const r = army.selected ? 9 : 7;
        this.markerLayer
          .poly([p.x, p.y - r, p.x + r, p.y, p.x, p.y + r, p.x - r, p.y])
          .fill({ color })
          .stroke({ width: 1.5, color: 0x0b1116, alpha: 0.9 });
      }
      // A small ground shadow anchors the banner to its point — without it a
      // pole drawn upward from the position reads as hovering above the map.
      this.markerLayer.ellipse(p.x, p.y, 7, 3).fill({ color: 0x0b1116, alpha: 0.35 });
    }

    // §1c: pushed every tick, independent of any mask fetch — see
    // FogMaskLayer.setArmyVisionSources's own remarks on why this stays out
    // of the cached mask texture entirely.
    const armyVisionRadiusWorld = ARMY_VISION_RADIUS_HEXES * TILE_W;
    this.blackFogLayer.setArmyVisionSources(armyVisionPoints, armyVisionRadiusWorld);
    this.whiteMistLayer.setArmyVisionSources(armyVisionPoints, armyVisionRadiusWorld);

    // Armies that have gone away (arrived home and been folded back) would
    // otherwise keep their easing state forever.
    if (this.armyPoints.size > overlay.armies.length) {
      const live = new Set(overlay.armies.map((a) => a.id));
      for (const id of [...this.armyPoints.keys()]) {
        if (!live.has(id)) this.armyPoints.delete(id);
      }
    }
  }

  /**
   * zip 6a: the landing page mounts one renderer in preview mode (no
   * `settlementId`) and, the instant the player founds their settlement,
   * needs it to become a real settlement view — same canvas, no
   * remount/flash. Rather than snap the camera on straight away (the
   * reported "view jumps on every tutorial interaction"), this eases the
   * camera to its new position/zoom over CAMERA_TRANSITION_MS. The fog
   * reveal itself needs no explicit trigger here any more: founding fetches
   * a fresh mask shortly after (stores/world.ts's fetchFogMask), and
   * FogMaskLayer.setMaskTexture's own cross-fade (§2.6) reveals it the
   * moment that resolves — the same mechanism that handles "newly explored"
   * generally, not a founding-specific special case.
   */
  updateOptions(patch: Partial<HexMapRendererOptions>) {
    const wasFounded = !!this.settlement();
    this.options = { ...this.options, ...patch };
    if (!this.app) return;
    if (this.options.mode === 'settlement' && this.options.settlementId) {
      const target = this.settlementCameraOrigin();
      if (wasFounded) {
        this.camera = target;
        this.applyCameraTransform();
      } else {
        this.animateCameraTo(target, CAMERA_TRANSITION_MS);
      }
    }
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
    // Otherwise a zoom gesture still settling when the renderer goes away
    // would fire its rebuild into a torn-down app (see noteWheelActivity).
    if (this.wheelIdleTimer !== null) {
      clearTimeout(this.wheelIdleTimer);
      this.wheelIdleTimer = null;
    }
    this.wheeling = false;
    this.app?.ticker.remove(this.onTick);
    // app.destroy({ children: true }) destroys everything still attached to
    // the stage, but the fog layers' meshes are — see mount()'s addChild —
    // so this covers them too; only the mask textures they hold are
    // generated/fetched independently and need their own explicit destroy.
    this.fogMaskTexture?.destroy(true);
    this.fogMaskTexture = null;
    this.previousFogMaskTexture?.destroy(true);
    this.previousFogMaskTexture = null;
    this.blackFogLayer.destroy();
    this.whiteMistLayer.destroy();
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
