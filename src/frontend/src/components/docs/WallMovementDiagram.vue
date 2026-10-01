<script setup lang="ts">
// Six tiny pictures of the palisade's movement rules: the ground as hexes, the wall as a brown line drawn along the
// middle of its hexes (a gate is a gap in the line between two posts), and an army (the blue dot) walking at it from
// the left. The arrow is green where the army gets through (a number is its cost) and red with a cross where it is
// stopped. Plain SVG, no art, so it also reads where the atlas is not loaded.
const R = 12;
const STEP = 21;
const CENTRES = [14, 14 + STEP, 14 + 2 * STEP, 14 + 3 * STEP, 14 + 4 * STEP];
const X = 78;
/** Half the width of a gate's gap: the posts stand this far either side of the gate hex's centre. */
const GATE_HALF = 6;

function hex(cx: number, cy: number): string {
  const pts = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)}`;
  });
  return pts.join(' ');
}

type Ground = 'grass' | 'sand' | 'mountain' | 'water' | 'river' | 'stream';
interface Row {
  id: 'sealed' | 'riverEnd' | 'halfOpen' | 'stream' | 'seaEnd' | 'gate';
  cells: Ground[];
  /** The rows the wall's line runs between (inclusive); a sea end's last row is the water hex it stands in. */
  wall: { from: number; to: number; gate?: number };
  /** The row of the cells the army walks along, and whether it gets through. */
  walk: { row: number; through: boolean; cost?: number };
}
const ROWS: Row[] = [
  {
    id: 'sealed',
    cells: ['mountain', 'grass', 'sand', 'grass', 'mountain'],
    wall: { from: 1, to: 3 },
    walk: { row: 2, through: false },
  },
  {
    id: 'riverEnd',
    cells: ['river', 'grass', 'sand', 'grass', 'mountain'],
    wall: { from: 1, to: 3 },
    walk: { row: 2, through: false },
  },
  {
    id: 'halfOpen',
    cells: ['grass', 'grass', 'sand', 'grass', 'mountain'],
    wall: { from: 1, to: 3 },
    walk: { row: 1, through: true, cost: 3 },
  },
  {
    id: 'stream',
    cells: ['stream', 'grass', 'sand', 'grass', 'mountain'],
    wall: { from: 1, to: 3 },
    walk: { row: 1, through: true, cost: 3 },
  },
  {
    id: 'seaEnd',
    cells: ['water', 'grass', 'sand', 'grass', 'mountain'],
    wall: { from: 0, to: 3 },
    walk: { row: 2, through: false },
  },
  {
    id: 'gate',
    cells: ['mountain', 'grass', 'grass', 'grass', 'mountain'],
    wall: { from: 1, to: 3, gate: 2 },
    walk: { row: 2, through: true },
  },
];

type LegendItem = { kind: 'ground'; id: Ground } | { kind: 'wall' | 'gate' | 'army' | 'pass' | 'blocked'; id: string };
/** The legend under the pictures, in the order a reader meets things: the line, the ground, then the army. */
const LEGEND: LegendItem[] = [
  { kind: 'wall', id: 'wall' },
  { kind: 'gate', id: 'gate' },
  { kind: 'ground', id: 'grass' },
  { kind: 'ground', id: 'sand' },
  { kind: 'ground', id: 'water' },
  { kind: 'ground', id: 'mountain' },
  { kind: 'ground', id: 'river' },
  { kind: 'ground', id: 'stream' },
  { kind: 'army', id: 'army' },
  { kind: 'pass', id: 'pass' },
  { kind: 'blocked', id: 'blocked' },
];

/** Marks drawn on top of a hex so the ground reads without its colour. */
function peak(cx: number, cy: number): string {
  return `M${cx - 6} ${cy + 4} L${cx - 1} ${cy - 5} L${cx + 2} ${cy} L${cx + 4} ${cy - 2} L${cx + 7} ${cy + 4}`;
}
function waves(cx: number, cy: number): string {
  return [-3, 3].map((dy) => `M${cx - 7} ${cy + dy} q2.5 -3 5 0 t5 0 t5 0`).join(' ');
}
/** A wide river: two banks running across the hex. A stream is the same as a single thin line. */
function river(cx: number, cy: number): string {
  return [-4, 4].map((dy) => `M${cx - 9} ${cy + dy} q4.5 -4 9 0 t9 0`).join(' ');
}
function stream(cx: number, cy: number): string {
  return `M${cx - 9} ${cy} q4.5 -4 9 0 t9 0`;
}
function marks(ground: Ground, cx: number, cy: number): { d: string; cls: string } | null {
  if (ground === 'mountain') return { d: peak(cx, cy), cls: 'peak' };
  if (ground === 'water') return { d: waves(cx, cy), cls: 'waves' };
  if (ground === 'river') return { d: river(cx, cy), cls: 'waves' };
  if (ground === 'stream') return { d: stream(cx, cy), cls: 'stream' };
  return null;
}

/** The wall's line as one or two segments: a gate cuts a gap into it. */
function segments(wall: Row['wall']): { y1: number; y2: number }[] {
  const y1 = CENTRES[wall.from]!;
  const y2 = CENTRES[wall.to]!;
  if (wall.gate === undefined) return [{ y1, y2 }];
  const g = CENTRES[wall.gate]!;
  return [
    { y1, y2: g - GATE_HALF },
    { y1: g + GATE_HALF, y2 },
  ];
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
        <line v-for="(seg, i) in segments(row.wall)" :key="i" class="wall" :x1="X" :y1="seg.y1" :x2="X" :y2="seg.y2" />
        <template v-if="row.wall.gate !== undefined">
          <circle class="post" :cx="X" :cy="CENTRES[row.wall.gate]! - GATE_HALF" r="3" />
          <circle class="post" :cx="X" :cy="CENTRES[row.wall.gate]! + GATE_HALF" r="3" />
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
      <li v-for="item in LEGEND" :key="item.id" :data-legend="item.id">
        <svg viewBox="0 0 28 28" aria-hidden="true">
          <template v-if="item.kind === 'ground'">
            <polygon :points="hex(14, 14)" :class="['cell', item.id]" />
            <path v-if="marks(item.id, 14, 14)" :d="marks(item.id, 14, 14)!.d" :class="marks(item.id, 14, 14)!.cls" />
          </template>
          <line v-else-if="item.kind === 'wall'" class="wall" x1="14" y1="3" x2="14" y2="25" />
          <template v-else-if="item.kind === 'gate'">
            <line class="wall" x1="14" y1="2" x2="14" y2="7" />
            <line class="wall" x1="14" y1="21" x2="14" y2="26" />
            <circle class="post" cx="14" cy="8" r="3" />
            <circle class="post" cx="14" cy="20" r="3" />
          </template>
          <circle v-else-if="item.kind === 'army'" class="army" cx="14" cy="14" r="5" />
          <template v-else-if="item.kind === 'pass'">
            <line class="path ok" x1="3" y1="14" x2="21" y2="14" />
            <polygon class="head ok" points="21,9 27,14 21,19" />
          </template>
          <template v-else>
            <line class="path no" x1="2" y1="14" x2="9" y2="14" />
            <path class="cross" d="M13 8 l12 12 M25 8 l-12 12" />
          </template>
        </svg>
        {{ $t(`docs.walls.movement.diagram.legend.${item.id}`) }}
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
.cell.grass,
.cell.stream {
  fill: #3d5a2e;
}
.cell.sand {
  fill: #c9b26a;
}
.cell.mountain {
  fill: #6b6b72;
}
.cell.water {
  fill: #2f6f9e;
}
.cell.river {
  fill: #1f5580;
}
.peak,
.waves,
path.stream {
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
path.stream {
  stroke: #7fc0ea;
  stroke-width: 2.5;
}
/* The wall is a line through the middle of its hexes; a gate is a gap in it between two posts. */
.wall {
  stroke: #8a5a2b;
  stroke-width: 5;
  stroke-linecap: round;
}
.post {
  fill: var(--gold);
  stroke: #0b1116;
  stroke-width: 1;
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
