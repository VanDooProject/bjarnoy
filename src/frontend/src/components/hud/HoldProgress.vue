<script setup lang="ts">
// The ring that fills while a press is held: around the ring menu's Upgrade bubble (gold) and under the finger or cursor on the
// map (white). It runs for exactly LONG_PRESS_MS, the time the hold needs to fire (lib/map/longPress.ts), and starts when it
// is mounted: the owner mounts it when the hold starts and unmounts it when the hold ends. The fill is HUD motion: with
// it reduced (the HUD motion setting, `html[data-hud-motion='reduced']`) the ring shows full at once; the hold itself still
// takes its full time.
import { computed } from 'vue';
import { LONG_PRESS_MS } from '../../lib/map/longPress';

const props = withDefaults(
  defineProps<{
    /** Outer diameter in px. */
    size: number;
    tone?: 'gold' | 'white';
  }>(),
  { tone: 'gold' },
);

const STROKE = 3;
const radius = computed(() => (props.size - STROKE) / 2);
</script>

<template>
  <svg
    class="hold-progress"
    :class="`hold-progress--${tone}`"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${size} ${size}`"
    :style="{ '--hold-ms': `${LONG_PRESS_MS}ms` }"
    aria-hidden="true"
    data-testid="hold-progress"
  >
    <circle class="hold-progress__track" :cx="size / 2" :cy="size / 2" :r="radius" fill="none" :stroke-width="STROKE" />
    <circle
      class="hold-progress__arc"
      :cx="size / 2"
      :cy="size / 2"
      :r="radius"
      fill="none"
      :stroke-width="STROKE"
      stroke-linecap="round"
      pathLength="1"
      stroke-dasharray="1 1"
    />
  </svg>
</template>

<style scoped>
.hold-progress {
  display: block;
  pointer-events: none;
  /* Starts at 12 o'clock and fills clockwise. */
  transform: rotate(-90deg);
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.6));
}
.hold-progress--gold {
  --hold-color: #ffc55c;
}
.hold-progress--white {
  --hold-color: #fff;
}
.hold-progress__track {
  stroke: var(--hold-color);
  stroke-opacity: 0.25;
}
.hold-progress__arc {
  stroke: var(--hold-color);
  stroke-dashoffset: 1;
  animation: hold-progress-fill var(--hold-ms) linear forwards;
}
@keyframes hold-progress-fill {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}
html[data-hud-motion='reduced'] .hold-progress__arc {
  animation: none;
  stroke-dashoffset: 0;
}
</style>
