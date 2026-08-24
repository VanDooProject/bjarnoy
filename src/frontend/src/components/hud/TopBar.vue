<script setup lang="ts">
import { usePlayerStore } from '../../stores/player';

const player = usePlayerStore();
</script>

<template>
  <header class="topbar">
    <span class="brand">Fjørdhold</span>
    <span v-if="player.nickname" class="nickname pill">{{ player.nickname }}</span>
  </header>
</template>

<style scoped>
.topbar {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}
.brand {
  font-weight: 600;
  font-size: 20px;
  letter-spacing: -0.01em;
  color: var(--text);
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
}
.nickname {
  pointer-events: auto;
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 500;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--gold);
}
</style>
