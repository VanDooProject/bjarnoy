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
  highlightCoords?: AxialCoord[];
  screenBiasX?: number;
  // Overrides the container's default fog-matching backdrop — the landing
  // page's preview (water not drawn at all, see HexMapRenderer) needs its
  // own themed backdrop instead, not the light shade tuned to blend with
  // in-game fog.
  background?: string;
  // Issue #16 follow-up: the settlement name/level badge is village-view
  // chrome — the landing page shouldn't show it, even for the moment after
  // founding there (before the player navigates to /settlement). Named as
  // a "hide" flag, not "show": an optional `boolean` prop with no runtime
  // default resolves an *absent* value to `false` (Vue's Boolean-prop
  // casting), not `undefined` — a `showX` flag would default to hidden for
  // every caller that doesn't pass it, including SettlementView, the only
  // other caller. `hideX` defaulting to `false` (shown) is what every
  // other caller actually wants without opting in.
  hideSettlementBadge?: boolean;
}>();
const emit = defineEmits<{
  'hex-click': [coord: AxialCoord, tile: Tile, screen: { x: number; y: number }];
  hover: [info: HoverInfo | null];
  // Issue #93: a draft waypoint pin was dragged onto another hex — see
  // HexMapRendererOptions.onWaypointMove.
  'waypoint-move': [index: number, coord: AxialCoord];
}>();

const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

const { renderer } = useHexMapRenderer(canvas, container, {
  mode: 'settlement',
  worldModel: props.worldModel,
  playerId: props.playerId,
  settlementId: props.settlementId,
  previewCenter: props.previewCenter,
  highlightCoord: props.highlightCoord,
  highlightCoords: props.highlightCoords,
  screenBiasX: props.screenBiasX,
  hideSettlementBadge: props.hideSettlementBadge,
  onHexClick: (coord, tile, screen) => emit('hex-click', coord, tile, screen),
  onHoverChange: (info) => emit('hover', info),
  onWaypointMove: (index, coord) => emit('waypoint-move', index, coord),
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
