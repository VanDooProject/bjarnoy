<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { buildingName, terrainName } from '../i18n/catalogueNames';
import { useRouter } from 'vue-router';
import { useDisplayedRoute } from '../composables/useDisplayedRoute';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import MapStatusOverlay from '../components/map/MapStatusOverlay.vue';
import { useIntroTilesSignal } from '../composables/useIntroTilesSignal';
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
import RingMenu, { type RingAction, type RingCategory } from '../components/hud/RingMenu.vue';
import FogDebugPanel from '../components/hud/FogDebugPanel.vue';
import FogPerfPanel from '../components/hud/FogPerfPanel.vue';
import FpsMeter from '../components/hud/FpsMeter.vue';
import WaterDebugPanel from '../components/hud/WaterDebugPanel.vue';
import WaterPerfPanel from '../components/hud/WaterPerfPanel.vue';
import ZoomDebugPanel from '../components/hud/ZoomDebugPanel.vue';
import { useWorldStore } from '../stores/world';
import { WORLD_HASH, isWorldHash } from '../lib/mapModeRoute';
import { parseCameraHash, serializeCameraHash } from '../lib/mapCameraHash';
import { useAuthStore } from '../stores/auth';
import { apiErrorMessage } from '../i18n/apiErrors';
import { usePlayerStore } from '../stores/player';
import { armyOverlayMovement, foreignArmyMarker } from '../lib/map/armyOverlay';
import { useGuildStore } from '../stores/guild';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { useBuildRing, type BuildableType } from '../composables/useBuildRing';
import { DEMO_MODE } from '../config';
import { useFogDebug } from '../composables/useFogDebug';
import { useDraggablePosition } from '../composables/useDraggablePosition';
import { useMediaQuery } from '../composables/useMediaQuery';
import { hudBarHeightPx, hudRailWidthPx } from '../composables/hudBarHeight';
import { isHudRail } from '../composables/hudSettlementBubbleState';
import { HUD_COMPACT_QUERY } from '../lib/breakpoints';
import { hexTakesNoOrder, nextUpgradeLevel } from '../lib/hud/pendingBuild';
import { useHudPrefsStore } from '../stores/hudPrefs';
import { closeHudDrawer, isHudDrawerOpen } from '../composables/hudDrawerOpenState';
import { useIsMobile } from '../composables/useIsMobile';
import { parseKey, type AxialCoord } from '../lib/hex/coords';
import { constructionDialsFromQueue } from '../lib/map/constructionDial';
import { buildingArt } from '../lib/map/buildingArt';
import { buildingStatsAt, buildingUpgradeCost, scaleOutput, upgradeRateGain } from '../lib/map/buildingEconomy';
import { razeBlock, razeRefund, razeSeconds } from '../lib/map/raze';
import { formatBuildTime, formatMissingResources, longhouseLock } from '../lib/map/ringCatalogue';
import { boundsClearOfDock, ringDockFor } from '../lib/map/ringDock';
import { ringShapes } from '../lib/map/ringLayout';
import { buildingEntryId, primaryActionFirst } from '../lib/map/ringActions';
import { placeRing, type RingPlacement } from '../lib/map/ringPlacement';
import { useRingMaxScale } from '../composables/useRingMaxScale';
import type { Tile } from '../lib/map/types';
import type { ArmyOverlayData, ArmyOverlayMarker, HoverInfo, RenderMode } from '../lib/map/HexMapRenderer';
import { isHostileWallTile, siegeAttackOptions } from '../lib/map/siegeRules';
import {
  breachesWalls,
  classifyUnitSelection,
  totalSpeed,
  totalUpkeepPerHour,
  trainingSite,
} from '../lib/units/armyDispatch';
import { reachableRange } from '../lib/map/hexPath';
import { gamePathContext } from '../lib/map/movementContext';
import { routeProgressAt } from '../lib/units/armyProgress';
import { useSendBlockText, useSendPickerRows, useSendSources } from '../composables/useSendSources';
import { motionEnabled } from '../lib/motion';
import MobileDispatchSheet from '../components/hud/MobileDispatchSheet.vue';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const world = useWorldStore();
const player = usePlayerStore();
const auth = useAuthStore();
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
// The route this view renders, not the URL: under a modal route (App.vue) the URL is the modal's.
const route = useDisplayedRoute();
const router = useRouter();

// One view/one persistent renderer serves both the settlement and the world
// map on one route (`/settlement`, world mode marked by `#world` — see
// lib/mapModeRoute.ts; docs/design/zoom-transition.md §5, option (a)) — the zoom-driven
// transition needs the same HexMapRenderer instance to survive the switch
// (no teardown/flash, fog persists uninterrupted), which two independently-
// mounted views/renderers per route could never give it. `mode` is derived
// from the route rather than tracked as separate local state, so a zoom
// crossing, a nav click, browser back/forward, or a direct URL load all agree with the
// renderer on what to show.
const mode = computed<RenderMode>(() => (isWorldHash(route.value.hash) ? 'world' : 'settlement'));
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
  router.push({ path: '/settlement', hash: next === 'world' ? WORLD_HASH : '' });
}

// ?debug=1 surfaces FogDebugPanel — same idea as window.__fogDebug (main.ts)
// but clickable, and not gated to demo mode: these are pure client-side
// rendering toggles, nothing about game state. See useFogDebug for why this
// is a shared composable rather than a local computed().
const showFogDebug = useFogDebug();
const debugStackRef = ref<HTMLElement | null>(null);
const debugStackDrag = useDraggablePosition('debugStack', debugStackRef);
const debugStackStyle = debugStackDrag.style;
const isMobile = useIsMobile();
const queueDrawerOpen = ref(false);
const canvasRef = ref<InstanceType<typeof SettlementCanvas> | null>(null);

// Both modes keep their camera in the URL hash (lib/mapCameraHash.ts), so a reload or a shared link
// lands on the same spot. Read once, before the first camera change rewrites the hash; a missing or
// invalid hash leaves the default framing.
const initialCameraView = parseCameraHash(route.value.hash);
const CAMERA_HASH_DEBOUNCE_MS = 300;
let cameraHashTimer: ReturnType<typeof setTimeout> | undefined;
function onCameraChange() {
  clearTimeout(cameraHashTimer);
  cameraHashTimer = setTimeout(writeCameraHash, CAMERA_HASH_DEBOUNCE_MS);
}
function writeCameraHash() {
  const renderer = canvasRef.value?.renderer;
  // The real URL, not `route`: under a modal route it is the modal's, and must not get a camera hash.
  if (!renderer || router.currentRoute.value.path !== '/settlement') return;
  // Not router.replace: that would run the route watchers; vue-router keeps its own state in history.state.
  const hash = serializeCameraHash(renderer.cameraView, mode.value === 'world');
  history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
}
onUnmounted(() => clearTimeout(cameraHashTimer));
// Once the renderer has mounted and framed the settlement itself, the hash's view wins over that default.
if (initialCameraView) {
  const stopRestore = watch(
    () => canvasRef.value?.renderer,
    (renderer) => {
      if (!renderer) return;
      renderer.restoreCameraView(initialCameraView.coord, initialCameraView.zoom);
      stopRestore();
    },
  );
}
function onFogDebugChange() {
  canvasRef.value?.renderer?.forceRebuild();
}

// Issue #16 "status box": "clicking a building in queue should center and
// highlight (some flashes) the tile" — panTo recentres the camera on it,
// and highlightCoord (already a pulsing gold outline HexMapRenderer draws
// every tick — see drawHighlight) is set for a few seconds to read as a
// flash rather than a permanent marker.
function onFocusHome() {
  const renderer = canvasRef.value?.renderer;
  if (!renderer) return;
  if (mode.value === 'world') renderer.focusWorldCamera();
  else renderer.focusSettlementCamera();
}

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
  onQueueSelect(liveArmyCoord(army));
}

/** The hex an army's marker is on right now: where it is along its leg (the half it has reached), not the last hex the poll reported. */
function liveArmyCoord(army: (typeof world.armies)[number]): AxialCoord {
  let coord: AxialCoord = army.position;
  if (army.movement) {
    const {
      path, cumulativeHours, edgeHours, departedAt, arrivesAt, isReturning,
      returnPath, returnCumulativeHours, returnEdgeHours, turnAroundAt, returnArrivesAt,
    } = army.movement;
    const progress = isReturning
      ? routeProgressAt(returnPath, returnCumulativeHours, returnEdgeHours, Date.parse(turnAroundAt), Date.parse(returnArrivesAt), Date.now())
      : routeProgressAt(path, cumulativeHours, edgeHours, Date.parse(departedAt), Date.parse(arrivesAt), Date.now());
    if (progress) coord = progress.arrived || progress.t >= 0.5 ? progress.to : progress.from;
  }
  return coord;
}

// What the map view is waiting on, shown by MapStatusOverlay — a failed
// settlement restore used to be an unhandled rejection with the page fogged
// forever. Only the REST restore can fail here; the rest of mount is
// fire-and-forget and runs regardless (see onMounted).
const {
  step: loadStep,
  error: loadError,
  settled: loadSettled,
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
useIntroTilesSignal({
  settled: loadSettled,
  error: overlayError,
  canvasShown: computed(() => !!world.selectedSettlementId),
  loadState: computed(() => canvasRef.value?.loadState),
  animLoad: computed(() => canvasRef.value?.animLoad),
});
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

// A navigation that carries a camera anchor (e.g. a report's "show on map" link: `/settlement#world&q=..&r=..&z=..`)
// moves the camera there. The anchor is also read once at setup (`initialCameraView`) for a reload or a fresh mount;
// this covers the map already being mounted behind a modal. `flush: 'post'` runs it after the `mode` watcher above has
// switched the renderer's mode.
watch(
  () => route.value.hash,
  (hash) => {
    const view = parseCameraHash(hash);
    if (view) canvasRef.value?.renderer?.restoreCameraView(view.coord, view.zoom);
  },
  { flush: 'post' },
);

// Fog v2 (map-fog-v2.md §3): pushes a freshly fetched mask bitmap into the
// renderer — same "watch both together" reasoning the army-overlay watcher
// below uses, since the renderer may not exist yet on the tick a fetch
// resolves.
watch(
  [() => canvasRef.value?.renderer, () => world.fogMaskBitmap, () => world.fogMaskBounds, () => world.fogCoverage],
  ([renderer, bitmap, bounds, coverage]) => {
    if (renderer && bitmap && bounds && coverage) renderer.setFogMask(bounds, bitmap, coverage);
  },
);

// Premium players see every standing camp as a paw symbol on the world map; the renderer never reads the auth store
// itself, so the host hands it the flag (and updates it when the player's premium status changes).
watch(
  [() => canvasRef.value?.renderer, () => auth.isPremium],
  ([renderer, premium]) => renderer?.setShowCampMarkers(premium),
  { immediate: true },
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
const sendPicker = useSendPickerRows();
const armyOverlayData = computed<ArmyOverlayData>(() => {
  const picker = world.sendPicker;
  const pickRows = picker ? new Map(sendPicker.rows.value.map((r) => [r.id, r])) : null;
  const armies: ArmyOverlayMarker[] = world.armies.map((a) => ({
    id: a.id,
    position: a.position,
    selected: a.id === world.selectedArmyId,
    // The send picker marks which armies can be tapped (see HexMapRenderer's `pick`).
    pick: pickRows ? (picker!.selectedId === a.id ? 'selected' : pickRows.get(a.id)?.ok ? 'eligible' : 'ineligible') : undefined,
    returning: !!a.movement?.isReturning,
    // docs/design/ship-movement.md §4: ship marker for a fleet (any ship in
    // the army, its land units are passengers), flag for a land army — the
    // same classification dispatch relies on.
    isFleet:
      classifyUnitSelection(
        Object.fromEntries(a.stacks.map((s) => [s.unit, s.count])),
        unitCatalogue.byType,
      ) === 'fleet',
    // The backend's own figure: best-sighted unit type plus the home settlement's Ravens.
    visionRadius: a.visionRadius,
    // An `atHome`/`supporting` army has no movement at all and keeps sitting on its authoritative hex.
    movement: a.movement ? armyOverlayMovement(a.movement) : undefined,
  }));
  // docs/design/map-fog-v2.md §1g: other players' troops marching inside our sight, in their owner's colour (guild/treaty/rival like
  // the realm borders). Never selected, never returning-grey, and the renderer gives them no vision of their own.
  for (const a of world.foreignArmies) {
    armies.push(foreignArmyMarker(a, world.model.getSettlement(a.settlementId), player.id));
  }
  const selected = world.armies.find((a) => a.id === world.selectedArmyId);
  // While the send picker is open the route drawn is the preview of the order: from where the selected army will stand to the target.
  const pickerVerdict = world.sendPicker ? sendPicker.rows.value.find((r) => r.id === world.sendPicker?.selectedId)?.verdict : undefined;
  const route = world.sendPicker
    ? pickerVerdict?.ok
      ? pickerVerdict.path
      : []
    : selected?.movement
      ? selected.movement.isReturning
        ? selected.movement.returnPath
        : selected.movement.path
      : [];
  const draftWaypoints =
    world.dispatchDraft?.route ??
    world.fieldOrderDraft?.route ??
    (world.sendPicker && world.sendPicker.mission === 'move' ? [world.sendPicker.coord] : []);
  return { armies, route, draftWaypoints, targets: overlayTargets(selected) };
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
  // The order a picker is composing for a field army, and the picker's own target before any army is chosen.
  const field = world.fieldOrderDraft;
  if (field) {
    add(field.targetSettlementId, field.mission);
    if (field.mission === 'hunt') addCamp(field.route[field.route.length - 1]);
  }
  const picker = world.sendPicker;
  if (picker) {
    add(picker.targetSettlementId, picker.mission);
    if (picker.mission === 'hunt') addCamp(picker.coord);
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

// The send picker frames the target and every army that can go, not just the selected one, so another can still be tapped. Keyed on the
// target and the set of armies that can go: a poll that changes nothing about them must not move the camera under the player's hands.
const PICKER_FRAME_MS = 300;
const pickerFrameKey = computed(() => {
  const picker = world.sendPicker;
  if (!picker) return null;
  // Frame once, when every army's route is known: no moving camera as the rows resolve one by one.
  if (sendPicker.rows.value.some((r) => r.kind === 'field' && r.block === 'pending')) return null;
  const ids = sendPicker.rows.value.filter((r) => r.kind === 'field' && r.ok).map((r) => r.id);
  return `${picker.coord.q},${picker.coord.r}|${ids.sort().join(',')}`;
});
watch(
  [() => canvasRef.value?.renderer, pickerFrameKey],
  ([renderer, key]) => {
    const picker = world.sendPicker;
    if (!renderer || !key || !picker) return;
    const coords: AxialCoord[] = [picker.coord];
    for (const row of sendPicker.rows.value) {
      if (row.kind === 'field' && row.ok && row.army) coords.push(liveArmyCoord(row.army));
    }
    // On a phone the sheet covers the lower part of the screen: frame the rest.
    renderer.frameHexes(coords, { bottomInsetPx: isMobile.value ? Math.round(stage.value.h * 0.5) : 0, durationMs: motionEnabled() ? PICKER_FRAME_MS : 0 });
  },
  { immediate: true },
);

// A tap on an army's marker while the picker is open: a army that can go is selected, the same as tapping its row; one that cannot
// shows its reason in a small hint above it.
const armyHint = ref<{ x: number; y: number; text: string } | null>(null);
let armyHintTimer: ReturnType<typeof setTimeout> | null = null;
const sendBlockText = useSendBlockText();
function onArmyTap(armyId: string, screen: { x: number; y: number }) {
  if (armyHintTimer) clearTimeout(armyHintTimer);
  armyHint.value = null;
  const row = sendPicker.rows.value.find((r) => r.id === armyId);
  if (!row || !world.sendPicker) return;
  if (row.ok) {
    world.selectSendSource(armyId);
    return;
  }
  if (row.block === 'pending') return;
  const text = sendBlockText(row, sendPicker.target.value);
  if (!text) return;
  armyHint.value = { x: Math.min(Math.max(screen.x, 110), Math.max(110, stage.value.w - 110)), y: Math.max(48, screen.y - 34), text };
  armyHintTimer = setTimeout(() => (armyHint.value = null), 3500);
}
watch(
  () => world.sendPicker,
  (picker) => {
    if (!picker) armyHint.value = null;
  },
);
// The selected army was kept while its route was being searched (or the target moved): once its row settles on "cannot go", drop it.
watch(
  () => {
    const id = world.sendPicker?.selectedId;
    if (!id || id === 'home') return null;
    const row = sendPicker.rows.value.find((r) => r.id === id);
    return row ? (row.ok ? 'ok' : (row.block ?? null)) : null;
  },
  (state, previous) => {
    if (previous === 'pending' && state && state !== 'ok' && state !== 'pending') world.selectSendSource(null);
  },
);
onUnmounted(() => armyHintTimer && clearTimeout(armyHintTimer));

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
// re-fetch after queueBuildOptimistic/cancelBuildLive/upgrade) writes completed
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
// Why the last demo build was rejected — shown in the ring, which stays open
// (live orders are optimistic: a refusal shows in the chip under the hex). Cleared
// whenever a fresh attempt starts, the ring closes, or a different tile is selected.
const actionError = ref<string | null>(null);
// A building's training window, separate from BuildingModal (it lists the units that building
// trains with a quantity picker each, not a single build/upgrade action) — see the ring's
// 'train' action below.
const trainModalOpen = ref(false);

const modalMine = computed(
  () => !!selectedTile.value && world.isRealmSettlement(selectedTile.value.ownerId),
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
const ringMaxScale = useRingMaxScale();
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
const hasActiveDraft = computed(() => !!(world.dispatchDraft || world.fieldOrderDraft || world.sendPicker));
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
  buildAction,
  offersBuilding,
  placeBuildingDemo,
  builtLevels,
  prerequisiteLocks,
  availabilityFor,
  buildSeconds,
  formatOutput,
  formatModifier,
  tileAt,
} = useBuildRing(selectedTile, selectedCoord);
// World zoom only offers the army action, so it has no build ring at all.
const ringCategories = computed<RingCategory[]>(() => (mode.value === 'world' ? [] : buildCategories.value));

const sendSources = useSendSources();

const isEnemyTile = computed(
  () => !!selectedTile.value?.ownerId && !world.isRealmSettlement(selectedTile.value.ownerId),
);
const isMineTile = computed(
  () => !!selectedTile.value && world.isRealmSettlement(selectedTile.value.ownerId),
);

// Issue: mobile army dispatch. Every tile's ring gets a "send army" bubble —
// what it's called and what it starts depends on who (if anyone) owns the
// tile: another player's settlement reads "Attack" and targets it directly;
// the player's own *other* settlement (multi-settlement accounts) reads
// "Support"; anything else (own current settlement, unclaimed ground, open
// water) is a plain Move with `route = [coord]`. Always enabled, so opening a
// ring runs no route search: the send picker it opens lists which armies can
// go and why the others cannot. Enabled on every viewport —
// on desktop, starting a draft this way just pre-fills ArmyPanel's existing
// dispatch form, same as picking a mission tab and a target there by hand.
function sendMissionAt(tile: Tile): 'move' | 'attack' | 'support' {
  const ownerSettlementId = tile.ownerId;
  if (!ownerSettlementId) return 'move';
  if (world.model.getSettlement(ownerSettlementId)?.ownerId !== player.id) return 'attack';
  return world.isRealmSettlement(ownerSettlementId) ? 'move' : 'support';
}
function sendArmyAction(tile: Tile): RingAction {
  const mission = sendMissionAt(tile);
  const id = mission === 'move' ? 'send-army' : mission;
  const label = t(
    mission === 'attack' ? 'hud.ringMenu.actions.attack' : mission === 'support' ? 'hud.ringMenu.actions.support' : 'hud.ringMenu.actions.sendArmyHere',
  );
  return { id, label };
}

/** Whether the ring offers Hunt on this tile (huntActions): a wildlife camp still on the map, live mode only. */
function isHuntableCamp(tile: Tile): boolean {
  return !DEMO_MODE && !!tile.camp && !tile.camp.removed && !tile.buildingType;
}

/**
 * A tap on the ground while the send picker is open aims it at the tapped hex, with the mission the ring's bubble would give
 * that hex; a picker that is hunting keeps hunting when the new hex is a camp too. An army that was selected stays selected
 * when it can go to the new target, else it is dropped.
 */
function retargetSendPicker(coord: AxialCoord, tile: Tile) {
  const picker = world.sendPicker;
  if (!picker) return;
  const mission = picker.mission === 'hunt' && isHuntableCamp(tile) ? 'hunt' : sendMissionAt(tile);
  const selected = picker.selectedId;
  // A route still being searched keeps the army too: the watch on the selected row drops it once the search says it cannot go.
  const selectedRow = selected ? sendSources.evaluate(sendSources.targetAt(mission, coord)).find((r) => r.id === selected) : undefined;
  const canGo = !!selectedRow && (selectedRow.ok || selectedRow.block === 'pending');
  world.retargetSendPicker(
    coord,
    mission === 'move' ? {} : mission === 'hunt' ? { mission } : { mission, targetSettlementId: tile.ownerId ?? undefined },
    canGo,
  );
}

// Hunt a wildlife camp: offered on a camp tile that is still on the map, live mode only
// (the demo has no army simulation, so no camp fights). A land camp needs land units, a camp at sea (the whale road)
// ships — the other class cannot hunt it. Like the send bubble it is never greyed out: which armies can go is the
// picker's question (its rows run the route search), opening the ring runs none.
function huntActions(tile: Tile): RingAction[] {
  if (!isHuntableCamp(tile)) return [];
  return [{ id: 'hunt', label: t('hud.ringMenu.actions.hunt'), color: 'var(--rival)' }];
}

// Siege another player's palisade or gate (endgame "Breaching walls"): offered on a standing wall hex of a settlement that is
// neither the player's own nor a friend's (same guild, or a guild at peace), live mode only. It opens an Attack on the wall owner's
// settlement with the wall hex as the preferred target building. Walls fall to battering rams only, so one must be at home; without
// one the bubble stays but is disabled with a hint (a garrison check, no route search).
function siegeActions(tile: Tile): RingAction[] {
  if (
    DEMO_MODE
    || !tile.ownerId
    || !isHostileWallTile(tile, world.model.rivalBuildingOwner(tile.q, tile.r), player.id, guild.friendlyUserIds)
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
  // Queued behind a running upgrade, this one starts from the level that one reaches.
  const nextLevel = nextUpgradeLevel(tile.buildingLevel ?? 1, world.hud.queue, tile);
  const level = nextLevel - 1;
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
  // A hex at its order limit (or with a raze) takes no upgrade: the card says so, like Raze's, instead of listing slots.
  const busyNote = hexTakesNoOrder(world.hud.queue, tile, world.hud.construction.maxOrdersPerHex)
    ? t('hud.ringMenu.actions.hexBusy')
    : undefined;
  const stats = buildingStatsAt(type, nextLevel, tile, tileAt);
  // Production is per hour at the world's speed: the card shows the gain, and the new total next to it.
  const rate = upgradeRateGain(buildingStatsAt(type, level, tile, tileAt).output, stats.output, world.worldSpeedFactor);
  const missing = formatMissingResources(cost, world.hud.available);
  const blocked = !!busyNote || availability.state === 'locked' || availability.state === 'waiting';
  return {
    id: 'upgrade',
    label,
    color: 'var(--gold)',
    disabled: blocked,
    state: !blocked ? undefined : busyNote ? 'waiting' : availability.state,
    // Read out by screen readers; sighted players get the card on hover.
    hint: !blocked
      ? undefined
      : (busyNote ??
        (locks.length
          ? locks[0]
          : missing
            ? t('hud.ringMenu.actions.notEnough', { resources: missing })
            : t('hud.ringMenu.card.badgeNoSlot'))),
    card: {
      title: t('hud.ringMenu.card.upgradeTitle', { level: nextLevel }),
      sub: t('hud.ringMenu.card.upgradeSub', { building: buildingName(type), from: level, to: nextLevel }),
      cost,
      time: upgradeDefinition ? formatBuildTime(buildSeconds(upgradeDefinition.buildSeconds)) : undefined,
      gives: rate
        ? formatOutput(rate.gain)
        : stats.output
          ? formatOutput(scaleOutput(stats.output, world.worldSpeedFactor))
          : stats.modifier
            ? formatModifier(stats.modifier)
            : undefined,
      givesTotal: rate ? t('hud.ringMenu.card.givesTotal', { amount: rate.total }) : undefined,
      locks: busyNote ? [busyNote, ...locks] : locks,
      art: buildingArt(type, nextLevel),
      availability: busyNote ? undefined : availability,
    },
  };
}

// The Raze bubble: takes ONE level off the building (docs/design/construction-slots.md, "Razing"). Like Upgrade it says up
// front whether it is possible and shows a card on hover; a raze costs nothing, so the card shows its time and the third of
// the level's cost that comes back instead.
function razeActionFor(tile: Tile): RingAction {
  const type = tile.buildingType!;
  const label = t('hud.ringMenu.actions.raze');
  if (razeBlock(type, false, { state: 'ready' }) === 'longhouse') {
    return { id: 'raze', label, disabled: true, hint: t('hud.ringMenu.actions.cantRazeLonghouse') };
  }
  const level = tile.buildingLevel ?? 1;
  const definition = buildingCatalogue.byType[type]?.find((d) => d.level === level);
  const cost = definition?.cost ?? buildingUpgradeCost(type, level);
  const hexBusy = world.hud.queue.some((o) => o.q === tile.q && o.r === tile.r);
  // The raze needs the slots building this level took; it costs nothing, so only slots (or the waiting room) can hold it back.
  const availability = availabilityFor(undefined, definition, false, hexBusy);
  const block = razeBlock(type, hexBusy, availability);
  const blocked = block !== null;
  const busyNote = block === 'hexBusy' ? t('hud.ringMenu.actions.hexBusy') : undefined;
  return {
    id: 'raze',
    label,
    disabled: blocked,
    state: blocked ? 'waiting' : undefined,
    hint: !blocked ? undefined : (busyNote ?? t('hud.ringMenu.card.badgeNoSlot')),
    card: {
      title: level > 1 ? t('hud.ringMenu.card.razeTitle', { level: level - 1 }) : t('hud.ringMenu.card.razeTitleRemove'),
      sub: level > 1
        ? t('hud.ringMenu.card.upgradeSub', { building: buildingName(type), from: level, to: level - 1 })
        : t('hud.ringMenu.card.razeSubRemove', { building: buildingName(type) }),
      time: definition ? formatBuildTime(razeSeconds(buildSeconds(definition.buildSeconds))) : undefined,
      timeLabel: t('hud.ringMenu.razeTime'),
      refund: razeRefund(cost),
      okBadge: t('hud.ringMenu.card.razeBadge'),
      tapHint: t('hud.ringMenu.tap.raze', { name: label }),
      // A hex with an order on it takes no other: the card says so instead of listing slots.
      locks: busyNote ? [busyNote] : [],
      art: buildingArt(type, level),
      availability: hexBusy ? undefined : availability,
    },
  };
}

const rootActions = computed<RingAction[]>(() => primaryActionFirst(rootActionList()));
function rootActionList(): RingAction[] {
  const tile = selectedTile.value;
  if (!tile) return [];
  // World zoom only offers the army action: BuildingModal/TrainingModal and
  // the build fan only exist in the settlement template, so Build/Upgrade
  // bubbles here would open nothing.
  if (mode.value === 'world') return [...huntActions(tile), ...siegeActions(tile), sendArmyAction(tile)];

  if (isEnemyTile.value) {
    // Replaces the old permanently-disabled "Attack / Raid" bubble — combat
    // is implemented now, via the same dispatch draft/sheet every other
    // "send army" entry point uses.
    return [...siegeActions(tile), sendArmyAction(tile)];
  }
  if (isUnclaimedTile.value) {
    const onCoast = tile.terrain === 'sand';
    return [
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
      razeActionFor(tile),
    ];
    // Training belongs to a building: every building any UnitDefinition.RequiredBuildingType
    // points at offers the action, which opens that building's own TrainingModal; a finished Town Square
    // offers Feasts, which opens its BuildingModal (the feast lives there). The longhouse trains no unit.
    // The backend enforces the real gate either way — this is just where the UI surfaces the button.
    const entry = buildingEntryId(tile.buildingType, tile.buildingLevel ?? 0);
    if (entry === 'train') actions.push({ id: 'train', label: t('hud.ringMenu.actions.trainUnits') });
    if (entry === 'feasts') actions.push({ id: 'feasts', label: t('hud.ringMenu.actions.feasts') });
    actions.push(sendArmyAction(tile));
    return actions;
  }
  if (isMineTile.value) {
    // A hex that offers no category at all (bog shore, mouth or spring, a mountain while quarries are off, a lake, open water)
    // has no Build action — nothing in the ring that could only fail (docs/design/ui-guidelines.md, rule 1). A giant, a guarded
    // camp or an endgame site keeps Build, locked with the reason (useBuildRing's buildAction, shared with the onboarding ring).
    return [
      ...(buildAction.value ? [buildAction.value] : []),
      ...huntActions(tile),
      sendArmyAction(tile),
    ];
  }
  return [...huntActions(tile), sendArmyAction(tile)];
}


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
  // The send picker is open: the armies are picked by their markers (onArmyTap), a tap on the ground moves the target there.
  if (world.sendPicker) {
    armyHint.value = null;
    retargetSendPicker(coord, tile);
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
  return placeRing(canvasRef.value?.renderer, screen, ringBoundsAt, shapes, ringMaxScale.value);
}

// Issue #93 "drag to move a placed waypoint": the renderer resolved the hex
// the pin was dragged onto (snapping happens there, against the same
// isoPixelToAxial a click uses); this just writes it into the draft.
function onWaypointMove(index: number, coord: AxialCoord) {
  if (world.sendPicker) return; // the picker's target moves by a tap on the map (retargetSendPicker), not by dragging its pin
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
  if (world.sendPicker) return;
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
    case 'upgrade':
      // Optimistic like a new build: the ring closes at once, a refusal shows under the hex.
      await upgrade();
      return;
    case 'feasts':
      // The ring closes and BuildingModal takes over the same selectedTile (its feast section).
      ringScreen.value = null;
      return;
    case 'train':
      // Hand-off to TrainingModal: the ring closes, the modal takes over the same selectedTile.
      ringScreen.value = null;
      trainModalOpen.value = true;
      return;
    case 'raze':
      // Optimistic too: a raze costs nothing, so there is no spend and no confirmation animation.
      await raze();
      return;
    case 'send-army':
      if (selectedCoord.value) world.openSendPicker(selectedCoord.value);
      closeRing();
      return;
    case 'hunt':
      if (selectedCoord.value) world.openSendPicker(selectedCoord.value, { mission: 'hunt' });
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
        world.openSendPicker(selectedCoord.value, { mission: id, targetSettlementId: tile.ownerId });
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
  await sendOptimisticOrder(coord, () => world.queueBuildOptimistic(type, coord, cost), {
    fallback: t('hud.ringMenu.errors.couldNotQueueBuild'),
    confirmed: { name: entry?.label ?? buildingName(type), level: 1, time: entry?.time ?? null },
  });
}

// The live half shared by build, upgrade and raze: the ring (or modal) closes at once, the store's optimistic pending
// order puts the "…" dial on the hex, and only a refusal undoes it — the dial shakes and fades and a chip under the hex
// carries the server's message. With `confirmed`, the queue row is held back until the confirmation animation reveals
// it (Q1/Q5, BuildQueuePanel).
async function sendOptimisticOrder(
  coord: AxialCoord,
  send: () => Promise<void>,
  opts: { fallback: string; confirmed?: { name: string; level: number; time: string | null } },
) {
  const renderer = canvasRef.value?.renderer;
  closeModal();
  if (opts.confirmed) holdBuildRow(coord);
  try {
    await send();
  } catch (err) {
    if (opts.confirmed) releaseBuildRow(coord);
    console.error('Failed to queue an order against the backend', err);
    // Surface the rejection's detail (NoFreeSlot's premium hint included, issue #158).
    renderer?.rejectConstructionDial(coord);
    showBuildRefusal(coord, describeActionError(err, opts.fallback));
    return;
  }
  if (opts.confirmed) announceConfirmedBuild({ coord, ...opts.confirmed, from: renderer?.dialScreenPoint(coord) ?? null });
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
  actionError.value = null;
}

function closeTrainModal() {
  closeRing();
  trainModalOpen.value = false;
}

function describeActionError(err: unknown, fallback: string): string {
  return apiErrorMessage(err, fallback);
}

async function raze() {
  if (!world.selectedSettlementId || !selectedCoord.value || !selectedTile.value?.buildingType) return;
  actionError.value = null;
  if (DEMO_MODE) {
    world.model.razeBuilding(world.selectedSettlementId, selectedCoord.value);
    canvasRef.value?.renderer?.forceRebuild();
    closeRing();
    return;
  }
  const coord = selectedCoord.value;
  await sendOptimisticOrder(coord, () => world.razeBuildingLive(coord), {
    fallback: t('hud.ringMenu.errors.couldNotQueueRaze'),
  });
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
  const coord = selectedCoord.value;
  const tile = selectedTile.value;
  // What the Upgrade card promised (read before the ring closes: the card follows the selected tile).
  const card = upgradeActionFor(tile).card;
  const level = nextUpgradeLevel(tile.buildingLevel ?? 1, world.hud.queue, coord);
  // Queued behind a running order on the same hex: the queue's held row and confirmation are keyed by hex, so they
  // would hide and animate that running order's row instead. The new order just appears in the queue.
  const queuedBehind = world.hud.queue.some((o) => o.q === coord.q && o.r === coord.r);
  await sendOptimisticOrder(coord, () => world.upgradeBuildingLive(coord, card?.cost), {
    fallback: t('hud.ringMenu.errors.couldNotQueueUpgrade'),
    confirmed: queuedBehind ? undefined : { name: buildingName(tile.buildingType!), level, time: card?.time ?? null },
  });
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
      @army-tap="onArmyTap"
      @zoom-mode-change="onZoomModeChange"
      @camera-change="onCameraChange"
    />
    <div v-if="showFogDebug" ref="debugStackRef" class="fog-debug-stack" :style="debugStackStyle">
      <!-- Drag to move the whole stack off whatever it is covering (the garrison
           and army panels); double-click puts it back. -->
      <div
        class="debug-drag-handle"
        :title="t('hud.debugStack.handleTitle')"
        @pointerdown="debugStackDrag.onPointerDown"
        @dblclick="debugStackDrag.reset"
      >
        {{ `⠿ ${t('hud.debugStack.handle')}` }}
      </div>
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
    <TopBar :hide-title="mode === 'settlement'" @focus-home="onFocusHome">
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
      <ArmyPanel v-if="!isMobile" @focus-army="onArmySelect" />
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
        @close="closeModal"
      />
      <TrainingModal
        v-if="selectedTile?.buildingType && trainModalOpen"
        :building="{ type: selectedTile.buildingType, q: selectedTile.q, r: selectedTile.r, level: selectedTile.buildingLevel ?? 0 }"
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
      <ArmyPanel v-if="!isMobile" @focus-army="onArmySelect" />
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
    <div
      v-if="armyHint"
      class="army-hint"
      role="status"
      :style="{ left: armyHint.x + 'px', top: armyHint.y + 'px' }"
      data-testid="army-hint"
    >
      {{ armyHint.text }}
    </div>
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
.army-hint {
  position: absolute;
  z-index: 37;
  max-width: min(260px, calc(100vw - 32px));
  transform: translate(-50%, -100%);
  padding: 5px 9px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  color: var(--text);
  font-size: 12px;
  text-align: center;
  pointer-events: none;
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
.debug-drag-handle {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 4px 10px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  background: rgba(7, 15, 20, 0.85);
  border-radius: 6px;
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.debug-drag-handle:active {
  cursor: grabbing;
}
</style>
