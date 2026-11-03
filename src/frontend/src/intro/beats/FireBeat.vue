<script lang="ts">
import type { BeatMeta } from './types';
export const meta: BeatMeta = { id: 'fire', role: 'intro', durationMs: 4000 };
</script>

<script setup lang="ts">
defineProps<{ paused?: boolean }>();
</script>

<template>
  <svg class="intro-beat" :class="{ 'is-paused': paused }" viewBox="0 0 1600 1600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="1600" height="1600" fill="#14100c" />
    <rect x="350" y="350" width="900" height="900" class="intro-safe" />
    <g class="back"><path d="M0 1000 L400 700 L900 900 L1300 650 L1600 900 V1600 H0Z" fill="#1d1712" /></g>
    <circle class="glow" cx="1000" cy="1000" r="300" fill="#c8641e" />
    <g class="mid"><rect x="900" y="1040" width="200" height="40" fill="#2a1d12" /><path d="M960 1040 Q1000 900 1040 1040Z" fill="#f0a030" /></g>
    <g class="front"><path d="M520 1300 V1020 Q560 940 620 1020 V1300Z" fill="#0a0806" /><circle cx="570" cy="940" r="46" fill="#0a0806" /></g>
  </svg>
</template>

<style scoped>
.glow { transform-origin: 1000px 1000px; animation: fire-pulse calc(var(--beat-duration) / 4) ease-in-out infinite alternate; opacity: 0.35; }
.mid { animation: fire-flicker 700ms ease-in-out infinite alternate; transform-origin: 1000px 1080px; }
.back { animation: fire-push var(--beat-duration) linear both; }
@keyframes fire-pulse { from { opacity: 0.25; transform: scale(0.95); } to { opacity: 0.45; transform: scale(1.05); } }
@keyframes fire-flicker { from { transform: scale(1, 0.95); } to { transform: scale(1, 1.08); } }
@keyframes fire-push { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-30px, 0, 0); } }
</style>
