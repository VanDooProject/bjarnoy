<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import WorldMapCanvas from '../components/map/WorldMapCanvas.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import ResourceBar from '../components/hud/ResourceBar.vue';
import FogDebugPanel from '../components/hud/FogDebugPanel.vue';
import { useWorldStore } from '../stores/world';
import { usePlayerStore } from '../stores/player';
import { useFogDebug } from '../composables/useFogDebug';

// zip 6a: founding happens on the landing page now, never here — the
// router guard (router/index.ts) guarantees a settlement already exists by
// the time this view is reached, so this is purely the post-onboarding
// abstracted world map (zip 4/7's "same hex lattice as the settlement view,
// flattened"), not a second place a settlement could be founded.
const world = useWorldStore();
const player = usePlayerStore();
const router = useRouter();

// ?debug=1 surfaces FogDebugPanel — see useFogDebug and issue #20: this used
// to be wired into SettlementView only, so there was no way to inspect fog
// rendering (fogDebugFlags) while actually looking at the world map, even
// though every flag it controls also gates world-mode rendering.
const showFogDebug = useFogDebug();
const canvasRef = ref<InstanceType<typeof WorldMapCanvas> | null>(null);
function onFogDebugChange() {
  canvasRef.value?.renderer?.forceRebuild();
}

onMounted(async () => {
  // Sequenced (not fire-and-forget in parallel): `restoreLiveSettlement`
  // also calls `bootstrapLiveWorld()` internally, and `refreshWorldSettlements`
  // needs `selectedSettlementId` already set so it doesn't briefly register
  // this player's own settlement as a rival (wrong `ownerId`) before
  // `restoreLiveSettlement` corrects it.
  await world.bootstrapLiveWorld();
  if (player.settlementId) {
    await world.restoreLiveSettlement(player.id, player.settlementId);
    world.startHudSync();
  }
  void world.refreshWorldSettlements();
});
onUnmounted(() => world.stopHudSync());

function onHexClick() {
  router.push('/settlement');
}
</script>

<template>
  <div class="world-view">
    <WorldMapCanvas ref="canvasRef" :world-model="world.model" :player-id="player.id" @hex-click="onHexClick" />
    <FogDebugPanel v-if="showFogDebug" @change="onFogDebugChange" />
    <TopBar />
    <HudNav />
    <ResourceBar />
  </div>
</template>

<style scoped>
.world-view {
  position: relative;
  width: 100vw;
  height: 100vh;
}
</style>
