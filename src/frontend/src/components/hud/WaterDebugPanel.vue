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
  BOG_LAKE_FOAM_STYLES,
  FOAM_WIDTH_RANGE,
  waterDebugFlags,
  waterDebugTuning,
  type WaterDebugToggle,
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

/** The looks of the river overlay, by `riverStyle`. */
const RIVER_STYLES = ['Ripple arcs', 'Toon strands', 'Cartoon bands', 'Flow streaks', 'Bands + streaks'];

const LABELS: Record<WaterDebugToggle, string> = {
  water: 'Water layer enabled',
  midWaterWaves: 'Surface pattern (caustics close / waves far)',
  causticsEverywhere: 'Debug: caustics on the world map too',
  coarseCaustics: 'Caustics: coarse net',
  fineCaustics: 'Caustics: fine highlight net',
  causticShadows: 'Caustics: drifting dark blobs',
  shorelineFoam: 'Shoreline foam',
  seaBody: 'Sea body (world map; off = CSS gradient)',
  legacyWaveSquiggles: 'World map: Graphics wave squiggles',
  showWaterMask: 'Debug: show the raw water mask',
  riverFlow: 'River ripples (settlement)',
  showRiverFlow: 'Debug: show river ripple phase',
  legacyTileSplit: 'Split unsplit tall art in code',
  bogLakeFoam: 'Bog lakes: gust foam lines',
  bogLakeSheen: 'Bog lakes: gust sheen',
  bogLakeCatsPaws: "Bog lakes: gust cat's paws",
  bogLakeBlops: 'Bog lakes: blops (ripple crescents)',
};

// Brackets the shipped values on both sides, so "is this too wide / too still"
// is answerable by eye on a live map instead of by rebuilding between guesses.
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
// Multipliers on the shipped (deliberately subtle) lake gust; 1.00 is what ships.
const BOG_LAKE_STRENGTH = { min: 0, max: 3, step: 0.05 };
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
  needs: WaterDebugToggle;
  range: { min: number; max: number; step: number };
  format: (v: number) => string;
}[] = [
  { key: 'foamWidthHexes', label: 'Foam width', needs: 'shorelineFoam', range: FOAM_WIDTH_RANGE, format: (v) => `${v.toFixed(2)} hex` },
  { key: 'foamSurge', label: 'Foam surge', needs: 'shorelineFoam', range: FOAM_SURGE, format: (v) => v.toFixed(2) },
  { key: 'causticCullHexes', label: 'Caustic keep-off', needs: 'midWaterWaves', range: CAUSTIC_CULL, format: (v) => `${v.toFixed(2)} hex` },
  { key: 'causticThickness', label: 'Coarse net: thickness', needs: 'coarseCaustics', range: CAUSTIC_THICKNESS, format: times },
  { key: 'causticBrightness', label: 'Coarse net: brightness', needs: 'coarseCaustics', range: CAUSTIC_BRIGHTNESS, format: times },
  { key: 'causticDensity', label: 'Coarse net: density', needs: 'coarseCaustics', range: CAUSTIC_DENSITY, format: times },
  { key: 'causticFineThickness', label: 'Fine net: thickness', needs: 'fineCaustics', range: CAUSTIC_THICKNESS, format: times },
  { key: 'causticFineBrightness', label: 'Fine net: brightness', needs: 'fineCaustics', range: CAUSTIC_BRIGHTNESS, format: times },
  { key: 'causticFineDensity', label: 'Fine net: density', needs: 'fineCaustics', range: CAUSTIC_DENSITY, format: times },
  { key: 'causticFinePhase', label: 'Fine net: phase shift', needs: 'fineCaustics', range: CAUSTIC_PHASE, format: (v) => `${v.toFixed(1)} s` },
  { key: 'bogLakeFoamStrength', label: 'Bog lake foam: strength', needs: 'bogLakeFoam', range: BOG_LAKE_STRENGTH, format: times },
  { key: 'bogLakeFoamWidth', label: 'Bog lake foam: line width', needs: 'bogLakeFoam', range: { min: 0.01, max: 0.15, step: 0.005 }, format: (v) => v.toFixed(3) },
  { key: 'bogLakeFoamSpacing', label: 'Bog lake foam: spacing', needs: 'bogLakeFoam', range: { min: 6, max: 40, step: 1 }, format: (v) => `${v.toFixed(0)} u` },
  { key: 'bogLakeBlopsStrength', label: 'Bog lake blops: strength', needs: 'bogLakeBlops', range: BOG_LAKE_STRENGTH, format: times },
  { key: 'bogLakeBlopDensity', label: 'Bog lake blops: density', needs: 'bogLakeBlops', range: { min: 0, max: 1, step: 0.05 }, format: times },
  { key: 'bogLakeBlopSize', label: 'Bog lake blops: size', needs: 'bogLakeBlops', range: { min: 0.4, max: 2.5, step: 0.05 }, format: times },
  { key: 'bogLakeSheenStrength', label: 'Bog lake sheen: strength', needs: 'bogLakeSheen', range: BOG_LAKE_STRENGTH, format: times },
  { key: 'bogLakeCatsPawsStrength', label: "Bog lake cat's paws: strength", needs: 'bogLakeCatsPaws', range: BOG_LAKE_STRENGTH, format: times },
  { key: 'mapAnimationSpeed', label: 'All map animations: playback speed', needs: 'water', range: { min: 0, max: 1.5, step: 0.05 }, format: times },
  { key: 'bogLakeGustPhaseOffset', label: 'Bog lake gust: phase offset', needs: 'water', range: { min: -0.5, max: 0.5, step: 0.01 }, format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} period (${(v * 16).toFixed(1)} frames)` },
  { key: 'bogLakeBandHalf', label: 'Bog lake gust: band half-width', needs: 'water', range: { min: 0.05, max: 0.5, step: 0.01 }, format: (v) => `${v.toFixed(2)} period` },
  { key: 'riverBrightness', label: 'River flow: brightness', needs: 'riverFlow', range: CAUSTIC_BRIGHTNESS, format: times },
  { key: 'riverStreakMix', label: 'River flow: streaks over bands', needs: 'riverFlow', range: CAUSTIC_BRIGHTNESS, format: times },
  { key: 'riverArc', label: 'River flow: arc', needs: 'riverFlow', range: CAUSTIC_BRIGHTNESS, format: times },
  { key: 'riverSpeed', label: 'River flow: speed', needs: 'riverFlow', range: WAVE_SPEED, format: times },
  { key: 'waveSpeed', label: 'Wave speed', needs: 'midWaterWaves', range: WAVE_SPEED, format: (v) => `${v.toFixed(1)}\u00d7` },
];

// Debug-only panel text, like LABELS and SLIDERS above.
const FOAM_STYLE_LABEL = 'Bog lake foam: style';
const RIVER_STYLE_LABEL = 'River style';

watch([flags, tuning], () => emit('change'), { flush: 'post' });
</script>

<template>
  <DebugPanel class="water-debug" title="Water debug" storage-key="water">
    <label v-for="(label, key) in LABELS" :key="key" class="row">
      <input type="checkbox" v-model="flags[key]" />
      <span>{{ label }}</span>
    </label>

    <label class="row">
      <span>{{ RIVER_STYLE_LABEL }}</span>
      <select v-model.number="flags.riverStyle" :disabled="!flags.riverFlow">
        <option v-for="(name, i) in RIVER_STYLES" :key="name" :value="i">{{ name }}</option>
      </select>
    </label>

    <label class="row slider-row" :class="{ disabled: !flags.bogLakeFoam }">
      <span class="slider-label">{{ FOAM_STYLE_LABEL }}</span>
      <select v-model.number="tuning.bogLakeFoamStyle" :disabled="!flags.bogLakeFoam" data-testid="bog-lake-foam-style">
        <option v-for="(name, index) in BOG_LAKE_FOAM_STYLES" :key="name" :value="index">{{ name }}</option>
      </select>
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
