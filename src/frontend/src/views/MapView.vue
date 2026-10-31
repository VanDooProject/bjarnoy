<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { buildingName, campName, giantName, terrainName } from '../i18n/catalogueNames';
import { useRoute, useRouter } from 'vue-router';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import MapStatusOverlay from '../components/map/MapStatusOverlay.vue';
import { useLoadFlow } from '../composables/useLoadFlow';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import ResourceBar from '../components/hud/ResourceBar.vue';
import MobileHudDrawer from '../components/hud/MobileHudDrawer.vue';
import BuildQueuePanel from '../components/hud/BuildQueuePanel.vue';
import ExpansionPanel from '../components/hud/ExpansionPanel.vue';
import QuestTray from '../components/onboarding/QuestTray.vue';
import TrainingQueuePanel from '../components/hud/TrainingQueuePanel.vue';
import QueueDrawer from '../components/hud/QueueDrawer.vue';
import ArmyPanel from '../components/hud/ArmyPanel.vue';
import HexTooltip from '../components/hud/HexTooltip.vue';
import BuildingModal from '../components/hud/BuildingModal.vue';
import TrainingModal from '../components/hud/TrainingModal.vue';
import BuildRefusalChip from '../components/hud/BuildRefusalChip.vue';
import { announceConfirmedBuild, holdBuildRow, releaseBuildRow } from '../composables/buildFeedback';
import RingMenuHost from '../components/hud/RingMenuHost.vue';
import RingMenu, { type RingAction, type RingCategory, type RingInfo } from '../components/hud/RingMenu.vue';
import FogDebugPanel from '../components/hud/FogDebugPanel.vue';
import FogPerfPanel from '../components/hud/FogPerfPanel.vue';
import FpsMeter from '../components/hud/FpsMeter.vue';
import WaterDebugPanel from '../components/hud/WaterDebugPanel.vue';
import WaterPerfPanel from '../components/hud/WaterPerfPanel.vue';
import ZoomDebugPanel from '../components/hud/ZoomDebugPanel.vue';
import { useWorldStore } from '../stores/world';
import { apiErrorMessage } from '../i18n/apiErrors';
import { usePlayerStore } from '../stores/player';
import { useGuildStore } from '../stores/guild';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { useBuildRing, type BuildableType } from '../composables/useBuildRing';
import { DEMO_MODE } from '../config';
import { useFogDebug } from '../composables/useFogDebug';
import { useMediaQuery } from '../composables/useMediaQuery';
import { hudBarHeightPx, hudRailWidthPx } from '../composables/hudBarHeight';
import { isHudRail } from '../composables/hudSettlementBubbleState';
import { HUD_COMPACT_QUERY } from '../lib/breakpoints';
import { useHudPrefsStore } from '../stores/hudPrefs';
import { closeHudDrawer, isHudDrawerOpen } from '../composables/hudDrawerOpenState';
import { useIsMobile } from '../composables/useIsMobile';
import { parseKey, type AxialCoord } from '../lib/hex/coords';
import { constructionDialsFromQueue } from '../lib/map/constructionDial';
import { buildingArt } from '../lib/map/buildingArt';
import { buildingStatsAt, buildingUpgradeCost } from '../lib/map/buildingEconomy';
import { formatBuildTime, formatMissingResources, longhouseLock } from '../lib/map/ringCatalogue';
import { boundsClearOfDock, ringDockFor } from '../lib/map/ringDock';
import { ringShapes } from '../lib/map/ringLayout';
import { placeRing, type RingPlacement } from '../lib/map/ringPlacement';
import type { Tile } from '../lib/map/types';
import type { ArmyOverlayData, ArmyOverlayMarker, HoverInfo, RenderMode } from '../lib/map/HexMapRenderer';
import { campHexBuildable } from '../lib/map/campRules';
import { isHostileWallTile, siegeAttackOptions } from '../lib/map/siegeRules';
import { breachesWalls, classifyUnitSelection, totalSpeed, totalUpkeepPerHour, trainingSite } from '../lib/units/armyDispatch';
import { reachableRange } from '../lib/map/hexPath';
import { gamePathContext } from '../lib/map/movementContext';
import { routeProgressAt } from '../lib/units/armyProgress';
import MobileDispatchSheet from '../components/hud/MobileDispatchSheet.vue';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const world = useWorldStore();
const player = usePlayerStore();
const hudPrefs = useHudPrefsStore();

// Mobile-only HUD bar: whether the collapsed bar (and its pull-down drawer)
// is actually docked at the bottom edge right now — desktop and the default
// 'top' preference both keep the bar (and every offset below) exactly where
// it's always been. The bar's own height isn't always 64px on mobile
// anymore (it grows once the drawer is open — see ResourceBar.vue's
// isExpanded), so this reads the real, currently-measured height
// (TopBar.vue's own ResizeObserver) rather than assuming a fixed number.
const isCompactHud = useMediaQuery(HUD_COMPACT_QUERY);
// Landscape rail mode ignores the docking preference (the rail has no edge to
// dock to) and writes a 0 top band: `--hud-inset-left` carries the rail's
// width instead, for the overlays that must not sit under it.
const hudBarAtBottom = computed(() => isCompactHud.value && !isHudRail.value && hudPrefs.barPosition === 'bottom');
const hudInsetLeftPx = computed(() => (isHudRail.value ? hudRailWidthPx.value + 8 : 0));
const hudInsetTopPx = computed(() => (hudBarAtBottom.value ? 0 : hudBarHeightPx.value));
const hudInsetBottomPx = computed(() => (hudBarAtBottom.value ? hudBarHeightPx.value : 0));
const unitCatalogue = useUnitCatalogueStore();
const guild = useGuildStore();
const buildingCatalogue = useBuildingCatalogueStore();
const route = useRoute();
const router = useRouter();

// One view/one persistent renderer serves both /world and /settlement now
// (docs/design/zoom-transition.md §5, option (a)) — the zoom-driven
// transition needs the same HexMapRenderer instance to survive the switch
// (no teardown/flash, fog persists uninterrupted), which two independently-
// mounted views/renderers per route could never give it. `mode` is derived
// from the route rather than tracked as separate local state, so a nav-button
// click, browser back/forward, or a direct URL load all agree with the
// renderer on what to show.
const mode = computed<RenderMode>(() => (route.name === 'world' ? 'world' : 'settlement'));
// World map's own sea backdrop (must match WorldMapCanvas.vue's — that
// component is still used standalone by AdminWorldReseedView's world
// preview, which has no settlement/ring-menu UI to merge and so keeps its
// own separate renderer instance).
const WORLD_SEA_BACKGROUND = 'radial-gradient(115% 100% at 45% 40%, #2a92ae 0%, #14657f 48%, #0b3c50 100%)';
// Set right before a zoom-driven crossing pushes the route, and consumed by
// the very next `mode` watcher run — distinguishes "the renderer already
// switched mode itself, mid-gesture, camera untouched" from every other way
// `mode` can change (nav button, back/forward, direct load), which still
// need the camera re-homed onto the destination the way separate per-route
// renderers always did (see the watcher below).
let zoomDrivenTransition = false;
function onZoomModeChange(next: RenderMode) {
  zoomDrivenTransition = true;
  router.push(next === 'settlement' ? '/settlement' : '/world');
}

// ?debug=1 surfaces FogDebugPanel — same idea as window.__fogDebug (main.ts)
// but clickable, and not gated to demo mode: these are pure client-side
// rendering toggles, nothing about game state. See useFogDebug for why this
// is a shared composable rather than a local computed().
const showFogDebug = useFogDebug();
const isMobile = useIsMobile();
const queueDrawerOpen = ref(false);
const canvasRef = ref<InstanceType<typeof SettlementCanvas> | null>(null);
function onFogDebugChange() {
  canvasRef.value?.renderer?.forceRebuild();
}

// Issue #16 "status box": "clicking a building in queue should center and
// highlight (some flashes) the tile" — panTo recentres the camera on it,
// and highlightCoord (already a pulsing gold outline HexMapRenderer draws
// every tick — see drawHighlight) is set for a few seconds to read as a
// flash rather than a permanent marker.
let flashTimeout: ReturnType<typeof setTimeout> | null = null;
function onQueueSelect(coord: { q: number; r: number }) {
  const renderer = canvasRef.value?.renderer;
  if (!renderer) return;
  renderer.panTo(coord);
  renderer.setHighlight(coord);
  if (flashTimeout) clearTimeout(flashTimeout);
  flashTimeout = setTimeout(() => {
    renderer.setHighlight(undefined);
    flashTimeout = null;
  }, 2200);
}

// QueueDrawer's Armies section (issue: mobile army dispatch): a row tap
// selects the army (drawing its route, same as ArmyPanel's own row click)
// and pans/flashes the map on its *live interpolated* position — the same
// leg math armyOverlayData/HexMapRenderer already use (issue #94's
// routeProgressAt), rather than the last hex it happened to reach, so a
// march mid-leg doesn't flash a spot behind where the marker is drawn.
function onArmySelect(armyId: string) {
  world.selectArmy(armyId);
  const army = world.armies.find((a) => a.id === armyId);
  if (!army) return;
  let coord: { q: number; r: number } = army.position;
  if (army.movement) {
    const { path, cumulativeHours, departedAt, arrivesAt, isReturning, returnPath, returnCumulativeHours, turnAroundAt, returnArrivesAt } =
      army.movement;
    const progress = isReturning
      ? routeProgressAt(returnPath, returnCumulativeHours, Date.parse(turnAroundAt), Date.parse(returnArrivesAt), Date.now())
      : routeProgressAt(path, cumulativeHours, Date.parse(departedAt), Date.parse(arrivesAt), Date.now());
    if (progress) coord = progress.arrived || progress.t >= 0.5 ? progress.to : progress.from;
  }
  onQueueSelect(coord);
}

// What the map view is waiting on, shown by MapStatusOverlay — a failed
// settlement restore used to be an unhandled rejection with the page fogged
// forever. Only the REST restore can fail here; the rest of mount is
// fire-and-forget and runs regardless (see onMounted).
const {
  step: loadStep,
  error: loadError,
  run: loadSettlement,
} = useLoadFlow(async (setStep) => {
  if (!DEMO_MODE && player.hasFoundedSettlement && player.settlementId) {
    setStep(t('hud.mapStatus.loadingSettlement'));
    await world.restoreLiveSettlement(player.id, player.settlementId);
  }
});

// The renderer only draws fog once the settlement exists (HexMapRenderer's
// isFogActive — in world mode too, since it needs a settlement of the local
// player), and keeps the fog quads on an opaque placeholder until the mask
// arrives. So wait for it exactly when a settlement is selected — demo and
// live both fill fogMaskBitmap (refreshDemoFogMask / fetchFogMask).
const revealingMap = computed(
  () =>
    !loadStep.value &&
    !loadError.value &&
    !!world.selectedSettlementId &&
    world.fogMaskBitmap === null &&
    !world.fogMaskError,
);
const overlayStep = computed(() => loadStep.value ?? (revealingMap.value ? t('hud.mapStatus.revealingMap') : null));
// A first fog mask fetch that fails leaves nothing to draw; later failures
// keep the previous bitmap and only reach the connection banner.
const overlayError = computed(
  () => loadError.value ?? (world.selectedSettlementId && world.fogMaskBitmap === null ? world.fogMaskError : null),
);
function retryLoad() {
  if (loadError.value) {
    void loadSettlement().then(() => {
      // The poll timers were started before this succeeded — restart them so
      // everything a failed first pass could not have pulled gets fetched.
      if (!loadError.value) world.startHudSync();
    });
  } else {
    void world.fetchFogMask();
  }
}

onMounted(async () => {
  // A direct load of either route (reload, deep link) arrives here with no
  // guarantee anything else has bootstrapped the world yet — restoreLiveSettlement
  // bootstraps internally (see its own remarks), so this covers both routes'
  // old per-view bootstrap without needing two copies of it.
  world.setWorldMapActive(mode.value === 'world');
  await loadSettlement();
  world.startHudSync();
  void unitCatalogue.load();
  buildingCatalogue.load();
  void world.refreshWorldSettlements();
  if (world.worldId) void guild.loadFriends(world.worldId);

  // Same test/debug-hook idea as main.ts's __demoWorld: lets an e2e test
  // convert a real hex coordinate to an exact click point via the
  // renderer's own camera math (HexMapRenderer.hexCenterScreen), instead of
  // guessing pixel offsets that only happen to land right at one particular
  // zoom/camera framing. Exposed regardless of which of the two routes
  // reached this view first — WorldMapView never exposed it, which meant an
  // e2e test could only resolve click points while already on /settlement.
  // Installed in live mode too: it is a read-only camera-math accessor (see
  // LandingView's identical hook), and the live Aspire dispatch test needs it
  // to click a known hex instead of guessing pixel offsets.
  (window as unknown as { __settlementRenderer?: () => unknown }).__settlementRenderer = () =>
    canvasRef.value?.renderer;
});
onUnmounted(() => {
  // Only fires once, when the player leaves the map entirely (e.g. to
  // /reports) — /world <-> /settlement no longer unmounts this view.
  world.stopHudSync();
  world.setWorldMapActive(false);
  delete (window as unknown as { __settlementRenderer?: () => unknown }).__settlementRenderer;
});

// Reconciles the renderer and the store's territory-claiming scope
// (worldMapActive; see refreshWorldSettlements) with `mode` on every change —
// not just the initial mount, since this view's own onMounted no longer
// re-runs per route the way two separate views' did.
watch(mode, (m) => {
  // The ring renders in both modes now, so one left open would otherwise
  // survive the switch, anchored to a hex in the other mode's framing.
  closeRing();
  world.setWorldMapActive(m === 'world');
  void world.refreshWorldSettlements();
  const renderer = canvasRef.value?.renderer;
  if (!renderer) return;
  // A no-op if the zoom-driven handler already flipped it (setMode is
  // idempotent on an unchanged mode) — this exists for every *other* way
  // `mode` can change: nav button, browser back/forward, a direct URL load.
  renderer.setMode(m);
  // Those other ways have no continuous gesture to preserve, so re-home the
  // camera onto the settlement's own framing exactly like a fresh per-route
  // mount always did — but only when this wasn't the zoom gesture that just
  // did the opposite on purpose (see zoomDrivenTransition's own comment).
  if (m === 'settlement' && !zoomDrivenTransition) renderer.focusSettlementCamera();
  zoomDrivenTransition = false;
});

// Fog v2 (map-fog-v2.md §3): pushes a freshly fetched mask bitmap into the
// renderer — same "watch both together" reasoning the army-overlay watcher
// below uses, since the renderer may not exist yet on the tick a fetch
// resolves.
watch(
  [() => canvasRef.value?.renderer, () => world.fogMaskBitmap, () => world.fogMaskBounds],
  ([renderer, bitmap, bounds]) => {
    if (renderer && bitmap && bounds) renderer.setFogMask(bounds, bitmap);
  },
);

// Fog chunks are fetched for the ground the camera actually sees (§3): the
// renderer reports which chunks that is as it pans/zooms, the store debounces
// and refetches only once the view leaves the window it already holds.
watch(
  () => canvasRef.value?.renderer,
  (renderer) => renderer?.setFogViewportListener((range) => world.requestFogViewport(range)),
  { immediate: true },
);

// Issue #40 phase 2: pushes armies/route/draft-waypoints into the renderer's
// own overlay layer (HexMapRenderer.setArmyOverlay) whenever any of them
// change, or as soon as the renderer itself becomes available — watching
// both together (rather than assuming the renderer is already mounted the
// first time this fires) covers the ordering race between the canvas
// mounting and this store data arriving.
const armyOverlayData = computed<ArmyOverlayData>(() => {
  const armies: ArmyOverlayMarker[] = world.armies.map((a) => ({
    id: a.id,
    position: a.position,
    selected: a.id === world.selectedArmyId,
    returning: !!a.movement?.isReturning,
    // docs/design/ship-movement.md §4: ship marker for a fleet, flag for a
    // land army — reuses the same classification dispatch already relies on
    // to keep the two unit-class families from mixing in one army.
    isFleet:
      classifyUnitSelection(
        Object.fromEntries(a.stacks.map((s) => [s.unit, s.count])),
        unitCatalogue.byType,
      ) === 'fleet',
    // Issue #94: hand the renderer the whole frozen leg, not a position —
    // it interpolates along it every frame (see HexMapRenderer's
    // `resolveArmyPoint`). An `atHome`/`supporting` army has no movement at
    // all and keeps sitting on its authoritative hex. `movement.path` is
    // always the *active* leg, outbound or return (the backend rebuilds
    // Movement on turn-around — see Movement.cs's own remarks), so there's
    // no leg-picking to do here.
    movement: a.movement
      ? {
          path: a.movement.path.map((p) => ({ q: p.q, r: p.r })),
          cumulativeHours: a.movement.cumulativeHours ?? [],
          departedAtMs: Date.parse(a.movement.departedAt),
          arrivesAtMs: Date.parse(a.movement.arrivesAt),
        }
      : undefined,
  }));
  const selected = world.armies.find((a) => a.id === world.selectedArmyId);
  const route = selected?.movement
    ? selected.movement.isReturning
      ? selected.movement.returnPath
      : selected.movement.path
    : [];
  const draftWaypoints = world.dispatchDraft?.route ?? world.fieldOrderDraft?.route ?? [];
  // Odin's Ravens widen the live vision of this settlement's travelling armies.
  const visionBonusRings = world.selectedSettlementId ? world.model.ravensRingsFor(world.selectedSettlementId) : 0;
  return { armies, route, draftWaypoints, targets: overlayTargets(selected), visionBonusRings };
});

// Issue #93 "attack/raid target indicator": the settlement an attack/support
// is aimed at, marked on its own hex. Two sources, deliberately both: the
// dispatch being composed right now (the player picked it from a text list
// and otherwise gets no confirmation of *where* it is), and the selected
// in-transit army's target (so a march already under way still shows what
// it's marching at). A settlement the local WorldModel doesn't know yet
// (`refreshWorldSettlements` hasn't registered it) simply isn't marked.
function overlayTargets(selectedArmy: (typeof world.armies)[number] | undefined) {
  const targets: NonNullable<ArmyOverlayData['targets']> = [];
  const add = (settlementId: string | null | undefined, mission: string) => {
    if (!settlementId || (mission !== 'attack' && mission !== 'support' && mission !== 'raid')) return;
    const settlement = world.model.getSettlement(settlementId);
    if (!settlement) return;
    // Raids are attacks as far as the map is concerned — the marker says
    // "someone is coming for this place", not which flavour of order it is.
    const kind = mission === 'support' ? 'support' : 'attack';
    if (targets.some((t) => t.coord.q === settlement.q && t.coord.r === settlement.r && t.kind === kind)) return;
    targets.push({ coord: { q: settlement.q, r: settlement.r }, kind });
  };
  // A hunt has no target settlement: its marker (the attack icon) sits on the camp's own hex.
  const addCamp = (coord: AxialCoord | undefined) => {
    if (!coord || targets.some((t) => t.coord.q === coord.q && t.coord.r === coord.r && t.kind === 'attack')) return;
    targets.push({ coord: { q: coord.q, r: coord.r }, kind: 'attack' });
  };
  const draft = world.dispatchDraft;
  if (draft) {
    add(draft.targetSettlementId, draft.mission);
    if (draft.mission === 'hunt') addCamp(draft.targetCamp ?? undefined);
  }
  if (selectedArmy && !selectedArmy.movement?.isReturning) {
    add(selectedArmy.targetSettlementId, selectedArmy.mission);
    if (selectedArmy.mission === 'hunt') addCamp(selectedArmy.movement?.path[selectedArmy.movement.path.length - 1]);
  }
  return targets;
}
watch(
  [() => canvasRef.value?.renderer, armyOverlayData],
  ([renderer, data]) => {
    renderer?.setArmyOverlay(data ?? null);
  },
  { immediate: true },
);

// Issue #159 part B: the reachable-range tint while composing a dispatch.
// Origin and home are both the hex a land army leaves from (the building that
// trained its slowest unit, see trainingSite) — a fleet keeps the settlement's
// hex. A field order from a standing army is #156 phase 1, not built yet.
// Rounded to the nearest tenth of an hour so a sub-pixel provisions-slider
// twitch doesn't force a fresh flood-fill every frame.
const rangeOverlayHexes = computed<AxialCoord[] | null>(() => {
  const draft = world.dispatchDraft;
  if (!draft || draft.mission !== 'move') return null;
  if (!world.selectedSettlementId) return null;

  const home = world.model.getSettlement(world.selectedSettlementId);
  if (!home) return null;

  const speed = totalSpeed(draft.unitCounts, unitCatalogue.byType);
  const upkeep = totalUpkeepPerHour(draft.unitCounts, unitCatalogue.byType);
  if (speed <= 0 || upkeep <= 0 || draft.provisions <= 0) return null;

  const hoursOfFood = draft.provisions / upkeep;
  // The same rules HexPathfinder.cs paths a dispatch with: wide rivers and mountains stop the army, a stream costs a flat 9.
  const ctx = gamePathContext(
    world.model,
    { land: world.movementRules.land, riverCrossingCost: world.movementRules.riverCrossingCost },
    speed * world.worldSpeedFactor,
    // Walls stop every army but a gate lets its owner's through, and the owner's friends': the owner is the player who holds the
    // selected settlement, the friends their guild and the guilds at peace with it.
    home.ownerId,
    guild.friendlyUserIds,
  );
  const origin =
    classifyUnitSelection(draft.unitCounts, unitCatalogue.byType) === 'fleet'
      ? { q: home.q, r: home.r }
      : trainingSite({ q: home.q, r: home.r }, world.hud.buildings, draft.unitCounts, unitCatalogue.byType);
  const range = reachableRange(origin, origin, hoursOfFood, ctx);
  return [...range.keys()].map(parseKey);
});

watch(
  [() => canvasRef.value?.renderer, rangeOverlayHexes],
  ([renderer, hexes]) => {
    renderer?.setRangeOverlay(hexes ?? null);
  },
  { immediate: true },
);

// Construction progress dials over buildings still being built; the renderer
// animates the progress itself every tick from these absolute timestamps.
watch(
  [() => canvasRef.value?.renderer, () => world.hud.queue, () => world.hud.queueFetchedAt],
  ([renderer]) => {
    renderer?.setConstructionDials(constructionDialsFromQueue(world.hud.queue, world.hud.queueFetchedAt));
  },
  { immediate: true },
);

// Live mode: `refreshLiveSettlement` (the poll loop, and the immediate
// re-fetch after queueBuildLive/cancelBuildLive/upgrade) writes completed
// levels and new/removed foundation stubs straight into `world.model`'s
// tiles, but the renderer only ever redraws sprites on a real camera pan/
// zoom (`cameraMovedEnough`) — nothing tied a data refresh to a redraw, so
// a building that finished (or one just queued, which should show its
// level-0 foundation immediately) kept showing its old texture until the
// player happened to pan far enough by coincidence.
//
// Watched by *content*, not by array identity. `refreshLiveSettlement`
// reassigns `world.hud.buildings` to a fresh array every LIVE_POLL_MS
// whether or not anything changed, so watching the array itself fired a
// `forceRebuild()` every four seconds with the camera sitting perfectly
// still — and `forceRebuild` deliberately drops the water mask (a forced
// rebuild is the one place the "terrain never changes" assumption can be
// wrong), so each of those also paid for a whole fresh mask bake. At a
// zoomed-out settlement that is a ~300ms stall on a four-second timer,
// which is exactly what a periodic lag spike is. A signature over what the
// renderer actually draws from turns that into a rebuild per real change.
const buildingSignature = computed(() =>
  world.hud.buildings.map((b) => `${b.q},${b.r},${b.type},${b.level},${b.orientation ?? ''}`).join('|'),
);
watch(
  [() => canvasRef.value?.renderer, buildingSignature],
  ([renderer]) => {
    renderer?.forceRebuild();
  },
);

// A camp state refresh (a camp cleared, a building removed it) changes which art a tile draws.
watch(
  [() => canvasRef.value?.renderer, () => world.campStatesVersion],
  ([renderer]) => {
    renderer?.forceRebuild();
  },
);

const hoverInfo = ref<HoverInfo | null>(null);
function onHover(info: HoverInfo | null) {
  // The renderer's pointer tracking is a window-level listener (see
  // HexMapRenderer's onPointerMove), so it keeps resolving a hex under the
  // cursor even while the ring's own DOM bubbles are what's visually on
  // top — without this guard, the tile tooltip renders over freshly opened
  // ring bubbles (e.g. hovering "Build" to drill into categories).
  if (selectedTile.value && ringScreen.value) return;
  hoverInfo.value = info;
}

// Issue #16 "ring/radial context menu on tile click": replaces the old
// click-always-opens-BuildingModal behaviour. A click now opens a
// RingMenu whose actions depend on the tile's state; "Details"/"Info" is
// what opens BuildingModal now, rather than every click doing so.
const selectedCoord = ref<AxialCoord | null>(null);
const selectedTile = ref<Tile | null>(null);
const modalBusy = ref(false);
// Why the last build/upgrade attempt was rejected (NoFreeSlot's premium
// hint included, issue #158) — surfaced in BuildingModal rather than only
// `console.error`'d, and cleared whenever a fresh attempt starts, the modal
// closes, or a different tile is selected.
const actionError = ref<string | null>(null);
// Issue #40 phase 1: a separate modal from BuildingModal (train has no
// per-hex build/upgrade action, it lists the whole unit roster at once) —
// see the ring's 'train' action below.
const trainModalOpen = ref(false);

const modalMine = computed(
  () => !!selectedTile.value && selectedTile.value.ownerId === world.selectedSettlementId,
);
const isUnclaimedTile = computed(() => !!selectedTile.value && !selectedTile.value.ownerId);
const modalOwnerLabel = computed(() => {
  const tile = selectedTile.value;
  if (!tile?.ownerId) return null;
  const owner = world.model.getSettlement(tile.ownerId);
  if (!owner) return null;
  return owner.ownerId === player.id
    ? owner.name
    : t('hud.hoverTooltip.ownedByOther', { owner: owner.ownerName, name: owner.name });
});

// Ring menu state. The 2a ring owns its own depth (root actions -> build
// categories -> a category's buildings), so this only tracks *where* it is
// open — the concentric ringStack/radius/angle-stagger machinery the
// previous ring needed is gone with it.
const ringScreen = ref<RingPlacement | null>(null);

// The ring must stay clear of the HUD panels, which means knowing how big the
// stage actually is. A ResizeObserver on the stage element rather than
// window.innerWidth/Height: the window fires no resize when a surrounding
// element changes size (an embedded or split view), which would freeze the
// bounds at whatever they were on mount.
const stageRef = ref<HTMLElement | null>(null);
const stage = ref({ w: window.innerWidth, h: window.innerHeight });
let stageObserver: ResizeObserver | null = null;
onMounted(() => {
  buildingCatalogue.load();
  if (!stageRef.value) return;
  stageObserver = new ResizeObserver(() => {
    const rect = stageRef.value?.getBoundingClientRect();
    if (rect) stage.value = { w: rect.width, h: rect.height };
  });
  stageObserver.observe(stageRef.value);
});
onUnmounted(() => stageObserver?.disconnect());

// Every number below is traceable to a panel's own scoped style, so the ring
// treats a panel as an edge rather than opening underneath it:
//   BuildQueuePanel .status-card  left:16  top:76    width:240  -> left 268
//   ExpansionPanel  .status-card  left:16  top:340   width:240  (same column)
//   TrainingQueuePanel            right:16 top:76    width:240
//   ArmyPanel       .status-card  right:16 bottom:16 width:260
//   TopBar .hud-bar height 64, plus a 12px gap                  -> top 76
// The right edge is set by the widest panel actually in the ring's way: ArmyPanel
// (260 wide, runs down to the bottom bound) beats TrainingQueuePanel (240, top only)
// -> right = stage width - (16 + 260 + 16), floored at 420.
// These are worst-case constants: every panel is treated as present. On
// mobile, BuildQueuePanel/TrainingQueuePanel are replaced by QueueDrawer's
// collapsed handle (.queue-drawer-handle, a 48px-wide tab) pinned to the left
// edge, and the HUD bar can be docked at the bottom instead of the top (see
// ArmyPanel.vue's `--hud-inset-bottom`) — `hudInsetTopPx`/`hudInsetBottomPx`
// above mirror the bar's real height into whichever edge it occupies now.
// Phone layout: the ring's detail card docks to a screen edge instead of
// floating beside the ring — a bottom strip in portrait, a side panel away
// from the tapped hex in landscape (lib/map/ringDock.ts).
function ringDockAt(x: number) {
  return ringDockFor({
    compact: isMobile.value,
    width: stage.value.w,
    height: stage.value.h,
    x,
    insetLeft: hudInsetLeftPx.value,
  });
}
/** The ring's area with the tile at screen x (the landscape dock goes on the side away from it). */
function ringBoundsAt(x: number) {
  return boundsClearOfDock(
    {
      left: isMobile.value ? 64 : 268, // 48px handle + 16px gap
      top: hudInsetTopPx.value + 12,
      right: isMobile.value ? stage.value.w - 16 : Math.max(420, stage.value.w - 292),
      bottom: stage.value.h - (hudInsetBottomPx.value + 16),
    },
    ringDockAt(x),
    { width: stage.value.w, height: stage.value.h, insetLeft: hudInsetLeftPx.value, insetBottom: hudInsetBottomPx.value },
  );
}
const ringDock = computed(() => (ringScreen.value ? ringDockAt(ringScreen.value.x) : null));
const ringBounds = computed(() => ringBoundsAt(ringScreen.value?.x ?? stage.value.w / 2));
// The card gets its own, roomier area on purpose. What `ringBounds` leaves
// over once every panel is reserved is about 308x404 at 1280x720 — too small
// to hold the 200x222 card anywhere clear of the ring, so the card would end
// up on top of the menu. A card briefly overlapping a panel is much less
// harmful than one covering the menu.
const ringCardBounds = computed(() => ({
  left: 16,
  top: hudInsetTopPx.value + 12,
  right: stage.value.w - 16,
  bottom: stage.value.h - (hudInsetBottomPx.value + 16),
}));

// Issue #16 "ring menu": while any ring is open, its bubbles float on top
// of the canvas, but the renderer's own pointer tracking is window-level
// (see HexMapRenderer's onPointerMove) and doesn't know a menu is up —
// lock out hover/wheel there for as long as a ring is showing. The mobile
// queue drawer floats over the canvas the same way while open, so it shares
// the same lock.
const canvasInteractionLocked = computed(
  () => !!ringScreen.value || queueDrawerOpen.value || isHudDrawerOpen.value,
);
watch(canvasInteractionLocked, (locked) => {
  canvasRef.value?.renderer?.setInteractionLocked(locked);
});

// Mobile dispatch flow (issue: mobile army dispatch): whether a dispatch or
// field-order draft is being composed right now — MobileDispatchSheet takes
// over the bottom of the screen while one is, so QueueDrawer (which would
// otherwise clash with it) hides, and the HUD pull-down drawer closes the
// same way opening QueueDrawer already does above.
const hasActiveDraft = computed(() => !!(world.dispatchDraft || world.fieldOrderDraft));
watch(hasActiveDraft, (active) => {
  if (active) {
    queueDrawerOpen.value = false;
    closeHudDrawer();
  }
});

// Finding #12: the queue drawer and the mobile HUD pull-down drawer are two
// separate floating sheets that can both open over the same canvas — only
// one should ever be open at a time (opening either one is a strong enough
// "I want to look at this now" signal that the other one being open too is
// just visual clutter, on top of the z-index tie TopBar.vue's own comment
// covers for the moment they'd otherwise overlap).
watch(queueDrawerOpen, (open) => {
  if (open) closeHudDrawer();
});
watch(isHudDrawerOpen, (open) => {
  if (open) queueDrawerOpen.value = false;
});

// X3: closing the ring does not unmount it at once; RingMenuHost holds the DOM
// for the retract animation and tells us when it is done (`retracted`).

// A mousedown on the ring's own backdrop (not a bubble) closes the ring and
// hands back the same PointerEvent so the map can start dragging from it
// immediately — otherwise the player would need a second, separate
// mousedown just to start panning after dismissing the ring.
function onRingOutsidePointerDown(e: PointerEvent) {
  closeRing();
  // suppressClick: this same gesture already closed the ring — a stationary
  // release shouldn't also be treated as a map click that opens a new one
  // (issue #16: "click somewhere else on the map should close the ring
  // first", not close-and-immediately-reopen).
  canvasRef.value?.renderer?.beginDragFrom(e, { suppressClick: true });
}


// The build ring's model (placement filter, locks, costs, art) is shared with the onboarding ring (LandingView).
const {
  categories: buildCategories,
  canBuildHere,
  offersBuilding,
  placeBuildingDemo,
  builtLevels,
  prerequisiteLocks,
  availabilityFor,
  wisdomFactor,
  formatOutput,
  formatModifier,
  tileAt,
} = useBuildRing(selectedTile, selectedCoord);
// World zoom only offers the army action, so it has no build ring at all.
const ringCategories = computed<RingCategory[]>(() => (mode.value === 'world' ? [] : buildCategories.value));

const isEnemyTile = computed(
  () => !!selectedTile.value?.ownerId && selectedTile.value.ownerId !== world.selectedSettlementId,
);
const isMineTile = computed(
  () => !!selectedTile.value && selectedTile.value.ownerId === world.selectedSettlementId,
);

// Issue: mobile army dispatch. Every tile's ring gets a "send army" bubble —
// what it's called and what it starts depends on who (if anyone) owns the
// tile: another player's settlement reads "Attack" and targets it directly;
// the player's own *other* settlement (multi-settlement accounts) reads
// "Support"; anything else (own current settlement, unclaimed ground, open
// water) is a plain Move with `route = [coord]`. Enabled on every viewport —
// on desktop, starting a draft this way just pre-fills ArmyPanel's existing
// dispatch form, same as picking a mission tab and a target there by hand.
function sendArmyAction(tile: Tile): RingAction {
  const hasUnits = world.hud.garrison.some((g) => g.count > 0);
  const ownerSettlementId = tile.ownerId;
  const ownerIsSelf = ownerSettlementId
    ? world.model.getSettlement(ownerSettlementId)?.ownerId === player.id
    : false;
  let id: 'send-army' | 'attack' | 'support' = 'send-army';
  let label = t('hud.ringMenu.actions.sendArmyHere');
  if (ownerSettlementId && !ownerIsSelf) {
    id = 'attack';
    label = t('hud.ringMenu.actions.attack');
  } else if (ownerSettlementId && ownerSettlementId !== world.selectedSettlementId) {
    id = 'support';
    label = t('hud.ringMenu.actions.support');
  }
  return {
    id,
    label,
    disabled: !hasUnits,
    hint: hasUnits ? undefined : t('hud.ringMenu.actions.noUnitsAtHome'),
  };
}

// Hunt a wildlife camp: offered on a camp tile that is still on the map, live mode only
// (the demo has no army simulation, so no camp fights). Needs land units at home — ships cannot hunt.
function huntActions(tile: Tile): RingAction[] {
  if (DEMO_MODE || !tile.camp || tile.camp.removed || tile.buildingType) return [];
  const hasLandUnits = world.hud.garrison.some(
    (g) => g.count > 0 && classifyUnitSelection({ [g.unit]: g.count }, unitCatalogue.byType) === 'land',
  );
  return [
    {
      id: 'hunt',
      label: t('hud.ringMenu.actions.hunt'),
      color: 'var(--rival)',
      disabled: !hasLandUnits,
      hint: hasLandUnits ? undefined : t('hud.ringMenu.actions.noLandUnitsAtHome'),
    },
  ];
}

// Siege another player's palisade or gate (endgame "Breaching walls"): offered on a standing wall hex of a settlement that is
// neither the player's own nor a friend's (same guild, or a guild at peace), live mode only. It opens an Attack on the wall owner's
// settlement with the wall hex as the preferred target building. Walls fall to battering rams only, so one must be at home; without
// one the bubble stays but is disabled with a hint, like the other army actions.
function siegeActions(tile: Tile): RingAction[] {
  if (
    DEMO_MODE
    || !tile.ownerId
    || !isHostileWallTile(tile, world.model.rivalWallOwner(tile.q, tile.r), player.id, guild.friendlyUserIds)
  ) {
    return [];
  }
  const hasRam = world.hud.garrison.some((g) => g.count > 0 && breachesWalls(g.unit, unitCatalogue.byType));
  return [
    {
      id: 'siege',
      label: t('hud.ringMenu.actions.siege'),
      color: 'var(--rival)',
      disabled: !hasRam,
      hint: hasRam ? undefined : t('hud.ringMenu.actions.noRamAtHome'),
    },
  ];
}

// The root Upgrade bubble. It states up front whether the upgrade is possible
// and, on hover, shows the same card a building does — for the NEXT level:
// its cost, time, output, slots and what (if anything) still blocks it.
function upgradeActionFor(tile: Tile): RingAction {
  const type = tile.buildingType!;
  const label = t('hud.ringMenu.actions.upgrade');
  const level = tile.buildingLevel ?? 1;
  const nextLevel = level + 1;
  const definitions = buildingCatalogue.byType[type];
  const upgradeDefinition = definitions?.find((d) => d.level === nextLevel);
  // A catalogue that lists the building but has no further level: nothing left to upgrade to.
  if (definitions?.length && !upgradeDefinition) {
    return { id: 'upgrade', label, color: 'var(--gold)', disabled: true, hint: t('hud.ringMenu.actions.maxLevel') };
  }
  const cost = upgradeDefinition?.cost ?? buildingUpgradeCost(type, nextLevel);
  const locks = [
    longhouseLock(upgradeDefinition?.requiredLonghouseLevel, world.hud.level),
    ...prerequisiteLocks(upgradeDefinition?.prerequisites, builtLevels()),
  ].filter((lock): lock is string => !!lock);
  const hexBusy = world.hud.queue.some((o) => o.q === tile.q && o.r === tile.r);
  const availability = availabilityFor(cost, upgradeDefinition, locks.length > 0, hexBusy);
  const stats = buildingStatsAt(type, nextLevel, tile, tileAt);
  const missing = formatMissingResources(cost, world.hud.available);
  const blocked = availability.state === 'locked' || availability.state === 'waiting';
  return {
    id: 'upgrade',
    label,
    color: 'var(--gold)',
    disabled: blocked,
    state: blocked ? availability.state : undefined,
    // Read out by screen readers; sighted players get the card on hover.
    hint: !blocked
      ? undefined
      : locks.length
        ? locks[0]
        : missing
          ? t('hud.ringMenu.actions.notEnough', { resources: missing })
          : t('hud.ringMenu.card.badgeNoSlot'),
    card: {
      title: t('hud.ringMenu.card.upgradeTitle', { level: nextLevel }),
      sub: t('hud.ringMenu.card.upgradeSub', { building: buildingName(type), from: level, to: nextLevel }),
      cost,
      time: upgradeDefinition ? formatBuildTime(upgradeDefinition.buildSeconds * wisdomFactor()) : undefined,
      gives: stats.output ? formatOutput(stats.output) : stats.modifier ? formatModifier(stats.modifier) : undefined,
      locks,
      art: buildingArt(type, nextLevel),
      availability,
    },
  };
}

// The Details bubble (opens BuildingModal on click) also previews the tile on
// hover: for a building its name, level and what it gives, for ground the
// terrain and who holds it — the same facts HexTooltip shows on the map.
function detailsAction(tile: Tile): RingAction {
  return { id: 'details', label: t('hud.ringMenu.actions.details'), info: tileInfo(tile) };
}

function tileInfo(tile: Tile): RingInfo {
  const owner = tile.ownerId ? world.model.getSettlement(tile.ownerId) : undefined;
  const mine = !!owner && owner.ownerId === player.id;
  const ownerLine = !owner
    ? t('hud.hoverTooltip.unclaimed')
    : mine
      ? owner.name
      : t('hud.hoverTooltip.ownedByOther', { owner: owner.ownerName, name: owner.name });
  const rows: RingInfo['rows'] = [];
  if (tile.giant) return { title: giantName(tile.giant.family), sub: ownerLine, rows };
  if (tile.camp && !tile.camp.removed) {
    return {
      title: campName(tile.camp.family),
      sub: tile.camp.strong ? t('hud.hoverTooltip.campStrong') : t('hud.hoverTooltip.campWeak'),
      rows,
    };
  }
  if (tile.buildingType) {
    const level = tile.buildingLevel ?? 1;
    const title = buildingName(tile.buildingType);
    // Like the hover tooltip, stats are for the player's own buildings only.
    if (mine) {
      const stats = buildingStatsAt(tile.buildingType, level, tile, tileAt);
      if (stats.output) rows.push({ label: t('hud.hoverTooltip.output'), value: formatOutput(stats.output) });
      if (stats.modifier) rows.push({ label: t('hud.hoverTooltip.modifier'), value: formatModifier(stats.modifier) });
    }
    return {
      title,
      sub: `${t('hud.hoverTooltip.level', { level })} · ${ownerLine}`,
      art: buildingArt(tile.buildingType, level),
      rows,
    };
  }
  return { title: ringTerrainLabel.value, sub: ownerLine, rows };
}

const rootActions = computed<RingAction[]>(() => {
  const tile = selectedTile.value;
  if (!tile) return [];
  // World zoom only offers the army action: BuildingModal/TrainingModal and
  // the build fan only exist in the settlement template, so Build/Upgrade/
  // Info bubbles here would open nothing.
  if (mode.value === 'world') return [...huntActions(tile), ...siegeActions(tile), sendArmyAction(tile)];

  if (isEnemyTile.value) {
    // Replaces the old permanently-disabled "Attack / Raid" bubble — combat
    // is implemented now, via the same dispatch draft/sheet every other
    // "send army" entry point uses.
    return [{ id: 'info', label: t('hud.ringMenu.actions.info'), info: tileInfo(tile) }, ...siegeActions(tile), sendArmyAction(tile)];
  }
  if (isUnclaimedTile.value) {
    const onCoast = tile.terrain === 'sand';
    return [
      { id: 'info', label: t('hud.ringMenu.actions.info'), info: tileInfo(tile) },
      {
        id: onCoast ? 'land-here' : 'send-settlers',
        label: onCoast ? t('hud.ringMenu.actions.landHere') : t('hud.ringMenu.actions.sendSettlers'),
        disabled: true,
        hint: t('hud.ringMenu.actions.noSettlersYet'),
      },
      ...huntActions(tile),
      sendArmyAction(tile),
    ];
  }
  if (isMineTile.value && tile.buildingType) {
    // The previous ring floated "Lv n / upgrade" as a gold badge above the
    // orbit, joined to it by a guide line. 2a has no badge — every action is
    // a bubble on the inner lane — so upgrade becomes an ordinary bubble and
    // the level it used to carry moves onto the hub (see ringCoordLabel),
    // which is where the tile's own facts live now.
    //
    // Unlike a build bubble (which shows an affordable-or-not cost card once
    // hovered — root actions carry no cost/card), Upgrade needs to say up
    // front whether it's even possible: same disabled+hint pattern already
    // used for Raze/Train/Attack above, not a new affordance.
    const upgrade = upgradeActionFor(tile);
    const actions: RingAction[] = [
      upgrade,
      detailsAction(tile),
      {
        id: 'raze',
        label: t('hud.ringMenu.actions.raze'),
        disabled: tile.buildingType === 'longhouse' || !DEMO_MODE,
        hint:
          tile.buildingType === 'longhouse'
            ? t('hud.ringMenu.actions.cantRazeLonghouse')
            : t('hud.ringMenu.actions.notWiredYet'),
      },
    ];
    // Training is queued against the settlement, not a specific hex, so the
    // action itself is the same TrainingModal regardless of which building
    // opens it (see onRingSelect's 'train' case) — only which tiles offer the
    // action changes. Originally longhouse-only (issue #40 phase 1); every
    // building any UnitDefinition.RequiredBuildingType now points at
    // (archery range and dockyard for land troops/ships, then barracks and
    // cart workshop once Thrall/Provisioner/SettlerCrew moved off the
    // longhouse) gets the same action. The backend enforces the real gate
    // either way — this is just where the UI surfaces the button.
    if (
      tile.buildingType === 'longhouse'
      || tile.buildingType === 'archeryrange'
      || tile.buildingType === 'siegeworkshop'
      || tile.buildingType === 'dockyard'
      || tile.buildingType === 'barracks'
      || tile.buildingType === 'cartworkshop'
    ) {
      actions.push({ id: 'train', label: t('hud.ringMenu.actions.trainUnits') });
    }
    actions.push(sendArmyAction(tile));
    return actions;
  }
  if (isMineTile.value) {
    // A giant hex is never buildable, claimed or not — its own art fully
    // occupies the ground there (mirrors WorldModel.placeBuilding's own
    // `tile.giant` refusal).
    const blockedByGiant = !!tile.giant;
    // A wildlife camp hex is buildable only once the camp is cleared (never Fenrir's brood) —
    // mirrors WorldModel.placeBuilding / the server's HexOccupiedByCamp rule.
    const blockedByCamp = !!tile.camp && !tile.buildingType && !campHexBuildable(tile.camp);
    // A hex that offers no category at all (bog shore, mouth or spring, a mountain while quarries are off, a lake, open water)
    // has no Build action — nothing in the ring that could only fail (docs/design/ui-guidelines.md, rule 1).
        return [
      detailsAction(tile),
      ...(canBuildHere.value
        ? [
            {
              id: 'build',
              label: t('hud.ringMenu.actions.build'),
              disabled: blockedByGiant || blockedByCamp,
              hint: blockedByGiant
                ? t('hud.ringMenu.actions.giantOccupied')
                : blockedByCamp
                  ? t('hud.ringMenu.actions.campOccupied')
                  : undefined,
            },
          ]
        : []),
      ...huntActions(tile),
      sendArmyAction(tile),
    ];
  }
  return [detailsAction(tile), ...huntActions(tile), sendArmyAction(tile)];
});


// The hub names what was clicked: the building standing on the hex if there
// is one, otherwise the bare terrain — a river tile's art fully overrides
// its underlying land terrain (see HexMapRenderer's terrainTitleFor/
// rebuildTerrain), so the hub needs to say "River" too, same as the hover
// tooltip, rather than falling back to the land terrain underneath it.
const ringTerrainLabel = computed(() => {
  const tile = selectedTile.value;
  const coord = selectedCoord.value;
  if (!tile) return '';
  if (tile.buildingType) return buildingName(tile.buildingType);
  if (coord && world.model.getRiverTile(coord.q, coord.r)) return t('hud.hoverTooltip.river');
  return terrainName(tile.terrain);
});
const ringCoordLabel = computed(() => {
  const coord = selectedCoord.value;
  if (!coord) return '';
  const level = selectedTile.value?.buildingType ? selectedTile.value.buildingLevel ?? 1 : null;
  return level === null
    ? t('hud.ringMenu.hexCoord', { q: coord.q, r: coord.r })
    : t('hud.ringMenu.levelHexCoord', { level, q: coord.q, r: coord.r });
});

const ringOpen = computed(() => !!(selectedTile.value && ringScreen.value));

function onHexClick(coord: AxialCoord, tile: Tile, screen: { x: number; y: number }) {
  // docs/design/ship-movement.md §5: fleet waypoints/orders must work at
  // world zoom too, not just settlement zoom — ships range over open water
  // the settlement view never shows. So a dispatch/field-order draft in
  // progress claims the click *before* the world-mode click-to-enter below,
  // at both zoom levels alike.
  //
  // Issue #40 phase 2: while a dispatch is being composed (ArmyPanel's
  // "Dispatch army" flow), a click plots the next waypoint instead of
  // opening the usual ring menu — the two interaction modes are mutually
  // exclusive on this same canvas, per the design doc.
  if (world.dispatchDraft) {
    world.addWaypoint(coord);
    return;
  }
  // Issue #156 phase 1: a field order being composed (ArmyPanel's "Move
  // on"/"Append goal" flow) claims clicks the same way a dispatch draft
  // does — mutually exclusive interaction modes, same as above.
  if (world.fieldOrderDraft) {
    world.addFieldOrderWaypoint(coord);
    return;
  }
  // World mode used to click-to-enter the settlement unconditionally here —
  // zoom is now the only way in (the zoom-driven transition above/pinch-zoom
  // still does that); a plain tap opens the same ring menu settlement mode
  // uses instead, so a fleet's target (open water the settlement view never
  // shows) can be picked by tapping it, not just by search in ArmyPanel.
  hoverInfo.value = null;
  selectedCoord.value = coord;
  selectedTile.value = tile;
  ringScreen.value = roomForRing(screen);
  actionError.value = null;
}

/** Pans the map so the tapped tile's ring opens as a circle (lib/map/ringPlacement.ts); returns where it opens. */
function roomForRing(screen: { x: number; y: number }): RingPlacement {
  const shapes = ringShapes(
    rootActions.value.length,
    ringCategories.value.map((c) => c.buildings.length),
  );
  return placeRing(canvasRef.value?.renderer, screen, ringBoundsAt, shapes);
}

// Issue #93 "drag to move a placed waypoint": the renderer resolved the hex
// the pin was dragged onto (snapping happens there, against the same
// isoPixelToAxial a click uses); this just writes it into the draft.
function onWaypointMove(index: number, coord: AxialCoord) {
  if (world.fieldOrderDraft) {
    world.moveFieldOrderWaypoint(index, coord);
    return;
  }
  world.moveWaypoint(index, coord);
}

// Mobile dispatch flow: tapping (not dragging) a draft pin removes it — see
// HexMapRendererOptions.onWaypointTap's own comment for how a tap is told
// apart from a drag.
function onWaypointTap(index: number) {
  if (world.fieldOrderDraft) {
    world.removeFieldOrderWaypoint(index);
    return;
  }
  world.removeWaypoint(index);
}

// While the ring is open the renderer fades out the canvas markers (dials, the
// realm badge) beneath its footprint; lifted again as soon as the ring unmounts.
function onRingFootprint(circle: { x: number; y: number; r: number }) {
  canvasRef.value?.renderer?.setMarkerOcclusion(circle);
}
function clearRingFootprint() {
  // A ring reopened during the retract animation has already re-set it.
  if (!ringOpen.value) canvasRef.value?.renderer?.setMarkerOcclusion(null);
}

function closeRing() {
  selectedCoord.value = null;
  selectedTile.value = null;
  ringScreen.value = null;
  actionError.value = null;
}

// The ring owns its own drill-down now (hover a category, its buildings fan
// out beside it), so only a committed choice reaches here: a building id from
// the outer lane, or one of the root actions.
async function onRingSelect(id: string) {
  const tile = selectedTile.value;
  if (tile && offersBuilding(id)) {
    await buildFromRing(id as BuildableType);
    return;
  }
  switch (id) {
    case 'details':
    case 'info':
      // Falls through to BuildingModal below; the ring stays "open" only long
      // enough for the modal to take over the same selectedTile.
      ringScreen.value = null;
      return;
    case 'upgrade':
      // upgrade() already closes on success (both branches); on failure it
      // leaves selectedTile/ringScreen alone, so the ring stays open and
      // shows the rejection's message (`actionError`, passed as `error`).
      await upgrade();
      return;
    case 'train':
      // Same hand-off pattern as 'details'/'info', to TrainingModal.
      ringScreen.value = null;
      trainModalOpen.value = true;
      return;
    case 'raze':
      if (world.selectedSettlementId && selectedCoord.value) {
        world.model.razeBuilding(world.selectedSettlementId, selectedCoord.value);
        canvasRef.value?.renderer?.forceRebuild();
      }
      closeRing();
      return;
    case 'send-army':
      if (selectedCoord.value) world.startDispatchAt(selectedCoord.value);
      closeRing();
      return;
    case 'hunt':
      if (selectedCoord.value) world.startDispatchAt(selectedCoord.value, { mission: 'hunt' });
      closeRing();
      return;
    case 'siege':
      // The wall's own settlement is the Attack's target (the walls read stamps it on the tile) and the wall hex its preferred building.
      if (selectedCoord.value && tile) {
        const options = siegeAttackOptions(tile, selectedCoord.value);
        if (options) world.startDispatchAt(selectedCoord.value, options);
      }
      closeRing();
      return;
    case 'attack':
    case 'support':
      if (selectedCoord.value && tile?.ownerId) {
        world.startDispatchAt(selectedCoord.value, { mission: id, targetSettlementId: tile.ownerId });
      }
      closeRing();
      return;
    default:
      return;
  }
}

// W3 optimistic build + X2 drop. Choosing a building in the ring closes the
// ring at once (the chosen bubble drops onto the hex, the rest retract, see
// RingMenu's `data-dropping` and `RingMenuHost`) instead of waiting for the
// server: the hex gets a "…" construction dial through a pending queue entry
// (`world.queueBuildOptimistic`), and only a refusal undoes it — the dial
// shakes and fades and a chip under the hex carries the server's message. The
// stock never changed, so nothing else needs rolling back. Demo mode places
// instantly, so it only gets the drop.
async function buildFromRing(type: BuildableType) {
  const coord = selectedCoord.value;
  if (!world.selectedSettlementId || !coord) return;
  actionError.value = null;
  // What the ring promised this building costs (read before the ring closes: the categories follow the selected tile).
  const entry = ringCategories.value.flatMap((c) => c.buildings).find((b) => b.id === type);
  const cost = entry?.cost;
  if (DEMO_MODE) {
    if (!placeBuildingDemo(type, coord)) {
      // Unlike live mode there is no optimistic phase: the ring stays open with the reason in it.
      actionError.value = t('hud.ringMenu.errors.couldNotQueueBuild');
      return;
    }
    canvasRef.value?.renderer?.forceRebuild();
    closeRing();
    return;
  }
  const renderer = canvasRef.value?.renderer;
  closeRing();
  // Hold the new queue row back until the confirmation animation reveals it (Q1/Q5, BuildQueuePanel).
  holdBuildRow(coord);
  try {
    await world.queueBuildOptimistic(type, coord, cost);
  } catch (err) {
    releaseBuildRow(coord);
    console.error('Failed to queue building against the backend', err);
    // Surface the rejection's detail (NoFreeSlot's premium hint included, issue #158).
    renderer?.rejectConstructionDial(coord);
    showBuildRefusal(coord, describeActionError(err, t('hud.ringMenu.errors.couldNotQueueBuild')));
    return;
  }
  announceConfirmedBuild({
    coord,
    name: entry?.label ?? buildingName(type),
    level: 1,
    time: entry?.time ?? null,
    from: renderer?.dialScreenPoint(coord) ?? null,
  });
}

const BUILD_REFUSAL_MS = 2500;
const buildRefusal = ref<{ coord: AxialCoord; message: string } | null>(null);
let buildRefusalTimer: ReturnType<typeof setTimeout> | null = null;
function showBuildRefusal(coord: AxialCoord, message: string) {
  buildRefusal.value = { coord, message };
  if (buildRefusalTimer) clearTimeout(buildRefusalTimer);
  buildRefusalTimer = setTimeout(() => {
    buildRefusal.value = null;
    buildRefusalTimer = null;
  }, BUILD_REFUSAL_MS);
}
onUnmounted(() => {
  if (buildRefusalTimer) clearTimeout(buildRefusalTimer);
});

function closeModal() {
  closeRing();
  modalBusy.value = false;
  actionError.value = null;
}

function closeTrainModal() {
  closeRing();
  trainModalOpen.value = false;
}

function describeActionError(err: unknown, fallback: string): string {
  return apiErrorMessage(err, fallback);
}

async function upgrade() {
  if (!world.selectedSettlementId || !selectedCoord.value || !selectedTile.value?.buildingType) return;
  actionError.value = null;
  if (DEMO_MODE) {
    world.model.upgradeBuilding(world.selectedSettlementId, selectedCoord.value);
    canvasRef.value?.renderer?.forceRebuild();
    closeModal();
    return;
  }
  modalBusy.value = true;
  actionError.value = null;
  try {
    await world.queueBuildLive(selectedTile.value.buildingType, selectedCoord.value);
    closeModal();
  } catch (err) {
    console.error('Failed to queue upgrade against the backend', err);
    actionError.value = describeActionError(err, t('hud.ringMenu.errors.couldNotQueueUpgrade'));
    modalBusy.value = false;
  }
}
</script>

<template>
  <div
    ref="stageRef"
    class="map-view"
    :style="{
      '--hud-inset-top': hudInsetTopPx + 'px',
      '--hud-inset-bottom': hudInsetBottomPx + 'px',
      '--hud-inset-left': hudInsetLeftPx + 'px',
    }"
  >
    <!-- Outside the canvas v-if: shows while the settlement is still loading. -->
    <MapStatusOverlay :step="overlayStep" :error="overlayError" @retry="retryLoad" />
    <SettlementCanvas
      v-if="world.selectedSettlementId"
      ref="canvasRef"
      :mode="mode"
      :world-model="world.model"
      :player-id="player.id"
      :settlement-id="world.selectedSettlementId"
      :background="mode === 'world' ? WORLD_SEA_BACKGROUND : undefined"
      @hex-click="onHexClick"
      @hover="onHover"
      @waypoint-move="onWaypointMove"
      @waypoint-tap="onWaypointTap"
      @zoom-mode-change="onZoomModeChange"
    />
    <div v-if="showFogDebug" class="fog-debug-stack">
      <!-- First in the stack on purpose: it is the one panel that answers
           "is the map smooth right now", which is the question every other
           panel here exists to help explain. -->
      <FpsMeter />
      <ZoomDebugPanel :renderer="canvasRef?.renderer" />
      <FogDebugPanel @change="onFogDebugChange" />
      <WaterDebugPanel @change="onFogDebugChange" />
      <WaterPerfPanel />
      <FogPerfPanel />
    </div>
    <!-- The white unexplored-fog fill (HexMapRenderer's FOG_UNEXPLORED) is
         much lighter than the old backdrop this HUD chrome was designed
         against, and can sit right behind the top bar depending on where
         the camera starts — this scrim (matching Viking Realm.dc.html's own
         top-bar gradient) keeps the logo/resources/nav readable regardless
         of what's under them. -->
    <div class="hud-scrim" :class="{ 'hud-scrim--bottom': hudBarAtBottom }" />
    <TopBar :hide-title="mode === 'settlement'">
      <ResourceBar :ring-open="ringOpen" />
      <HudNav has-resource-bar />
      <template #drawer="{ close }">
        <MobileHudDrawer has-resource-bar @close="close" />
      </template>
    </TopBar>
    <template v-if="mode === 'settlement'">
      <template v-if="isMobile">
        <QueueDrawer v-if="!hasActiveDraft" v-model:open="queueDrawerOpen" @select="onQueueSelect" @select-army="onArmySelect" />
      </template>
      <template v-else>
        <BuildQueuePanel @select="onQueueSelect" />
        <TrainingQueuePanel />
      </template>
      <ExpansionPanel />
      <QuestTray v-if="!hasActiveDraft" />
      <ArmyPanel v-if="!isMobile" />
      <HexTooltip v-if="hoverInfo" :info="hoverInfo" :friend-owners="guild.friendlyUserIds" />
      <RingMenuHost @retracted="clearRingFootprint">
        <RingMenu
          v-if="selectedTile && ringScreen"
          :x="ringScreen.x"
          :y="ringScreen.y"
          :scale="ringScreen.scale"
          :actions="rootActions"
          :categories="ringCategories"
          :terrain-label="ringTerrainLabel"
          :coord-label="ringCoordLabel"
          :bounds="ringBounds"
          :card-bounds="ringCardBounds"
          :stock="world.hud.available"
          :error="actionError"
          :dock="ringDock"
          @select="onRingSelect"
          @close="closeRing"
          @outside-pointer-down="onRingOutsidePointerDown"
          @footprint="onRingFootprint"
        />
      </RingMenuHost>
      <BuildingModal
        v-if="selectedTile && !ringScreen && !trainModalOpen"
        :tile="selectedTile"
        :mine="modalMine"
        :owner-label="modalOwnerLabel"
        :busy="modalBusy"
        :error="actionError"
        @close="closeModal"
        @upgrade="upgrade"
      />
      <TrainingModal
        v-if="selectedTile && trainModalOpen"
        @close="closeTrainModal"
        @trained="closeTrainModal"
      />
    </template>
    <template v-else>
      <!-- docs/design/ship-movement.md §5: fleet orders (dispatch, field
           orders, recall) work at world zoom too, not just settlement zoom
           — a ship's whole journey happens on water the settlement view
           never shows. Everything else in the settlement-only template
           above (building ring menu, construction/training panels) stays
           settlement-only; only the army/fleet panel, the ring (mobile taps
           no longer jump straight to /settlement — see onHexClick) and the
           queue drawer (mobile fleets need to be tracked here too) are
           mode-agnostic. -->
      <QueueDrawer v-if="isMobile && !hasActiveDraft" v-model:open="queueDrawerOpen" @select="onQueueSelect" @select-army="onArmySelect" />
      <ArmyPanel v-if="!isMobile" />
      <RingMenuHost @retracted="clearRingFootprint">
        <RingMenu
          v-if="selectedTile && ringScreen"
          :x="ringScreen.x"
          :y="ringScreen.y"
          :scale="ringScreen.scale"
          :actions="rootActions"
          :categories="ringCategories"
          :terrain-label="ringTerrainLabel"
          :coord-label="ringCoordLabel"
          :bounds="ringBounds"
          :card-bounds="ringCardBounds"
          :stock="world.hud.available"
          :error="actionError"
          :dock="ringDock"
          @select="onRingSelect"
          @close="closeRing"
          @outside-pointer-down="onRingOutsidePointerDown"
          @footprint="onRingFootprint"
        />
      </RingMenuHost>
    </template>
    <BuildRefusalChip
      v-if="buildRefusal"
      :renderer="canvasRef?.renderer"
      :coord="buildRefusal.coord"
      :message="buildRefusal.message"
    />
    <MobileDispatchSheet v-if="isMobile && hasActiveDraft" />
  </div>
</template>

<style scoped>
.map-view {
  position: relative;
  width: 100vw;
  height: 100vh;
  /* Mobile-readiness audit: 100dvh tracks mobile Safari's real visible
     viewport, as a progressive enhancement over the 100vh above. */
  height: 100dvh;
  /* Without this, a vertical touch-drag on the mobile HUD bar can fall
     through to the browser's own overscroll/pull-to-refresh handling,
     cancelling the pointer capture the drag-to-open drawer gesture
     (TopBar.vue's useHudDrawer) relies on. */
  overscroll-behavior-y: none;
}
.hud-scrim {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 110px;
  z-index: 5;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(7, 15, 20, 0.7) 0%, rgba(7, 15, 20, 0.32) 70%, rgba(7, 15, 20, 0) 100%);
}
/* Mobile only: the collapsed bar can dock to the bottom edge instead (see
   hudBarAtBottom above) — the readability scrim follows it there. */
.hud-scrim--bottom {
  top: auto;
  bottom: 0;
  background: linear-gradient(0deg, rgba(7, 15, 20, 0.7) 0%, rgba(7, 15, 20, 0.32) 70%, rgba(7, 15, 20, 0) 100%);
}
.fog-debug-stack {
  position: absolute;
  /* Clears TopBar (top:16px) and ResourceBar (top:66px, right:16px). */
  top: 120px;
  right: 16px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* The stack has outgrown the viewport: three panels, and the water one alone
     carries ten checkboxes and six sliders. Without this the bottom handles are
     simply unreachable at 900px tall, which is the height the screenshot
     helpers run at. `bottom` matches the `top` above so it clears the HUD at
     both ends. */
  max-height: calc(100vh - 136px);
  /* Mobile-readiness audit: 100dvh tracks mobile Safari's real visible
     viewport, as a progressive enhancement over the calc(100vh...) above. */
  max-height: calc(100dvh - 136px);
  overflow-y: auto;
}
/* Scroll the column, not the panels: flex items shrink to fit a constrained
   cross-size by default, which squashes the slider rows instead of scrolling. */
.fog-debug-stack > * {
  flex-shrink: 0;
}
</style>
