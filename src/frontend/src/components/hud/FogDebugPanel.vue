<script setup lang="ts">
// Visual on/off switches for HexMapRenderer's individual fog mechanisms
// (fogDebugFlags) — the console-only window.__fogDebug hook (main.ts) needs
// devtools and a manual pan/zoom afterward to see anything change; this
// panel does both from a click. Mounted by SettlementView.vue only when the
// URL has ?debug=1 (see its own `showFogDebug`).
import { reactive, watch } from 'vue';
import { fogDebugFlags, fogDebugTuning, type FogDebugFlags } from '../../lib/map/HexMapRenderer';

const emit = defineEmits<{ change: [] }>();

// fogDebugFlags itself stays a plain object (HexMapRenderer.ts is
// deliberately Vue-reactivity-free — see its own module comment on why the
// renderer avoids Vue's proxy walk for hot-path data). Wrapping it here
// keeps that boundary: this reactive() proxy forwards every write through
// to the same underlying object HexMapRenderer reads from directly, so the
// two stay in sync without HexMapRenderer.ts importing Vue at all.
const flags = reactive(fogDebugFlags);
// Same wrapping rationale as `flags` above, for the knobs that are a value
// rather than a checkbox (FogDebugTuning).
const tuning = reactive(fogDebugTuning);

// Wide enough to bracket both "is it moving at all?" and "is this too
// fast?" around the shipped rate, which sits at 1.
const DRIFT_SPEED_MIN = 0;
const DRIFT_SPEED_MAX = 5;
const DRIFT_SPEED_STEP = 0.1;

// Labelled to match FogPerfPanel's row names ("Terrain", "Borders", "Mask
// fetch") so a toggle here and the number it moves there are easy to line
// up. See map-fog-v2.md §2.8 for why this is a different flag set from v1's.
const LABELS: Record<keyof FogDebugFlags, string> = {
  maskUnknown: 'Unexplored (white mist) tier enabled',
  maskOutOfSight: 'Out-of-sight (dark) tier enabled',
  warp: 'Edge noise (organic mist edge)',
  drift: 'Wind drift (animates the edge)',
  showRawMask: 'Debug: bypass edge shaping, show raw mask',
  realmBorders: 'Realm borders enabled',
  terrainCull: 'Terrain: cull past fog cutoff',
  waveCull: 'Waves: cull past fog cutoff',
};

watch(
  [flags, tuning],
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
    <div class="row slider-row" :class="{ disabled: !flags.drift }">
      <span class="slider-label">
        Drift speed
        <span class="slider-value">{{ tuning.driftSpeed.toFixed(1) }}&times;</span>
      </span>
      <input
        type="range"
        :min="DRIFT_SPEED_MIN"
        :max="DRIFT_SPEED_MAX"
        :step="DRIFT_SPEED_STEP"
        :disabled="!flags.drift"
        v-model.number="tuning.driftSpeed"
      />
    </div>
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
/* The slider stacks its label over a full-width track, unlike the checkbox
   rows — a range input squeezed next to a label is unusable at this panel
   width. */
.slider-row {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding-top: 8px;
  cursor: default;
}
.slider-row.disabled {
  opacity: 0.45;
}
.slider-label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.slider-value {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.slider-row input {
  width: 100%;
}
</style>
