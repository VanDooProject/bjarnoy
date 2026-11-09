/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// zip 6a ("Place a building before you sign up"): the landing page IS the
// village view, not a marketing page in front of it. A real plot of terrain
// is on screen immediately; the first interaction is founding a settlement
// right there (no world map, no form). Once founded, the same canvas keeps
// going as a guided tutorial — build two more buildings — before the
// nickname prompt (and only then a route into the full game) appears.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PlayIntroButton from '../intro/PlayIntroButton.vue';
import FeatureList from '../intro/FeatureList.vue';
import ImpressumLink from '../intro/ImpressumLink.vue';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import MapStatusOverlay from '../components/map/MapStatusOverlay.vue';
import { useIntroTilesSignal } from '../composables/useIntroTilesSignal';
import { useLoadFlow } from '../composables/useLoadFlow';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import MobileHudDrawer from '../components/hud/MobileHudDrawer.vue';
import ReturningPlayerMenu from '../components/hud/ReturningPlayerMenu.vue';
import HudNavLink from '../components/hud/HudNavLink.vue';
import MotionPrompt from '../components/onboarding/MotionPrompt.vue';
import BuildQueuePanel from '../components/hud/BuildQueuePanel.vue';
import QueueDrawer from '../components/hud/QueueDrawer.vue';
import RingMenuHost from '../components/hud/RingMenuHost.vue';
import RingMenu from '../components/hud/RingMenu.vue';
import OnboardingChecklist from '../components/onboarding/OnboardingChecklist.vue';
import GuidancePointer from '../components/onboarding/GuidancePointer.vue';
import ResourceTicker from '../components/onboarding/ResourceTicker.vue';
import OnboardingBanner from '../components/onboarding/OnboardingBanner.vue';
import ReturningLoginPanel from '../components/onboarding/ReturningLoginPanel.vue';
import { useBuildRing, categoriesFor } from '../composables/useBuildRing';
import { boundsClearOfDock, ringDockFor } from '../lib/map/ringDock';
import { ringShapes } from '../lib/map/ringLayout';
import { placeRing } from '../lib/map/ringPlacement';
import { useRingMaxScale } from '../composables/useRingMaxScale';
import { buildingStatsAt, scaleOutput } from '../lib/map/buildingEconomy';
import { deriveOnboardingGuidance, findGuidedTarget, guidedRingStep, nextGuidedType, snapToOfferedPlot, GUIDED_BUILD_TERRAIN as GUIDED_TERRAIN_FOR, } from '../lib/map/onboardingGuidance';
import { constructionDialsFromQueue } from '../lib/map/constructionDial';
import { AlreadyFoundedError, useWorldStore } from '../stores/world';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { usePlayerStore } from '../stores/player';
import { isHudDrawerPending } from '../composables/hudDrawerPendingState';
import { useAuthStore } from '../stores/auth';
import { DEMO_MODE } from '../config';
import { ApiError } from '../api/client';
import { hexDistance } from '../lib/hex/coords';
import { claimRadiusForLevel } from '../lib/map/shoreline';
import { ARROW_TIP_GAP_PX, HEX_TARGET_RADIUS_PX, ringBubbleAim } from '../lib/map/guidanceArrowGeometry';
import { buildingName, terrainName } from '../i18n/catalogueNames';
import { useIsMobile } from '../composables/useIsMobile';
import { useMediaQuery } from '../composables/useMediaQuery';
import { hudBarHeightPx, hudRailWidthPx } from '../composables/hudBarHeight';
import { isHudBarAtBottom, isHudRail } from '../composables/hudSettlementBubbleState';
import { HUD_COMPACT_QUERY, TOUCH_QUERY } from '../lib/breakpoints';
import { closeHudDrawer, isHudDrawerOpen } from '../composables/hudDrawerOpenState';
const { t, d, locale } = useI18n({ useScope: 'global' });
// The feature list and the Impressum link read the intro's own texts, which take a plain locale.
// the game's name is not translated
const WORDMARK = 'BJARNØY';
const introLocale = computed(() => (String(locale.value).startsWith('de') ? 'de' : 'en'));
const docsHref = computed(() => router.resolve('/docs').href);
const world = useWorldStore();
const player = usePlayerStore();
const auth = useAuthStore();
const router = useRouter();
// Player logout/login gate: this device remembers a real account
// (`player.lastAccount`, set by logging out — see stores/player.ts's
// `forgetLocalIdentity`) but the visitor is currently anonymous and hasn't
// founded anything on it yet. Shows ReturningLoginPanel in place of the
// founding column/guidance instead of silently letting them start a brand new
// throwaway realm on top of a real account they just logged out of.
// `hasFoundedSettlement` still wins once true — an anonymous founding that
// happened in the same tab (or session) before the visitor got around to
// logging back in should keep going, not get interrupted by the gate.
const showReturningLoginGate = computed(() => !!player.lastAccount && !auth.isAuthenticated && !player.hasFoundedSettlement);
const canvasRef = ref(null);
const previewCoord = ref(null);
// Live mode only: every unclaimed start position worth showing near the
// preview centre. Founding now only ever lands on the exact hex clicked
// (see `startPositionAt`, issue #96), so the player needs to see every
// plot that's actually clickable, not just a single suggested one.
const nearbyStartCoords = ref([]);
const founding = ref(false);
const invalidClickMessage = ref(null);
let invalidClickTimer;
// How often the pre-founding preview re-polls its plot suggestion and
// same-island rivals so the "empty plot" scene reflects other visitors
// founding nearby without a reload — comfortably inside the backend
// reservation's 3-minute sliding TTL. Paused while the tab is hidden (see
// `onVisibilityChange`) rather than wasting requests on a backgrounded tab.
const PREVIEW_POLL_MS = 20000;
let previewPollHandle;
// The pre-founding preview camera biases right so the island clears the left
// column (`.founding-col`, see this file's <style> block: `left: 64px; width:
// 440px`). `screenBiasX` is a *fraction of viewport width* (see
// HexMapRenderer's `biasedCenterX`/`previewFitZoom`), so it can only be read
// off the column's pixel geometry against some reference viewport width.
// 1440 is that reference: the narrowest viewport this framing is verified
// against. For a fixed fraction the clearance in pixels grows with the
// viewport, so the guarantee (the preview island's worst-case crop, a full
// WorldModel.PREVIEW_ISLAND_RADIUS disc, clears the column and does not touch
// the right edge, see HexMapRenderer.test.ts) holds at 1440 and only gets more
// comfortable at any wider viewport.
const COLUMN_REFERENCE_VIEWPORT_WIDTH_PX = 1440;
const COLUMN_RIGHT_EDGE_PX = 64 + 440; // `.founding-col`'s own left + width, below
const COLUMN_MIN_GUTTER_PX = 40; // breathing room past the column's edge before the island may start
const LANDING_PREVIEW_SCREEN_BIAS_X = (COLUMN_RIGHT_EDGE_PX + COLUMN_MIN_GUTTER_PX) / (2 * COLUMN_REFERENCE_VIEWPORT_WIDTH_PX);
// L7 (landing-page-defects.md): the backend already has a settlement for
// this owner that the browser doesn't know about — most often L6b (founding
// succeeded server-side on an earlier visit, but the client never got to
// persist `bjarnoy.settlementId`). Shared by every place that can discover
// this (`onMounted`, the preview poll, and a race caught inside
// `foundHere`'s catch below) so the recovery order is only written once.
// Order matters: `player.foundSettlement` writes `bjarnoy.settlementId` to
// localStorage FIRST — that's exactly what the router guard
// (`router/index.ts`) checks before it lets `/settlement` load. Pushing
// there before this would just bounce straight back to `/` (L7's bug #2:
// the one existing `AlreadyFounded` handler used to do exactly that).
async function recoverAlreadyFounded(settlementId) {
    player.foundSettlement(settlementId);
    await world.restoreLiveSettlement(player.id, settlementId);
    router.push('/settlement');
}
async function refreshPreview() {
    const result = await world.refreshPlotSuggestion(player.id);
    if (result.kind === 'alreadyFounded') {
        // Terminal for this poll — nothing left to preview, and repeating this
        // request would just 409 forever (this is what used to happen: the
        // unhandled rejection fired again every PREVIEW_POLL_MS).
        stopPreviewPoll();
        await recoverAlreadyFounded(result.settlementId);
        return;
    }
    if (result.kind === 'noPlotAvailable') {
        stopPreviewPoll();
        noPlotAvailable.value = true;
        return;
    }
    await world.refreshWorldSettlements();
    const suggestion = world.plotSuggestion;
    if (!suggestion)
        return;
    if (result.changed) {
        previewCoord.value = suggestion.plot;
        nearbyStartCoords.value = [suggestion.plot, ...suggestion.alternatives];
        canvasRef.value?.renderer?.updateOptions({
            previewCenter: suggestion.plot,
            highlightCoords: nearbyStartCoords.value,
        });
    }
}
function startPreviewPoll() {
    stopPreviewPoll();
    previewPollHandle = setInterval(() => {
        if (document.visibilityState === 'hidden')
            return;
        void refreshPreview();
    }, PREVIEW_POLL_MS);
}
function stopPreviewPoll() {
    if (previewPollHandle !== undefined) {
        clearInterval(previewPollHandle);
        previewPollHandle = undefined;
    }
}
// What the landing page is waiting on, shown by MapStatusOverlay — without it
// a slow load is an empty backdrop and a failed one an unhandled rejection
// with the page fogged forever. Re-runnable (the overlay's Retry calls it
// again): bootstrapLiveWorld is idempotent via liveReady, startHudSync stops
// its own previous timers, and the preview poll is stopped up front so a
// retry never leaves two of them running.
const { step: loadStep, error: loadError, settled: loadSettled, run: loadLanding, } = useLoadFlow(async (setStep) => {
    stopPreviewPoll();
    setStep(t('hud.mapStatus.joiningWorld'));
    await world.bootstrapLiveWorld();
    if (player.hasFoundedSettlement && player.settlementId) {
        setStep(t('hud.mapStatus.loadingSettlement'));
        await world.restoreLiveSettlement(player.id, player.settlementId);
        world.startHudSync();
        return;
    }
    // Deterministic starter plot: same island every time, near the world's
    // own origin — not chosen by panning a world map (there is none here).
    //
    // Demo mode has no start positions at all, so it previews/founds via
    // `findLandfall`, an arbitrary walkable hex. Live mode asks the backend
    // for a plot suggestion (see `PlotReservationService`) — pinned per
    // player across reloads — and previews exactly that; `nearbyStartCoords`
    // below (the suggestion's own advisory alternatives) is what's actually
    // clickable alongside it.
    if (DEMO_MODE) {
        previewCoord.value = world.model.findLandfall({ q: 0, r: 0 }) ?? { q: 0, r: 0 };
    }
    else {
        setStep(t('hud.mapStatus.findingPlot'));
        const result = await world.refreshPlotSuggestion(player.id);
        if (result.kind === 'alreadyFounded') {
            // L7: a reload with a stale/missing localStorage settlement id — the
            // backend still knows about this owner's settlement, so recover
            // straight into it instead of leaving `previewCoord` (and thus the
            // canvas, `v-if` below) empty forever, which is what an uncaught 409
            // used to do here.
            await recoverAlreadyFounded(result.settlementId);
            return;
        }
        if (result.kind === 'noPlotAvailable') {
            // L7: every start position in the world is taken or held. There's
            // nothing to preview or click — fall back to the `joinBlocked` column
            // (below) instead of a blank canvas.
            noPlotAvailable.value = true;
            return;
        }
        await world.refreshWorldSettlements();
        const suggestion = world.plotSuggestion;
        previewCoord.value = suggestion?.plot ?? world.model.findLandfall({ q: 0, r: 0 }) ?? { q: 0, r: 0 };
        nearbyStartCoords.value = suggestion ? [suggestion.plot, ...suggestion.alternatives] : [];
        startPreviewPoll();
    }
    // Same test/debug-hook idea as SettlementView's own __settlementRenderer:
    // lets an e2e test convert a real hex coordinate to an exact click point
    // via the renderer's own camera math, instead of guessing pixel offsets
    // that only happen to land right at one particular zoom/camera framing.
    // Installed in *both* modes (not just DEMO_MODE) — it's a read-only
    // camera-math accessor that exposes nothing a player couldn't already
    // compute from the visible canvas, and the live Aspire e2e suite
    // (LiveFrontendTestHelpers.cs) is its only consumer in live mode, needing
    // it for the same reason: deriving the real founding click point instead
    // of a hardcoded fraction of the viewport (see that file's own remarks).
    window.__settlementRenderer = () => canvasRef.value?.renderer;
});
onMounted(loadLanding);
// The ring's costs, build times and prerequisites come from the building catalogue, like on the map.
onMounted(() => void useBuildingCatalogueStore().load());
// A founded player's canvas exists as soon as the settlement is restored, but
// the fog quads stay opaque until the mask arrives — say so instead of showing
// a bare fogged map. Not while the load itself is running (its own step wins).
const revealingMap = computed(() => !loadStep.value &&
    !loadError.value &&
    player.hasFoundedSettlement &&
    !!world.selectedSettlementId &&
    world.fogMaskBitmap === null &&
    !world.fogMaskError);
const overlayStep = computed(() => loadStep.value ?? (revealingMap.value ? t('hud.mapStatus.revealingMap') : null));
// The first fog mask fetch failing (nothing to show yet) is as fatal for the
// view as the load failing; later poll failures keep the old bitmap and are
// the connection banner's business instead.
const overlayError = computed(() => loadError.value ?? (world.fogMaskBitmap === null && player.hasFoundedSettlement ? world.fogMaskError : null));
const landingCanvasShown = computed(() => !!(player.hasFoundedSettlement ? world.selectedSettlementId : previewCoord.value));
useIntroTilesSignal({
    settled: loadSettled,
    error: overlayError,
    canvasShown: landingCanvasShown,
    loadState: computed(() => canvasRef.value?.loadState),
    animLoad: computed(() => canvasRef.value?.animLoad),
});
function retryLoad() {
    if (loadError.value)
        void loadLanding();
    else
        void world.fetchFogMask();
}
onUnmounted(() => {
    world.stopHudSync();
    stopPreviewPoll();
    clearTimeout(invalidClickTimer);
    delete window.__settlementRenderer;
});
// L7 (landing-page-defects.md): `PlotSuggestionRejection.NoPlotAvailable` —
// every start position across every island is currently taken or held.
// Distinct from the admin-set gates below (this is organic exhaustion, not a
// world setting), but reads the same to a visitor: nothing to click, so it
// folds into the same `joinBlocked` column instead of leaving the canvas blank
// (`onMounted`/`refreshPreview` set this rather than a plain reload fixing
// it, since a stale world can genuinely run out).
const noPlotAvailable = ref(false);
// Admin-set gates (issue #27): a world that hasn't started yet, or has had
// joins closed, still renders (existing players restore fine) but refuses a
// *new* founding — so tell the player why instead of letting them click a
// hex that will just come back 409.
const joinBlocked = computed(() => (!DEMO_MODE && !player.hasFoundedSettlement && !world.worldJoinable) || noPlotAvailable.value);
const joinBlockedMessage = computed(() => {
    if (noPlotAvailable.value) {
        return t('landing.joinBlocked.noPlotAvailable');
    }
    if (world.worldJoinableReason === 'NotStartedYet' && world.worldStartsAt) {
        const startsAt = new Date(world.worldStartsAt);
        return t('landing.joinBlocked.opensAt', { date: d(startsAt, 'long') });
    }
    if (world.worldJoinableReason === 'JoinsClosed') {
        return t('landing.joinBlocked.joinsClosed');
    }
    if (world.worldJoinableReason === 'NoWorldYet') {
        return t('landing.joinBlocked.noWorldYet');
    }
    return t('landing.joinBlocked.notAcceptingPlayers');
});
// Guided checklist (design handoff "2a"): derived purely from what's
// actually standing rather than a fixed step order — see
// onboardingGuidance.ts's own doc comment. This is also now the single
// source of truth for "is onboarding done" (previously a separate
// count-of-any-building-type check, `buildingsPlaced >= 3`) — the checklist
// already tells the player completion means both guided buildings, not any
// three, so the actual gate matches what's on screen.
const guidance = computed(() => deriveOnboardingGuidance(player.hasFoundedSettlement, world.hud.placedBuildingTypes));
// Persists the moment it's genuinely true, independent of whether the
// player has seen/dismissed the completion banner — covers both "just
// crossed the threshold" and "arrived here mid-onboarding, already past it"
// (a reload right as the last build order completed).
watch(() => guidance.value.complete, (complete) => {
    if (complete)
        player.completeOnboarding();
}, { immediate: true });
// The "Name your jarl" nudge and the completion banner used to show side by
// side, two calls to action at once. While the nudge floats on screen it is
// the only one; the banner (and its "Enter your settlement") follows once
// the player registers or picks "Later". Same gate as HudNav.vue's
// `showProfileNudge`; a nudge tucked into the phone drawer
// (`isHudDrawerPending`) is not on screen, so the banner stays then.
const profileNudgeFloating = computed(() => player.onboardingComplete &&
    !auth.isAuthenticated &&
    !player.nickname &&
    !player.profileNudgeDismissed &&
    !isHudDrawerPending.value);
const showCompletionBanner = computed(() => guidance.value.complete && !profileNudgeFloating.value);
function onContinueToSettlement() {
    router.push('/settlement');
}
// Ring menu state for the onboarding build step: the same two-lane ring the settlement map shows (Build ->
// categories -> buildings), fed by the same useBuildRing model, so it offers exactly what the map offers on the hex.
const ringMaxScale = useRingMaxScale();
const ringScreen = ref(null);
const ringCoord = ref(null);
const ringTile = ref(null);
const ringError = ref(null);
const { categories: ringCategories, canBuildHere, offersBuilding, placeBuildingDemo } = useBuildRing(ringTile, ringCoord);
// Every ring bubble's screen spot (the Build hub, categories, buildings), keyed by id - from RingMenu's own
// `layout` emit, so the pointer aims at exactly where the bubble is actually drawn.
// Every bubble as a circle (RingMenu's `bubbles` emit): the spots the pointer aims at, and the circles it keeps clear of.
const ringBubbles = ref([]);
const ringLaneSpots = computed(() => Object.fromEntries(ringBubbles.value.filter((b) => b.id !== 'hub' && b.id !== 'back').map((b) => [b.id, { x: b.x, y: b.y }])));
const isMobile = useIsMobile();
const queueDrawerOpen = ref(false);
// Finding #12: mirrors MapView.vue's own hudInset*Px exactly — this view's
// post-founding TopBar can dock to the bottom too (the same global
// `hudPrefs.barPosition` preference), and QueueDrawer.vue now reads these
// CSS custom properties to stay clear of the bar on either edge instead of
// assuming it's always at the top.
const isCompactHudLanding = useMediaQuery(HUD_COMPACT_QUERY);
const isTouch = useMediaQuery(TOUCH_QUERY);
// Mobile tutorial focus (owner decision): on phones, once a settlement is
// founded the guided build steps are the whole show — the top HUD bar (and
// everything it carries: the settlement-name bubble, the pull-down drawer)
// is unmounted entirely rather than merely hidden, so nothing else on
// screen competes with the tutorial. It comes back the moment onboarding
// finishes (`guidance.complete`), when the completion banner hands off to
// the full game. Desktop, and the pre-founding column/floating
// "I already have a realm" menu, are unaffected — this only ever swaps the *founded*-branch
// TopBar below.
const hideBarForTutorial = computed(() => isCompactHudLanding.value && player.hasFoundedSettlement && !guidance.value.complete);
// The bar's *effective* edge (TopBar publishes it), not the raw preference.
const hudBarAtBottomLanding = computed(() => isCompactHudLanding.value && isHudBarAtBottom.value);
// While the bar is unmounted for the tutorial there is no bar height to
// clear at all — `hudBarHeightPx` resets to its 64px *default* (not 0) when
// TopBar unmounts (see its own onBeforeUnmount), so this can't just rely on
// that ref alone without re-introducing a stale 64px gap under nothing.
//
// Before founding there is no bar at all (the floating top-right group is
// small chrome, not a band), so nothing is reserved at the top then.
const hudInsetTopPxLanding = computed(() => {
    if (!player.hasFoundedSettlement)
        return 0;
    return hideBarForTutorial.value || hudBarAtBottomLanding.value ? 0 : hudBarHeightPx.value;
});
// Landscape rail mode (TopBar.vue): no top band (hudBarHeightPx is 0 there),
// the rail's width goes into `--hud-inset-left` instead.
const hudInsetLeftPxLanding = computed(() => hideBarForTutorial.value || !isHudRail.value ? 0 : hudRailWidthPx.value + 8);
const hudInsetBottomPxLanding = computed(() => !hideBarForTutorial.value && hudBarAtBottomLanding.value ? hudBarHeightPx.value : 0);
watch(ringScreen, (screen) => {
    if (!screen)
        ringBubbles.value = [];
});
// Mirrors MapView.vue's own combined lock — the mobile queue drawer and the
// HUD pull-down drawer (post-founding, HudNav's own) both float over the
// canvas the same way the ring does while open.
watch(() => !!ringScreen.value || queueDrawerOpen.value || isHudDrawerOpen.value, (locked) => canvasRef.value?.renderer?.setInteractionLocked(locked));
// Finding #12: same mutual exclusion as MapView.vue — see that view's own
// comment.
watch(queueDrawerOpen, (open) => {
    if (open)
        closeHudDrawer();
});
watch(isHudDrawerOpen, (open) => {
    if (open)
        queueDrawerOpen.value = false;
});
// Root of the ring: Build, offered only on a hex that takes something (the map's rule; no dead button).
const ringActions = computed(() => canBuildHere.value ? [{ id: 'build', label: t('hud.ringMenu.actions.build') }] : []);
// The hub names the tile the menu is anchored to: its bare terrain plus the hex coordinate.
const ringTerrainLabel = computed(() => (ringTile.value ? terrainName(ringTile.value.terrain) : ''));
const ringCoordLabel = computed(() => ringCoord.value ? t('hud.ringMenu.hexCoord', { q: ringCoord.value.q, r: ringCoord.value.r }) : '');
// Same phone docking and bounds rules as the map's ring (lib/map/ringDock.ts), measured against the window.
function ringDockAt(x) {
    return ringDockFor({
        compact: isCompactHudLanding.value,
        width: window.innerWidth,
        height: window.innerHeight,
        x,
    });
}
/** The ring's area with the tile at screen x (the landscape dock goes on the side away from it). */
function ringBoundsAt(x) {
    return boundsClearOfDock({
        left: 16,
        top: hudInsetTopPxLanding.value + 12,
        right: window.innerWidth - 16,
        bottom: window.innerHeight - (hudInsetBottomPxLanding.value + 16),
    }, ringDockAt(x), { width: window.innerWidth, height: window.innerHeight, insetBottom: hudInsetBottomPxLanding.value });
}
const ringDock = computed(() => (ringScreen.value ? ringDockAt(ringScreen.value.x) : null));
const ringBounds = computed(() => ringBoundsAt(ringScreen.value?.x ?? window.innerWidth / 2));
function closeRing() {
    ringScreen.value = null;
    ringCoord.value = null;
    ringTile.value = null;
    ringError.value = null;
}
function showInvalidClickMessage(message) {
    clearTimeout(invalidClickTimer);
    invalidClickMessage.value = message;
    invalidClickTimer = setTimeout(() => (invalidClickMessage.value = null), 2500);
}
// Live mode only: an explicit mirror of the backend's actual buildable range
// (`Settlement.ClaimRadius`, via `claimRadiusForLevel`) — `WorldModel.borderRadius`
// (what marks a tile's `ownerId`, and thus what reads as "your territory" on
// screen) now uses the same formula, so this is no longer closing a gap
// between the two, just making the backend's own rule explicit here rather
// than relying on that agreement implicitly. `Settlement.Claims` (what the
// backend actually gates new construction against) is the union of the
// centre disc and every placed Tower's own satellite disc — but this
// onboarding flow only ever places the very first Reindeer Herder/Lumberjack, before
// any Tower exists, so the centre disc alone is already the exact same
// range at this point in a player's settlement; `claimRadiusForLevel` stays
// a faithful enough mirror here without needing the fuller `claimDiscs`
// machinery TrainingModal.vue uses once towers are in play. Demo mode has no
// backend to mirror, so its own `tile.ownerId` (bounded by the same
// `borderRadius`) is already the full truth.
function withinBuildableRange(coord) {
    if (DEMO_MODE || !world.selectedSettlementId)
        return true;
    const settlement = world.model.getSettlement(world.selectedSettlementId);
    if (!settlement)
        return false;
    return hexDistance({ q: settlement.q, r: settlement.r }, coord) <= claimRadiusForLevel(settlement.level);
}
// Design handoff "2a": the nearest still-buildable hex for whichever guided
// building isn't placed yet — what the map pointer (frames 2/4, "Now build
// here" / "One more — the {terrain}") aims at. `findGuidedTarget` itself is
// pure (onboardingGuidance.ts); this just supplies it with this settlement's
// centre/claim radius and a terrain/buildability lookup against the real
// WorldModel, mirroring onHexClick's own buildable-tile rule above.
const nextGuidedTargetCoord = computed(() => {
    if (!player.hasFoundedSettlement || !world.selectedSettlementId)
        return null;
    const settlement = world.model.getSettlement(world.selectedSettlementId);
    if (!settlement)
        return null;
    const type = nextGuidedType(world.hud.placedBuildingTypes);
    if (!type)
        return null;
    return findGuidedTarget({ q: settlement.q, r: settlement.r }, claimRadiusForLevel(settlement.level), type, (c) => world.model.getTile(c.q, c.r).terrain, (c) => {
        const tile = world.model.getTile(c.q, c.r);
        return world.isRealmSettlement(tile.ownerId) && !tile.buildingType;
    });
});
// Frame 2: the landfall banner is the moment right after founding, before
// the player has even opened the ring for the first guided building — gone
// the instant they do (the ring/note/pointer take over telling the story),
// so it never overlaps the completion banner.
const showLandfallBanner = computed(() => player.hasFoundedSettlement && world.hud.placedBuildingTypes.length <= 1 && !ringScreen.value);
// The single animated pointer: which hex (or, with the ring open, which
// screen spot) it aims at and what it says, across every pre-completion
// screen. `mode: 'hex'` follows the camera via GuidancePointer's own
// useMapAnchor; `mode: 'screen'` is the ring-open case, a fixed point since
// opening the ring already locks camera drag.
// The plot the pointer aims at isn't on screen until the terrain atlas has
// loaded (MapLoadingIndicator's centred overlay covers that phase) — an arrow
// and "Click this plot" over an empty canvas point at nothing.
const mapDrawn = computed(() => (canvasRef.value?.loadState.phase ?? 'terrain') !== 'terrain');
/** The open ring's next guided step, with its label; null when the next guided building isn't offered on this hex. */
function ringStepTarget() {
    const type = nextGuidedType(world.hud.placedBuildingTypes);
    if (!type)
        return null;
    const step = guidedRingStep(type, ringCategories.value, ringLaneSpots.value);
    if (!step)
        return null;
    if (step.kind === 'building') {
        return { id: step.id, spot: step.spot, label: t('landing.pointer.buildThis', { building: buildingName(type) }) };
    }
    if (step.kind === 'build')
        return { id: 'build', spot: step.spot, label: t('landing.pointer.openBuild') };
    const category = ringCategories.value.find((c) => c.id === step.id);
    return { id: step.id, spot: step.spot, label: t('landing.pointer.openCategory', { category: category?.label ?? '' }) };
}
// Bumped by the checklist's current step: GuidancePointer plays one poke per change.
const pointerNudge = ref(0);
const pointerTarget = computed(() => {
    if (joinBlocked.value)
        return null;
    // Player logout/login gate: ReturningLoginPanel replaces the founding
    // column, so "click this plot" guidance pointing at a plot the gate is
    // covering would be actively misleading.
    if (showReturningLoginGate.value)
        return null;
    const ringStep = ringScreen.value ? ringStepTarget() : null;
    if (ringStep && ringScreen.value) {
        // One rule for every ring bubble: the tip rests just outside its rim, coming in from outside the ring, swung
        // round only as far as it takes to stay on screen and off the other bubbles.
        const target = ringBubbles.value.find((b) => b.id === ringStep.id);
        const aim = ringBubbleAim(ringScreen.value, target, ringBubbles.value.filter((b) => b !== target), ringBounds.value);
        return {
            mode: 'screen',
            screen: ringStep.spot,
            label: ringStep.label,
            angle: aim.angle,
            targetRadius: aim.targetRadius,
            tipGap: aim.gap,
            scale: aim.scale,
        };
    }
    if (!player.hasFoundedSettlement) {
        if (!previewCoord.value)
            return null;
        return {
            mode: 'hex',
            coord: previewCoord.value,
            label: DEMO_MODE
                ? isTouch.value ? t('landing.pointer.tapThisPlot') : t('landing.pointer.clickThisPlot')
                : t('landing.pointer.anyGlowingPlot'),
            angle: 38,
            targetRadius: HEX_TARGET_RADIUS_PX,
            tipGap: ARROW_TIP_GAP_PX,
            scale: 1,
        };
    }
    if (!nextGuidedTargetCoord.value)
        return null;
    // Right after founding (only the longhouse is down) vs. one guided
    // building already placed — matches the mockup's frame 2 vs. frame 4
    // copy/angle.
    const oneDone = world.hud.placedBuildingTypes.length > 1;
    const remainingType = nextGuidedType(world.hud.placedBuildingTypes);
    return {
        mode: 'hex',
        coord: nextGuidedTargetCoord.value,
        label: oneDone && remainingType
            ? t('landing.pointer.oneMore', { terrain: terrainName(GUIDED_TERRAIN_FOR[remainingType]) })
            : t('landing.pointer.nowBuildHere'),
        angle: oneDone ? 52 : 38,
        targetRadius: HEX_TARGET_RADIUS_PX,
        tipGap: ARROW_TIP_GAP_PX,
        scale: 1,
    };
});
function onHexClick(coord, tile, screen) {
    if (!player.hasFoundedSettlement) {
        // Player logout/login gate: a click on the preview must not found a
        // throwaway settlement while ReturningLoginPanel is offering to log
        // back into a real one — the panel's own "Start a new realm instead"
        // button is the only way to fall through to founding here.
        if (showReturningLoginGate.value)
            return;
        if (tile.terrain === 'sea' || tile.terrain === 'lake' || founding.value || joinBlocked.value)
            return;
        // Live mode only founds on an exact, unclaimed start position (see
        // `startPositionAt`, issue #96) — a click elsewhere used to silently
        // found on the nearest one instead; that's gone (issue #96 covers why),
        // but landing-page-defects.md L6a found the resulting hard refusal was
        // itself the bigger problem: six offered plots among ~150 drawn tiles
        // (L3) makes a miss the common case, not the exception. So a near-miss
        // — exactly one hex off a single offered plot, unambiguously — founds
        // there instead of refusing (`snapToOfferedPlot`; see its own comment
        // for why it stays conservative rather than snapping to "nearest
        // offered plot" at any distance). A genuine miss gets a nudge, not a
        // refusal, plus a flash on the highlighted plots so the player is shown
        // where to go rather than only told.
        if (!DEMO_MODE && !world.startPositionAt(coord)) {
            const snapped = snapToOfferedPlot(coord, nearbyStartCoords.value);
            if (snapped) {
                void foundHere(snapped);
                return;
            }
            showInvalidClickMessage(t('landing.invalidClick.pickGlowingPlot'));
            canvasRef.value?.renderer?.pulseAttention();
            return;
        }
        void foundHere(coord);
        return;
    }
    // Onboarding only ever needs to place a new building on an empty tile in
    // your own border — there's no upgrade/raze/info flow here (that's the
    // full settlement view's job once onboarding hands off to it), so any
    // other click (the longhouse, a rival's tile, open water) just closes
    // whatever ring is open rather than opening some other UI for it.
    if (world.isRealmSettlement(tile.ownerId) && !tile.buildingType && categoriesFor(tile).length > 0) {
        if (!withinBuildableRange(coord)) {
            showInvalidClickMessage(t('landing.invalidClick.beyondClaim'));
            closeRing();
            return;
        }
        ringCoord.value = coord;
        ringTile.value = tile;
        ringError.value = null;
        // After the tile is set: the categories the ring will offer decide how much room it needs.
        ringScreen.value = placeRing(canvasRef.value?.renderer, screen, ringBoundsAt, ringShapes(ringActions.value.length, ringCategories.value.map((c) => c.buildings.length)), ringMaxScale.value);
        return;
    }
    closeRing();
}
// Design handoff "2a" frames 2/4/5: a rising "+N {resource}/h" the moment a
// guided building is actually placed, at its own real output
// (buildingEconomy.ts — the same formula the hover tooltip/build card use),
// not an invented number. Fires in both demo and live mode alike, since
// it's derived from the building's own static definition rather than
// world.hud.rates — which live mode's poll updates for real, but demo mode
// fixes at founding and never changes (see WorldModel.foundSettlement), so
// a rates-delta watch would never fire there at all.
const resourceTicks = ref([]);
let tickIdSeq = 0;
function fireResourceTick(type, coord) {
    // The same output, at the world's speed, as the hover card shows for this building.
    const stats = buildingStatsAt(type, 1, coord, (q, r) => world.model.getTile(q, r));
    const output = stats.output && scaleOutput(stats.output, world.worldSpeedFactor);
    const screen = canvasRef.value?.renderer?.hexCenterScreen(coord);
    if (!screen || output?.kind !== 'resourceRate')
        return;
    resourceTicks.value.push({ id: ++tickIdSeq, resource: output.resource, amount: output.amount, ...screen });
}
function onResourceTickExpire(id) {
    resourceTicks.value = resourceTicks.value.filter((tick) => tick.id !== id);
}
// Choosing a building goes through the same place/queue path as the map's ring (useBuildRing's demo placement,
// the world store's optimistic queue); only the onboarding extras (resource tick, checklist) live here.
async function onRingSelect(id) {
    const coord = ringCoord.value;
    if (!world.selectedSettlementId || !coord || !offersBuilding(id))
        return;
    const type = id;
    const cost = ringCategories.value.flatMap((c) => c.buildings).find((b) => b.id === type)?.cost;
    if (DEMO_MODE) {
        if (!placeBuildingDemo(type, coord)) {
            // No optimistic phase in the demo: the ring stays open with the reason in it, like the map's.
            ringError.value = t('hud.ringMenu.errors.couldNotQueueBuild');
            return;
        }
        canvasRef.value?.renderer?.forceRebuild();
        closeRing();
        if (type === 'reindeerherder' || type === 'lumberjack')
            fireResourceTick(type, coord);
        return;
    }
    // Always close, win or lose - matching the map's ring. A failed order used to leave the ring open
    // with only a console.error, which is the "ring fails to close" bug.
    closeRing();
    try {
        await world.queueBuildOptimistic(type, coord, cost);
        if (type === 'reindeerherder' || type === 'lumberjack')
            fireResourceTick(type, coord);
    }
    catch (err) {
        console.error('Failed to queue building against the backend', err);
        showInvalidClickMessage(t('landing.invalidClick.orderFailed'));
    }
}
// Issue: "the build countdowns like in settlement view should appear" —
// BuildQueuePanel already reads world.hud.queue (populated by the
// startHudSync() call in foundHere/onMounted below); it just wasn't
// mounted here. Selecting a queued order pans/flashes it, same as
// SettlementView's own onQueueSelect.
let queueFlashTimeout = null;
function onQueueSelect(coord) {
    const renderer = canvasRef.value?.renderer;
    if (!renderer)
        return;
    renderer.panTo(coord);
    renderer.setHighlight(coord);
    if (queueFlashTimeout)
        clearTimeout(queueFlashTimeout);
    queueFlashTimeout = setTimeout(() => {
        renderer.setHighlight(undefined);
        queueFlashTimeout = null;
    }, 2200);
}
async function foundHere(coord) {
    founding.value = true;
    // Stopped *before* the founding request, not after it returns. The window
    // between the two is not instant — it is a network round trip, and L6b now
    // marks the player founded the moment that POST resolves — so a poll tick
    // landing anywhere in there asks for a plot suggestion this owner is about
    // to stop being entitled to, and the backend answers 409
    // (PlotSuggestionRejection.AlreadyFounded). Harmless to the flow (L7
    // recovers from it) but not harmless in general: the browser logs every
    // non-2xx as a console error, which is what `PageConsoleErrors`-based e2e
    // assertions read, and a request whose only possible answers are "the plot
    // you already have" or "you already founded" is not worth sending at all.
    // A failed founding restarts it below.
    stopPreviewPoll();
    try {
        const realmName = player.nickname
            ? t('landing.foundHere.namedRealm', { nickname: player.nickname })
            : t('landing.foundHere.unnamedRealm');
        const settlement = DEMO_MODE
            ? world.foundStartingSettlement(player.id, player.ownerName, realmName, coord)
            : await world.foundStartingSettlementLive(player.id, player.ownerName, realmName, coord);
        player.foundSettlement(settlement.id);
        world.startHudSync();
        // (The preview poll is already stopped — see the top of this function.
        // It matters that it stays stopped: this view stays mounted after
        // founding, flipped into settlement mode in place rather than
        // unmounting, so onUnmounted's own stopPreviewPoll() won't run for a
        // long while yet.)
        // The canvas was mounted in preview mode (no settlementId yet) — flip it
        // into a real settlement view in place, same camera, no remount. Also
        // drops screenBiasX back to 0: the left column (the only reason to bias
        // the village off-centre) is hidden the moment a settlement exists, so
        // the fogged view goes back to exactly SettlementView's own centred
        // zoomForFogMargin camera — otherwise the bias pushes one edge of the
        // viewport past the margin that guarantees full opaque fog, letting a
        // neighbouring island show through unfogged on that side.
        canvasRef.value?.renderer?.updateOptions({
            settlementId: settlement.id,
            previewCenter: undefined,
            highlightCoord: undefined,
            highlightCoords: undefined,
            screenBiasX: 0,
            lockCamera: false,
        });
        // Design handoff "2a" frame 2: the one-shot landfall burst, fired
        // alongside the camera move/fog reveal above.
        canvasRef.value?.renderer?.setLandfallBurst(coord);
    }
    catch (err) {
        // L7: `AlreadyFoundedError` is what `foundStartingSettlementLive`'s own
        // preflight (its re-request of the plot suggestion, right before
        // founding) throws when it discovers this owner already has a
        // settlement — the common case, and it already carries the id. This
        // used to be a bare `router.push('/settlement')`, which the router
        // guard (router/index.ts) silently bounced back to `/` because
        // `player.hasFoundedSettlement` was still false at that point — see
        // `recoverAlreadyFounded`'s own comment for why the order below matters.
        if (err instanceof AlreadyFoundedError) {
            await recoverAlreadyFounded(err.settlementId);
            return;
        }
        // Rare race: the founding POST itself (`api.foundSettlement`), not the
        // preflight above, hit `FoundingRejection.AlreadyFounded` — state
        // changed in the gap between the two. `SettlementEndpoints.Problem`
        // doesn't attach an `existingSettlementId` to this rejection (unlike the
        // plot-suggestion endpoint's), so ask plot-suggestion once more: the
        // owner is now unambiguously already-founded, so it 409s the same way,
        // this time with the id.
        if (err instanceof ApiError && err.problem?.rejection === 'AlreadyFounded') {
            const recheck = await world.refreshPlotSuggestion(player.id);
            if (recheck.kind === 'alreadyFounded') {
                await recoverAlreadyFounded(recheck.settlementId);
                return;
            }
        }
        // A 409 covers several distinct rejections (see FoundingRejection) — the
        // remaining ones (PlotReserved, PlotTaken, TooCloseToNeighbour, ...)
        // mean someone else claimed or reserved a start position between the
        // last refresh and this click — re-request the suggestion so the
        // preview shows a plot that's actually still available, then let the
        // player just click again.
        console.error('Failed to found settlement against the backend', err);
        showInvalidClickMessage(t('landing.invalidClick.plotTaken'));
        await refreshPreview();
        // Founding did not happen, so this visitor is still a pre-founding
        // visitor: restart the poll stopped at the top of this function, or the
        // preview would silently stop tracking other visitors claiming plots
        // nearby for the rest of the session. Only reached when the recovery
        // paths above did not return. Live mode only, matching the one place
        // that starts it in the first place (onMounted's live branch) — demo
        // mode has no backend to poll.
        if (!DEMO_MODE)
            startPreviewPoll();
    }
    finally {
        founding.value = false;
    }
}
// Fog v2 (map-fog-v2.md §3): same watcher as SettlementView.vue's — without
// it, founding here (world.startHudSync() in foundHere, above) leaves the
// fog quads on their opaque "fully unknown" placeholder forever, since
// nothing else pushes a freshly built/fetched mask into the renderer once
// isFogActive() flips true. Watching both together covers the renderer not
// existing yet on the tick a mask resolves.
watch([() => canvasRef.value?.renderer, () => world.fogMaskBitmap, () => world.fogMaskBounds, () => world.fogCoverage], ([renderer, bitmap, bounds, coverage]) => {
    if (renderer && bitmap && bounds && coverage)
        renderer.setFogMask(bounds, bitmap, coverage);
});
// Fog chunks are fetched for the ground the camera actually sees (§3): the
// renderer reports which chunks that is as it pans/zooms, the store debounces
// and refetches only once the view leaves the window it already holds.
watch(() => canvasRef.value?.renderer, (renderer) => renderer?.setFogViewportListener((range) => world.requestFogViewport(range)), { immediate: true });
// Live mode: same "a fresh settlement snapshot arrived, force a redraw"
// wiring as SettlementView.vue — without it, a building that finishes (or
// one just queued, which should show its level-0 foundation immediately)
// keeps showing its old texture here too until a real camera pan happens
// to come along, since `refreshLiveSettlement` only ever touches
// `world.model`'s tile data, never the renderer.
watch([() => canvasRef.value?.renderer, () => world.hud.buildings], ([renderer]) => {
    renderer?.forceRebuild();
});
// Construction progress dials over buildings still being built; the renderer
// animates the progress itself every tick from these absolute timestamps.
watch([() => canvasRef.value?.renderer, () => world.hud.queue, () => world.hud.queueFetchedAt], ([renderer]) => {
    renderer?.setConstructionDials(constructionDialsFromQueue(world.hud.queue, world.hud.queueFetchedAt));
}, { immediate: true });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(player, {});
    __VLS_withDotValue(landingCanvasShown, {});
    __VLS_withDotValue(world, {});
    __VLS_withDotValue(previewCoord, {});
    __VLS_withDotValue(DEMO_MODE, {});
    __VLS_withDotValue(isMobile, {});
    __VLS_withDotValue(hideBarForTutorial, {});
    __VLS_withDotValue(router, {});
    __VLS_withDotValue(showReturningLoginGate, {});
    __VLS_withDotValue(joinBlocked, {});
    __VLS_withDotValue(founding, {});
    __VLS_withDotValue(invalidClickMessage, {});
    __VLS_withDotValue(pointerTarget, {});
    __VLS_withDotValue(mapDrawn, {});
    __VLS_withDotValue(canvasRef, {});
    __VLS_withDotValue(showLandfallBanner, {});
    __VLS_withDotValue(showCompletionBanner, {});
    __VLS_withDotValue(guidance, {});
    __VLS_withDotValue(isCompactHudLanding, {});
    __VLS_withDotValue(ringScreen, {});
    __VLS_withDotValue(pointerNudge, {});
    __VLS_withDotValue(ringBubbles, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['howto']} */ ;
    /** @type {__VLS_StyleScopedClasses['howto']} */ ;
    /** @type {__VLS_StyleScopedClasses['features']} */ ;
    /** @type {__VLS_StyleScopedClasses['features']} */ ;
    /** @type {__VLS_StyleScopedClasses['founding-col']} */ ;
    /** @type {__VLS_StyleScopedClasses['wordmark']} */ ;
    /** @type {__VLS_StyleScopedClasses['heading']} */ ;
    /** @type {__VLS_StyleScopedClasses['blocked-msg']} */ ;
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['features']} */ ;
    /** @type {__VLS_StyleScopedClasses['impressum']} */ ;
    /** @type {__VLS_StyleScopedClasses['topright']} */ ;
    /** @type {__VLS_StyleScopedClasses['howto']} */ ;
    /** @type {__VLS_StyleScopedClasses['founding-col']} */ ;
    /** @type {__VLS_StyleScopedClasses['founding-col']} */ ;
    /** @type {__VLS_StyleScopedClasses['wordmark']} */ ;
    /** @type {__VLS_StyleScopedClasses['heading']} */ ;
    /** @type {__VLS_StyleScopedClasses['blocked-msg']} */ ;
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['features']} */ ;
    /** @type {__VLS_StyleScopedClasses['impressum']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps-done-leave-active']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps-leave-active']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps-done-leave-active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "landing" },
        ...{ class: ({ 'landing--pre': !player.value.hasFoundedSettlement }) },
        ...{ style: ({
                '--hud-inset-top': __VLS_unwrap(hudInsetTopPxLanding, {}) + 'px',
                '--hud-inset-bottom': __VLS_unwrap(hudInsetBottomPxLanding, {}) + 'px',
                '--hud-inset-left': __VLS_unwrap(hudInsetLeftPxLanding, {}) + 'px',
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['landing']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing--pre']} */ ;
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
    if (landingCanvasShown.value) {
        const __VLS_7 = SettlementCanvas;
        // @ts-ignore
        const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
            // @ts-ignore
            ...{ 'onHexClick': {} }, ref: "canvasRef", worldModel: (world.value.model), playerId: (player.value.id), settlementId: (player.value.hasFoundedSettlement ? (world.value.selectedSettlementId ?? undefined) : undefined), previewCenter: (player.value.hasFoundedSettlement ? undefined : (previewCoord.value ?? undefined)), highlightCoord: (player.value.hasFoundedSettlement || !DEMO_MODE.value ? undefined : (previewCoord.value ?? undefined)), highlightCoords: (player.value.hasFoundedSettlement || DEMO_MODE.value ? undefined : __VLS_unwrap(nearbyStartCoords, {})), screenBiasX: (isMobile.value ? 0 : __VLS_unwrap(LANDING_PREVIEW_SCREEN_BIAS_X, {})), lockCamera: (!player.value.hasFoundedSettlement), hideSettlementBadge: true, background: "radial-gradient(120% 100% at 68% 42%, #3b4148 0%, #262b30 55%, #15181b 100%)",
        }));
        const __VLS_9 = __VLS_8({
            ...{ 'onHexClick': {} },
            ref: "canvasRef",
            worldModel: (world.value.model),
            playerId: (player.value.id),
            settlementId: (player.value.hasFoundedSettlement ? (world.value.selectedSettlementId ?? undefined) : undefined),
            previewCenter: (player.value.hasFoundedSettlement ? undefined : (previewCoord.value ?? undefined)),
            highlightCoord: (player.value.hasFoundedSettlement || !DEMO_MODE.value ? undefined : (previewCoord.value ?? undefined)),
            highlightCoords: (player.value.hasFoundedSettlement || DEMO_MODE.value ? undefined : __VLS_unwrap(nearbyStartCoords, {})),
            screenBiasX: (isMobile.value ? 0 : __VLS_unwrap(LANDING_PREVIEW_SCREEN_BIAS_X, {})),
            lockCamera: (!player.value.hasFoundedSettlement),
            hideSettlementBadge: true,
            background: "radial-gradient(120% 100% at 68% 42%, #3b4148 0%, #262b30 55%, #15181b 100%)",
        }, ...__VLS_functionalComponentArgsRest(__VLS_8));
        let __VLS_12;
        const __VLS_13 = {
            /** @type {typeof __VLS_12.hexClick} */
            onHexClick: (onHexClick),
        };
        void __VLS_13;
        var __VLS_10;
        var __VLS_11;
    }
    if (player.value.hasFoundedSettlement && !hideBarForTutorial.value) {
        const __VLS_14 = TopBar || TopBar;
        // @ts-ignore
        const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({
            // @ts-ignore
            floating: true,
        }));
        const __VLS_16 = __VLS_15({
            floating: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_15));
        var __VLS_17;
        const { default: __VLS_19 } = __VLS_nonNull(__VLS_17.slots);
        const __VLS_20 = HudNav;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
            // @ts-ignore
            floating: true,
        }));
        const __VLS_22 = __VLS_21({
            floating: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        {
            const { drawer: __VLS_25 } = __VLS_nonNull(__VLS_17.slots);
            const [{ close }] = __VLS_vSlot(__VLS_nonNull(__VLS_25));
            const __VLS_26 = MobileHudDrawer;
            // @ts-ignore
            const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
                // @ts-ignore
                ...{ 'onClose': {} },
            }));
            const __VLS_28 = __VLS_27({
                ...{ 'onClose': {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_27));
            let __VLS_31;
            const __VLS_32 = {
                /** @type {typeof __VLS_31.close} */
                onClose: (close),
            };
            void __VLS_32;
            var __VLS_29;
            var __VLS_30;
            // @ts-ignore
            [player, player, player, player, player, player, player, player, hudInsetTopPxLanding, hudInsetBottomPxLanding, hudInsetLeftPxLanding, overlayStep, overlayError, landingCanvasShown, world, world, previewCoord, previewCoord, DEMO_MODE, DEMO_MODE, nearbyStartCoords, isMobile, LANDING_PREVIEW_SCREEN_BIAS_X, hideBarForTutorial,];
        }
        // @ts-ignore
        [];
    }
    if (!player.value.hasFoundedSettlement) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "topright" },
        });
        /** @type {__VLS_StyleScopedClasses['topright']} */ ;
        const __VLS_33 = HudNavLink || HudNavLink;
        // @ts-ignore
        const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
            // @ts-ignore
            ...{ 'onNavigate': {} }, href: (__VLS_unwrap(docsHref, {})), ...{ class: "howto" }, dataTestid: "map-how-to-play",
        }));
        const __VLS_35 = __VLS_34({
            ...{ 'onNavigate': {} },
            href: (__VLS_unwrap(docsHref, {})),
            ...{ class: "howto" },
            dataTestid: "map-how-to-play",
        }, ...__VLS_functionalComponentArgsRest(__VLS_34));
        let __VLS_38;
        const __VLS_39 = {
            /** @type {typeof __VLS_38.navigate} */
            onNavigate: (...[$event]) => {
                void $event;
                if (!(!player.value.hasFoundedSettlement))
                    throw 0;
                return (router.value.push('/docs'));
                // @ts-ignore
                [player, docsHref, router,];
            },
        };
        void __VLS_39;
        /** @type {__VLS_StyleScopedClasses['howto']} */ ;
        var __VLS_36;
        var __VLS_37;
        const { default: __VLS_40 } = __VLS_nonNull(__VLS_36.slots);
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            width: "18",
            height: "18",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            'stroke-width': "1.6",
            'stroke-linecap': "round",
            'stroke-linejoin': "round",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M12 6v14",
        });
        (__VLS_unwrap(t, {})('intro.howToPlay'));
        // @ts-ignore
        [t,];
        const __VLS_41 = ReturningPlayerMenu || ReturningPlayerMenu;
        // @ts-ignore
        const __VLS_42 = __VLS_asFunctionalComponent1(__VLS_41, new __VLS_41({
            // @ts-ignore
            landingEntries: true,
        }));
        const __VLS_43 = __VLS_42({
            landingEntries: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_42));
        var __VLS_44;
        const { default: __VLS_46 } = __VLS_nonNull(__VLS_44.slots);
        {
            const { nudge: __VLS_47 } = __VLS_nonNull(__VLS_44.slots);
            const __VLS_48 = MotionPrompt;
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
            // @ts-ignore
            }));
            const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
    }
    if (showReturningLoginGate.value) {
        const __VLS_53 = ReturningLoginPanel;
        // @ts-ignore
        const __VLS_54 = __VLS_asFunctionalComponent1(__VLS_53, new __VLS_53({
        // @ts-ignore
        }));
        const __VLS_55 = __VLS_54({}, ...__VLS_functionalComponentArgsRest(__VLS_54));
    }
    else if (!player.value.hasFoundedSettlement) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "founding-col" },
            ...{ class: ({ 'founding-col--blocked': joinBlocked.value }) },
        });
        /** @type {__VLS_StyleScopedClasses['founding-col']} */ ;
        /** @type {__VLS_StyleScopedClasses['founding-col--blocked']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({
            ...{ class: "wordmark" },
        });
        /** @type {__VLS_StyleScopedClasses['wordmark']} */ ;
        (__VLS_unwrap(WORDMARK, {}));
        if (joinBlocked.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
                ...{ class: "heading" },
            });
            /** @type {__VLS_StyleScopedClasses['heading']} */ ;
            (__VLS_unwrap(t, {})('landing.hero.notOpenTitle'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "blocked-msg" },
            });
            /** @type {__VLS_StyleScopedClasses['blocked-msg']} */ ;
            (__VLS_unwrap(joinBlockedMessage, {}));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
                ...{ class: "heading" },
            });
            /** @type {__VLS_StyleScopedClasses['heading']} */ ;
            (__VLS_unwrap(t, {})('landing.hero.choose'));
            if (founding.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "status" },
                });
                /** @type {__VLS_StyleScopedClasses['status']} */ ;
                (__VLS_unwrap(t, {})('landing.hero.makingLandfall'));
            }
            else if (invalidClickMessage.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "status" },
                });
                /** @type {__VLS_StyleScopedClasses['status']} */ ;
                (invalidClickMessage.value);
            }
            const __VLS_58 = FeatureList;
            // @ts-ignore
            const __VLS_59 = __VLS_asFunctionalComponent1(__VLS_58, new __VLS_58({
                // @ts-ignore
                ...{ class: "features" }, locale: (__VLS_unwrap(introLocale, {})), idPrefix: "map",
            }));
            const __VLS_60 = __VLS_59({
                ...{ class: "features" },
                locale: (__VLS_unwrap(introLocale, {})),
                idPrefix: "map",
            }, ...__VLS_functionalComponentArgsRest(__VLS_59));
            /** @type {__VLS_StyleScopedClasses['features']} */ ;
        }
    }
    if (!player.value.hasFoundedSettlement) {
        const __VLS_63 = ImpressumLink;
        // @ts-ignore
        const __VLS_64 = __VLS_asFunctionalComponent1(__VLS_63, new __VLS_63({
            // @ts-ignore
            ...{ class: "impressum" }, locale: (__VLS_unwrap(introLocale, {})), testid: "map-impressum",
        }));
        const __VLS_65 = __VLS_64({
            ...{ class: "impressum" },
            locale: (__VLS_unwrap(introLocale, {})),
            testid: "map-impressum",
        }, ...__VLS_functionalComponentArgsRest(__VLS_64));
        /** @type {__VLS_StyleScopedClasses['impressum']} */ ;
    }
    if (pointerTarget.value && mapDrawn.value) {
        const __VLS_68 = GuidancePointer;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent1(__VLS_68, new __VLS_68({
            // @ts-ignore
            coord: (pointerTarget.value.mode === 'hex' ? pointerTarget.value.coord : undefined), renderer: (pointerTarget.value.mode === 'hex' ? canvasRef.value?.renderer : undefined), screen: (pointerTarget.value.mode === 'screen' ? pointerTarget.value.screen : undefined), label: (pointerTarget.value.label), angle: (pointerTarget.value.angle), targetRadius: (pointerTarget.value.targetRadius), tipGap: (pointerTarget.value.tipGap), scale: (pointerTarget.value.scale), avoid: (pointerTarget.value.mode === 'screen' ? ringBubbles.value : undefined), clearBelowSelector: ".founding-col, [data-testid='onboarding-banner'].landfall", nudge: (pointerNudge.value),
        }));
        const __VLS_70 = __VLS_69({
            coord: (pointerTarget.value.mode === 'hex' ? pointerTarget.value.coord : undefined),
            renderer: (pointerTarget.value.mode === 'hex' ? canvasRef.value?.renderer : undefined),
            screen: (pointerTarget.value.mode === 'screen' ? pointerTarget.value.screen : undefined),
            label: (pointerTarget.value.label),
            angle: (pointerTarget.value.angle),
            targetRadius: (pointerTarget.value.targetRadius),
            tipGap: (pointerTarget.value.tipGap),
            scale: (pointerTarget.value.scale),
            avoid: (pointerTarget.value.mode === 'screen' ? ringBubbles.value : undefined),
            clearBelowSelector: ".founding-col, [data-testid='onboarding-banner'].landfall",
            nudge: (pointerNudge.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    }
    const __VLS_73 = ResourceTicker;
    // @ts-ignore
    const __VLS_74 = __VLS_asFunctionalComponent1(__VLS_73, new __VLS_73({
        // @ts-ignore
        ...{ 'onExpire': {} }, ticks: (__VLS_unwrap(resourceTicks, {})),
    }));
    const __VLS_75 = __VLS_74({
        ...{ 'onExpire': {} },
        ticks: (__VLS_unwrap(resourceTicks, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_74));
    let __VLS_78;
    const __VLS_79 = {
        /** @type {typeof __VLS_78.expire} */
        onExpire: (onResourceTickExpire),
    };
    void __VLS_79;
    var __VLS_76;
    var __VLS_77;
    if (showLandfallBanner.value) {
        const __VLS_80 = OnboardingBanner;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent1(__VLS_80, new __VLS_80({
            // @ts-ignore
            variant: "landfall",
        }));
        const __VLS_82 = __VLS_81({
            variant: "landfall",
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    }
    if (showCompletionBanner.value) {
        const __VLS_85 = OnboardingBanner;
        // @ts-ignore
        const __VLS_86 = __VLS_asFunctionalComponent1(__VLS_85, new __VLS_85({
            // @ts-ignore
            ...{ 'onContinue': {} }, variant: "complete",
        }));
        const __VLS_87 = __VLS_86({
            ...{ 'onContinue': {} },
            variant: "complete",
        }, ...__VLS_functionalComponentArgsRest(__VLS_86));
        let __VLS_90;
        const __VLS_91 = {
            /** @type {typeof __VLS_90.continue} */
            onContinue: (onContinueToSettlement),
        };
        void __VLS_91;
        var __VLS_88;
        var __VLS_89;
    }
    let __VLS_92;
    /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
    Transition;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent1(__VLS_92, new __VLS_92({
        // @ts-ignore
        name: (guidance.value.complete ? 'steps-done' : 'steps'),
    }));
    const __VLS_94 = __VLS_93({
        name: (guidance.value.complete ? 'steps-done' : 'steps'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    var __VLS_95;
    const { default: __VLS_97 } = __VLS_nonNull(__VLS_95.slots);
    if (!joinBlocked.value && !guidance.value.complete && !showReturningLoginGate.value && !(isCompactHudLanding.value && ringScreen.value)) {
        const __VLS_98 = OnboardingChecklist;
        // @ts-ignore
        const __VLS_99 = __VLS_asFunctionalComponent1(__VLS_98, new __VLS_98({
            // @ts-ignore
            ...{ 'onFocus': {} }, guidance: (guidance.value), canFocus: (!!pointerTarget.value && mapDrawn.value),
        }));
        const __VLS_100 = __VLS_99({
            ...{ 'onFocus': {} },
            guidance: (guidance.value),
            canFocus: (!!pointerTarget.value && mapDrawn.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_99));
        let __VLS_103;
        const __VLS_104 = {
            /** @type {typeof __VLS_103.focus} */
            onFocus: (...[$event]) => {
                void $event;
                if (!(!joinBlocked.value && !guidance.value.complete && !showReturningLoginGate.value && !(isCompactHudLanding.value && ringScreen.value)))
                    throw 0;
                return (pointerNudge.value++);
                // @ts-ignore
                [player, player, t, t, t, showReturningLoginGate, showReturningLoginGate, joinBlocked, joinBlocked, joinBlocked, WORDMARK, joinBlockedMessage, founding, invalidClickMessage, invalidClickMessage, introLocale, introLocale, pointerTarget, pointerTarget, pointerTarget, pointerTarget, pointerTarget, pointerTarget, pointerTarget, pointerTarget, pointerTarget, pointerTarget, pointerTarget, pointerTarget, pointerTarget, mapDrawn, mapDrawn, canvasRef, ringBubbles, pointerNudge, pointerNudge, resourceTicks, showLandfallBanner, showCompletionBanner, guidance, guidance, guidance, isCompactHudLanding, ringScreen,];
            },
        };
        void __VLS_104;
        var __VLS_101;
        var __VLS_102;
    }
    // @ts-ignore
    [];
    if (player.value.hasFoundedSettlement) {
        if (isMobile.value) {
            const __VLS_105 = QueueDrawer;
            // @ts-ignore
            const __VLS_106 = __VLS_asFunctionalComponent1(__VLS_105, new __VLS_105({
                // @ts-ignore
                ...{ 'onSelect': {} }, open: (__VLS_unwrap(queueDrawerOpen, {})),
            }));
            const __VLS_107 = __VLS_106({
                ...{ 'onSelect': {} },
                open: (__VLS_unwrap(queueDrawerOpen, {})),
            }, ...__VLS_functionalComponentArgsRest(__VLS_106));
            let __VLS_110;
            const __VLS_111 = {
                /** @type {typeof __VLS_110.select} */
                onSelect: (onQueueSelect),
            };
            void __VLS_111;
            var __VLS_108;
            var __VLS_109;
        }
        else {
            const __VLS_112 = BuildQueuePanel;
            // @ts-ignore
            const __VLS_113 = __VLS_asFunctionalComponent1(__VLS_112, new __VLS_112({
                // @ts-ignore
                ...{ 'onSelect': {} },
            }));
            const __VLS_114 = __VLS_113({
                ...{ 'onSelect': {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_113));
            let __VLS_117;
            const __VLS_118 = {
                /** @type {typeof __VLS_117.select} */
                onSelect: (onQueueSelect),
            };
            void __VLS_118;
            var __VLS_115;
            var __VLS_116;
        }
    }
    const __VLS_119 = RingMenuHost || RingMenuHost;
    // @ts-ignore
    const __VLS_120 = __VLS_asFunctionalComponent1(__VLS_119, new __VLS_119({
    // @ts-ignore
    }));
    const __VLS_121 = __VLS_120({}, ...__VLS_functionalComponentArgsRest(__VLS_120));
    var __VLS_122;
    const { default: __VLS_124 } = __VLS_nonNull(__VLS_122.slots);
    if (ringScreen.value) {
        const __VLS_125 = RingMenu;
        // @ts-ignore
        const __VLS_126 = __VLS_asFunctionalComponent1(__VLS_125, new __VLS_125({
            // @ts-ignore
            ...{ 'onSelect': {} }, ...{ 'onClose': {} }, ...{ 'onOutsidePointerDown': {} }, ...{ 'onBubbles': {} }, x: (ringScreen.value.x), y: (ringScreen.value.y), scale: (ringScreen.value.scale), actions: (__VLS_unwrap(ringActions, {})), categories: (__VLS_unwrap(ringCategories, {})), terrainLabel: (__VLS_unwrap(ringTerrainLabel, {})), coordLabel: (__VLS_unwrap(ringCoordLabel, {})), bounds: (__VLS_unwrap(ringBounds, {})), stock: (world.value.hud.available), error: (__VLS_unwrap(ringError, {})), dock: (__VLS_unwrap(ringDock, {})),
        }));
        const __VLS_127 = __VLS_126({
            ...{ 'onSelect': {} },
            ...{ 'onClose': {} },
            ...{ 'onOutsidePointerDown': {} },
            ...{ 'onBubbles': {} },
            x: (ringScreen.value.x),
            y: (ringScreen.value.y),
            scale: (ringScreen.value.scale),
            actions: (__VLS_unwrap(ringActions, {})),
            categories: (__VLS_unwrap(ringCategories, {})),
            terrainLabel: (__VLS_unwrap(ringTerrainLabel, {})),
            coordLabel: (__VLS_unwrap(ringCoordLabel, {})),
            bounds: (__VLS_unwrap(ringBounds, {})),
            stock: (world.value.hud.available),
            error: (__VLS_unwrap(ringError, {})),
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
            onOutsidePointerDown: (closeRing),
        };
        void __VLS_133;
        const __VLS_134 = {
            /** @type {typeof __VLS_130.bubbles} */
            onBubbles: (...[$event]) => {
                void $event;
                if (!(ringScreen.value))
                    throw 0;
                return (ringBubbles.value = $event);
                // @ts-ignore
                [player, world, isMobile, ringBubbles, ringScreen, ringScreen, ringScreen, ringScreen, queueDrawerOpen, ringActions, ringCategories, ringTerrainLabel, ringCoordLabel, ringBounds, ringError, ringDock,];
            },
        };
        void __VLS_134;
        var __VLS_128;
        var __VLS_129;
    }
    // @ts-ignore
    [];
    const __VLS_135 = PlayIntroButton;
    // @ts-ignore
    const __VLS_136 = __VLS_asFunctionalComponent1(__VLS_135, new __VLS_135({
    // @ts-ignore
    }));
    const __VLS_137 = __VLS_136({}, ...__VLS_functionalComponentArgsRest(__VLS_136));
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
