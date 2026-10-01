<script setup lang="ts">
// Three tiny pictures of the palisade's movement rules, a wall seen from above as a column of hexes with an
// army (the dot) walking at it from the left: a wall run up to a mountain is sealed, a land end is half open,
// a gate opens for its owner. Plain SVG, no art, so it also reads where the atlas is not loaded.
const R = 12;
const STEP = 21;
const CENTRES = [14, 14 + STEP, 14 + 2 * STEP, 14 + 3 * STEP, 14 + 4 * STEP];
const X = 78;

function hex(cx: number, cy: number): string {
  const pts = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)}`;
  });
  return pts.join(' ');
}

type Cell = 'ground' | 'mountain' | 'wall' | 'gate';
interface Row {
  id: 'sealed' | 'halfOpen' | 'gate';
  cells: Cell[];
  /** The row of the cells the army walks along, and whether it gets through. */
  walk: { row: number; through: boolean; cost?: number };
}
const ROWS: Row[] = [
  { id: 'sealed', cells: ['mountain', 'wall', 'wall', 'wall', 'mountain'], walk: { row: 2, through: false } },
  { id: 'halfOpen', cells: ['ground', 'wall', 'wall', 'wall', 'mountain'], walk: { row: 1, through: true, cost: 3 } },
  { id: 'gate', cells: ['mountain', 'wall', 'gate', 'wall', 'mountain'], walk: { row: 2, through: true } },
];
</script>

<template>
  <div class="movement-diagram" data-testid="wall-movement-diagram">
    <figure v-for="row in ROWS" :key="row.id" class="case" :data-case="row.id">
      <svg viewBox="0 0 140 112" role="img" :aria-label="$t(`docs.walls.movement.diagram.${row.id}`)">
        <polygon v-for="(cell, i) in row.cells" :key="i" :points="hex(X, CENTRES[i]!)" :class="['cell', cell]" />
        <circle class="army" cx="14" :cy="CENTRES[row.walk.row]" r="5" />
        <template v-if="row.walk.through">
          <line class="path ok" x1="22" :y1="CENTRES[row.walk.row]" x2="132" :y2="CENTRES[row.walk.row]" />
          <polygon
            class="head ok"
            :points="`132,${CENTRES[row.walk.row]! - 5} 138,${CENTRES[row.walk.row]} 132,${CENTRES[row.walk.row]! + 5}`"
          />
          <text v-if="row.walk.cost" class="cost" x="108" :y="CENTRES[row.walk.row]! - 6">{{ row.walk.cost }}</text>
        </template>
        <template v-else>
          <line class="path no" x1="22" :y1="CENTRES[row.walk.row]" x2="54" :y2="CENTRES[row.walk.row]" />
          <path
            class="cross"
            :d="`M54 ${CENTRES[row.walk.row]! - 6} l12 12 M66 ${CENTRES[row.walk.row]! - 6} l-12 12`"
          />
        </template>
      </svg>
      <figcaption>
        <strong>{{ $t(`docs.walls.movement.diagram.${row.id}Title`) }}</strong>
        <span>{{ $t(`docs.walls.movement.diagram.${row.id}`) }}</span>
      </figcaption>
    </figure>
  </div>
</template>

<style scoped>
.movement-diagram {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin: 16px 0 0;
}
.case {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel, #1c1710);
}
svg {
  display: block;
  width: 100%;
  max-width: 220px;
  height: auto;
  margin: 0 auto;
}
.cell {
  stroke: rgba(0, 0, 0, 0.35);
  stroke-width: 1;
}
.cell.ground {
  fill: #3d5a2e;
}
.cell.mountain {
  fill: #6b6b72;
}
.cell.wall {
  fill: #8a5a2b;
}
.cell.gate {
  fill: var(--gold);
}
.army {
  fill: #7fb2e5;
  stroke: #0b1116;
  stroke-width: 1;
}
.path {
  stroke-width: 3;
  stroke-linecap: round;
}
.path.ok {
  stroke: #6dbb6a;
}
.path.no {
  stroke: #d97b6c;
}
.head.ok {
  fill: #6dbb6a;
}
.cross {
  stroke: #d97b6c;
  stroke-width: 3;
  stroke-linecap: round;
  fill: none;
}
.cost {
  fill: var(--text);
  font-size: 11px;
  font-weight: 700;
}
figcaption {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}
figcaption strong {
  color: var(--text);
}
</style>
