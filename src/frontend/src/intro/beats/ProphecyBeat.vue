<script lang="ts">
import type { BeatMeta } from './types';
export const meta: BeatMeta = { id: 'prophecy', role: 'intro', durationMs: 4000 };
</script>

<script setup lang="ts">
defineProps<{ paused?: boolean }>();
</script>

<template>
  <svg class="intro-beat" :class="{ 'is-paused': paused }" viewBox="0 0 1600 1600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="1600" height="1600" fill="#0e1a2b" />
    <rect x="350" y="350" width="900" height="900" class="intro-safe" />
    <g class="stars" fill="#cfe0f5"><circle cx="300" cy="300" r="6" /><circle cx="1300" cy="420" r="5" /><circle cx="700" cy="200" r="4" /><circle cx="1450" cy="900" r="5" /></g>
    <g class="symbol" fill="none" stroke="#e6c25a" stroke-width="14" stroke-linecap="round"><circle cx="800" cy="720" r="160" /><path d="M800 520 V920 M700 640 L900 800 M900 640 L700 800" /></g>
    <path class="land" d="M0 1300 Q400 1200 800 1280 T1600 1260 V1600 H0Z" fill="#060b12" />
  </svg>
</template>

<style scoped>
.symbol { animation: prophecy-in var(--beat-duration) ease-out both; transform-origin: 800px 720px; }
.stars { animation: prophecy-stars 3s ease-in-out infinite alternate; }
.land { animation: prophecy-sink var(--beat-duration) linear both; }
@keyframes prophecy-in { from { opacity: 0; transform: scale(0.9); } 40% { opacity: 1; } to { opacity: 1; transform: scale(1.05); } }
@keyframes prophecy-stars { from { opacity: 0.5; } to { opacity: 1; } }
@keyframes prophecy-sink { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(0, 40px, 0); } }
</style>
