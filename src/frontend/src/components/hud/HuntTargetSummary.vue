<script setup lang="ts">
// The wildlife camp a hunt dispatch is aimed at: family, level, garrison per tier with the
// beasts' names, whether it is calm / aggressive / empty, the loot a hunt can pay (before the
// army's carry cap) and how the selected army's attack compares with the camp's defense. Shared by
// ArmyPanel.vue and MobileDispatchSheet.vue.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import type { MessageSchema } from '../../i18n/schema';
import { beastName, campName, resourceName } from '../../i18n/catalogueNames';
import { armyAttackPower, huntOutlook, huntSummaryFor } from '../../lib/units/huntSummary';

const props = defineProps<{ target: { q: number; r: number } | null; unitCounts: Record<string, number> }>();

const world = useWorldStore();
const catalogue = useUnitCatalogueStore();
const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const summary = computed(() => {
  if (!props.target) return null;
  void world.campStatesVersion; // re-read the live camp state when a refresh lands
  const camp = world.model.campAt(props.target);
  return camp ? huntSummaryFor(camp, Date.now()) : null;
});
const attack = computed(() => armyAttackPower(props.unitCounts, catalogue.byType));
const outlook = computed(() => (summary.value ? huntOutlook(attack.value, summary.value) : null));
const lootChips = computed(() =>
  summary.value
    ? (['food', 'wood', 'stone', 'iron'] as const)
        .filter((kind) => summary.value!.loot[kind] > 0)
        .map((kind) => ({ kind, label: resourceName(kind), amount: summary.value!.loot[kind] }))
    : [],
);
const statusText = computed(() => {
  const s = summary.value;
  if (!s) return '';
  if (s.status === 'calm' && s.calmUntil) return t('hud.huntTarget.calmUntil', { time: d(new Date(s.calmUntil), 'long') });
  return t(`hud.huntTarget.status.${s.status}`);
});
</script>

<template>
  <div v-if="summary" class="hunt-target" data-testid="hunt-target">
    <div class="hunt-head">
      <strong>{{ campName(summary.family) }}</strong>
      <span class="hunt-level">{{ t('hud.hoverTooltip.level', { level: summary.effectiveLevel }) }}</span>
    </div>
    <p class="hunt-status" :class="summary.status" data-testid="hunt-status">{{ statusText }}</p>
    <ul class="hunt-garrison">
      <li v-for="row in summary.tiers" :key="row.tier" :data-tier="row.tier">
        <span>{{ beastName(summary.family, row.tier) }}</span>
        <span>{{ row.count }} / {{ row.full }}</span>
      </li>
    </ul>
    <p class="hunt-loot" data-testid="hunt-loot">
      <span class="hunt-label">{{ t('hud.huntTarget.loot') }}</span>
      <span v-for="chip in lootChips" :key="chip.kind" class="hunt-chip">{{ chip.amount }} {{ chip.label }}</span>
      <span v-if="!lootChips.length">{{ t('hud.huntTarget.noLoot') }}</span>
    </p>
    <p class="hunt-outlook" :class="outlook" data-testid="hunt-outlook">
      {{ t('hud.huntTarget.power', { attack, defense: summary.campDefense }) }}
      <template v-if="outlook">· {{ t(`hud.huntTarget.outlook.${outlook}`) }}</template>
    </p>
    <p class="hunt-note">{{ t('hud.huntTarget.estimateNote') }}</p>
  </div>
</template>

<style scoped>
.hunt-target {
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hunt-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.hunt-level {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--gold);
}
.hunt-status {
  margin: 0;
  color: var(--muted);
}
.hunt-status.aggressive {
  color: var(--rival);
}
.hunt-status.empty {
  color: var(--food);
}
.hunt-garrison {
  list-style: none;
  margin: 0;
  padding: 0;
}
.hunt-garrison li {
  display: flex;
  justify-content: space-between;
}
.hunt-loot {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: center;
}
.hunt-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.hunt-chip {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--panel-border);
}
.hunt-outlook {
  margin: 0;
  font-weight: 600;
}
.hunt-outlook.win {
  color: var(--food);
}
.hunt-outlook.lose {
  color: var(--rival);
}
.hunt-note {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}
</style>
