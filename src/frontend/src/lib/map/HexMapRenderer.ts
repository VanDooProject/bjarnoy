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
  /** Distance jitter on the outer unexplored ramp/terrain-cull boundary (FOG_DIST_JITTER_HEXES). Off = the old dead-straight hex-ring cutoff, but no more tile popping near it. */
  distJitter: boolean;
  /** Distance jitter + fade on the visible→scouted edge (FOG_VISIBLE_MARGIN_HEXES). Off = the original hard binary jump. */
  visibleRamp: boolean;
  /** Per-hex position/size jitter on fog blobs (FOG_BLOB_JITTER_X/Y, FOG_BLOB_SIZE_JITTER). Off = blobs sit dead-centre on their hex, same size. */
  blobJitter: boolean;
  /** Terrain sprites stop being culled past FOG_TERRAIN_CULL_HEXES — always draw terrain art regardless of fog distance, to see what's under the mist. */
  terrainCull: boolean;
  /** Skip the overlap blobs placed past the flat-fill cutoff (FOG_BLOB_OVERLAP_HEXES) — reproduces the blur/flat-fill seam this was added to fix. */
  flatFillOnly: boolean;
  /** Never switch to the flat, guaranteed-alpha:1 fill past FOG_TERRAIN_CULL_HEXES — mist stays blob-only forever, reproducing the original "fog never reaches full opacity" bug. */
  blobsOnly: boolean;
}
export const fogDebugFlags: FogDebugFlags = {
  distJitter: true,
  visibleRamp: true,
  blobJitter: true,
  terrainCull: true,
  flatFillOnly: false,
  blobsOnly: false,
};

// Jitters a raw hex-distance by up to ±FOG_DIST_JITTER_HEXES before any fog
// tier boundary is compared against it — see FOG_DIST_JITTER_HEXES for why.
// Applied with one shared salt so rebuildTerrain's cull check and
// rebuildBordersAndFog's fog-tier checks agree on the exact same jittered
// distance for a given hex, keeping the two aligned (no reintroduced seam).
// `enabled` lets each call site opt out via fogDebugFlags without every
// caller re-deriving the same "should I jitter" condition itself.
function jitterDistance(q: number, r: number, raw: number, salt: number, enabled: boolean): number {
  if (!enabled || !Number.isFinite(raw)) return raw;
  return raw + (hash01(q, r, salt) - 0.5) * 2 * FOG_DIST_JITTER_HEXES;
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
  fishinghut: 'Fishing Hut',
  magictower: 'Magic Tower',
  pumpkinfarm: 'Pumpkin Farm',
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
// How many hexes past the visible (line-of-sight) ring the dark "scouted"
// tint fades in over, instead of jumping straight from 0 to FOG_SCOUTED_ALPHA
// in one hex step at a hex-perfect ring — the same ramp treatment as the
// unexplored mist, just narrower since this inner ring should still read as
// a tighter edge than the outer fog.
const FOG_VISIBLE_MARGIN_HEXES = 2;

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
// missing-terrain pop-in at the edges) and faded back in over
// FOG_DRAG_FADE_MS once released. Since the mist is already a dense,
// atmospheric white cloud, this reads as fog being brushed aside while
// panning and rolling back in once you stop, not a glitch.
const FOG_BLOB_CACHE_PADDING = 48;
// Fraction of true size the blob layer is actually rendered/blurred at — see
// refreshFogBlobCache's own comment. 0.4 keeps the softened result visually
// indistinguishable from a full-resolution blur (already-soft blob edges
// upscale cleanly) while cutting the filter's pixel-cost to well under a
// sixth.
const FOG_BLOB_CACHE_SCALE = 0.4;
const FOG_DRAG_FADE_MS = 350;
const FOG_DRAG_FADE_FROM_ALPHA = 0.25;
// See scheduleCull's own comment for why this exists: throttles how often a
// drag can trigger a full terrain/border/fog rebuild.
const DRAG_REBUILD_THROTTLE_MS = 150;

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
    app.stage.addChild(this.world, this.markerLayer, this.fogWorld);

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
    this.fogWorld.scale.copyFrom(this.world.scale);
    this.fogWorld.position.copyFrom(this.world.position);
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
    // than snapping, matching the fog fade's feel elsewhere in this renderer.
    const targetMarkerAlpha = this.interactionLocked ? 0 : 1;
    this.markerLayer.alpha += (targetMarkerAlpha - this.markerLayer.alpha) * 0.25;
    if (this.options.mode === 'world') this.drawWaves();
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
    if (this.dragging && this.dragMoved < 6 && !this.suppressNextClick) {
      this.handleClick(e);
    }
    this.suppressNextClick = false;
    const wasDragging = this.dragging;
    this.dragging = false;
    if (wasDragging) {
      // The drag's last queued rebuild (scheduleCull's rAF, from the final
      // pointermove) may already have fired while dragging was still true —
      // rendering the crisp/unblurred cache — so force one more, synchronous
      // rebuild now that dragging is false to guarantee the blur actually
      // gets baked back in before the fade below reveals it.
      this.rebuildAll();
      this.fogBlobCacheSprite.alpha = FOG_DRAG_FADE_FROM_ALPHA;
      this.fogFadeDurationMs = FOG_DRAG_FADE_MS;
      this.fogFadeFromAlpha = FOG_DRAG_FADE_FROM_ALPHA;
      this.fogFadeAffectsFlatLayer = false;
      this.fogFadeStartedAt = performance.now();
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
      case 'pumpkinfarm': {
        const workersCap = level * 4;
        return { output: `+${level * 144} food/h`, workers: `${workersCap}/${workersCap}` };
      }
      case 'fishinghut': {
        const workersCap = level * 3;
        return { output: `+${level * 120} food/h`, modifier: nearWater ? 'Coastal' : undefined, workers: `${workersCap}/${workersCap}` };
      }
      case 'magictower':
        return { output: `+${level * 24} iron/h`, modifier: 'Arcane' };
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
    // Issue #16 "ring menu on click of tile": the ring anchors on the
    // clicked hex's own screen centre (same point the hover tooltip anchors
    // to) rather than the raw pointer position, so it stays centred on the
    // tile regardless of exactly where within it the player clicked.
    const grid = isoGridPosition(coord, TILE_W, TILE_H);
    const anchor = this.toScreen({ x: grid.x + TILE_W / 2, y: grid.y + TILE_CENTER_Y_OFFSET });
    this.options.onHexClick?.(coord, tile, anchor);
  }

  private scheduleCull() {
    if (this.cullQueued) return;
    this.cullQueued = true;
    requestAnimationFrame(() => {
      this.cullQueued = false;
      if (this.destroyed) return;
      // A drag (or, since the founding transition, an animated camera —
      // see tickCameraAnim) can cross cameraMovedEnough's distance threshold
      // on almost every rAF (each pointermove/animation step nudges the
      // camera further), and a rebuild re-syncs every visible terrain/
      // border/fog sprite — not just the fog blur (see refreshFogBlobCache's
      // own drag skip above), so that's real per-rebuild cost under software
      // rendering, paid several times over across one drag gesture or camera
      // animation. visibleCoords already renders a TILE_W*2 margin past the
      // viewport edge, so there's slack to spend: throttle rebuilds to once
      // per DRAG_REBUILD_THROTTLE_MS instead of firing on every threshold-
      // crossing frame. onPointerUp's forced rebuildAll() still guarantees
      // one fully up-to-date rebuild the instant a drag ends, and
      // tickCameraAnim's own forceRebuild() does the same the instant the
      // animation completes.
      if (
        (this.dragging || this.cameraAnim) &&
        performance.now() - this.lastRebuildAtMs < DRAG_REBUILD_THROTTLE_MS
      ) {
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
    this.lastRebuildAtMs = performance.now();
    const fogActive = this.isFogActive();
    const coords = this.visibleCoords();
    this.rebuildTerrain(coords, fogActive);
    this.rebuildBordersAndFog(coords, fogActive);
    this.rebuildMarkers();
    if (this.options.mode === 'world') this.rebuildWaves();
  }

  private rebuildTerrain(coords: AxialCoord[], fogActive: boolean) {
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
        jitterDistance(
          c.q,
          c.r,
          worldModel.distanceBeyondExplored(c.q, c.r),
          FOG_DIST_JITTER_SALT,
          fogDebugFlags.distJitter,
        ) > FOG_TERRAIN_CULL_HEXES
      ) {
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
        jitterDistance(
          c.q,
          c.r,
          worldModel.distanceBeyondExplored(c.q, c.r),
          FOG_DIST_JITTER_SALT,
          fogDebugFlags.distJitter,
        ) > FOG_TERRAIN_CULL_HEXES
      ) {
        continue;
      }

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

  // Pooled equivalent of syncSpriteLayer, for the fog blob layer: each entry
  // is a soft circle positioned/sized/tinted/alpha'd per hex rather than a
  // fixed-size tile sprite, so it takes its own geometry fields instead of
  // reusing that method's tile-shaped one.
  private syncFogBlobs(
    entries: Map<string, { x: number; y: number; w: number; h: number; tint: number; alpha: number }>,
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
      if (isNew) layer.container.addChild(sprite);
    }
    for (const [key, sprite] of layer.active) {
      if (entries.has(key)) continue;
      layer.container.removeChild(sprite);
      layer.pool.push(sprite);
      layer.active.delete(key);
    }
  }

  // Syncs the offscreen blob sprites, then renders them (blurred, unless a
  // drag is in progress — see FOG_DRAG_FADE_MS) into fogBlobCacheTexture and
  // points fogBlobCacheSprite at the result. This is the only place the
  // blur filter actually runs — see the FOG_BLOB_CACHE_PADDING comment
  // above for why it's never left attached in the live scene graph.
  private refreshFogBlobCache(
    blobEntries: Map<string, { x: number; y: number; w: number; h: number; tint: number; alpha: number }>,
  ) {
    this.syncFogBlobs(blobEntries);
    if (!this.app || blobEntries.size === 0) {
      this.fogBlobCacheSprite.visible = false;
      return;
    }
    if (this.dragging) {
      // A drag can trigger a rebuild on nearly every rAF (scheduleCull fires
      // whenever the camera has moved enough), and the visible unexplored
      // area's bounding box shifts on almost every one of those — which,
      // below, would mean destroying and recreating a GPU texture on
      // (near-)every drag frame, on top of a whole extra render() pass. On
      // CI's software-rendered headless Chromium that alone was enough to
      // stall the main thread badly enough for page.mouse.move (a CDP
      // command) to time out, even with the blur filter already dropped for
      // the drag. So: leave the existing cache sprite exactly as it was —
      // stale during the drag, same tradeoff the blur-drop/fade already
      // makes — and let onPointerUp's forced rebuildAll() bake a fresh,
      // correctly-blurred one once the drag ends.
      return;
    }

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
    // the pixels. `world`'s own scale doesn't enter into this — the container
    // is rendered into an offscreen RenderTexture at this fixed factor
    // regardless of camera zoom.
    const scale = FOG_BLOB_CACHE_SCALE;
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

  private rebuildBordersAndFog(coords: AxialCoord[], fogActive: boolean) {
    const { worldModel, mode, playerId } = this.options;
    this.borderLayer.clear();
    this.fogLayer.clear();

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
        const visRadius = worldModel.borderRadius(settlement) + 1;
        visibleEdgeDist = (c) =>
          jitterDistance(
            c.q,
            c.r,
            hexDistance({ q: settlement.q, r: settlement.r }, c) - visRadius,
            FOG_VISIBLE_JITTER_SALT,
            fogDebugFlags.visibleRamp,
          );
      }
    } else if (fogActive) {
      const own = worldModel.listSettlements().filter((s) => s.ownerId === playerId);
      if (own.length > 0) {
        visibleEdgeDist = (c) => {
          let min = Infinity;
          for (const s of own) {
            const visRadius = worldModel.borderRadius(s) + 1;
            const d = jitterDistance(
              c.q,
              c.r,
              hexDistance({ q: s.q, r: s.r }, c) - visRadius,
              FOG_VISIBLE_JITTER_SALT,
              fogDebugFlags.visibleRamp,
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
      { x: number; y: number; w: number; h: number; tint: number; alpha: number }
    >();

    // A blob per fogged hex, oversized and jittered in position/size so
    // neighbours overlap heavily instead of abutting at their hex edges —
    // see the FOG_BLOB_* comment above for why this replaces per-hex
    // polygon fills entirely for both fog tiers.
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
      });
    };

    for (const c of coords) {
      if (fogActive && !worldModel.isExplored(c.q, c.r)) {
        // Mist over ground the settlement has never scouted — covers every
        // hex the camera can currently see, however far it's panned, so the
        // world reads as continuing forever under fog rather than ending at
        // a hard edge. Terrain is still drawn underneath (rebuildTerrain no
        // longer skips unexplored hexes) below FOG_TERRAIN_CULL_HEXES, so
        // instead of a hard white wall right past the scouted ring, the
        // mist fades in over FOG_MARGIN_HEXES hexes.
        const beyondRaw = worldModel.distanceBeyondExplored(c.q, c.r);
        // Jittered before any threshold check — see FOG_DIST_JITTER_HEXES.
        // Hex-distance rings are perfect hexagons; without this, both the
        // ramp below and the cutoff here produce dead-straight ring facets
        // instead of an organic mist edge.
        const beyond = jitterDistance(c.q, c.r, beyondRaw, FOG_DIST_JITTER_SALT, fogDebugFlags.distJitter);
        if (beyond > FOG_TERRAIN_CULL_HEXES && !fogDebugFlags.blobsOnly) {
          // Guaranteed saturated (see FOG_TERRAIN_CULL_HEXES) — paint flat
          // solid white at a literal alpha:1 instead of a blob. This is the
          // only thing that actually *guarantees* full opacity: blobs alone
          // (individually capped below 1, relying on overlap to read as
          // solid) can leave faint gaps right at the edge of what's
          // rendered, which is exactly the seam a hard flat fill closes.
          const grid = isoGridPosition(c, TILE_W, TILE_H);
          const flat = inflatedTop.flatMap((p) => [grid.x + p.x, grid.y + p.y]);
          this.fogLayer.poly(flat).fill({ color: FOG_UNEXPLORED, alpha: 1 });
          // Keep placing solid blobs a bit past the hand-off too (see
          // FOG_BLOB_OVERLAP_HEXES) — otherwise the blur has nothing real to
          // blend the outermost blobs into and they visibly fade right
          // where the flat fill starts at full strength.
          if (!fogDebugFlags.flatFillOnly && beyond <= FOG_TERRAIN_CULL_HEXES + FOG_BLOB_OVERLAP_HEXES) {
            addBlob(c, FOG_UNEXPLORED, 1);
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

      if (visibleEdgeDist) {
        if (fogDebugFlags.visibleRamp) {
          const t = Math.min(1, Math.max(0, visibleEdgeDist(c) / FOG_VISIBLE_MARGIN_HEXES));
          if (t > 0) addBlob(c, FOG_SCOUTED, t * FOG_SCOUTED_ALPHA);
        } else if (visibleEdgeDist(c) > 0) {
          // Original hard binary: full tint the instant a hex is past the
          // (unjittered) visible radius, nothing at all inside it.
          addBlob(c, FOG_SCOUTED, FOG_SCOUTED_ALPHA);
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
    this.app?.ticker.remove(this.onTick);
    // app.destroy({ children: true }) destroys the Sprites but not a texture
    // we generated ourselves (generateTexture() output isn't owned by any
    // one Sprite), so it needs its own explicit destroy.
    this.fogBlobTexture?.destroy(true);
    this.fogBlobTexture = null;
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
