<script setup lang="ts">
import { computed, useId } from 'vue';
import { RESOURCE_GLYPHS, RESOURCE_TOKENS, type ResourceKind } from '../lib/resources/resourceGlyphs';

/**
 * The pictogram of one resource (or population). The single place every
 * surface draws a resource icon: header, ring-menu costs, quest rewards.
 */
const props = withDefaults(defineProps<{ kind: ResourceKind; size?: number }>(), { size: 16 });

// The iron glyph carries an svg <mask>; ids are document-global, so each
// instance gets its own.
const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
const markup = computed(() => RESOURCE_GLYPHS[props.kind].replaceAll('{mask}', `res-mask-${uid}`));
const fill = computed(() => RESOURCE_TOKENS[props.kind]);
</script>

<template>
  <svg
    class="resource-icon"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    :fill="fill"
    aria-hidden="true"
    focusable="false"
    v-html="markup"
  />
</template>

<style scoped>
.resource-icon {
  flex: none;
  display: block;
}
</style>
