<script setup lang="ts">
// What the water layer costs, mounted beneath WaterDebugPanel — the sibling of
// FogPerfPanel, and it follows that panel's rules about honesty over coverage.
//
// The headline number is the frame interval, because that is what this feature
// actually spends (docs/design/water-shader.md §4.2d: on a software rasteriser
// the settlement view goes from 141ms/frame to 247ms, and ~84ms of the ~99ms is
// rasterising and blending one full-viewport quad before the fragment shader
// computes anything). It is measured here, in the panel, with
// requestAnimationFrame rather than being reported by the renderer: it is a
// property of the whole frame and not of any one layer, and the useful way to
// read it is to toggle "Water layer enabled" above and watch it move.
//
// What is deliberately absent is a per-effect GPU breakdown. Attributing frame
// time to the caustics or the foam needs a GPU timer query this codebase has no
// plumbing for; the §4.2d figures came from toggling flags and watching this
// same number. FogPerfPanel leaves `shaderPassMs` off for the same reason, and
// a fabricated row would be worse than the gap.
//
// waterPerfStats is a plain object the renderer mutates directly, so — exactly
// as in FogPerfPanel — polling is the simplest correct way to observe it
// without pulling Vue reactivity into HexMapRenderer.
import { computed, onMounted, onUnmounted, reactive } from 'vue';
import DebugPanel from './DebugPanel.vue';
import { waterPerfStats, type WaterPerfStats } from '../../lib/map/water/waterDebug';

const POLL_MS = 250;
/** A second of frames, which is enough for a median to stop jumping about. */
const FRAME_WINDOW = 60;

const stats = reactive<WaterPerfStats>({ ...waterPerfStats });

let poll: number | undefined;
let raf: number | undefined;
const intervals: number[] = [];
let last = 0;

const sampleFrame = (now: number) => {
  if (last) {
    intervals.push(now - last);
    if (intervals.length > FRAME_WINDOW) intervals.shift();
  }
  last = now;
  raf = requestAnimationFrame(sampleFrame);
};

onMounted(() => {
  raf = requestAnimationFrame(sampleFrame);
  poll = window.setInterval(() => {
    // Median, not mean: one long frame (a re-bake, a texture upload, the tab
    // being backgrounded for a moment) would drag a mean around and say nothing
    // about what the layer normally costs.
    const sorted = [...intervals].sort((a, b) => a - b);
    waterPerfStats.frameMs = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    Object.assign(stats, waterPerfStats);
  }, POLL_MS);
});
onUnmounted(() => {
  if (poll !== undefined) window.clearInterval(poll);
  if (raf !== undefined) cancelAnimationFrame(raf);
});

const ms = (v: number) => `${v.toFixed(2)} ms`;
const fps = computed(() => (stats.frameMs > 0 ? (1000 / stats.frameMs).toFixed(1) : '—'));
const texels = computed(() => stats.maskWidth * stats.maskHeight);
/** Thousands separators — a mask is six figures of texels and reads as noise without them. */
const count = (v: number) => v.toLocaleString();
</script>

<template>
  <DebugPanel class="water-perf" title="Water perf" storage-key="waterPerf">
    <div class="row">
      <span class="label">Frame</span>
      <span class="value">{{ ms(stats.frameMs) }}</span>
    </div>
    <div class="row sub">
      <span class="label">…which is</span>
      <span class="value">{{ fps }} fps</span>
    </div>
    <div class="row">
      <span class="label">Mask bake</span>
      <span class="value">{{ ms(stats.bakeMs) }}</span>
    </div>
    <div class="row sub">
      <span class="label">Mask size</span>
      <span class="value">{{ stats.maskWidth }}&times;{{ stats.maskHeight }}</span>
    </div>
    <div class="row sub">
      <span class="label">Texels</span>
      <span class="value">{{ count(texels) }}</span>
    </div>
    <div class="row sub">
      <span class="label">Bakes this session</span>
      <span class="value">{{ stats.bakes }}</span>
    </div>
    <div class="legend">
      Frame is the whole frame, not this layer's share — toggle <em>Water layer enabled</em> above and watch it
      move; the difference is what the layer costs. There is no per-effect breakdown because attributing GPU time
      needs a timer query this codebase does not have. A bake only happens when the camera leaves the region it
      was baked over, so <em>bakes</em> climbing while the camera sits still is a bug.
    </div>
  </DebugPanel>
</template>

<style scoped>
/* Fixed width for the same reason FogPerfPanel is: the legend has no natural
   wrap point, and a min-width lets the flex column stretch the panel out to the
   legend's max-content width. */
.water-perf {
  width: 300px;
}
.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 0;
  font-size: 13px;
  color: var(--text);
}
.row.sub {
  font-size: 12px;
  color: var(--muted);
  padding-left: 10px;
}
.value {
  font-variant-numeric: tabular-nums;
}
.legend {
  margin-top: 10px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--muted);
}
</style>
