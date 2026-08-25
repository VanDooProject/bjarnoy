<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { usePlayerStore } from '../../stores/player';

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
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
    <button class="pill" :class="{ active: route.name === 'landing' }" @click="router.push('/')">
      Landing
    </button>
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
</style>
