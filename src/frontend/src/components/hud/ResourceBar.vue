<script setup lang="ts">
// Issue #16 "header": resource icons redrawn as hexes (the mockup's
// diamonds), and population wired up as a fifth pill exactly like the other
// four (current/max stock + a rate) instead of being unimplemented — see
// `WorldModel.populationFor` / `stores/world.ts`'s `hud.population`. Each
// pill also carries a cap (`WorldModel.storageCapForDisplay`) and a fill-progress
// underline, matching the reference's "4,965 / 12,000" + green bar.
import { computed } from 'vue';
import { useWorldStore } from '../../stores/world';

const props = defineProps<{
  // Issue #16 "ring menu": dims the resource pills while a ring is open, to
  // match RealmPanel's own disabled look — these aren't interactive, but
  // reads as one consistent "HUD chrome recedes while the ring has focus"
  // rule rather than only RealmPanel changing.
  ringOpen?: boolean;
}>();

const world = useWorldStore();

// Issue #158: each pill's fill track gains a dim reserved segment — the
// stock is not split into two bars, `reserved` is a *portion* of `value`
// already sitting in stock, earmarked for the waiting build queue and
// unspendable elsewhere. Always zero in demo mode (`hud.reserved` never
// changes from its empty default there — see stores/world.ts).
const pills = computed(() => [
  { key: 'wood', color: 'var(--wood)', value: world.hud.resources.wood, rate: world.hud.rates.wood, cap: world.hud.storageCap.wood, reserved: world.hud.reserved.wood },
  { key: 'stone', color: 'var(--stone)', value: world.hud.resources.stone, rate: world.hud.rates.stone, cap: world.hud.storageCap.stone, reserved: world.hud.reserved.stone },
  { key: 'food', color: 'var(--food)', value: world.hud.resources.food, rate: world.hud.rates.food, cap: world.hud.storageCap.food, reserved: world.hud.reserved.food },
  { key: 'iron', color: 'var(--iron)', value: world.hud.resources.iron, rate: world.hud.rates.iron, cap: world.hud.storageCap.iron, reserved: world.hud.reserved.iron },
]);

const population = computed(() => world.hud.population);

function fmt(n: number): string {
  return Math.floor(n).toLocaleString();
}

function fillPct(value: number, cap: number): number {
  return cap > 0 ? Math.min(100, Math.max(0, (value / cap) * 100)) : 0;
}

/**
 * The reserved segment's own left offset and width within the track, as
 * percentages of `cap` — positioned as the trailing (highest-stock) slice of
 * the filled bar: from `(value - reserved) / cap` to `value / cap`. Reserved
 * can never exceed the stock it's carved out of, so this never runs past
 * `fillPct`.
 */
function reservedSegment(value: number, reserved: number, cap: number): { left: number; width: number } {
  if (cap <= 0) return { left: 0, width: 0 };
  const clampedReserved = Math.max(0, Math.min(reserved, value));
  const left = Math.max(0, Math.min(100, ((value - clampedReserved) / cap) * 100));
  const width = Math.max(0, Math.min(100 - left, (clampedReserved / cap) * 100));
  return { left, width };
}
</script>

<template>
  <div class="resource-bar" :class="{ disabled: props.ringOpen }">
    <div v-for="pill in pills" :key="pill.key" class="resource">
      <span class="hex-icon" :style="{ background: pill.color }" />
      <div class="numbers">
        <span class="value">
          {{ fmt(pill.value) }}<span class="cap">/{{ fmt(pill.cap) }}</span>
          <span v-if="pill.reserved > 0" class="reserved-hint">({{ fmt(pill.reserved) }} reserved)</span>
        </span>
        <span class="rate">+{{ Math.round(pill.rate) }}/h</span>
        <span class="fill-track">
          <span class="fill" :style="{ width: fillPct(pill.value, pill.cap) + '%', background: pill.color }" />
          <span
            v-if="pill.reserved > 0"
            class="fill-reserved"
            :style="{
              left: reservedSegment(pill.value, pill.reserved, pill.cap).left + '%',
              width: reservedSegment(pill.value, pill.reserved, pill.cap).width + '%',
            }"
          />
        </span>
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
  transition: opacity 0.15s ease;
}
.resource-bar.disabled {
  opacity: 0.35;
  filter: grayscale(0.7);
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
  position: relative;
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
/* Issue #158: the reserved slice of the fill — the top (highest-stock) edge of the bar, dimmed to read as "in stock but spoken for" rather than freely spendable. */
.fill-reserved {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(0, 0, 0, 0.45);
}
.reserved-hint {
  margin-left: 4px;
  font-weight: 400;
  font-size: 11px;
  color: var(--muted);
}
</style>
