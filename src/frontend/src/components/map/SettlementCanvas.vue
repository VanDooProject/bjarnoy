<script setup lang="ts">
import { ref } from 'vue';
import { useHexMapRenderer } from '../../composables/useHexMapRenderer';
import type { WorldModel } from '../../lib/map/WorldModel';
import type { AxialCoord } from '../../lib/hex/coords';
import type { Tile } from '../../lib/map/types';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';

const props = defineProps<{
  worldModel: WorldModel;
  playerId: string;
  // Unset before the player has founded anything yet (zip 6a: the landing
  // page previews a real plot of village-view terrain first) — see
  // `previewCenter`/`highlightCoord` below and HexMapRenderer's matching
  // no-settlement fog bypass.
  settlementId?: string;
  previewCenter?: AxialCoord;
  highlightCoord?: AxialCoord;
  screenBiasX?: number;
  // Overrides the container's default fog-matching backdrop — the landing
  // page's preview (water not drawn at all, see HexMapRenderer) needs its
  // own themed backdrop instead, not the light shade tuned to blend with
  // in-game fog.
  background?: string;
}>();
const emit = defineEmits<{ 'hex-click': [coord: AxialCoord, tile: Tile]; hover: [info: HoverInfo | null] }>();

const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

const { renderer } = useHexMapRenderer(canvas, container, {
  mode: 'settlement',
  worldModel: props.worldModel,
  playerId: props.playerId,
  settlementId: props.settlementId,
  previewCenter: props.previewCenter,
  highlightCoord: props.highlightCoord,
  screenBiasX: props.screenBiasX,
  onHexClick: (coord, tile) => emit('hex-click', coord, tile),
  onHoverChange: (info) => emit('hover', info),
});

// FogDebugPanel (SettlementView.vue, ?debug=1) needs to force a rebuild
// after flipping a fogDebugFlags toggle — nothing else would make the
// change visible until the next real camera pan/zoom.
defineExpose({ renderer });
</script>

<template>
  <div ref="container" class="map-container" :style="background ? { background } : undefined">
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
