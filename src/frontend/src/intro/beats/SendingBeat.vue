<script lang="ts">
import type { BeatMeta } from './types';
// No silence after the voice: the ravens scene starts as the narration ends and takes over in a long crossfade
// (its fadeInMs), while the sending's camera turn and ship are still moving.
export const meta: BeatMeta = { id: 'sending', role: 'intro', durationMs: 10000, tailMs: 0 };
</script>

<script setup lang="ts">
import SendingScene from './SendingScene.vue';

defineProps<{ paused?: boolean }>();
</script>

<template>
  <!-- the jarl kneels to his son and lets him go; the boy walks down to the water, the longship pulls out -->
  <SendingScene :paused="paused" />
</template>
