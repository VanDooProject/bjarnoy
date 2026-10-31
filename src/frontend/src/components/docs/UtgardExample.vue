<script setup lang="ts">
// The Wasted Lands docs page's Utgard example: a small hand-placed wasted island (lib/docs/utgardExample.ts) with Utgard in the middle,
// a ring of Utgard wall round it with a gate, and Jötun watchtowers outside, drawn by the game's own HexMapRenderer through a
// StaticWorldModel like WallExample.vue. The renderer picks every wall hex's piece and rotation from its neighbours. Hovering a hex
// names it.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useHexMapRenderer } from '../../composables/useHexMapRenderer';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';
import { UTGARD_CENTRE, buildUtgardExampleTiles, utgardExampleKindOf } from '../../lib/docs/utgardExample';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const world = new StaticWorldModel(buildUtgardExampleTiles());

const NAME_KEY = {
  utgard: 'docs.wastedLands.island.giantWasted',
  wall: 'docs.wastedLands.defences.walls.heading',
  gate: 'docs.wastedLands.defences.pieces.gate',
  tower: 'docs.wastedLands.defences.watchtower.heading',
  wasteland: 'docs.wastedLands.tiles.grass.wasted',
  coast: 'docs.tiles.entries.coastalWater.title',
} as const;

const hovered = ref<HoverInfo | null>(null);
const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

useHexMapRenderer(canvas, container, {
  mode: 'settlement',
  worldModel: world,
  playerId: 'docs',
  previewCenter: UTGARD_CENTRE,
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
  if (!info) return t('docs.wastedLands.defences.example.hoverHint');
  return t(NAME_KEY[utgardExampleKindOf(world.getTile(info.coord.q, info.coord.r))]);
});
</script>

<template>
  <div class="utgard-example" data-testid="utgard-example">
    <div ref="container" class="map-host" role="img" :aria-label="$t('docs.wastedLands.defences.example.alt')">
      <canvas ref="canvas" />
    </div>
    <p class="caption" data-testid="utgard-example-caption">{{ captionText }}</p>
    <p class="note">{{ $t('docs.wastedLands.defences.example.caption') }}</p>
  </div>
</template>

<style scoped>
.utgard-example {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 16px 0;
}
.map-host {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 11;
  overflow: hidden;
  border-radius: 10px;
  background: radial-gradient(ellipse at 50% 40%, #2a1d1a 0%, #0b0a0c 75%);
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
.note {
  margin: 0;
  line-height: 1.6;
  color: var(--muted);
}
</style>
