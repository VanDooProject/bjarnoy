<script setup lang="ts">
import AccountRestrictedBanner from './components/AccountRestrictedBanner.vue';
import DemoModeBadge from './components/DemoModeBadge.vue';
</script>

<template>
  <AccountRestrictedBanner />
  <DemoModeBadge />
  <router-view />
</template>
