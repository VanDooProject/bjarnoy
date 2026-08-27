<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import ResourceBar from '../components/hud/ResourceBar.vue';
import RealmPanel from '../components/hud/RealmPanel.vue';
import BuildQueuePanel from '../components/hud/BuildQueuePanel.vue';
import ActivityPanel from '../components/hud/ActivityPanel.vue';
import HexTooltip from '../components/hud/HexTooltip.vue';
import BuildingModal from '../components/hud/BuildingModal.vue';
import RingMenu, { type RingAction } from '../components/hud/RingMenu.vue';
import FogDebugPanel from '../components/hud/FogDebugPanel.vue';
import { useWorldStore } from '../stores/world';
import { usePlayerStore } from '../stores/player';
import { DEMO_MODE } from '../config';
import type { AxialCoord } from '../lib/hex/coords';
import type { Tile } from '../lib/map/types';
import { BUILDING_LABELS, TERRAIN_LABELS, type HoverInfo } from '../lib/map/HexMapRenderer';

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

// issue #16 status box: "clicking a building in queue should center and
// highlight (some flashes) the tile".
function onQueueSelect(coord: AxialCoord) {
  canvasRef.value?.renderer?.flashHighlight(coord);
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

function closeModal() {
  selectedCoord.value = null;
  selectedTile.value = null;
  modalBusy.value = false;
}

// issue #16 "ring menu on click of tile": clicking a hex now opens a
// contextual radial menu (RingMenu.vue) instead of jumping straight to
// BuildingModal — the action set below matches the issue's four tile
// categories (empty tile in the realm / placed building / enemy realm tile
// / unclaimed hex). Actions the game has no mechanic for yet (tear down,
// train, research, attack/raid, send settlers) are shown disabled with a
// reason rather than left out, so the menu's shape matches the design even
// before those systems exist.
const ringMenu = ref<{ coord: AxialCoord; tile: Tile; x: number; y: number } | null>(null);

function ringTitle(tile: Tile): string {
  return tile.buildingType ? BUILDING_LABELS[tile.buildingType] : TERRAIN_LABELS[tile.terrain];
}

function actionsFor(tile: Tile): RingAction[] {
  const owner = tile.ownerId ? world.model.getSettlement(tile.ownerId) : undefined;
  const mine = owner?.id === world.selectedSettlementId;

  if (tile.buildingType) {
    if (mine) {
      return [
        { key: 'upgrade', label: 'Upgrade' },
        { key: 'details', label: 'Details' },
        { key: 'teardown', label: 'Tear down', disabled: true, reason: 'Not implemented yet' },
        { key: 'train', label: 'Train', disabled: true, reason: 'Troops/ships not implemented yet' },
        { key: 'research', label: 'Research', disabled: true, reason: 'Not implemented yet' },
      ];
    }
    return [
      { key: 'details', label: 'Info' },
      { key: 'attack', label: 'Attack / raid', disabled: true, reason: 'Combat not implemented yet' },
    ];
  }
  if (tile.terrain === 'sea') return [{ key: 'details', label: 'Info' }];
  if (owner) {
    if (mine) {
      return [
        { key: 'details', label: 'Info' },
        { key: 'build', label: 'Build' },
      ];
    }
    return [
      { key: 'details', label: 'Info' },
      { key: 'attack', label: 'Attack / raid', disabled: true, reason: 'Combat not implemented yet' },
    ];
  }
  const coastal = tile.terrain === 'sand';
  return [
    { key: 'details', label: 'Info' },
    {
      key: coastal ? 'land' : 'settlers',
      label: coastal ? 'Land here' : 'Send settlers',
      disabled: true,
      reason: 'No settlers available',
    },
  ];
}

const ringActions = computed(() => (ringMenu.value ? actionsFor(ringMenu.value.tile) : []));

function onHexClick(coord: AxialCoord, tile: Tile, screen: { x: number; y: number }) {
  hoverInfo.value = null;
  ringMenu.value = { coord, tile, x: screen.x, y: screen.y };
}

function closeRingMenu() {
  ringMenu.value = null;
}

function onRingSelect(key: string) {
  const menu = ringMenu.value;
  if (!menu) return;
  closeRingMenu();
  selectedCoord.value = menu.coord;
  selectedTile.value = menu.tile;
  // 'details' and 'build' both open BuildingModal (set above) — its own
  // button does the actual build. 'upgrade' is a one-click quick action
  // instead, no modal detour.
  if (key === 'upgrade') void upgrade();
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
    <div class="status-stack">
      <BuildQueuePanel @select="onQueueSelect" />
      <ActivityPanel />
    </div>
    <HexTooltip v-if="hoverInfo" :info="hoverInfo" />
    <RingMenu
      v-if="ringMenu"
      :x="ringMenu.x"
      :y="ringMenu.y"
      :title="ringTitle(ringMenu.tile)"
      :actions="ringActions"
      @select="onRingSelect"
      @close="closeRingMenu"
    />
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
/* issue #16 "status box, on left side": build queue + activity panels
   stacked as one column instead of each guessing the other's height with a
   hardcoded offset. */
.status-stack {
  position: absolute;
  left: 16px;
  top: 76px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
