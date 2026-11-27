<script setup lang="ts">
import { RouterLink } from 'vue-router';
import LocaleSwitcher from './LocaleSwitcher.vue';

/** Plain text page (Impressum, not-found): brand top bar, content slot, one link back to the start. */
defineProps<{ backLabel: string }>();
</script>

<template>
  <div class="simple-page">
    <header class="topbar">
      <span class="brand">{{ $t('common.brand.name') }}</span>
      <LocaleSwitcher />
    </header>
    <main class="body">
      <slot />
      <RouterLink class="back" to="/">{{ backLabel }}</RouterLink>
    </main>
  </div>
</template>

<style scoped>
.simple-page {
  width: 100vw;
  height: 100vh;
  /* Mobile-readiness audit: 100dvh tracks mobile Safari's real visible
     viewport, as a progressive enhancement over the 100vh above. */
  height: 100dvh;
  overflow: auto;
  background: var(--shell);
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
}
.brand {
  font-weight: 600;
  font-size: 20px;
  color: var(--text);
}
.body {
  max-width: 60ch;
  margin: 0 auto;
  padding: 24px 28px 60px;
  color: var(--text);
}
.body :slotted(p) {
  color: var(--muted);
  line-height: 1.6;
}
.back {
  display: inline-block;
  margin-top: 12px;
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  text-decoration: none;
}
.back:hover {
  border-color: var(--gold);
  color: var(--gold);
}
</style>
