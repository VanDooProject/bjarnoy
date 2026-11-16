<script setup lang="ts">
// The Bog Lands docs page's example map: a real island the bog generator made (see bogIsland.ts), drawn with the
// game's own HexMapRenderer through a StaticWorldModel, so its moss, creeks, lake shores and mouth are exactly
// what a world shows. Hovering a hex names it (DocsHoverMap.vue).
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import DocsHoverMap from './DocsHoverMap.vue';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';
import { BOG_ISLAND_RIVERS, bogIslandTileNameKey, buildBogIslandTiles } from '../../lib/docs/bogIsland';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const world = new StaticWorldModel(buildBogIslandTiles());
world.setRivers(BOG_ISLAND_RIVERS);

function caption(info: HoverInfo | null): string {
  if (!info) return t('docs.bogLands.example.hoverHint');
  const { q, r } = info.coord;
  const key = bogIslandTileNameKey(world.getTile(q, r), world.getRiverTile(q, r));
  return key ? t(key) : t('docs.bogLands.example.hoverHint');
}
</script>

<template>
  <DocsHoverMap class="bog-island" :world="world" :preview-center="{ q: 0, r: 0 }" :caption="caption" caption-test-id="bog-island-caption" />
</template>
