<script setup lang="ts">
// The training page's unit dependency graph: one lane per training building, every unit at the building level that opens it,
// arrows from a prerequisite unit to the unit that needs it. Built from the unit catalogue (see lib/docs/unitGraph.ts for the
// layout). Building names link like everywhere in the docs. On phones the graph is too wide, so a list per building,
// ordered by level, takes its place.
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { unitName } from '../../i18n/catalogueNames';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { useBuildingCatalogueStore } from '../../stores/buildingCatalogue';
import BuildingLink from './BuildingLink.vue';
import {
  GRAPH_COL,
  GRAPH_X0,
  GRAPH_MAX_LEVEL,
  GRAPH_NODE_H,
  GRAPH_NODE_W,
  edgePath,
  layoutUnitGraph,
  unitsByLevel,
} from '../../lib/docs/unitGraph';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const units = useUnitCatalogueStore();
const buildings = useBuildingCatalogueStore();
const markerId = `arrow-${useId()}`;

const layout = computed(() =>
  layoutUnitGraph(units.definitions, (building) => buildings.byType[building]?.[0]?.requiredLonghouseLevel ?? null),
);
const nodeByType = computed(() => Object.fromEntries(layout.value.nodes.map((n) => [n.type, n])));
const levels = Array.from({ length: GRAPH_MAX_LEVEL }, (_, i) => i + 1);
// The lane labels sit in a column left of the svg, so the svg itself starts at the first level column.
const LABEL_W = 156;

const lists = computed(() =>
  layout.value.lanes.map((lane) => ({
    lane,
    levels: unitsByLevel(units.definitions, lane.building),
  })),
);
</script>

<template>
  <div class="unit-graph" data-testid="unit-graph">
    <div class="graph-scroll">
      <div class="graph" :style="{ paddingLeft: `${LABEL_W}px`, height: `${layout.height}px` }">
        <div
          v-for="lane in layout.lanes"
          :key="lane.building"
          class="lane-label"
          :data-building="lane.building"
          :style="{ top: `${lane.top}px`, height: `${lane.height}px`, width: `${LABEL_W}px` }"
        >
          <BuildingLink :type="lane.building" always class="lane-name" />
          <span v-if="lane.unlockLonghouse" class="lane-sub">
            {{ t('docs.training.graph.opensAt', { level: lane.unlockLonghouse }) }}
          </span>
        </div>
        <svg
          :viewBox="`0 0 ${layout.width} ${layout.height}`"
          :width="layout.width"
          :height="layout.height"
          role="img"
          :aria-label="t('docs.training.graph.label')"
        >
          <defs>
            <marker :id="markerId" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 8 4 0 8z" class="arrow-head" />
            </marker>
          </defs>
          <g class="scale">
            <template v-for="level in levels" :key="level">
              <text :x="GRAPH_X0 + GRAPH_COL * (level - 0.5)" y="18" text-anchor="middle" class="level-no">{{ level }}</text>
              <line
                :x1="GRAPH_X0 + GRAPH_COL * (level - 0.5)"
                y1="24"
                :x2="GRAPH_X0 + GRAPH_COL * (level - 0.5)"
                :y2="layout.height - 4"
                :class="['level-line', { strong: level % 5 === 0 }]"
              />
            </template>
          </g>
          <line
            v-for="lane in layout.lanes.slice(1)"
            :key="`sep-${lane.building}`"
            x1="0"
            :y1="lane.top"
            :x2="layout.width"
            :y2="lane.top"
            class="lane-line"
          />
          <path
            v-for="edge in layout.edges"
            :key="`${edge.from}-${edge.to}`"
            :d="edgePath(nodeByType[edge.from]!, nodeByType[edge.to]!, edge.cross)"
            :class="['edge', { cross: edge.cross }]"
            :marker-end="`url(#${markerId})`"
            :data-edge="`${edge.from}>${edge.to}`"
          />
          <g v-for="node in layout.nodes" :key="node.type" class="node" :data-unit="node.type">
            <rect
              :x="node.x - GRAPH_NODE_W / 2"
              :y="node.y - GRAPH_NODE_H / 2"
              :width="GRAPH_NODE_W"
              :height="GRAPH_NODE_H"
              rx="5"
            />
            <text :x="node.x" :y="node.y + 4" text-anchor="middle">{{ unitName(node.type) }}</text>
            <text v-if="node.longhouseBadge" :x="node.x + GRAPH_NODE_W / 2 + 4" :y="node.y + 4" class="badge">
              {{ t('docs.training.graph.longhouseShort', { level: node.longhouseBadge }) }}
            </text>
          </g>
        </svg>
      </div>
    </div>
    <p class="axis-note">{{ t('docs.training.graph.axis') }}</p>

    <div class="phone-list" data-testid="unit-list">
      <section v-for="entry in lists" :key="entry.lane.building" class="phone-building" :data-building="entry.lane.building">
        <h3><BuildingLink :type="entry.lane.building" always /></h3>
        <p v-if="entry.lane.unlockLonghouse" class="lane-sub">
          {{ t('docs.training.graph.opensAt', { level: entry.lane.unlockLonghouse }) }}
        </p>
        <ol>
          <li v-for="row in entry.levels" :key="row.level">
            <span class="lvl">{{ t('docs.training.graph.level', { level: row.level }) }}</span>
            <ul>
              <li v-for="u in row.units" :key="u.type">
                {{ unitName(u.type) }}
                <span v-if="u.requiredUnitType" class="req">
                  · {{ t('docs.training.graph.needsUnit', { unit: unitName(u.requiredUnitType) }) }}
                </span>
                <span v-if="nodeByType[u.type]?.longhouseBadge" class="req">
                  · {{ t('docs.training.graph.longhouse', { level: nodeByType[u.type]!.longhouseBadge }) }}
                </span>
              </li>
            </ul>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>

<style scoped>
.graph-scroll {
  overflow-x: auto;
  margin: 0 -4px;
  padding: 0 4px;
}
.graph {
  position: relative;
  box-sizing: content-box;
  width: max-content;
}
.lane-label {
  position: absolute;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding-top: 8px;
  box-sizing: border-box;
}
.lane-name {
  font-weight: 600;
}
.lane-sub {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
svg {
  display: block;
}
.level-no {
  fill: var(--muted);
  font-size: 11px;
}
.level-line {
  stroke: rgba(255, 255, 255, 0.04);
}
.level-line.strong {
  stroke: rgba(255, 255, 255, 0.1);
}
.lane-line {
  stroke: rgba(255, 255, 255, 0.08);
}
.edge {
  fill: none;
  stroke: rgba(255, 197, 92, 0.6);
  stroke-width: 1.5;
}
.edge.cross {
  stroke: rgba(255, 197, 92, 0.45);
  stroke-dasharray: 5 4;
}
.arrow-head {
  fill: var(--gold);
}
.node rect {
  fill: rgba(19, 34, 44, 0.9);
  stroke: rgba(255, 255, 255, 0.25);
}
.node text {
  fill: var(--text);
  font-size: 11.5px;
}
.node .badge {
  fill: var(--gold);
  font-size: 10.5px;
}
.axis-note {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.phone-list {
  display: none;
}
.phone-building h3 {
  margin: 16px 0 2px;
  font-size: 16px;
}
.phone-building ol {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.phone-building ol > li {
  display: flex;
  gap: 12px;
  padding: 4px 0;
  border-top: 1px solid var(--panel-border);
}
.lvl {
  flex: none;
  width: 64px;
  color: var(--gold);
  font-variant-numeric: tabular-nums;
}
.phone-building ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.req {
  color: var(--muted);
  font-size: 13px;
}
@media (max-width: 760px) {
  .graph-scroll,
  .axis-note {
    display: none;
  }
  .phone-list {
    display: block;
  }
}
</style>
