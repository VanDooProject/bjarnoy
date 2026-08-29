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
import {
  Application,
  BlurFilter,
  Container,
  FillGradient,
  Graphics,
  Rectangle,
  RenderTexture,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import type { AxialCoord } from '../hex/coords';
import { coordKey, hexDistance, hexesInRadius } from '../hex/coords';
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
  baseTextureFor,
  loadTileTextures,
  riverTexturesFor,
  topTextureFor,
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

// Debug-only switches for the individual fog mechanisms, so each can be
// disabled independently to inspect what it's actually responsible for
// (e.g. "is this hex-ring edge from the distance jitter or the blob
// jitter?"). Mutated directly (no setter) — see main.ts's window.__fogDebug,
// exposed only in demo mode. Flipping a flag takes effect on the *next*
// rebuild (a camera pan/zoom, or HexMapRenderer.refreshFog()); it doesn't
// itself trigger one, since these are read at rebuild time, not cached.
export interface FogDebugFlags {
  /** Distance jitter on the fog ramp's own alpha/blob-vs-flat-fill boundary (FOG_DIST_JITTER_HEXES) — the mist's edge. Off = a dead-straight hex-ring mist edge. Does *not* affect where terrain sprites stop being drawn; see terrainCullJitter for that. */
  distJitter: boolean;
  /** Also jitter the terrain-sprite draw cutoff (rebuildTerrain/rebuildTerrainFlat) by the same distance, instead of the fixed, padded cutoff isPastTerrainCull uses when this is off. Off by default: jittering *tiles* (hard-edged art, unlike the blurred/overlapping fog blobs) makes them pop in/out unpredictably near the ring — issue #20. On reproduces the old behaviour, tile popping included. */
  terrainCullJitter: boolean;
  /**
   * Fades the scouted (dark) tint in gradually as a hex crosses the edge of
   * a settlement's line of sight (FOG_VISIBLE_MARGIN_HEXES), instead of a
   * hard binary jump — previously named `visibleRamp`, which described the
   * *edge it watches* rather than *what it does* (issue #20: "'visible ->
   * scouted fade' has a strange name for what it does"). Off = the original
   * hard jump: full FOG_SCOUTED_ALPHA the instant a hex is past the
   * (unjittered) visible radius, nothing at all inside it. See scoutedFog
   * to turn the dark tint off entirely rather than just its fade.
   */
  scoutedTintFade: boolean;
  /** Turns the scouted (dark, out-of-sight-but-explored) fog tint off entirely, independent of scoutedTintFade — for isolating whether an artifact near a settlement's edge is the tint itself or its fade/jitter. */
  scoutedFog: boolean;
  /** Turns the unexplored (white) fog off entirely — both the per-hex blob/flat-fill mist and the world-map deep-fog background shortcut (syncWorldBackground). Off leaves unexplored hexes fully transparent/undrawn past the scouted ring, so only scoutedFog's dark tint remains visible — for isolating the black (scouted) fog from the white (unexplored) one, since the two overlap heavily near a settlement's edge and are otherwise hard to tell apart. */
  unexploredFog: boolean;
  /** Turns off the realm-border wash + outer-edge glow/stroke drawn on every owned hex (independent of both fog tiers — a claimed hex still gets its border with all fog off). For isolating whether something near a settlement's edge is fog or the border art on top of it. */
  realmBorders: boolean;
  /** Per-hex position/size jitter on fog blobs (FOG_BLOB_JITTER_X/Y, FOG_BLOB_SIZE_JITTER). Off = blobs sit dead-centre on their hex, same size. */
  blobJitter: boolean;
  /** Terrain sprites stop being culled past FOG_TERRAIN_CULL_HEXES — always draw terrain art regardless of fog distance, to see what's under the mist. */
  terrainCull: boolean;
  /** Skip the overlap blobs placed past each tier's flat-fill cutoff (FOG_BLOB_OVERLAP_HEXES) — reproduces the blur/flat-fill seam this was added to fix. */
  flatFillOnly: boolean;
  /** Never switch to a flat, guaranteed-opacity fill once a tier is fully saturated (unexplored past FOG_TERRAIN_CULL_HEXES, scouted past FOG_VISIBLE_MARGIN_HEXES) — mist stays blob-only forever, reproducing the original "fog never reaches full opacity" bug. */
  blobsOnly: boolean;
  /** Fade the fog blur cache back in after a drag release (FOG_DRAG_FADE_MS) instead of showing the rebuilt fog immediately. Off by default: the fade dips *all* fog to FOG_DRAG_FADE_FROM_ALPHA, not just whatever the drag just revealed (it's one shared bitmap — see FOG_BLOB_CACHE_PADDING's comment) — issue #20: "drag fades ALL elements in again, not only new". On reproduces the old always-on behaviour. */
  dragFade: boolean;
  /** Tints hexes that hit the unexplored tier's hard flat-fill cutoff (FOG_TERRAIN_CULL_HEXES, gated on cullBeyond — see FOG_CULL_JITTER_HEXES) a distinct debug magenta instead of fog white, so the flat-fill/blob boundary — which is jittered independently of the alpha ramp, and is a *render-method* switch (crisp opaque polygon vs a blurred blob), not just a value change — is visible on its own instead of blending into the rest of the mist. */
  cullThresholdDebug: boolean;
}
export const fogDebugFlags: FogDebugFlags = {
  distJitter: true,
  terrainCullJitter: false,
  scoutedTintFade: false,
  scoutedFog: true,
  unexploredFog: true,
  realmBorders: true,
  blobJitter: true,
  terrainCull: true,
  flatFillOnly: false,
  blobsOnly: false,
  dragFade: false,
  cullThresholdDebug: false,
};

// Per-rebuild timing breakdown, read by FogPerfPanel to show what each
// fogDebugFlags toggle above actually costs — flip a flag, watch the
// relevant number here move on the next pan/zoom. Mutated directly by
// rebuildAll()/refreshFogBlobCache() (same plain-object, no-Vue-import
// pattern as fogDebugFlags — see its own comment), so consumers must poll
// rather than rely on Vue reactivity to observe changes; FogPerfPanel does
// this on an interval. `*Ms` are wall-clock (performance.now() deltas) for
// the single most recent rebuildAll() call, not an average — a live panel
// reads better as "what just happened" than a smoothed number that lags
// behind the flag you just flipped.
export interface FogPerfStats {
  /** rebuildTerrain/rebuildTerrainFlat: placing (or culling) terrain sprites/fills. Affected by terrainCull, terrainCullJitter. */
  terrainMs: number;
  /** Hexes that got a terrain sprite/fill this rebuild. */
  terrainDrawnCount: number;
  /** Hexes skipped by isPastTerrainCull (terrainCull) — the source of terrainDrawnCount + terrainCulledCount not summing to hexCount in settlement/preview mode, where an out-of-radius or sea hex is skipped for reasons unrelated to fog. */
  terrainCulledCount: number;

  /** rebuildBordersAndFog's per-hex loop (borders + fog-tier decisions), excluding blobCacheMs. Affected by distJitter, scoutedTintFade, scoutedFog, unexploredFog, realmBorders, flatFillOnly, blobsOnly. */
  bordersFogMs: number;
  /** True when this rebuild took the deepFogOnly shortcut (problem 4) — the per-hex loop below never ran at all, so the three *HexCount fields are 0 even though every hex in the viewport is conceptually unexplored fog. */
  deepFogOnly: boolean;
  /** Hexes that took the unexplored (white) fog branch — gated by unexploredFog. 0 whenever deepFogOnly is true. */
  unexploredHexCount: number;
  /** Owned hexes that drew a realm-border wash/stroke — gated by realmBorders. */
  borderedHexCount: number;
  /** Hexes that took the scouted (dark) fog branch (flat-filled or individually blobbed — see FOG_VISIBLE_MARGIN_HEXES) — gated by scoutedFog. */
  scoutedHexCount: number;

  /** refreshFogBlobCache: building the blob sprite layer and, when not mid-drag, the offscreen blur render pass — usually the single largest cost, and roughly proportional to blobCount. */
  blobCacheMs: number;
  /** refreshFogBlobCache's syncFogBlobs call (pooled-sprite placement, blobJitter) — the cheap half. */
  blobSyncMs: number;
  /** refreshFogBlobCache's offscreen RenderTexture render (the actual GPU blur pass) — 0 when skipped (no blobs, or mid-drag — see refreshFogBlobCache's own comment) rather than merely small. */
  blobRenderMs: number;

  /** rebuildMarkers: settlement/island/fleet icon placement. */
  markersMs: number;
  /** rebuildWaves: world-mode open-water squiggle placement (world mode only; 0 in settlement mode). */
  wavesMs: number;
  /** Sum of the above plus the small remainder (viewport→coords, deep-fog check, background sync) not broken out on its own. */
  totalMs: number;
  /** Hexes in the current viewport rect — the size the above times scale with. */
  hexCount: number;
  /** Fog blobs placed this rebuild (both tiers) — what blobCacheMs's cost is roughly proportional to. */
  blobCount: number;
}
export const fogPerfStats: FogPerfStats = {
  terrainMs: 0,
  terrainDrawnCount: 0,
  terrainCulledCount: 0,
  bordersFogMs: 0,
  deepFogOnly: false,
  unexploredHexCount: 0,
  borderedHexCount: 0,
  scoutedHexCount: 0,
  blobCacheMs: 0,
  blobSyncMs: 0,
  blobRenderMs: 0,
  markersMs: 0,
  wavesMs: 0,
  totalMs: 0,
  hexCount: 0,
  blobCount: 0,
};

// Jitters a raw hex-distance by up to ±FOG_DIST_JITTER_HEXES before any fog
// tier boundary is compared against it — see FOG_DIST_JITTER_HEXES for why.
// Applied with one shared salt so rebuildTerrain's cull check and
// rebuildBordersAndFog's fog-tier checks agree on the exact same jittered
// distance for a given hex, keeping the two aligned (no reintroduced seam).
// `enabled` lets each call site opt out via fogDebugFlags without every
// caller re-deriving the same "should I jitter" condition itself.
// `magnitudeHexes` is the caller's own jitter amplitude — see
// FOG_VISIBLE_JITTER_HEXES's comment for why this can't just be
// FOG_DIST_JITTER_HEXES for every call site: a jitter sized for a 10-hex
// margin is enormous next to a 2-hex one.
function jitterDistance(
  q: number,
  r: number,
  raw: number,
  salt: number,
  enabled: boolean,
  magnitudeHexes: number,
): number {
  if (!enabled || !Number.isFinite(raw)) return raw;
  return raw + (hash01(q, r, salt) - 0.5) * 2 * magnitudeHexes;
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
}

/**
 * What the settlement view's hover tooltip needs, plus screen position to
 * anchor it. Issue #16 "better hover" wants a richer card for buildings
 * (title + level, an output rate, a modifier line, worker count, "click to
 * open") like the mockup's "Crop farm LEVEL 2 / Output +240 food/h /
 * Irrigated yes (+10%) / Workers 8/8 / CLICK TO OPEN". None of that is
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
// this) so FOG_MARGIN_HEXES of fog is guaranteed visible from frame one.
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
// Matches CAMERA_TRANSITION_MS so the mist finishes fading in right as the
// camera settles on its post-founding position — see FOG_DRAG_FADE_MS for
// the (much quicker) drag-release version of the same fade mechanism.
const FOG_REVEAL_FADE_MS = 1400;
const FOG_REVEAL_FROM_ALPHA = 0;
// How many hexes of white (unexplored) fog zoomForFogMargin guarantees
// visible past the settlement's explored ring, on every side, at rest.
const FOG_MARGIN_HEXES = 10;
// Floor for zoomForFogMargin — a very high-level settlement's explored ring
// is already large, and without a floor the margin target would zoom out
// far enough to make individual hexes too small to read or click precisely.
const FOG_MARGIN_MIN_ZOOM = 0.22;
// Extra headroom (in hexes) added past where the alpha ramp itself
// saturates (FOG_MARGIN_HEXES) before switching to the flat, guaranteed-
// opaque fill — see FOG_TERRAIN_CULL_HEXES. The mist's inner edge no longer
// needs its own noise term to avoid a hex-shaped cutout (the blob geometry
// in rebuildBordersAndFog handles that on its own — see FOG_BLOB_* below),
// but blobs are still individually semi-transparent right up to the
// saturation point, so this margin keeps them visually dense before the
// hand-off to the flat fill instead of switching right at their weakest edge.
const FOG_CULL_HEADROOM_HEXES = 3;
// Past this many hexes beyond the explored ring, both rebuildBordersAndFog
// and rebuildTerrain treat the hex as fully opaque: fog is painted flat
// solid white (no blob) and terrain sprites stop being drawn underneath it,
// since nothing could show through either way. Keeping this one distance
// shared between the two is what closes the seam where terrain used to
// disappear before the fog above it had actually reached full opacity.
const FOG_TERRAIN_CULL_HEXES = FOG_MARGIN_HEXES + FOG_CULL_HEADROOM_HEXES;
// Blobs keep being placed (at a flat, fully-opaque alpha) this many hexes
// *past* FOG_TERRAIN_CULL_HEXES, overlapping the flat fill's own territory,
// so the blob layer's BlurFilter always has real neighbouring content right
// up to (and past) the hand-off point. Without this the blur has nothing to
// blend the outermost blobs into — they fade toward the edge of their own
// content — while the flat fill right next to them starts at full solid
// opacity with no blur at all, and that contrast is exactly the hex-stepped
// seam a screenshot exposed at the blob/flat boundary.
const FOG_BLOB_OVERLAP_HEXES = 6;

// Past this distance (FOG_TERRAIN_CULL_HEXES + FOG_BLOB_OVERLAP_HEXES — the
// same threshold rebuildBordersAndFog already uses to stop placing overlap
// blobs), an unexplored hex's fog is nothing but a flat, fully-opaque
// FOG_UNEXPLORED fill with nothing else layered on top — no blob, no blur,
// no terrain underneath (isPastTerrainCull already stopped drawing that).
// That's visually identical to the renderer's own background clear colour.
//
// World mode's low default zoom (WORLD_DEFAULT_ZOOM) means a viewport's
// worth of hexes can run into the thousands, and it's mostly open sea (no
// terrain sprite at any distance — see WORLD_TERRAIN_FILL/rebuildTerrainFlat)
// — issue #20: "white fog is rendered as/on tiles on worldmap... many
// elements... slow". A pan far enough into open ocean that the *entire*
// viewport is past this distance (see isEntirelyDeepFog) skips per-hex fog
// geometry for the whole rebuild, painting the renderer's own background
// colour instead (syncWorldBackground) — one clear colour rather than
// tessellating a Graphics.poly() per hex for a fill nothing could tell
// apart from a blank canvas.
//
// This can only apply when the *whole* viewport qualifies: sea tiles never
// draw anything of their own even once explored (see WORLD_TERRAIN_FILL's
// comment) — a currently-visible settlement's clear halo of open water is
// exactly as blank as unexplored fog would be, so per-hex distance is the
// only thing telling them apart. A single canvas-wide background colour
// can't be region-specific, so it's only safe to use when nothing in view
// could possibly need to stay transparent — see isEntirelyDeepFog. Painting
// the background and then only skipping the individual deep hexes (instead
// of gating on the whole viewport) looks equivalent but isn't: a
// settlement's own nearby explored sea, which should show real water
// through the transparent canvas, would go solid fog-white right along
// with the genuinely deep hexes around it.
const FOG_WORLD_BG_HANDOFF_HEXES = FOG_TERRAIN_CULL_HEXES + FOG_BLOB_OVERLAP_HEXES;

// The mockup's own fogAt() (Viking Realm.dc.html) adds noise directly onto
// the *distance* value before comparing it against any threshold — roughly
// ±0.75 hex on its own ~2.8-hex margin (~27%) — rather than only jittering
// the final alpha the way our ramp used to. Hex-distance rings are perfect
// hexagons, so any threshold compared against the raw distance produces a
// dead-straight ring facet; jittering the distance itself (once per hex,
// before the comparison) is what breaks that facet up, the same way the
// mockup's own rings never read as hex-straight even on a long pan far from
// the settlement. FOG_DIST_JITTER_HEXES mirrors the mockup's ratio against
// our own margin (FOG_MARGIN_HEXES).
const FOG_DIST_JITTER_HEXES = 2.5;
// hash01 salt for the distance jitter above; a separate salt (30) so it
// doesn't correlate with the alpha jitter (salt 9) or blob position/size
// jitter (salts 20-22) — otherwise a hex that gets nudged toward one tier
// boundary would always get nudged the same way in every other jittered
// term too, which would just move the visible artifact rather than break it up.
const FOG_DIST_JITTER_SALT = 30;
// Separate salt for the visible→scouted ramp's own distance jitter — kept
// independent of FOG_DIST_JITTER_SALT for the same decorrelation reason.
const FOG_VISIBLE_JITTER_SALT = 31;
// A second, much smaller jitter magnitude for the unexplored tier's hard
// flat-fill cutoff specifically (FOG_TERRAIN_CULL_HEXES), decoupled from
// FOG_DIST_JITTER_HEXES above. That constant is sized to break up the *alpha
// ramp*'s ring facet, which is a gradual, blended value — a ±2.5-hex swing
// there just nudges an already-soft blob's opacity. But the same jittered
// distance was also gating the ramp-vs-flat-fill switch, which isn't a
// gradual value change: past it, a hex swaps from a blurred, semi-transparent
// blob to a crisp, unblurred, fully-opaque polygon (see fillFlatFog's
// comment) — a *render-method* jump, not just a bigger number. Reusing the
// full ±2.5-hex ramp jitter for that gate meant two neighbouring hexes at
// nearly the same true distance could land almost 5 hexes apart in resolved
// distance, so one pops to the hard opaque tile while the other is still
// mid-ramp — "some tiles white out completely while nearby ones aren't
// close to 1" (as reported). A smaller, independently-salted jitter here
// still keeps the cutoff from being a dead-straight hex ring (same reasoning
// as FOG_VISIBLE_JITTER_HEXES's own "tighter edge" margin below) without
// letting it manufacture that visible pop between neighbours.
const FOG_CULL_JITTER_HEXES = 0.6;
const FOG_CULL_JITTER_SALT = 32;
// How many hexes past a settlement's own claimed border (borderRadius) its
// line-of-sight radius extends — WorldModel.visibleHexes's own "+1" comment
// calls this out as deliberately one hex past the border, and rendering
// mirrored that (see visibleEdgeDist below). Bumped to +2 (issue #20: "more
// view distance for player") to give the scouted-tint ramp (FOG_VISIBLE_
// MARGIN_HEXES, FOG_VISIBLE_JITTER_HEXES) more room to fade in *before* it
// reaches ground the player can still see clearly — a single extra hex of
// margin is a cheap, direct way to make the ramp (and any residual jitter)
// far less likely to read as dark fog creeping onto the realm's own clear
// ground, on top of the jitter fix above.
const FOG_VISIBLE_RADIUS_BONUS_HEXES = 2;
// How many hexes past the visible (line-of-sight) ring the dark "scouted"
// tint fades in over, instead of jumping straight from 0 to FOG_SCOUTED_ALPHA
// in one hex step at a hex-perfect ring — the same ramp treatment as the
// unexplored mist, just narrower since this inner ring should still read as
// a tighter edge than the outer fog.
const FOG_VISIBLE_MARGIN_HEXES = 2;
// jitterDistance's magnitude for the visible→scouted ramp specifically —
// deliberately *not* FOG_DIST_JITTER_HEXES (2.5 hexes). That constant is
// sized against the outer unexplored ramp's own, much wider margin
// (FOG_MARGIN_HEXES = 10 hexes; the mockup's own ~27% ratio — see
// FOG_DIST_JITTER_HEXES's comment), but the same jitterDistance() call was
// also being used, unmodified, against this ramp's 2-hex margin: a ±2.5-hex
// jitter is *larger than the entire ramp*, so on an unlucky hash the
// jittered boundary could land past the settlement's own line-of-sight
// radius, pulling dark "scouted" tint onto ground that should still read as
// fully, clearly visible (issue #20: "the effect jitters black fog into
// users realm, this is bad"). Scaled to the same ~27% ratio against this
// ramp's own margin instead (2 × 0.27 ≈ 0.5), so it breaks up the ring the
// same way without ever exceeding the ramp it's jittering.
const FOG_VISIBLE_JITTER_HEXES = 0.5;

// --- Per-rebuild settlement pruning (see fogSourcesNear) -------------------
//
// Every fog tier answers the same question per hex: "how far past the
// nearest settlement's ring is this?" — WorldModel.distanceBeyondExplored's
// min over *every settlement in the game*. Asking that per hex is O(hexes ×
// settlements) per rebuild, up to twice per hex (once from the terrain cull,
// once from rebuildBordersAndFog's fog loop) — a low-zoom world-map viewport
// over unexplored water is thousands of hexes, on every drag rebuild. But a
// settlement only ever changes the answer within a bounded ring around
// itself: past the widest threshold any tier compares against, every branch
// behaves identically no matter how much larger the number gets (terrain is
// culled, fog is a flat opaque fill).
//
// So the settlement walk is hoisted out of the per-hex work entirely: once
// per rebuild, settlements whose ring cannot reach the visible hex box are
// dropped, and the per-hex math runs over that (normally tiny, usually
// empty) list using plain q/r/radius primitives instead of re-deriving a
// Settlement's radius or allocating a coord object per settlement per hex.
// The bound below is deliberately generous — it may keep a settlement that
// turns out not to matter, but it can never drop one that does, so the
// rendered result is identical to the full per-hex scan (mirrors
// isEntirelyDeepFog's own settlement-position prune above, for the same
// reason — see its doc comment).
//
// The widest distance the unexplored-mist tiers still discriminate at: the
// flat-fill hand-off (FOG_TERRAIN_CULL_HEXES) plus the overlap blobs placed
// past it (FOG_BLOB_OVERLAP_HEXES), plus the jitter that can pull a hex from
// beyond that boundary back inside it (FOG_DIST_JITTER_HEXES).
const FOG_UNEXPLORED_INFLUENCE_HEXES = FOG_TERRAIN_CULL_HEXES + FOG_BLOB_OVERLAP_HEXES + FOG_DIST_JITTER_HEXES;
// Same, for the scouted (dark) tint's visible-ring ramp: past its margin the
// ramp is saturated and the tint is flat, so only this much is discriminating.
const FOG_VISIBLE_INFLUENCE_HEXES = FOG_VISIBLE_MARGIN_HEXES + FOG_VISIBLE_JITTER_HEXES;

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

// prototypes/village_view/Viking Realm.dc.html's fogAt()/`fogs` never fills a
// hex-shaped polygon at all — every fogged hex gets one large soft circular
// blob (a blurred radial gradient, ~1.68x hex width / 2.7x hex face height,
// jittered off-centre) that spills into its neighbours. Overlapping blobs is
// what makes the mist read as continuous cloud instead of tiled hexes; a
// single hex-aligned polygon can never look like that no matter how much
// blur is layered on top, since its edge is still exactly the hex boundary.
// FOG_BLOB_W_SCALE/H_SCALE mirror the prototype's own ratios (relative to
// its equivalents of our TILE_W/TILE_H).
const FOG_BLOB_W_SCALE = 1.68;
const FOG_BLOB_H_SCALE = 2.7;
// How far a blob's centre is nudged from its hex's own centre, as a fraction
// of hex width/height — matches the prototype's per-hex jitter on blob
// position, so no two neighbouring blobs stack in perfect alignment.
const FOG_BLOB_JITTER_X = 0.12;
const FOG_BLOB_JITTER_Y = 0.18;
// Per-blob size variance (1 ± this fraction) — another source of
// irregularity so the mist doesn't read as a grid of identical stamps.
const FOG_BLOB_SIZE_JITTER = 0.15;
const FOG_SCOUTED_ALPHA = 0.6;
// isEntirelyDeepFog's flat-background shortcut (see syncWorldBackground)
// used to stand in for the whole viewport with a single solid clear colour —
// cheap, but with none of the organic blob texture above, so a fully-zoomed-
// out deep-ocean pan read as a flat, featureless white rectangle instead of
// mist. FOG_PATTERN_W/H size a static, pre-baked tiling of the same blob
// texture (createFogPatternTexture), generated once and stretched to cover
// the viewport — restores the cloudy look without paying the per-hex cost
// the shortcut exists to avoid. Generous enough to cover any real viewport
// without visible stretching; a wider window just tiles a hair coarser.
const FOG_PATTERN_W = 2400;
const FOG_PATTERN_H = 1400;
const FOG_PATTERN_BLOB_COUNT = 130;
// The blob layer's BlurFilter is a full-container GPU post-pass. Naively
// left attached to a container that sits directly in the scene graph, Pixi
// re-runs it on literally every ticker frame regardless of whether the fog
// actually changed — there's no automatic dirty-tracking. On CI's
// software-rendered headless Chromium (no GPU), that standing per-frame
// cost alone was enough to stall the renderer's main thread badly enough
// that even page.mouse.move (a CDP command) timed out — reproducing even
// on a hover test that never drags at all. fogBlobLayer.container is kept
// offscreen (never added to `world`) for exactly this reason: it's only
// ever rendered on demand, into fogBlobCacheTexture (see
// refreshFogBlobCache), and fogBlobCacheSprite displays that cached result
// like any other plain, unfiltered sprite the rest of the time — a single
// blur pass per real rebuild instead of one every frame forever.
//
// The blur is additionally dropped for an active drag's duration (redraws
// stay crisp/cheap, so fog geometry still keeps up with the pan — no
// missing-terrain pop-in at the edges). fogDebugFlags.dragFade (default
// off — see its own doc comment and issue #20) can fade it back in over
// FOG_DRAG_FADE_MS once released, dipping fogBlobCacheSprite's *entire*
// alpha — every hex's fog, not just whatever the drag just revealed — down
// to FOG_DRAG_FADE_FROM_ALPHA first. That's one shared bitmap (the blur
// cache), so there's no way to single out only the newly-revealed edge:
// fog the player had already been looking at, unchanged, dims and fades
// back in right along with it on every drag release.
const FOG_BLOB_CACHE_PADDING = 48;
// Fraction of true size the blob layer is actually rendered/blurred at — see
// refreshFogBlobCache's own comment. 0.4 keeps the softened result visually
// indistinguishable from a full-resolution blur (already-soft blob edges
// upscale cleanly) while cutting the filter's pixel-cost to well under a
// sixth.
const FOG_BLOB_CACHE_SCALE = 0.4;
const FOG_DRAG_FADE_MS = 350;
const FOG_DRAG_FADE_FROM_ALPHA = 0.25;
// Stacking order for fog blob sprites (see syncFogBlobs's zIndex/sortChildren
// below). Without an explicit order, two neighbouring blobs of different fog
// tiers (a hex's own oversized blob spills into its neighbours — see
// FOG_BLOB_W_SCALE/H_SCALE) stacked in whatever order rebuildBordersAndFog's
// `coords` loop happened to visit them in, i.e. raster scan order, unrelated
// to fog tier. That let a lightly-tinted unexplored (white) blob draw on top
// of a neighbouring scouted (dark) blob depending on which side of the
// viewport the camera panned in from — the dark "you've been here, it's just
// out of sight" tint would flicker in and out depending on pan direction
// instead of reading as sitting underneath the pale "never scouted" mist.
// Unexplored always wins the stack: it represents the outer, denser unknown,
// so scouted's dim tint belongs underneath it wherever the two overlap.
const FOG_BLOB_Z_SCOUTED = 0;
const FOG_BLOB_Z_UNEXPLORED = 1;
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

export class HexMapRenderer {
  private app: Application | null = null;
  private world = new Container();
  private terrainBase = createSpriteLayer();
  private terrainTop = createSpriteLayer();
  private terrainFlat = new Graphics();
  private waveLayer = new Graphics();
  private wavePoints: WavePoint[] = [];
  // Mirrors rebuildAll's local `deepFogOnly` (see isEntirelyDeepFog) so
  // onTick's per-frame drawWaves call can skip redrawing wave strokes that
  // the opaque fog backdrop syncWorldBackground painted would fully hide
  // anyway — refreshed on every rebuildAll, stale (matching every other
  // rebuild-driven field) for the frames between rebuilds during a drag.
  private deepFogOnly = false;
  private borderLayer = new Graphics();
  private hoverLayer = new Graphics();
  // zip 6a: "click to place" — a persistent (not hover-gated) pulsing glow
  // on `options.highlightCoord`, redrawn every tick since the pulse itself
  // is time-based, unlike everything else here which only redraws on a
  // cull rebuild (camera pan/zoom).
  private highlightLayer = new Graphics();
  // Flat, unblurred, guaranteed alpha:1 white fill — the "definitely fully
  // opaque, no reliance on blob overlap" backstop past FOG_TERRAIN_CULL_HEXES.
  private fogLayer = new Graphics();
  // Organic mist: pooled Sprites sharing one pre-rendered soft-circle
  // texture, tinted/sized/jittered per hex — see FOG_BLOB_* above.
  // Offscreen only — see the FOG_BLOB_CACHE_PADDING comment above for why
  // this is never added to `world` directly.
  private fogBlobLayer = createSpriteLayer();
  private fogBlobTexture: Texture | null = null;
  private fogBlobFilter: BlurFilter | null = null;
  // The on-demand render of fogBlobLayer.container (see refreshFogBlobCache)
  // and the plain sprite that displays it every frame in `world`'s place.
  private fogBlobCacheTexture: RenderTexture | null = null;
  private fogBlobCacheSize = { width: 0, height: 0 };
  private fogBlobCacheSprite = new Sprite();
  // Static, pre-baked stand-in for the organic blob mist (see
  // FOG_PATTERN_W/H) shown only while isEntirelyDeepFog's shortcut is active
  // — screen-space (added directly to app.stage, not `world`/`fogWorld`), so
  // it neither pans nor needs rebuilding: syncWorldBackground only toggles
  // its visibility. Sized to the viewport in mount/resize.
  private fogPatternTexture: Texture | null = null;
  private fogPatternSprite = new Sprite();
  // Set while a fog fade is running (either the drag-release fade, see
  // FOG_DRAG_FADE_MS, or the founding reveal, see FOG_REVEAL_FADE_MS); null
  // once it completes or a new drag starts. duration/fromAlpha are set
  // alongside it by whichever triggered the fade, since only one of the two
  // can ever be running at once.
  private fogFadeStartedAt: number | null = null;
  private fogFadeDurationMs = FOG_DRAG_FADE_MS;
  private fogFadeFromAlpha = FOG_DRAG_FADE_FROM_ALPHA;
  // The drag-release fade deliberately never dips the flat, guaranteed-
  // opaque backstop (fogLayer) — only the blurred blob cache, which is what
  // gets detached for the drag's duration in the first place. The founding
  // reveal fade is different: fog wasn't showing *at all* a moment ago (no
  // settlement existed yet), so fading both in together is exactly the
  // "mist rolling in" effect zip 6a wants, with nothing to protect.
  private fogFadeAffectsFlatLayer = false;
  // Eases `camera` from one position/zoom to another over time (see
  // animateCameraTo) instead of snapping — used for the founding transition
  // so the view doesn't jump.
  private cameraAnim: { from: Camera; to: Camera; startedAt: number; durationMs: number } | null = null;
  private markerLayer = new Graphics();
  private labelPool: Text[] = [];
  private labelsUsed = 0;
  // Fog (fogLayer + fogBlobCacheSprite) needs to draw *above* markerLayer's
  // island names/settlement badges/fleet ETAs — a label sitting right at the
  // edge of scouted territory should read as veiled by the mist, not float
  // in front of it — but everything else in `world` (terrain, buildings)
  // still needs to draw *beneath* markerLayer. A second world-space
  // container, kept in lockstep with `world`'s own transform every time it
  // changes (see applyCameraTransform), lets fog sit later in the stage's
  // paint order than markerLayer while still panning/zooming identically to
  // the terrain it's covering.
  private fogWorld = new Container();

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

  /**
   * Whether fog-of-war should gate what's drawn right now. True in
   * settlement mode once a settlement actually exists — zip 6a's
   * pre-founding landing-page preview has no settlement yet, and
   * `WorldModel.isExplored` would be trivially false everywhere, so fog
   * would otherwise blanket the whole preview plot (see rebuildTerrain's
   * and rebuildBordersAndFog's matching bypass). In world mode, only once
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
    // pack at all — only settlement mode loads it.
    this.textures = this.options.mode === 'settlement' ? await loadTileTextures() : null;
    if (this.destroyed) return;

    // One soft-circle texture, generated once and reused (tinted, resized,
    // alpha'd) for every fog blob — see FOG_BLOB_* above. Sprites sharing a
    // texture batch into very few WebGL draw calls, same reasoning as the
    // tile-art sprite pools.
    this.fogBlobTexture = this.createFogBlobTexture(app);
    // Blurred on top of the gradient's own soft falloff — matches the
    // mockup's per-blob `filter: blur(...)` (Viking Realm.dc.html's `fogs`).
    // Only the organic blob layer needs this; fogLayer's flat fill is
    // already a uniform solid colour, so blurring it would cost GPU time for
    // no visible change. Applied only inside refreshFogBlobCache's on-demand
    // render, never left attached in the live scene graph — see
    // FOG_BLOB_CACHE_PADDING above.
    this.fogBlobFilter = new BlurFilter({ strength: 10, quality: 3 });
    this.fogBlobCacheSprite.visible = false;

    this.fogPatternTexture = this.createFogPatternTexture(app);
    this.fogPatternSprite.texture = this.fogPatternTexture;
    this.fogPatternSprite.tint = FOG_UNEXPLORED;
    this.fogPatternSprite.visible = false;
    this.syncFogPatternSpriteSize();

    this.world.addChild(
      this.terrainBase.container,
      this.waveLayer,
      this.terrainFlat,
      this.borderLayer,
      this.hoverLayer,
      this.terrainTop.container,
      this.highlightLayer,
    );
    this.fogWorld.addChild(this.fogLayer, this.fogBlobCacheSprite);
    app.stage.addChild(this.fogPatternSprite, this.world, this.markerLayer, this.fogWorld);

    app.ticker.add(this.onTick);

    this.applyCameraTransform();
    this.rebuildAll();
  }

  resize(width: number, height: number) {
    if (!this.app) return;
    this.viewport = { width, height };
    this.app.renderer.resize(width, height);
    this.applyCameraTransform();
    this.syncFogPatternSpriteSize();
    this.scheduleCull();
  }

  // Stretches the pre-baked pattern texture to always cover the viewport —
  // see FOG_PATTERN_W/H's comment for why a fixed-size texture rather than a
  // regenerated one is fine here.
  private syncFogPatternSpriteSize() {
    this.fogPatternSprite.width = this.viewport.width;
    this.fogPatternSprite.height = this.viewport.height;
  }

  private applyCameraTransform() {
    this.world.scale.set(this.camera.zoom);
    this.world.position.set(
      this.viewport.width / 2 - this.camera.x * this.camera.zoom,
      this.viewport.height / 2 - this.camera.y * this.camera.zoom,
    );
    this.fogWorld.scale.copyFrom(this.world.scale);
    this.fogWorld.position.copyFrom(this.world.position);
  }

  private onTick = () => {
    this.options.worldModel.tick();
    this.rebuildMarkers();
    if (this.options.mode === 'world' && !this.deepFogOnly) this.drawWaves();
    if (this.idleDrift) {
      this.camera = { ...this.camera, x: this.camera.x + 0.18, y: this.camera.y + 0.05 };
      this.applyCameraTransform();
      this.scheduleCull();
    }
    this.tickCameraAnim();
    this.tickFogFade();
    this.drawHighlight();
  };

  /**
   * Eases from the founding transition's start camera to its target (see
   * animateCameraTo) — zip 6a: the landing page's founding moment should
   * read as the camera settling into place while the fog rolls in
   * (tickFogFade, started alongside this one), not an instant jump.
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

  private drawHighlight() {
    this.highlightLayer.clear();
    const at = this.options.highlightCoord;
    if (!at) return;
    const grid = isoGridPosition(at, TILE_W, TILE_H);
    const top = isoTopPoints(TILE_W, TILE_H).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
    const flat = top.flatMap((p) => [p.x, p.y]);
    const pulse = (Math.sin(performance.now() / 420) + 1) / 2; // 0..1
    this.highlightLayer
      .poly(flat)
      .fill({ color: GOLD, alpha: 0.1 + pulse * 0.1 })
      .stroke({ width: 3 + pulse * 1.5, color: GOLD, alpha: 0.6 + pulse * 0.4 });
  }

  // Eases fogBlobCacheSprite's (and, for the founding reveal, fogLayer's)
  // alpha back up — either after onPointerUp's forced rebuild re-bakes the
  // blur into the cache texture (see FOG_DRAG_FADE_MS), or after founding a
  // settlement reveals fog for the first time (see FOG_REVEAL_FADE_MS,
  // triggered from updateOptions). Only one of the two can be running at
  // once, so one pair of fields (set by whichever triggered it) covers both.
  private tickFogFade() {
    if (this.fogFadeStartedAt === null) return;
    const t = Math.min(1, (performance.now() - this.fogFadeStartedAt) / this.fogFadeDurationMs);
    const alpha = this.fogFadeFromAlpha + (1 - this.fogFadeFromAlpha) * t;
    this.fogBlobCacheSprite.alpha = alpha;
    if (this.fogFadeAffectsFlatLayer) this.fogLayer.alpha = alpha;
    if (t >= 1) this.fogFadeStartedAt = null;
  }

  private onPointerDown = (e: PointerEvent) => {
    // Normally unreachable while a ring is open — its backdrop overlay
    // covers the whole canvas, so a real pointerdown there hits the
    // backdrop's own handler instead of this canvas-scoped listener — but
    // kept as a defensive guard rather than relying on that DOM layering.
    if (this.interactionLocked) return;
    this.startDrag(e);
  };

  // Issue #16 "ring menu": a mousedown on the ring's own backdrop (i.e.
  // outside any bubble) closes the ring — see RingMenu.vue's
  // outsidePointerDown emit — and the caller re-fires that same PointerEvent
  // in here so the drag it started keeps going, instead of the player
  // needing a second, separate mousedown to start panning the map.
  beginDragFrom(e: PointerEvent) {
    this.interactionLocked = false;
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
    // Cut short any fade still running from a previous drag so it doesn't
    // fight this one — refreshFogBlobCache reads `this.dragging` itself on
    // the next rebuild, so there's nothing else to toggle here.
    this.fogFadeStartedAt = null;
    this.fogBlobCacheSprite.alpha = 1;
    this.fogLayer.alpha = 1;
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
    if (!this.dragging) {
      if (this.interactionLocked) return;
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
    if (this.dragging && this.dragMoved < DRAG_CLICK_SLOP_PX) {
      this.handleClick(e);
    }
    // `dragging` is true for *any* pointerdown, a stationary click included,
    // so it alone doesn't say whether the camera actually moved. Gate the
    // rebuild/fade below on the same slop threshold the click check above
    // uses: a click that never panned the map leaves every sprite, and the
    // fog cache, exactly as they already are — no reason to pay for a full
    // rebuild (blur render pass and all) or to fade the fog back in.
    const wasDragging = this.dragging && this.dragMoved >= DRAG_CLICK_SLOP_PX;
    this.dragging = false;
    if (wasDragging) {
      // The drag's last queued rebuild (scheduleCull's rAF, from the final
      // pointermove) may already have fired while dragging was still true —
      // rendering the crisp/unblurred cache — so force one more, synchronous
      // rebuild now that dragging is false to guarantee the blur actually
      // gets baked back in before anything below reveals it.
      this.rebuildAll();
      if (fogDebugFlags.dragFade) {
        this.fogBlobCacheSprite.alpha = FOG_DRAG_FADE_FROM_ALPHA;
        this.fogFadeDurationMs = FOG_DRAG_FADE_MS;
        this.fogFadeFromAlpha = FOG_DRAG_FADE_FROM_ALPHA;
        this.fogFadeAffectsFlatLayer = false;
        this.fogFadeStartedAt = performance.now();
      } else {
        // Default: show the freshly-rebuilt, correctly-blurred fog
        // immediately, no fade — see fogDebugFlags.dragFade's own comment
        // for why the fade dims fog the player was already looking at, not
        // just what the drag revealed.
        this.fogFadeStartedAt = null;
        this.fogBlobCacheSprite.alpha = 1;
      }
    }
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

    if (mode === 'settlement') this.options.onHoverChange?.(this.hoverInfoFor(tile, grid));
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

  private hoverInfoFor(tile: Tile, grid: { x: number; y: number }): HoverInfo {
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

  /**
   * See the HoverInfo doc comment: output/modifier/workers aren't tracked
   * per-building anywhere, so these are derived deterministically from the
   * building's own type/level (and, for the irrigation modifier, whether a
   * neighbouring hex is shore/water) purely so the hover card has something
   * concrete to show, matching the mockup's "Output +240 food/h / Irrigated
   * yes (+10%) / Workers 8/8" for a farm.
   */
  private buildingStats(
    tile: Tile,
    level: number,
  ): Pick<HoverInfo, 'output' | 'modifier' | 'workers'> {
    const { worldModel } = this.options;
    const nearWater = hexesInRadius({ q: tile.q, r: tile.r }, 1).some((c) => {
      const t = worldModel.getTile(c.q, c.r);
      return t.terrain === 'sea' || t.terrain === 'sand';
    });
    switch (tile.buildingType) {
      case 'farm': {
        const irrigated = nearWater;
        const base = level * 120;
        const workersCap = level * 4;
        return {
          output: `+${irrigated ? Math.round(base * 1.1) : base} food/h`,
          modifier: irrigated ? 'Irrigated (+10%)' : undefined,
          workers: `${workersCap}/${workersCap}`,
        };
      }
      case 'hut':
        return { output: `+${level * 5} population capacity` };
      case 'tower':
        return { output: `Vision +${level} ring`, modifier: 'Border anchor' };
      case 'longhouse':
        return { output: `+${level * 100} storage capacity` };
      default:
        return {};
    }
  }

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
   * exactly what scheduleCull/refreshFogBlobCache already throttle for a
   * drag, except a wheel gesture has no pointerup to hang that on. Once the
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
      // and a rebuild re-syncs every visible terrain/border/fog sprite, not
      // just the fog blur (see refreshFogBlobCache's own skip above), so
      // that's real per-rebuild cost under software rendering, paid several
      // times over across a single gesture. visibleCoords already renders a
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
      this.options.mode === 'world' &&
      fogActive &&
      fogDebugFlags.unexploredFog &&
      !fogDebugFlags.blobsOnly &&
      this.isEntirelyDeepFog(rect);
    this.deepFogOnly = deepFogOnly;
    this.syncWorldBackground(deepFogOnly);

    let phaseStart = performance.now();
    if (deepFogOnly) {
      // isEntirelyDeepFog already confirmed every visible hex is deep,
      // uniformly-opaque fog, and syncWorldBackground painted the
      // renderer's own clear colour to match (see rebuildBordersAndFog's
      // matching shortcut just below) — terrain drawn under that backdrop
      // would be fully hidden, so there's nothing to gain by building it.
      fogPerfStats.terrainDrawnCount = 0;
      fogPerfStats.terrainCulledCount = 0;
    } else {
      this.rebuildTerrain(coords, fogActive);
    }
    fogPerfStats.terrainMs = performance.now() - phaseStart;

    phaseStart = performance.now();
    this.rebuildBordersAndFog(coords, fogActive, deepFogOnly);
    // refreshFogBlobCache (called from within rebuildBordersAndFog) times
    // and records its own share into fogPerfStats.blobCacheMs — subtracted
    // back out here so bordersFogMs isolates just the per-hex loop around
    // it, matching the two rows FogPerfPanel shows separately.
    fogPerfStats.bordersFogMs = performance.now() - phaseStart - fogPerfStats.blobCacheMs;

    phaseStart = performance.now();
    this.rebuildMarkers();
    fogPerfStats.markersMs = performance.now() - phaseStart;

    if (this.options.mode === 'world' && !deepFogOnly) {
      // Same shortcut as terrain above — the open-water wave strokes this
      // recomputes would be drawn (by onTick's own deepFogOnly check) under
      // the same opaque backdrop, so there's nothing to gain by refreshing
      // wavePoints for hexes that are entirely hidden.
      phaseStart = performance.now();
      this.rebuildWaves();
      fogPerfStats.wavesMs = performance.now() - phaseStart;
    } else {
      fogPerfStats.wavesMs = 0;
    }

    fogPerfStats.hexCount = coords.length;
    fogPerfStats.totalMs = performance.now() - rebuildStart;
  }

  /**
   * True only when it's certain no settlement's fog influence
   * (exploredRadius + FOG_WORLD_BG_HANDOFF_HEXES, converted to world-space
   * pixels) reaches anywhere into `rect` — i.e. every hex in the current
   * viewport is deep, uniformly-opaque unexplored fog (see
   * FOG_WORLD_BG_HANDOFF_HEXES), so a single flat background colour can
   * stand in for the whole viewport's worth of per-hex fog geometry.
   *
   * This checks settlement *positions* — O(settlements) — rather than
   * scanning every visible hex's isExplored/distanceBeyondExplored the way
   * rebuildBordersAndFog's own per-hex loop does. An earlier version did
   * exactly that per-hex scan, checking `coords` and bailing out at the
   * first explored hex it found — cheap in principle (no geometry, just
   * lookups), but wrong in practice: raster (column-major) scan order has
   * no relationship to distance from a settlement, so for a *mixed*
   * viewport (a settlement's own default world-map view, not a deep-ocean
   * pan) the scan could walk a large fraction of a low-zoom viewport's
   * thousands of hexes before reaching the one explored hex that lets it
   * return false — on every rebuild, even though the answer never changes.
   * Measured ~1.7x *slower* per rebuild than before this optimisation
   * existed at all, for exactly the common "looking at your own island"
   * case it was never supposed to touch. A bounding check against known
   * settlement positions answers the same question in a small, fixed
   * number of comparisons regardless of viewport hex count — and, being
   * generous rather than exact about the radius, can only ever *under*-
   * apply the optimisation (safe), never wrongly skip real content.
   */
  private isEntirelyDeepFog(rect: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
    const { worldModel } = this.options;
    for (const s of worldModel.listSettlements()) {
      const grid = isoGridPosition({ q: s.q, r: s.r }, TILE_W, TILE_H);
      // TILE_W alone already exceeds one hex's actual pixel pitch in every
      // direction, so multiplying by it (rather than the tighter per-axis
      // pitch) only ever over-, never under-, estimates how far a
      // settlement's influence reaches.
      const radiusPx = (worldModel.exploredRadius(s) + FOG_WORLD_BG_HANDOFF_HEXES) * TILE_W;
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
   * World mode only: once isEntirelyDeepFog has already confirmed nothing
   * in the current viewport needs to stay transparent, paint the renderer's
   * own clear colour as the deep unexplored mist (FOG_UNEXPLORED, fully
   * opaque) instead — rebuildBordersAndFog then skips its whole per-hex fog
   * loop for this rebuild (see its own `deepFogOnly` handling). Reset to
   * fully transparent otherwise (mixed/near view, fog inactive, or
   * settlement/preview mode, which never touches this at all) so the CSS
   * backdrop behind the canvas (WorldMapCanvas.vue/SettlementCanvas.vue),
   * and any explored terrain/open water this rebuild draws normally, shows
   * through exactly as it did before this existed.
   */
  private syncWorldBackground(deepFogOnly: boolean) {
    if (!this.app || this.options.mode !== 'world') return;
    // WebGL's clear colour is non-premultiplied but the canvas composites
    // premultiplied (the default premultipliedAlpha:true context) — clearing
    // to FOG_UNEXPLORED's pale RGB at alpha 0 writes a non-premultiplied
    // "transparent" pixel the browser then adds on top of the CSS sea
    // backdrop behind the canvas, washing every transparent pixel out to a
    // pale wash instead of showing the blue gradient through. Only a color
    // whose RGB is already black at alpha 0 is a valid premultiplied
    // transparent, so the two must be set together, never RGB alone.
    this.app.renderer.background.color = deepFogOnly ? FOG_UNEXPLORED : 0x000000;
    this.app.renderer.background.alpha = deepFogOnly ? 1 : 0;
    // fogPatternSprite layers the pre-baked cloud texture on top of that flat
    // clear colour — see its own field comment and FOG_PATTERN_W/H's — so the
    // shortcut still reads as mist, not a blank rectangle. Any gap between
    // its blobs just shows the same flat FOG_UNEXPLORED behind it, so this
    // never leaks anything the per-hex path wouldn't have shown anyway.
    this.fogPatternSprite.visible = deepFogOnly;
  }

  /**
   * Once-per-rebuild prune of the settlement list to the ones whose
   * unexplored-mist ring can still reach `bounds` (see fogSourcesNear and
   * FOG_UNEXPLORED_INFLUENCE_HEXES above). Shared by isPastTerrainCull's
   * two callers (rebuildTerrain, rebuildTerrainFlat) and rebuildBordersAndFog,
   * so a single settlement walk replaces what used to be a fresh
   * distanceBeyondExplored scan over every settlement, per hex, in every one
   * of those loops.
   */
  private unexploredFogSources(bounds: AxialBounds | null): FogSource[] {
    const { worldModel } = this.options;
    return fogSourcesNear(
      worldModel.listSettlements(),
      (s) => worldModel.exploredRadius(s),
      bounds,
      FOG_UNEXPLORED_INFLUENCE_HEXES,
    );
  }

  /**
   * Whether an unexplored hex is far enough past the scouted ring that
   * there's nothing to gain by drawing terrain under the mist there — the
   * mist above it is guaranteed fully opaque by FOG_TERRAIN_CULL_HEXES (see
   * rebuildBordersAndFog). Shared by rebuildTerrain (settlement tile art)
   * and rebuildTerrainFlat (world-map flat fill) so the two agree.
   *
   * fogDebugFlags.terrainCullJitter defaults to *false*, unlike the fog
   * ramp's own distJitter: jittering the fog's own edge is what turns a
   * dead-straight hex ring into an organic mist boundary (see
   * FOG_DIST_JITTER_HEXES's own comment), but jittering the terrain cutoff
   * *too* makes individual tiles pop in/out unpredictably near the ring —
   * an artifact that's obvious on hard-edged tile art in a way the blurred,
   * overlapping fog blobs never show (issue #20: "distance jitter... affects
   * tiles too, should not by default"). With it off, terrain instead culls
   * at a fixed distance padded by the fog ramp's own worst-case jitter
   * (FOG_TERRAIN_CULL_HEXES + FOG_DIST_JITTER_HEXES) — far enough out that
   * even a maximally-jittered fog edge is still guaranteed opaque there, so
   * the terrain/fog seam FOG_TERRAIN_CULL_HEXES was built to close stays
   * closed regardless of whether the two flags agree.
   */
  private isPastTerrainCull(q: number, r: number, fogSources: FogSource[]): boolean {
    const beyondRaw = distanceBeyondSources(q, r, fogSources);
    if (fogDebugFlags.terrainCullJitter) {
      return (
        jitterDistance(q, r, beyondRaw, FOG_DIST_JITTER_SALT, fogDebugFlags.distJitter, FOG_DIST_JITTER_HEXES) >
        FOG_TERRAIN_CULL_HEXES
      );
    }
    return beyondRaw > FOG_TERRAIN_CULL_HEXES + FOG_DIST_JITTER_HEXES;
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
      // the fog fully clears — but past FOG_TERRAIN_CULL_HEXES the mist above
      // it is guaranteed fully opaque (rebuildBordersAndFog switches to a
      // flat solid fill there), so there's nothing to gain by drawing it
      // that far out.
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
        const riverTextures = riverTexturesFor(textures, river);
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
      // is guaranteed fully opaque anyway (see rebuildBordersAndFog).
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

  // A single soft white circle (opaque centre fading to transparent at the
  // rim), rasterized once. Every fog blob is a Sprite of this same texture —
  // tint gives it its colour, Sprite.alpha its per-hex intensity, width/height
  // its per-hex size — so the GPU only ever uploads one small texture no
  // matter how much fog is on screen.
  private createFogBlobTexture(app: Application): Texture {
    const radius = 128;
    const gradient = new FillGradient({
      type: 'radial',
      colorStops: [
        { offset: 0, color: 'rgba(255,255,255,1)' },
        { offset: 0.44, color: 'rgba(255,255,255,0.88)' },
        { offset: 0.7, color: 'rgba(255,255,255,0.42)' },
        { offset: 1, color: 'rgba(255,255,255,0)' },
      ],
    });
    const g = new Graphics().circle(radius, radius, radius).fill(gradient);
    const texture = app.renderer.generateTexture(g);
    g.destroy();
    return texture;
  }

  // Bakes FOG_PATTERN_BLOB_COUNT copies of the same soft-circle texture
  // above at deterministic (hash01-seeded, not Math.random — a stable
  // pattern across mounts, same reasoning as every other jittered fog value
  // in this file) positions/sizes/alphas into one FOG_PATTERN_W x
  // FOG_PATTERN_H texture, once, at mount. This is the flat-background
  // shortcut's stand-in for the organic blob mist — see fogPatternSprite's
  // own comment — generated the same way refreshFogBlobCache bakes its own
  // on-demand cache (stamp blurred sprites into an offscreen container, then
  // renderer.generateTexture it), just once instead of per-rebuild and over
  // a fixed area instead of the current viewport.
  private createFogPatternTexture(app: Application): Texture {
    const blobTexture = this.fogBlobTexture;
    if (!blobTexture) return Texture.EMPTY;
    const container = new Container();
    const baseW = TILE_W * FOG_BLOB_W_SCALE;
    const baseH = TILE_W * FOG_BLOB_H_SCALE;
    for (let i = 0; i < FOG_PATTERN_BLOB_COUNT; i++) {
      const sprite = new Sprite(blobTexture);
      sprite.anchor.set(0.5);
      // Overscan past the texture edges so blobs centred near a border still
      // contribute their full falloff instead of clipping to a hard edge.
      sprite.position.set(
        hash01(i, 0, 401) * (FOG_PATTERN_W + baseW) - baseW / 2,
        hash01(i, 0, 402) * (FOG_PATTERN_H + baseH) - baseH / 2,
      );
      const sizeJitter = 1 + (hash01(i, 0, 403) * 2 - 1) * FOG_BLOB_SIZE_JITTER * 2;
      sprite.width = baseW * sizeJitter;
      sprite.height = baseH * sizeJitter;
      sprite.alpha = 0.55 + hash01(i, 0, 404) * 0.45;
      container.addChild(sprite);
    }
    container.filters = [new BlurFilter({ strength: 14, quality: 3 })];
    const texture = app.renderer.generateTexture({
      target: container,
      frame: new Rectangle(0, 0, FOG_PATTERN_W, FOG_PATTERN_H),
    });
    container.destroy({ children: true });
    return texture;
  }

  // Pooled equivalent of syncSpriteLayer, for the fog blob layer: each entry
  // is a soft circle positioned/sized/tinted/alpha'd per hex rather than a
  // fixed-size tile sprite, so it takes its own geometry fields instead of
  // reusing that method's tile-shaped one.
  private syncFogBlobs(
    entries: Map<string, { x: number; y: number; w: number; h: number; tint: number; alpha: number; z: number }>,
  ) {
    const layer = this.fogBlobLayer;
    for (const [key, e] of entries) {
      let sprite = layer.active.get(key);
      const isNew = !sprite;
      if (!sprite) {
        sprite = layer.pool.pop() ?? new Sprite();
        sprite.anchor.set(0.5);
        layer.active.set(key, sprite);
      }
      sprite.texture = this.fogBlobTexture ?? Texture.EMPTY;
      sprite.position.set(e.x, e.y);
      sprite.width = e.w;
      sprite.height = e.h;
      sprite.tint = e.tint;
      sprite.alpha = e.alpha;
      // See FOG_BLOB_Z_SCOUTED/FOG_BLOB_Z_UNEXPLORED: without this, two
      // overlapping neighbouring blobs of different fog tiers stack in
      // whatever order `entries` was populated in (raster scan order from
      // rebuildBordersAndFog's `coords` loop), not by tier — sortChildren()
      // (container.sortableChildren is set in createSpriteLayer) is what
      // actually applies `zIndex` instead of leaving it inert.
      sprite.zIndex = e.z;
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

  // Syncs the offscreen blob sprites, then renders them (blurred, unless a
  // drag is in progress — see FOG_DRAG_FADE_MS) into fogBlobCacheTexture and
  // points fogBlobCacheSprite at the result. This is the only place the
  // blur filter actually runs — see the FOG_BLOB_CACHE_PADDING comment
  // above for why it's never left attached in the live scene graph.
  private refreshFogBlobCache(
    blobEntries: Map<string, { x: number; y: number; w: number; h: number; tint: number; alpha: number; z: number }>,
  ) {
    const start = performance.now();
    fogPerfStats.blobCount = blobEntries.size;
    this.syncFogBlobs(blobEntries);
    fogPerfStats.blobSyncMs = performance.now() - start;
    if (!this.app || blobEntries.size === 0) {
      this.fogBlobCacheSprite.visible = false;
      fogPerfStats.blobRenderMs = 0;
      fogPerfStats.blobCacheMs = performance.now() - start;
      return;
    }
    // Deliberately `dragging || wheeling` rather than the broader
    // `isInteracting`: a *player* gesture is over in a few hundred ms, but
    // cameraAnim runs for CAMERA_TRANSITION_MS (1.4s) with the founding
    // reveal's fog fade timed to it, and skipping the cache for that long
    // would leave nothing for that fade to reveal — the mist would pop in at
    // the end instead of rolling in.
    if (this.dragging || this.wheeling) {
      // An ongoing player gesture (a drag, or a wheel/pinch zoom) can trigger
      // a rebuild on nearly every rAF (scheduleCull fires whenever the camera
      // has moved or zoomed enough), and the visible unexplored area's
      // bounding box shifts in world space on almost every one of those —
      // which, below, would mean destroying and recreating a GPU texture on
      // (near-)every frame of the gesture, on top of a whole extra render()
      // pass. On CI's software-rendered headless Chromium that alone was
      // enough to stall the main thread badly enough for page.mouse.move (a
      // CDP command) to time out, even with the blur filter already dropped
      // for the drag. So: leave the existing cache sprite exactly as it was —
      // stale for the gesture's duration, the same tradeoff the
      // blur-drop/fade already makes — and let the forced rebuild that ends
      // the gesture (onPointerUp's on release, noteWheelActivity's idle timer
      // once zooming settles) bake a fresh, correctly-blurred one.
      fogPerfStats.blobRenderMs = 0;
      fogPerfStats.blobCacheMs = performance.now() - start;
      return;
    }

    const renderStart = performance.now();

    // Padded past the blob geometry so the blur (which bleeds a few pixels
    // past what it's applied to) doesn't get clipped at the texture's edge.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const e of blobEntries.values()) {
      minX = Math.min(minX, e.x - e.w / 2);
      maxX = Math.max(maxX, e.x + e.w / 2);
      minY = Math.min(minY, e.y - e.h / 2);
      maxY = Math.max(maxY, e.y + e.h / 2);
    }
    minX -= FOG_BLOB_CACHE_PADDING;
    minY -= FOG_BLOB_CACHE_PADDING;
    maxX += FOG_BLOB_CACHE_PADDING;
    maxY += FOG_BLOB_CACHE_PADDING;
    const width = Math.ceil(maxX - minX);
    const height = Math.ceil(maxY - minY);

    // Render at a fraction of the true size, then display the result scaled
    // back up — a gaussian blur's whole visual job is to erase high-frequency
    // detail, so blurring a downsampled copy and upscaling it is visually
    // indistinguishable from blurring at full resolution, while the filter
    // pass itself (whose cost scales with pixel count) runs on a fraction of
    // the pixels. FOG_BLOB_CACHE_SCALE is calibrated in *screen* pixels, so
    // it's multiplied by camera.zoom here rather than applied to the bbox's
    // world-unit size directly: the visible bbox's world-space extent is
    // viewport-size / zoom, so a fixed world-space factor rendered far more
    // texture pixels than the screen could ever show at a low zoom (a
    // zoomed-out world-map pan spans a huge world-space area for the same
    // screen-sized viewport) — up to ~64x oversampled at the minimum zoom.
    // Scaling by zoom cancels that out, so the rendered texture tracks
    // viewport size (world bbox size * zoom) rather than world-space extent,
    // at every zoom level.
    const scale = FOG_BLOB_CACHE_SCALE * this.camera.zoom;
    const texWidth = Math.max(1, Math.ceil(width * scale));
    const texHeight = Math.max(1, Math.ceil(height * scale));

    this.fogBlobLayer.container.filters = this.fogBlobFilter ? [this.fogBlobFilter] : [];
    // The container's children are positioned in world coordinates (which
    // can be arbitrarily far from the origin) — offset (to land the region
    // we want on the texture's origin) and scale (for the downsample above)
    // the container itself. Harmless since this container is never rendered
    // any other way.
    this.fogBlobLayer.container.scale.set(scale);
    this.fogBlobLayer.container.position.set(-minX * scale, -minY * scale);

    if (this.fogBlobCacheSize.width !== texWidth || this.fogBlobCacheSize.height !== texHeight) {
      this.fogBlobCacheTexture?.destroy(true);
      this.fogBlobCacheTexture = RenderTexture.create({ width: texWidth, height: texHeight });
      this.fogBlobCacheSize = { width: texWidth, height: texHeight };
    }
    this.app.renderer.render({
      container: this.fogBlobLayer.container,
      target: this.fogBlobCacheTexture!,
      clear: true,
    });

    this.fogBlobCacheSprite.texture = this.fogBlobCacheTexture!;
    this.fogBlobCacheSprite.position.set(minX, minY);
    this.fogBlobCacheSprite.scale.set(1 / scale);
    this.fogBlobCacheSprite.visible = true;
    fogPerfStats.blobRenderMs = performance.now() - renderStart;
    fogPerfStats.blobCacheMs = performance.now() - start;
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

  private rebuildBordersAndFog(coords: AxialCoord[], fogActive: boolean, deepFogOnly: boolean) {
    const { worldModel, mode, playerId } = this.options;
    this.borderLayer.clear();
    this.fogLayer.clear();
    fogPerfStats.deepFogOnly = deepFogOnly;
    fogPerfStats.unexploredHexCount = 0;
    fogPerfStats.borderedHexCount = 0;
    fogPerfStats.scoutedHexCount = 0;

    // Hoisted once per rebuild — see fogSourcesNear/FOG_UNEXPLORED_INFLUENCE_HEXES
    // above for why a single settlement-position prune here replaces what
    // would otherwise be a fresh distanceBeyondExplored scan over every
    // settlement, for every hex, below.
    const bounds = axialBounds(coords);

    if (deepFogOnly) {
      // isEntirelyDeepFog already confirmed every visible hex is deep,
      // uniformly-opaque fog, and syncWorldBackground painted the
      // renderer's own clear colour to match — nothing here would be
      // visible over it, so skip straight to clearing the blob cache
      // instead of tessellating a Graphics.poly()/blob Sprite for every one
      // of what can be thousands of hexes in a low-zoom world-map viewport.
      this.refreshFogBlobCache(new Map());
      return;
    }

    // Distance (jittered, see FOG_VISIBLE_MARGIN_HEXES) past the currently
    // visible (line-of-sight) ring, mirroring WorldModel.visibleHexes's own
    // radius formula so the two stay in agreement — replaces that Set's
    // boolean membership test entirely for rendering, so the scouted tint
    // fades in symmetrically around the jittered boundary instead of jumping
    // from 0 to FOG_SCOUTED_ALPHA in one hex step at a hex-perfect ring.
    // Settlement mode has exactly one settlement to be in sight of; world
    // mode is in sight of every settlement the local player owns (there's
    // normally just one, but nothing stops a player from having several).
    let visibleEdgeDist: ((c: AxialCoord) => number) | null = null;
    if (mode === 'settlement') {
      const settlement = this.settlement();
      if (settlement) {
        const visRadius = worldModel.borderRadius(settlement) + FOG_VISIBLE_RADIUS_BONUS_HEXES;
        visibleEdgeDist = (c) =>
          jitterDistance(
            c.q,
            c.r,
            hexDistance({ q: settlement.q, r: settlement.r }, c) - visRadius,
            FOG_VISIBLE_JITTER_SALT,
            fogDebugFlags.scoutedTintFade,
            FOG_VISIBLE_JITTER_HEXES,
          );
      }
    } else if (fogActive) {
      const own = worldModel.listSettlements().filter((s) => s.ownerId === playerId);
      if (own.length > 0) {
        // Same viewport prune as the unexplored tier (fogSourcesNear above),
        // applied to the owned-settlement list this closure would otherwise
        // rescan in full for every hex.
        const sources = fogSourcesNear(
          own,
          (s) => worldModel.borderRadius(s) + FOG_VISIBLE_RADIUS_BONUS_HEXES,
          bounds,
          FOG_VISIBLE_INFLUENCE_HEXES,
        );
        visibleEdgeDist = (c) => {
          let min = Infinity;
          for (const s of sources) {
            const d = jitterDistance(
              c.q,
              c.r,
              hexDistance({ q: s.q, r: s.r }, c) - s.radius,
              FOG_VISIBLE_JITTER_SALT,
              fogDebugFlags.scoutedTintFade,
              FOG_VISIBLE_JITTER_HEXES,
            );
            if (d < min) min = d;
          }
          return min;
        };
      }
    }

    const inflatedTop = this.inflatedTop();
    const topPoints = isoTopPoints(TILE_W, TILE_H);
    const topCentroid = {
      x: topPoints.reduce((s, p) => s + p.x, 0) / topPoints.length,
      y: topPoints.reduce((s, p) => s + p.y, 0) / topPoints.length,
    };
    const blobEntries = new Map<
      string,
      { x: number; y: number; w: number; h: number; tint: number; alpha: number; z: number }
    >();

    // A blob per fogged hex, oversized and jittered in position/size so
    // neighbours overlap heavily instead of abutting at their hex edges —
    // see the FOG_BLOB_* comment above for why this replaces per-hex
    // polygon fills entirely for both fog tiers. `z` is the blob's fog tier
    // (FOG_BLOB_Z_SCOUTED/FOG_BLOB_Z_UNEXPLORED) — every call site below
    // passes FOG_UNEXPLORED or FOG_SCOUTED as `tint`, so it's derived from
    // that instead of threading a second parameter through every call.
    const addBlob = (c: AxialCoord, tint: number, alpha: number) => {
      const grid = isoGridPosition(c, TILE_W, TILE_H);
      const jx = fogDebugFlags.blobJitter ? (hash01(c.q, c.r, 20) - 0.5) * 2 : 0;
      const jy = fogDebugFlags.blobJitter ? (hash01(c.q, c.r, 21) - 0.5) * 2 : 0;
      const sizeJ = fogDebugFlags.blobJitter ? 1 + (hash01(c.q, c.r, 22) - 0.5) * 2 * FOG_BLOB_SIZE_JITTER : 1;
      blobEntries.set(coordKey(c), {
        x: grid.x + topCentroid.x + jx * TILE_W * FOG_BLOB_JITTER_X,
        y: grid.y + topCentroid.y + jy * TILE_H * FOG_BLOB_JITTER_Y,
        w: TILE_W * FOG_BLOB_W_SCALE * sizeJ,
        h: TILE_H * FOG_BLOB_H_SCALE * sizeJ,
        tint,
        alpha,
        z: tint === FOG_SCOUTED ? FOG_BLOB_Z_SCOUTED : FOG_BLOB_Z_UNEXPLORED,
      });
    };

    // Solid, unblurred fill for a hex whose fog tint is already fully
    // saturated (no further gradient to render) — drawn straight into
    // fogLayer, which composites *under* the blurred blob sprite (see the
    // addChild order in mountApp/constructor), so it sits as a plain
    // backdrop the organic blobs still overlay near any real edge. Once a
    // tier is saturated it already reads as one uniform plane visually
    // (that's what "saturated" means), so painting that plane directly
    // instead of thousands of individually blurred blobs is free, not an
    // approximation — see FOG_TERRAIN_CULL_HEXES (unexplored) and
    // FOG_VISIBLE_MARGIN_HEXES (scouted) for where each tier's cutoff is.
    const fillFlatFog = (gridPt: { x: number; y: number }, color: number, alpha: number) => {
      const flat = inflatedTop.flatMap((p) => [gridPt.x + p.x, gridPt.y + p.y]);
      this.fogLayer.poly(flat).fill({ color, alpha });
    };

    const unexploredSources =
      fogActive && fogDebugFlags.unexploredFog ? this.unexploredFogSources(bounds) : [];

    for (const c of coords) {
      if (fogActive && fogDebugFlags.unexploredFog && !worldModel.isExplored(c.q, c.r)) {
        fogPerfStats.unexploredHexCount++;
        // Mist over ground the settlement has never scouted — covers every
        // hex the camera can currently see, however far it's panned, so the
        // world reads as continuing forever under fog rather than ending at
        // a hard edge. Terrain is still drawn underneath (rebuildTerrain no
        // longer skips unexplored hexes) below FOG_TERRAIN_CULL_HEXES, so
        // instead of a hard white wall right past the scouted ring, the
        // mist fades in over FOG_MARGIN_HEXES hexes.
        const beyondRaw = distanceBeyondSources(c.q, c.r, unexploredSources);
        // Jittered before any threshold check — see FOG_DIST_JITTER_HEXES.
        // Hex-distance rings are perfect hexagons; without this, both the
        // ramp below and the cutoff here produce dead-straight ring facets
        // instead of an organic mist edge.
        const beyond = jitterDistance(
          c.q,
          c.r,
          beyondRaw,
          FOG_DIST_JITTER_SALT,
          fogDebugFlags.distJitter,
          FOG_DIST_JITTER_HEXES,
        );
        // Separately (and much more mildly) jittered — see FOG_CULL_JITTER_HEXES
        // for why the flat-fill/blob switch below can't reuse `beyond`'s full
        // ramp-sized jitter without neighbouring hexes popping in and out of
        // the hard-opaque tile unevenly.
        const cullBeyond = jitterDistance(
          c.q,
          c.r,
          beyondRaw,
          FOG_CULL_JITTER_SALT,
          fogDebugFlags.distJitter,
          FOG_CULL_JITTER_HEXES,
        );
        if (cullBeyond > FOG_TERRAIN_CULL_HEXES && !fogDebugFlags.blobsOnly) {
          // Guaranteed saturated (see FOG_TERRAIN_CULL_HEXES) — paint flat
          // solid white at a literal alpha:1 instead of a blob. This is the
          // only thing that actually *guarantees* full opacity: blobs alone
          // (individually capped below 1, relying on overlap to read as
          // solid) can leave faint gaps right at the edge of what's
          // rendered, which is exactly the seam a hard flat fill closes.
          fillFlatFog(
            isoGridPosition(c, TILE_W, TILE_H),
            fogDebugFlags.cullThresholdDebug ? 0xff2ec2 : FOG_UNEXPLORED,
            1,
          );
          // Keep placing solid blobs a bit past the hand-off too (see
          // FOG_BLOB_OVERLAP_HEXES) — otherwise the blur has nothing real to
          // blend the outermost blobs into and they visibly fade right
          // where the flat fill starts at full strength.
          if (!fogDebugFlags.flatFillOnly && cullBeyond <= FOG_WORLD_BG_HANDOFF_HEXES) {
            addBlob(c, fogDebugFlags.cullThresholdDebug ? 0xff2ec2 : FOG_UNEXPLORED, 1);
          }
          continue;
        }
        const jitter = hash01(c.q, c.r, 9);
        const t = Math.min(1, Math.max(0, beyond / FOG_MARGIN_HEXES));
        const alpha = 0.1 + t * 0.8 + jitter * 0.08;
        addBlob(c, FOG_UNEXPLORED, alpha);
        continue;
      }
      const tile = worldModel.getTile(c.q, c.r);
      if (mode === 'world' && tile.terrain === 'sea') continue;

      const grid = isoGridPosition(c, TILE_W, TILE_H);
      const top = isoTopPoints(TILE_W, TILE_H).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
      const flat = top.flatMap((p) => [p.x, p.y]);

      if (tile.ownerId && fogDebugFlags.realmBorders) {
        fogPerfStats.borderedHexCount++;
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

      if (visibleEdgeDist && fogDebugFlags.scoutedFog) {
        if (fogDebugFlags.scoutedTintFade) {
          const dist = visibleEdgeDist(c);
          const t = Math.min(1, Math.max(0, dist / FOG_VISIBLE_MARGIN_HEXES));
          if (t >= 1 && !fogDebugFlags.blobsOnly) {
            // Saturated past FOG_VISIBLE_MARGIN_HEXES — same guaranteed-fill
            // shortcut as the unexplored tier's own cutoff (see
            // fillFlatFog's comment). Without it, a zoomed-out view where a
            // huge scouted-but-out-of-sight region fills the viewport (a
            // sea-heavy world map, say) was placing one individually
            // blurred blob per hex across all of it for a result that
            // already reads as one flat plane — exactly the case this
            // closes.
            fillFlatFog(grid, FOG_SCOUTED, FOG_SCOUTED_ALPHA);
            fogPerfStats.scoutedHexCount++;
            // Keep a thin ring of blobs just past saturation too, so the
            // blur has something real to blend into (mirrors
            // FOG_BLOB_OVERLAP_HEXES's role in the unexplored tier).
            if (!fogDebugFlags.flatFillOnly && dist <= FOG_VISIBLE_MARGIN_HEXES + FOG_BLOB_OVERLAP_HEXES) {
              addBlob(c, FOG_SCOUTED, FOG_SCOUTED_ALPHA);
            }
          } else if (t > 0) {
            addBlob(c, FOG_SCOUTED, t * FOG_SCOUTED_ALPHA);
            fogPerfStats.scoutedHexCount++;
          }
        } else if (visibleEdgeDist(c) > 0) {
          // Original hard binary: full tint the instant a hex is past the
          // (unjittered) visible radius, nothing at all inside it.
          addBlob(c, FOG_SCOUTED, FOG_SCOUTED_ALPHA);
          fogPerfStats.scoutedHexCount++;
        }
      }
    }

    this.refreshFogBlobCache(blobEntries);
  }

  private rebuildMarkers() {
    this.markerLayer.clear();
    if (this.options.mode === 'settlement') {
      if (!this.options.hideSettlementBadge) this.rebuildSettlementLabels();
      return;
    }
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
   * zip 6a: the landing page mounts one renderer in preview mode (no
   * `settlementId`) and, the instant the player founds their settlement,
   * needs it to become a real settlement view — same canvas, no
   * remount/flash. Rather than snap the camera and fog on straight away
   * (the reported "view jumps on every tutorial interaction"), this eases
   * the camera to its new position/zoom and fades fog in over the same
   * span (see CAMERA_TRANSITION_MS/FOG_REVEAL_FADE_MS) — the fog reads as
   * rolling in as the camera settles, rather than a cut.
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
        this.fogBlobCacheSprite.alpha = FOG_REVEAL_FROM_ALPHA;
        this.fogLayer.alpha = FOG_REVEAL_FROM_ALPHA;
        this.fogFadeDurationMs = FOG_REVEAL_FADE_MS;
        this.fogFadeFromAlpha = FOG_REVEAL_FROM_ALPHA;
        this.fogFadeAffectsFlatLayer = true;
        this.fogFadeStartedAt = performance.now();
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
    // app.destroy({ children: true }) destroys the Sprites but not a texture
    // we generated ourselves (generateTexture() output isn't owned by any
    // one Sprite), so it needs its own explicit destroy.
    this.fogBlobTexture?.destroy(true);
    this.fogBlobTexture = null;
    this.fogPatternTexture?.destroy(true);
    this.fogPatternTexture = null;
    // fogBlobLayer.container is deliberately never added to app.stage (see
    // FOG_BLOB_CACHE_PADDING above), so app.destroy's children:true won't
    // reach it or fogBlobCacheTexture — both need their own explicit destroy.
    this.fogBlobLayer.container.destroy({ children: true });
    this.fogBlobCacheTexture?.destroy(true);
    this.fogBlobCacheTexture = null;
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
