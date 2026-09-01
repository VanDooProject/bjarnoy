<script setup lang="ts">
// Visual on/off switches for HexMapRenderer's individual fog mechanisms
// (fogDebugFlags) — the console-only window.__fogDebug hook (main.ts) needs
// devtools and a manual pan/zoom afterward to see anything change; this
// panel does both from a click. Mounted by SettlementView.vue only when the
// URL has ?debug=1 (see its own `showFogDebug`).
import { reactive, watch } from 'vue';
import { fogDebugFlags, type FogDebugFlags } from '../../lib/map/HexMapRenderer';

const emit = defineEmits<{ change: [] }>();

// fogDebugFlags itself stays a plain object (HexMapRenderer.ts is
// deliberately Vue-reactivity-free — see its own module comment on why the
// renderer avoids Vue's proxy walk for hot-path data). Wrapping it here
// keeps that boundary: this reactive() proxy forwards every write through
// to the same underlying object HexMapRenderer reads from directly, so the
// two stay in sync without HexMapRenderer.ts importing Vue at all.
const flags = reactive(fogDebugFlags);

// Labelled to match FogPerfPanel's row names ("Terrain", "Borders", "Mask
// fetch") so a toggle here and the number it moves there are easy to line
// up. See map-fog-v2.md §2.8 for why this is a different flag set from v1's.
const LABELS: Record<keyof FogDebugFlags, string> = {
  maskUnknown: 'Unexplored (white mist) tier enabled',
  maskOutOfSight: 'Out-of-sight (dark) tier enabled',
  warp: 'UV warp (organic mist edge)',
  drift: 'Wind drift (animates the warp)',
  showRawMask: 'Debug: bypass warp, show raw mask',
  realmBorders: 'Realm borders enabled',
  terrainCull: 'Terrain: cull past fog cutoff',
};

watch(
  flags,
  () => emit('change'),
  { flush: 'post' },
);
</script>

<template>
  <div class="fog-debug panel">
    <div class="title">Fog debug</div>
    <label v-for="(label, key) in LABELS" :key="key" class="row">
      <input type="checkbox" v-model="flags[key]" />
      <span>{{ label }}</span>
    </label>
  </div>
</template>

<style scoped>
.fog-debug {
  /* Positioned by the caller — both SettlementView and WorldMapView place
     this inside a `.fog-debug-stack` flex column alongside FogPerfPanel
     (that wrapper carries the position: absolute), so this stays a normal
     flex child rather than positioning itself. */
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
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.row input {
  cursor: pointer;
}
</style>
