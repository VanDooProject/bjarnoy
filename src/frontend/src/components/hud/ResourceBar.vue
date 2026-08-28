<script setup lang="ts">
// Issue #16 "header": resource icons redrawn as hexes (the mockup's
// diamonds), and population wired up as a fifth pill exactly like the other
// four (current/max stock + a rate) instead of being unimplemented — see
// `WorldModel.populationFor` / `stores/world.ts`'s `hud.population`.
import { computed } from 'vue';
import { useWorldStore } from '../../stores/world';

const world = useWorldStore();

const pills = computed(() => [
  { key: 'wood', label: 'Wood', color: 'var(--wood)', value: world.hud.resources.wood, rate: world.hud.rates.wood },
  { key: 'stone', label: 'Stone', color: 'var(--stone)', value: world.hud.resources.stone, rate: world.hud.rates.stone },
  { key: 'food', label: 'Food', color: 'var(--food)', value: world.hud.resources.food, rate: world.hud.rates.food },
  { key: 'iron', label: 'Iron', color: 'var(--iron)', value: world.hud.resources.iron, rate: world.hud.rates.iron },
]);

const population = computed(() => world.hud.population);

function fmt(n: number): string {
  return Math.floor(n).toLocaleString();
}
</script>

<template>
  <div class="resource-bar panel">
    <div v-for="pill in pills" :key="pill.key" class="resource">
      <span class="hex-icon" :style="{ background: pill.color }" />
      <span class="value">{{ fmt(pill.value) }}</span>
      <span class="rate">+{{ Math.round(pill.rate) }}/h</span>
    </div>
    <div v-if="population.max > 0" class="resource population">
      <span class="hex-icon" style="background: var(--pop, #7fb3d5)" />
      <span class="value">{{ fmt(population.current) }}/{{ fmt(population.max) }}</span>
      <span class="rate">+{{ Math.round(population.rate) }}/h</span>
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
.resource {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.hex-icon {
  width: 12px;
  height: 12px;
  align-self: center;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
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
.population {
  padding-left: 18px;
  border-left: 1px solid var(--panel-border);
}
</style>
