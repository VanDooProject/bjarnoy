<script setup lang="ts">
import { ref } from 'vue';
import { useHexMapRenderer } from '../../composables/useHexMapRenderer';
import type { WorldModel } from '../../lib/map/WorldModel';
import type { AxialCoord } from '../../lib/hex/coords';
import type { Tile } from '../../lib/map/types';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';

const props = defineProps<{ worldModel: WorldModel; playerId: string; settlementId: string }>();
const emit = defineEmits<{ 'hex-click': [coord: AxialCoord, tile: Tile]; hover: [info: HoverInfo | null] }>();

const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

useHexMapRenderer(canvas, container, {
  mode: 'settlement',
  worldModel: props.worldModel,
  playerId: props.playerId,
  settlementId: props.settlementId,
  onHexClick: (coord, tile) => emit('hex-click', coord, tile),
  onHoverChange: (info) => emit('hover', info),
});
</script>

<template>
  <div ref="container" class="map-container">
    <canvas ref="canvas" />
  </div>
</template>

<style scoped>
.map-container {
  position: absolute;
  inset: 0;
  /* Unexplored hexes simply aren't drawn (true fog) — a soft grey backdrop
     reads as mist beyond the scouted realm, per
     docs/design/img/fog_of_war_and_settlement_view.png. */
  background: radial-gradient(120% 120% at 50% 35%, #c7ced2 0%, #9aa4aa 55%, #5c666c 100%);
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
</style>
