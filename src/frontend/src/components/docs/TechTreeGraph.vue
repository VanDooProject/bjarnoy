<script setup lang="ts">
// The tech tree as a dependency graph: one card per building, links drawn
// between what needs what, and a hover that traces a chain in both
// directions — prerequisites full strength, what it leads to half-lit, the
// rest dimmed out of the way.
//
// All of the geometry and traversal lives in lib/techtree (and is tested
// there); this file is the rendering and the hover state.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AtlasSprite from '../AtlasSprite.vue';
import type { AtlasFrameRect } from '../../lib/map/atlas';
import type { BuildingDefinitionResponse } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';
import {
  GRAPH_CATEGORY_COLOR,
  GRAPH_LEGEND,
  art,
  type GraphCategory,
} from '../../lib/techtree/buildingPresentation';
import { buildGraph, hoverSets } from '../../lib/techtree/graph';
import {
  BYPASS_Y,
  CARD_H,
  CARD_W,
  COLUMNS,
  COLUMN_TITLES,
  GRID_W,
  GUTTER,
  TECH_TREE_LAYOUT,
} from '../../lib/techtree/layout';
import { buildTechTreeNodes, prerequisitesOf } from '../../lib/techtree/nodes';
import { pathD, routeEdges } from '../../lib/techtree/routing';

const props = defineProps<{ byType: Record<string, BuildingDefinitionResponse[] | undefined> }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const hovered = ref<string | null>(null);
const hoveredCategory = ref<GraphCategory | null>(null);

const nodes = computed(() => buildTechTreeNodes(props.byType));
const graph = computed(() =>
  buildGraph(
    nodes.value.map((n) => n.type),
    (type) => prerequisitesOf(props.byType, type),
  ),
);
// Only the buildings actually drawn, so a link never runs to a missing card.
const layout = computed(() =>
  Object.fromEntries(
    nodes.value.map((node) => [node.type, TECH_TREE_LAYOUT[node.type]!] as const),
  ),
);
// Independent of hover — the picture is routed once and only re-coloured.
const segments = computed(() => routeEdges(layout.value, graph.value));

const sets = computed(() => hoverSets(graph.value, hovered.value));

const categoryMembers = computed(() =>
  hoveredCategory.value
    ? new Set(nodes.value.filter((n) => n.category === hoveredCategory.value).map((n) => n.type))
    : null,
);

const focused = computed(() => hovered.value !== null || hoveredCategory.value !== null);

/** full = a prerequisite of what's hovered (or hovered itself); soft = downstream of it. */
function emphasis(type: string): 'full' | 'soft' | 'dim' | 'none' {
  if (!focused.value) return 'none';
  if (categoryMembers.value) return categoryMembers.value.has(type) ? 'full' : 'dim';
  if (sets.value.up.has(type)) return 'full';
  if (sets.value.down.has(type)) return 'soft';
  return 'dim';
}

function linkEmphasis(keys: readonly string[]): 'full' | 'soft' | 'dim' | 'none' {
  if (!focused.value) return 'none';
  if (categoryMembers.value) return 'dim';
  if (keys.some((k) => sets.value.upKeys.has(k))) return 'full';
  if (keys.some((k) => sets.value.downKeys.has(k))) return 'soft';
  return 'dim';
}

const paths = computed(() =>
  segments.value.map((segment, index) => ({
    key: `${index}:${segment.keys.join(',')}`,
    d: pathD(segment.points),
    emphasis: linkEmphasis(segment.keys),
  })),
);

const cards = computed(() =>
  nodes.value.map((node) => {
    const ref = art(node.type);
    return {
      ...node,
      emphasis: emphasis(node.type),
      current: hovered.value === node.type,
      accent: GRAPH_CATEGORY_COLOR[node.category],
      atlas: ref.kind === 'atlas' ? (ref.frame as AtlasFrameRect) : null,
      png: ref.kind === 'png' ? ref.url : null,
    };
  }),
);

const legend = computed(() =>
  GRAPH_LEGEND.map((entry) => ({
    ...entry,
    color: GRAPH_CATEGORY_COLOR[entry.id],
    active: hoveredCategory.value === entry.id,
  })),
);

const status = computed(() => {
  if (hoveredCategory.value) {
    const label = GRAPH_LEGEND.find((e) => e.id === hoveredCategory.value)?.label ?? '';
    return `${label} — the buildings in this family.`;
  }
  if (hovered.value) {
    const label = nodes.value.find((n) => n.type === hovered.value)?.label ?? '';
    return `${label} — gold is what it needs, dimmed gold is what it leads to.`;
  }
  return 'Hover a building to trace what it needs, or a family to pick out its buildings.';
});

function focusBuilding(type: string) {
  hovered.value = type;
  hoveredCategory.value = null;
}

function focusCategory(id: GraphCategory) {
  hoveredCategory.value = id;
  hovered.value = null;
}

function clear() {
  hovered.value = null;
  hoveredCategory.value = null;
}
</script>

<template>
  <section class="tech-graph" aria-labelledby="tech-graph-heading">
    <div class="graph-head">
      <div>
        <p id="tech-graph-heading" class="eyebrow">{{ t('docs.techTree.graphEyebrow') }}</p>
        <p class="status" aria-live="polite">{{ status }}</p>
      </div>
      <ul class="legend">
        <li v-for="entry in legend" :key="entry.id">
          <button
            type="button"
            class="legend-button"
            :class="{ active: entry.active }"
            @mouseenter="focusCategory(entry.id)"
            @focus="focusCategory(entry.id)"
            @click="entry.active ? clear() : focusCategory(entry.id)"
          >
            <span class="swatch" :style="{ background: entry.color }" />
            {{ entry.label }}
          </button>
        </li>
      </ul>
    </div>

    <!-- The grid is a fixed size, so it scrolls sideways on a narrow screen
         rather than making the whole page scroll (e2e/docs.spec.ts). -->
    <div class="graph-scroll">
      <div
        class="grid"
        :style="{ width: `${GRID_W}px`, height: `${BYPASS_Y + 8}px` }"
        @mouseleave="clear"
      >
        <div class="columns" :style="{ gridTemplateColumns: `repeat(${COLUMNS}, ${CARD_W}px)`, gap: `${GUTTER}px` }">
          <span v-for="title in COLUMN_TITLES" :key="title">{{ title }}</span>
        </div>

        <svg class="links" :viewBox="`0 0 ${GRID_W} ${BYPASS_Y + 8}`" aria-hidden="true">
          <path
            v-for="path in paths"
            :key="path.key"
            :class="['link', `link--${path.emphasis}`]"
            :d="path.d"
            fill="none"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        </svg>

        <a
          v-for="card in cards"
          :key="card.type"
          class="card"
          :class="[`card--${card.emphasis}`, { 'card--current': card.current, 'card--anchor': card.isAnchor }]"
          :href="`#${card.type}`"
          :style="{
            left: `${card.x}px`,
            top: `${card.y}px`,
            width: `${CARD_W}px`,
            height: `${CARD_H}px`,
            borderTopColor: card.accent,
          }"
          @mouseenter="focusBuilding(card.type)"
          @focus="focusBuilding(card.type)"
        >
          <span class="card-top">
            <span class="thumb" aria-hidden="true">
              <AtlasSprite v-if="card.atlas" :frame="card.atlas" />
              <img v-else-if="card.png" :src="card.png" alt="" />
            </span>
            <span class="naming">
              <span class="label">{{ card.label }}</span>
              <span v-if="card.gives" class="gives">{{ card.gives }}</span>
            </span>
          </span>
          <span class="chips">
            <span v-for="chip in card.chips" :key="chip.text" :class="['chip', `chip--${chip.kind}`]">
              {{ chip.text }}
            </span>
          </span>
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tech-graph {
  margin-top: 28px;
}
.graph-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin-bottom: 22px;
}
.eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gold);
}
.status {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--muted);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.legend-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.legend-button:hover,
.legend-button:focus-visible,
.legend-button.active {
  color: var(--gold);
}
.swatch {
  width: 9px;
  height: 9px;
  flex: none;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
.graph-scroll {
  overflow-x: auto;
  padding-top: 26px;
}
.grid {
  position: relative;
}
.columns {
  position: absolute;
  top: -26px;
  left: 0;
  display: grid;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6f8291;
}
.links {
  position: absolute;
  inset: 0;
  overflow: visible;
}
.link {
  stroke: rgba(255, 255, 255, 0.28);
  stroke-width: 1.5;
  transition: stroke 120ms ease;
}
.link--full {
  stroke: var(--gold);
  stroke-width: 2;
}
.link--soft {
  stroke: rgba(255, 197, 92, 0.45);
}
.link--dim {
  stroke: rgba(255, 255, 255, 0.07);
}
.card {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px;
  overflow: hidden;
  text-decoration: none;
  color: var(--text);
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-top: 2px solid var(--panel-border);
  transition:
    opacity 120ms ease,
    border-color 120ms ease;
}
.card--anchor {
  background: rgba(255, 197, 92, 0.14);
  border-color: var(--gold);
}
/* Three levels of emphasis: what the hovered card needs, what it leads to,
   and everything else — which dims but stays legible enough to see where a
   branch is heading. */
.card--full {
  opacity: 1;
  border-color: rgba(255, 197, 92, 0.6);
}
.card--soft {
  opacity: 0.55;
  border-color: rgba(255, 197, 92, 0.3);
}
.card--dim {
  opacity: 0.14;
}
.card--current,
.card:focus-visible {
  border-color: var(--gold);
  outline: none;
}
.card-top {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.thumb {
  flex: none;
  /* The showcase art draws a building on its terrain tile, so below about
     this size the tile is all you can make out and every card looks alike. */
  width: 38px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.naming {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.label {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.2;
}
.gives {
  margin-top: 2px;
  font-size: 9.5px;
  line-height: 1.3;
  color: var(--muted);
}
.chips {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.chip {
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  padding: 3px 5px;
  border-radius: 4px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.06);
  color: #c9d6de;
}
.chip--longhouse {
  color: var(--gold);
  background: rgba(255, 197, 92, 0.12);
  border-color: rgba(255, 197, 92, 0.4);
}
.chip--anchor {
  color: #20160a;
  background: var(--gold);
  border-color: var(--gold);
}
</style>
