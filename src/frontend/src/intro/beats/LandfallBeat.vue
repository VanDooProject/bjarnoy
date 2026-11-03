<script lang="ts">
import { FOG_UNEXPLORED_CSS } from '../../lib/map/fogColours';
import type { BeatMeta } from './types';
export const meta: BeatMeta = { id: 'landfall', role: 'exit', durationMs: 2500 };
</script>

<script setup lang="ts">
defineProps<{ paused?: boolean }>();
</script>

<template>
  <svg class="intro-beat" :class="{ 'is-paused': paused }" viewBox="0 0 1600 1600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="1600" height="1600" fill="#5b7a8c" />
    <rect x="350" y="350" width="900" height="900" class="intro-safe" />
    <g class="shore"><path d="M-100 1100 Q300 900 700 1000 Q1100 800 1700 1050 V1700 H-100Z" fill="#26402c" /><path d="M-100 1250 Q400 1100 900 1200 T1700 1200 V1700 H-100Z" fill="#17291c" /></g>
    <rect class="intro-fog intro-drift-mid" x="-512" y="800" width="2700" height="600" opacity="0.7" />
    <rect class="cover" width="1600" height="1600" :fill="FOG_UNEXPLORED_CSS" />
  </svg>
</template>

<style scoped>
.shore { animation: landfall-rise var(--beat-duration) ease-out both; }
.cover { opacity: 0; animation: landfall-cover var(--beat-duration) ease-in both; }
@keyframes landfall-rise { from { transform: translate3d(0, 300px, 0); } to { transform: translate3d(0, 0, 0); } }
@keyframes landfall-cover { 0%, 55% { opacity: 0; } 100% { opacity: 1; } }
</style>
