<script setup lang="ts">
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
// Placeholder page: title and lede only, the content follows in a later pass.
</script>

<template>
  <DocsPageLayout class="ships" :title="$t('docs.ships.title')" caption="DOCS · SHIPS" :intro="$t('docs.ships.intro')">
    <p class="placeholder">{{ $t('docs.ships.placeholder') }}</p>
  </DocsPageLayout>
</template>

<style scoped>
.placeholder {
  color: var(--muted);
  line-height: 1.6;
}
</style>
