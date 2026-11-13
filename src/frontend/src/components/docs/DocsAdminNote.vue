<script setup lang="ts">
import DocsNote from './DocsNote.vue';

// Technical or admin-only docs content: rendered only for an admin who has
// switched "Show admin notes" on in the docs page header. Players never see it.
withDefaults(defineProps<{ as?: 'div' | 'section' }>(), { as: 'div' });
</script>

<template>
  <DocsNote kind="admin" :as="as"><slot /></DocsNote>
</template>
