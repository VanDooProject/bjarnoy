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

const LABELS: Record<keyof FogDebugFlags, string> = {
  distJitter: 'Distance jitter (fog ramp)',
  terrainCullJitter: 'Distance jitter (terrain cull, off by default)',
  scoutedTintFade: 'Scouted-tint fade (sight edge)',
  scoutedFog: 'Scouted (dark) fog enabled',
  blobJitter: 'Blob position/size jitter',
  terrainCull: 'Cull terrain past fog cutoff',
  flatFillOnly: 'Skip blob/flat-fill overlap',
  blobsOnly: 'Blob-only mist (no flat fill)',
  dragFade: 'Fade fog back in after drag (off by default)',
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
  position: absolute;
  /* Clears TopBar (top:16px) and ResourceBar (top:66px, right:16px) below them. */
  top: 120px;
  right: 16px;
  z-index: 20;
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
