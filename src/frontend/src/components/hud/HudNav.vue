<script setup lang="ts">
// Issue #16 "header": "nav links WORLD MAP / REPORTS / ALLIANCE, and a
// round avatar badge" — World map is the one nav destination that actually
// exists today; Reports and Alliance have no feature behind them yet, so
// they render as disabled placeholders (visually matching the mockup)
// rather than linking somewhere fake. The avatar carries the player's
// nickname initials (or the game's own initials as a fallback), replacing
// the plain nickname pill TopBar used to show.
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { usePlayerStore } from '../../stores/player';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const player = usePlayerStore();

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
    <button class="link disabled" type="button" disabled title="Not implemented yet">Reports</button>
    <button class="link disabled" type="button" disabled title="Not implemented yet">Alliance</button>
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
