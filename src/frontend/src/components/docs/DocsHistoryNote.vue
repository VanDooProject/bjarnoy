<script setup lang="ts">
import DocsNote from './DocsNote.vue';

// Historical background of a unit or building: rendered only for an admin who has switched
// "Show history" on in the docs page header.
withDefaults(defineProps<{ as?: 'div' | 'section' }>(), { as: 'div' });
</script>

<template>
  <DocsNote kind="history" :as="as"><slot /></DocsNote>
</template>
