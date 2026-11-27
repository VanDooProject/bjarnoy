<script setup lang="ts">
import SimplePageShell from '../components/SimplePageShell.vue';
</script>

<template>
  <SimplePageShell :back-label="$t('common.notFound.home')" data-testid="not-found">
    <h1>{{ $t('common.notFound.title') }}</h1>
    <p>{{ $t('common.notFound.body') }}</p>
  </SimplePageShell>
</template>
