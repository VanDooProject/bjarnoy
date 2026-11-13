<script setup lang="ts">
// The target-building picker of the order being composed: a fleet attack must name one building on the target's shore, a land attack may
// name one for its siege engines. One component for every surface that composes an attack (ArmyPanel.vue, MobileDispatchSheet.vue and
// SendArmyPicker.vue); the rows and rules come from useDispatchTargetBuilding.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import type { MessageSchema } from '../../i18n/schema';
import { useDispatchTargetBuilding } from '../../composables/useDispatchTargetBuilding';

const props = defineProps<{ hasTarget: boolean }>();

const world = useWorldStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const picker = useDispatchTargetBuilding(computed(() => props.hasTarget));
</script>

<template>
  <div v-if="picker.showPicker.value" class="building-picker">
    <p class="status-subtext building-picker-hint">
      {{ t(picker.isRequired.value ? 'hud.armyPanel.fleetBuildingPickerHint' : 'hud.armyPanel.buildingPickerHint') }}
    </p>
    <p v-if="!picker.isRequired.value" class="status-subtext" data-testid="engine-reach">{{ t('hud.armyPanel.engineReach') }}</p>
    <div v-if="picker.selectedLabel.value" class="target-selected">
      <span>{{ t('hud.armyPanel.target') }} <strong>{{ picker.selectedLabel.value }}</strong></span>
      <button type="button" class="secondary change-target" @click="picker.clear">{{ t('hud.armyPanel.clear') }}</button>
    </div>
    <p v-if="picker.selectedUnreachable.value" class="status-subtext" data-testid="target-unreachable">{{ t('hud.armyPanel.cannotDamage') }}</p>
    <template v-else>
      <p v-if="world.dispatchTargetBuildingsLoading" class="status-subtext">{{ t('hud.armyPanel.loadingEnemyLayout') }}</p>
      <p v-else-if="world.dispatchTargetBuildingsError" class="status-subtext">
        {{ t(picker.isRequired.value ? 'hud.armyPanel.fleetLayoutLoadError' : 'hud.armyPanel.layoutLoadError') }}
      </p>
      <div v-else-if="picker.rows.value.length" class="target-list building-list">
        <button
          v-for="b in picker.rows.value"
          :key="`${b.q},${b.r}`"
          type="button"
          class="target-row"
          :class="{ 'out-of-reach': !b.damageable }"
          :disabled="!b.pickable"
          :title="b.damageable ? undefined : t('hud.armyPanel.cannotDamage')"
          data-testid="building-target"
          @click="picker.pick(b.q, b.r)"
        >
          <span class="target-name">{{ b.label }}</span>
          <span class="target-owner">{{ b.damageable ? t('hud.armyPanel.buildingLevelCoord', { level: b.level, q: b.q, r: b.r }) : t('hud.armyPanel.cannotDamage') }}</span>
        </button>
      </div>
      <p v-else class="status-subtext">{{ t(picker.isRequired.value ? 'hud.armyPanel.fleetNoShoreBuilding' : 'hud.armyPanel.noPreference') }}</p>
    </template>
  </div>
</template>

<style scoped>
.building-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.status-subtext {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}
.target-selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text);
}
.secondary {
  padding: 3px 8px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  color: var(--text);
  font-size: 11px;
  cursor: pointer;
}
.target-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 120px;
  overflow-y: auto;
}
.target-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.target-row.out-of-reach {
  opacity: 0.5;
  cursor: not-allowed;
}
.target-owner {
  color: var(--muted);
  white-space: nowrap;
}
</style>
