<script lang="ts">
import type { BeatMeta } from './types';
export const meta: BeatMeta = { id: 'hold', role: 'hold', durationMs: 6000, loopMs: 6000 };
</script>

<script setup lang="ts">
defineProps<{ paused?: boolean }>();
</script>

<template>
  <svg class="intro-beat" :class="{ 'is-paused': paused }" viewBox="0 0 1600 1600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="1600" height="1600" fill="#5b7a8c" />
    <rect x="350" y="350" width="900" height="900" class="intro-safe" />
    <g class="smoke" fill="#9fb4c0" opacity="0.5"><rect x="250" y="560" width="14" height="260" /><rect x="1350" y="620" width="14" height="220" /></g>
    <rect class="intro-fog intro-drift-back" x="-512" y="500" width="2700" height="500" opacity="0.5" />
    <rect y="900" width="1600" height="700" fill="#27414f" />
    <g class="ship"><path d="M560 900 H1040 Q1000 1020 800 1040 Q600 1020 560 900Z" fill="#0d1a22" /><path d="M800 900 V600 L980 860Z" fill="#c9c2b0" /><path d="M560 900 Q540 860 520 840 M1040 900 Q1060 860 1080 840" stroke="#0d1a22" stroke-width="14" fill="none" /></g>
    <path class="waves" d="M-200 1040 Q-100 1000 0 1040 T200 1040 T400 1040 T600 1040 T800 1040 T1000 1040 T1200 1040 T1400 1040 T1600 1040 T1800 1040 V1600 H-200Z" fill="#1c3340" />
    <rect class="intro-fog intro-drift-mid" x="-512" y="900" width="2700" height="400" opacity="0.6" />
  </svg>
</template>

<style scoped>
.ship { animation: hold-bob calc(var(--loop-period) / 2) ease-in-out infinite alternate; transform-origin: 800px 1000px; }
.waves { animation: hold-waves calc(var(--loop-period) / 3) linear infinite; }
.smoke { animation: hold-smoke var(--loop-period) ease-in-out infinite alternate; }
@keyframes hold-bob { from { transform: translate3d(0, -10px, 0) rotate(-1.5deg); } to { transform: translate3d(0, 14px, 0) rotate(1.5deg); } }
@keyframes hold-waves { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-200px, 0, 0); } }
@keyframes hold-smoke { from { opacity: 0.2; } to { opacity: 0.6; } }
</style>
