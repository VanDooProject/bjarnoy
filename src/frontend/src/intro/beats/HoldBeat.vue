<script lang="ts">
import type { BeatMeta } from './types';
// The hold and the landfall are one scene: the coast arrives and the fog closes on the running hold.
// Hold: --loop-period drives the scene's ambient loops; it has no seam, so it can end at any moment.
// Its shortest run is the time to read its narration (the host passes that to the sequencer);
// durationMs is only the fallback for that.
export const meta: BeatMeta = { id: 'hold', role: 'hold', durationMs: 4000, loopMs: 12000, scene: 'longship' };
// Landfall: the fog is solid at 5 s, then the host fades the intro out over 1 s onto the map's fog.
export const landfallMeta: BeatMeta = { id: 'landfall', role: 'exit', durationMs: 6000, scene: 'longship' };
</script>

<script setup lang="ts">
import { computed, inject } from 'vue';
import LongshipScene from './LongshipScene.vue';
import { INTRO_BEAT } from './types';

defineProps<{ paused?: boolean }>();
const beat = inject(INTRO_BEAT, null);
const landfall = computed(() => beat?.value === 'landfall');
</script>

<template>
  <!-- a longship rows through fog; at landfall a coast slides in, the ship rows onto it and the fog closes -->
  <LongshipScene :paused="paused" :landfall="landfall" />
</template>
