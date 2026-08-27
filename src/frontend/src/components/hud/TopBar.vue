<script setup lang="ts">
// issue #16 header: yellow hex logo, game name "Bjarnøy" as the headline,
// the settlement's own name as a subheadline underneath — shown in both the
// settlement and world-map views (both mount this component).
import { usePlayerStore } from '../../stores/player';
import { useWorldStore } from '../../stores/world';

const player = usePlayerStore();
const world = useWorldStore();
</script>

<template>
  <header class="topbar">
    <span class="logo hex" />
    <span class="wordmark">
      <span class="brand">Bjarnøy</span>
      <span v-if="world.hud.settlementName" class="settlement-name">{{ world.hud.settlementName }}</span>
    </span>
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
.logo {
  width: 26px;
  height: 26px;
  flex: none;
  background: linear-gradient(155deg, var(--gold) 0%, #d99a30 100%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.wordmark {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.brand {
  font-weight: 600;
  font-size: 20px;
  letter-spacing: -0.01em;
  color: var(--text);
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
}
.settlement-name {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--gold);
}
.nickname {
  pointer-events: auto;
  margin-left: 6px;
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 500;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--gold);
}
</style>
