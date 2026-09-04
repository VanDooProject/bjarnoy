<script setup lang="ts">
// Visual on/off switches for the water shader's individual mechanisms
// (waterDebugFlags) — the console-only window.__waterDebug hook (main.ts)
// needs devtools and a pan/zoom afterward to see anything change; this panel
// does both from a click. Mounted by SettlementView.vue *and* WorldMapView.vue
// under ?debug=1, since the feature ships in both views — see useFogDebug for
// why that flag is session-persisted rather than read off the query string.
import { reactive, watch } from 'vue';
import DebugPanel from './DebugPanel.vue';
import {
  waterDebugFlags,
  waterDebugTuning,
  type WaterDebugFlags,
  type WaterDebugTuning,
} from '../../lib/map/water/waterDebug';

/** The multiplier sliders all read as "1.00x"; 1.00 is what ships. */
const times = (v: number) => `${v.toFixed(2)}\u00d7`;

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
  coarseCaustics: 'Caustics: coarse net',
  fineCaustics: 'Caustics: fine highlight net',
  causticShadows: 'Caustics: drifting dark blobs',
  shorelineFoam: 'Shoreline foam',
  propTileMute: 'Quieten the shader over boat/rock tiles',
  seaBody: 'Sea body (world map; off = CSS gradient)',
  legacyWaveSquiggles: 'World map: Graphics wave squiggles',
  showWaterMask: 'Debug: show the raw water mask',
  legacyTileSplit: 'Split unsplit tall art in code',
};

// Brackets the shipped values on both sides, so "is this too wide / too still"
// is answerable by eye on a live map instead of by rebuilding between guesses.
const FOAM_WIDTH = { min: 0.1, max: 1.5, step: 0.05 };
const FOAM_SURGE = { min: 0, max: 1, step: 0.05 };
const WAVE_SPEED = { min: 0, max: 3, step: 0.1 };
// Up to the mask's own far range: past 1.5 hexes the distance channel is
// saturated and the handle would stop doing anything.
const CAUSTIC_CULL = { min: 0, max: 1.5, step: 0.05 };
// Multipliers on the shipped constants, so 1.00 is what ships and either
// direction is a comparison against it. Thickness stops at 3x because past
// that neighbouring ribbons merge and the net stops being a net; brightness at
// 2x because the coarse net's alpha is 0.38 and anything approaching opaque
// white reads as foam rather than as a caustic.
const CAUSTIC_THICKNESS = { min: 0.25, max: 3, step: 0.05 };
const CAUSTIC_BRIGHTNESS = { min: 0, max: 2, step: 0.05 };
// Seconds. The nets breathe on a period of roughly half a minute, so a range of
// one period covers every relative alignment there is — past it the offsets
// start repeating.
const CAUSTIC_PHASE = { min: 0, max: 30, step: 0.5 };
// Down to a third, where the net thins out to a few big loops, and up to 2.5x,
// where the ribbons start to touch and the water reads as a lace rather than a
// network. Both ends are worth being able to reach.
const CAUSTIC_DENSITY = { min: 0.3, max: 2.5, step: 0.05 };

/**
 * Every slider on the panel, as data.
 *
 * Ten of these, each previously fifteen lines of near-identical markup that
 * differed only in a label, a range and a unit — at which point the markup is
 * the least readable way to express the list. `needs` is the flag whose being
 * off greys the row out, so a handle that cannot currently do anything says so.
 */
const SLIDERS: {
  key: keyof WaterDebugTuning;
  label: string;
  needs: keyof WaterDebugFlags;
  range: { min: number; max: number; step: number };
  format: (v: number) => string;
}[] = [
  { key: 'foamWidthHexes', label: 'Foam width', needs: 'shorelineFoam', range: FOAM_WIDTH, format: (v) => `${v.toFixed(2)} hex` },
  { key: 'foamSurge', label: 'Foam surge', needs: 'shorelineFoam', range: FOAM_SURGE, format: (v) => v.toFixed(2) },
  { key: 'causticCullHexes', label: 'Caustic keep-off', needs: 'midWaterWaves', range: CAUSTIC_CULL, format: (v) => `${v.toFixed(2)} hex` },
  { key: 'causticThickness', label: 'Coarse net: thickness', needs: 'coarseCaustics', range: CAUSTIC_THICKNESS, format: times },
  { key: 'causticBrightness', label: 'Coarse net: brightness', needs: 'coarseCaustics', range: CAUSTIC_BRIGHTNESS, format: times },
  { key: 'causticDensity', label: 'Coarse net: density', needs: 'coarseCaustics', range: CAUSTIC_DENSITY, format: times },
  { key: 'causticFineThickness', label: 'Fine net: thickness', needs: 'fineCaustics', range: CAUSTIC_THICKNESS, format: times },
  { key: 'causticFineBrightness', label: 'Fine net: brightness', needs: 'fineCaustics', range: CAUSTIC_BRIGHTNESS, format: times },
  { key: 'causticFineDensity', label: 'Fine net: density', needs: 'fineCaustics', range: CAUSTIC_DENSITY, format: times },
  { key: 'causticFinePhase', label: 'Fine net: phase shift', needs: 'fineCaustics', range: CAUSTIC_PHASE, format: (v) => `${v.toFixed(1)} s` },
  { key: 'waveSpeed', label: 'Wave speed', needs: 'midWaterWaves', range: WAVE_SPEED, format: (v) => `${v.toFixed(1)}\u00d7` },
];

watch([flags, tuning], () => emit('change'), { flush: 'post' });
</script>

<template>
  <DebugPanel class="water-debug" title="Water debug" storage-key="water">
    <label v-for="(label, key) in LABELS" :key="key" class="row">
      <input type="checkbox" v-model="flags[key]" />
      <span>{{ label }}</span>
    </label>

    <div
      v-for="slider in SLIDERS"
      :key="slider.key"
      class="row slider-row"
      :class="{ disabled: !flags[slider.needs] }"
    >
      <span class="slider-label">
        {{ slider.label }}
        <span class="slider-value">{{ slider.format(tuning[slider.key]) }}</span>
      </span>
      <input
        type="range"
        :min="slider.range.min"
        :max="slider.range.max"
        :step="slider.range.step"
        :disabled="!flags[slider.needs]"
        v-model.number="tuning[slider.key]"
      />
    </div>
  </DebugPanel>
</template>

<style scoped>
/* Positioning and the collapsible header both live in DebugPanel.vue now; what
   is left here is only what is specific to this panel's rows. */
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
