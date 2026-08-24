<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import TopBar from '../components/hud/TopBar.vue';
import ResourceBar from '../components/hud/ResourceBar.vue';
import RealmPanel from '../components/hud/RealmPanel.vue';
import { useWorldStore } from '../stores/world';
import { usePlayerStore } from '../stores/player';
import { DEMO_MODE } from '../config';
import type { AxialCoord } from '../lib/hex/coords';
import type { Tile } from '../lib/map/types';

const world = useWorldStore();
const player = usePlayerStore();

onMounted(() => world.startHudSync());
onUnmounted(() => world.stopHudSync());

// zip 9: hover = stats tooltip, click = build. Kept minimal here — clicking
// an empty owned hex drops the cheapest building as a stand-in for the full
// build menu described in prototypes/village_view/README.md. Demo mode
// places a hut instantly; live mode queues a real farm against the backend
// (there is no "hut" in the backend's catalogue — see BuildingType.cs) and
// waits for the build order to complete.
function onHexClick(coord: AxialCoord, tile: Tile) {
  if (!world.selectedSettlementId) return;
  if (tile.ownerId !== world.selectedSettlementId || tile.buildingType) return;

  if (DEMO_MODE) {
    world.model.placeBuilding(world.selectedSettlementId, coord, 'hut');
    return;
  }
  world.queueBuildLive('farm', coord).catch((err) => {
    console.error('Failed to queue building against the backend', err);
  });
}
</script>

<template>
  <div class="settlement">
    <SettlementCanvas
      v-if="world.selectedSettlementId"
      :world-model="world.model"
      :player-id="player.id"
      :settlement-id="world.selectedSettlementId"
      @hex-click="onHexClick"
    />
    <TopBar />
    <ResourceBar />
    <RealmPanel />
  </div>
</template>

<style scoped>
.settlement {
  position: relative;
  width: 100vw;
  height: 100vh;
}
</style>
