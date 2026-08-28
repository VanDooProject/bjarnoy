<script setup lang="ts">
// Issue #16 "header": logo is a yellow hex badge for the game's actual name
// (Bjarnoy — this used to read the old placeholder name "Fjørdhold"), and
// the sub headline is the *settlement's* name, not the player's nickname —
// so this now renders in both SettlementView and WorldMapView (see those
// views), reading world.hud.settlementName rather than usePlayerStore.
import { computed } from 'vue';
import { useWorldStore } from '../../stores/world';

const world = useWorldStore();
const settlementName = computed(() => world.hud.settlementName || null);
</script>

<template>
  <header class="topbar">
    <span class="logo-hex" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" />
      </svg>
    </span>
    <div class="titles">
      <span class="brand">Bjarnoy</span>
      <span v-if="settlementName" class="settlement-name">{{ settlementName }}</span>
    </div>
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
  gap: 12px;
  pointer-events: none;
}
.logo-hex {
  width: 34px;
  height: 34px;
  flex: none;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
}
.logo-hex svg {
  width: 100%;
  height: 100%;
}
.logo-hex polygon {
  fill: var(--gold);
  stroke: #20160a;
  stroke-width: 3;
}
.titles {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.brand {
  font-weight: 700;
  font-size: 18px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text);
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
}
.settlement-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}
</style>
