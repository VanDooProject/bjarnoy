<script setup lang="ts">
// The enemy wall a siege dispatch is aimed at: which hex, whether it is a palisade or a gate and its level, and whether the
// selected army can actually breach it (a siege needs a catapult or a battering ram). Shared by ArmyPanel.vue and
// MobileDispatchSheet.vue.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import type { MessageSchema } from '../../i18n/schema';
import { buildingName } from '../../i18n/catalogueNames';
import { hasSiegeUnitSelected } from '../../lib/units/armyDispatch';

const props = defineProps<{ target: { q: number; r: number } | null; unitCounts: Record<string, number> }>();

const world = useWorldStore();
const catalogue = useUnitCatalogueStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const tile = computed(() => (props.target ? world.model.getTile(props.target.q, props.target.r) : null));
const wallLabel = computed(() => (tile.value?.buildingType ? buildingName(tile.value.buildingType) : t('hud.siegeTarget.wall')));
const hasSiege = computed(() => hasSiegeUnitSelected(props.unitCounts, catalogue.byType));
</script>

<template>
  <div v-if="target" class="siege-target" data-testid="siege-target">
    <div class="siege-head">
      <strong>{{ wallLabel }}</strong>
      <span v-if="tile?.buildingLevel" class="siege-level">{{ t('hud.hoverTooltip.level', { level: tile.buildingLevel }) }}</span>
      <span class="siege-hex">{{ t('hud.siegeTarget.wallHex', target) }}</span>
    </div>
    <p class="siege-note" :class="{ warn: !hasSiege }" data-testid="siege-needs">
      {{ hasSiege ? t('hud.siegeTarget.note') : t('hud.siegeTarget.needsSiegeUnit') }}
    </p>
  </div>
</template>

<style scoped>
.siege-target {
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.siege-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
}
.siege-level,
.siege-hex {
  color: var(--text-dim, inherit);
  font-size: 11px;
}
.siege-note {
  margin: 0;
  font-size: 11px;
}
.siege-note.warn {
  color: var(--gold);
}
</style>
