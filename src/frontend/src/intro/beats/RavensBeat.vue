<script lang="ts">
import type { BeatMeta } from './types';
// It ends on pale moonlight, which the host crossfades into the hold's pale fog.
// It comes in over the sending's last camera turn in a long crossfade (the ship stays one: see RavensScene).
export const meta: BeatMeta = { id: 'ravens', role: 'intro', durationMs: 6000, fadeInMs: 1800 };
</script>

<script setup lang="ts">
import RavensScene from './RavensScene.vue';

defineProps<{ paused?: boolean }>();
</script>

<template>
  <!-- the ravens fly home under the moon; a giant sleeps under the sea; the scene pushes into the moon -->
  <RavensScene :paused="paused" />
</template>
