<script setup lang="ts">
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
// Placeholder page: title and lede only, the content follows in a later pass.
</script>

<template>
  <DocsPageLayout class="founding" :title="$t('docs.founding.title')" caption="DOCS · FOUNDING" :intro="$t('docs.founding.intro')">
    <p class="placeholder">{{ $t('docs.founding.placeholder') }}</p>
  </DocsPageLayout>
</template>

<style scoped>
.placeholder {
  color: var(--muted);
  line-height: 1.6;
}
</style>
