<script setup lang="ts">
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';

// The saga page: the story of the intro in six steps, and the link to watch it again.
const STEPS = [0, 1, 2, 3, 4, 5];
</script>

<template>
  <DocsPageLayout class="saga" :title="$t('docs.saga.title')" caption="DOCS · SAGA" :intro="$t('docs.saga.intro')">
    <ol class="steps" data-testid="saga-steps">
      <li v-for="i in STEPS" :key="i">{{ $t(`docs.saga.steps[${i}]`) }}</li>
    </ol>
    <p class="watch">
      <DocsPageLink to="/docs/saga/replay" data-testid="saga-watch">{{ $t('docs.saga.watch') }}</DocsPageLink>
    </p>
  </DocsPageLayout>
</template>

<style scoped>
.steps {
  margin: 32px 0 0;
  padding-left: 24px;
  line-height: 1.6;
  color: var(--muted);
}
.steps li {
  margin-bottom: 10px;
}
.watch {
  margin: 24px 0 0;
  font-weight: 600;
}
</style>
