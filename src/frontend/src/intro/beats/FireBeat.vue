<script lang="ts">
import type { BeatMeta } from './types';
export const meta: BeatMeta = { id: 'fire', role: 'intro', durationMs: 6000 };
</script>

<script setup lang="ts">
import HallScene from './HallScene.vue';

defineProps<{ paused?: boolean }>();
</script>

<template>
  <!-- black hall, a spark, the longfire catches and the skald appears in its light -->
  <HallScene beat="fire" :paused="paused" />
</template>
