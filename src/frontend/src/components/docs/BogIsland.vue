<script setup lang="ts">
// The Bog Lands docs page's example map: a real island the bog generator made (see bogIsland.ts), drawn with the
// game's own HexMapRenderer through a StaticWorldModel, so its moss, creeks, lake shores and mouth are exactly
// what a world shows. Hovering a hex names it.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useHexMapRenderer } from '../../composables/useHexMapRenderer';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';
import { BOG_ISLAND_RIVERS, bogIslandTileNameKey, buildBogIslandTiles } from '../../lib/docs/bogIsland';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const world = new StaticWorldModel(buildBogIslandTiles());
world.setRivers(BOG_ISLAND_RIVERS);

const hovered = ref<HoverInfo | null>(null);
const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

useHexMapRenderer(canvas, container, {
  mode: 'settlement',
  worldModel: world,
  playerId: 'docs',
  previewCenter: { q: 0, r: 0 },
  lockCamera: true,
  // Inline in a scrolling article: a wheel/touch gesture over the map scrolls the page (see WastedIsland.vue).
  allowPageScroll: true,
  hideSettlementBadge: true,
  onHoverChange: (info: HoverInfo | null) => {
    hovered.value = info;
  },
});

const captionText = computed(() => {
  const info = hovered.value;
  if (!info) return t('docs.bogLands.example.hoverHint');
  const { q, r } = info.coord;
  const key = bogIslandTileNameKey(world.getTile(q, r), world.getRiverTile(q, r));
  return key ? t(key) : t('docs.bogLands.example.hoverHint');
});
</script>

<template>
  <div class="bog-island">
    <div ref="container" class="map-host">
      <canvas ref="canvas" />
    </div>
    <p class="caption" data-testid="bog-island-caption">{{ captionText }}</p>
  </div>
</template>

<style scoped>
.bog-island {
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
.map-host canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: pan-y;
  cursor: default;
}
.caption {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  min-height: 1.4em;
}
</style>
