<script setup lang="ts">
// A cost (or refund) as resource icons with white numbers, in one place: training window, ring-menu card.
// Resources that cost 0 are left out. `short` marks the resources the player can't cover (red number).
import { computed } from 'vue';
import { resourceName } from '../i18n/catalogueNames';
import ResourceIcon from './ResourceIcon.vue';

type Key = 'wood' | 'stone' | 'food' | 'iron';
const KEYS: readonly Key[] = ['wood', 'stone', 'food', 'iron'];

const props = withDefaults(
  defineProps<{
    cost: Partial<Record<Key, number>>;
    size?: number;
    short?: Partial<Record<Key, boolean>>;
    /** Round amounts: 'ceil' for what has to be paid, 'floor' for what comes back, none for whole numbers. */
    round?: 'ceil' | 'floor';
  }>(),
  { size: 12, short: () => ({}), round: undefined },
);

const chips = computed(() =>
  KEYS.filter((key) => !!props.cost[key]).map((key) => {
    const raw = props.cost[key]!;
    return {
      key,
      amount: props.round === 'ceil' ? Math.ceil(raw) : props.round === 'floor' ? Math.floor(raw) : raw,
      short: !!props.short[key],
    };
  }),
);
</script>

<template>
  <span class="resource-cost">
    <span v-for="chip in chips" :key="chip.key" class="cost-item" :title="resourceName(chip.key)">
      <ResourceIcon :kind="chip.key" :size="size" />
      <b :class="{ short: chip.short }">{{ chip.amount }}</b>
    </span>
  </span>
</template>

<style scoped>
.resource-cost {
  display: inline-flex;
  vertical-align: middle;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 10px;
}
.cost-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.cost-item b {
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.cost-item b.short {
  color: var(--rival);
}
</style>
