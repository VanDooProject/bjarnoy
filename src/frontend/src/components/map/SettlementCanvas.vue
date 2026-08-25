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
  /* Unexplored hexes are covered by a per-hex white mist fill (see
     HexMapRenderer's FOG_UNEXPLORED), which pans with the camera and keeps
     the map feeling endless — this flat backdrop is only the fallback for
     the sliver outside that fill's cull margin, so it's toned to match
     rather than the old grey-to-slate gradient that made the map read as a
     bounded box once you panned far enough to see its edge. */
  background: #e9f0f4;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
</style>
