<script setup lang="ts">
// zip 6a ("Place a building before you sign up"): the landing page IS the
// village view, not a marketing page in front of it. A real plot of terrain
// is on screen immediately; the first interaction is founding a settlement
// right there (no world map, no form). Once founded, the same canvas keeps
// going as a guided tutorial — build two more buildings — before the
// nickname prompt (and only then a route into the full game) appears.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import BuildQueuePanel from '../components/hud/BuildQueuePanel.vue';
import RingMenu, { type RingAction } from '../components/hud/RingMenu.vue';
import NicknamePrompt from '../components/onboarding/NicknamePrompt.vue';
import { useWorldStore } from '../stores/world';
import { usePlayerStore } from '../stores/player';
import { DEMO_MODE } from '../config';
import { ApiError } from '../api/client';
import { hexDistance, type AxialCoord } from '../lib/hex/coords';
import { claimRadiusForLevel } from '../lib/map/shoreline';
import type { Terrain, Tile } from '../lib/map/types';

// Longhouse (founding) + 2 guided buildings — see WorldModel.countBuildings.
const ONBOARDING_TARGET_BUILDINGS = 3;

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
const ONBOARDING_BUILD_RING: { type: OnboardingBuildType; label: string }[] = [
  { type: 'farm', label: 'Farm' },
  { type: 'lumberjack', label: 'Lumberjack' },
  { type: 'quarry', label: 'Quarry' },
  { type: 'tower', label: 'Watchtower' },
  { type: 'fishinghut', label: 'Fishing Hut' },
];

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
const showPrompt = ref(false);
const invalidClickMessage = ref<string | null>(null);
let invalidClickTimer: ReturnType<typeof setTimeout> | undefined;

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
  // `findLandfall`, an arbitrary walkable hex — the two already agree there.
  // Live mode previews the nearest start position purely to centre the
  // camera; `nearbyStartCoords` below is what's actually clickable.
  previewCoord.value = DEMO_MODE
    ? (world.model.findLandfall({ q: 0, r: 0 }) ?? { q: 0, r: 0 })
    : (world.nearestStartPosition({ q: 0, r: 0 })?.at ??
      world.model.findLandfall({ q: 0, r: 0 }) ?? { q: 0, r: 0 });
  if (!DEMO_MODE) {
    nearbyStartCoords.value = world.nearbyStartPositions({ q: 0, r: 0 }).map((pos) => pos.at);
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
    return `This world opens ${startsAt.toLocaleString()}.`;
  }
  if (world.worldJoinableReason === 'JoinsClosed') {
    return 'This world is no longer accepting new players.';
  }
  if (world.worldJoinableReason === 'NoWorldYet') {
    return 'No world has been created yet — check back soon.';
  }
  return 'This world is not accepting new players right now.';
});

const buildingsPlaced = computed(() => world.hud.buildingsPlaced);
const onboardingComplete = computed(() => buildingsPlaced.value >= ONBOARDING_TARGET_BUILDINGS);

// Covers both "just crossed the threshold" and "arrived here mid-onboarding,
// already past it" (a reload right as the last build order completed).
watch(onboardingComplete, (complete) => {
  if (complete) showPrompt.value = true;
}, { immediate: true });

// Ring menu state for the onboarding build step — mirrors SettlementView's
// own ringScreen/selectedCoord, but flat (one ring, no build-categories /
// build-buildings drill-down): onboarding only ever offers a handful of
// types, so there's no need for that hierarchy here.
const ringScreen = ref<{ x: number; y: number } | null>(null);
const ringCoord = ref<AxialCoord | null>(null);
const ringTerrain = ref<Terrain | null>(null);

watch(ringScreen, (screen) => {
  canvasRef.value?.renderer?.setInteractionLocked(!!screen);
});

const ringActions = computed<RingAction[]>(() =>
  ONBOARDING_BUILD_RING.map(({ type, label }) => {
    const requiredTerrain = GUIDED_BUILD_TERRAIN[type];
    const guided = requiredTerrain !== undefined;
    const fitsTile = guided && requiredTerrain === ringTerrain.value;
    return {
      id: type,
      label,
      disabled: !fitsTile,
      hint: !guided
        ? 'Finish the guided buildings first'
        : !fitsTile
          ? `Needs ${requiredTerrain} terrain — try a different hex`
          : undefined,
    };
  }),
);

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

// Live mode only: `WorldModel.borderRadius` (what marks a tile's `ownerId`,
// and thus what reads as "your territory" on screen) is deliberately more
// generous than the backend's actual buildable range
// (`Settlement.ClaimRadius`, mirrored here via `claimRadiusForLevel`) — see
// `WorldModel.borderRadius`'s own comment. Without this extra check, the
// tutorial ring opened on hexes the backend would always reject with
// `HexNotInSettlement`, which is exactly the "ring 2 fails to close"
// symptom `onRingSelect` used to hit below. Demo mode has no backend to
// disagree with, so its own `tile.ownerId` (bounded by the same
// `borderRadius`) is already the full truth.
function withinBuildableRange(coord: AxialCoord): boolean {
  if (DEMO_MODE || !world.selectedSettlementId) return true;
  const settlement = world.model.getSettlement(world.selectedSettlementId);
  if (!settlement) return false;
  return hexDistance({ q: settlement.q, r: settlement.r }, coord) <= claimRadiusForLevel(settlement.level);
}

function onHexClick(coord: AxialCoord, tile: Tile, screen: { x: number; y: number }) {
  if (!player.hasFoundedSettlement) {
    if (tile.terrain === 'sea' || founding.value || joinBlocked.value) return;
    // Live mode only founds on an exact, unclaimed start position (see
    // `startPositionAt`, issue #96) — a click elsewhere used to silently
    // found on the nearest one instead; now it just tells the player to
    // pick one of the highlighted plots.
    if (!DEMO_MODE && !world.startPositionAt(coord)) {
      showInvalidClickMessage("You can't found there — pick one of the glowing plots.");
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
      showInvalidClickMessage("That hex is beyond your longhouse's claim — build closer to home.");
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

async function onRingSelect(type: string) {
  const coord = ringCoord.value;
  if (!world.selectedSettlementId || !coord) return;
  if (DEMO_MODE) {
    world.model.placeBuilding(world.selectedSettlementId, coord, type as OnboardingBuildType);
    world.syncHud();
    closeRing();
    return;
  }
  // Always close, win or lose — matching SettlementView's own onRingSelect
  // (see its `buildType` call). A failed order used to leave the ring open
  // with only a console.error, which is the "ring fails to close" bug: the
  // player had no way to tell the click did anything at all.
  closeRing();
  try {
    await world.queueBuildLive(type, coord);
  } catch (err) {
    console.error('Failed to queue building against the backend', err);
    showInvalidClickMessage("That order didn't go through — try a different hex.");
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
    const realmName = player.nickname ? `${player.nickname}'s realm` : 'Unnamed realm';
    const settlement = DEMO_MODE
      ? world.foundStartingSettlement(player.id, player.ownerName, realmName, coord)
      : await world.foundStartingSettlementLive(player.id, player.ownerName, realmName, coord);
    player.foundSettlement(settlement.id);
    world.startHudSync();
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
    });
  } catch (err) {
    // A 409 covers several distinct rejections (see FoundingRejection) —
    // only AlreadyFounded actually means "you already have a settlement,
    // go there". The others (PlotTaken, TooCloseToNeighbour, ...) mean
    // someone else claimed a start position between bootstrapLiveWorld()
    // and this click; leave the player on the landing page so they can
    // just click again — foundStartingSettlementLive re-syncs who else has
    // founded before picking the next nearest plot.
    if (err instanceof ApiError && err.problem?.rejection === 'AlreadyFounded') {
      router.push('/settlement');
    } else {
      console.error('Failed to found settlement against the backend', err);
    }
  } finally {
    founding.value = false;
  }
}

function closePrompt() {
  showPrompt.value = false;
  player.completeOnboarding();
  router.push('/settlement');
}
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
      <div class="eyebrow">Empty plot · Bjarnøy</div>
      <h1>Not open yet.</h1>
      <p class="lede">{{ joinBlockedMessage }}</p>
    </div>
    <div v-else-if="!player.hasFoundedSettlement" class="hero">
      <div class="eyebrow">Empty plot · Bjarnøy</div>
      <h1>Put your longhouse somewhere.</h1>
      <p class="lede">
        That's the whole tutorial. Pick a hex, drop the building, and the grain starts counting.
        Nobody asks your name until you have something worth naming.
      </p>
      <p v-if="founding" class="status">Making landfall…</p>
      <p v-else-if="invalidClickMessage" class="status">{{ invalidClickMessage }}</p>
    </div>

    <div v-if="!joinBlocked" class="tray panel">
      <div class="tray-item" :class="{ done: player.hasFoundedSettlement }">
        <div class="dot" />
        <div>
          <div class="name">Longhouse &amp; yard</div>
          <div class="sub">{{ player.hasFoundedSettlement ? 'Placed' : 'Click your plot to place it' }}</div>
        </div>
      </div>
      <div
        v-for="n in 2"
        :key="n"
        class="tray-item"
        :class="{ done: buildingsPlaced >= n + 1, current: player.hasFoundedSettlement && buildingsPlaced === n }"
      >
        <div class="dot" />
        <div>
          <div class="name">Building {{ n + 1 }}</div>
          <div class="sub">
            {{
              buildingsPlaced >= n + 1
                ? 'Placed'
                : player.hasFoundedSettlement
                  ? 'Click an empty hex in your border'
                  : 'Found your longhouse first'
            }}
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <span>Kettil Sea</span>
      <span>No account</span>
      <span>Nothing to install</span>
    </div>

    <BuildQueuePanel v-if="player.hasFoundedSettlement" @select="onQueueSelect" />
    <RingMenu
      v-if="ringScreen"
      :x="ringScreen.x"
      :y="ringScreen.y"
      :actions="ringActions"
      backdrop
      @select="onRingSelect"
      @close="closeRing"
      @outside-pointer-down="closeRing"
    />
    <NicknamePrompt v-if="showPrompt" @close="closePrompt" />
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
.tray {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 96px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
}
.tray-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 15px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.tray-item.current {
  background: var(--gold);
  border-color: var(--gold);
}
.tray-item.current .name,
.tray-item.current .sub {
  color: #20160a;
}
.tray-item.done {
  opacity: 0.55;
}
.dot {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* Issue #95: a completed step used to only dim (`.tray-item.done`'s
   opacity) — nothing on the row itself said "done" versus "not started
   yet", so progress never visibly ticked off as buildings queued.  A
   checkmark on the dot gives each row its own explicit done state. */
.tray-item.done .dot {
  background: var(--gold);
  color: #20160a;
  font-size: 15px;
  font-weight: 700;
}
.tray-item.done .dot::after {
  content: '✓';
}
.name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.sub {
  font-size: 12px;
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
