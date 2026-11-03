<script lang="ts">
import type { BeatMeta } from './types';
export const meta: BeatMeta = { id: 'ravens', role: 'intro', durationMs: 3000, optional: true };
</script>

<script setup lang="ts">
defineProps<{ paused?: boolean }>();
</script>

<template>
  <svg class="intro-beat" :class="{ 'is-paused': paused }" viewBox="0 0 1600 1600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="1600" height="1600" fill="#1b2430" />
    <rect x="350" y="350" width="900" height="900" class="intro-safe" />
    <path d="M0 1350 Q500 1250 900 1330 T1600 1300 V1600 H0Z" fill="#0f151d" />
    <g class="flock">
      <path class="raven r1" d="M-120 700 L-60 650 L0 700 L-60 680Z" fill="#05080c" transform="scale(2)" />
      <path class="raven r2" d="M-120 900 L-60 850 L0 900 L-60 880Z" fill="#05080c" transform="scale(2.6)" />
      <path class="raven r3" d="M-120 520 L-60 470 L0 520 L-60 500Z" fill="#05080c" transform="scale(1.6)" />
    </g>
  </svg>
</template>

<style scoped>
.flock { animation: ravens-cross var(--beat-duration) linear both; }
.raven { transform-box: fill-box; transform-origin: center; }
@keyframes ravens-cross { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(1900px, -80px, 0); } }
</style>
