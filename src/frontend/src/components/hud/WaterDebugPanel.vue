<script setup lang="ts">
// Visual on/off switches for the water shader's individual mechanisms
// (waterDebugFlags) — the console-only window.__waterDebug hook (main.ts)
// needs devtools and a pan/zoom afterward to see anything change; this panel
// does both from a click. Mounted by SettlementView.vue *and* WorldMapView.vue
// under ?debug=1, since the feature ships in both views — see useFogDebug for
// why that flag is session-persisted rather than read off the query string.
import { reactive, watch } from 'vue';
import { waterDebugFlags, waterDebugTuning, type WaterDebugFlags } from '../../lib/map/water/waterDebug';

const emit = defineEmits<{ change: [] }>();

// waterDebugFlags itself stays a plain object — the renderer reads it directly
// on the hot path and HexMapRenderer.ts is deliberately Vue-reactivity-free.
// Wrapping it here keeps that boundary: this reactive() proxy forwards every
// write through to the same underlying object, so the two stay in sync without
// the renderer importing Vue at all. Same as FogDebugPanel does.
const flags = reactive(waterDebugFlags);
const tuning = reactive(waterDebugTuning);

const LABELS: Record<keyof WaterDebugFlags, string> = {
  water: 'Water layer enabled',
  midWaterWaves: 'Surface pattern (caustics close / waves far)',
  causticsEverywhere: 'Debug: caustics on the world map too',
  shorelineFoam: 'Shoreline foam',
  seaBody: 'Sea body (world map; off = CSS gradient)',
  legacyWaveSquiggles: 'Legacy Graphics wave squiggles',
  showWaterMask: 'Debug: show the raw water mask',
  legacyTileSplit: 'Split unsplit tall art in code',
};

// Brackets the shipped values on both sides, so "is this too wide / too still"
// is answerable by eye on a live map instead of by rebuilding between guesses.
const FOAM_WIDTH = { min: 0.1, max: 1.5, step: 0.05 };
const FOAM_SURGE = { min: 0, max: 1, step: 0.05 };
const WAVE_SPEED = { min: 0, max: 3, step: 0.1 };

watch([flags, tuning], () => emit('change'), { flush: 'post' });
</script>

<template>
  <div class="water-debug panel">
    <div class="title">Water debug</div>
    <label v-for="(label, key) in LABELS" :key="key" class="row">
      <input type="checkbox" v-model="flags[key]" />
      <span>{{ label }}</span>
    </label>

    <div class="row slider-row" :class="{ disabled: !flags.shorelineFoam }">
      <span class="slider-label">
        Foam width
        <span class="slider-value">{{ tuning.foamWidthHexes.toFixed(2) }} hex</span>
      </span>
      <input
        type="range"
        :min="FOAM_WIDTH.min"
        :max="FOAM_WIDTH.max"
        :step="FOAM_WIDTH.step"
        :disabled="!flags.shorelineFoam"
        v-model.number="tuning.foamWidthHexes"
      />
    </div>
    <div class="row slider-row" :class="{ disabled: !flags.shorelineFoam }">
      <span class="slider-label">
        Foam surge
        <span class="slider-value">{{ tuning.foamSurge.toFixed(2) }}</span>
      </span>
      <input
        type="range"
        :min="FOAM_SURGE.min"
        :max="FOAM_SURGE.max"
        :step="FOAM_SURGE.step"
        :disabled="!flags.shorelineFoam"
        v-model.number="tuning.foamSurge"
      />
    </div>
    <div class="row slider-row" :class="{ disabled: !flags.midWaterWaves }">
      <span class="slider-label">
        Wave speed
        <span class="slider-value">{{ tuning.waveSpeed.toFixed(1) }}&times;</span>
      </span>
      <input
        type="range"
        :min="WAVE_SPEED.min"
        :max="WAVE_SPEED.max"
        :step="WAVE_SPEED.step"
        :disabled="!flags.midWaterWaves"
        v-model.number="tuning.waveSpeed"
      />
    </div>
  </div>
</template>

<style scoped>
/* Positioned by the caller — both views place this inside the same
   `.fog-debug-stack` flex column as FogDebugPanel/FogPerfPanel (that wrapper
   carries the position: absolute), so this stays a normal flex child. */
.water-debug {
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
/* A range input squeezed next to a label is unusable at this panel width, so
   the sliders stack their label over a full-width track. */
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
