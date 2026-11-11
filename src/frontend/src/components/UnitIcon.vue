<script setup lang="ts">
import { computed } from 'vue';
import { unitGlyph } from '../lib/units/unitGlyphs';

/** The pictogram of one unit type — the one place a compact surface draws a unit icon (the building HUD's rows). */
const props = withDefaults(defineProps<{ unit: string; size?: number }>(), { size: 12 });
const glyph = computed(() => unitGlyph(props.unit));
</script>

<template>
  <svg
    class="unit-icon"
    viewBox="0 0 12 12"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <g v-html="glyph.stroke" />
    <g v-if="glyph.fill" fill="currentColor" stroke="none" v-html="glyph.fill" />
  </svg>
</template>

<style scoped>
.unit-icon {
  flex: none;
  display: block;
}
</style>
