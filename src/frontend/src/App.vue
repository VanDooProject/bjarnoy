<script setup lang="ts">
import AccountRestrictedBanner from './components/AccountRestrictedBanner.vue';
import DemoModeBadge from './components/DemoModeBadge.vue';
import { useActivityHeartbeat } from './composables/useActivityHeartbeat';

// Mounted once, app-wide: it no-ops of its own accord (via authStore.isAuthenticated)
// for anonymous visitors, so it's safe to run on every view rather than only
// some authenticated-only shell — this app has no such shell separate from
// App.vue itself.
useActivityHeartbeat();
</script>

<template>
  <AccountRestrictedBanner />
  <DemoModeBadge />
  <router-view />
</template>
