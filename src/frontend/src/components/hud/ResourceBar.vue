<script setup lang="ts">
// Issue #16 "header": resource icons redrawn as hexes (the mockup's
// diamonds), and population wired up as a fifth pill exactly like the other
// four (current/max stock + a rate) instead of being unimplemented — see
// `WorldModel.populationFor` / `stores/world.ts`'s `hud.population`. Each
// pill also carries a cap (`WorldModel.storageCapFor`) and a fill-progress
// underline, matching the reference's "4,965 / 12,000" + green bar.
import { computed } from 'vue';
import { useWorldStore } from '../../stores/world';

const world = useWorldStore();

const pills = computed(() => [
  { key: 'wood', color: 'var(--wood)', value: world.hud.resources.wood, rate: world.hud.rates.wood, cap: world.hud.storageCap.wood },
  { key: 'stone', color: 'var(--stone)', value: world.hud.resources.stone, rate: world.hud.rates.stone, cap: world.hud.storageCap.stone },
  { key: 'food', color: 'var(--food)', value: world.hud.resources.food, rate: world.hud.rates.food, cap: world.hud.storageCap.food },
  { key: 'iron', color: 'var(--iron)', value: world.hud.resources.iron, rate: world.hud.rates.iron, cap: world.hud.storageCap.iron },
]);

const population = computed(() => world.hud.population);

function fmt(n: number): string {
  return Math.floor(n).toLocaleString();
}

function fillPct(value: number, cap: number): number {
  return cap > 0 ? Math.min(100, Math.max(0, (value / cap) * 100)) : 0;
}
</script>

<template>
  <div class="resource-bar">
    <div v-for="pill in pills" :key="pill.key" class="resource">
      <span class="hex-icon" :style="{ background: pill.color }" />
      <div class="numbers">
        <span class="value">{{ fmt(pill.value) }}<span class="cap">/{{ fmt(pill.cap) }}</span></span>
        <span class="rate">+{{ Math.round(pill.rate) }}/h</span>
        <span class="fill-track"><span class="fill" :style="{ width: fillPct(pill.value, pill.cap) + '%', background: pill.color }" /></span>
      </div>
    </div>
    <div v-if="population.max > 0" class="resource population">
      <span class="hex-icon" style="background: var(--pop, #7fb3d5)" />
      <div class="numbers">
        <span class="value">{{ fmt(population.current) }}<span class="cap">/{{ fmt(population.max) }}</span></span>
        <span class="rate">+{{ Math.round(population.rate) }}/h</span>
        <span class="fill-track"><span class="fill" :style="{ width: fillPct(population.current, population.max) + '%', background: 'var(--pop, #7fb3d5)' }" /></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resource-bar {
  display: flex;
  align-items: center;
  gap: 22px;
  flex: none;
}
.resource {
  display: flex;
  align-items: center;
  gap: 7px;
}
.resource + .resource {
  padding-left: 22px;
  border-left: 1px solid var(--panel-border);
}
.hex-icon {
  width: 13px;
  height: 13px;
  flex: none;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
.numbers {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.value {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}
.cap {
  font-weight: 400;
  color: var(--muted);
}
.rate {
  font-size: 11px;
  color: var(--food);
}
.fill-track {
  margin-top: 3px;
  width: 100%;
  min-width: 64px;
  height: 3px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  border-radius: 2px;
}
</style>
