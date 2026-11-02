<script setup lang="ts">
// The Land movement docs page's example map: a small hand-placed island with a dummy army's route over it, drawn by the game's own
// HexMapRenderer through a StaticWorldModel (like BogIsland.vue and WallExample.vue). The route is the one the real pathfinder finds
// (lib/docs/landMovementExample.ts) and is drawn by the renderer's army overlay, the same line and flag a marching army gets on the
// map. Hovering a hex names it. Below the map every step of the route is listed with the time a Spearman needs for it.
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useHexMapRenderer } from '../../composables/useHexMapRenderer';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';
import { coordKey } from '../../lib/hex/coords';
import {
  LAND_EXAMPLE_RIVERS,
  LAND_EXAMPLE_START,
  buildLandExampleTiles,
  landExampleContext,
  landExampleKindOf,
  landExampleRoute,
  type LandExampleKind,
} from '../../lib/docs/landMovementExample';
import { formatMinutes, minutesPerHex } from '../../lib/docs/landMovementDocs';
import { terrainName, unitName } from '../../i18n/catalogueNames';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';

const { t, locale } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const units = useUnitCatalogueStore();

const tiles = buildLandExampleTiles();
const world = new StaticWorldModel(tiles);
world.setRivers(LAND_EXAMPLE_RIVERS);
const ctx = landExampleContext(tiles);
const route = landExampleRoute();

const TERRAINS = new Set(['grass', 'forest', 'bog', 'mountain', 'sand']);
function kindName(kind: LandExampleKind): string {
  return TERRAINS.has(kind) ? terrainName(kind) : t(`docs.landMovement.example.names.${kind}`);
}

const hovered = ref<HoverInfo | null>(null);
const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

const { renderer } = useHexMapRenderer(canvas, container, {
  mode: 'settlement',
  worldModel: world,
  playerId: 'docs',
  previewCenter: { q: 2, r: 0 },
  lockCamera: true,
  // Inline in a scrolling article: a wheel/touch gesture over the map scrolls the page (see WastedIsland.vue).
  allowPageScroll: true,
  hideSettlementBadge: true,
  onHoverChange: (info: HoverInfo | null) => {
    hovered.value = info;
  },
});

// The army's flag at its settlement and the route it takes, as the renderer draws a selected army's route.
watch(
  renderer,
  (r) =>
    r?.setArmyOverlay({
      armies: [{ id: 'docs', position: LAND_EXAMPLE_START, selected: true, returning: false, isFleet: false }],
      route: route.path,
      draftWaypoints: [],
    }),
  { immediate: true },
);

const hoverText = computed(() => {
  const info = hovered.value;
  if (!info) return t('docs.landMovement.example.hoverHint');
  const { q, r } = info.coord;
  const tile = world.getTile(q, r);
  const river = world.getRiverTile(q, r);
  return kindName(landExampleKindOf(tile, river, ctx.isWideRiver(info.coord)));
});

const speed = computed(() => units.byType.spearman?.speed ?? 0);
const lang = computed(() => String(locale.value));
const steps = computed(() =>
  route.steps.map((s) => ({
    key: coordKey(s.coord),
    name: kindName(s.kind),
    time: speed.value ? formatMinutes(minutesPerHex(s.cost, speed.value), lang.value) : '',
  })),
);
const total = computed(() => (speed.value ? formatMinutes(minutesPerHex(route.total, speed.value), lang.value) : ''));
</script>

<template>
  <div class="land-example" data-testid="land-example">
    <div ref="container" class="map-host" role="img" :aria-label="$t('docs.landMovement.example.alt')">
      <canvas ref="canvas" />
    </div>
    <p class="caption" data-testid="land-example-caption">{{ hoverText }}</p>
    <ol class="steps" data-testid="land-example-steps">
      <li v-for="(s, i) in steps" :key="s.key" :data-step="i + 1">
        <span class="step-name">{{ s.name }}</span>
        <span v-if="s.time" class="step-time">{{ s.time }}</span>
      </li>
    </ol>
    <p v-if="total" class="total" data-testid="land-example-total">
      {{ $t('docs.landMovement.example.total', { unit: unitName('spearman'), time: total }) }}
    </p>
  </div>
</template>

<style scoped>
.land-example {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.map-host {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
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
.steps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}
.steps li {
  display: flex;
  gap: 6px;
  align-items: baseline;
  padding: 4px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  font-size: 13px;
  counter-increment: step;
}
.steps li::before {
  content: counter(step);
  color: var(--gold);
  font-variant-numeric: tabular-nums;
}
.step-time {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.total {
  margin: 0;
  line-height: 1.6;
  color: var(--muted);
}
</style>
