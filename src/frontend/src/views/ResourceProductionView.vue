<script setup lang="ts">
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
// Placeholder page: title and lede only, the content follows in a later pass.
</script>

<template>
  <DocsPageLayout class="production" :title="$t('docs.production.title')" caption="DOCS · PRODUCTION" :intro="$t('docs.production.intro')">
    <p class="placeholder">{{ $t('docs.production.placeholder') }}</p>
  </DocsPageLayout>
</template>

<style scoped>
.placeholder {
  color: var(--muted);
  line-height: 1.6;
}
</style>
