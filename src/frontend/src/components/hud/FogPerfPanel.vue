<script setup lang="ts">
// Live per-rebuild-phase timing breakdown, mounted beneath FogDebugPanel —
// toggle a flag there and watch the matching row here move on the next
// pan/zoom (each rebuild refreshes fogPerfStats; see its own comment in
// HexMapRenderer.ts for exactly which flags affect which row).
//
// fogPerfStats is a plain object mutated directly by HexMapRenderer, not a
// Vue ref/reactive (HexMapRenderer.ts stays Vue-reactivity-free — see
// FogDebugPanel.vue's own comment on why). Unlike the debug flags, this
// direction can't reuse a reactive()-wrapped proxy: HexMapRenderer writes
// to the raw object during rebuilds, which never goes through a Vue proxy
// trap, so nothing would tell this component to re-render. Polling on an
// interval is the simplest correct way to observe an external mutable
// object like this without pulling Vue into the renderer.
import { onMounted, onUnmounted, reactive } from 'vue';
import { fogPerfStats, type FogPerfStats } from '../../lib/map/HexMapRenderer';

const POLL_MS = 250;

const stats = reactive<FogPerfStats>({ ...fogPerfStats });
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => Object.assign(stats, fogPerfStats), POLL_MS);
});
onUnmounted(() => clearInterval(timer));

const ROWS: { key: keyof FogPerfStats; label: string }[] = [
  { key: 'terrainMs', label: 'Terrain' },
  { key: 'bordersFogMs', label: 'Borders + fog (per-hex)' },
  { key: 'blobCacheMs', label: 'Blob cache (blur render)' },
  { key: 'markersMs', label: 'Markers' },
  { key: 'wavesMs', label: 'Waves' },
];

function ms(v: number): string {
  return `${v.toFixed(2)} ms`;
}

// Rough per-row share of the total, so the biggest cost is visually obvious
// without doing the division in your head.
function share(v: number): number {
  return stats.totalMs > 0 ? Math.round((v / stats.totalMs) * 100) : 0;
}
</script>

<template>
  <div class="fog-perf panel">
    <div class="title">Fog perf (last rebuild)</div>
    <div v-for="row in ROWS" :key="row.key" class="row">
      <span class="label">{{ row.label }}</span>
      <span class="bar-track">
        <span class="bar" :style="{ width: share(stats[row.key] as number) + '%' }" />
      </span>
      <span class="value">{{ ms(stats[row.key] as number) }}</span>
    </div>
    <div class="row total">
      <span class="label">Total</span>
      <span class="bar-track" />
      <span class="value">{{ ms(stats.totalMs) }}</span>
    </div>
    <div class="meta">{{ stats.hexCount }} hexes &middot; {{ stats.blobCount }} fog blobs</div>
  </div>
</template>

<style scoped>
.fog-perf {
  padding: 12px 14px;
  min-width: 230px;
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
.row.total {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-weight: 700;
}
.label {
  flex: 0 0 auto;
  min-width: 130px;
}
.bar-track {
  flex: 1 1 auto;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.bar {
  display: block;
  height: 100%;
  background: var(--gold);
  transition: width 0.15s ease-out;
}
.value {
  flex: 0 0 auto;
  min-width: 62px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.meta {
  margin-top: 8px;
  font-size: 11px;
  color: var(--muted);
}
</style>
