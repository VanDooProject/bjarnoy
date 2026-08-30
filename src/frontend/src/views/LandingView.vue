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
import BuildingModal from '../components/hud/BuildingModal.vue';
import NicknamePrompt from '../components/onboarding/NicknamePrompt.vue';
import { useWorldStore } from '../stores/world';
import { usePlayerStore } from '../stores/player';
import { DEMO_MODE } from '../config';
import { ApiError } from '../api/client';
import type { AxialCoord } from '../lib/hex/coords';
import type { Tile } from '../lib/map/types';

// Longhouse (founding) + 2 guided buildings — see WorldModel.countBuildings.
const ONBOARDING_TARGET_BUILDINGS = 3;

const world = useWorldStore();
const player = usePlayerStore();
const router = useRouter();

const canvasRef = ref<InstanceType<typeof SettlementCanvas> | null>(null);
const previewCoord = ref<AxialCoord | null>(null);
const founding = ref(false);
const showPrompt = ref(false);

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
  // Live mode must highlight the exact hex foundStartingSettlementLive will
  // actually found on (nearestStartPosition), not just any nearby land tile
  // (model.findLandfall) — those are two different coordinate systems (an
  // arbitrary walkable hex vs. one of the island's precomputed start
  // positions) that usually don't agree. Previewing the wrong one used to
  // mean the settlement "landed" somewhere else the instant it was founded,
  // which then made the very next build click fail as outside its borders
  // — the player was still clicking near where the preview told them their
  // village was, not where it actually ended up. Demo mode has no start
  // positions at all, so it keeps using findLandfall, which
  // foundStartingSettlement (demo's own founder) also seeds `near` from —
  // the two already agree there.
  previewCoord.value = DEMO_MODE
    ? (world.model.findLandfall({ q: 0, r: 0 }) ?? { q: 0, r: 0 })
    : (world.nearestStartPosition({ q: 0, r: 0 })?.at ??
      world.model.findLandfall({ q: 0, r: 0 }) ?? { q: 0, r: 0 });
});
onUnmounted(() => world.stopHudSync());

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

const selectedCoord = ref<AxialCoord | null>(null);
const selectedTile = ref<Tile | null>(null);
const modalBusy = ref(false);

const modalMine = computed(
  () => !!selectedTile.value && selectedTile.value.ownerId === world.selectedSettlementId,
);
const modalOwnerLabel = computed(() => {
  const tile = selectedTile.value;
  if (!tile?.ownerId) return null;
  const owner = world.model.getSettlement(tile.ownerId);
  if (!owner) return null;
  return owner.ownerId === player.id ? owner.name : `${owner.ownerName}'s ${owner.name}`;
});

function onHexClick(coord: AxialCoord, tile: Tile) {
  if (!player.hasFoundedSettlement) {
    if (tile.terrain === 'sea' || founding.value || joinBlocked.value) return;
    void foundHere(coord);
    return;
  }
  selectedCoord.value = coord;
  selectedTile.value = tile;
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

function closeModal() {
  selectedCoord.value = null;
  selectedTile.value = null;
  modalBusy.value = false;
}

async function build() {
  if (!world.selectedSettlementId || !selectedCoord.value) return;
  if (DEMO_MODE) {
    world.model.placeBuilding(world.selectedSettlementId, selectedCoord.value, 'hut');
    world.syncHud();
    closeModal();
    return;
  }
  modalBusy.value = true;
  try {
    await world.queueBuildLive('farm', selectedCoord.value);
    closeModal();
  } catch (err) {
    console.error('Failed to queue building against the backend', err);
    modalBusy.value = false;
  }
}

async function upgrade() {
  if (!world.selectedSettlementId || !selectedCoord.value || !selectedTile.value?.buildingType) return;
  if (DEMO_MODE) {
    const tile = world.model.getTile(selectedCoord.value.q, selectedCoord.value.r);
    tile.buildingLevel = (selectedTile.value.buildingLevel ?? 1) + 1;
    closeModal();
    return;
  }
  modalBusy.value = true;
  try {
    await world.queueBuildLive(selectedTile.value.buildingType, selectedCoord.value);
    closeModal();
  } catch (err) {
    console.error('Failed to queue upgrade against the backend', err);
    modalBusy.value = false;
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
      :highlight-coord="player.hasFoundedSettlement ? undefined : (previewCoord ?? undefined)"
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

    <BuildingModal
      v-if="selectedTile"
      :tile="selectedTile"
      :mine="modalMine"
      :owner-label="modalOwnerLabel"
      :busy="modalBusy"
      @close="closeModal"
      @build="build"
      @upgrade="upgrade"
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
