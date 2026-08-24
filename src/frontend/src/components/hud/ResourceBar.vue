<script setup lang="ts">
import { computed } from 'vue';
import { useWorldStore } from '../../stores/world';

const world = useWorldStore();

const dots = computed(() => [
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
    <div v-for="dot in dots" :key="dot.key" class="resource">
      <span class="dot" :style="{ background: dot.color }" />
      <span class="value">{{ fmt(dot.value) }}</span>
      <span class="rate">+{{ Math.round(dot.rate) }}/h</span>
    </div>
  </div>
</template>

<style scoped>
.resource-bar {
  position: absolute;
  top: 16px;
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
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  align-self: center;
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
