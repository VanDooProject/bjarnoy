<script setup lang="ts">
// Content for the mobile-only pull-down drawer (see TopBar.vue's `drawer`
// slot / composables/useHudDrawer.ts): the nav links HudNav shows inline on
// desktop but has no room for on mobile. Mirrors HudNav.vue's own link
// list/visibility rules rather than importing HudNav itself — HudNav is
// desktop chrome living inside the collapsed bar (out of scope to
// restructure here), this is a second, mobile-only surface for the same
// destinations.
//
// The resource list used to live here too, duplicating ResourceBar's own
// pills still visible in the collapsed bar above — wasted space for the
// same numbers twice. ResourceBar.vue's pills expand in place instead once
// the drawer opens (see its `isExpanded`), so this only needs the links.
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { usePlayerStore } from '../../stores/player';
import { useReportsStore } from '../../stores/reports';
import type { MessageSchema } from '../../i18n/schema';
import LocaleSwitcher from '../LocaleSwitcher.vue';

const emit = defineEmits<{ close: [] }>();

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const player = usePlayerStore();
const reports = useReportsStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

function go(path: string) {
  router.push(path);
  emit('close');
}
</script>

<template>
  <nav class="drawer-links">
    <button v-if="player.hasFoundedSettlement" class="link" :class="{ active: route.name === 'settlement' }" @click="go('/settlement')">
      {{ t('hud.nav.settlement') }}
    </button>
    <button
      v-if="auth.isAuthenticated && player.hasFoundedSettlement"
      class="link"
      :class="{ active: route.name === 'world' }"
      @click="go('/world')"
    >
      {{ t('hud.nav.worldMap') }}
    </button>
    <button v-if="auth.isAuthenticated" class="link" :class="{ active: route.name === 'leaderboards' }" @click="go('/leaderboards')">
      {{ t('hud.nav.leaderboards') }}
    </button>
    <button
      v-if="auth.isAuthenticated"
      class="link"
      :class="{ active: ['messages', 'conversation'].includes(String(route.name)) }"
      @click="go('/messages')"
    >
      {{ t('hud.nav.messages') }}
    </button>
    <button class="link" :class="{ active: String(route.name).startsWith('report') }" @click="go('/reports')">
      {{ t('hud.nav.reports') }}
      <span v-if="reports.unreadCount > 0" class="badge">{{ reports.unreadCount }}</span>
    </button>
    <button class="link" :class="{ active: route.name === 'guild' }" @click="go('/guild')">
      {{ t('hud.nav.alliance') }}
    </button>
    <button class="link" :class="{ active: ['docs', 'tech-tree', 'tile-docs'].includes(String(route.name)) }" @click="go('/docs')">
      {{ t('hud.nav.docs') }}
    </button>
    <!-- Mirrors HudNav.vue's own landing self-link rule: hidden on the
         landing route itself rather than offering a click to nowhere
         (finding #8 — this drawer is now shared by every page that shows
         HudNav, docs pages included, which previously had no way back
         "home" at all on a phone). -->
    <button v-if="route.name !== 'landing'" class="link" @click="go('/')">
      {{ t('hud.nav.landing') }}
    </button>
    <!-- The language switcher's only home at phone width — see
         LocaleSwitcher.vue's own comment on why no bar carries it there. -->
    <div class="drawer-locale">
      <LocaleSwitcher in-drawer />
    </div>
  </nav>
</template>

<style scoped>
.drawer-links {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.link {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 10px 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-align: left;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}
.drawer-locale {
  padding: 10px 4px 4px;
  border-top: 1px solid var(--panel-border);
  margin-top: 4px;
}
.link.active {
  color: var(--gold);
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 8px;
  background: #e08a8a;
  color: #20160a;
  font-size: 10px;
  font-weight: 800;
}
</style>
