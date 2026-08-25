<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import ResourceBar from '../components/hud/ResourceBar.vue';
import RealmPanel from '../components/hud/RealmPanel.vue';
import BuildQueuePanel from '../components/hud/BuildQueuePanel.vue';
import HexTooltip from '../components/hud/HexTooltip.vue';
import BuildingModal from '../components/hud/BuildingModal.vue';
import FogDebugPanel from '../components/hud/FogDebugPanel.vue';
import { useWorldStore } from '../stores/world';
import { usePlayerStore } from '../stores/player';
import { DEMO_MODE } from '../config';
import type { AxialCoord } from '../lib/hex/coords';
import type { Tile } from '../lib/map/types';
import type { HoverInfo } from '../lib/map/HexMapRenderer';

const world = useWorldStore();
const player = usePlayerStore();
const route = useRoute();

// ?debug=1 surfaces FogDebugPanel — same idea as window.__fogDebug (main.ts)
// but clickable, and not gated to demo mode: these are pure client-side
// rendering toggles, nothing about game state.
const showFogDebug = computed(() => route.query.debug === '1');
const canvasRef = ref<InstanceType<typeof SettlementCanvas> | null>(null);
function onFogDebugChange() {
  canvasRef.value?.renderer?.forceRebuild();
}

onMounted(async () => {
  // A direct load of /settlement (reload, deep link) arrives here before
  // WorldMapView ever mounts, so this view needs its own bootstrap/restore
  // instead of assuming `world.selectedSettlementId` is already set.
  if (!DEMO_MODE && player.hasFoundedSettlement && player.settlementId) {
    await world.restoreLiveSettlement(player.id, player.settlementId);
  }
  world.startHudSync();
});
onUnmounted(() => world.stopHudSync());

const hoverInfo = ref<HoverInfo | null>(null);
function onHover(info: HoverInfo | null) {
  hoverInfo.value = info;
}

// zip 9: "Hex interaction | Hover = stats tooltip · Click = full-screen
// building screen" — clicking a hex opens the full-screen detail screen
// (BuildingModal) instead of building instantly; the modal's own
// build/upgrade button does the actual placement.
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
  hoverInfo.value = null;
  selectedCoord.value = coord;
  selectedTile.value = tile;
}

function closeModal() {
  selectedCoord.value = null;
  selectedTile.value = null;
  modalBusy.value = false;
}

// Demo mode places a hut instantly; live mode queues a real farm against the
// backend (there is no "hut" in the backend's catalogue — see
// BuildingType.cs) and waits for the build order to complete. Kept as the
// existing stand-in for the full build-choice menu, just surfaced through
// the modal rather than fired straight from the click.
async function build() {
  if (!world.selectedSettlementId || !selectedCoord.value) return;
  if (DEMO_MODE) {
    world.model.placeBuilding(world.selectedSettlementId, selectedCoord.value, 'hut');
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
</script>

<template>
  <div class="settlement">
    <SettlementCanvas
      v-if="world.selectedSettlementId"
      ref="canvasRef"
      :world-model="world.model"
      :player-id="player.id"
      :settlement-id="world.selectedSettlementId"
      @hex-click="onHexClick"
      @hover="onHover"
    />
    <FogDebugPanel v-if="showFogDebug" @change="onFogDebugChange" />
    <!-- The white unexplored-fog fill (HexMapRenderer's FOG_UNEXPLORED) is
         much lighter than the old backdrop this HUD chrome was designed
         against, and can sit right behind the top bar depending on where
         the camera starts — this scrim (matching Viking Realm.dc.html's own
         top-bar gradient) keeps the logo/resources/nav readable regardless
         of what's under them. -->
    <div class="hud-scrim" />
    <TopBar />
    <HudNav />
    <ResourceBar />
    <RealmPanel />
    <BuildQueuePanel />
    <HexTooltip v-if="hoverInfo" :info="hoverInfo" />
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
  </div>
</template>

<style scoped>
.settlement {
  position: relative;
  width: 100vw;
  height: 100vh;
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
</style>
