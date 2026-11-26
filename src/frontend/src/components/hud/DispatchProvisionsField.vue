<script setup lang="ts">
// The food a dispatch from home takes along, for ArmyPanel.vue (desktop) and MobileDispatchSheet.vue (phones). The figure cannot go
// above what the chosen units can carry: the store clamps it (`setDispatchProvisions`) and the field shows the clamped figure at once.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { foodCarryCapacity } from '../../lib/units/armyDispatch';

defineProps<{ touch?: boolean }>();

const world = useWorldStore();
const catalogue = useUnitCatalogueStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const provisions = computed(() => world.dispatchDraft?.provisions ?? 0);
const capacity = computed(() => foodCarryCapacity(world.dispatchDraft?.unitCounts ?? {}, catalogue.byType));

function onInput(event: Event) {
  const input = event.target as HTMLInputElement;
  world.setDispatchProvisions(Number(input.value));
  // A typed figure above the capacity leaves the stored one unchanged, so the binding would not redraw: write it back here.
  if (input.value !== String(provisions.value)) input.value = String(provisions.value);
}
</script>

<template>
  <label class="provisions-field" :class="{ 'is-touch': touch }">
    <span>{{ t('hud.armyPanel.provisions') }}</span>
    <input type="number" min="0" :max="capacity" :value="provisions" @input="onInput" />
  </label>
</template>

<style scoped>
.provisions-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text);
}
.provisions-field input {
  width: 90px;
  padding: 4px 6px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  text-align: center;
}
.provisions-field.is-touch input {
  padding: 6px;
}
</style>
