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
  /* Open sea: islands carry their own tile art, so the water itself is a
     flat painted backdrop rather than hex-tiled — matches the world-map
     mockup in docs/design/img/worldmap.png. */
  background:
    repeating-radial-gradient(
      circle at 20% 15%,
      rgba(255, 255, 255, 0.05) 0px,
      rgba(255, 255, 255, 0.05) 1px,
      transparent 1px,
      transparent 46px
    ),
    radial-gradient(140% 120% at 50% 0%, #1f5c78 0%, #123c50 55%, #0b2735 100%);
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
</style>
