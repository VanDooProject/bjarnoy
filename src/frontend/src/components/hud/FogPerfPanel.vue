<script setup lang="ts">
// Live per-rebuild timing breakdown, mounted beneath FogDebugPanel —
// toggle a flag there and watch the matching row (and, where a phase mixes
// several fog features, the matching *sub*-row) move on the next
// pan/zoom. See fogPerfStats's own comment in HexMapRenderer.ts for
// exactly which flags affect which row.
//
// Sub-rows are real measurements or real counts, never fabricated: the
// blob-cache split (sync vs blur render) is two actual timed sections of
// refreshFogBlobCache, and the per-hex splits (terrain drawn/culled,
// unexplored/bordered/scouted hex counts) are counters incremented in the
// same branches the flags already gate — cheap (an integer increment),
// unlike wrapping each per-hex branch in its own performance.now() call,
// which would cost more than the branch it's timing and skew the very
// loop being measured. Counts are a size-of-work proxy for a sub-row's
// share of its parent's ms, not a separately measured time.
//
// fogPerfStats is a plain object mutated directly by HexMapRenderer, not a
// Vue ref/reactive (HexMapRenderer.ts stays Vue-reactivity-free — see
// FogDebugPanel.vue's own comment on why). Unlike the debug flags, this
// direction can't reuse a reactive()-wrapped proxy: HexMapRenderer writes
// to the raw object during rebuilds, which never goes through a Vue proxy
// trap, so nothing would tell this component to re-render. Polling on an
// interval is the simplest correct way to observe an external mutable
// object like this without pulling Vue into the renderer.
import { onMounted, onUnmounted, reactive, computed } from 'vue';
import { fogPerfStats, type FogPerfStats } from '../../lib/map/HexMapRenderer';

const POLL_MS = 250;

const stats = reactive<FogPerfStats>({ ...fogPerfStats });
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => Object.assign(stats, fogPerfStats), POLL_MS);
});
onUnmounted(() => clearInterval(timer));

interface Row {
  key: string;
  label: string;
  /** Wall-clock ms for this row, when measured directly. Bars for a row with children are sized against the *parent's* ms; leaf rows without ms show only their count. */
  ms: number | null;
  /** Size-of-work count (hexes, blobs) shown next to (or, for a count-only sub-row, instead of) ms. */
  count?: number;
  countLabel?: string;
  children?: Row[];
}

const ROWS = computed<Row[]>(() => [
  {
    key: 'terrain',
    label: 'Terrain',
    ms: stats.terrainMs,
    children: [
      { key: 'terrain-drawn', label: 'Drawn', ms: null, count: stats.terrainDrawnCount, countLabel: 'hexes' },
      { key: 'terrain-culled', label: 'Culled (fog)', ms: null, count: stats.terrainCulledCount, countLabel: 'hexes' },
    ],
  },
  {
    key: 'bordersFog',
    label: 'Borders + fog (per-hex)',
    ms: stats.bordersFogMs,
    children: stats.deepFogOnly
      ? [
          {
            key: 'deep-fog-shortcut',
            label: `Background shortcut active — per-hex loop skipped (${stats.hexCount} hexes)`,
            ms: null,
          },
        ]
      : [
          {
            key: 'unexplored',
            label: 'Unexplored (white) fog',
            ms: null,
            count: stats.unexploredHexCount,
            countLabel: 'hexes',
          },
          { key: 'bordered', label: 'Realm borders', ms: null, count: stats.borderedHexCount, countLabel: 'hexes' },
          {
            key: 'scouted',
            label: 'Scouted (dark) fog',
            ms: null,
            count: stats.scoutedHexCount,
            countLabel: 'hexes',
          },
        ],
  },
  {
    key: 'blobCache',
    label: 'Blob cache (blur render)',
    ms: stats.blobCacheMs,
    children: [
      { key: 'blob-sync', label: 'Sprite sync', ms: stats.blobSyncMs },
      { key: 'blob-render', label: 'Blur render pass', ms: stats.blobRenderMs },
    ],
  },
  { key: 'markers', label: 'Markers', ms: stats.markersMs },
  { key: 'waves', label: 'Waves', ms: stats.wavesMs },
]);

function ms(v: number): string {
  return `${v.toFixed(2)} ms`;
}

function share(v: number, of: number): number {
  return of > 0 ? Math.round((v / of) * 100) : 0;
}
</script>

<template>
  <div class="fog-perf panel">
    <div class="title">Fog perf (last rebuild)</div>
    <template v-for="row in ROWS" :key="row.key">
      <div class="row">
        <span class="label">{{ row.label }}</span>
        <span class="bar-track">
          <span class="bar" :style="{ width: share(row.ms ?? 0, stats.totalMs) + '%' }" />
        </span>
        <span class="value">{{ ms(row.ms ?? 0) }}</span>
      </div>
      <div v-for="child in row.children" :key="child.key" class="row sub">
        <span class="label">{{ child.label }}</span>
        <span class="bar-track">
          <span
            v-if="child.ms !== null"
            class="bar"
            :style="{ width: share(child.ms, row.ms || child.ms || 1) + '%' }"
          />
          <span
            v-else-if="child.count !== undefined"
            class="bar count"
            :style="{ width: share(child.count, stats.hexCount) + '%' }"
          />
        </span>
        <span class="value">
          <template v-if="child.ms !== null">{{ ms(child.ms) }}</template>
          <template v-else-if="child.count !== undefined">{{ child.count }} {{ child.countLabel }}</template>
        </span>
      </div>
    </template>
    <div class="row total">
      <span class="label">Total</span>
      <span class="bar-track" />
      <span class="value">{{ ms(stats.totalMs) }}</span>
    </div>
    <div class="meta">{{ stats.hexCount }} hexes &middot; {{ stats.blobCount }} fog blobs</div>
    <div class="legend">
      Hatched sub-row bars are hex counts, not timings — they show a row's <em>share of the viewport</em>, not a slice of its ms. Only Blob cache's sub-rows (solid bars: Sprite sync / Blur render pass) are real measured sub-timings that add up to their parent.
    </div>
  </div>
</template>

<style scoped>
.fog-perf {
  padding: 12px 14px;
  min-width: 260px;
}
.title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
  color: var(--text);
}
.row.sub {
  padding-left: 16px;
  font-size: 11px;
  color: var(--muted);
}
.row.total {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-weight: 700;
}
.label {
  flex: 0 0 auto;
  min-width: 150px;
}
.row.sub .label {
  min-width: 134px;
}
.bar-track {
  flex: 1 1 auto;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.row.sub .bar-track {
  height: 4px;
}
.bar {
  display: block;
  height: 100%;
  background: var(--gold);
  transition: width 0.15s ease-out;
}
.row.sub .bar {
  background: var(--muted-2);
}
.row.sub .bar.count {
  /* Hatched, not solid: visually distinct from a real sub-timing bar so it
     doesn't read as "this many ms of the parent's total". */
  background: repeating-linear-gradient(45deg, var(--muted-2) 0 3px, transparent 3px 6px);
}
.value {
  flex: 0 0 auto;
  min-width: 72px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.meta {
  margin-top: 8px;
  font-size: 11px;
  color: var(--muted);
}
.legend {
  margin-top: 6px;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--muted);
}
</style>
