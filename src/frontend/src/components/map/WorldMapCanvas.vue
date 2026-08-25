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
  /* Open sea: islands carry their own flat hex fill (see
     HexMapRenderer's WORLD_TERRAIN_FILL), so the water itself is a plain
     painted backdrop underneath — matches the "playful" sea style in
     prototypes/worldmap/Viking Realm.dc.html's sea() method, the style
     shown in docs/design/img/worldmap.png. Wave squiggles are drawn in
     the canvas itself (HexMapRenderer's waveLayer/drawWaves), not here —
     they need to know which patches of sea are actually open water. */
  background: radial-gradient(115% 100% at 45% 40%, #2a92ae 0%, #14657f 48%, #0b3c50 100%);
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
</style>
