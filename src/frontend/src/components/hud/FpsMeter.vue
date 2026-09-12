<script setup lang="ts">
// The actual frame rate, as its own readout at the top of the debug stack
// rather than a line inside a layer's panel.
//
// WaterPerfPanel's "Frame / ...which is" is a *median* over sixty frames,
// because `runPerfSweep` needs a baseline that one long frame can't drag
// around. That made it read a steady 59.9 fps on a map that was visibly
// stuttering: the rebuild frames it was dropping as outliers were the
// stutter. So this reports the three things a median cannot — what the last
// half-second actually averaged, how long the worst single frame in the last
// few seconds took, and how many frames in that window missed.
//
// The sparkline is the part worth reading first. A number says the map is
// slow; the strip says *how* — an even wall of tall bars is a frame that is
// simply over budget, while a flat run with one spike in it is a rebuild or a
// mask bake, which is a completely different bug.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DebugPanel from './DebugPanel.vue';
import type { MessageSchema } from '../../i18n/schema';
import { FRAME_WINDOW_MS, STUTTER_THRESHOLD_MS, useFrameRate } from '../../composables/useFrameRate';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const frame = useFrameRate();

const windowS = Math.round(FRAME_WINDOW_MS / 1000);

/**
 * Bar heights for the sparkline, as a percentage of `SPARK_CEILING_MS`.
 *
 * Clamped rather than scaled to the tallest bar present: a strip that
 * renormalises every frame makes a calm 60fps stretch look identical to a
 * catastrophic one, since in both the worst bar is full height. Against a
 * fixed ceiling, calm is calm.
 */
const SPARK_CEILING_MS = 100;
/**
 * A frame long enough to read as the map freezing rather than merely dropping
 * one — a sixth of a second. This is the band a rebuild or a mask bake lands
 * in, and the reason the readout is coloured at all.
 */
const STALL_MS = 100;
const spark = computed(() =>
  frame.recent.map((d) => ({
    height: Math.max(3, Math.min(100, (d / SPARK_CEILING_MS) * 100)),
    bad: d > STUTTER_THRESHOLD_MS,
  })),
);

// Green while every frame is arriving on time, amber once frames are merely
// late, red once the window contains a real stall.
const health = computed(() => {
  if (frame.worstMs > STALL_MS) return 'bad';
  if (frame.stutters > 0 || frame.fps < 50) return 'warn';
  return 'ok';
});
</script>

<template>
  <DebugPanel class="fps-meter" :title="t('hud.fpsMeter.title')" storage-key="fpsMeter">
    <div class="headline" :class="health">
      <span class="fps">{{ frame.fps.toFixed(0) }}</span>
      <span class="unit">{{ t('hud.fpsMeter.fps') }}</span>
      <span class="frame">{{ t('hud.fpsMeter.msPerFrame', { n: frame.frameMs.toFixed(1) }) }}</span>
    </div>

    <div class="spark" :aria-label="t('hud.fpsMeter.sparkLabel', { n: spark.length })">
      <span
        v-for="(bar, i) in spark"
        :key="i"
        class="bar"
        :class="{ bad: bar.bad }"
        :style="{ height: bar.height + '%' }"
      />
    </div>

    <div class="row">
      <span>{{ t('hud.fpsMeter.worstFrame', { seconds: windowS }) }}</span>
      <span class="value" :class="{ bad: frame.worstMs > STALL_MS }">
        {{ t('hud.fpsMeter.ms', { n: frame.worstMs.toFixed(0) }) }}
        <span class="ago">{{ t('hud.fpsMeter.ago', { n: frame.worstAgoS.toFixed(1) }) }}</span>
      </span>
    </div>
    <div class="row">
      <span>{{ t('hud.fpsMeter.stutters', { threshold: STUTTER_THRESHOLD_MS }) }}</span>
      <span class="value" :class="{ bad: frame.stutters > 0 }">{{ frame.stutters }}</span>
    </div>

    <div class="legend">{{ t('hud.fpsMeter.legend', { ceiling: SPARK_CEILING_MS }) }}</div>
  </DebugPanel>
</template>

<style scoped>
/* Fixed, like FogPerfPanel's own width and for the same reason: the stack is
   a stretch-sized flex column, so a panel with no definite width is sized by
   its longest unwrapped line — here the legend — and drags the whole column
   out with it. Vue puts this component's scope id on DebugPanel's root, so
   this lands on the shell. */
.fps-meter {
  width: 300px;
}
.headline {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}
.fps {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}
.headline.ok .fps {
  color: #7ddb92;
}
.headline.warn .fps {
  color: #f2c661;
}
.headline.bad .fps {
  color: #f28b82;
}
.unit {
  font-size: 12px;
  color: var(--muted);
}
.frame {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
}
.spark {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 34px;
  margin: 8px 0 6px;
  padding: 2px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 3px;
  overflow: hidden;
}
.spark .bar {
  flex: 1 1 0;
  min-width: 1px;
  background: #6aa9d8;
  border-radius: 1px 1px 0 0;
}
.spark .bar.bad {
  background: #f28b82;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 0;
  font-size: 11px;
  color: var(--muted);
}
.row .value {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.row .value.bad {
  color: #f28b82;
}
.ago {
  color: var(--muted);
  margin-left: 4px;
}
.legend {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 10px;
  line-height: 1.4;
  color: var(--muted);
}
</style>
