<script setup lang="ts">
// One army in the armies list, two lines: its unit chips with the next event on the right, and the thin time line under
// them. The whole row is one button; the parent decides what a click does. Desktop panel and phone drawer share it
// (`touch` makes it taller, with a chevron that says it opens the detail).
import { computed } from 'vue';
import type { ArmyRow } from '../../composables/useArmyRows';
import ArmyTimelineBar from './ArmyTimelineBar.vue';
import UnitIcon from '../UnitIcon.vue';
import { unitName } from '../../i18n/catalogueNames';

const props = withDefaults(defineProps<{ row: ArmyRow; touch?: boolean }>(), { touch: false });
const label = computed(() => `${props.row.composition}, ${props.row.eta ?? props.row.status}`);
</script>

<template>
  <button
    type="button"
    class="army-row-head"
    :class="[`tone-${row.tone}`, { 'is-touch': touch }]"
    :aria-label="label"
    :aria-expanded="row.selected"
    data-testid="army-row-head"
  >
    <span class="army-row-top">
      <span class="army-units">
        <span v-for="stack in row.stacks" :key="stack.unit" class="army-unit" :title="unitName(stack.unit)">
          <UnitIcon :unit="stack.unit" :size="touch ? 16 : 14" />{{ stack.count }}
        </span>
      </span>
      <span class="army-row-time" data-testid="army-row-time">{{ row.eta ?? row.status }}</span>
      <svg v-if="touch" class="army-row-chevron" width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
        <path d="M4.5 2.5 8 6l-3.5 3.5" />
      </svg>
    </span>
    <ArmyTimelineBar v-if="row.timeline" :timeline="row.timeline" :touch="touch" />
  </button>
</template>

<style scoped>
.army-row-head {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 100%;
  padding: 8px 0 9px;
  background: transparent;
  border: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  /* no browser double-tap zoom delay: a double tap on the desktop row is read in useArmyRowTap */
  touch-action: manipulation;
}
.army-row-head.is-touch {
  min-height: 56px;
  gap: 7px;
  padding: 0;
}
.army-row-top {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  font-weight: 600;
}
.is-touch .army-row-top {
  gap: 10px;
  font-size: 15px;
}
.army-units {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 9px;
  align-items: center;
}
.army-unit {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}
.army-row-time {
  margin-left: auto;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.tone-march .army-row-time {
  color: var(--army-march-text);
}
.tone-stranded .army-row-time {
  color: var(--army-stranded-text);
}
.tone-support .army-row-time {
  color: var(--army-support-text);
}
.tone-return {
  color: var(--army-home-text);
}
.army-row-chevron {
  flex: none;
  margin-left: 6px;
  color: var(--muted);
}
</style>
