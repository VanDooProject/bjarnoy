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
  overflow: hidden;
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
/* zip 7: "waves move" — a screen-space wavy-line pattern drifting slowly
   across the sea backdrop, independent of the camera (the sea itself has
   no world-space tiles to animate, per the comment above). */
.map-container::before {
  content: '';
  position: absolute;
  inset: -60px;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='60'%3E%3Cpath d='M0 30 Q 55 10 110 30 T 220 30' stroke='rgba(255,255,255,0.09)' stroke-width='2' fill='none'/%3E%3Cpath d='M0 46 Q 55 26 110 46 T 220 46' stroke='rgba(255,255,255,0.05)' stroke-width='2' fill='none'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 220px 60px;
  animation: wave-drift 16s linear infinite;
}
@keyframes wave-drift {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 220px 60px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .map-container::before {
    animation: none;
  }
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
</style>
