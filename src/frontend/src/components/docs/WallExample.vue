<script setup lang="ts">
// The Walls docs page's example: a short wall laid out on a few hexes and drawn by the game's own HexMapRenderer through a
// StaticWorldModel, the way BogIsland.vue draws its island. Only the hexes are placed (lib/docs/palisadeDocs.ts); the renderer
// picks every wall hex's piece and rotation from its neighbours exactly as a world does, sea end included.
import { ref } from 'vue';
import { useDocsMapRenderer } from '../../composables/useDocsMapRenderer';
import DocsMapControls from './DocsMapControls.vue';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import { exampleWallHexes, exampleWallTiles } from '../../lib/docs/palisadeDocs';

const world = new StaticWorldModel(exampleWallTiles());
const pieceCount = exampleWallHexes().length;

const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

const { zoomIn, zoomOut, wheelHint } = useDocsMapRenderer(canvas, container, {
  worldModel: world,
  // The middle of the wall: the gate's far side, where the run turns towards the sea.
  previewCenter: { q: 1, r: 0 },
});
</script>

<template>
  <div class="wall-example">
    <div ref="container" class="map-host">
      <canvas ref="canvas" class="docs-map-canvas" role="img" :aria-label="$t('docs.walls.example.alt', { count: pieceCount })" />
      <DocsMapControls :zoom-in="zoomIn" :zoom-out="zoomOut" :wheel-hint="wheelHint" />
    </div>
  </div>
</template>

<style scoped>
.map-host {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 7;
  overflow: hidden;
  border-radius: 10px;
  background: radial-gradient(ellipse at 50% 40%, #1a2a33 0%, #0b1116 75%);
  border: 1px solid var(--panel-border);
}
</style>
