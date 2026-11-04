<script lang="ts">
import type { BeatMeta } from './types';
export const meta: BeatMeta = { id: 'sending', role: 'intro', durationMs: 5000 };
</script>

<script setup lang="ts">
defineProps<{ paused?: boolean }>();
</script>

<template>
  <svg class="intro-beat" :class="{ 'is-paused': paused }" viewBox="0 0 1600 1600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="1600" height="1600" fill="#2a1c1c" />
    <rect x="350" y="350" width="900" height="900" class="intro-safe" />
    <rect y="1150" width="1600" height="450" fill="#1a1010" />
    <g class="jarl"><path d="M480 1300 V700 Q540 560 600 700 V1300Z" fill="#07040a" /><circle cx="540" cy="620" r="70" fill="#07040a" /></g>
    <g class="son"><path d="M1000 1300 V1040 Q1030 980 1060 1040 V1300Z" fill="#07040a" /><circle cx="1030" cy="975" r="34" fill="#07040a" /></g>
    <rect class="light" x="1250" y="350" width="40" height="900" fill="#f0c070" />
  </svg>
</template>

<style scoped>
.jarl { animation: sending-lean var(--beat-duration) ease-in-out both; transform-origin: 540px 1300px; }
.son { animation: sending-step var(--beat-duration) ease-in-out both; }
.light { opacity: 0.25; animation: sending-light var(--beat-duration) linear both; }
@keyframes sending-lean { from { transform: rotate(0); } to { transform: rotate(2deg); } }
@keyframes sending-step { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(120px, 0, 0); } }
@keyframes sending-light { from { opacity: 0; } to { opacity: 0.35; } }
</style>
