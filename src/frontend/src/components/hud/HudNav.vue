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
import { usePlayerStore } from '../../stores/player';

const route = useRoute();
const router = useRouter();
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
  <nav class="hud-nav panel">
    <button
      v-if="player.hasFoundedSettlement"
      class="pill"
      :class="{ active: route.name === 'settlement' }"
      @click="router.push('/settlement')"
    >
      Settlement
    </button>
    <button class="pill" :class="{ active: route.name === 'world' }" @click="router.push('/world')">
      World map
    </button>
    <button class="pill disabled" type="button" disabled title="Not implemented yet">Reports</button>
    <button class="pill disabled" type="button" disabled title="Not implemented yet">Alliance</button>
    <button class="pill" :class="{ active: route.name === 'landing' }" @click="router.push('/')">
      Landing
    </button>
    <span class="avatar" :title="player.nickname ?? 'Bjarnoy'">{{ initials }}</span>
  </nav>
</template>

<style scoped>
.hud-nav {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  display: flex;
  gap: 6px;
  padding: 6px;
}
.pill {
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
}
.pill:hover {
  color: var(--text);
}
.pill.active {
  background: var(--gold);
  color: #20160a;
}
.pill.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gold);
  color: #20160a;
  font-size: 12px;
  font-weight: 700;
  margin-left: 4px;
}
</style>
