/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildingName, campName, giantName, terrainName } from '../i18n/catalogueNames';
import { useRoute, useRouter } from 'vue-router';
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
import RingMenu from '../components/hud/RingMenu.vue';
import FogDebugPanel from '../components/hud/FogDebugPanel.vue';
import FogPerfPanel from '../components/hud/FogPerfPanel.vue';
import FpsMeter from '../components/hud/FpsMeter.vue';
import WaterDebugPanel from '../components/hud/WaterDebugPanel.vue';
import WaterPerfPanel from '../components/hud/WaterPerfPanel.vue';
import ZoomDebugPanel from '../components/hud/ZoomDebugPanel.vue';
import { useWorldStore } from '../stores/world';
import { WORLD_HASH } from '../lib/mapModeRoute';
import { parseCameraHash, serializeCameraHash } from '../lib/mapCameraHash';
import { useAuthStore } from '../stores/auth';
import { apiErrorMessage } from '../i18n/apiErrors';
import { usePlayerStore } from '../stores/player';
import { useGuildStore } from '../stores/guild';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { useBuildRing } from '../composables/useBuildRing';
import { DEMO_MODE } from '../config';
import { useFogDebug } from '../composables/useFogDebug';
import { useMediaQuery } from '../composables/useMediaQuery';
import { hudBarHeightPx, hudRailWidthPx } from '../composables/hudBarHeight';
import { isHudRail } from '../composables/hudSettlementBubbleState';
import { HUD_COMPACT_QUERY } from '../lib/breakpoints';
import { useHudPrefsStore } from '../stores/hudPrefs';
import { closeHudDrawer, isHudDrawerOpen } from '../composables/hudDrawerOpenState';
import { useIsMobile } from '../composables/useIsMobile';
import { parseKey } from '../lib/hex/coords';
import { constructionDialsFromQueue } from '../lib/map/constructionDial';
import { buildingArt } from '../lib/map/buildingArt';
import { buildingStatsAt, buildingUpgradeCost, scaleOutput, upgradeRateGain } from '../lib/map/buildingEconomy';
import { formatBuildTime, formatMissingResources, longhouseLock } from '../lib/map/ringCatalogue';
import { boundsClearOfDock, ringDockFor } from '../lib/map/ringDock';
import { ringShapes } from '../lib/map/ringLayout';
import { placeRing } from '../lib/map/ringPlacement';
import { useRingMaxScale } from '../composables/useRingMaxScale';
import { campHexBuildable } from '../lib/map/campRules';
import { isWaterCampFamily } from '../lib/map/campPlacement';
import { isHostileWallTile, siegeAttackOptions } from '../lib/map/siegeRules';
import { breachesWalls, classifyUnitSelection, garrisonCanHunt, totalSpeed, totalUpkeepPerHour, trainingSite, } from '../lib/units/armyDispatch';
import { reachableRange } from '../lib/map/hexPath';
import { gamePathContext } from '../lib/map/movementContext';
import { routeProgressAt } from '../lib/units/armyProgress';
import MobileDispatchSheet from '../components/hud/MobileDispatchSheet.vue';
const { t } = useI18n({ useScope: 'global' });
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
const route = useRoute();
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
const mode = computed(() => (route.hash === WORLD_HASH ? 'world' : 'settlement'));
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
function onZoomModeChange(next) {
    zoomDrivenTransition = true;
    router.push({ path: '/settlement', hash: next === 'world' ? WORLD_HASH : '' });
}
// ?debug=1 surfaces FogDebugPanel — same idea as window.__fogDebug (main.ts)
// but clickable, and not gated to demo mode: these are pure client-side
// rendering toggles, nothing about game state. See useFogDebug for why this
// is a shared composable rather than a local computed().
const showFogDebug = useFogDebug();
const isMobile = useIsMobile();
const queueDrawerOpen = ref(false);
const canvasRef = ref(null);
// Settlement mode keeps its camera in the URL hash (lib/mapCameraHash.ts), so a reload or a shared link
// lands on the same spot. Read once, before the first camera change rewrites the hash; a missing or
// invalid hash leaves the default framing.
const initialCameraView = mode.value === 'settlement' ? parseCameraHash(route.hash) : null;
const CAMERA_HASH_DEBOUNCE_MS = 300;
let cameraHashTimer;
function onCameraChange() {
    clearTimeout(cameraHashTimer);
    cameraHashTimer = setTimeout(writeCameraHash, CAMERA_HASH_DEBOUNCE_MS);
}
function writeCameraHash() {
    const renderer = canvasRef.value?.renderer;
    if (!renderer || mode.value !== 'settlement' || route.path !== '/settlement')
        return;
    // Not router.replace: that would run the route watchers; vue-router keeps its own state in history.state.
    const hash = serializeCameraHash(renderer.cameraView);
    history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
}
onUnmounted(() => clearTimeout(cameraHashTimer));
// Once the renderer has mounted and framed the settlement itself, the hash's view wins over that default.
if (initialCameraView) {
    const stopRestore = watch(() => canvasRef.value?.renderer, (renderer) => {
        if (!renderer)
            return;
        renderer.restoreCameraView(initialCameraView.coord, initialCameraView.zoom);
        stopRestore();
    });
}
function onFogDebugChange() {
    canvasRef.value?.renderer?.forceRebuild();
}
// Issue #16 "status box": "clicking a building in queue should center and
// highlight (some flashes) the tile" — panTo recentres the camera on it,
// and highlightCoord (already a pulsing gold outline HexMapRenderer draws
// every tick — see drawHighlight) is set for a few seconds to read as a
// flash rather than a permanent marker.
let flashTimeout = null;
function onQueueSelect(coord) {
    const renderer = canvasRef.value?.renderer;
    if (!renderer)
        return;
    renderer.panTo(coord);
    renderer.setHighlight(coord);
    if (flashTimeout)
        clearTimeout(flashTimeout);
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
function onArmySelect(armyId) {
    world.selectArmy(armyId);
    const army = world.armies.find((a) => a.id === armyId);
    if (!army)
        return;
    let coord = army.position;
    if (army.movement) {
        const { path, cumulativeHours, departedAt, arrivesAt, isReturning, returnPath, returnCumulativeHours, turnAroundAt, returnArrivesAt } = army.movement;
        const progress = isReturning
            ? routeProgressAt(returnPath, returnCumulativeHours, Date.parse(turnAroundAt), Date.parse(returnArrivesAt), Date.now())
            : routeProgressAt(path, cumulativeHours, Date.parse(departedAt), Date.parse(arrivesAt), Date.now());
        if (progress)
            coord = progress.arrived || progress.t >= 0.5 ? progress.to : progress.from;
    }
    onQueueSelect(coord);
}
// What the map view is waiting on, shown by MapStatusOverlay — a failed
// settlement restore used to be an unhandled rejection with the page fogged
// forever. Only the REST restore can fail here; the rest of mount is
// fire-and-forget and runs regardless (see onMounted).
const { step: loadStep, error: loadError, settled: loadSettled, run: loadSettlement, } = useLoadFlow(async (setStep) => {
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
const revealingMap = computed(() => !loadStep.value &&
    !loadError.value &&
    !!world.selectedSettlementId &&
    world.fogMaskBitmap === null &&
    !world.fogMaskError);
const overlayStep = computed(() => loadStep.value ?? (revealingMap.value ? t('hud.mapStatus.revealingMap') : null));
// A first fog mask fetch that fails leaves nothing to draw; later failures
// keep the previous bitmap and only reach the connection banner.
const overlayError = computed(() => loadError.value ?? (world.selectedSettlementId && world.fogMaskBitmap === null ? world.fogMaskError : null));
useIntroTilesSignal({
    settled: loadSettled,
    error: overlayError,
    canvasShown: computed(() => !!world.selectedSettlementId),
    loadState: computed(() => canvasRef.value?.loadState),
});
function retryLoad() {
    if (loadError.value) {
        void loadSettlement().then(() => {
            // The poll timers were started before this succeeded — restart them so
            // everything a failed first pass could not have pulled gets fetched.
            if (!loadError.value)
                world.startHudSync();
        });
    }
    else {
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
    if (world.worldId)
        void guild.loadFriends(world.worldId);
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
    window.__settlementRenderer = () => canvasRef.value?.renderer;
});
onUnmounted(() => {
    // Only fires once, when the player leaves the map entirely (e.g. to
    // /reports) — /world <-> /settlement no longer unmounts this view.
    world.stopHudSync();
    world.setWorldMapActive(false);
    delete window.__settlementRenderer;
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
    if (!renderer)
        return;
    // A no-op if the zoom-driven handler already flipped it (setMode is
    // idempotent on an unchanged mode) — this exists for every *other* way
    // `mode` can change: nav button, browser back/forward, a direct URL load.
    renderer.setMode(m);
    // Those other ways have no continuous gesture to preserve, so re-home the
    // camera onto the settlement's own framing exactly like a fresh per-route
    // mount always did — but only when this wasn't the zoom gesture that just
    // did the opposite on purpose (see zoomDrivenTransition's own comment).
    if (m === 'settlement' && !zoomDrivenTransition)
        renderer.focusSettlementCamera();
    zoomDrivenTransition = false;
});
// Fog v2 (map-fog-v2.md §3): pushes a freshly fetched mask bitmap into the
// renderer — same "watch both together" reasoning the army-overlay watcher
// below uses, since the renderer may not exist yet on the tick a fetch
// resolves.
watch([() => canvasRef.value?.renderer, () => world.fogMaskBitmap, () => world.fogMaskBounds, () => world.fogCoverage], ([renderer, bitmap, bounds, coverage]) => {
    if (renderer && bitmap && bounds && coverage)
        renderer.setFogMask(bounds, bitmap, coverage);
});
// Premium players see every standing camp as a paw symbol on the world map; the renderer never reads the auth store
// itself, so the host hands it the flag (and updates it when the player's premium status changes).
watch([() => canvasRef.value?.renderer, () => auth.isPremium], ([renderer, premium]) => renderer?.setShowCampMarkers(premium), { immediate: true });
// Fog chunks are fetched for the ground the camera actually sees (§3): the
// renderer reports which chunks that is as it pans/zooms, the store debounces
// and refetches only once the view leaves the window it already holds.
watch(() => canvasRef.value?.renderer, (renderer) => renderer?.setFogViewportListener((range) => world.requestFogViewport(range)), { immediate: true });
// Issue #40 phase 2: pushes armies/route/draft-waypoints into the renderer's
// own overlay layer (HexMapRenderer.setArmyOverlay) whenever any of them
// change, or as soon as the renderer itself becomes available — watching
// both together (rather than assuming the renderer is already mounted the
// first time this fires) covers the ordering race between the canvas
// mounting and this store data arriving.
const armyOverlayData = computed(() => {
    const armies = world.armies.map((a) => ({
        id: a.id,
        position: a.position,
        selected: a.id === world.selectedArmyId,
        returning: !!a.movement?.isReturning,
        // docs/design/ship-movement.md §4: ship marker for a fleet (any ship in
        // the army, its land units are passengers), flag for a land army — the
        // same classification dispatch relies on.
        isFleet: classifyUnitSelection(Object.fromEntries(a.stacks.map((s) => [s.unit, s.count])), unitCatalogue.byType) === 'fleet',
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
function overlayTargets(selectedArmy) {
    const targets = [];
    const add = (settlementId, mission) => {
        if (!settlementId || (mission !== 'attack' && mission !== 'support' && mission !== 'raid'))
            return;
        const settlement = world.model.getSettlement(settlementId);
        if (!settlement)
            return;
        // Raids are attacks as far as the map is concerned — the marker says
        // "someone is coming for this place", not which flavour of order it is.
        const kind = mission === 'support' ? 'support' : 'attack';
        if (targets.some((t) => t.coord.q === settlement.q && t.coord.r === settlement.r && t.kind === kind))
            return;
        targets.push({ coord: { q: settlement.q, r: settlement.r }, kind });
    };
    // A hunt has no target settlement: its marker (the attack icon) sits on the camp's own hex.
    const addCamp = (coord) => {
        if (!coord || targets.some((t) => t.coord.q === coord.q && t.coord.r === coord.r && t.kind === 'attack'))
            return;
        targets.push({ coord: { q: coord.q, r: coord.r }, kind: 'attack' });
    };
    const draft = world.dispatchDraft;
    if (draft) {
        add(draft.targetSettlementId, draft.mission);
        if (draft.mission === 'hunt')
            addCamp(draft.targetCamp ?? undefined);
    }
    if (selectedArmy && !selectedArmy.movement?.isReturning) {
        add(selectedArmy.targetSettlementId, selectedArmy.mission);
        if (selectedArmy.mission === 'hunt')
            addCamp(selectedArmy.movement?.path[selectedArmy.movement.path.length - 1]);
    }
    return targets;
}
watch([() => canvasRef.value?.renderer, armyOverlayData], ([renderer, data]) => {
    renderer?.setArmyOverlay(data ?? null);
}, { immediate: true });
// Issue #159 part B: the reachable-range tint while composing a dispatch.
// Origin and home are both the hex a land army leaves from (the building that
// trained its slowest unit, see trainingSite) — a fleet keeps the settlement's
// hex. A field order from a standing army is #156 phase 1, not built yet.
// Rounded to the nearest tenth of an hour so a sub-pixel provisions-slider
// twitch doesn't force a fresh flood-fill every frame.
const rangeOverlayHexes = computed(() => {
    const draft = world.dispatchDraft;
    if (!draft || draft.mission !== 'move')
        return null;
    if (!world.selectedSettlementId)
        return null;
    const home = world.model.getSettlement(world.selectedSettlementId);
    if (!home)
        return null;
    const speed = totalSpeed(draft.unitCounts, unitCatalogue.byType);
    const upkeep = totalUpkeepPerHour(draft.unitCounts, unitCatalogue.byType);
    if (speed <= 0 || upkeep <= 0 || draft.provisions <= 0)
        return null;
    const hoursOfFood = draft.provisions / upkeep;
    // The same rules HexPathfinder.cs paths a dispatch with: wide rivers and mountains stop the army, a stream costs a flat 9.
    const ctx = gamePathContext(world.model, { land: world.movementRules.land, riverCrossingCost: world.movementRules.riverCrossingCost }, speed * world.worldSpeedFactor, 
    // Walls stop every army but a gate lets its owner's through, and the owner's friends': the owner is the player who holds the
    // selected settlement, the friends their guild and the guilds at peace with it.
    home.ownerId, guild.friendlyUserIds);
    const origin = classifyUnitSelection(draft.unitCounts, unitCatalogue.byType) === 'fleet'
        ? { q: home.q, r: home.r }
        : trainingSite({ q: home.q, r: home.r }, world.hud.buildings, draft.unitCounts, unitCatalogue.byType);
    const range = reachableRange(origin, origin, hoursOfFood, ctx);
    return [...range.keys()].map(parseKey);
});
watch([() => canvasRef.value?.renderer, rangeOverlayHexes], ([renderer, hexes]) => {
    renderer?.setRangeOverlay(hexes ?? null);
}, { immediate: true });
// Construction progress dials over buildings still being built; the renderer
// animates the progress itself every tick from these absolute timestamps.
watch([() => canvasRef.value?.renderer, () => world.hud.queue, () => world.hud.queueFetchedAt], ([renderer]) => {
    renderer?.setConstructionDials(constructionDialsFromQueue(world.hud.queue, world.hud.queueFetchedAt));
}, { immediate: true });
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
const buildingSignature = computed(() => world.hud.buildings.map((b) => `${b.q},${b.r},${b.type},${b.level},${b.orientation ?? ''}`).join('|'));
watch([() => canvasRef.value?.renderer, buildingSignature], ([renderer]) => {
    renderer?.forceRebuild();
});
// A camp state refresh (a camp cleared, a building removed it) changes which art a tile draws.
watch([() => canvasRef.value?.renderer, () => world.campStatesVersion], ([renderer]) => {
    renderer?.forceRebuild();
});
const hoverInfo = ref(null);
function onHover(info) {
    // The renderer's pointer tracking is a window-level listener (see
    // HexMapRenderer's onPointerMove), so it keeps resolving a hex under the
    // cursor even while the ring's own DOM bubbles are what's visually on
    // top — without this guard, the tile tooltip renders over freshly opened
    // ring bubbles (e.g. hovering "Build" to drill into categories).
    if (selectedTile.value && ringScreen.value)
        return;
    hoverInfo.value = info;
}
// Issue #16 "ring/radial context menu on tile click": replaces the old
// click-always-opens-BuildingModal behaviour. A click now opens a
// RingMenu whose actions depend on the tile's state; "Details"/"Info" is
// what opens BuildingModal now, rather than every click doing so.
const selectedCoord = ref(null);
const selectedTile = ref(null);
const modalBusy = ref(false);
// Why the last build/upgrade attempt was rejected (NoFreeSlot's premium
// hint included, issue #158) — surfaced in BuildingModal rather than only
// `console.error`'d, and cleared whenever a fresh attempt starts, the modal
// closes, or a different tile is selected.
const actionError = ref(null);
// A building's training window, separate from BuildingModal (it lists the units that building
// trains with a quantity picker each, not a single build/upgrade action) — see the ring's
// 'train' action below.
const trainModalOpen = ref(false);
const modalMine = computed(() => !!selectedTile.value && world.isRealmSettlement(selectedTile.value.ownerId));
const isUnclaimedTile = computed(() => !!selectedTile.value && !selectedTile.value.ownerId);
const modalOwnerLabel = computed(() => {
    const tile = selectedTile.value;
    if (!tile?.ownerId)
        return null;
    const owner = world.model.getSettlement(tile.ownerId);
    if (!owner)
        return null;
    return owner.ownerId === player.id
        ? owner.name
        : t('hud.hoverTooltip.ownedByOther', { owner: owner.ownerName, name: owner.name });
});
// Ring menu state. The 2a ring owns its own depth (root actions -> build
// categories -> a category's buildings), so this only tracks *where* it is
// open — the concentric ringStack/radius/angle-stagger machinery the
// previous ring needed is gone with it.
const ringMaxScale = useRingMaxScale();
const ringScreen = ref(null);
// The ring must stay clear of the HUD panels, which means knowing how big the
// stage actually is. A ResizeObserver on the stage element rather than
// window.innerWidth/Height: the window fires no resize when a surrounding
// element changes size (an embedded or split view), which would freeze the
// bounds at whatever they were on mount.
const stageRef = ref(null);
const stage = ref({ w: window.innerWidth, h: window.innerHeight });
let stageObserver = null;
onMounted(() => {
    buildingCatalogue.load();
    if (!stageRef.value)
        return;
    stageObserver = new ResizeObserver(() => {
        const rect = stageRef.value?.getBoundingClientRect();
        if (rect)
            stage.value = { w: rect.width, h: rect.height };
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
function ringDockAt(x) {
    return ringDockFor({
        compact: isMobile.value,
        width: stage.value.w,
        height: stage.value.h,
        x,
        insetLeft: hudInsetLeftPx.value,
    });
}
/** The ring's area with the tile at screen x (the landscape dock goes on the side away from it). */
function ringBoundsAt(x) {
    return boundsClearOfDock({
        left: isMobile.value ? 64 : 268, // 48px handle + 16px gap
        top: hudInsetTopPx.value + 12,
        right: isMobile.value ? stage.value.w - 16 : Math.max(420, stage.value.w - 292),
        bottom: stage.value.h - (hudInsetBottomPx.value + 16),
    }, ringDockAt(x), { width: stage.value.w, height: stage.value.h, insetLeft: hudInsetLeftPx.value, insetBottom: hudInsetBottomPx.value });
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
const canvasInteractionLocked = computed(() => !!ringScreen.value || queueDrawerOpen.value || isHudDrawerOpen.value);
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
    if (open)
        closeHudDrawer();
});
watch(isHudDrawerOpen, (open) => {
    if (open)
        queueDrawerOpen.value = false;
});
// X3: closing the ring does not unmount it at once; RingMenuHost holds the DOM
// for the retract animation and tells us when it is done (`retracted`).
// A mousedown on the ring's own backdrop (not a bubble) closes the ring and
// hands back the same PointerEvent so the map can start dragging from it
// immediately — otherwise the player would need a second, separate
// mousedown just to start panning after dismissing the ring.
function onRingOutsidePointerDown(e) {
    closeRing();
    // suppressClick: this same gesture already closed the ring — a stationary
    // release shouldn't also be treated as a map click that opens a new one
    // (issue #16: "click somewhere else on the map should close the ring
    // first", not close-and-immediately-reopen).
    canvasRef.value?.renderer?.beginDragFrom(e, { suppressClick: true });
}
// The build ring's model (placement filter, locks, costs, art) is shared with the onboarding ring (LandingView).
const { categories: buildCategories, canBuildHere, offersBuilding, placeBuildingDemo, builtLevels, prerequisiteLocks, availabilityFor, wisdomFactor, formatOutput, formatModifier, tileAt, } = useBuildRing(selectedTile, selectedCoord);
// World zoom only offers the army action, so it has no build ring at all.
const ringCategories = computed(() => (mode.value === 'world' ? [] : buildCategories.value));
const isEnemyTile = computed(() => !!selectedTile.value?.ownerId && !world.isRealmSettlement(selectedTile.value.ownerId));
const isMineTile = computed(() => !!selectedTile.value && world.isRealmSettlement(selectedTile.value.ownerId));
// Issue: mobile army dispatch. Every tile's ring gets a "send army" bubble —
// what it's called and what it starts depends on who (if anyone) owns the
// tile: another player's settlement reads "Attack" and targets it directly;
// the player's own *other* settlement (multi-settlement accounts) reads
// "Support"; anything else (own current settlement, unclaimed ground, open
// water) is a plain Move with `route = [coord]`. Enabled on every viewport —
// on desktop, starting a draft this way just pre-fills ArmyPanel's existing
// dispatch form, same as picking a mission tab and a target there by hand.
function sendArmyAction(tile) {
    const hasUnits = world.hud.garrison.some((g) => g.count > 0);
    const ownerSettlementId = tile.ownerId;
    const ownerIsSelf = ownerSettlementId
        ? world.model.getSettlement(ownerSettlementId)?.ownerId === player.id
        : false;
    let id = 'send-army';
    let label = t('hud.ringMenu.actions.sendArmyHere');
    if (ownerSettlementId && !ownerIsSelf) {
        id = 'attack';
        label = t('hud.ringMenu.actions.attack');
    }
    else if (ownerSettlementId && !world.isRealmSettlement(ownerSettlementId)) {
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
// (the demo has no army simulation, so no camp fights). A land camp needs land units at home, a camp at sea (the
// whale road) ships — the other class cannot hunt it.
function huntActions(tile) {
    if (DEMO_MODE || !tile.camp || tile.camp.removed || tile.buildingType)
        return [];
    const atSea = isWaterCampFamily(tile.camp.family);
    const hasLandUnits = garrisonCanHunt(world.hud.garrison, unitCatalogue.byType, atSea);
    return [
        {
            id: 'hunt',
            label: t('hud.ringMenu.actions.hunt'),
            color: 'var(--rival)',
            disabled: !hasLandUnits,
            hint: hasLandUnits ? undefined : t(atSea ? 'hud.ringMenu.actions.noShipsAtHome' : 'hud.ringMenu.actions.noLandUnitsAtHome'),
        },
    ];
}
// Siege another player's palisade or gate (endgame "Breaching walls"): offered on a standing wall hex of a settlement that is
// neither the player's own nor a friend's (same guild, or a guild at peace), live mode only. It opens an Attack on the wall owner's
// settlement with the wall hex as the preferred target building. Walls fall to battering rams only, so one must be at home; without
// one the bubble stays but is disabled with a hint, like the other army actions.
function siegeActions(tile) {
    if (DEMO_MODE
        || !tile.ownerId
        || !isHostileWallTile(tile, world.model.rivalWallOwner(tile.q, tile.r), player.id, guild.friendlyUserIds)) {
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
function upgradeActionFor(tile) {
    const type = tile.buildingType;
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
    ].filter((lock) => !!lock);
    const hexBusy = world.hud.queue.some((o) => o.q === tile.q && o.r === tile.r);
    const availability = availabilityFor(cost, upgradeDefinition, locks.length > 0, hexBusy);
    const stats = buildingStatsAt(type, nextLevel, tile, tileAt);
    // Production is per hour at the world's speed: the card shows the gain, and the new total next to it.
    const rate = upgradeRateGain(buildingStatsAt(type, level, tile, tileAt).output, stats.output, world.worldSpeedFactor);
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
            gives: rate
                ? formatOutput(rate.gain)
                : stats.output
                    ? formatOutput(scaleOutput(stats.output, world.worldSpeedFactor))
                    : stats.modifier
                        ? formatModifier(stats.modifier)
                        : undefined,
            givesTotal: rate ? t('hud.ringMenu.card.givesTotal', { amount: rate.total }) : undefined,
            locks,
            art: buildingArt(type, nextLevel),
            availability,
        },
    };
}
// The Details bubble (opens BuildingModal on click) also previews the tile on
// hover: for a building its name, level and what it gives, for ground the
// terrain and who holds it — the same facts HexTooltip shows on the map.
function detailsAction(tile) {
    return { id: 'details', label: t('hud.ringMenu.actions.details'), info: tileInfo(tile) };
}
function tileInfo(tile) {
    const owner = tile.ownerId ? world.model.getSettlement(tile.ownerId) : undefined;
    const mine = !!owner && owner.ownerId === player.id;
    const ownerLine = !owner
        ? t('hud.hoverTooltip.unclaimed')
        : mine
            ? owner.name
            : t('hud.hoverTooltip.ownedByOther', { owner: owner.ownerName, name: owner.name });
    const rows = [];
    if (tile.giant)
        return { title: giantName(tile.giant.family), sub: ownerLine, rows };
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
            if (stats.output)
                rows.push({ label: t('hud.hoverTooltip.output'), value: formatOutput(scaleOutput(stats.output, world.worldSpeedFactor)) });
            if (stats.modifier)
                rows.push({ label: t('hud.hoverTooltip.modifier'), value: formatModifier(stats.modifier) });
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
const rootActions = computed(() => {
    const tile = selectedTile.value;
    if (!tile)
        return [];
    // World zoom only offers the army action: BuildingModal/TrainingModal and
    // the build fan only exist in the settlement template, so Build/Upgrade/
    // Info bubbles here would open nothing.
    if (mode.value === 'world')
        return [...huntActions(tile), ...siegeActions(tile), sendArmyAction(tile)];
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
        const actions = [
            upgrade,
            detailsAction(tile),
            {
                id: 'raze',
                label: t('hud.ringMenu.actions.raze'),
                disabled: tile.buildingType === 'longhouse' || !DEMO_MODE,
                hint: tile.buildingType === 'longhouse'
                    ? t('hud.ringMenu.actions.cantRazeLonghouse')
                    : t('hud.ringMenu.actions.notWiredYet'),
            },
        ];
        // Training belongs to a building: every building any UnitDefinition.RequiredBuildingType
        // points at (barracks, archery range, siege workshop, dockyard, cart workshop) offers the
        // action, which opens that building's own TrainingModal. The longhouse trains no unit.
        // The backend enforces the real gate either way — this is just where the UI surfaces the button.
        if (tile.buildingType === 'archeryrange'
            || tile.buildingType === 'siegeworkshop'
            || tile.buildingType === 'dockyard'
            || tile.buildingType === 'barracks'
            || tile.buildingType === 'cartworkshop') {
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
    if (!tile)
        return '';
    if (tile.buildingType)
        return buildingName(tile.buildingType);
    if (coord && world.model.getRiverTile(coord.q, coord.r))
        return t('hud.hoverTooltip.river');
    return terrainName(tile.terrain);
});
const ringCoordLabel = computed(() => {
    const coord = selectedCoord.value;
    if (!coord)
        return '';
    const level = selectedTile.value?.buildingType ? selectedTile.value.buildingLevel ?? 1 : null;
    return level === null
        ? t('hud.ringMenu.hexCoord', { q: coord.q, r: coord.r })
        : t('hud.ringMenu.levelHexCoord', { level, q: coord.q, r: coord.r });
});
const ringOpen = computed(() => !!(selectedTile.value && ringScreen.value));
function onHexClick(coord, tile, screen) {
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
function roomForRing(screen) {
    const shapes = ringShapes(rootActions.value.length, ringCategories.value.map((c) => c.buildings.length));
    return placeRing(canvasRef.value?.renderer, screen, ringBoundsAt, shapes, ringMaxScale.value);
}
// Issue #93 "drag to move a placed waypoint": the renderer resolved the hex
// the pin was dragged onto (snapping happens there, against the same
// isoPixelToAxial a click uses); this just writes it into the draft.
function onWaypointMove(index, coord) {
    if (world.fieldOrderDraft) {
        world.moveFieldOrderWaypoint(index, coord);
        return;
    }
    world.moveWaypoint(index, coord);
}
// Mobile dispatch flow: tapping (not dragging) a draft pin removes it — see
// HexMapRendererOptions.onWaypointTap's own comment for how a tap is told
// apart from a drag.
function onWaypointTap(index) {
    if (world.fieldOrderDraft) {
        world.removeFieldOrderWaypoint(index);
        return;
    }
    world.removeWaypoint(index);
}
// While the ring is open the renderer fades out the canvas markers (dials, the
// realm badge) beneath its footprint; lifted again as soon as the ring unmounts.
function onRingFootprint(circle) {
    canvasRef.value?.renderer?.setMarkerOcclusion(circle);
}
function clearRingFootprint() {
    // A ring reopened during the retract animation has already re-set it.
    if (!ringOpen.value)
        canvasRef.value?.renderer?.setMarkerOcclusion(null);
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
async function onRingSelect(id) {
    const tile = selectedTile.value;
    if (tile && offersBuilding(id)) {
        await buildFromRing(id);
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
            if (selectedCoord.value)
                world.startDispatchAt(selectedCoord.value);
            closeRing();
            return;
        case 'hunt':
            if (selectedCoord.value)
                world.startDispatchAt(selectedCoord.value, { mission: 'hunt' });
            closeRing();
            return;
        case 'siege':
            // The wall's own settlement is the Attack's target (the walls read stamps it on the tile) and the wall hex its preferred building.
            if (selectedCoord.value && tile) {
                const options = siegeAttackOptions(tile, selectedCoord.value);
                if (options)
                    world.startDispatchAt(selectedCoord.value, options);
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
async function buildFromRing(type) {
    const coord = selectedCoord.value;
    if (!world.selectedSettlementId || !coord)
        return;
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
    }
    catch (err) {
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
const buildRefusal = ref(null);
let buildRefusalTimer = null;
function showBuildRefusal(coord, message) {
    buildRefusal.value = { coord, message };
    if (buildRefusalTimer)
        clearTimeout(buildRefusalTimer);
    buildRefusalTimer = setTimeout(() => {
        buildRefusal.value = null;
        buildRefusalTimer = null;
    }, BUILD_REFUSAL_MS);
}
onUnmounted(() => {
    if (buildRefusalTimer)
        clearTimeout(buildRefusalTimer);
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
function describeActionError(err, fallback) {
    return apiErrorMessage(err, fallback);
}
async function upgrade() {
    if (!world.selectedSettlementId || !selectedCoord.value || !selectedTile.value?.buildingType)
        return;
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
    }
    catch (err) {
        console.error('Failed to queue upgrade against the backend', err);
        actionError.value = describeActionError(err, t('hud.ringMenu.errors.couldNotQueueUpgrade'));
        modalBusy.value = false;
    }
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(world, {});
    __VLS_withDotValue(player, {});
    __VLS_withDotValue(mode, {});
    __VLS_withDotValue(showFogDebug, {});
    __VLS_withDotValue(canvasRef, {});
    __VLS_withDotValue(isMobile, {});
    __VLS_withDotValue(hasActiveDraft, {});
    __VLS_withDotValue(hoverInfo, {});
    __VLS_withDotValue(guild, {});
    __VLS_withDotValue(selectedTile, {});
    __VLS_withDotValue(ringScreen, {});
    __VLS_withDotValue(trainModalOpen, {});
    __VLS_withDotValue(buildRefusal, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['fog-debug-stack']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "stageRef",
        ...{ class: "map-view" },
        ...{ style: ({
                '--hud-inset-top': __VLS_unwrap(hudInsetTopPx, {}) + 'px',
                '--hud-inset-bottom': __VLS_unwrap(hudInsetBottomPx, {}) + 'px',
                '--hud-inset-left': __VLS_unwrap(hudInsetLeftPx, {}) + 'px',
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['map-view']} */ ;
    const __VLS_0 = MapStatusOverlay;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ 'onRetry': {} }, step: (__VLS_unwrap(overlayStep, {})), error: (__VLS_unwrap(overlayError, {})),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onRetry': {} },
        step: (__VLS_unwrap(overlayStep, {})),
        error: (__VLS_unwrap(overlayError, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    const __VLS_6 = {
        /** @type {typeof __VLS_5.retry} */
        onRetry: (retryLoad),
    };
    void __VLS_6;
    var __VLS_3;
    var __VLS_4;
    if (world.value.selectedSettlementId) {
        const __VLS_7 = SettlementCanvas;
        // @ts-ignore
        const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
            // @ts-ignore
            ...{ 'onHexClick': {} }, ...{ 'onHover': {} }, ...{ 'onWaypointMove': {} }, ...{ 'onWaypointTap': {} }, ...{ 'onZoomModeChange': {} }, ...{ 'onCameraChange': {} }, ref: "canvasRef", mode: (mode.value), worldModel: (world.value.model), playerId: (player.value.id), settlementId: (world.value.selectedSettlementId), background: (mode.value === 'world' ? __VLS_unwrap(WORLD_SEA_BACKGROUND, {}) : undefined),
        }));
        const __VLS_9 = __VLS_8({
            ...{ 'onHexClick': {} },
            ...{ 'onHover': {} },
            ...{ 'onWaypointMove': {} },
            ...{ 'onWaypointTap': {} },
            ...{ 'onZoomModeChange': {} },
            ...{ 'onCameraChange': {} },
            ref: "canvasRef",
            mode: (mode.value),
            worldModel: (world.value.model),
            playerId: (player.value.id),
            settlementId: (world.value.selectedSettlementId),
            background: (mode.value === 'world' ? __VLS_unwrap(WORLD_SEA_BACKGROUND, {}) : undefined),
        }, ...__VLS_functionalComponentArgsRest(__VLS_8));
        let __VLS_12;
        const __VLS_13 = {
            /** @type {typeof __VLS_12.hexClick} */
            onHexClick: (onHexClick),
        };
        void __VLS_13;
        const __VLS_14 = {
            /** @type {typeof __VLS_12.hover} */
            onHover: (onHover),
        };
        void __VLS_14;
        const __VLS_15 = {
            /** @type {typeof __VLS_12.waypointMove} */
            onWaypointMove: (onWaypointMove),
        };
        void __VLS_15;
        const __VLS_16 = {
            /** @type {typeof __VLS_12.waypointTap} */
            onWaypointTap: (onWaypointTap),
        };
        void __VLS_16;
        const __VLS_17 = {
            /** @type {typeof __VLS_12.zoomModeChange} */
            onZoomModeChange: (onZoomModeChange),
        };
        void __VLS_17;
        const __VLS_18 = {
            /** @type {typeof __VLS_12.cameraChange} */
            onCameraChange: (onCameraChange),
        };
        void __VLS_18;
        var __VLS_10;
        var __VLS_11;
    }
    if (showFogDebug.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "fog-debug-stack" },
        });
        /** @type {__VLS_StyleScopedClasses['fog-debug-stack']} */ ;
        const __VLS_19 = FpsMeter;
        // @ts-ignore
        const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
        // @ts-ignore
        }));
        const __VLS_21 = __VLS_20({}, ...__VLS_functionalComponentArgsRest(__VLS_20));
        const __VLS_24 = ZoomDebugPanel;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
            // @ts-ignore
            renderer: (canvasRef.value?.renderer),
        }));
        const __VLS_26 = __VLS_25({
            renderer: (canvasRef.value?.renderer),
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
        const __VLS_29 = FogDebugPanel;
        // @ts-ignore
        const __VLS_30 = __VLS_asFunctionalComponent1(__VLS_29, new __VLS_29({
            // @ts-ignore
            ...{ 'onChange': {} },
        }));
        const __VLS_31 = __VLS_30({
            ...{ 'onChange': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_30));
        let __VLS_34;
        const __VLS_35 = {
            /** @type {typeof __VLS_34.change} */
            onChange: (onFogDebugChange),
        };
        void __VLS_35;
        var __VLS_32;
        var __VLS_33;
        const __VLS_36 = WaterDebugPanel;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
            // @ts-ignore
            ...{ 'onChange': {} },
        }));
        const __VLS_38 = __VLS_37({
            ...{ 'onChange': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        let __VLS_41;
        const __VLS_42 = {
            /** @type {typeof __VLS_41.change} */
            onChange: (onFogDebugChange),
        };
        void __VLS_42;
        var __VLS_39;
        var __VLS_40;
        const __VLS_43 = WaterPerfPanel;
        // @ts-ignore
        const __VLS_44 = __VLS_asFunctionalComponent1(__VLS_43, new __VLS_43({
        // @ts-ignore
        }));
        const __VLS_45 = __VLS_44({}, ...__VLS_functionalComponentArgsRest(__VLS_44));
        const __VLS_48 = FogPerfPanel;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
        // @ts-ignore
        }));
        const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "hud-scrim" },
        ...{ class: ({ 'hud-scrim--bottom': __VLS_unwrap(hudBarAtBottom, {}) }) },
    });
    /** @type {__VLS_StyleScopedClasses['hud-scrim']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-scrim--bottom']} */ ;
    const __VLS_53 = TopBar || TopBar;
    // @ts-ignore
    const __VLS_54 = __VLS_asFunctionalComponent1(__VLS_53, new __VLS_53({
        // @ts-ignore
        hideTitle: (mode.value === 'settlement'),
    }));
    const __VLS_55 = __VLS_54({
        hideTitle: (mode.value === 'settlement'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_54));
    var __VLS_56;
    const { default: __VLS_58 } = __VLS_nonNull(__VLS_56.slots);
    const __VLS_59 = ResourceBar;
    // @ts-ignore
    const __VLS_60 = __VLS_asFunctionalComponent1(__VLS_59, new __VLS_59({
        // @ts-ignore
        ringOpen: (__VLS_unwrap(ringOpen, {})),
    }));
    const __VLS_61 = __VLS_60({
        ringOpen: (__VLS_unwrap(ringOpen, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_60));
    const __VLS_64 = HudNav;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent1(__VLS_64, new __VLS_64({
        // @ts-ignore
        hasResourceBar: true,
    }));
    const __VLS_66 = __VLS_65({
        hasResourceBar: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    {
        const { drawer: __VLS_69 } = __VLS_nonNull(__VLS_56.slots);
        const [{ close }] = __VLS_vSlot(__VLS_nonNull(__VLS_69));
        const __VLS_70 = MobileHudDrawer;
        // @ts-ignore
        const __VLS_71 = __VLS_asFunctionalComponent1(__VLS_70, new __VLS_70({
            // @ts-ignore
            ...{ 'onClose': {} }, hasResourceBar: true,
        }));
        const __VLS_72 = __VLS_71({
            ...{ 'onClose': {} },
            hasResourceBar: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_71));
        let __VLS_75;
        const __VLS_76 = {
            /** @type {typeof __VLS_75.close} */
            onClose: (close),
        };
        void __VLS_76;
        var __VLS_73;
        var __VLS_74;
        // @ts-ignore
        [hudInsetTopPx, hudInsetBottomPx, hudInsetLeftPx, overlayStep, overlayError, world, world, world, mode, mode, mode, player, WORLD_SEA_BACKGROUND, showFogDebug, canvasRef, hudBarAtBottom, ringOpen,];
    }
    // @ts-ignore
    [];
    if (mode.value === 'settlement') {
        if (isMobile.value) {
            if (!hasActiveDraft.value) {
                const __VLS_77 = QueueDrawer;
                // @ts-ignore
                const __VLS_78 = __VLS_asFunctionalComponent1(__VLS_77, new __VLS_77({
                    // @ts-ignore
                    ...{ 'onSelect': {} }, ...{ 'onSelectArmy': {} }, open: (__VLS_unwrap(queueDrawerOpen, {})),
                }));
                const __VLS_79 = __VLS_78({
                    ...{ 'onSelect': {} },
                    ...{ 'onSelectArmy': {} },
                    open: (__VLS_unwrap(queueDrawerOpen, {})),
                }, ...__VLS_functionalComponentArgsRest(__VLS_78));
                let __VLS_82;
                const __VLS_83 = {
                    /** @type {typeof __VLS_82.select} */
                    onSelect: (onQueueSelect),
                };
                void __VLS_83;
                const __VLS_84 = {
                    /** @type {typeof __VLS_82.selectArmy} */
                    onSelectArmy: (onArmySelect),
                };
                void __VLS_84;
                var __VLS_80;
                var __VLS_81;
            }
        }
        else {
            const __VLS_85 = BuildQueuePanel;
            // @ts-ignore
            const __VLS_86 = __VLS_asFunctionalComponent1(__VLS_85, new __VLS_85({
                // @ts-ignore
                ...{ 'onSelect': {} },
            }));
            const __VLS_87 = __VLS_86({
                ...{ 'onSelect': {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_86));
            let __VLS_90;
            const __VLS_91 = {
                /** @type {typeof __VLS_90.select} */
                onSelect: (onQueueSelect),
            };
            void __VLS_91;
            var __VLS_88;
            var __VLS_89;
            const __VLS_92 = TrainingQueuePanel;
            // @ts-ignore
            const __VLS_93 = __VLS_asFunctionalComponent1(__VLS_92, new __VLS_92({
            // @ts-ignore
            }));
            const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
        }
        const __VLS_97 = ExpansionPanel;
        // @ts-ignore
        const __VLS_98 = __VLS_asFunctionalComponent1(__VLS_97, new __VLS_97({
        // @ts-ignore
        }));
        const __VLS_99 = __VLS_98({}, ...__VLS_functionalComponentArgsRest(__VLS_98));
        if (!hasActiveDraft.value) {
            const __VLS_102 = QuestTray;
            // @ts-ignore
            const __VLS_103 = __VLS_asFunctionalComponent1(__VLS_102, new __VLS_102({
            // @ts-ignore
            }));
            const __VLS_104 = __VLS_103({}, ...__VLS_functionalComponentArgsRest(__VLS_103));
        }
        if (!isMobile.value) {
            const __VLS_107 = ArmyPanel;
            // @ts-ignore
            const __VLS_108 = __VLS_asFunctionalComponent1(__VLS_107, new __VLS_107({
            // @ts-ignore
            }));
            const __VLS_109 = __VLS_108({}, ...__VLS_functionalComponentArgsRest(__VLS_108));
        }
        if (hoverInfo.value) {
            const __VLS_112 = HexTooltip;
            // @ts-ignore
            const __VLS_113 = __VLS_asFunctionalComponent1(__VLS_112, new __VLS_112({
                // @ts-ignore
                info: (hoverInfo.value), friendOwners: (guild.value.friendlyUserIds),
            }));
            const __VLS_114 = __VLS_113({
                info: (hoverInfo.value),
                friendOwners: (guild.value.friendlyUserIds),
            }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        }
        const __VLS_117 = RingMenuHost || RingMenuHost;
        // @ts-ignore
        const __VLS_118 = __VLS_asFunctionalComponent1(__VLS_117, new __VLS_117({
            // @ts-ignore
            ...{ 'onRetracted': {} },
        }));
        const __VLS_119 = __VLS_118({
            ...{ 'onRetracted': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_118));
        let __VLS_122;
        const __VLS_123 = {
            /** @type {typeof __VLS_122.retracted} */
            onRetracted: (clearRingFootprint),
        };
        void __VLS_123;
        var __VLS_120;
        var __VLS_121;
        const { default: __VLS_124 } = __VLS_nonNull(__VLS_120.slots);
        if (selectedTile.value && ringScreen.value) {
            const __VLS_125 = RingMenu;
            // @ts-ignore
            const __VLS_126 = __VLS_asFunctionalComponent1(__VLS_125, new __VLS_125({
                // @ts-ignore
                ...{ 'onSelect': {} }, ...{ 'onClose': {} }, ...{ 'onOutsidePointerDown': {} }, ...{ 'onFootprint': {} }, x: (ringScreen.value.x), y: (ringScreen.value.y), scale: (ringScreen.value.scale), actions: (__VLS_unwrap(rootActions, {})), categories: (__VLS_unwrap(ringCategories, {})), terrainLabel: (__VLS_unwrap(ringTerrainLabel, {})), coordLabel: (__VLS_unwrap(ringCoordLabel, {})), bounds: (__VLS_unwrap(ringBounds, {})), cardBounds: (__VLS_unwrap(ringCardBounds, {})), stock: (world.value.hud.available), error: (__VLS_unwrap(actionError, {})), dock: (__VLS_unwrap(ringDock, {})),
            }));
            const __VLS_127 = __VLS_126({
                ...{ 'onSelect': {} },
                ...{ 'onClose': {} },
                ...{ 'onOutsidePointerDown': {} },
                ...{ 'onFootprint': {} },
                x: (ringScreen.value.x),
                y: (ringScreen.value.y),
                scale: (ringScreen.value.scale),
                actions: (__VLS_unwrap(rootActions, {})),
                categories: (__VLS_unwrap(ringCategories, {})),
                terrainLabel: (__VLS_unwrap(ringTerrainLabel, {})),
                coordLabel: (__VLS_unwrap(ringCoordLabel, {})),
                bounds: (__VLS_unwrap(ringBounds, {})),
                cardBounds: (__VLS_unwrap(ringCardBounds, {})),
                stock: (world.value.hud.available),
                error: (__VLS_unwrap(actionError, {})),
                dock: (__VLS_unwrap(ringDock, {})),
            }, ...__VLS_functionalComponentArgsRest(__VLS_126));
            let __VLS_130;
            const __VLS_131 = {
                /** @type {typeof __VLS_130.select} */
                onSelect: (onRingSelect),
            };
            void __VLS_131;
            const __VLS_132 = {
                /** @type {typeof __VLS_130.close} */
                onClose: (closeRing),
            };
            void __VLS_132;
            const __VLS_133 = {
                /** @type {typeof __VLS_130.outsidePointerDown} */
                onOutsidePointerDown: (onRingOutsidePointerDown),
            };
            void __VLS_133;
            const __VLS_134 = {
                /** @type {typeof __VLS_130.footprint} */
                onFootprint: (onRingFootprint),
            };
            void __VLS_134;
            var __VLS_128;
            var __VLS_129;
        }
        // @ts-ignore
        [world, mode, isMobile, isMobile, hasActiveDraft, hasActiveDraft, queueDrawerOpen, hoverInfo, hoverInfo, guild, selectedTile, ringScreen, ringScreen, ringScreen, ringScreen, rootActions, ringCategories, ringTerrainLabel, ringCoordLabel, ringBounds, ringCardBounds, actionError, ringDock,];
        if (selectedTile.value && !ringScreen.value && !trainModalOpen.value) {
            const __VLS_135 = BuildingModal;
            // @ts-ignore
            const __VLS_136 = __VLS_asFunctionalComponent1(__VLS_135, new __VLS_135({
                // @ts-ignore
                ...{ 'onClose': {} }, ...{ 'onUpgrade': {} }, tile: (selectedTile.value), mine: (__VLS_unwrap(modalMine, {})), ownerLabel: (__VLS_unwrap(modalOwnerLabel, {})), busy: (__VLS_unwrap(modalBusy, {})), error: (__VLS_unwrap(actionError, {})),
            }));
            const __VLS_137 = __VLS_136({
                ...{ 'onClose': {} },
                ...{ 'onUpgrade': {} },
                tile: (selectedTile.value),
                mine: (__VLS_unwrap(modalMine, {})),
                ownerLabel: (__VLS_unwrap(modalOwnerLabel, {})),
                busy: (__VLS_unwrap(modalBusy, {})),
                error: (__VLS_unwrap(actionError, {})),
            }, ...__VLS_functionalComponentArgsRest(__VLS_136));
            let __VLS_140;
            const __VLS_141 = {
                /** @type {typeof __VLS_140.close} */
                onClose: (closeModal),
            };
            void __VLS_141;
            const __VLS_142 = {
                /** @type {typeof __VLS_140.upgrade} */
                onUpgrade: (upgrade),
            };
            void __VLS_142;
            var __VLS_138;
            var __VLS_139;
        }
        if (selectedTile.value?.buildingType && trainModalOpen.value) {
            const __VLS_143 = TrainingModal;
            // @ts-ignore
            const __VLS_144 = __VLS_asFunctionalComponent1(__VLS_143, new __VLS_143({
                // @ts-ignore
                ...{ 'onClose': {} }, ...{ 'onTrained': {} }, building: ({ type: selectedTile.value.buildingType, q: selectedTile.value.q, r: selectedTile.value.r, level: selectedTile.value.buildingLevel ?? 0 }),
            }));
            const __VLS_145 = __VLS_144({
                ...{ 'onClose': {} },
                ...{ 'onTrained': {} },
                building: ({ type: selectedTile.value.buildingType, q: selectedTile.value.q, r: selectedTile.value.r, level: selectedTile.value.buildingLevel ?? 0 }),
            }, ...__VLS_functionalComponentArgsRest(__VLS_144));
            let __VLS_148;
            const __VLS_149 = {
                /** @type {typeof __VLS_148.close} */
                onClose: (closeTrainModal),
            };
            void __VLS_149;
            const __VLS_150 = {
                /** @type {typeof __VLS_148.trained} */
                onTrained: (closeTrainModal),
            };
            void __VLS_150;
            var __VLS_146;
            var __VLS_147;
        }
    }
    else {
        if (isMobile.value && !hasActiveDraft.value) {
            const __VLS_151 = QueueDrawer;
            // @ts-ignore
            const __VLS_152 = __VLS_asFunctionalComponent1(__VLS_151, new __VLS_151({
                // @ts-ignore
                ...{ 'onSelect': {} }, ...{ 'onSelectArmy': {} }, open: (__VLS_unwrap(queueDrawerOpen, {})),
            }));
            const __VLS_153 = __VLS_152({
                ...{ 'onSelect': {} },
                ...{ 'onSelectArmy': {} },
                open: (__VLS_unwrap(queueDrawerOpen, {})),
            }, ...__VLS_functionalComponentArgsRest(__VLS_152));
            let __VLS_156;
            const __VLS_157 = {
                /** @type {typeof __VLS_156.select} */
                onSelect: (onQueueSelect),
            };
            void __VLS_157;
            const __VLS_158 = {
                /** @type {typeof __VLS_156.selectArmy} */
                onSelectArmy: (onArmySelect),
            };
            void __VLS_158;
            var __VLS_154;
            var __VLS_155;
        }
        if (!isMobile.value) {
            const __VLS_159 = ArmyPanel;
            // @ts-ignore
            const __VLS_160 = __VLS_asFunctionalComponent1(__VLS_159, new __VLS_159({
            // @ts-ignore
            }));
            const __VLS_161 = __VLS_160({}, ...__VLS_functionalComponentArgsRest(__VLS_160));
        }
        const __VLS_164 = RingMenuHost || RingMenuHost;
        // @ts-ignore
        const __VLS_165 = __VLS_asFunctionalComponent1(__VLS_164, new __VLS_164({
            // @ts-ignore
            ...{ 'onRetracted': {} },
        }));
        const __VLS_166 = __VLS_165({
            ...{ 'onRetracted': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_165));
        let __VLS_169;
        const __VLS_170 = {
            /** @type {typeof __VLS_169.retracted} */
            onRetracted: (clearRingFootprint),
        };
        void __VLS_170;
        var __VLS_167;
        var __VLS_168;
        const { default: __VLS_171 } = __VLS_nonNull(__VLS_167.slots);
        if (selectedTile.value && ringScreen.value) {
            const __VLS_172 = RingMenu;
            // @ts-ignore
            const __VLS_173 = __VLS_asFunctionalComponent1(__VLS_172, new __VLS_172({
                // @ts-ignore
                ...{ 'onSelect': {} }, ...{ 'onClose': {} }, ...{ 'onOutsidePointerDown': {} }, ...{ 'onFootprint': {} }, x: (ringScreen.value.x), y: (ringScreen.value.y), scale: (ringScreen.value.scale), actions: (__VLS_unwrap(rootActions, {})), categories: (__VLS_unwrap(ringCategories, {})), terrainLabel: (__VLS_unwrap(ringTerrainLabel, {})), coordLabel: (__VLS_unwrap(ringCoordLabel, {})), bounds: (__VLS_unwrap(ringBounds, {})), cardBounds: (__VLS_unwrap(ringCardBounds, {})), stock: (world.value.hud.available), error: (__VLS_unwrap(actionError, {})), dock: (__VLS_unwrap(ringDock, {})),
            }));
            const __VLS_174 = __VLS_173({
                ...{ 'onSelect': {} },
                ...{ 'onClose': {} },
                ...{ 'onOutsidePointerDown': {} },
                ...{ 'onFootprint': {} },
                x: (ringScreen.value.x),
                y: (ringScreen.value.y),
                scale: (ringScreen.value.scale),
                actions: (__VLS_unwrap(rootActions, {})),
                categories: (__VLS_unwrap(ringCategories, {})),
                terrainLabel: (__VLS_unwrap(ringTerrainLabel, {})),
                coordLabel: (__VLS_unwrap(ringCoordLabel, {})),
                bounds: (__VLS_unwrap(ringBounds, {})),
                cardBounds: (__VLS_unwrap(ringCardBounds, {})),
                stock: (world.value.hud.available),
                error: (__VLS_unwrap(actionError, {})),
                dock: (__VLS_unwrap(ringDock, {})),
            }, ...__VLS_functionalComponentArgsRest(__VLS_173));
            let __VLS_177;
            const __VLS_178 = {
                /** @type {typeof __VLS_177.select} */
                onSelect: (onRingSelect),
            };
            void __VLS_178;
            const __VLS_179 = {
                /** @type {typeof __VLS_177.close} */
                onClose: (closeRing),
            };
            void __VLS_179;
            const __VLS_180 = {
                /** @type {typeof __VLS_177.outsidePointerDown} */
                onOutsidePointerDown: (onRingOutsidePointerDown),
            };
            void __VLS_180;
            const __VLS_181 = {
                /** @type {typeof __VLS_177.footprint} */
                onFootprint: (onRingFootprint),
            };
            void __VLS_181;
            var __VLS_175;
            var __VLS_176;
        }
        // @ts-ignore
        [world, isMobile, isMobile, hasActiveDraft, queueDrawerOpen, selectedTile, selectedTile, selectedTile, selectedTile, selectedTile, selectedTile, selectedTile, selectedTile, ringScreen, ringScreen, ringScreen, ringScreen, ringScreen, rootActions, ringCategories, ringTerrainLabel, ringCoordLabel, ringBounds, ringCardBounds, actionError, actionError, ringDock, trainModalOpen, trainModalOpen, modalMine, modalOwnerLabel, modalBusy,];
    }
    if (buildRefusal.value) {
        const __VLS_182 = BuildRefusalChip;
        // @ts-ignore
        const __VLS_183 = __VLS_asFunctionalComponent1(__VLS_182, new __VLS_182({
            // @ts-ignore
            renderer: (canvasRef.value?.renderer), coord: (buildRefusal.value.coord), message: (buildRefusal.value.message),
        }));
        const __VLS_184 = __VLS_183({
            renderer: (canvasRef.value?.renderer),
            coord: (buildRefusal.value.coord),
            message: (buildRefusal.value.message),
        }, ...__VLS_functionalComponentArgsRest(__VLS_183));
    }
    if (isMobile.value && hasActiveDraft.value) {
        const __VLS_187 = MobileDispatchSheet;
        // @ts-ignore
        const __VLS_188 = __VLS_asFunctionalComponent1(__VLS_187, new __VLS_187({
        // @ts-ignore
        }));
        const __VLS_189 = __VLS_188({}, ...__VLS_functionalComponentArgsRest(__VLS_188));
    }
    // @ts-ignore
    [canvasRef, isMobile, hasActiveDraft, buildRefusal, buildRefusal, buildRefusal,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
