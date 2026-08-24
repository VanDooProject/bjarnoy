<script setup lang="ts">
import { ref } from 'vue';
import { useHexMapRenderer } from '../../composables/useHexMapRenderer';
import type { WorldModel } from '../../lib/map/WorldModel';
import type { AxialCoord } from '../../lib/hex/coords';
import type { Tile } from '../../lib/map/types';

const props = defineProps<{ worldModel: WorldModel; playerId: string }>();
const emit = defineEmits<{ 'hex-click': [coord: AxialCoord, tile: Tile] }>();

const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

useHexMapRenderer(canvas, container, {
  mode: 'world',
  worldModel: props.worldModel,
  playerId: props.playerId,
  onHexClick: (coord, tile) => emit('hex-click', coord, tile),
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
  background: radial-gradient(120% 120% at 50% 0%, #0e1a22 0%, #060b0e 70%);
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
</style>
