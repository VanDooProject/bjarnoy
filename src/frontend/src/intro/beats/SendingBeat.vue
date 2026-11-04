<script lang="ts">
import type { BeatMeta } from './types';
export const meta: BeatMeta = { id: 'sending', role: 'intro', durationMs: 10000 };
</script>

<script setup lang="ts">
import SendingScene from './SendingScene.vue';

defineProps<{ paused?: boolean }>();
</script>

<template>
  <!-- the jarl kneels to his son and lets him go; the boy walks down to the water, the longship pulls out -->
  <SendingScene :paused="paused" />
</template>
