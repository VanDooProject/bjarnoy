<script setup lang="ts">
// Issue #16 "header": "nav links WORLD MAP / REPORTS / ALLIANCE, and a
// round avatar badge" — World map is the one nav destination that actually
// exists today; Reports and Alliance have no feature behind them yet, so
// they render as disabled placeholders (visually matching the mockup)
// rather than linking somewhere fake. The avatar carries the player's
// nickname initials (or the game's own initials as a fallback), replacing
// the plain nickname pill TopBar used to show.
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { usePlayerStore } from '../../stores/player';
import { useReportsStore } from '../../stores/reports';
import { DEMO_MODE } from '../../config';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const player = usePlayerStore();
const reports = useReportsStore();

// Issue #40 phase 3: a lightweight "new reports" badge. HudNav is mounted
// for as long as TopBar is (settlement/world map views), so its own
// mount/unmount is a reasonable lifetime for the reports store's poll —
// see stores/reports.ts's own comment on why this isn't folded into
// stores/world.ts's poll loop.
function syncPolling() {
  if (!DEMO_MODE && player.settlementId) {
    reports.startPolling(player.settlementId);
  } else {
    reports.stopPolling();
  }
}
onMounted(syncPolling);
onUnmounted(() => reports.stopPolling());
watch(() => player.settlementId, syncPolling);

const initials = computed(() => {
  if (!player.nickname) return 'BJ';
  const parts = player.nickname.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
});
</script>

<template>
  <nav class="hud-nav">
    <button
      v-if="player.hasFoundedSettlement"
      class="link"
      :class="{ active: route.name === 'settlement' }"
      @click="router.push('/settlement')"
    >
      Settlement
    </button>
    <button class="link" :class="{ active: route.name === 'world' }" @click="router.push('/world')">
      World map
    </button>
    <button
      class="link"
      :class="{ active: route.name === 'leaderboards' }"
      @click="router.push('/leaderboards')"
    >
      Leaderboards
    </button>
    <button
      v-if="auth.isAuthenticated"
      class="link"
      :class="{ active: ['messages', 'conversation'].includes(String(route.name)) }"
      @click="router.push('/messages')"
    >
      Messages
    </button>
    <button
      class="link reports-link"
      :class="{ active: String(route.name).startsWith('report') }"
      @click="router.push('/reports')"
    >
      Reports
      <span v-if="reports.unreadCount > 0" class="badge">{{ reports.unreadCount }}</span>
    </button>
    <button class="link disabled" type="button" disabled title="Not implemented yet">Alliance</button>
    <button
      class="link"
      :class="{ active: ['docs', 'tech-tree', 'tile-docs'].includes(String(route.name)) }"
      @click="router.push('/docs')"
    >
      Docs
    </button>
    <button class="link" :class="{ active: route.name === 'landing' }" @click="router.push('/')">
      Landing
    </button>
    <!-- Logged in, the avatar opens the player's own profile (issue #42). -->
    <button
      v-if="auth.isAuthenticated"
      class="avatar avatar-button"
      type="button"
      title="Your profile"
      @click="router.push('/profile')"
    >
      {{ initials }}
    </button>
    <span v-else class="avatar" :title="player.nickname ?? 'Bjarnoy'">{{ initials }}</span>
  </nav>
</template>

<style scoped>
.hud-nav {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: none;
  padding-left: 22px;
  border-left: 1px solid var(--panel-border);
}
.link {
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 0;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-family: inherit;
}
.link:hover {
  color: var(--text);
}
.link.active {
  color: var(--gold);
}
.link.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.reports-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
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
  letter-spacing: 0;
  text-transform: none;
}
.avatar-button {
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
}
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gold);
  color: #20160a;
  font-size: 12px;
  font-weight: 700;
}
</style>
