<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import TopBar from '../components/hud/TopBar.vue';
import ResourceBar from '../components/hud/ResourceBar.vue';
import RealmPanel from '../components/hud/RealmPanel.vue';
import { useWorldStore } from '../stores/world';
import { usePlayerStore } from '../stores/player';
import type { AxialCoord } from '../lib/hex/coords';
import type { Tile } from '../lib/map/types';

const world = useWorldStore();
const player = usePlayerStore();

onMounted(() => world.startHudSync());
onUnmounted(() => world.stopHudSync());

// zip 9: hover = stats tooltip, click = build. Kept minimal here — clicking
// an empty owned hex drops the cheapest building (a hut) as a stand-in for
// the full build menu described in prototypes/village_view/README.md.
function onHexClick(coord: AxialCoord, tile: Tile) {
  if (!world.selectedSettlementId) return;
  if (tile.ownerId !== world.selectedSettlementId || tile.buildingType) return;
  world.model.placeBuilding(world.selectedSettlementId, coord, 'hut');
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
