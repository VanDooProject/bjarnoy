import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import { ApiError, api } from '../api/client';
import type {
  ArmyResponse,
  BuildOrderResponse,
  GuestArmySummary,
  IslandResponse,
  PlacedBuildingResponse,
  ShipmentResponse,
  TradeOfferResponse,
  TrainingOrderResponse,
  UnitStackResponse,
} from '../api/types';
import { DEMO_MODE } from '../config';
import { hexDistance, type AxialCoord } from '../lib/hex/coords';
import {
  buildAttackDispatchRequest,
  buildMoveDispatchRequest,
  buildSupportDispatchRequest,
} from '../lib/units/armyDispatch';
import { WorldModel } from '../lib/map/WorldModel';
import type { CartShipment, ResourceKind, Resources, TileOrientation } from '../lib/map/types';
import { emptyResources } from '../lib/map/types';

// How often live mode re-polls a settlement to pick up build-queue
// completions and rate changes it didn't cause itself (see
// `applyServerSnapshot`). Kept well below build/production timescales.
const LIVE_POLL_MS = 4000;

// Issue #40 phase 2: armies keep moving between polls (unlike buildings,
// which only change on a queue completion), so they're refetched on a
// tighter interval than LIVE_POLL_MS — still no sub-second animation (the
// design doc's own PositionAt is discrete, last-hex-reached; this just keeps
// that discrete position from ever looking stale for long) rather than a
// full websocket/animation loop, which the design doc explicitly defers.
const ARMY_POLL_MS = 2000;

// Mirrors the backend's SettlementService.MinimumSpacing: the minimum hex
// distance the API enforces between two settlements' centres. Kept in sync
// here so nearestStartPosition can skip a plot the backend would reject
// instead of finding out only after the founding request fails.
const MINIMUM_SETTLEMENT_SPACING = 3;

// The WorldModel instance itself is `markRaw`-ed: it's a plain class meant
// to be mutated directly by the renderer's render loop, not walked by Vue's
// reactivity proxy. Only the small `hud` summary below is reactive, and it
// is refreshed on a slow interval (1s) rather than on every resource tick.
export const useWorldStore = defineStore('world', {
  state: () => ({
    model: markRaw(new WorldModel(20260824)),
    selectedSettlementId: null as string | null,
    hud: {
      resources: emptyResources() as Resources,
      rates: emptyResources() as Resources,
      // Issue #16 header: storage cap per resource, so each pill can show a
      // "current / cap" and a fill-progress bar like the reference — see
      // `WorldModel.storageCapFor`.
      storageCap: emptyResources() as Resources,
      settlementName: '',
      level: 1,
      // Issue #16: population, wired the same way as the other resources —
      // current/max stock plus a rate. See `WorldModel.populationFor`.
      population: { current: 0, max: 0, rate: 0 },
      // zip 6a: landing-page onboarding needs "how many buildings has the
      // player actually placed" — derived from the model itself (the
      // longhouse counts as the first) rather than a separately tracked
      // counter that could drift from what's really on the ground.
      buildingsPlaced: 0,
      // zip 9: "real-time elements: build queue countdowns" — a snapshot of
      // the backend's queue plus when it was fetched, so BuildQueuePanel can
      // count each order down locally between polls instead of only
      // updating every LIVE_POLL_MS. Always empty in demo mode: the local
      // WorldModel places buildings instantly and has no queue to show.
      queue: [] as BuildOrderResponse[],
      queueFetchedAt: 0,
      // Trade system (PR 2): live-mode-only snapshots of the trade board,
      // this settlement's own offers, and its shipments — see
      // `refreshTradeAsync`. Always empty in demo mode; TradePanel.vue reads
      // `WorldModel`'s own demo trade offers directly there instead (there
      // are no shipments to show in demo mode at all — see
      // `WorldModel.acceptTradeOffer`'s doc comment).
      tradeBoard: [] as TradeOfferResponse[],
      myTradeOffers: [] as TradeOfferResponse[],
      shipments: [] as ShipmentResponse[],
      // Issue #40 phase 1: garrison (who's standing at this settlement) and
      // the training queue, fetched/refreshed the same way as buildings/
      // queue above. Always empty in demo mode — there is no local
      // WorldModel concept of trained units yet, only the live backend's.
      garrison: [] as UnitStackResponse[],
      trainingQueue: [] as TrainingOrderResponse[],
      trainingQueueFetchedAt: 0,
      /** Increments every syncHud tick (1s) — a cheap reactive dependency for countdown displays. */
      tick: 0,
    },
    // Issue #40 phase 2: armies belonging to the current settlement — an
    // `Army` record only exists once dispatched (it's folded back into the
    // settlement's plain `garrison` and deleted the moment it arrives home —
    // see `ArmyService.SettleAndFoldAsync`), so this list never contains a
    // "home garrison as an army" entry; it's home/in-transit/returning/
    // supporting dispatched bodies only. Always empty in demo mode, same as
    // `hud.garrison`/`hud.trainingQueue` above.
    armies: [] as ArmyResponse[],
    armiesFetchedAt: 0,
    // Issue #40 phase 4: guest (Support) armies currently stationed at this
    // settlement — the host's read-only view (`GET /settlements/{id}/guests`).
    // Refetched on the same tick as `armies` (see `refreshArmies` below)
    // rather than a third independent poll timer — guests change no more
    // often than the owner's own army list does. Always empty in demo mode.
    guestArmies: [] as GuestArmySummary[],
    guestArmiesFetchedAt: 0,
    // The army currently shown selected in ArmyPanel.vue — its live route is
    // drawn on the map (HexMapRenderer.setArmyOverlay) while selected. Not a
    // computed getter: selection persists across `refreshArmies` polls by id.
    selectedArmyId: null as string | null,
    // Waypoint-editing / dispatch-composition state — see `startDispatch`/
    // `addWaypoint`/`confirmDispatch`. `null` while no dispatch is being
    // composed; SettlementView threads this into SettlementCanvas's
    // onHexClick to switch it into "clicking adds a waypoint" mode instead
    // of opening the usual ring menu.
    dispatchDraft: null as {
      unitCounts: Record<string, number>;
      route: AxialCoord[];
      provisions: number;
      submitting: boolean;
      error: string | null;
      // Issue #40 phase 3: 'move' keeps phase 2's free-hex-destination
      // behaviour (last clicked hex = destination); 'attack' reuses the same
      // waypoint-editing route but every clicked hex is just a waypoint —
      // the backend always resolves an attack's real destination to
      // `targetSettlementId`'s own hex, never a clicked one (see
      // `buildAttackDispatchRequest`'s own comment). 'support' (issue #40
      // phase 4) is shaped identically to 'attack' — a target settlement plus
      // optional waypoints — see `buildSupportDispatchRequest`.
      mission: 'move' | 'attack' | 'support';
      targetSettlementId: string | null;
      // Issue #40 phase 5: the coordinate of a building within the target
      // settlement a Catapult-carrying Attack would prefer to hit — a
      // *preference*, not a guarantee (see `buildAttackDispatchRequest`'s own
      // comment). `null` means "no preference", the same as never having
      // picked one. Always `null` outside `mission: 'attack'` — a Move/Support
      // dispatch has no battle to apply it in (see `setDispatchMission`).
      targetBuildingCoord: { q: number; r: number } | null;
    } | null,
    // The target settlement's own placed buildings, fetched on demand once an
    // Attack dispatch's target is chosen (issue #40 phase 5) — this is what
    // the "preferred target building" picker in ArmyPanel.vue lists from.
    // `GET /api/v1/settlements/{id}` (`api.getSettlement`) carries no
    // ownership check, so it works for any settlement id, someone else's
    // included — see the PR notes for why this phase reuses it rather than
    // inventing a lighter endpoint. `dispatchTargetBuildingsFor` names which
    // settlement `dispatchTargetBuildings` actually belongs to, so a stale
    // fetch from a previously-picked target is never shown against a new one
    // while the new fetch is still in flight.
    dispatchTargetBuildings: null as PlacedBuildingResponse[] | null,
    dispatchTargetBuildingsFor: null as string | null,
    dispatchTargetBuildingsLoading: false,
    // Set when `loadDispatchTargetBuildings` fails (e.g. the settlement no
    // longer exists) — ArmyPanel falls back to "no preference" copy rather
    // than a picker when this is set.
    dispatchTargetBuildingsError: false,
    armyPollHandle: null as ReturnType<typeof setInterval> | null,
    syncHandle: null as ReturnType<typeof setInterval> | null,
    livePollHandle: null as ReturnType<typeof setInterval> | null,
    // Live-mode state: which backend world this session is playing in, and
    // the start positions a settlement may be founded on. Unused in demo
    // mode, where `WorldModel` is the entire source of truth.
    worldId: localStorage.getItem('bjarnoy.worldId'),
    // The founding/restoring browser's stable local id (`usePlayerStore().id`),
    // remembered here once known so `queueBuildLive`/`trainUnitsLive` can send
    // it as the `X-Owner-Id` header the backend's ownership check reads for an
    // anonymous (unclaimed) settlement — see SettlementOwnershipEndpointFilter
    // and docs/codebase-gap-analysis.md. Unused in demo mode.
    ownerId: null as string | null,
    islands: [] as IslandResponse[],
    liveReady: false,
    // Whether the world currently accepts a new player, and why not if it
    // doesn't (admin-only fields from issue #27: JoinsClosed, StartsAt) —
    // LandingView reads these to show a "not open yet" state instead of
    // letting the player attempt to found onto a world that will refuse it.
    worldJoinable: true,
    worldJoinableReason: 'None',
    worldStartsAt: null as string | null,
  }),
  actions: {
    /**
     * Connects to the real backend when the app isn't running in demo mode
     * (see `config.ts`): joins an existing running world or creates one, then
     * reseeds the local `WorldModel` from that world's seed so this client
     * renders the exact terrain the server has (`TerrainSampler` is a
     * bit-exact port of `worldGenerator.ts` — see docs/tech/backend.md).
     * A no-op in demo mode and idempotent once a world is joined.
     */
    async bootstrapLiveWorld() {
      if (DEMO_MODE || this.liveReady) return;

      let world = this.worldId ? await api.getWorld(this.worldId).catch(() => null) : null;
      // Worlds are shared and meant to be created by an admin, not by
      // whichever browser tab happens to land here first — so join whatever
      // exists rather than filtering by status. (There used to be a
      // `status === 'running'` filter here, but WorldResponse's `status`
      // never actually takes that value — see WorldEntity's WorldStatus —
      // so it silently matched nothing and fell through to a client-side
      // createWorld() call on every visit, racing every other tab that did
      // the same. That call has been removed entirely, not just the dead
      // filter: an anonymous client creating shared, costly-to-generate
      // world state was the underlying architectural issue, not just its
      // symptom — see docs/codebase-gap-analysis.md. `POST /worlds` itself
      // is still open to any caller today; closing that is a separate,
      // larger backend pass, called out in docs/tech/backend.md's "Not in
      // here yet" — this only removes the client's own contribution to the
      // race. A fresh deployment with no worlds yet is now reported the same
      // way as any other "can't join right now" state below, rather than
      // silently self-served.)
      if (!world) {
        world = await this.newestWorld();
      }
      if (!world) {
        this.worldJoinable = false;
        this.worldJoinableReason = 'NoWorldYet';
        return;
      }

      this.worldId = world.id;
      this.worldJoinable = world.joinable;
      this.worldJoinableReason = world.joinableReason;
      this.worldStartsAt = world.startsAt;
      localStorage.setItem('bjarnoy.worldId', world.id);
      this.model = markRaw(new WorldModel(world.seed));
      this.islands = await api.getIslands(world.id);
      // Island names/centres, as generated by the backend (see
      // `Bjarnoy.Domain.World.IslandNames`) — the renderer draws one label
      // per island at this position (world map only).
      this.model.setIslands(
        this.islands.map((island) => ({ id: island.id, name: island.name, q: island.q, r: island.r })),
      );
      this.model.setRiverTiles(
        this.islands.flatMap((island) =>
          island.riverTiles.map((tile) => ({
            q: tile.q,
            r: tile.r,
            shape: tile.shape,
            inDirections: tile.inDirections as TileOrientation[],
            outDirection: tile.outDirection as TileOrientation | null,
          })),
        ),
      );
      this.liveReady = true;
      // Every other player already in this shared world needs to be known
      // before the landing page picks a starting plot (nearestStartPosition
      // must avoid their homes) and drawn on screen (rival realms are part
      // of the world too, not just something the world map reveals later).
      await this.refreshWorldSettlements();
    },
    /** The most recently created world, or null if none exist yet. */
    async newestWorld() {
      const worlds = await api.listWorlds();
      // GetWorldsAsync orders by id (UUIDv7, so creation order) ascending.
      return worlds.length > 0 ? worlds[worlds.length - 1] : null;
    },
    /**
     * Nearest island start position to `near` that nobody has founded on (or
     * too close to) yet, for founding via the API.
     *
     * Start positions are precomputed once at world generation and never
     * shrink as players settle, so without this check every new player on a
     * shared world converges on the exact same nearest plot — which the
     * backend then refuses with `PlotTaken` (an exact match) or
     * `TooCloseToNeighbour` (see `SettlementService.MinimumSpacing`) once
     * it's taken, rather than the client ever finding out until it tries.
     */
    nearestStartPosition(near: AxialCoord): { islandId: string; at: AxialCoord } | null {
      const settlements = this.model.listSettlements();
      let best: { islandId: string; at: AxialCoord; distance: number } | null = null;
      for (const island of this.islands) {
        for (const pos of island.startPositions) {
          const tooCloseToExisting = settlements.some(
            (s) => hexDistance(pos, { q: s.q, r: s.r }) < MINIMUM_SETTLEMENT_SPACING,
          );
          if (tooCloseToExisting) continue;
          const distance = hexDistance(near, pos);
          if (!best || distance < best.distance) {
            best = { islandId: island.id, at: pos, distance };
          }
        }
      }
      return best;
    },
    /** Demo mode: found instantly in the local `WorldModel`, no server round trip. */
    foundStartingSettlement(ownerId: string, ownerName: string, name: string, near: AxialCoord) {
      const at = this.model.findLandfall(near) ?? near;
      const settlement = this.model.foundSettlement(ownerId, ownerName, name, at);
      this.selectedSettlementId = settlement.id;
      this.syncHud();
      return settlement;
    },
    /**
     * Live mode: the backend is the source of truth for the settlement's id
     * and starting stock. The result is mirrored into the local `WorldModel`
     * via `registerSettlement` so the renderer, HUD and settlement view work
     * exactly as they do in demo mode from this point on.
     *
     * `ownerId` is the stable local player id (see `stores/player.ts`), sent
     * to the backend so it can refuse a second settlement for the same
     * player in this world (one realm per player until ships/carts exist —
     * see `SettlementService.FoundAsync`). Throws `ApiError` (409) if this
     * player already has a settlement here.
     */
    async foundStartingSettlementLive(ownerId: string, ownerName: string, realmName: string, near: AxialCoord) {
      if (!this.worldId) throw new Error('bootstrapLiveWorld() must run before founding a settlement');
      this.ownerId = ownerId;
      // Bootstrap's own snapshot can be stale by the time the player
      // actually clicks — re-sync who else has founded here first so
      // nearestStartPosition doesn't send this request at a plot someone
      // else claimed in the meantime.
      await this.refreshWorldSettlements();
      const start = this.nearestStartPosition(near);
      if (!start) throw new Error('No unclaimed start positions in this world yet');

      const response = await api.foundSettlement(this.worldId, {
        islandId: start.islandId,
        q: start.at.q,
        r: start.at.r,
        name: realmName,
        ownerName,
        ownerId,
      });

      const settlement = this.model.registerSettlement({
        id: response.id,
        ownerId,
        ownerName: response.ownerName,
        name: response.name,
        q: response.q,
        r: response.r,
        level: response.longhouseLevel,
        resources: { ...response.resources.stock },
        rates: { ...response.resources.ratePerHour },
        foundedAt: Date.now(),
        islandId: response.islandId,
      });
      this.selectedSettlementId = settlement.id;
      this.syncHud();
      void this.refreshTradeAsync();
      return settlement;
    },
    /**
     * Live mode: queues a building against the backend rather than placing
     * it locally and instantly (`WorldModel.placeBuilding`). The building
     * only appears once its build order completes and the next poll
     * (`refreshLiveSettlement`) picks it up — matching how the backend's
     * build queue actually works (docs/tech/backend.md, "Everything is
     * lazy"). Throws `ApiError` on rejection (e.g. not enough resources, or
     * 403 if `this.ownerId` doesn't match the settlement's owner — see
     * SettlementOwnershipEndpointFilter); callers decide how to surface that.
     */
    async queueBuildLive(building: string, at: AxialCoord) {
      if (!this.selectedSettlementId) throw new Error('No settlement selected');
      await api.queueBuild(
        this.selectedSettlementId, { building, q: at.q, r: at.r }, this.ownerId ?? undefined,
      );
      await this.refreshLiveSettlement();
    },
    /**
     * Live mode: queues a training batch against the backend, charging its
     * cost immediately — mirrors `queueBuildLive` above, including the
     * ownership header. Throws `ApiError` on rejection (e.g. not enough
     * resources, longhouse too low, training queue full); callers decide how
     * to surface that.
     */
    async trainUnitsLive(unit: string, count: number) {
      if (!this.selectedSettlementId) throw new Error('No settlement selected');
      await api.trainUnits(this.selectedSettlementId, { unit, count }, this.ownerId ?? undefined);
      await this.refreshLiveSettlement();
    },
    /** Pulls the settlement's current resources/level/buildings/garrison/training queue from the backend. No-op in demo mode. */
    async refreshLiveSettlement() {
      if (DEMO_MODE || !this.selectedSettlementId) return;
      const response = await api.getSettlement(this.selectedSettlementId);
      this.model.applyServerSnapshot(response.id, {
        level: response.longhouseLevel,
        resources: { ...response.resources.stock },
        rates: { ...response.resources.ratePerHour },
        capacity: { ...response.resources.capacity },
        buildings: response.buildings,
        queue: response.queue,
      });
      this.hud.queue = response.queue;
      this.hud.queueFetchedAt = Date.now();
      this.hud.garrison = response.garrison;
      this.hud.trainingQueue = response.trainingQueue;
      this.hud.trainingQueueFetchedAt = Date.now();
      this.syncHud();
    },
    /**
     * Live mode: posts a trade offer at this settlement's longhouse.
     * Throws `ApiError` on rejection (e.g. `RatioExceeded`,
     * `NotEnoughResources`) — TradePanel.vue surfaces `err.problem?.rejection`.
     * A no-op in demo mode; TradePanel.vue calls `world.model.postTradeOffer`
     * directly there instead (see the file's other DEMO_MODE branches).
     */
    async postTradeOfferLive(
      offeredResource: string,
      offeredAmount: number,
      requestedResource: string,
      requestedAmount: number,
      guildOnly: boolean,
    ) {
      if (DEMO_MODE || !this.selectedSettlementId) return;
      await api.postTradeOffer(this.selectedSettlementId, {
        offeredResource,
        offeredAmount,
        requestedResource,
        requestedAmount,
        guildOnly,
      });
      await this.refreshTradeAsync();
    },
    /**
     * Live mode: accepts an open offer, dispatching both shipments
     * server-side. Throws `ApiError` on rejection (e.g. `OutOfRange`,
     * `GuildOnlyOffer`). A no-op in demo mode — see `postTradeOfferLive`.
     */
    async acceptTradeOfferLive(offerId: string) {
      if (DEMO_MODE || !this.selectedSettlementId) return;
      await api.acceptTradeOffer(offerId, { acceptorSettlementId: this.selectedSettlementId });
      await this.refreshTradeAsync();
      await this.refreshLiveSettlement();
    },
    /**
     * Live mode: withdraws one of this settlement's own open offers and
     * refunds its escrow. A no-op in demo mode — see `postTradeOfferLive`.
     */
    async cancelTradeOfferLive(offerId: string) {
      if (DEMO_MODE || !this.selectedSettlementId) return;
      await api.cancelTradeOffer(offerId, { settlementId: this.selectedSettlementId });
      await this.refreshTradeAsync();
      await this.refreshLiveSettlement();
    },
    /**
     * Live mode: pulls the trade board, this settlement's own offers, and
     * its shipments in one go, for TradePanel.vue. No-op in demo mode
     * (`hud.tradeBoard`/`myTradeOffers`/`shipments` stay empty there —
     * TradePanel.vue reads `WorldModel`'s demo trade offers directly).
     */
    async refreshTradeAsync() {
      if (DEMO_MODE || !this.selectedSettlementId) return;
      const [board, mine, shipments] = await Promise.all([
        api.getTradeBoard(this.selectedSettlementId),
        api.getMyTradeOffers(this.selectedSettlementId),
        api.getShipments(this.selectedSettlementId),
      ]);
      this.hud.tradeBoard = board;
      this.hud.myTradeOffers = mine;
      this.hud.shipments = shipments;

      // Issue #46 phase 3: mirror in-transit shipments into the WorldModel
      // so the world map can render a cart marker + ETA the same way it
      // already does for `Fleet`s — see `CartShipment`'s own doc comment
      // for why this is a full replace rather than a per-shipment add
      // (ShipmentResponse's own from/to Q/R are already frozen hex
      // coordinates — see ShipmentEntity — so no settlement-id lookup is
      // needed here).
      this.model.setCartShipments(
        shipments
          .filter((s) => !s.delivered)
          .map(
            (s): CartShipment => ({
              id: s.id,
              fromQ: s.fromQ,
              fromR: s.fromR,
              toQ: s.toQ,
              toR: s.toR,
              departedAt: new Date(s.departedAtGameTime).getTime(),
              etaAt: new Date(s.arrivesAtGameTime).getTime(),
              cargoResource: s.cargoResource as ResourceKind,
              cargoAmount: s.cargoAmount,
            }),
          ),
      );
    },
    /**
     * Live mode: rehydrates `selectedSettlementId`/`WorldModel` after a page
     * reload, using the settlement id `stores/player.ts` persisted. Without
     * this, `hasFoundedSettlement` (and thus the router's `/settlement`
     * guard) surviving a reload while the `WorldModel` itself starts empty
     * would strand the player on a blank settlement view. A no-op if this
     * settlement is already loaded, and in demo mode (nothing is persisted
     * there — see `stores/player.ts`).
     */
    async restoreLiveSettlement(ownerId: string, settlementId: string) {
      if (DEMO_MODE || this.selectedSettlementId === settlementId) return;
      this.ownerId = ownerId;
      await this.bootstrapLiveWorld();
      const response = await api.getSettlement(settlementId);
      this.model.registerSettlement({
        id: response.id,
        ownerId,
        ownerName: response.ownerName,
        name: response.name,
        q: response.q,
        r: response.r,
        level: response.longhouseLevel,
        resources: { ...response.resources.stock },
        rates: { ...response.resources.ratePerHour },
        foundedAt: Date.now(),
        islandId: response.islandId,
      });
      this.selectedSettlementId = response.id;
      this.syncHud();
      void this.refreshTradeAsync();
    },
    /**
     * Live mode: pulls every settlement in the world (not just this
     * player's) so rival realms — their border, marker and owner-name label
     * — show up on the world map, matching `prototypes/worldmap`'s `marks`.
     * Registered with the settlement's own id as its `ownerId`, which can
     * never equal the local player's id, so it always renders as a rival.
     */
    async refreshWorldSettlements() {
      if (DEMO_MODE || !this.worldId) return;
      const summaries = await api.listSettlements(this.worldId);
      for (const summary of summaries) {
        if (summary.id === this.selectedSettlementId) continue;
        this.model.registerSettlement({
          id: summary.id,
          ownerId: summary.id,
          ownerName: summary.ownerName,
          name: summary.name,
          q: summary.q,
          r: summary.r,
          level: summary.longhouseLevel,
          resources: emptyResources(),
          rates: emptyResources(),
          foundedAt: Date.now(),
        });
      }
    },
    /**
     * Pulls this settlement's armies (and, issue #40 phase 4, the guest
     * armies currently supporting it) from the backend in the same tick — one
     * poll interval (`ARMY_POLL_MS`) covers both rather than a third
     * independent timer, since guests change no more often than the owner's
     * own army list does. No-op in demo mode. See `armies`'s own comment for
     * why home garrison never appears here.
     */
    async refreshArmies() {
      if (DEMO_MODE || !this.selectedSettlementId) return;
      const [summaries, guests] = await Promise.all([
        api.getSettlementArmies(this.selectedSettlementId),
        api.getSettlementGuests(this.selectedSettlementId),
      ]);
      // ArmySummary (the list endpoint) omits unit composition/movement/
      // provisions — ArmyPanel needs those, so fetch each army's full detail.
      // Settlements realistically hold a handful of dispatched armies at
      // once, so N+1 here is a non-issue compared to a purpose-built bulk
      // endpoint the backend doesn't expose.
      this.armies = await Promise.all(summaries.map((s) => api.getArmy(s.id)));
      this.armiesFetchedAt = Date.now();
      this.guestArmies = guests;
      this.guestArmiesFetchedAt = Date.now();
      // An army that arrived home (and was folded back/deleted — see the
      // `armies` state comment) simply stops appearing in the list; drop a
      // selection that's no longer valid rather than leaving the map overlay
      // pointed at a route that no longer exists.
      if (this.selectedArmyId && !this.armies.some((a) => a.id === this.selectedArmyId)) {
        this.selectedArmyId = null;
      }
    },
    selectArmy(armyId: string) {
      this.selectedArmyId = armyId;
    },
    clearSelectedArmy() {
      this.selectedArmyId = null;
    },
    /** Live mode: recalls an in-transit army, then refreshes so its turned-around state shows immediately. Throws `ApiError` on rejection (e.g. it's already heading home). */
    async recallArmyLive(armyId: string) {
      await api.recallArmy(armyId, this.ownerId ?? undefined);
      await this.refreshArmies();
    },
    /** Enters waypoint-editing mode for a fresh dispatch from the current settlement's garrison. */
    startDispatch() {
      this.dispatchDraft = {
        unitCounts: {},
        route: [],
        provisions: 0,
        submitting: false,
        error: null,
        mission: 'move',
        targetSettlementId: null,
        targetBuildingCoord: null,
      };
      this.dispatchTargetBuildings = null;
      this.dispatchTargetBuildingsFor = null;
      this.dispatchTargetBuildingsError = false;
    },
    cancelDispatch() {
      this.dispatchDraft = null;
    },
    /** Switching mission clears the plotted route/target — a move destination and an attack's/support's waypoint-only route aren't interchangeable, and a stale target settlement from a previous draft shouldn't silently carry over. */
    setDispatchMission(mission: 'move' | 'attack' | 'support') {
      if (!this.dispatchDraft) return;
      this.dispatchDraft.mission = mission;
      this.dispatchDraft.route = [];
      this.dispatchDraft.targetSettlementId = null;
      this.dispatchDraft.targetBuildingCoord = null;
      this.dispatchDraft.error = null;
    },
    setDispatchTarget(settlementId: string | null) {
      if (!this.dispatchDraft) return;
      this.dispatchDraft.targetSettlementId = settlementId;
      // A previously-picked building preference belonged to whichever target
      // was selected before — it doesn't carry over to a new (or cleared)
      // target's layout.
      this.dispatchDraft.targetBuildingCoord = null;
      if (settlementId && this.dispatchDraft.mission === 'attack') {
        void this.loadDispatchTargetBuildings(settlementId);
      } else {
        this.dispatchTargetBuildings = null;
        this.dispatchTargetBuildingsFor = null;
        this.dispatchTargetBuildingsError = false;
      }
    },
    setDispatchTargetBuilding(coord: { q: number; r: number } | null) {
      if (!this.dispatchDraft) return;
      this.dispatchDraft.targetBuildingCoord = coord;
    },
    /**
     * Fetches the target settlement's placed buildings for the "preferred
     * target building" picker (issue #40 phase 5) — see
     * `dispatchTargetBuildings`'s own comment on why `api.getSettlement`
     * works here even though `settlementId` is someone else's settlement.
     * Swallows a failure into `dispatchTargetBuildingsError` rather than
     * surfacing it as a dispatch-blocking error: the picker is a nice-to-have
     * preference, not a requirement to dispatch (the backend's own fallback
     * is a random pick), so ArmyPanel just falls back to "no preference"
     * copy when this can't be loaded.
     */
    async loadDispatchTargetBuildings(settlementId: string) {
      this.dispatchTargetBuildingsLoading = true;
      this.dispatchTargetBuildingsError = false;
      try {
        const response = await api.getSettlement(settlementId);
        this.dispatchTargetBuildings = response.buildings;
        this.dispatchTargetBuildingsFor = settlementId;
      } catch {
        this.dispatchTargetBuildings = null;
        this.dispatchTargetBuildingsFor = null;
        this.dispatchTargetBuildingsError = true;
      } finally {
        this.dispatchTargetBuildingsLoading = false;
      }
    },
    /**
     * Every settlement this player could send an Attack at — every
     * settlement `refreshWorldSettlements` has registered into the local
     * `WorldModel` (issue #40 phase 2's rival-realms feed), minus this
     * player's own. Not a Pinia getter: `model` is `markRaw` (see the state
     * comment on it), so nothing here is reactively tracked — callers that
     * want this list to stay live across a poll should recompute it
     * themselves off a reactive dependency they already have (e.g.
     * `hud.tick`), the same trade-off `TopBar.vue`'s `islandName` already
     * accepts for reading the model directly.
     */
    listAttackableSettlements() {
      return this.model
        .listSettlements()
        .filter((s) => s.id !== this.selectedSettlementId)
        .map((s) => ({ id: s.id, name: s.name, ownerName: s.ownerName, q: s.q, r: s.r }));
    },
    setDispatchUnitCount(unit: string, count: number) {
      if (!this.dispatchDraft) return;
      this.dispatchDraft.unitCounts[unit] = Math.max(0, Math.floor(count));
    },
    setDispatchProvisions(provisions: number) {
      if (!this.dispatchDraft) return;
      this.dispatchDraft.provisions = Math.max(0, provisions);
    },
    /** Clicking a hex on the map while a dispatch is being composed appends it as the next waypoint (the last click is always the eventual destination). */
    addWaypoint(coord: AxialCoord) {
      if (!this.dispatchDraft) return;
      this.dispatchDraft.route.push(coord);
    },
    removeLastWaypoint() {
      if (!this.dispatchDraft) return;
      this.dispatchDraft.route.pop();
    },
    clearWaypoints() {
      if (!this.dispatchDraft) return;
      this.dispatchDraft.route = [];
    },
    /**
     * Sends the composed draft to the backend as a `move`, `attack`, or
     * `support` dispatch (issue #40 phase 3 added Attack, phase 4 Support).
     * Leaves the draft in place (with `error` set) on rejection so the player
     * can adjust and retry rather than losing their unit/waypoint/target
     * selection; clears it and refreshes the army list on success.
     */
    async confirmDispatch() {
      const draft = this.dispatchDraft;
      if (!draft || !this.selectedSettlementId) return;
      const request =
        draft.mission === 'attack'
          ? buildAttackDispatchRequest(
              draft.unitCounts,
              draft.route,
              draft.provisions,
              draft.targetSettlementId,
              draft.targetBuildingCoord,
            )
          : draft.mission === 'support'
            ? buildSupportDispatchRequest(draft.unitCounts, draft.route, draft.provisions, draft.targetSettlementId)
            : buildMoveDispatchRequest(draft.unitCounts, draft.route, draft.provisions);
      if (!request) {
        if (Object.values(draft.unitCounts).every((c) => c <= 0)) {
          draft.error = 'Select at least one unit to send.';
        } else if (draft.mission === 'move' && draft.route.length === 0) {
          draft.error = 'Click the map to set a destination first.';
        } else if ((draft.mission === 'attack' || draft.mission === 'support') && !draft.targetSettlementId) {
          draft.error = `Choose a settlement to ${draft.mission} first.`;
        } else {
          draft.error = 'Select at least one unit to send.';
        }
        return;
      }
      draft.submitting = true;
      draft.error = null;
      try {
        await api.dispatchArmy(this.selectedSettlementId, request, this.ownerId ?? undefined);
        this.dispatchDraft = null;
        this.dispatchTargetBuildings = null;
        this.dispatchTargetBuildingsFor = null;
        this.dispatchTargetBuildingsError = false;
        await this.refreshArmies();
        await this.refreshLiveSettlement(); // garrison shrank by the dispatched units
      } catch (err) {
        // Mirrors TrainingModal's ApiError.problem.detail convention —
        // DispatchRejection has no `rejection` wire property either (same as
        // TrainRejection), just a human-readable Detail (ArmyEndpoints.Problem).
        draft.error = err instanceof ApiError ? (err.problem?.detail ?? err.message) : 'Dispatch failed.';
      } finally {
        draft.submitting = false;
      }
    },
    syncHud() {
      const settlement = this.selectedSettlementId
        ? this.model.getSettlement(this.selectedSettlementId)
        : undefined;
      if (!settlement) return;
      this.hud.resources = { ...settlement.resources };
      this.hud.rates = { ...settlement.rates };
      this.hud.storageCap = this.model.storageCapFor(settlement.id);
      this.hud.settlementName = settlement.name;
      this.hud.level = settlement.level;
      this.hud.buildingsPlaced = this.model.countBuildings(settlement.id);
      this.hud.population = this.model.populationFor(settlement.id);
      this.hud.tick += 1;
    },
    startHudSync() {
      this.stopHudSync();
      this.syncHud();
      this.syncHandle = setInterval(() => this.syncHud(), 1000);
      if (!DEMO_MODE) {
        void this.refreshLiveSettlement();
        void this.refreshWorldSettlements();
        void this.refreshTradeAsync();
        void this.refreshArmies();
        this.livePollHandle = setInterval(() => {
          void this.refreshLiveSettlement();
          void this.refreshWorldSettlements();
          void this.refreshTradeAsync();
        }, LIVE_POLL_MS);
        // Separate, tighter interval than LIVE_POLL_MS — see ARMY_POLL_MS's
        // own comment for why armies need to be polled more often than
        // buildings/queues.
        this.armyPollHandle = setInterval(() => void this.refreshArmies(), ARMY_POLL_MS);
      }
    },
    stopHudSync() {
      if (this.syncHandle) clearInterval(this.syncHandle);
      this.syncHandle = null;
      if (this.livePollHandle) clearInterval(this.livePollHandle);
      this.livePollHandle = null;
      if (this.armyPollHandle) clearInterval(this.armyPollHandle);
      this.armyPollHandle = null;
    },
  },
});
