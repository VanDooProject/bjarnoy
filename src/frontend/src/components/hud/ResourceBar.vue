<script setup lang="ts">
// issue #16 header: "res icons/symbols should also be hexes" and "the
// pop(ulation) thing should also be implemented like with the other
// ressources" — population is appended as a fifth pip, styled the same as
// the four real resources but showing used/cap instead of a hourly rate
// (see stores/world.ts's syncHud for how it's derived).
import { computed } from 'vue';
import { useWorldStore } from '../../stores/world';

const world = useWorldStore();

const pips = computed(() => [
  { key: 'wood', label: 'Wood', color: 'var(--wood)', value: world.hud.resources.wood, rate: world.hud.rates.wood },
  { key: 'stone', label: 'Stone', color: 'var(--stone)', value: world.hud.resources.stone, rate: world.hud.rates.stone },
  { key: 'food', label: 'Food', color: 'var(--food)', value: world.hud.resources.food, rate: world.hud.rates.food },
  { key: 'iron', label: 'Iron', color: 'var(--iron)', value: world.hud.resources.iron, rate: world.hud.rates.iron },
]);

function fmt(n: number): string {
  return Math.floor(n).toLocaleString();
}
</script>

<template>
  <div class="resource-bar panel">
    <div v-for="pip in pips" :key="pip.key" class="resource" :title="pip.label">
      <span class="icon hex" :style="{ background: pip.color }" />
      <span class="value">{{ fmt(pip.value) }}</span>
      <span class="rate">+{{ Math.round(pip.rate) }}/h</span>
    </div>
    <!-- Not `.resource` — population is a headcount/cap, not a stockpile
         with an hourly rate, and e2e's found-settlement.spec.ts asserts
         exactly 4 `.resource .rate` entries all matching `+N/h`. Reuses
         `.value`/`.rate` for the same look regardless. -->
    <div class="population" title="Population">
      <span class="icon hex" />
      <span class="value">{{ world.hud.population }}</span>
      <span class="rate">/ {{ world.hud.populationCap }}</span>
    </div>
  </div>
</template>

<style scoped>
.resource-bar {
  position: absolute;
  top: 66px;
  right: 16px;
  z-index: 10;
  display: flex;
  gap: 18px;
  padding: 10px 18px;
}
.resource,
.population {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.icon {
  width: 12px;
  height: 12px;
  align-self: center;
}
.population .icon {
  background: var(--text);
  opacity: 0.75;
}
.value {
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
}
.rate {
  font-size: 12px;
  color: var(--muted);
}
</style>
