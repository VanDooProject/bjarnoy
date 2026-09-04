<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import WorldMapCanvas from '../components/map/WorldMapCanvas.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import ResourceBar from '../components/hud/ResourceBar.vue';
import FogDebugPanel from '../components/hud/FogDebugPanel.vue';
import FogPerfPanel from '../components/hud/FogPerfPanel.vue';
import WaterDebugPanel from '../components/hud/WaterDebugPanel.vue';
import WaterPerfPanel from '../components/hud/WaterPerfPanel.vue';
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

// Fog v2 (map-fog-v2.md §3): pushes a freshly fetched mask bitmap into the
// renderer as soon as both the renderer and a bitmap exist. `worldRadius`
// only ever changes on a fresh bootstrap (a new world), so `fogMaskBitmap`
// updating (every fetchFogMask poll) is what actually drives this in
// practice — same "watch both together" reasoning SettlementView.vue's own
// army-overlay watcher uses.
watch(
  [() => canvasRef.value?.renderer, () => world.fogMaskBitmap, () => world.worldRadius],
  ([renderer, bitmap, radius]) => {
    if (renderer && bitmap && radius !== null) renderer.setFogMask(radius, bitmap);
  },
);

function onHexClick() {
  router.push('/settlement');
}
</script>

<template>
  <div class="world-view">
    <WorldMapCanvas ref="canvasRef" :world-model="world.model" :player-id="player.id" @hex-click="onHexClick" />
    <div v-if="showFogDebug" class="fog-debug-stack">
      <FogDebugPanel @change="onFogDebugChange" />
      <WaterDebugPanel @change="onFogDebugChange" />
      <WaterPerfPanel />
      <FogPerfPanel />
    </div>
    <TopBar>
      <ResourceBar />
      <HudNav />
    </TopBar>
  </div>
</template>

<style scoped>
.world-view {
  position: relative;
  width: 100vw;
  height: 100vh;
}
.fog-debug-stack {
  position: absolute;
  top: 120px;
  right: 16px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* The stack has outgrown the viewport: three panels, and the water one alone
     carries ten checkboxes and six sliders. Without this the bottom handles are
     simply unreachable at 900px tall, which is the height the screenshot
     helpers run at. `bottom` matches the `top` above so it clears the HUD at
     both ends. */
  max-height: calc(100vh - 136px);
  overflow-y: auto;
}
/* Scroll the column, not the panels: flex items shrink to fit a constrained
   cross-size by default, which squashes the slider rows instead of scrolling. */
.fog-debug-stack > * {
  flex-shrink: 0;
}
</style>
