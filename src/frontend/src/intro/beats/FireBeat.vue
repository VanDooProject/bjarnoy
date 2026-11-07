<script lang="ts">
import type { BeatMeta } from './types';
export const meta: BeatMeta = { id: 'fire', role: 'intro', durationMs: 6000 };
</script>

<script setup lang="ts">
import HallScene from './HallScene.vue';

defineProps<{ paused?: boolean; held?: boolean }>();
</script>

<template>
  <!-- the lit hall (behind the landing page); on play the fire sinks, the camera turns towards it and it relights -->
  <HallScene beat="fire" :paused="paused" :held="held" />
</template>
