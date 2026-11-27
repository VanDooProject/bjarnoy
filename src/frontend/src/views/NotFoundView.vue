<script setup lang="ts">
import { RouterLink } from 'vue-router';
import LocaleSwitcher from '../components/LocaleSwitcher.vue';
</script>

<template>
  <div class="not-found">
    <header class="topbar">
      <span class="brand">{{ $t('common.brand.name') }}</span>
      <LocaleSwitcher />
    </header>
    <main class="body" data-testid="not-found">
      <h1>{{ $t('common.notFound.title') }}</h1>
      <p>{{ $t('common.notFound.body') }}</p>
      <RouterLink class="home" to="/">{{ $t('common.notFound.home') }}</RouterLink>
    </main>
  </div>
</template>

<style scoped>
.not-found {
  width: 100vw;
  height: 100vh;
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
.body p {
  color: var(--muted);
  line-height: 1.6;
}
.home {
  display: inline-block;
  margin-top: 12px;
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  text-decoration: none;
}
.home:hover {
  border-color: var(--gold);
  color: var(--gold);
}
</style>
