<script setup lang="ts">
// Tuning panel for the zoom-driven world<->settlement transition — see
// docs/design/zoom-transition.md §2. Mounted by MapView.vue (the shared
// /world and /settlement host) under ?debug=1, same as the fog/water panels.
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import DebugPanel from './DebugPanel.vue';
import { clampTuning, zoomTransitionTuning, type ZoomTransitionTuning } from '../../lib/map/zoomTransition';
import type { HexMapRenderer } from '../../lib/map/HexMapRenderer';

const props = defineProps<{ renderer?: HexMapRenderer | null }>();

// zoomTransitionTuning itself stays a plain object — the renderer reads it
// directly on the hot path (onWheel) and HexMapRenderer.ts is deliberately
// Vue-reactivity-free. Wrapping it here keeps that boundary, same as
// WaterDebugPanel/FogDebugPanel do for their own tuning objects.
const tuning = reactive(zoomTransitionTuning);

// Persisted in sessionStorage — tab-scoped, cleared on close, same
// throwaway-inspection-aid precedent as useFogDebug/DebugPanel's collapsed
// state. A deliberate deviation from fogDebugTuning/waterDebugTuning (which
// persist nothing and reset to the shipped value on reload): a bad value
// here causes real navigations, so losing it to an accidental reload
// mid-session is worse than for a pure visual toggle — see
// docs/design/zoom-transition.md §3.
const STORAGE_KEY = 'fjordhold:zoomTuning';

function load() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw) as Partial<ZoomTransitionTuning>;
    if (typeof saved.enabled === 'boolean') tuning.enabled = saved.enabled;
    if (typeof saved.enterSettlementZoom === 'number') tuning.enterSettlementZoom = saved.enterSettlementZoom;
    if (typeof saved.exitToWorldZoom === 'number') tuning.exitToWorldZoom = saved.exitToWorldZoom;
    if (typeof saved.fadeMs === 'number') tuning.fadeMs = saved.fadeMs;
  } catch {
    // Corrupt/old-shape value — ignore and keep the shipped defaults.
  }
}

function save() {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      enabled: tuning.enabled,
      enterSettlementZoom: tuning.enterSettlementZoom,
      exitToWorldZoom: tuning.exitToWorldZoom,
      fadeMs: tuning.fadeMs,
    }),
  );
}

load();

function onSliderChange() {
  const fixed = clampTuning(tuning);
  tuning.enterSettlementZoom = fixed.enterSettlementZoom;
  tuning.exitToWorldZoom = fixed.exitToWorldZoom;
  save();
}

// Live zoom readout — HexMapRenderer is deliberately Vue-reactivity-free, so
// this polls cameraZoom rather than watching it, same as FogPerfPanel/
// WaterPerfPanel poll their own stats objects.
const liveZoom = ref<number | null>(null);
let pollHandle: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  pollHandle = setInterval(() => {
    liveZoom.value = props.renderer?.cameraZoom ?? null;
  }, 200);
});
onUnmounted(() => {
  if (pollHandle !== undefined) clearInterval(pollHandle);
});

const ENTER_RANGE = { min: 0.3, max: 1.5, step: 0.05 };
const EXIT_RANGE = { min: 0.05, max: 0.5, step: 0.02 };
const FADE_RANGE = { min: 0, max: 800, step: 20 };
const fmt = (v: number) => `${v.toFixed(2)}×`;
const fmtMs = (v: number) => `${v}ms`;
</script>

<template>
  <DebugPanel class="zoom-debug" title="Zoom transition" storage-key="zoom">
    <label class="row">
      <input type="checkbox" v-model="tuning.enabled" @change="save" />
      <span>Zoom-driven transition enabled</span>
    </label>

    <div v-if="liveZoom !== null" class="row readout">
      <span>Current zoom</span>
      <span class="value">{{ fmt(liveZoom) }}</span>
    </div>

    <div class="row slider-row" :class="{ disabled: !tuning.enabled }">
      <span class="slider-label">
        Zoom in &rarr; settlement at
        <span class="slider-value">{{ fmt(tuning.enterSettlementZoom) }}</span>
      </span>
      <input
        type="range"
        :min="ENTER_RANGE.min"
        :max="ENTER_RANGE.max"
        :step="ENTER_RANGE.step"
        :disabled="!tuning.enabled"
        v-model.number="tuning.enterSettlementZoom"
        @input="onSliderChange"
      />
    </div>

    <div class="row slider-row" :class="{ disabled: !tuning.enabled }">
      <span class="slider-label">
        Zoom out &rarr; world at
        <span class="slider-value">{{ fmt(tuning.exitToWorldZoom) }}</span>
      </span>
      <input
        type="range"
        :min="EXIT_RANGE.min"
        :max="EXIT_RANGE.max"
        :step="EXIT_RANGE.step"
        :disabled="!tuning.enabled"
        v-model.number="tuning.exitToWorldZoom"
        @input="onSliderChange"
      />
    </div>

    <div class="row slider-row" :class="{ disabled: !tuning.enabled }">
      <span class="slider-label">
        Fade duration
        <span class="slider-value">{{ fmtMs(tuning.fadeMs) }}</span>
      </span>
      <input
        type="range"
        :min="FADE_RANGE.min"
        :max="FADE_RANGE.max"
        :step="FADE_RANGE.step"
        :disabled="!tuning.enabled"
        v-model.number="tuning.fadeMs"
        @input="onSliderChange"
      />
    </div>
  </DebugPanel>
</template>

<style scoped>
/* Same rules as WaterDebugPanel/FogDebugPanel — positioning and the
   collapsible header live in DebugPanel.vue. */
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.row input[type='checkbox'] {
  cursor: pointer;
}
.readout {
  justify-content: space-between;
  cursor: default;
}
.readout .value {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
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
