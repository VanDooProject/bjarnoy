<script setup lang="ts">
// The troop slots of a dispatch that includes ships: what the land units aboard need against what the ships offer. Shared
// by the desktop panel (ArmyPanel.vue) and the phone sheet (MobileDispatchSheet.vue); the same check blocks sending there
// (`exceedsShipCapacity`), mirroring the backend's `InsufficientShipCapacity`. Nothing shows for a land army.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import type { MessageSchema } from '../../i18n/schema';
import { shipSlotUsage } from '../../lib/units/armyDispatch';

const props = defineProps<{ unitCounts: Record<string, number> }>();

const catalogue = useUnitCatalogueStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const usage = computed(() => shipSlotUsage(props.unitCounts, catalogue.byType));
const over = computed(() => !!usage.value && usage.value.needed > usage.value.offered);
</script>

<template>
  <!-- The wrapper always renders and keeps room for both lines, so picking the first ship (0 of N used) or tipping into
       "over" never moves the fields below it. -->
  <div class="dispatch-slots-slot">
    <div v-if="usage" class="dispatch-slots" :class="{ over }" data-testid="ship-slots">
      <p class="slots-line">{{ t('hud.armyPanel.shipSlots', { used: usage.needed, offered: usage.offered }) }}</p>
      <p v-if="over" class="slots-over" role="alert">{{ t('hud.armyPanel.shipSlotsOver') }}</p>
    </div>
  </div>
</template>

<style scoped>
.dispatch-slots-slot {
  /* two 12px lines at line-height 1.4 (the "over" warning may wrap on a phone, hence a third) */
  min-height: calc(12px * 1.4 * 3);
}
.dispatch-slots {
  font-size: 12px;
  line-height: 1.4;
}
.dispatch-slots p {
  margin: 0;
}
.slots-line {
  color: var(--muted);
}
.dispatch-slots.over .slots-line,
.slots-over {
  color: var(--rival);
}
</style>
