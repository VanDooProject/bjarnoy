<script setup lang="ts">
// "Join another world" (UI half — store/API already landed, see
// stores/world.ts's `joinWorld` and api/client.ts's `listJoinableWorlds`/
// `getWorldMembership`). Reachable from ReturningPlayerMenu.vue, anonymous
// or logged in alike (see router/index.ts — no `requiresAuth`): an
// anonymous visitor already has a stable local id (stores/player.ts) they
// can found a new realm under, or already hold a realm under, in any world.
// The list-fetching-and-rendering logic itself now lives in
// components/hud/WorldList.vue (shared with ReturningPlayerMenu.vue's
// dropdown) — this view is just the page chrome around it.
import { useI18n } from 'vue-i18n';
import TopBar from '../components/hud/TopBar.vue';
import LocaleSwitcher from '../components/LocaleSwitcher.vue';
import WorldList from '../components/hud/WorldList.vue';
import { useAuthStore } from '../stores/auth';
import type { MessageSchema } from '../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const auth = useAuthStore();
</script>

<template>
  <div class="world-picker">
    <TopBar docked title="Bjarnoy">
      <LocaleSwitcher />
    </TopBar>

    <main class="content">
      <div class="head">
        <h1>{{ t('worlds.title') }}</h1>
        <p class="lede">{{ t('worlds.lede') }}</p>
      </div>

      <div class="panel list">
        <WorldList />
      </div>

      <p v-if="!auth.isAuthenticated" class="login-nudge">{{ t('worlds.loginNudge') }}</p>
    </main>
  </div>
</template>

<style scoped>
.world-picker {
  width: 100%;
  height: 100vh;
  overflow: auto;
  background: var(--shell);
}
.content {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 20px 60px;
}
.head h1 {
  margin: 0;
  font-size: 28px;
  color: var(--text);
}
.lede {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
}
.list {
  margin-top: 28px;
  padding: 8px;
}
.login-nudge {
  margin: 18px 4px 0;
  color: var(--muted);
  font-size: 13px;
}
</style>
