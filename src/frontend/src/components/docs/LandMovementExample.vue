<script setup lang="ts">
// The Land movement docs page's example map: a small hand-placed island with a dummy army's route over it, drawn by the game's own
// HexMapRenderer through a StaticWorldModel (like BogIsland.vue and WallExample.vue), with the realm claimed by the model itself. The route is the one the real pathfinder finds
// (lib/docs/landMovementExample.ts) and is drawn by the renderer's army overlay, the same line and flag a marching army gets on the
// map. Hovering a hex names it. Below the map every step of the route is listed in a table with the time a Spearman needs for it;
// hovering a row (or tapping it) highlights its hex on the map, and hovering a hex on the map marks its row.
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useDocsMapRenderer } from '../../composables/useDocsMapRenderer';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';
import { coordKey } from '../../lib/hex/coords';
import type { AxialCoord } from '../../lib/hex/coords';
import {
  LAND_EXAMPLE_PLAYER,
  LAND_EXAMPLE_START,
  buildLandExampleTiles,
  landExampleContext,
  landExampleKindOf,
  landExampleRoute,
  landExampleWorld,
  type LandExampleKind,
} from '../../lib/docs/landMovementExample';
import { formatMinutes, minutesPerHex } from '../../lib/docs/landMovementDocs';
import { buildingName, terrainName, unitName } from '../../i18n/catalogueNames';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';

const { t, locale } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const units = useUnitCatalogueStore();

const world = landExampleWorld();
const tiles = buildLandExampleTiles(world);
const ctx = landExampleContext(tiles);
const route = landExampleRoute(tiles);

const TERRAINS = new Set(['grass', 'forest', 'bog', 'mountain', 'sand']);
function kindName(kind: LandExampleKind): string {
  if (kind === 'tower') return buildingName('tower');
  return TERRAINS.has(kind) ? terrainName(kind) : t(`docs.landMovement.example.names.${kind}`);
}

const hovered = ref<HoverInfo | null>(null);
const container = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);

const { renderer } = useDocsMapRenderer(canvas, container, {
  worldModel: world,
  playerId: LAND_EXAMPLE_PLAYER,
  previewCenter: { q: 2, r: 0 },
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

// Two sources mark a hex: the map's pointer (hoveredKey) and the table (selectedKey, from a row's hover or tap). The table wins.
// pinnedKey is the row a tap fixed, so the mouseleave a touch device emulates does not undo it.
const selectedKey = ref<string | null>(null);
const pinnedKey = ref<string | null>(null);
const hoveredKey = computed(() => (hovered.value ? coordKey(hovered.value.coord) : null));
const activeKey = computed(() => selectedKey.value ?? hoveredKey.value);

function nameAt(coord: AxialCoord): string {
  const { q, r } = coord;
  const tile = world.getTile(q, r);
  const river = world.getRiverTile(q, r);
  return kindName(landExampleKindOf(tile, river, ctx.isWideRiver(coord)));
}

const hoverText = computed(() => {
  const info = hovered.value;
  if (info) return nameAt(info.coord);
  const step = route.steps.find((s) => coordKey(s.coord) === selectedKey.value);
  return step ? nameAt(step.coord) : t('docs.landMovement.example.hoverHint');
});

function selectRow(coord: AxialCoord): void {
  selectedKey.value = coordKey(coord);
  renderer.value?.setHighlight(coord);
}
/** The pointer left the table: back to the tapped row if there is one, else no row. */
function clearRow(): void {
  const pinned = route.steps.find((s) => coordKey(s.coord) === pinnedKey.value);
  selectedKey.value = pinned ? pinnedKey.value : null;
  renderer.value?.setHighlight(pinned?.coord);
}
function tapRow(coord: AxialCoord): void {
  const key = coordKey(coord);
  if (pinnedKey.value === key) {
    pinnedKey.value = null;
    clearRow();
    return;
  }
  pinnedKey.value = key;
  selectRow(coord);
}

const speed = computed(() => units.byType.spearman?.speed ?? 0);
const lang = computed(() => String(locale.value));
const steps = computed(() =>
  route.steps.map((s) => ({
    key: coordKey(s.coord),
    coord: s.coord,
    name: kindName(s.kind),
    time: speed.value ? formatMinutes(minutesPerHex(s.cost, speed.value), lang.value) : '',
  })),
);
const total = computed(() => (speed.value ? formatMinutes(minutesPerHex(route.total, speed.value), lang.value) : ''));
</script>

<template>
  <div class="land-example" data-testid="land-example">
    <div ref="container" class="map-host" role="img" :aria-label="$t('docs.landMovement.example.alt')">
      <canvas ref="canvas" class="docs-map-canvas" />
    </div>
    <p class="caption" data-testid="land-example-caption">{{ hoverText }}</p>
    <div class="table-scroll">
      <table class="steps" data-testid="land-example-steps">
        <thead>
          <tr>
            <th class="num">{{ $t('docs.landMovement.example.columns.step') }}</th>
            <th>{{ $t('docs.landMovement.example.columns.hex') }}</th>
            <th class="value">{{ $t('docs.landMovement.example.columns.time') }}</th>
          </tr>
        </thead>
        <tbody @mouseleave="clearRow">
          <tr
            v-for="(s, i) in steps"
            :key="s.key"
            :data-step="i + 1"
            :class="{ active: s.key === activeKey }"
            @mouseenter="selectRow(s.coord)"
            @click="tapRow(s.coord)"
          >
            <td class="num">{{ i + 1 }}</td>
            <td class="name">{{ s.name }}</td>
            <td class="value">{{ s.time }}</td>
          </tr>
        </tbody>
        <tfoot v-if="total">
          <tr data-testid="land-example-total">
            <td colspan="3">
              {{ $t('docs.landMovement.example.total', { unit: unitName('spearman'), time: total }) }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
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
.caption {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  min-height: 1.4em;
}
.table-scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
th,
td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--panel-border);
  text-align: left;
  vertical-align: top;
}
thead th {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  white-space: nowrap;
}
.num {
  width: 1%;
  color: var(--gold);
  font-variant-numeric: tabular-nums;
}
.name {
  font-weight: 600;
}
.value {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
tbody tr.active {
  background: color-mix(in srgb, var(--gold) 18%, transparent);
}
tfoot td {
  color: var(--muted);
  line-height: 1.6;
}
</style>
