<script setup lang="ts">
import SimplePageShell from '../components/SimplePageShell.vue';
</script>

<template>
  <SimplePageShell :back-label="$t('docs.back')">
    <h1>{{ $t('docs.impressum.title') }}</h1>
    <p>
      {{ $t('docs.impressum.body') }}
    </p>
  </SimplePageShell>
</template>
