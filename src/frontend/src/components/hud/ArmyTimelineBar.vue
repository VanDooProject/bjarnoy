<script setup lang="ts">
// The bar of an army's trip (see lib/units/armyTimeline.ts): the legs as coloured sections, the part already behind the
// army dimmed, a gold tick at "now". One component for the thin row bar and the full detail bar, on desktop and phone.
import type { ArmyTimeline } from '../../lib/units/armyTimeline';

withDefaults(defineProps<{ timeline: ArmyTimeline; size?: 'thin' | 'full'; touch?: boolean }>(), {
  size: 'thin',
  touch: false,
});
</script>

<template>
  <div class="army-bar" :class="[`is-${size}`, { 'is-touch': touch }]" data-testid="army-timeline-bar" aria-hidden="true">
    <div
      v-for="(section, i) in timeline.sections"
      :key="i"
      class="army-bar-section"
      :class="`kind-${section.kind}`"
      :style="{ flexBasis: `${section.fraction * 100}%` }"
    />
    <div v-if="timeline.endMark" class="army-bar-end" />
    <template v-if="timeline.nowFraction !== null">
      <div class="army-bar-past" :style="{ width: `${timeline.nowFraction * 100}%` }" />
      <div class="army-bar-now" :style="{ left: `${timeline.nowFraction * 100}%` }" />
    </template>
  </div>
</template>

<style scoped>
.army-bar {
  position: relative;
  display: flex;
  height: 3px;
}
.army-bar.is-thin.is-touch {
  height: 4px;
}
.army-bar.is-full {
  height: 10px;
}
.army-bar.is-full.is-touch {
  height: 12px;
}
.army-bar-section {
  flex-grow: 0;
  flex-shrink: 0;
}
.kind-march {
  background: var(--army-march);
}
.kind-spare {
  background: var(--food);
}
.kind-wayHome {
  background: var(--army-way-home);
}
.kind-starving {
  background: var(--rival);
}
.kind-camp {
  background: var(--gold);
}
.kind-waiting {
  background: var(--army-waiting);
}
.kind-supporting {
  flex-grow: 1;
  background: repeating-linear-gradient(90deg, var(--army-support) 0 4px, var(--army-support-faint) 4px 8px);
}
.army-bar-end {
  position: absolute;
  top: -2px;
  bottom: -2px;
  right: 0;
  width: 2px;
  background: var(--rival);
}
.army-bar-past {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--army-past);
}
.army-bar-now {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  margin-left: -1px;
  background: var(--gold);
}
.army-bar.is-touch .army-bar-now {
  top: -4px;
  bottom: -4px;
}
</style>
