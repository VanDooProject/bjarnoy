<script setup lang="ts">
// The shell of an inline docs example map that names the hex under the pointer (the Bog Lands and Rivers islands): a canvas the
// game's own HexMapRenderer draws a `StaticWorldModel` onto (useDocsMapRenderer), the zoom controls, and a caption line under it
// that says what the hovered hex is. The page's map component builds its world and tells this one how to word a hex; the markup,
// the host's look and the hover wiring live here once.
import { computed, ref } from 'vue';
import { useDocsMapRenderer } from '../../composables/useDocsMapRenderer';
import DocsMapControls from './DocsMapControls.vue';
import type { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';

const props = defineProps<{
  world: StaticWorldModel;
  previewCenter: { q: number; r: number };
  /** The caption for the hovered hex, or for no hover (`null`): the hint line. */
  caption: (info: HoverInfo | null) => string;
  /** `data-testid` of the caption line. */
  captionTestId: string;
  /** The account the map is drawn for (its realm gets the gold border); the docs default when omitted. */
  playerId?: string;
}>();

const hovered = ref<HoverInfo | null>(null);
const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

const { zoomIn, zoomOut, wheelHint } = useDocsMapRenderer(canvas, container, {
  worldModel: props.world,
  previewCenter: props.previewCenter,
  ...(props.playerId ? { playerId: props.playerId } : {}),
  onHoverChange: (info: HoverInfo | null) => {
    hovered.value = info;
  },
});

const captionText = computed(() => props.caption(hovered.value));
</script>

<template>
  <div class="docs-hover-map">
    <div ref="container" class="map-host">
      <canvas ref="canvas" class="docs-map-canvas" />
      <DocsMapControls :zoom-in="zoomIn" :zoom-out="zoomOut" :wheel-hint="wheelHint" />
    </div>
    <p class="caption" :data-testid="captionTestId">{{ captionText }}</p>
  </div>
</template>

<style scoped>
.docs-hover-map {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.map-host {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 10px;
  background: radial-gradient(ellipse at 50% 40%, #1a2a33 0%, #0b1116 75%);
  border: 1px solid var(--panel-border);
}
.caption {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  min-height: 1.4em;
}
</style>
