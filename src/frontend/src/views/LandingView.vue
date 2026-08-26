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
  previewCoord.value = world.model.findLandfall({ q: 0, r: 0 }) ?? { q: 0, r: 0 };
});
onUnmounted(() => world.stopHudSync());

const buildingsPlaced = computed(() => world.hud.buildingsPlaced);
const onboardingComplete = computed(() => buildingsPlaced.value >= ONBOARDING_TARGET_BUILDINGS);
const buildingsToGo = computed(() => Math.max(0, ONBOARDING_TARGET_BUILDINGS - buildingsPlaced.value));

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
    if (tile.terrain === 'sea' || founding.value) return;
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
    // into a real settlement view in place, same camera, no remount.
    canvasRef.value?.renderer?.updateOptions({
      settlementId: settlement.id,
      previewCenter: undefined,
      highlightCoord: undefined,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      // Another tab/reload already founded this player's settlement.
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
      background="radial-gradient(120% 100% at 68% 42%, #16414f 0%, #0d2530 55%, #0b1116 100%)"
      @hex-click="onHexClick"
    />
    <TopBar />
    <HudNav />

    <div class="hero">
      <template v-if="!player.hasFoundedSettlement">
        <div class="eyebrow">Empty plot · Bjarnøy</div>
        <h1>Put your longhouse somewhere.</h1>
        <p class="lede">
          That's the whole tutorial. Pick a hex, drop the building, and the grain starts counting.
          Nobody asks your name until you have something worth naming.
        </p>
        <p v-if="founding" class="status">Making landfall…</p>
      </template>
      <template v-else-if="!onboardingComplete">
        <div class="eyebrow">{{ buildingsToGo }} building{{ buildingsToGo === 1 ? '' : 's' }} to go</div>
        <h1>Raise a little more before you're in.</h1>
        <p class="lede">Click any empty hex inside your border and build. Two more and you're properly onboarded.</p>
      </template>
    </div>

    <div class="tray panel">
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
