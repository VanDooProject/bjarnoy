// Plain (non-reactive) game-state container. Deliberately outside Vue's
// reactivity: Vue's proxy-based reactivity walks and wraps every property it
// sees, which is fine for a handful of HUD numbers but pathological for a
// tile map that can span thousands of hexes as the camera roams. The
// renderer reads this directly every frame; Vue components only ever see
// small, explicitly-copied summaries (see stores/world.ts).
import { coordKey, hexDistance, hexesInRadius, neighbors, parseKey, type AxialCoord } from '../hex/coords';
import { validateTradeRatio } from '../trade/tradeRatio';
import { generateTile } from './worldGenerator';
import {
  emptyResources,
  type CartShipment,
  type Fleet,
  type IslandLabel,
  type ResourceKind,
  type Resources,
  type RiverTile,
  type Settlement,
  type Tile,
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

const BASE_BORDER_RADIUS = 2;
// zip 9: "unexplored hexes are hidden; scouted but not currently-visible
// hexes are greyed out" — three distinct rings, not two. Ownership only ever
// reaches borderRadius, visibleHexes (line-of-sight) reaches one hex further,
// and explored reaches further still so there's an actual ring of greyed-out
// scouted terrain between the clear realm and the hidden unknown, instead of
// unexplored starting immediately at the border.
const FOG_SCOUT_RING = 3;
// Border-anchoring (docs/design decision: "Border radius grows with
// longhouse level and with border-anchoring buildings (watchtower)"). A
// tower can only be placed inside the settlement's existing border (see the
// hexDistance guard in placeBuilding), so claiming a ring around it only
// ever pushes the border outward in whichever direction the tower faces —
// the settlement's owned-tile silhouette stops being a pure hex and gains a
// bump wherever a tower sits near the edge.
const TOWER_CLAIM_RADIUS = 1;

export class WorldModel {
  readonly seed: number;
  private tiles = new Map<string, Tile>();
  private settlements = new Map<string, Settlement>();
  private fleets = new Map<string, Fleet>();
  /** Trade carts in transit — see `CartShipment`'s own doc comment. */
  private cartShipments = new Map<string, CartShipment>();
  private explored = new Set<string>();
  private lastTick = performance.now();
  /** Islands known from the backend (live mode only) — id, name, and centre, for world-map labels. */
  private islands: IslandLabel[] = [];
  /** islandFootprint()'s cache — see there for why this needs to exist at all. */
  private islandFootprintCache = new Map<string, AxialCoord[]>();
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

  constructor(seed = 1) {
    this.seed = seed;
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

  getTile(q: number, r: number): Tile {
    const k = coordKey({ q, r });
    let tile = this.tiles.get(k);
    if (!tile) {
      tile = generateTile(q, r, { seed: this.seed });
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

  isLand(q: number, r: number): boolean {
    return this.getTile(q, r).terrain !== 'sea';
  }

  findLandfall(near: AxialCoord, maxRadius = 40): AxialCoord | null {
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (const c of hexesInRadius(near, radius)) {
        if (this.isLand(c.q, c.r)) return c;
      }
    }
    return null;
  }

  foundSettlement(ownerId: string, ownerName: string, name: string, at: AxialCoord): Settlement {
    const id = `stl_${ownerId}_${Date.now().toString(36)}`;
    return this.registerSettlement({
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
  }

  /**
   * Registers a fully-formed settlement — used when the backend (not this
   * client) is the source of truth for identity and starting stock (live
   * mode; see `stores/world.ts`). Claims its border hexes exactly like
   * `foundSettlement`, which delegates here for the demo-mode case.
   */
  registerSettlement(settlement: Settlement): Settlement {
    this.settlements.set(settlement.id, settlement);
    const at = { q: settlement.q, r: settlement.r };
    const home = this.getTile(at.q, at.r);
    home.ownerId = settlement.id;
    home.buildingType = 'longhouse';
    home.buildingLevel = 1;
    for (const c of hexesInRadius(at, this.borderRadius(settlement))) {
      const tile = this.getTile(c.q, c.r);
      if (!tile.ownerId) tile.ownerId = settlement.id;
    }
    for (const c of hexesInRadius(at, this.exploredRadius(settlement))) {
      this.explored.add(coordKey(c));
    }
    return settlement;
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
    for (const c of hexesInRadius({ q: settlement.q, r: settlement.r }, this.borderRadius(settlement))) {
      if (this.getTile(c.q, c.r).ownerId === settlementId && this.getTile(c.q, c.r).buildingType) count++;
    }
    return count;
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

  borderRadius(settlement: Settlement): number {
    return BASE_BORDER_RADIUS + Math.floor(settlement.level / 2);
  }

  /** Hexes visible right now (line-of-sight radius around a settlement). */
  visibleHexes(settlement: Settlement): Set<string> {
    const radius = this.borderRadius(settlement) + 1;
    return new Set(hexesInRadius({ q: settlement.q, r: settlement.r }, radius).map(coordKey));
  }

  /**
   * Hexes that get marked "ever scouted" once claimed/leveled — wider than
   * visibleHexes so a ring of greyed-out fog actually renders beyond it.
   * Public so HexMapRenderer can frame the initial camera wide enough to
   * show a real margin of white (unexplored) fog past this ring, rather
   * than a zoom level tight enough to hide it entirely.
   */
  exploredRadius(settlement: Settlement): number {
    return this.borderRadius(settlement) + FOG_SCOUT_RING;
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
      const d = hexDistance({ q: settlement.q, r: settlement.r }, { q, r }) - this.exploredRadius(settlement);
      if (d < min) min = d;
    }
    return min === Infinity ? Infinity : Math.max(0, min);
  }

  /**
   * Applies a settlement snapshot fetched from the backend (live mode; see
   * `stores/world.ts`) — resources/rate/level and any buildings the queue has
   * completed since the last poll. Only building types this whitelist knows
   * about are placed on their hex; a type the frontend doesn't model yet
   * (e.g. `storagehouse`, which isn't in `Tile['buildingType']` at all) is
   * silently skipped rather than stored as an unrecognized string. A type
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

    if (snapshot.level > settlement.level) {
      settlement.level = snapshot.level;
      for (const c of hexesInRadius({ q: settlement.q, r: settlement.r }, this.borderRadius(settlement))) {
        const tile = this.getTile(c.q, c.r);
        if (!tile.ownerId) tile.ownerId = settlementId;
      }
      for (const c of hexesInRadius({ q: settlement.q, r: settlement.r }, this.exploredRadius(settlement))) {
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
      'lumberjack',
      'quarry',
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
    if (hexDistance({ q: settlement.q, r: settlement.r }, at) > this.borderRadius(settlement)) {
      return false;
    }
    const tile = this.getTile(at.q, at.r);
    // Every other building needs dry land; the fishing hut is the one
    // exception, and only on the coastal ring of the sea, not open water.
    const seaOk = type === 'fishinghut' && tile.isCoastalWater;
    if ((tile.terrain === 'sea' && !seaOk) || tile.buildingType) return false;
    tile.ownerId = settlementId;
    tile.buildingType = type;
    tile.buildingLevel = 1;
    if (type === 'tower') {
      for (const c of hexesInRadius(at, TOWER_CLAIM_RADIUS)) {
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
   * the hex claimed by the settlement.
   */
  razeBuilding(settlementId: string, at: AxialCoord): boolean {
    const tile = this.getTile(at.q, at.r);
    if (tile.ownerId !== settlementId || !tile.buildingType || tile.buildingType === 'longhouse') return false;
    tile.buildingType = undefined;
    tile.buildingLevel = undefined;
    return true;
  }

  addFleet(fleet: Fleet) {
    this.fleets.set(fleet.id, fleet);
  }

  listFleets(): Fleet[] {
    const now = Date.now();
    for (const [id, fleet] of this.fleets) {
      if (fleet.etaAt < now - 5000) this.fleets.delete(id);
    }
    return [...this.fleets.values()];
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
      res.wood += rate.wood * dtHours;
      res.stone += rate.stone * dtHours;
      res.food += rate.food * dtHours;
      res.iron += rate.iron * dtHours;
    }
  }
}
