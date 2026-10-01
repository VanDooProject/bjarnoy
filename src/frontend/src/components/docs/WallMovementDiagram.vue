<script setup lang="ts">
// Four tiny pictures of the palisade's movement rules, a wall seen from above as a column of hexes with an
// army (the dot) walking at it from the left: a wall run up to a mountain is sealed, a land end is half open
// even with the sea beside it, a sea end seals at the coast, a gate opens for its owner. Plain SVG, no art,
// so it also reads where the atlas is not loaded.
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

type Cell = 'ground' | 'mountain' | 'water' | 'wall' | 'seaEnd' | 'gate';
interface Row {
  id: 'sealed' | 'halfOpen' | 'seaEnd' | 'gate';
  cells: Cell[];
  /** The row of the cells the army walks along, and whether it gets through. */
  walk: { row: number; through: boolean; cost?: number };
}
const ROWS: Row[] = [
  {
    id: 'sealed',
    cells: ['mountain', 'wall', 'wall', 'wall', 'mountain'],
    walk: { row: 2, through: false },
  },
  {
    id: 'halfOpen',
    cells: ['water', 'wall', 'wall', 'wall', 'mountain'],
    walk: { row: 1, through: true, cost: 3 },
  },
  {
    id: 'seaEnd',
    cells: ['water', 'seaEnd', 'wall', 'wall', 'mountain'],
    walk: { row: 2, through: false },
  },
  {
    id: 'gate',
    cells: ['mountain', 'wall', 'gate', 'wall', 'mountain'],
    walk: { row: 2, through: true },
  },
];

/** The legend under the pictures, in the order a reader meets the cells. */
const LEGEND: Cell[] = ['wall', 'gate', 'seaEnd', 'water', 'mountain', 'ground'];

/** A mountain's peak and the water's waves, drawn on top of the cell so they read without the colour. */
function peak(cx: number, cy: number): string {
  return `M${cx - 6} ${cy + 4} L${cx - 1} ${cy - 5} L${cx + 2} ${cy} L${cx + 4} ${cy - 2} L${cx + 7} ${cy + 4}`;
}
function waves(cx: number, cy: number): string {
  return [-3, 3].map((dy) => `M${cx - 7} ${cy + dy} q2.5 -3 5 0 t5 0 t5 0`).join(' ');
}
function marks(cell: Cell, cx: number, cy: number): { d: string; cls: string } | null {
  if (cell === 'mountain') return { d: peak(cx, cy), cls: 'peak' };
  if (cell === 'water') return { d: waves(cx, cy), cls: 'waves' };
  if (cell === 'seaEnd') return { d: `M${cx} ${cy - R + 2} L${cx} ${cy + 2}`, cls: 'stub' };
  return null;
}
</script>

<template>
  <div class="movement-diagram" data-testid="wall-movement-diagram">
    <figure v-for="row in ROWS" :key="row.id" class="case" :data-case="row.id">
      <svg viewBox="0 0 140 112" role="img" :aria-label="$t(`docs.walls.movement.diagram.${row.id}`)">
        <template v-for="(cell, i) in row.cells" :key="i">
          <polygon :points="hex(X, CENTRES[i]!)" :class="['cell', cell]" />
          <path
            v-if="marks(cell, X, CENTRES[i]!)"
            :d="marks(cell, X, CENTRES[i]!)!.d"
            :class="marks(cell, X, CENTRES[i]!)!.cls"
          />
        </template>
        <circle class="army" cx="14" :cy="CENTRES[row.walk.row]" r="5" />
        <template v-if="row.walk.through">
          <line class="path ok" x1="22" :y1="CENTRES[row.walk.row]" x2="132" :y2="CENTRES[row.walk.row]" />
          <polygon
            class="head ok"
            :points="`132,${CENTRES[row.walk.row]! - 5} 138,${CENTRES[row.walk.row]} 132,${CENTRES[row.walk.row]! + 5}`"
          />
          <text v-if="row.walk.cost" class="cost" x="108" :y="CENTRES[row.walk.row]! - 6">
            {{ row.walk.cost }}
          </text>
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
    <ul class="legend" data-testid="wall-movement-legend">
      <li v-for="cell in LEGEND" :key="cell">
        <svg viewBox="0 0 28 28" aria-hidden="true">
          <polygon :points="hex(14, 14)" :class="['cell', cell]" />
          <path v-if="marks(cell, 14, 14)" :d="marks(cell, 14, 14)!.d" :class="marks(cell, 14, 14)!.cls" />
        </svg>
        {{ $t(`docs.walls.movement.diagram.legend.${cell}`) }}
      </li>
    </ul>
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
.cell.water {
  fill: #2f6f9e;
}
/* The sea end: a wall hex standing in the water, so wall-coloured with a water rim. */
.cell.seaEnd {
  fill: #8a5a2b;
  stroke: #4fa3d9;
  stroke-width: 2.5;
}
.peak,
.waves,
.stub {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.peak {
  stroke: #e6e6ea;
  stroke-width: 1.5;
}
.waves {
  stroke: #a9d6f5;
  stroke-width: 1.3;
}
.stub {
  stroke: #4fa3d9;
  stroke-width: 2;
}
.legend {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  color: var(--muted);
}
.legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend svg {
  width: 22px;
  height: 22px;
  margin: 0;
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
