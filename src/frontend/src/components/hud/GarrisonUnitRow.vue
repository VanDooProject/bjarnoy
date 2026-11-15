<script setup lang="ts">
// One unit row of the garrison list: name | count | food per hour. Used by GarrisonList.vue for the
// own units and by GuestList.vue for a guest army's units, so both look and behave the same. The
// food column is a third grid column that is 0 wide until the list around it (`.garrison-list`)
// is hovered with a mouse or has its rates shown (tap on the Upkeep line); name and count keep
// their place either way.
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';

defineProps<{ label: string; count: number; foodPerHour: number }>();
const { t, n } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
</script>

<template>
  <div class="garrison-row">
    <span class="garrison-name">{{ label }}</span>
    <span class="garrison-count">{{ count }}</span>
    <span class="food-rate">{{ t('hud.trainingQueue.foodPerHour', { amount: n(foodPerHour, 'integer') }) }}</span>
  </div>
</template>

<style scoped>
.garrison-row {
  display: grid;
  grid-template-columns: 1fr auto 0;
  column-gap: 8px;
  align-items: baseline;
  font-size: 13px;
  transition: grid-template-columns 160ms ease;
}
.garrison-name {
  color: var(--text);
}
.garrison-count {
  color: var(--gold);
  font-weight: 600;
}
.food-rate {
  overflow: hidden;
  opacity: 0;
  text-align: right;
  white-space: nowrap;
  font-size: 11px;
  color: var(--food);
  transition: opacity 160ms ease;
}
html[data-hud-motion='reduced'] .garrison-row,
html[data-hud-motion='reduced'] .food-rate {
  transition: none;
}
</style>
