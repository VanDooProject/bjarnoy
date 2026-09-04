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
// property of the whole frame and not of any one layer.
//
// The breakdown below it is that same measurement automated. Attributing GPU
// time to one effect needs a timer query this codebase has no plumbing for, and
// FogPerfPanel leaves `shaderPassMs` off for exactly that reason — but the way
// §4.2d's figures were actually obtained was by toggling flags by hand and
// watching this number, and there is no reason a person should have to do that
// twenty times. `runPerfSweep` does the toggling, and — the part doing it by eye
// skips — reports each row's noise floor so a difference smaller than the frame
// clock's own wobble is called unresolved instead of printed as a small number.
// See perfSweep.ts's header for why the rows do not add up and are not meant to.
//
// waterPerfStats is a plain object the renderer mutates directly, so — exactly
// as in FogPerfPanel — polling is the simplest correct way to observe it
// without pulling Vue reactivity into HexMapRenderer.
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef } from 'vue';
import DebugPanel from './DebugPanel.vue';
import { waterDebugFlags, waterPerfStats, type WaterDebugFlags, type WaterPerfStats } from '../../lib/map/water/waterDebug';
import { runPerfSweep, sampleFrames, type SweepResult, type SweepSubject } from '../../lib/map/water/perfSweep';
import { fogDebugFlags } from '../../lib/map/HexMapRenderer';

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

// --- the breakdown ---------------------------------------------------------

const waterSubject = (key: keyof WaterDebugFlags, label: string, nested = false): SweepSubject => ({
  key,
  label,
  nested,
  enabled: () => waterDebugFlags[key],
  disable: () => {
    waterDebugFlags[key] = false;
  },
  restore: () => {
    waterDebugFlags[key] = true;
  },
});

/**
 * Both fog tiers as one row. Separately they are two more samples for an answer
 * nobody wants split — the question this row answers is "how much of the frame
 * is fog rather than water", and a half-hidden fog does not answer it.
 */
const fogSubject = (): SweepSubject => {
  let saved: [boolean, boolean] = [true, true];
  return {
    key: 'fog',
    label: 'Fog (both tiers)',
    enabled: () => fogDebugFlags.maskUnknown || fogDebugFlags.maskOutOfSight,
    disable: () => {
      saved = [fogDebugFlags.maskUnknown, fogDebugFlags.maskOutOfSight];
      fogDebugFlags.maskUnknown = false;
      fogDebugFlags.maskOutOfSight = false;
    },
    restore: () => {
      // Put back what was there, not `true` — one tier may already have been off
      // for something the user was looking at, and the sweep is not entitled to
      // change what is on screen once it is done.
      [fogDebugFlags.maskUnknown, fogDebugFlags.maskOutOfSight] = saved;
    },
  };
};

// Ordered coarse to fine, parents before the sub-effects they contain.
const SUBJECTS: SweepSubject[] = [
  waterSubject('water', 'Water layer (all of it)'),
  waterSubject('midWaterWaves', 'Surface pattern', true),
  waterSubject('coarseCaustics', 'Coarse net', true),
  waterSubject('fineCaustics', 'Fine net', true),
  waterSubject('causticShadows', 'Shadow pools', true),
  waterSubject('shorelineFoam', 'Shoreline foam', true),
  waterSubject('legacyWaveSquiggles', 'Wave squiggles (world map)'),
  fogSubject(),
];

/**
 * ~40 frames or 4s per sample, whichever comes first — see sampleFrames.
 *
 * 4s rather than the 3s this started at: under the software rasteriser a frame
 * is ~550ms, so 3s bought five of them and the median of five wobbled by more
 * than every per-effect row was worth. It is the samples-per-row that buys
 * resolution here, and the price is only the sweep's own length.
 */
const SAMPLE = { frames: 40, maxMs: 4_000, warmup: 2 };
/** Two baselines plus one sample per subject, at up to SAMPLE.maxMs each. */
const estimateS = Math.ceil(((SUBJECTS.length + 2) * SAMPLE.maxMs) / 1000);

const running = ref(false);
const progress = ref({ done: 0, total: 0, label: '' });
const result = shallowRef<SweepResult | null>(null);

async function measure() {
  if (running.value) return;
  running.value = true;
  result.value = null;
  try {
    result.value = await runPerfSweep(
      SUBJECTS,
      () => sampleFrames(SAMPLE),
      (done, total, label) => {
        progress.value = { done, total, label };
      },
    );
  } finally {
    running.value = false;
  }
}

/**
 * A frame this short is almost certainly being paced by the display rather than
 * by the map — 60Hz is 16.7ms, and anything at or under that is finishing early
 * and waiting. It matters because the sweep then cannot resolve *anything*:
 * switching an effect off makes the frame finish earlier and still wait, so
 * every row comes out flat and the panel would otherwise look broken rather
 * than inapplicable. Deliberately not a claim about the refresh rate — a 120Hz
 * display sits at 8.3ms and lands here too, which is the same situation.
 */
const vsyncBound = computed(() => !!result.value && result.value.baselineMs <= 17.5);

/** Bar width: this row's cost as a share of the whole frame. */
const share = (deltaMs: number, baselineMs: number) =>
  baselineMs > 0 ? Math.max(0, Math.min(100, Math.round((deltaMs / baselineMs) * 100))) : 0;
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

    <div class="breakdown">
      <button type="button" class="measure" :disabled="running" @click="measure">
        {{ running ? `Measuring ${progress.done}/${progress.total}…` : `Measure breakdown (~${estimateS} s)` }}
      </button>
      <div v-if="running" class="running">
        {{ progress.label }} — leave the camera still.
      </div>

      <template v-if="result">
        <div v-if="vsyncBound" class="capped">
          At {{ (1000 / result.baselineMs).toFixed(0) }} fps the frame is finishing early and waiting for the
          display, so nothing below can be resolved — the map is not what is pacing it. Make the window bigger,
          zoom in, or run this where the frame is already over budget.
        </div>
        <div class="row head">
          <span class="label">All on</span>
          <span class="bar-track" />
          <span class="value">{{ ms(result.baselineMs) }}</span>
        </div>
        <div v-for="row in result.rows" :key="row.key" class="row measured" :class="{ sub: row.nested }">
          <span class="label">{{ row.label }}</span>
          <span class="bar-track">
            <span
              v-if="!row.skipped && !row.unresolved"
              class="bar"
              :class="{ nested: row.nested }"
              :style="{ width: share(row.deltaMs, result.baselineMs) + '%' }"
            />
          </span>
          <span class="value" :class="{ faint: row.skipped || row.unresolved }">
            <template v-if="row.skipped">already off</template>
            <!-- A row that came out negative is not a small number with a sign,
                 it is a non-result — see SweepRow.unresolved. Saying so beats
                 printing a frame that got faster with more work in it. -->
            <template v-else-if="row.deltaMs <= 0">not resolved</template>
            <template v-else-if="row.unresolved">&lt; noise (&plusmn;{{ row.noiseMs.toFixed(1) }})</template>
            <template v-else>−{{ row.deltaMs.toFixed(1) }} ms</template>
          </span>
        </div>
        <div class="row drift">
          <span class="label">Baseline drift</span>
          <span class="bar-track" />
          <span class="value">{{ ms(result.driftMs) }}</span>
        </div>
      </template>
    </div>

    <div class="legend">
      Frame is the whole frame, not this layer's share. The breakdown measures each row the same way by hand
      would: switch one thing off, sample the frame clock, switch it back. So the rows <em>do not add up</em> —
      the layer's fixed cost (one full-viewport blended quad) is paid the moment the mesh is drawn at all and
      lands only in the first row, and an indented row's cost is already inside the row above it. A row smaller
      than the frame clock's own wobble says <em>&lt; noise</em> rather than a small number; if
      <em>baseline drift</em> is large, the machine moved under the sweep and it is worth re-running. There is no
      per-effect GPU time here because attributing it needs a timer query this codebase does not have. A bake only
      happens when the camera leaves the region it was baked over, so <em>bakes</em> climbing while the camera
      sits still is a bug.
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
.value.faint {
  color: var(--muted-2);
  font-size: 11px;
}
.breakdown {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.measure {
  width: 100%;
  appearance: none;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 4px;
  padding: 5px 8px;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.measure:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}
.measure:disabled {
  cursor: progress;
  color: var(--muted);
}
.running {
  margin-top: 4px;
  font-size: 11px;
  color: var(--muted);
}
.capped {
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 11px;
  line-height: 1.4;
  color: var(--muted);
}
.row.measured,
.row.head,
.row.drift {
  justify-content: flex-start;
  font-size: 12px;
}
.row.head {
  margin-top: 8px;
  font-weight: 700;
}
.row.drift {
  margin-top: 4px;
  padding-top: 5px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--muted);
  font-size: 11px;
}
.row.measured .label,
.row.head .label,
.row.drift .label {
  flex: 0 0 auto;
  min-width: 130px;
}
.row.measured.sub .label {
  min-width: 120px;
}
.bar-track {
  flex: 1 1 auto;
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.row.head .bar-track,
.row.drift .bar-track {
  background: none;
}
.bar {
  display: block;
  height: 100%;
  background: var(--gold);
}
/* Nested rows overlap their parent, so they are drawn in the quieter colour —
   they are a breakdown of the bar above, not another slice of the frame. */
.bar.nested {
  background: var(--muted-2);
}
.row.measured .value,
.row.head .value,
.row.drift .value {
  flex: 0 0 auto;
  min-width: 82px;
  text-align: right;
}
.legend {
  margin-top: 10px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--muted);
}
</style>
