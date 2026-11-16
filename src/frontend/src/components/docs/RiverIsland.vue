<script setup lang="ts">
// The Rivers docs page's example map: a real island the game generated (see riverIsland.ts), with its rivers, camps and giants and a
// small settlement of the viewer beside the river, drawn with the game's own HexMapRenderer through a StaticWorldModel. Hovering a hex
// names it (DocsHoverMap.vue).
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import DocsHoverMap from './DocsHoverMap.vue';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';
import { RIVER_ISLAND_CENTRE, RIVER_ISLAND_PLAYER, riverIslandTileName, riverIslandWorld } from '../../lib/docs/riverIsland';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const world = riverIslandWorld();

function caption(info: HoverInfo | null): string {
  if (!info) return t('docs.rivers.example.hoverHint');
  const { q, r } = info.coord;
  const name = riverIslandTileName(world.getTile(q, r), world.getRiverTile(q, r));
  if (!name) return t('docs.rivers.example.hoverHint');
  return 'key' in name ? t(name.key) : name.text;
}
</script>

<template>
  <DocsHoverMap
    class="river-island"
    :world="world"
    :preview-center="RIVER_ISLAND_CENTRE"
    :player-id="RIVER_ISLAND_PLAYER"
    :caption="caption"
    caption-test-id="river-island-caption"
  />
</template>
