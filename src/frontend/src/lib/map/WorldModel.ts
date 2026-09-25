// Plain (non-reactive) game-state container. Deliberately outside Vue's
// reactivity: Vue's proxy-based reactivity walks and wraps every property it
// sees, which is fine for a handful of HUD numbers but pathological for a
// tile map that can span thousands of hexes as the camera roams. The
// renderer reads this directly every frame; Vue components only ever see
// small, explicitly-copied summaries (see stores/world.ts).
import { coordKey, hexDistance, hexesInRadius, neighbors, parseKey, type AxialCoord } from '../hex/coords';
import { cropAllowedHere, riverBuildingAllowedHere } from './ringCatalogue';
import { giantCoverage, type GiantPart } from './giantTiles';
import { placeGiants, StartPositionExclusionRadius, type GiantFamily } from './giantPlacement';
import { claimDiscs, claimRadiusForLevel, type ClaimDisc } from './shoreline';
import { claimsWithGiants } from './territory';
import { validateTradeRatio } from '../trade/tradeRatio';
import {
  DEFAULT_GENERATION,
  generateTile,
  hash2,
  soilAt,
  springMountainShapeAt,
  terrainAt,
  wastedTerrainAt,
  wastedVariantAt,
  type WorldGenerationConstants,
} from './worldGenerator';
import {
  emptyResources,
  TILE_ORIENTATIONS,
  type CartShipment,
  type IslandLabel,
  type ResourceKind,
  type Resources,
  type RiverTile,
  type Terrain,
  type Settlement,
  type Tile,
  type TileOrientation,
} from './types';

/**
 * Demo mode's client-only trade offer — mirrors the shape of the backend's
 * `TradeOfferResponse` closely enough that TradePanel.vue can read either
 * with the same template, without actually matching it field-for-field
 * (there's no id-per-poster-settlement notion of a shipment here — see
 * `WorldModel.acceptTradeOffer`'s doc comment for why).
 */
export interface DemoTradeOffer {
  id: string;
  posterSettlementId: string;
  posterName: string;
  offeredResource: ResourceKind;
  offeredAmount: number;
  requestedResource: ResourceKind;
  requestedAmount: number;
  guildOnly: boolean;
  state: 'open' | 'accepted' | 'delivered' | 'cancelled' | 'expired';
  postedAt: number;
}

/**
 * Demo-mode trade rejection, thrown by `WorldModel`'s trade methods —
 * mirrors `ApiError`'s `problem.rejection` closely enough that
 * TradePanel.vue can display both the same way (`err.rejection` here vs
 * `err.problem?.rejection` there) without a real HTTP round trip to reject.
 */
export class DemoTradeError extends Error {
  readonly rejection: string;
  constructor(rejection: string) {
    super(rejection);
    this.rejection = rejection;
  }
}

// A single canned rival offer, seeded once at world construction so the demo
// (and its e2e test) has something on the board to accept without needing a
// second real settlement — see `WorldModel`'s constructor. This settlement
// id is never registered via `registerSettlement`, so it never renders on
// the map; it exists only as a label for this one offer.
const DEMO_RIVAL_SETTLEMENT_ID = 'demo-rival';
const DEMO_RIVAL_NAME = 'Ravenshold';

// Issue #46 phase 3: demo mode has no real cart travel time to hang a
// shipment's ETA off of (`acceptTradeOffer` settles instantly — see its own
// doc comment) — but a purely cosmetic cart still needs *some* travel
// window to be visible/testable on the map. 8s real time is long enough for
// a marker + ETA label to actually render and be asserted on in an e2e
// test, short enough not to linger once the (already-settled) trade is long
// done.
const DEMO_CART_TRAVEL_MS = 8000;
// The seeded rival offer's poster (`DEMO_RIVAL_SETTLEMENT_ID`) is never
// registered as a real settlement (see that constant's own comment), so it
// has no hex position to depart a cart from. This fixed offset from the
// accepting settlement gives its cart a plausible-looking origin purely for
// the map animation — same "cosmetic, not a real place" spirit as the
// rival's offer itself.
const DEMO_RIVAL_CART_OFFSET: AxialCoord = { q: 6, r: -4 };

// zip 9: "unexplored hexes are hidden; scouted but not currently-visible
// hexes are greyed out" — three distinct rings, not two. Ownership only ever
// reaches borderRadius, visibleHexes (line-of-sight) reaches one hex further,
// and explored reaches further still so there's an actual ring of greyed-out
// scouted terrain between the clear realm and the hidden unknown, instead of
// unexplored starting immediately at the border.
export const FOG_SCOUT_RING = 3;

// landing-page-defects.md L5/L4 (see the correction in that doc's own
// history — an earlier draft of this fix wrongly removed the radius crop
// entirely; read on for why that was itself a regression):
//
// The pre-founding preview used to cull by a hexDistance disc around the
// suggested plot, which draws whatever land happens to fall inside that
// disc — including a second, unrelated island, if a world seed happened to
// place one within range. The disc itself is *not* the bug: the mockup
// (docs/design/img/but_building_on_map.png) shows a deliberately small crop
// of terrain, maybe 5-6 hexes across, framed beside the hero column — a
// real island can run to dozens of hexes, far too big to read at any usable
// zoom next to the hero copy, so cropping to a small radius around the plot
// is the correct framing choice, not a wrong abstraction to remove. The
// actual bug is narrower: that radius disc doesn't check landmass
// membership, so a *foreign* island's land within the same radius shows up
// too.
//
// The fix is therefore an intersection, not a replacement: a tile is drawn
// only if it is land, is part of `previewCenter`'s own connected landmass
// (`previewIslandTiles`'s flood fill, below), AND is within
// `PREVIEW_ISLAND_RADIUS` hexes of `previewCenter` (`previewCropTiles`,
// further below, is that intersection — it's what `rebuildTerrain`'s
// preview cull and `settlementCameraOrigin`'s L4 camera fit actually use).
export const PREVIEW_ISLAND_RADIUS = 7;
// The flood fill itself mirrors the backend's own island partition
// (`WorldGenerator.FloodFill`, WorldGenerator.cs ~L106) exactly: both
// flood-fill outward from a seed hex through the same six neighbours
// (`HexCoord.Neighbours()` there, `neighbors()` here — same direction-vector
// order), and `worldGenerator.ts`'s terrain sampling is already a bit-exact
// port (see that module's own header comment), so both sides agree on which
// hexes are land in the first place.
//
// `PREVIEW_ISLAND_FLOOD_MAX_RADIUS` is a generous safety backstop, not the
// expected case — deliberately much larger than `PREVIEW_ISLAND_RADIUS`
// itself so the flood fill can correctly answer "is this the same landmass"
// for tiles right at the crop's own edge, rather than being capped exactly
// at the crop radius (which would wrongly call a landmass "foreign" the
// instant it briefly narrows to less than one hex wide inside the crop
// before widening again). It matters less than it used to now that
// `previewCropTiles` caps the *drawn* set to `PREVIEW_ISLAND_RADIUS`
// regardless, but a malformed/pathological seed producing an unbroken
// landmass must still not be allowed to hang `rebuildTerrain` (which calls
// this on every camera rebuild — see the cache below) on an unbounded flood
// fill. Hitting the bound falls back to the pre-L5 hexDistance-disc rule
// (still `PREVIEW_ISLAND_RADIUS`) instead of drawing a silently-truncated
// island.
export const PREVIEW_ISLAND_FLOOD_MAX_RADIUS = 24;

// Demo mode's `placeGiantsForIsland` needs the landfall's *whole* island
// (giant placement rules — size thresholds, spacing — care about the real
// island, not a viewport crop), so this deliberately doesn't reuse
// `PREVIEW_ISLAND_FLOOD_MAX_RADIUS` (tuned tight around the render crop's own
// `PREVIEW_ISLAND_RADIUS`): a larger island than that bound would silently
// come back truncated (a `null` from `floodFillLandmass`, treated as "no
// island" below) rather than getting its due giants. Generous rather than
// unbounded for the same "must not hang on a pathological seed" reason
// `PREVIEW_ISLAND_FLOOD_MAX_RADIUS` itself gives.
const GIANT_ISLAND_FLOOD_MAX_RADIUS = 60;

/**
 * Iterative flood fill (an explicit queue, not recursion — the same "one
 * stack frame per land hex overflows on any island worth playing on" reason
 * `WorldGenerator.FloodFill`'s own doc comment gives) from `start`, walking
 * only tiles `isLand` accepts, through `neighbors()` — matching the
 * backend's adjacency exactly (see `previewIslandTiles`'s own doc comment).
 * Returns null the moment a candidate tile would sit further than
 * `maxRadius` hexes from `start`, so the caller can fall back to a disc rule
 * rather than accepting a landmass silently cut short mid-flood.
 *
 * A pure, exported function (rather than folded directly into
 * `previewIslandTiles`) so it's unit-testable against a synthetic `isLand`
 * predicate — two islands close enough to leak into each other under the
 * old radius rule, or a landmass built specifically to hit `maxRadius` —
 * without needing to find a real world seed that happens to produce the
 * same shape. Same reasoning as HexMapRenderer's own
 * `previewFitZoom`/`worldLayerOrder`: pull the pure logic out where it can
 * be tested directly, rather than only through a mounted renderer.
 */
export function floodFillLandmass(
  start: AxialCoord,
  isLand: (c: AxialCoord) => boolean,
  maxRadius: number,
): AxialCoord[] | null {
  if (!isLand(start)) return [];
  const seen = new Set<string>([coordKey(start)]);
  const tiles: AxialCoord[] = [start];
  const queue: AxialCoord[] = [start];
  while (queue.length) {
    const c = queue.shift()!;
    for (const n of neighbors(c)) {
      const k = coordKey(n);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!isLand(n)) continue;
      if (hexDistance(start, n) > maxRadius) return null;
      tiles.push(n);
      queue.push(n);
    }
  }
  return tiles;
}

/**
 * Packs a coord into one integer key for the terrain cache.
 *
 * Bit-packed rather than `q * K + r`, which collides across the sign boundary
 * ((0, -1) and (-1, K - 1) both land on -1), and rather than a string, which
 * is the allocation this cache exists to avoid. The `| 0` also folds the `-0`
 * that odd-q/axial conversion can produce into 0, so a hex cannot end up with
 * two keys.
 *
 * Good for |q|, |r| < 32768 — about 2000 times the radius of any world the
 * generator places islands in, and far past what a player could pan to.
 */
function terrainKey(q: number, r: number): number {
  return ((((q | 0) + 0x8000) << 16) | (((r | 0) + 0x8000) & 0xffff)) | 0;
}

/** The exact inverse of `terrainKey` — only ever needed by `setWastedRevealed`'s cache-invalidation sweep. */
function decodeTerrainKey(key: number): { q: number; r: number } {
  const u = key >>> 0;
  return { q: ((u >>> 16) & 0xffff) - 0x8000, r: (u & 0xffff) - 0x8000 };
}



export class WorldModel {
  readonly seed: number;
  /** The world's generation constants (issue #159 part B) — `DEFAULT_GENERATION` in demo mode, since there is no backend to ask. */
  readonly generation: WorldGenerationConstants;
  private tiles = new Map<string, Tile>();
  /**
   * Terrain alone, cached separately from `tiles`.
   *
   * Terrain is the one part of a tile that is pure: it depends only on (q, r)
   * and the world seed, never on anything the game does to a hex afterwards
   * (buildings, ownership and — for a fishing hut — orientation are all
   * mutated on the `Tile` in place, terrain never is). That makes it safe to
   * answer without materialising a `Tile`, which is what most of the map
   * actually wants: the world map draws flat coloured hexes from `terrain`
   * alone, the wave field only asks whether a hex is open water, and the water
   * mask asks nothing else either. Going through `getTile` for those made them
   * pay ~20us a hex for a 1.2us question, on tens of thousands of hexes per
   * rebuild.
   *
   * It also pays for itself inside `getTile`: a tile needs its six neighbours'
   * terrain, and neighbouring tiles share those, so this collapses seven
   * samples per tile to roughly one.
   *
   * Numerically keyed, unlike `tiles`. This is the hottest lookup in the
   * renderer and a `${q},${r}` key would make a string per call, which is the
   * kind of garbage that shows up as frame stutter rather than as time in any
   * one function.
   */
  private terrain = new Map<number, Terrain>();
  /**
   * Whether wasted islands are revealed for this world — false until the
   * world's endboss triggers (see `setWastedRevealed`, called from the
   * world response's `endbossTriggered` in live mode, and from the demo
   * mode's `window.__demoWorld().revealWastedIslands()` debug hook). While
   * false, `terrainOf`/`isLand` treat a wasted hex exactly like the plain
   * sea it always was; flipping it invalidates every cache that could hold
   * a stale sea answer for a now-revealed hex.
   */
  private wastedRevealed = false;
  private settlements = new Map<string, Settlement>();
  /** Trade carts in transit — see `CartShipment`'s own doc comment. */
  private cartShipments = new Map<string, CartShipment>();
  private explored = new Set<string>();
  private lastTick = performance.now();
  /** Islands known from the backend (live mode only) — id, name, and centre, for world-map labels. */
  private islands: IslandLabel[] = [];
  /** islandFootprint()'s cache — see there for why this needs to exist at all. */
  private islandFootprintCache = new Map<string, AxialCoord[]>();
  /** previewIslandTiles()'s cache, keyed by `previewCenter` — see there for why this needs to exist at all. */
  private previewIslandTilesCache = new Map<string, AxialCoord[]>();
  /** River tiles known from the backend (live mode only), keyed by coordinate — see `setRiverTiles`. */
  private riverTiles = new Map<string, RiverTile>();
  /** Demo mode's client-only trade offers — see `postTradeOffer` and friends. */
  private demoTradeOffers = new Map<string, DemoTradeOffer>();
  /**
   * Per-settlement coord keys `applyServerSnapshot` last rendered onto a
   * tile, so a building gone from the next snapshot (a cancelled order's
   * level-0 foundation, or a razed building) can be told apart from a hex
   * this settlement simply never reported — see `applyServerSnapshot`.
   */
  private renderedBuildingCoords = new Map<string, Set<string>>();
  /**
   * Every standing Tower per settlement — the frontend's own mirror of the
   * backend's per-settlement `Buildings` list, kept just for the one field
   * (`q`/`r`/`level`) `claimDiscsFor` needs to extend a realm's border by
   * its towers (`Settlement.ClaimDiscsFor`'s satellite discs). Updated from
   * `applyServerSnapshot` (live mode) and `placeBuilding` (demo mode).
   */
  private settlementTowers = new Map<string, { q: number; r: number; level: number }[]>();
  /**
   * Every hex belonging to a giant's 7-hex footprint, mapped to that giant's
   * own anchor coord — this model's own `IGiantIndex` (see the backend's
   * `Bjarnoy.Domain.World.GiantIndex`), populated by `placeGiant` (demo
   * mode) and `setGiants` (live mode). Kept separate from `tiles`' own
   * `Tile.giant` field (which a coord's own lookup could also read once its
   * `Tile` is materialised) so `claimsWithGiants`' `giantAt` lookup never has
   * to materialise a `Tile` — the whole point of `terrain`'s own separate
   * cache for the same reason (see its doc comment) — for a hex nothing else
   * has touched yet.
   */
  private giantAnchorByHex = new Map<string, AxialCoord>();
  /**
   * Demo mode: which islands `placeGiantsForIsland` has already run giant
   * placement for, keyed by the island's own lowest-(q, r) tile (`coordKey`)
   * — placement should happen at most once per island per model, the same
   * way a real world's giants are generated once at world creation rather
   * than re-rolled. Live mode never touches this: `setGiants` tags the
   * server's authoritative giants directly.
   */
  private giantPlacedIslands = new Set<string>();

  constructor(seed = 1, generation: WorldGenerationConstants = DEFAULT_GENERATION) {
    this.seed = seed;
    this.generation = generation;
    // One canned open offer so a fresh demo world always has something on
    // the trade board to accept — see the constant's own doc comment.
    this.demoTradeOffers.set('demo-seed-offer', {
      id: 'demo-seed-offer',
      posterSettlementId: DEMO_RIVAL_SETTLEMENT_ID,
      posterName: DEMO_RIVAL_NAME,
      offeredResource: 'wood',
      offeredAmount: 50,
      requestedResource: 'iron',
      requestedAmount: 25,
      guildOnly: false,
      state: 'open',
      postedAt: Date.now(),
    });
  }

  /** Live mode: island names/centres fetched from the backend (see `stores/world.ts`). */
  setIslands(islands: IslandLabel[]) {
    this.islands = islands;
    this.islandFootprintCache.clear();
  }

  listIslands(): IslandLabel[] {
    return this.islands;
  }

  /**
   * Live mode: every fetched island's river tiles, flattened — see
   * `stores/world.ts`. A river can't be derived client-side (its shape
   * depends on the whole island), so this is the renderer's only source for
   * them, unlike terrain/orientation/variant which `worldGenerator.ts`
   * computes on demand.
   */
  setRiverTiles(tiles: RiverTile[]) {
    this.riverTiles = new Map(tiles.map((t) => [coordKey(t), t]));
  }

  getRiverTile(q: number, r: number): RiverTile | undefined {
    return this.riverTiles.get(coordKey({ q, r }));
  }

  /**
   * `coord`'s giant anchor, or `null` if it isn't part of any giant's 7-hex
   * footprint — this model's `IGiantIndex`-equivalent lookup (see
   * `giantAnchorByHex`), the `giantAt` callback `claimsWithGiants` (the
   * territory rule, `territory.ts`) needs. Public: `TrainingModal.vue`'s
   * coastal check needs the same giant-aware territory answer
   * `hasShorelineInTerritory` does.
   */
  giantAnchorAt(coord: AxialCoord): AxialCoord | null {
    return this.giantAnchorByHex.get(coordKey(coord)) ?? null;
  }

  /**
   * Whether `coord` sits within `StartPositionExclusionRadius + 1` hexes of
   * any placed giant's anchor — the same exclusion
   * `WorldGenerator.FindStartPositions` (backend) enforces, mirrored here so
   * `findLandfall` can steer a demo-mode landfall clear of a giant's
   * footprint the same way a real world's start positions already are. Scans
   * the *distinct* anchors in `giantAnchorByHex` (deduping its 7-hex-per-
   * giant fan-out) rather than every covered hex, since the exclusion is
   * always measured from the anchor.
   */
  private isNearAnyGiantAnchor(coord: AxialCoord): boolean {
    const seen = new Set<string>();
    for (const anchor of this.giantAnchorByHex.values()) {
      const key = coordKey(anchor);
      if (seen.has(key)) continue;
      seen.add(key);
      if (hexDistance(coord, anchor) < StartPositionExclusionRadius + 1) return true;
    }
    return false;
  }

  /**
   * Issue #16 "map island names": the renderer needs to draw each island's
   * label *below* its tiles, but islands are procedurally generated at
   * varying sizes (worldGenerator's ISLAND_MIN/MAX_RADIUS, ~2.4-5.6 hexes)
   * with no stored radius anywhere — a fixed offset either overlaps a big
   * island's tiles or floats absurdly far below a small one. This flood-
   * fills the actual connected land tiles from the island's centre so the
   * renderer can measure the real bottom edge instead of guessing.
   *
   * Cached per island id (cleared in `setIslands`): islands don't move or
   * resize once fetched, and `rebuildMarkers` runs every render tick, so
   * flood-filling from scratch every frame would be real, avoidable work —
   * not something to hide behind a "we're in a test" branch, just something
   * that only ever needs computing once. `MAX_FOOTPRINT_TILES` is a hard
   * backstop against runaway growth (e.g. two islands generated close
   * enough to touch), not the expected case.
   */
  islandFootprint(island: IslandLabel): AxialCoord[] {
    const cached = this.islandFootprintCache.get(island.id);
    if (cached) return cached;
    const MAX_FOOTPRINT_TILES = 200;
    const start = { q: island.q, r: island.r };
    const tiles: AxialCoord[] = [];
    if (this.isLand(start.q, start.r)) {
      const seen = new Set<string>([coordKey(start)]);
      const queue: AxialCoord[] = [start];
      tiles.push(start);
      while (queue.length && tiles.length < MAX_FOOTPRINT_TILES) {
        const c = queue.shift()!;
        for (const n of neighbors(c)) {
          const k = coordKey(n);
          if (seen.has(k)) continue;
          seen.add(k);
          if (this.isLand(n.q, n.r)) {
            tiles.push(n);
            queue.push(n);
          }
        }
      }
    }
    this.islandFootprintCache.set(island.id, tiles);
    return tiles;
  }

  /**
   * `previewCenter`'s whole connected landmass — the *membership* half of
   * `previewCropTiles`'s intersection (see that method and the module-level
   * comment on `PREVIEW_ISLAND_RADIUS` above for why membership alone isn't
   * the crop). Every call for a given coordinate is the same pure answer
   * (terrain never changes after generation), so results are cached by
   * coordinate key: `previewCropTiles` (and so `rebuildTerrain`/
   * `settlementCameraOrigin`) calls this on every camera rebuild (pan/zoom/
   * resize), not just once when the preview first mounts, and
   * flood-filling from scratch every frame would be real, avoidable work —
   * the same reasoning `islandFootprint` above already applies to the
   * world-map island-label case.
   */
  previewIslandTiles(center: AxialCoord): AxialCoord[] {
    const key = coordKey(center);
    const cached = this.previewIslandTilesCache.get(key);
    if (cached) return cached;

    const tiles =
      floodFillLandmass(center, (c) => this.isLand(c.q, c.r), PREVIEW_ISLAND_FLOOD_MAX_RADIUS) ??
      this.previewIslandFallback(center);
    this.previewIslandTilesCache.set(key, tiles);
    return tiles;
  }

  /** The pre-L5 rule, kept only as `previewIslandTiles`'s safety-bound fallback (see there). */
  private previewIslandFallback(center: AxialCoord): AxialCoord[] {
    return hexesInRadius(center, PREVIEW_ISLAND_RADIUS).filter((c) => this.isLand(c.q, c.r));
  }

  /**
   * The landing page's pre-founding preview crop — the tiles
   * `HexMapRenderer.rebuildTerrain`'s preview branch actually draws and
   * `settlementCameraOrigin`'s locked camera (L4) actually fits/centres on,
   * so the two always measure the same set (their own "must land together"
   * note — landing-page-defects.md L4/L5).
   *
   * This is deliberately an *intersection*, not `previewIslandTiles` alone:
   * `PREVIEW_ISLAND_RADIUS` is a real framing choice (the mockup,
   * docs/design/img/but_building_on_map.png, shows a small ~5-6 hex plot of
   * terrain beside the hero column, not a whole island — an island can run
   * to dozens of hexes, far too big to read at any usable zoom there), so
   * it stays even though `previewIslandTiles` alone would already exclude a
   * foreign landmass. Dropping the radius and drawing the *whole* island
   * (an earlier draft of this fix's mistake) regresses the framing this
   * crop was already getting right: too large to fit beside the hero at a
   * readable zoom, spilling under both the hero copy and the onboarding
   * tray. Radius-only (the pre-L5 rule) has the opposite problem: it
   * doesn't check membership, so a foreign island within the same radius
   * shows up too. Only the intersection gets both right.
   */
  previewCropTiles(center: AxialCoord): AxialCoord[] {
    return this.previewIslandTiles(center).filter((c) => hexDistance(center, c) <= PREVIEW_ISLAND_RADIUS);
  }

  /**
   * This hex's terrain, without building (or caching) the whole `Tile` —
   * see the `terrain` field for why that distinction is worth having.
   */
  terrainOf = (q: number, r: number): Terrain => {
    const k = terrainKey(q, r);
    let terrain = this.terrain.get(k);
    if (terrain === undefined) {
      terrain = terrainAt(q, r, { seed: this.seed, generation: this.generation });
      if (terrain === 'sea' && this.wastedRevealed) {
        const wasted = wastedTerrainAt(q, r, { seed: this.seed, generation: this.generation });
        if (wasted !== 'sea') terrain = wasted;
      }
      this.terrain.set(k, terrain);
    }
    return terrain;
  };

  /**
   * Whether `(q, r)` is a hex a wasted-island reveal materialises — i.e. it
   * is sea to the plain green terrain layer but land once the wasted layer
   * is consulted. Only meaningful (and only ever true) once
   * `wastedRevealed` is set; before that, every hex is answered purely from
   * the green layer, matching every existing caller's assumption.
   *
   * Public so a terrain-only caller — the water-mask bake's
   * `isWastedLand` (see `TerrainLookup` in `water/waterMask.ts`) — can
   * ask this without materialising a `Tile` per water texel, the same
   * reason `hasProp` exists there instead of `getTile`.
   */
  isWastedLandAt(q: number, r: number): boolean {
    if (!this.wastedRevealed) return false;
    const world = { seed: this.seed, generation: this.generation };
    if (terrainAt(q, r, world) !== 'sea') return false;
    return wastedTerrainAt(q, r, world) !== 'sea';
  }

  /**
   * Reveals (or hides again) this world's wasted islands — see
   * `wastedRevealed`'s own doc comment. Invalidates only the cache entries
   * whose answer can actually change: a hex the *green* layer alone (plain
   * `terrainAt`, ignoring any reveal state) calls sea might materialise as
   * wasted land — or, once already revealed, revert to plain sea when
   * hidden again — so those are dropped and re-derived on next access.
   * Checked against the pure green sample rather than the cached value
   * itself, since the cached value's own meaning flips with the reveal
   * state (a hex cached as `'forest'` while revealed is exactly the kind of
   * entry that must still be invalidated on hide, even though it isn't
   * cached as `'sea'` any more). Green land never changes on reveal either
   * way, so every other cached `Tile` — buildings, ownership, `tile.giant`
   * tags, the Forest→Grass flattening `tagGiantHex` wrote into `terrain` —
   * is left exactly as it was; wiping the whole cache here previously
   * discarded all of that (a real bug: `giantAnchorByHex` kept a giant's
   * covered hexes, but the wiped `tiles`/`terrain` caches forgot them, so
   * the two disagreed on rebuild). The renderer itself still needs an
   * explicit `forceRebuild()` from the caller (mirrors how every other "the
   * underlying map just changed under the renderer" mutation here —
   * reseeding, placing a giant — leaves that to its own caller rather than
   * reaching into HexMapRenderer from this model).
   */
  setWastedRevealed(revealed: boolean) {
    if (this.wastedRevealed === revealed) return;
    this.wastedRevealed = revealed;
    const world = { seed: this.seed, generation: this.generation };
    const isGreenSea = (q: number, r: number) => terrainAt(q, r, world) === 'sea';
    for (const key of this.terrain.keys()) {
      const { q, r } = decodeTerrainKey(key);
      if (isGreenSea(q, r)) this.terrain.delete(key);
    }
    for (const [key, tile] of this.tiles) {
      if (isGreenSea(tile.q, tile.r)) this.tiles.delete(key);
    }
    this.islandFootprintCache.clear();
    this.previewIslandTilesCache.clear();
  }

  isWastedRevealed(): boolean {
    return this.wastedRevealed;
  }

  /**
   * Demo mode's `window.__demoWorld().revealWastedIslands()` debug hook
   * (see main.ts): reveals this world's wasted islands and, for each
   * wasted landmass found by flood-fill within `searchRadius` of `near`
   * (typically the player's own settlement/view — demo mode has no world-
   * wide island list to consult), runs the same wasted-mode giant
   * placement live worlds get from `WorldGenerator`. Demo mode has no
   * rivers, so there is no lava to place here — that side is verified by
   * unit tests only (see WastedIslandGenerationTests.cs and the frontend's
   * own textures tests). Idempotent per island the same way
   * `placeGiantsForIsland` already is; returns each discovered landmass's
   * first-visited hex, purely so a caller (or test) can see what was found.
   */
  revealWastedIslands(worldSeed: number, near: AxialCoord = { q: 0, r: 0 }, searchRadius = 90): AxialCoord[] {
    this.setWastedRevealed(true);

    const visited = new Set<string>();
    const discovered: AxialCoord[] = [];
    for (const coord of hexesInRadius(near, searchRadius)) {
      const key = coordKey(coord);
      if (visited.has(key) || !this.isWastedLandAt(coord.q, coord.r)) continue;

      const islandTiles = floodFillLandmass(coord, (c) => this.isLand(c.q, c.r), GIANT_ISLAND_FLOOD_MAX_RADIUS) ?? [coord];
      for (const tile of islandTiles) visited.add(coordKey(tile));

      this.placeGiantsForIsland(coord, worldSeed, true);
      discovered.push(coord);
    }
    return discovered;
  }

  getTile(q: number, r: number): Tile {
    const k = coordKey({ q, r });
    let tile = this.tiles.get(k);
    if (!tile) {
      tile = generateTile(q, r, { seed: this.seed, generation: this.generation }, this.terrainOf);
      if (this.wastedRevealed) {
        if (this.isWastedLandAt(q, r)) {
          tile.wasted = true;
          tile.variant = wastedVariantAt(q, r, { seed: this.seed, generation: this.generation }, tile.terrain);
        } else if (tile.terrain === 'sea' && tile.isCoastalWater) {
          // Coastal water bordering wasted land also renders as wasted
          // (blacksandcoast) — see textures.ts's wasted family mapping.
          const bordersWasted = neighbors({ q, r }).some((n) => this.isWastedLandAt(n.q, n.r));
          if (bordersWasted) tile.wasted = true;
        }
      }
      this.tiles.set(k, tile);
    }
    return tile;
  }

  /** Inclusive axial rectangle, used by the renderer's viewport cull. */
  getTilesInRect(qMin: number, qMax: number, rMin: number, rMax: number): Tile[] {
    const out: Tile[] = [];
    for (let q = qMin; q <= qMax; q++) {
      for (let r = rMin; r <= rMax; r++) {
        out.push(this.getTile(q, r));
      }
    }
    return out;
  }

  /**
   * The direction toward this coord's sea-facing neighbour, for a river
   * `Mouth` tile's rendering (see `mouthOrientationOf` in `types.ts`) — a
   * `RiverTile` carries no terrain of its own (a `Mouth`'s `outDirection`
   * is always null; there's nowhere else in the walk for it to point), and
   * generation only guarantees *a* sea neighbour exists, not which one or
   * at what angle from the inflow. Returns the first sea neighbour found,
   * in `TILE_ORIENTATIONS` order — arbitrary among ties, but a `Mouth` only
   * ever needs one.
   */
  seaFacingDirectionOf(coord: AxialCoord): TileOrientation | null {
    const dirs = neighbors(coord);
    for (let i = 0; i < dirs.length; i++) {
      if (this.getTile(dirs[i].q, dirs[i].r).terrain === 'sea') return TILE_ORIENTATIONS[i];
    }
    return null;
  }

  /**
   * Which of the two spring-capable mountain shapes a river `Spring` tile at
   * `coord` should render as — mirrors the backend's
   * `TerrainSampler.SpringMountainShapeAt` exactly (same seed offset, same
   * threshold; see `worldGenerator.ts`'s own `springMountainShapeAt`), so a
   * live-mode spring and the demo world's own client-side generation pick
   * the same shape for the same coordinate/seed. Pure and independent of
   * whether `coord` actually is a spring — the caller (river rendering)
   * already knows that from its own `RiverTile` lookup.
   */
  springShapeAt(coord: AxialCoord): 'corrie' | 'saddleback' {
    const shape = springMountainShapeAt(coord.q, coord.r, { seed: this.seed, generation: this.generation });
    return shape === 2 ? 'saddleback' : 'corrie';
  }

  /**
   * Which crop the island centred on `centre` grows — mirrors the backend's
   * `TerrainSampler.SoilAt` (via `soilAt`'s own doc comment). Only
   * PumpkinFarm cares (see `Settlement.PlanBuild`'s islandSoil parameter on
   * the backend): Farm stays buildable everywhere regardless of soil.
   */
  soilAtIslandCentre(centre: AxialCoord): 'wheat' | 'pumpkin' {
    return soilAt(centre.q, centre.r, { seed: this.seed, generation: this.generation });
  }

  /**
   * Which crop `settlementId`'s own island grows, resolved from its stored
   * `islandId` against `listIslands()` — or `undefined` if either is
   * unknown (a demo settlement founded with no island id; see
   * `cropAllowedHere`'s own doc comment for how callers treat that).
   */
  soilForSettlement(settlementId: string): 'wheat' | 'pumpkin' | undefined {
    const islandId = this.settlements.get(settlementId)?.islandId;
    const island = islandId ? this.islands.find((i) => i.id === islandId) : undefined;
    return island ? this.soilAtIslandCentre({ q: island.q, r: island.r }) : undefined;
  }

  /**
   * Which of a Sawmill's two art families a Sawmill standing on `coord`
   * should render with. A Sawmill is built directly on a river tile —
   * `WorldModel.placeBuilding` only accepts a `straight`/`bend` shaped one,
   * matching `BuildingDefinition.RequiresRiverShape` — so this reads that
   * same hex's own river shape rather than scanning neighbours: `bend` ->
   * `'sawmillbend'`, `straight` (or, defensively, anything else — the
   * buildability gate means this shouldn't happen) -> `'sawmillriver'`.
   */
  sawmillArtVariantOf(coord: AxialCoord): 'sawmillriver' | 'sawmillbend' {
    const river = this.getRiverTile(coord.q, coord.r);
    return river?.shape === 'bend' ? 'sawmillbend' : 'sawmillriver';
  }

  /**
   * A cheap signature of everything the fog mask is baked from.
   *
   * Demo mode has no backend to fetch a mask from, so it bakes one locally on
   * the same four-second cadence live mode polls on — about 30ms of main
   * thread each time, whether or not anything changed, which is one dropped
   * frame every four seconds with the camera sitting still. Comparing this
   * against the last baked value skips the bake when the fog cannot have
   * moved, which is almost always: fog changes when territory is claimed or a
   * settlement's vision grows, not on a timer.
   *
   * A signature over the inputs rather than a version counter bumped at each
   * mutation site, deliberately. The bake reads the explored set and every
   * settlement's vision discs (`demoFogMask`), and those are reachable from
   * claiming, founding, levelling, and placing, upgrading or razing a tower —
   * six call sites today and however many tomorrow. A counter has to be bumped
   * at all of them and silently goes stale the first time one is missed, where
   * this cannot: it is derived from the same state the bake reads.
   *
   * O(settlements + towers) — a handful of numbers, against the ~30k texels it
   * saves baking.
   */
  fogSignature(): string {
    // Nothing ever leaves `explored`, so its size alone tracks its contents.
    let signature = `${this.explored.size}`;
    for (const s of this.settlements.values()) {
      signature += `|${s.id}:${s.level}:${s.q},${s.r}`;
      for (const t of this.settlementTowers.get(s.id) ?? []) signature += `;${t.q},${t.r},${t.level}`;
    }
    return signature;
  }

  /**
   * Every hex known to carry a building, packed with the terrain cache's own
   * key — for the water mask's prop channel (`hasWaterProp`).
   *
   * A list rather than a lookup, because the consumer is the bake worker,
   * which has the world seed but none of this model's live state. Whether a
   * coastal-water hex shows a prop is otherwise pure (sea, coastal, variant),
   * so the buildings are the only thing that has to cross, and there are a few
   * dozen of them against the several hundred thousand texels that would
   * otherwise each have to ask this thread.
   *
   * Walks `tiles`, which holds every hex materialised so far. That is a
   * superset of the placed buildings and bounded by where the player has
   * looked, and it is walked once per bake rather than once per texel.
   */
  buildingHexKeys(): number[] {
    const keys: number[] = [];
    for (const tile of this.tiles.values()) {
      if (tile.buildingType) keys.push(terrainKey(tile.q, tile.r));
    }
    return keys;
  }

  isLand(q: number, r: number): boolean {
    return this.terrainOf(q, r) !== 'sea';
  }

  /**
   * Whether `at` would satisfy the backend's own start-position rule
   * (`WorldGenerator.FindStartPositions`): a Grass hex with at least one
   * Forest and two Grass neighbours, and no sea within two hexes. Demo mode
   * has no backend to ask for a real start position — `findLandfall` uses
   * this to steer clear of a coastal sliver of sand or a lone tile at an
   * island's tip, which the literal nearest land hex to a click can
   * otherwise be, leaving almost nothing settleable around it.
   */
  private isGoodStartCandidate(at: AxialCoord): boolean {
    const tile = this.getTile(at.q, at.r);
    if (tile.terrain !== 'grass') return false;

    let forest = 0;
    let grass = 0;
    for (const n of neighbors(at)) {
      const terrain = this.getTile(n.q, n.r).terrain;
      if (terrain === 'forest') forest++;
      else if (terrain === 'grass') grass++;
    }
    if (forest < 1 || grass < 2) return false;

    return hexesInRadius(at, 2).every((c) => this.isLand(c.q, c.r));
  }

  /**
   * The nearest hex to `near` worth founding a settlement on. Prefers a hex
   * satisfying `isGoodStartCandidate` (same quality bar the backend's own
   * `FindStartPositions` enforces for a live world); if none turns up within
   * `maxRadius`, falls back to the plain nearest land hex rather than
   * failing outright — better than refusing to land at all on a world too
   * small or too rocky to offer a "good" spot.
   */
  findLandfall(near: AxialCoord, maxRadius = 40): AxialCoord | null {
    let firstLand: AxialCoord | null = null;
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (const c of hexesInRadius(near, radius)) {
        if (!this.isLand(c.q, c.r)) continue;
        // Giant placement v2: never land within a giant's own start-position
        // exclusion — mirrors `WorldGenerator.FindStartPositions` (backend)
        // dropping the same candidates. Placement always runs before this is
        // called (see `stores/world.ts`'s `foundStartingSettlement`), so
        // `giantAnchorByHex` already reflects the island's giants by the
        // time this scan happens.
        if (this.isNearAnyGiantAnchor(c)) continue;
        firstLand ??= c;
        if (this.isGoodStartCandidate(c)) return c;
      }
    }
    return firstLand;
  }

  foundSettlement(ownerId: string, ownerName: string, name: string, at: AxialCoord): Settlement {
    const id = `stl_${ownerId}_${Date.now().toString(36)}`;
    const settlement = this.registerSettlement({
      id,
      ownerId,
      ownerName,
      name,
      q: at.q,
      r: at.r,
      level: 1,
      resources: { wood: 400, stone: 300, food: 500, iron: 100 },
      rates: { wood: 60, stone: 45, food: 90, iron: 20 },
      foundedAt: Date.now(),
    });
    this.claimTerritory(settlement.id);
    return settlement;
  }

  /**
   * Registers a fully-formed settlement's data — used when the backend (not
   * this client) is the source of truth for identity and starting stock
   * (live mode; see `stores/world.ts`). Data-only: does not paint any tile —
   * call `claimTerritory` (or one of its `claimTerritoryOnIsland`/
   * `claimAllTerritory` batch forms) to do that, scoped to whichever
   * island(s) the caller actually wants rendered.
   */
  registerSettlement(settlement: Settlement): Settlement {
    this.settlements.set(settlement.id, settlement);
    return settlement;
  }

  /**
   * Paints a registered settlement's home tile (longhouse + owner) and
   * claims its border/explored hexes. Idempotent: safe to call more than
   * once for the same settlement.
   */
  claimTerritory(settlementId: string): void {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return;
    const home = this.getTile(settlement.q, settlement.r);
    home.ownerId = settlement.id;
    home.buildingType = 'longhouse';
    home.buildingLevel = 1;
    for (const c of this.claimedHexes(settlement)) {
      const tile = this.getTile(c.q, c.r);
      if (!tile.ownerId) tile.ownerId = settlement.id;
    }
    for (const c of this.exploredHexesFor(settlement)) {
      this.explored.add(coordKey(c));
    }
  }

  /** Claims territory for every registered settlement on the given island — used by the landing/settlement-view preview, which must only render the current island. */
  claimTerritoryOnIsland(islandId: string): void {
    for (const settlement of this.settlements.values()) {
      if (settlement.islandId === islandId) this.claimTerritory(settlement.id);
    }
  }

  /** Claims territory for every registered settlement world-wide — used by the world-map view, which legitimately shows everyone. */
  claimAllTerritory(): void {
    for (const settlement of this.settlements.values()) {
      this.claimTerritory(settlement.id);
    }
  }

  getSettlement(id: string): Settlement | undefined {
    return this.settlements.get(id);
  }

  /**
   * How many buildings a settlement has standing (the longhouse itself
   * counts as one, placed by `registerSettlement`/`foundSettlement`) — used
   * by the landing page's guided onboarding (zip 6a: place 2 more buildings
   * before onboarding is considered complete) instead of tracking a
   * separate counter that could drift from what's actually on the ground.
   */
  countBuildings(settlementId: string): number {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return 0;
    let count = 0;
    for (const c of this.claimedHexes(settlement)) {
      if (this.getTile(c.q, c.r).ownerId === settlementId && this.getTile(c.q, c.r).buildingType) count++;
    }
    return count;
  }

  /**
   * Which building types a settlement actually has standing, deduplicated —
   * `countBuildings`'s sibling for the guided onboarding checklist (zip 6a),
   * which needs to know *which* of the two guided buildings (farm,
   * lumberjack) is done so either can be ticked off regardless of which one
   * the player placed first, rather than a fixed step order. Reads the same
   * tile data `countBuildings` does, so it stays correct in both demo mode
   * (the only source of truth) and live mode (mirrors whatever the last
   * server snapshot painted onto the tiles).
   */
  listPlacedBuildings(settlementId: string): Tile['buildingType'][] {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return [];
    const types = new Set<Tile['buildingType']>();
    for (const c of this.claimedHexes(settlement)) {
      const tile = this.getTile(c.q, c.r);
      if (tile.ownerId === settlementId && tile.buildingType) types.add(tile.buildingType);
    }
    return [...types];
  }

  listSettlements(): Settlement[] {
    return [...this.settlements.values()];
  }

  /**
   * Issue #16: "the pop(ulation) thing should also be implemented like with
   * the other ressources" (current/max + a rate). Neither the backend
   * (`Bjarnoy.Domain`) nor the legacy game models a population field at
   * all, so rather than invent a server-side stat this derives a plausible
   * current/max/rate purely from what the client already knows — the
   * longhouse level and how many buildings are standing — the same inputs
   * `countBuildings` already uses for onboarding. `max` is housing capacity
   * (longhouse level + each building adds a little room), `current` grows
   * toward it as buildings are worked, and `rate` is how fast it's still
   * climbing (0 once capacity is reached, matching how the other resource
   * rates read 0 at their storage cap).
   */
  populationFor(settlementId: string): { current: number; max: number; rate: number } {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return { current: 0, max: 0, rate: 0 };
    const buildings = this.countBuildings(settlementId);
    const max = 20 + settlement.level * 15 + buildings * 5;
    const current = Math.min(max, 10 + settlement.level * 8 + buildings * 4);
    const rate = current < max ? Math.max(1, Math.round((max - current) * 0.2)) : 0;
    return { current, max, rate };
  }

  /**
   * Issue #16 header: the reference shows each resource pill with a
   * "current / cap" and a fill-progress underline. Live mode now has a real
   * per-resource cap from the backend (`Settlement.capacity`, populated from
   * `ResourcesResponse.Capacity` — see `applyServerSnapshot`), which is the
   * cap `ResourcePool.Adjust` actually enforces server-side. This purely
   * client-side derivation (from the longhouse level, with a different base
   * per resource so the caps read as varied rather than one flat value
   * repeated four times) only remains as the demo-mode fallback, since demo
   * has no backend to report a real capacity. Use `storageCapForDisplay`
   * rather than calling this directly, so live settlements get their real cap.
   */
  storageCapFor(settlementId: string): Resources {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return emptyResources();
    const growth = 1 + settlement.level * 0.5;
    return {
      wood: Math.round(2000 * growth),
      stone: Math.round(2000 * growth),
      food: Math.round(2400 * growth),
      iron: Math.round(1000 * growth),
    };
  }

  /**
   * Issue #98: the header must show the settlement's true storage cap, not
   * a synthetic one — a live settlement's real cap (`Settlement.capacity`,
   * from `ResourcesResponse.Capacity`) can be much lower than
   * `storageCapFor`'s guess (e.g. a fresh level-1 settlement's real 750 vs.
   * the guess's 3000), which made a fully-clamped admin grant look like
   * most of it had vanished. Falls back to `storageCapFor` only when no
   * server capacity is known (demo mode).
   */
  storageCapForDisplay(settlementId: string): Resources {
    const settlement = this.settlements.get(settlementId);
    return settlement?.capacity ?? this.storageCapFor(settlementId);
  }

  /**
   * Radius of the settlement's own centre disc — see `claimRadiusForLevel`.
   * This is only the centre disc: a settlement's full claimed territory
   * also includes one satellite disc per standing Tower (see
   * `claimDiscsFor`/`claimedHexes`), so this alone under-covers a
   * territory with towers. Kept for callers that only ever cared about the
   * centre disc — hex-offset math (`demoFogMask.ts`'s own centre-radius use,
   * `HexMapRenderer.rebuildSettlementLabels`). Fog radius
   * (`visibleHexes`/`exploredRadius`) is tower-aware via `visionDiscsFor`
   * instead. HUD territory-size readouts use `claimedHexCount` instead,
   * which also accounts for towers.
   */
  borderRadius(settlement: Settlement): number {
    return claimRadiusForLevel(settlement.level);
  }

  /** Every claim disc — the centre disc plus one per standing Tower — making up this settlement's full claimed territory. */
  private claimDiscsFor(settlement: Settlement) {
    return claimDiscs(
      { q: settlement.q, r: settlement.r },
      settlement.level,
      this.settlementTowers.get(settlement.id) ?? [],
    );
  }

  /**
   * Every fog-vision disc making up this settlement's actual sight reach —
   * the centre disc (`borderRadius`) plus one satellite disc per standing
   * Tower, each Tower's own reach growing one hex per level starting at
   * level 1. Mirrors the backend's `FogVisionRadii.ToVisionSource`/
   * `ToTowerVisionSource` pair: kept as its own formula rather than reusing
   * `claimDiscsFor`'s tower radius, even though both currently compute the
   * same number, for the same "fog vision and building-claim radius aren't
   * guaranteed to move together" reason that backend class documents.
   */
  visionDiscsFor(settlement: Settlement): ClaimDisc[] {
    return [
      { q: settlement.q, r: settlement.r, radius: this.borderRadius(settlement) },
      ...(this.settlementTowers.get(settlement.id) ?? []).map((t) => ({
        q: t.q,
        r: t.r,
        radius: Math.max(0, t.level),
      })),
    ];
  }

  /**
   * Every hex within any vision disc's own explored ring (`visionDiscsFor`'s
   * discs, each grown by `FOG_SCOUT_RING`) — the tower-aware replacement for
   * looping `hexesInRadius` around the settlement's own centre alone.
   */
  private exploredHexesFor(settlement: Settlement): AxialCoord[] {
    const seen = new Set<string>();
    const hexes: AxialCoord[] = [];
    for (const disc of this.visionDiscsFor(settlement)) {
      for (const c of hexesInRadius({ q: disc.q, r: disc.r }, disc.radius + FOG_SCOUT_RING)) {
        const key = coordKey(c);
        if (seen.has(key)) continue;
        seen.add(key);
        hexes.push(c);
      }
    }
    return hexes;
  }

  /**
   * The union of every hex within each of `claimDiscsFor`'s discs that the
   * territory rule (`claimsWithGiants`, `territory.ts`) actually claims —
   * this settlement's real claimed territory, towers included, rather than
   * just the centre disc `borderRadius` alone describes. A hex that is part
   * of a giant's 7-hex footprint is only included once *every* one of that
   * footprint's hexes falls inside this same disc union — a disc that only
   * touches or partially covers a giant excludes all 7 of its hexes, not
   * just the ones outside the disc.
   *
   * Re-derived fresh from the settlement's *current* discs on every call
   * (rather than cached), which is what makes a giant that only becomes
   * fully enclosed later (a Tower completing the enclosure) start being
   * included the next time this runs, with no separate "did a giant just
   * get enclosed" tracking needed — every caller here only ever *adds*
   * ownership (`if (!tile.ownerId) tile.ownerId = ...`), never removes it,
   * so a hex excluded on an earlier call and included on a later one is
   * exactly the one-way claiming this model already promises elsewhere.
   */
  private claimedHexes(settlement: Settlement): AxialCoord[] {
    const discs = this.claimDiscsFor(settlement);
    const seen = new Set<string>();
    const hexes: AxialCoord[] = [];
    for (const disc of discs) {
      for (const c of hexesInRadius({ q: disc.q, r: disc.r }, disc.radius)) {
        const key = coordKey(c);
        if (seen.has(key)) continue;
        seen.add(key);
        if (claimsWithGiants(discs, c, (coord) => this.giantAnchorAt(coord))) hexes.push(c);
      }
    }
    return hexes;
  }

  /** Whether `at` is inside this settlement's claimed territory — see `claimedHexes`. */
  private claims(settlement: Settlement, at: AxialCoord): boolean {
    const discs = this.claimDiscsFor(settlement);
    return claimsWithGiants(discs, at, (coord) => this.giantAnchorAt(coord));
  }

  /**
   * Hexes this settlement actually owns right now — every `claimedHexes`
   * disc hex whose tile's `ownerId` still reads back as this settlement,
   * rather than the raw disc count. That distinction matters once discs can
   * overlap a neighbour's own territory (whoever claimed a hex first keeps
   * it — see `claims`' remarks on chaining) or reach open sea (a claim disc
   * doesn't care about terrain, same as the backend's own `Settlement.Claims`).
   */
  claimedHexCount(settlementId: string): number {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return 0;
    let count = 0;
    for (const c of this.claimedHexes(settlement)) {
      if (this.getTile(c.q, c.r).ownerId === settlementId) count++;
    }
    return count;
  }

  /**
   * Hexes visible right now — the union of every vision disc's own
   * line-of-sight radius (`visionDiscsFor`, each disc's own radius plus one),
   * so a Tower's satellite disc extends sight the same way the settlement's
   * own centre disc does, not just the centre disc alone.
   */
  visibleHexes(settlement: Settlement): Set<string> {
    const seen = new Set<string>();
    for (const disc of this.visionDiscsFor(settlement)) {
      for (const c of hexesInRadius({ q: disc.q, r: disc.r }, disc.radius + 1)) {
        seen.add(coordKey(c));
      }
    }
    return seen;
  }

  /**
   * A single, generous radius around the settlement's own centre that
   * safely bounds every vision disc's own explored ring (`visionDiscsFor`,
   * each grown by `FOG_SCOUT_RING`) — for callers that only want one circle
   * centred on the settlement itself rather than the disc union
   * `visibleHexes`/`exploredHexesFor` use for the actual fog shape: initial
   * camera framing (`HexMapRenderer.zoomForFogMargin`) and terrain-cull
   * pruning (`HexMapRenderer.isEntirelyDeepFog`/`unexploredFogSources`),
   * both of which only ever need "far enough to not miss anything", not the
   * exact shape. Equals the old centre-only `borderRadius(settlement) +
   * FOG_SCOUT_RING` when there are no towers.
   */
  exploredRadius(settlement: Settlement): number {
    let max = 0;
    for (const disc of this.visionDiscsFor(settlement)) {
      const reach =
        hexDistance({ q: settlement.q, r: settlement.r }, { q: disc.q, r: disc.r }) + disc.radius + FOG_SCOUT_RING;
      if (reach > max) max = reach;
    }
    return max;
  }

  /** Hexes ever scouted — greyed out (not live) once out of sight. */
  isExplored(q: number, r: number): boolean {
    return this.explored.has(coordKey({ q, r }));
  }

  /**
   * For an unexplored hex, how many hex-steps past the nearest settlement's
   * scouted ring (`exploredRadius`) it sits. Used by the renderer to fade
   * the unexplored fog in gradually from the ring's edge instead of a hard
   * white wall, so terrain drawn underneath (still true, just never
   * scouted) reads as a mist rolling in rather than a sudden cutoff.
   * 0 right past the ring, growing outward; Infinity with no settlements.
   */
  distanceBeyondExplored(q: number, r: number): number {
    let min = Infinity;
    for (const settlement of this.settlements.values()) {
      for (const disc of this.visionDiscsFor(settlement)) {
        const d = hexDistance({ q: disc.q, r: disc.r }, { q, r }) - (disc.radius + FOG_SCOUT_RING);
        if (d < min) min = d;
      }
    }
    return min === Infinity ? Infinity : Math.max(0, min);
  }

  /**
   * Applies a settlement snapshot fetched from the backend (live mode; see
   * `stores/world.ts`) — resources/rate/level and any buildings the queue has
   * completed since the last poll. Only building types this whitelist knows
   * about are placed on their hex; a type the frontend doesn't model yet
   * is silently skipped rather than stored as an unrecognized string. A type
   * with no distinct sprite in the art pack (Lumberjack, Quarry) is still
   * safe to place — `textures.ts`'s `baseTextureFor` falls back to the
   * tile's bare terrain rather than throwing.
   */
  applyServerSnapshot(
    settlementId: string,
    snapshot: {
      level: number;
      resources: Resources;
      rates: Resources;
      capacity: Resources;
      buildings: { q: number; r: number; type: string; level: number; orientation?: string | null }[];
    },
  ) {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return;

    const previousTowers = this.settlementTowers.get(settlementId) ?? [];
    const towers = snapshot.buildings
      .filter((b) => b.type === 'tower' && b.level >= 1)
      .map((b) => ({ q: b.q, r: b.r, level: b.level }));
    const towersChanged =
      towers.length !== previousTowers.length ||
      towers.some((t, i) => t.q !== previousTowers[i]?.q || t.r !== previousTowers[i]?.r || t.level !== previousTowers[i]?.level);
    this.settlementTowers.set(settlementId, towers);

    const levelIncreased = snapshot.level > settlement.level;
    if (levelIncreased) settlement.level = snapshot.level;

    // Re-claim whenever the centre disc grew (a longhouse level-up) or the
    // set of Tower satellite discs changed (a new/levelled-up tower) — not
    // every poll, since claiming is otherwise pure repeated work.
    if (levelIncreased || towersChanged) {
      for (const c of this.claimedHexes(settlement)) {
        const tile = this.getTile(c.q, c.r);
        if (!tile.ownerId) tile.ownerId = settlementId;
      }
      for (const c of this.exploredHexesFor(settlement)) {
        this.explored.add(coordKey(c));
      }
    }
    settlement.resources = snapshot.resources;
    settlement.rates = snapshot.rates;
    settlement.capacity = snapshot.capacity;

    const RENDERABLE_TYPES = new Set([
      'longhouse',
      'farm',
      'tower',
      'fishinghut',
      'magictower',
      'pumpkinfarm',
      'shrineofthor',
      'shrineoffreyja',
      'shrineofullr',
      'shrineofnjord',
      'lumberjack',
      'quarry',
      'storagehouse',
      'archeryrange',
      'dockyard',
      'greatstorehouse',
      'barracks',
      'fisherhut',
      'sawmill',
      'meadery',
      'townsquare',
      'cropmill',
      'smithy',
      'druidhut',
      'cartworkshop',
      'claybrickworks',
    ]);

    const previouslyRendered = this.renderedBuildingCoords.get(settlementId);
    const nowRendered = new Set<string>();
    for (const building of snapshot.buildings) {
      if (!RENDERABLE_TYPES.has(building.type)) continue;
      const key = coordKey({ q: building.q, r: building.r });
      nowRendered.add(key);
      const tile = this.getTile(building.q, building.r);
      tile.ownerId = settlementId;
      tile.buildingType = building.type as Tile['buildingType'];
      tile.buildingLevel = building.level;
      // The fishing hut is the only building with its own orientation (a
      // dock that has to face this settlement's shore, not whatever a bare
      // coastal-water tile would default to) — see PlacedBuildingResponse.
      if (building.orientation) {
        tile.orientation = building.orientation as Tile['orientation'];
      }
    }

    // A coordinate this settlement rendered last poll but no longer reports
    // (a cancelled order's level-0 foundation removed, or a building razed)
    // must be cleared, or the tile would keep showing a building that no
    // longer exists.
    if (previouslyRendered) {
      for (const key of previouslyRendered) {
        if (nowRendered.has(key)) continue;
        const { q, r } = parseKey(key);
        const tile = this.getTile(q, r);
        if (tile.ownerId !== settlementId) continue;
        tile.buildingType = undefined;
        tile.buildingLevel = undefined;
      }
    }
    this.renderedBuildingCoords.set(settlementId, nowRendered);
  }

  placeBuilding(settlementId: string, at: AxialCoord, type: Tile['buildingType']): boolean {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return false;
    // A settlement gets its one longhouse from founding (foundSettlement
    // above), never from placing a building — matches the backend rule in
    // Settlement.PlanBuild (BuildRejection.LonghousePlacementNotAllowed).
    if (type === 'longhouse') return false;
    if (!this.claims(settlement, at)) {
      return false;
    }
    const tile = this.getTile(at.q, at.r);
    // A giant hex is never buildable, claimed or not — the giant's own art
    // fully occupies the ground there (matches the backend's own rule; see
    // `Tile.giant`'s doc comment and `Territory`'s own remarks). Checked
    // even though `claims` above already excludes an *unclaimed* giant hex,
    // since a giant whose whole 7-hex footprint *is* fully enclosed reads as
    // claimed but must still refuse building on it.
    if (tile.giant) return false;
    // Every other building needs dry land; the fishing hut, dockyard, and
    // fisher hut are the exceptions, and *only* stand on the coastal ring of
    // the sea, not open water and not land either (matches
    // BuildingDefinition.RequiresCoastalWater).
    const isWaterOnlyBuilding = type === 'fishinghut' || type === 'dockyard' || type === 'fisherhut';
    if (isWaterOnlyBuilding ? !tile.isCoastalWater : tile.terrain === 'sea') return false;
    if (tile.buildingType) return false;
    // The Sawmill and Crop Mill are built directly on a river tile — only
    // certain shapes have a matching river-composite art (matches
    // BuildingDefinition.RequiresRiverShape, see riverBuildingAllowedHere).
    // sawmillArtVariantOf reads this same own-hex river tile to pick which
    // Sawmill composite to render; Crop Mill has only one (straight-only).
    if (type && !riverBuildingAllowedHere(type, this.getRiverTile(at.q, at.r)?.shape)) {
      return false;
    }
    // PumpkinFarm is only buildable on a Pumpkin-soil island (matches
    // BuildRejection.WrongCropForIslandSoil) — Farm has no such gate.
    if (type && !cropAllowedHere(type, this.soilForSettlement(settlementId))) {
      return false;
    }
    tile.ownerId = settlementId;
    tile.buildingType = type;
    tile.buildingLevel = 1;
    if (type === 'tower') {
      const towers = this.settlementTowers.get(settlementId) ?? [];
      towers.push({ q: at.q, r: at.r, level: 1 });
      this.settlementTowers.set(settlementId, towers);
      for (const c of this.claimedHexes(settlement)) {
        const claimed = this.getTile(c.q, c.r);
        if (!claimed.ownerId) claimed.ownerId = settlementId;
      }
    }
    return true;
  }

  /**
   * Issue #16 ring menu "tear down": demo-mode only — the backend
   * (`Bjarnoy.Domain.Buildings`) has no raze endpoint yet, so live mode
   * disables this action rather than pretending to support it (see
   * SettlementView.vue's ring-menu wiring). Clears the building but leaves
   * the hex claimed by the settlement — claiming stays one-way here, the
   * same as `applyServerSnapshot`'s live-mode reads, so razing a Tower never
   * shrinks the border its satellite disc already opened up.
   */
  razeBuilding(settlementId: string, at: AxialCoord): boolean {
    const tile = this.getTile(at.q, at.r);
    if (tile.ownerId !== settlementId || !tile.buildingType || tile.buildingType === 'longhouse') return false;
    if (tile.buildingType === 'tower') {
      const towers = this.settlementTowers.get(settlementId);
      if (towers) {
        const index = towers.findIndex((t) => t.q === at.q && t.r === at.r);
        if (index !== -1) towers.splice(index, 1);
      }
    }
    tile.buildingType = undefined;
    tile.buildingLevel = undefined;
    return true;
  }

  /**
   * Whether a "giant tile" (see `giantTiles.ts`) could be placed with its
   * anchor at `at`: all 7 covered hexes (the anchor + its six neighbours,
   * `giantCoverage`) must be dry land the giant's footprint can actually
   * replace — Grass or Forest, matching the demo's home-island terrain, not
   * Sea/Sand/Mountain — and free of any building or existing giant. A spike
   * rule, not the backend's: there is no server-side notion of a giant tile
   * yet (see `Tile.giant`'s own doc comment).
   */
  canPlaceGiant(at: AxialCoord): boolean {
    return giantCoverage(at).every(({ coord }) => {
      const tile = this.getTile(coord.q, coord.r);
      if (tile.terrain !== 'grass' && tile.terrain !== 'forest') return false;
      if (tile.buildingType) return false;
      if (tile.giant) return false;
      return true;
    });
  }

  /**
   * Places a giant tile anchored at `at`, tagging all 7 covered hexes with
   * `Tile.giant` (see that field's own doc comment) and — for a covered hex
   * that was Forest — flattening it to Grass first, so the giant's own art
   * is what actually reads on screen instead of a tree top poking through
   * it. Returns `false` (no mutation) when `canPlaceGiant(at)` would.
   *
   * `orientation` defaults to the anchor tile's own generated orientation
   * (`orientationAt`, same as every other tile) — a giant can be placed in
   * any of the 6, but with no orientation given, "however this hex would
   * already render" is the least surprising default.
   */
  placeGiant(at: AxialCoord, family: GiantFamily = 'giantmountain', orientation?: TileOrientation): boolean {
    if (!this.canPlaceGiant(at)) return false;
    const resolvedOrientation = orientation ?? this.getTile(at.q, at.r).orientation ?? 'SE';
    for (const { coord, part } of giantCoverage(at)) {
      this.tagGiantHex(coord, at, family, resolvedOrientation, part);
    }
    return true;
  }

  /**
   * Demo mode's own giant generation — the local counterpart to the
   * backend's `WorldGenerator` running `GiantGenerator` once per island at
   * world creation. Flood-fills `near`'s whole island
   * (`GIANT_ISLAND_FLOOD_MAX_RADIUS` — see that constant's own doc comment
   * for why this can't reuse `previewIslandTiles`'s tighter crop bound), and
   * if this model hasn't already placed giants for that island
   * (`giantPlacedIslands`, keyed by the island's own lowest-(q, r) tile —
   * the demo has no backend island id to key by instead), runs the shared
   * `placeGiants` core (mirrors `GiantGenerator.PlaceCore`) against it and
   * tags each result via `setGiants`.
   *
   * `islandIndex` has no backend equivalent to borrow in demo mode (there is
   * no island list to index into) — it is derived instead from a hash of the
   * island's own lowest-(q, r) tile, scaled into a large integer range the
   * same way a real per-island index would vary the shrine/tie-break rolls
   * from one island to the next. This is a demo-only stand-in, not a port of
   * anything the backend does with island indices.
   *
   * A no-op if `near` isn't land, if its island has already had giants
   * placed, or if `placeGiants` offers nothing (most demo islands are far
   * smaller than `SmallIslandGiantThreshold`, so this often places nothing
   * at all — see `stores/world.ts`'s `foundStartingSettlement` for where
   * this is called and why it must run before `foundSettlement`).
   */
  placeGiantsForIsland(near: AxialCoord, worldSeed: number, wasted = false): void {
    if (!this.isLand(near.q, near.r)) return;

    const islandTiles = floodFillLandmass(near, (c) => this.isLand(c.q, c.r), GIANT_ISLAND_FLOOD_MAX_RADIUS);
    if (!islandTiles || islandTiles.length === 0) return;

    let lowest = islandTiles[0];
    for (const tile of islandTiles) {
      if (tile.q < lowest.q || (tile.q === lowest.q && tile.r < lowest.r)) {
        lowest = tile;
      }
    }

    const islandKey = coordKey(lowest);
    if (this.giantPlacedIslands.has(islandKey)) return;
    this.giantPlacedIslands.add(islandKey);

    const islandIndex = Math.floor(hash2(lowest.q, lowest.r, worldSeed) * 1_000_000);
    const placements = placeGiants(islandTiles, (c) => this.terrainOf(c.q, c.r), worldSeed, islandIndex, () => false, wasted);
    // `placeGiants` already enforced the real placement rules, so these go
    // through `setGiants` (like the server's giants in live mode), not
    // `placeGiant`: the latter's `canPlaceGiant` spike rule only accepts
    // Grass/Forest, which would silently drop every mountain giant — a
    // mountain giant's footprint has Mountain hexes by construction.
    this.setGiants(
      placements.map((p) => ({
        family: p.family,
        anchor: p.anchor,
        orientation: this.getTile(p.anchor.q, p.anchor.r).orientation ?? 'SE',
      })),
    );
  }

  /**
   * The per-hex work `placeGiant` (demo) and `setGiants` (live) share:
   * tags `coord` as part of `anchor`'s giant footprint and, if it was
   * Forest, flattens it to Grass first so the giant's own art is what
   * actually reads on screen instead of a tree top poking through it — see
   * `placeGiant`'s own doc comment for why that flattening has to happen at
   * all.
   */
  private tagGiantHex(
    coord: AxialCoord,
    anchor: AxialCoord,
    family: GiantFamily,
    orientation: TileOrientation,
    part: GiantPart,
  ) {
    const tile = this.getTile(coord.q, coord.r);
    if (tile.terrain === 'forest') {
      tile.terrain = 'grass';
      // Keep the pure terrain cache (`terrainOf`/`isLand`, see its own doc
      // comment) in step with the materialised `Tile` it was sampled from —
      // both are land either way, but leaving it stale as `forest` would
      // mislead anything that later asks `terrainOf` specifically (rather
      // than reading the covered `Tile` this method already updated).
      this.terrain.set(terrainKey(coord.q, coord.r), 'grass');
    }
    tile.giant = { family, anchor, part, orientation };
    this.giantAnchorByHex.set(coordKey(coord), anchor);
  }

  /**
   * Live mode: tags every hex covered by each of the server's authoritative
   * giants (`IslandResponse.giants`, see `stores/world.ts`) with `Tile.giant`
   * — reuses `placeGiant`'s own covered-hex/forest-flattening logic
   * (`tagGiantHex`), but skips `canPlaceGiant`'s validation entirely: the
   * server is authoritative on where a giant sits (it already enforced its
   * own placement rules at generation time), this client only needs to
   * render it.
   *
   * Idempotent and additive, like every other territory-painting method
   * here: a hex whose `Tile.giant` is already set is left untouched rather
   * than re-tagged every poll (cheap early-out, and avoids re-flattening a
   * tile a player might — in principle — have otherwise touched), and a
   * giant whose anchor hex is already tagged by a *different* anchor is
   * skipped outright rather than partially overwritten (shouldn't happen —
   * the backend's own giants never overlap — but this must never make that
   * worse).
   */
  setGiants(giants: { family: string; anchor: AxialCoord; orientation: TileOrientation }[]) {
    for (const giant of giants) {
      const anchorTile = this.getTile(giant.anchor.q, giant.anchor.r);
      if (anchorTile.giant && (anchorTile.giant.anchor.q !== giant.anchor.q || anchorTile.giant.anchor.r !== giant.anchor.r)) {
        continue;
      }
      const family = giant.family as GiantFamily;
      for (const { coord, part } of giantCoverage(giant.anchor)) {
        if (this.getTile(coord.q, coord.r).giant) continue;
        this.tagGiantHex(coord, giant.anchor, family, giant.orientation, part);
      }
    }
  }

  /**
   * Bumps a building's level by one — demo mode's own upgrade path
   * (`SettlementView.upgrade`), the local counterpart to a real build order
   * completing server-side (`applyServerSnapshot`). A Longhouse upgrade
   * grows the settlement's own level (and so its centre disc); a Tower
   * upgrade grows that tower's own satellite disc — both re-claim
   * afterward, the same way `applyServerSnapshot` does for a live-mode
   * level-up, so a demo-mode upgrade of either actually extends the realm
   * border rather than only changing the sprite.
   */
  upgradeBuilding(settlementId: string, at: AxialCoord): boolean {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return false;
    const tile = this.getTile(at.q, at.r);
    if (tile.ownerId !== settlementId || !tile.buildingType) return false;

    const nextLevel = (tile.buildingLevel ?? 1) + 1;
    tile.buildingLevel = nextLevel;

    if (tile.buildingType === 'longhouse') {
      settlement.level = nextLevel;
    } else if (tile.buildingType === 'tower') {
      const towers = this.settlementTowers.get(settlementId) ?? [];
      const existing = towers.find((t) => t.q === at.q && t.r === at.r);
      if (existing) existing.level = nextLevel;
      else towers.push({ q: at.q, r: at.r, level: nextLevel });
      this.settlementTowers.set(settlementId, towers);
    } else {
      // Every other building type levels up cosmetically only — it has no
      // claim-radius contribution to re-derive (see BuildingDefinition.ClaimRadius).
      return true;
    }

    for (const c of this.claimedHexes(settlement)) {
      const claimed = this.getTile(c.q, c.r);
      if (!claimed.ownerId) claimed.ownerId = settlementId;
    }
    for (const c of this.exploredHexesFor(settlement)) {
      this.explored.add(coordKey(c));
    }
    return true;
  }

  /** Demo mode: registers one cosmetic cart — see `acceptTradeOffer` and `CartShipment`'s own doc comment. */
  addCartShipment(shipment: CartShipment) {
    this.cartShipments.set(shipment.id, shipment);
  }

  /**
   * Live mode: replaces the whole set of in-transit carts with a freshly
   * fetched one — see `stores/world.ts`'s `refreshTradeAsync`. Unlike
   * `addCartShipment`, this is a full swap rather than a merge: the backend
   * response is already the complete, authoritative list for this
   * settlement, so a cart that dropped out (delivered, or the request
   * simply didn't include it) should disappear immediately rather than
   * linger until its own `etaAt` expires.
   */
  setCartShipments(shipments: CartShipment[]) {
    this.cartShipments = new Map(shipments.map((s) => [s.id, s]));
  }

  listCartShipments(): CartShipment[] {
    const now = Date.now();
    for (const [id, cart] of this.cartShipments) {
      if (cart.etaAt < now - 5000) this.cartShipments.delete(id);
    }
    return [...this.cartShipments.values()];
  }

  /**
   * Demo mode's client-only stand-in for `POST .../trade-offers`: validates
   * the same ratio corridor the backend enforces (`lib/trade/tradeRatio.ts`)
   * and escrows the offered goods out of `resources` immediately, exactly
   * like `TradeService.PostOfferAsync` does server-side. Throws
   * `DemoTradeError` (mirroring `ApiError.problem.rejection`) on rejection.
   */
  postTradeOffer(
    settlementId: string,
    offeredResource: ResourceKind,
    offeredAmount: number,
    requestedResource: ResourceKind,
    requestedAmount: number,
    guildOnly: boolean,
  ): DemoTradeOffer {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) throw new DemoTradeError('SettlementNotFound');

    const rejection = validateTradeRatio(
      offeredResource,
      offeredAmount,
      requestedResource,
      requestedAmount,
      guildOnly,
    );
    if (rejection) throw new DemoTradeError(rejection);

    if (settlement.resources[offeredResource] < offeredAmount) {
      throw new DemoTradeError('NotEnoughResources');
    }

    settlement.resources[offeredResource] -= offeredAmount;

    const offer: DemoTradeOffer = {
      id: `offer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      posterSettlementId: settlementId,
      posterName: settlement.name,
      offeredResource,
      offeredAmount,
      requestedResource,
      requestedAmount,
      guildOnly,
      state: 'open',
      postedAt: Date.now(),
    };
    this.demoTradeOffers.set(offer.id, offer);
    return offer;
  }

  /** Open offers not posted by `excludeSettlementId` — the demo "trade board" (mirrors `GET .../board`). */
  listOpenTradeOffers(excludeSettlementId: string): DemoTradeOffer[] {
    return [...this.demoTradeOffers.values()].filter(
      (o) => o.state === 'open' && o.posterSettlementId !== excludeSettlementId,
    );
  }

  /** This settlement's own offers, any state, most recent first (mirrors `GET .../mine`). */
  listMyTradeOffers(settlementId: string): DemoTradeOffer[] {
    return [...this.demoTradeOffers.values()]
      .filter((o) => o.posterSettlementId === settlementId)
      .sort((a, b) => b.postedAt - a.postedAt);
  }

  /** Withdraws an open offer and refunds its escrow — mirrors `CancelOfferAsync`. */
  cancelTradeOffer(offerId: string, settlementId: string): DemoTradeOffer {
    const offer = this.demoTradeOffers.get(offerId);
    if (!offer) throw new DemoTradeError('OfferNotFound');
    if (offer.posterSettlementId !== settlementId) throw new DemoTradeError('NotYourOffer');
    if (offer.state !== 'open') throw new DemoTradeError('OfferNotOpen');

    const settlement = this.settlements.get(offer.posterSettlementId);
    if (settlement) settlement.resources[offer.offeredResource] += offer.offeredAmount;

    offer.state = 'cancelled';
    return offer;
  }

  /**
   * Demo mode's stand-in for `POST /trade-offers/{id}/accept`. Real trades
   * dispatch two shipments that travel over real game time (see the
   * backend's `ShipmentResponse`); the demo simulation has no travel loop to
   * hang a cart's ETA off of, so it settles synchronously — both
   * settlements' resources update immediately and the offer goes straight
   * to 'delivered' rather than 'accepted'. This is a deliberate
   * simplification (there is nothing for a "Shipments" list to show in demo
   * mode), not a bug. The seeded rival settlement (`DEMO_RIVAL_SETTLEMENT_ID`)
   * is never registered, so it has no `resources` to credit — only the real
   * (player) side of the trade actually moves stock either way.
   */
  acceptTradeOffer(offerId: string, acceptorSettlementId: string): DemoTradeOffer {
    const offer = this.demoTradeOffers.get(offerId);
    if (!offer) throw new DemoTradeError('OfferNotFound');
    if (offer.state !== 'open') throw new DemoTradeError('OfferNotOpen');
    if (offer.guildOnly) throw new DemoTradeError('GuildOnlyOffer');
    if (offer.posterSettlementId === acceptorSettlementId) throw new DemoTradeError('OwnOffer');

    const acceptor = this.settlements.get(acceptorSettlementId);
    if (!acceptor) throw new DemoTradeError('SettlementNotFound');
    if (acceptor.resources[offer.requestedResource] < offer.requestedAmount) {
      throw new DemoTradeError('NotEnoughResources');
    }

    acceptor.resources[offer.requestedResource] -= offer.requestedAmount;
    acceptor.resources[offer.offeredResource] += offer.offeredAmount;

    const poster = this.settlements.get(offer.posterSettlementId);
    if (poster) poster.resources[offer.requestedResource] += offer.requestedAmount;

    offer.state = 'delivered';

    // Issue #46 phase 3: the trade itself settles synchronously (see this
    // method's own doc comment), but a cart still departs cosmetically so
    // the map/e2e has something to render — see `DEMO_CART_TRAVEL_MS`.
    const from = poster ?? { q: acceptor.q + DEMO_RIVAL_CART_OFFSET.q, r: acceptor.r + DEMO_RIVAL_CART_OFFSET.r };
    const now = Date.now();
    this.addCartShipment({
      id: `cart_${offer.id}`,
      fromQ: from.q,
      fromR: from.r,
      toQ: acceptor.q,
      toR: acceptor.r,
      departedAt: now,
      etaAt: now + DEMO_CART_TRAVEL_MS,
      cargoResource: offer.offeredResource,
      cargoAmount: offer.offeredAmount,
    });

    return offer;
  }

  /** Advances resource stockpiles by elapsed real time. Call from a game loop, not from Vue. */
  tick(nowMs = performance.now()) {
    const dtHours = (nowMs - this.lastTick) / 1000 / 3600;
    this.lastTick = nowMs;
    if (dtHours <= 0) return;
    for (const settlement of this.settlements.values()) {
      const res = settlement.resources;
      const rate = settlement.rates;
      const cap = this.storageCapForDisplay(settlement.id);
      res.wood = Math.min(cap.wood, res.wood + rate.wood * dtHours);
      res.stone = Math.min(cap.stone, res.stone + rate.stone * dtHours);
      res.food = Math.min(cap.food, res.food + rate.food * dtHours);
      res.iron = Math.min(cap.iron, res.iron + rate.iron * dtHours);
    }
  }
}
