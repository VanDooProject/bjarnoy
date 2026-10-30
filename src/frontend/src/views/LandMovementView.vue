<script setup lang="ts">
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
// Placeholder page: title and lede only, the content follows in a later pass.
</script>

<template>
  <DocsPageLayout class="land-movement" :title="$t('docs.landMovement.title')" caption="DOCS · LAND MOVEMENT" :intro="$t('docs.landMovement.intro')">
    <p class="placeholder">{{ $t('docs.landMovement.placeholder') }}</p>
  </DocsPageLayout>
</template>

<style scoped>
.placeholder {
  color: var(--muted);
  line-height: 1.6;
}
</style>
