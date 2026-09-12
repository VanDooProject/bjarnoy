<script setup lang="ts">
// zip 6a ("Place a building before you sign up"): the landing page IS the
// village view, not a marketing page in front of it. A real plot of terrain
// is on screen immediately; the first interaction is founding a settlement
// right there (no world map, no form). Once founded, the same canvas keeps
// going as a guided tutorial — build two more buildings — before the
// nickname prompt (and only then a route into the full game) appears.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import BuildQueuePanel from '../components/hud/BuildQueuePanel.vue';
import RingMenu, { type RingAction } from '../components/hud/RingMenu.vue';
import OnboardingChecklist from '../components/onboarding/OnboardingChecklist.vue';
import GuidancePointer from '../components/onboarding/GuidancePointer.vue';
import ResourceTicker, { type ResourceTick } from '../components/onboarding/ResourceTicker.vue';
import OnboardingBanner from '../components/onboarding/OnboardingBanner.vue';
import { BOOST_TERRAIN, buildingStatsFor, matchingNeighbourCount } from '../lib/map/buildingEconomy';
import {
  deriveOnboardingGuidance,
  findGuidedTarget,
  nextGuidedType,
  ringNoteReason,
  GUIDED_BUILD_TERRAIN as GUIDED_TERRAIN_FOR,
} from '../lib/map/onboardingGuidance';
import { useWorldStore } from '../stores/world';
import { usePlayerStore } from '../stores/player';
import { DEMO_MODE } from '../config';
import { ApiError } from '../api/client';
import { hexDistance, type AxialCoord } from '../lib/hex/coords';
import { claimRadiusForLevel } from '../lib/map/shoreline';
import type { Terrain, Tile } from '../lib/map/types';
import { buildingName, terrainName } from '../i18n/catalogueNames';
import type { MessageSchema } from '../i18n/schema';

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// Issue: the onboarding build step used to pop BuildingModal — a single
// "Build here" button with no type picker, hardcoded to 'farm' (live) or
// 'hut' (demo). Farm requires grass (BuildingCatalogue), so a click on any
// forest/mountain tile in the fresh border silently failed (TerrainNotAllowed,
// only console.error'd) with the modal just sitting there — "can't actually
// select the correct building". Ring menu, same as SettlementView's, fixes
// that: a flat ring (no nested categories — this is the "simplified" version)
// with only the guided type matching the *clicked tile's own terrain*
// enabled (Farm needs grass, Lumberjack needs forest — BuildingCatalogue),
// everything else visibly disabled. Enabling both regardless of terrain
// would just reintroduce the same silent-failure bug for whichever one
// doesn't fit the tile actually clicked.
type OnboardingBuildType = 'farm' | 'lumberjack' | 'tower' | 'fishinghut' | 'quarry';
const GUIDED_BUILD_TERRAIN: Partial<Record<OnboardingBuildType, Terrain>> = {
  farm: 'grass',
  lumberjack: 'forest',
};
const ONBOARDING_BUILD_RING: OnboardingBuildType[] = ['farm', 'lumberjack', 'quarry', 'tower', 'fishinghut'];

const world = useWorldStore();
const player = usePlayerStore();
const router = useRouter();

const canvasRef = ref<InstanceType<typeof SettlementCanvas> | null>(null);
const previewCoord = ref<AxialCoord | null>(null);
// Live mode only: every unclaimed start position worth showing near the
// preview centre. Founding now only ever lands on the exact hex clicked
// (see `startPositionAt`, issue #96), so the player needs to see every
// plot that's actually clickable, not just a single suggested one.
const nearbyStartCoords = ref<AxialCoord[]>([]);
const founding = ref(false);
const invalidClickMessage = ref<string | null>(null);
let invalidClickTimer: ReturnType<typeof setTimeout> | undefined;

// How often the pre-founding preview re-polls its plot suggestion and
// same-island rivals so the "empty plot" scene reflects other visitors
// founding nearby without a reload — comfortably inside the backend
// reservation's 3-minute sliding TTL. Paused while the tab is hidden (see
// `onVisibilityChange`) rather than wasting requests on a backgrounded tab.
const PREVIEW_POLL_MS = 20000;
let previewPollHandle: ReturnType<typeof setInterval> | undefined;

async function refreshPreview() {
  const changed = await world.refreshPlotSuggestion(player.id);
  await world.refreshWorldSettlements();
  const suggestion = world.plotSuggestion;
  if (!suggestion) return;
  if (changed) {
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
    if (document.visibilityState === 'hidden') return;
    void refreshPreview();
  }, PREVIEW_POLL_MS);
}

function stopPreviewPoll() {
  if (previewPollHandle !== undefined) {
    clearInterval(previewPollHandle);
    previewPollHandle = undefined;
  }
}

onMounted(async () => {
  await world.bootstrapLiveWorld();
  if (player.hasFoundedSettlement && player.settlementId) {
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
  } else {
    await world.refreshPlotSuggestion(player.id);
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
  if (DEMO_MODE) {
    (window as unknown as { __settlementRenderer?: () => unknown }).__settlementRenderer = () =>
      canvasRef.value?.renderer;
  }
});
onUnmounted(() => {
  world.stopHudSync();
  stopPreviewPoll();
  clearTimeout(invalidClickTimer);
  if (DEMO_MODE) delete (window as unknown as { __settlementRenderer?: () => unknown }).__settlementRenderer;
});

// Admin-set gates (issue #27): a world that hasn't started yet, or has had
// joins closed, still renders (existing players restore fine) but refuses a
// *new* founding — so tell the player why instead of letting them click a
// hex that will just come back 409.
const joinBlocked = computed(
  () => !DEMO_MODE && !player.hasFoundedSettlement && !world.worldJoinable,
);
const joinBlockedMessage = computed(() => {
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
const guidance = computed(() =>
  deriveOnboardingGuidance(player.hasFoundedSettlement, world.hud.placedBuildingTypes),
);

// Persists the moment it's genuinely true, independent of whether the
// player has seen/dismissed the completion banner — covers both "just
// crossed the threshold" and "arrived here mid-onboarding, already past it"
// (a reload right as the last build order completed).
watch(
  () => guidance.value.complete,
  (complete) => {
    if (complete) player.completeOnboarding();
  },
  { immediate: true },
);

function onContinueToSettlement() {
  router.push('/settlement');
}

// Ring menu state for the onboarding build step — mirrors SettlementView's
// own ringScreen/selectedCoord, but flat (one ring, no build-categories /
// build-buildings drill-down): onboarding only ever offers a handful of
// types, so there's no need for that hierarchy here.
const ringScreen = ref<{ x: number; y: number } | null>(null);
const ringCoord = ref<AxialCoord | null>(null);
const ringTerrain = ref<Terrain | null>(null);
// Design handoff "2a" frame 3: each lane1 bubble's screen spot, keyed by
// action id — from RingMenu's own `layout` emit, so the pointer aims at
// exactly where the bubble is actually drawn.
const ringLaneSpots = ref<Record<string, { x: number; y: number }>>({});

watch(ringScreen, (screen) => {
  canvasRef.value?.renderer?.setInteractionLocked(!!screen);
  if (!screen) ringLaneSpots.value = {};
});

const ringActions = computed<RingAction[]>(() =>
  ONBOARDING_BUILD_RING.map((type) => {
    const requiredTerrain = GUIDED_BUILD_TERRAIN[type];
    const guided = requiredTerrain !== undefined;
    const fitsTile = guided && requiredTerrain === ringTerrain.value;
    return {
      id: type,
      label: buildingName(type),
      disabled: !fitsTile,
      hint: !guided
        ? t('landing.ring.finishGuidedFirst')
        : !fitsTile
          ? t('landing.ring.needsTerrain', { terrain: terrainName(requiredTerrain) })
          : undefined,
    };
  }),
);

// The 2a ring's hub names the tile the menu is anchored to; onboarding has no
// building on it yet, so it's the bare terrain plus the hex coordinate.
const ringTerrainLabel = computed(() => (ringTerrain.value ? terrainName(ringTerrain.value) : ''));
const ringCoordLabel = computed(() => (ringCoord.value ? `HEX ${ringCoord.value.q}, ${ringCoord.value.r}` : ''));

// Design handoff "2a": a persistent "why it's dim" note instead of a
// hover-only tooltip that reads as an error. ringNoteReason (pure, tested)
// decides which guided type fits this hex's terrain; this just translates
// that into copy.
const ringNote = computed(() => {
  const terrain = ringTerrain.value;
  if (!terrain) return null;
  const reason = ringNoteReason(terrain);
  if (reason.kind === 'neitherFits') {
    return {
      title: t('landing.ring.dimNoteTitle'),
      body: t('landing.ring.neitherFitsBody', { hexTerrain: terrainName(terrain) }),
    };
  }
  return {
    title: t('landing.ring.dimNoteTitle'),
    body: t('landing.ring.dimNoteBody', {
      otherBuilding: buildingName(reason.dim),
      otherTerrain: terrainName(GUIDED_TERRAIN_FOR[reason.dim]),
      hexTerrain: terrainName(terrain),
      fitBuilding: buildingName(reason.fit),
    }),
  };
});

function closeRing() {
  ringScreen.value = null;
  ringCoord.value = null;
  ringTerrain.value = null;
}

function showInvalidClickMessage(message: string) {
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
// onboarding flow only ever places the very first Farm/Lumberjack, before
// any Tower exists, so the centre disc alone is already the exact same
// range at this point in a player's settlement; `claimRadiusForLevel` stays
// a faithful enough mirror here without needing the fuller `claimDiscs`
// machinery TrainingModal.vue uses once towers are in play. Demo mode has no
// backend to mirror, so its own `tile.ownerId` (bounded by the same
// `borderRadius`) is already the full truth.
function withinBuildableRange(coord: AxialCoord): boolean {
  if (DEMO_MODE || !world.selectedSettlementId) return true;
  const settlement = world.model.getSettlement(world.selectedSettlementId);
  if (!settlement) return false;
  return hexDistance({ q: settlement.q, r: settlement.r }, coord) <= claimRadiusForLevel(settlement.level);
}

// Design handoff "2a": the nearest still-buildable hex for whichever guided
// building isn't placed yet — what the map pointer (frames 2/4, "Now build
// here" / "One more — the {terrain}") aims at. `findGuidedTarget` itself is
// pure (onboardingGuidance.ts); this just supplies it with this settlement's
// centre/claim radius and a terrain/buildability lookup against the real
// WorldModel, mirroring onHexClick's own buildable-tile rule above.
const nextGuidedTargetCoord = computed<AxialCoord | null>(() => {
  if (!player.hasFoundedSettlement || !world.selectedSettlementId) return null;
  const settlement = world.model.getSettlement(world.selectedSettlementId);
  if (!settlement) return null;
  const type = nextGuidedType(world.hud.placedBuildingTypes);
  if (!type) return null;
  return findGuidedTarget(
    { q: settlement.q, r: settlement.r },
    claimRadiusForLevel(settlement.level),
    type,
    (c) => world.model.getTile(c.q, c.r).terrain,
    (c) => {
      const tile = world.model.getTile(c.q, c.r);
      return tile.ownerId === settlement.id && !tile.buildingType;
    },
  );
});

// Frame 2: the landfall banner is the moment right after founding, before
// the player has even opened the ring for the first guided building — gone
// the instant they do (the ring/note/pointer take over telling the story),
// so it never overlaps the "why it's dim" note or the completion banner.
const showLandfallBanner = computed(
  () => player.hasFoundedSettlement && world.hud.placedBuildingTypes.length <= 1 && !ringScreen.value,
);

// The single animated pointer: which hex (or, with the ring open, which
// screen spot) it aims at and what it says, across every pre-completion
// screen. `mode: 'hex'` follows the camera via GuidancePointer's own
// useMapAnchor; `mode: 'screen'` is the ring-open case, a fixed point since
// opening the ring already locks camera drag.
const pointerTarget = computed(() => {
  if (joinBlocked.value) return null;
  if (ringScreen.value) {
    // Frame 3: "This one fits {terrain}" — aimed at whichever guided
    // building's bubble is actually enabled for this hex's terrain. No
    // pointer at all for the (rare) hex that fits neither (sand, mountain);
    // there's nothing correct to point at.
    if (!ringTerrain.value) return null;
    const reason = ringNoteReason(ringTerrain.value);
    if (reason.kind !== 'oneFits') return null;
    const spot = ringLaneSpots.value[reason.fit];
    if (!spot) return null;
    return {
      mode: 'screen' as const,
      screen: spot,
      label: t('landing.pointer.thisOneFits', { terrain: terrainName(GUIDED_TERRAIN_FOR[reason.fit]) }),
      angle: 30,
    };
  }
  if (!player.hasFoundedSettlement) {
    if (!previewCoord.value) return null;
    return {
      mode: 'hex' as const,
      coord: previewCoord.value,
      label: DEMO_MODE ? t('landing.pointer.clickThisPlot') : t('landing.pointer.anyGlowingPlot'),
      angle: 38,
    };
  }
  if (!nextGuidedTargetCoord.value) return null;
  // Right after founding (only the longhouse is down) vs. one guided
  // building already placed — matches the mockup's frame 2 vs. frame 4
  // copy/angle.
  const oneDone = world.hud.placedBuildingTypes.length > 1;
  const remainingType = nextGuidedType(world.hud.placedBuildingTypes);
  return {
    mode: 'hex' as const,
    coord: nextGuidedTargetCoord.value,
    label: oneDone && remainingType
      ? t('landing.pointer.oneMore', { terrain: terrainName(GUIDED_TERRAIN_FOR[remainingType]) })
      : t('landing.pointer.nowBuildHere'),
    angle: oneDone ? 52 : 38,
  };
});

function onHexClick(coord: AxialCoord, tile: Tile, screen: { x: number; y: number }) {
  if (!player.hasFoundedSettlement) {
    if (tile.terrain === 'sea' || founding.value || joinBlocked.value) return;
    // Live mode only founds on an exact, unclaimed start position (see
    // `startPositionAt`, issue #96) — a click elsewhere used to silently
    // found on the nearest one instead; now it just tells the player to
    // pick one of the highlighted plots.
    if (!DEMO_MODE && !world.startPositionAt(coord)) {
      showInvalidClickMessage(t('landing.invalidClick.pickGlowingPlot'));
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
  if (tile.ownerId === world.selectedSettlementId && !tile.buildingType && tile.terrain !== 'sea') {
    if (!withinBuildableRange(coord)) {
      showInvalidClickMessage(t('landing.invalidClick.beyondClaim'));
      closeRing();
      return;
    }
    ringCoord.value = coord;
    ringScreen.value = screen;
    ringTerrain.value = tile.terrain;
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
const resourceTicks = ref<ResourceTick[]>([]);
let tickIdSeq = 0;
function fireResourceTick(type: 'farm' | 'lumberjack', coord: AxialCoord) {
  const boostTerrain = BOOST_TERRAIN[type];
  const neighbours = boostTerrain
    ? matchingNeighbourCount(coord, boostTerrain, (q, r) => world.model.getTile(q, r))
    : 0;
  const output = buildingStatsFor(type, 1, neighbours).output;
  const screen = canvasRef.value?.renderer?.hexCenterScreen(coord);
  if (!screen || output?.kind !== 'resourceRate') return;
  resourceTicks.value.push({ id: ++tickIdSeq, resource: output.resource, amount: output.amount, ...screen });
}
function onResourceTickExpire(id: number) {
  resourceTicks.value = resourceTicks.value.filter((tick) => tick.id !== id);
}

async function onRingSelect(type: string) {
  const coord = ringCoord.value;
  if (!world.selectedSettlementId || !coord) return;
  if (DEMO_MODE) {
    world.model.placeBuilding(world.selectedSettlementId, coord, type as OnboardingBuildType);
    canvasRef.value?.renderer?.forceRebuild();
    world.syncHud();
    closeRing();
    if (type === 'farm' || type === 'lumberjack') fireResourceTick(type, coord);
    return;
  }
  // Always close, win or lose — matching SettlementView's own onRingSelect
  // (see its `buildType` call). A failed order used to leave the ring open
  // with only a console.error, which is the "ring fails to close" bug: the
  // player had no way to tell the click did anything at all.
  closeRing();
  try {
    await world.queueBuildLive(type, coord);
    if (type === 'farm' || type === 'lumberjack') fireResourceTick(type, coord);
  } catch (err) {
    console.error('Failed to queue building against the backend', err);
    showInvalidClickMessage(t('landing.invalidClick.orderFailed'));
  }
}

// Issue: "the build countdowns like in settlement view should appear" —
// BuildQueuePanel already reads world.hud.queue (populated by the
// startHudSync() call in foundHere/onMounted below); it just wasn't
// mounted here. Selecting a queued order pans/flashes it, same as
// SettlementView's own onQueueSelect.
let queueFlashTimeout: ReturnType<typeof setTimeout> | null = null;
function onQueueSelect(coord: { q: number; r: number }) {
  const renderer = canvasRef.value?.renderer;
  if (!renderer) return;
  renderer.panTo(coord);
  renderer.setHighlight(coord);
  if (queueFlashTimeout) clearTimeout(queueFlashTimeout);
  queueFlashTimeout = setTimeout(() => {
    renderer.setHighlight(undefined);
    queueFlashTimeout = null;
  }, 2200);
}

async function foundHere(coord: AxialCoord) {
  founding.value = true;
  try {
    const realmName = player.nickname
      ? t('landing.foundHere.namedRealm', { nickname: player.nickname })
      : t('landing.foundHere.unnamedRealm');
    const settlement = DEMO_MODE
      ? world.foundStartingSettlement(player.id, player.ownerName, realmName, coord)
      : await world.foundStartingSettlementLive(player.id, player.ownerName, realmName, coord);
    player.foundSettlement(settlement.id);
    world.startHudSync();
    // The view stays mounted after founding (flipped into settlement mode
    // in place, see below) rather than unmounting, so onUnmounted's own
    // stopPreviewPoll() won't run for a while yet — without stopping it
    // here too, the pre-founding poll keeps asking the backend for a plot
    // suggestion this owner no longer needs, which now 409s
    // (PlotSuggestionRejection.AlreadyFounded) on every tick.
    stopPreviewPoll();
    // The canvas was mounted in preview mode (no settlementId yet) — flip it
    // into a real settlement view in place, same camera, no remount. Also
    // drops screenBiasX back to 0: the hero text (the only reason to bias
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
  } catch (err) {
    // A 409 covers several distinct rejections (see FoundingRejection) —
    // only AlreadyFounded actually means "you already have a settlement,
    // go there". The others (PlotReserved, PlotTaken, TooCloseToNeighbour,
    // ...) mean someone else claimed or reserved a start position between
    // the last refresh and this click — re-request the suggestion so the
    // preview shows a plot that's actually still available, then let the
    // player just click again.
    if (err instanceof ApiError && err.problem?.rejection === 'AlreadyFounded') {
      router.push('/settlement');
    } else {
      console.error('Failed to found settlement against the backend', err);
      showInvalidClickMessage("That plot was just taken — here's another one.");
      await refreshPreview();
    }
  } finally {
    founding.value = false;
  }
}

// Fog v2 (map-fog-v2.md §3): same watcher as SettlementView.vue's — without
// it, founding here (world.startHudSync() in foundHere, above) leaves the
// fog quads on their opaque "fully unknown" placeholder forever, since
// nothing else pushes a freshly built/fetched mask into the renderer once
// isFogActive() flips true. Watching both together covers the renderer not
// existing yet on the tick a mask resolves.
watch(
  [() => canvasRef.value?.renderer, () => world.fogMaskBitmap, () => world.worldRadius],
  ([renderer, bitmap, radius]) => {
    if (renderer && bitmap && radius !== null) renderer.setFogMask(radius, bitmap);
  },
);

// Live mode: same "a fresh settlement snapshot arrived, force a redraw"
// wiring as SettlementView.vue — without it, a building that finishes (or
// one just queued, which should show its level-0 foundation immediately)
// keeps showing its old texture here too until a real camera pan happens
// to come along, since `refreshLiveSettlement` only ever touches
// `world.model`'s tile data, never the renderer.
watch(
  [() => canvasRef.value?.renderer, () => world.hud.buildings],
  ([renderer]) => {
    renderer?.forceRebuild();
  },
);
</script>

<template>
  <div class="landing">
    <SettlementCanvas
      v-if="player.hasFoundedSettlement ? world.selectedSettlementId : previewCoord"
      ref="canvasRef"
      :world-model="world.model"
      :player-id="player.id"
      :settlement-id="player.hasFoundedSettlement ? (world.selectedSettlementId ?? undefined) : undefined"
      :preview-center="player.hasFoundedSettlement ? undefined : (previewCoord ?? undefined)"
      :highlight-coord="
        player.hasFoundedSettlement || !DEMO_MODE ? undefined : (previewCoord ?? undefined)
      "
      :highlight-coords="player.hasFoundedSettlement || DEMO_MODE ? undefined : nearbyStartCoords"
      :screen-bias-x="0.16"
      :lock-camera="!player.hasFoundedSettlement"
      hide-settlement-badge
      background="radial-gradient(120% 100% at 68% 42%, #16414f 0%, #0d2530 55%, #0b1116 100%)"
      @hex-click="onHexClick"
    />
    <TopBar>
      <HudNav />
    </TopBar>

    <!-- Once a settlement exists, fog is on screen and the camera is
         mid-transition — the hero copy would either sit unreadably over
         moving mist or (once centred, no more screenBiasX) right behind
         the village itself. The progress tray below already carries
         onboarding status, so it's the only thing left on screen. -->
    <div v-if="!player.hasFoundedSettlement && joinBlocked" class="hero">
      <div class="eyebrow">{{ t('landing.hero.eyebrow') }}</div>
      <h1>{{ t('landing.hero.notOpenTitle') }}</h1>
      <p class="lede">{{ joinBlockedMessage }}</p>
    </div>
    <div v-else-if="!player.hasFoundedSettlement" class="hero">
      <div class="eyebrow">{{ t('landing.hero.eyebrow') }}</div>
      <h1>{{ t('landing.hero.title') }}</h1>
      <p class="lede">
        {{ t('landing.hero.lede') }}
      </p>
      <!-- Live mode offers up to 6 plots (the suggestion plus its
           alternatives — PlotReservationOptions.AlternativeCount); demo mode
           has exactly one findLandfall hex and shows no count at all. -->
      <p v-if="!DEMO_MODE && nearbyStartCoords.length > 0" class="plot-count">
        <span class="plot-count-dot" />
        <span class="plot-count-text">
          {{
            nearbyStartCoords.length === 1
              ? t('landing.hero.plotsFreeOne')
              : t('landing.hero.plotsFreeMany', { count: nearbyStartCoords.length })
          }}
        </span>
        <span class="plot-count-suffix">{{ t('landing.hero.plotsFreeSuffix') }}</span>
      </p>
      <p v-if="founding" class="status">{{ t('landing.hero.makingLandfall') }}</p>
      <p v-else-if="invalidClickMessage" class="status">{{ invalidClickMessage }}</p>
    </div>

    <GuidancePointer
      v-if="pointerTarget"
      :coord="pointerTarget.mode === 'hex' ? pointerTarget.coord : undefined"
      :renderer="pointerTarget.mode === 'hex' ? canvasRef?.renderer : undefined"
      :screen="pointerTarget.mode === 'screen' ? pointerTarget.screen : undefined"
      :label="pointerTarget.label"
      :angle="pointerTarget.angle"
    />
    <ResourceTicker :ticks="resourceTicks" @expire="onResourceTickExpire" />

    <!-- Frame 2: the landfall banner floats near the top ALONGSIDE the
         checklist (still at the bottom) — the mockup shows both at once,
         unlike completion, where the banner replaces the checklist
         entirely since there's nothing left to check off. -->
    <OnboardingBanner v-if="showLandfallBanner" variant="landfall" />
    <OnboardingBanner v-if="guidance.complete" variant="complete" @continue="onContinueToSettlement" />
    <OnboardingChecklist
      v-if="!joinBlocked && !guidance.complete"
      :guidance="guidance"
      :has-founded="player.hasFoundedSettlement"
    />

    <div class="footer">
      <span>{{ t('landing.footer.sea') }}</span>
      <span>{{ t('landing.footer.noAccount') }}</span>
      <span>{{ t('landing.footer.nothingToInstall') }}</span>
    </div>

    <BuildQueuePanel v-if="player.hasFoundedSettlement" @select="onQueueSelect" />
    <!-- Flat: no `categories`, so the ring stays one lane deep — onboarding
         offers a handful of types, not a hierarchy. -->
    <RingMenu
      v-if="ringScreen"
      :x="ringScreen.x"
      :y="ringScreen.y"
      :actions="ringActions"
      :terrain-label="ringTerrainLabel"
      :coord-label="ringCoordLabel"
      :note="ringNote"
      @select="onRingSelect"
      @close="closeRing"
      @outside-pointer-down="closeRing"
      @layout="ringLaneSpots = $event"
    />
  </div>
</template>

<style scoped>
.landing {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
.hero {
  position: absolute;
  left: 56px;
  top: 30%;
  max-width: 520px;
  z-index: 5;
  pointer-events: none;
}
.eyebrow {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gold);
}
h1 {
  margin: 18px 0 0;
  font-size: clamp(32px, 4.5vw, 56px);
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--text);
}
.lede {
  margin: 18px 0 0;
  font-size: 17px;
  line-height: 1.5;
  color: var(--muted);
  max-width: 42ch;
}
.status {
  margin-top: 14px;
  font-size: 14px;
  color: var(--gold);
}
.plot-count {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 22px 0 0;
}
.plot-count-dot {
  width: 12px;
  height: 12px;
  flex: none;
  background: var(--gold);
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
.plot-count-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--gold);
}
.plot-count-suffix {
  font-size: 13px;
  color: var(--muted);
}
.footer {
  position: absolute;
  left: 44px;
  right: 44px;
  bottom: 0;
  height: 70px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 30px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 13px;
  color: var(--muted-2);
  pointer-events: none;
}
</style>
