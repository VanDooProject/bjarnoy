<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import ResourceCost from '../components/ResourceCost.vue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { shipGroupName, unitName } from '../i18n/catalogueNames';
import { shipGroupOf } from '../lib/units/shipGroups';

// A unit's detail page (/docs/units/:type): its figures from the unit catalogue and where it is trained. Ships and land units
// share it; the ship-only rows (troop slots, the ship group) show only for ships.

const { n } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const route = useRoute();
const units = useUnitCatalogueStore();
const buildings = useBuildingCatalogueStore();
onMounted(() => {
  void units.load();
  void buildings.load();
});

const type = computed(() => String(route.params.type ?? ''));
const unit = computed(() => units.definitions.find((u) => u.type === type.value));
const isShip = computed(() => unit.value?.class === 'ship');
const group = computed(() => shipGroupOf(type.value));
const trainsAt = computed(() => (isShip.value ? '/docs/ships' : '/docs/training'));
</script>

<template>
  <DocsPageLayout class="unit-page" :title="unitName(type)" caption="DOCS · UNITS">
    <p v-if="units.loading" class="muted">{{ $t('docs.status.loading') }}</p>
    <p v-else-if="units.definitions.length > 0 && !unit" class="muted" data-testid="unit-unknown">
      {{ $t('docs.unit.unknown') }}
    </p>
    <template v-else-if="unit">
      <p class="text" data-testid="unit-kind">
        {{ isShip && group ? shipGroupName(group) : $t(`docs.unit.classes.${unit.class}`) }}
      </p>
      <section class="block">
        <h2>{{ $t('docs.unit.training.heading') }}</h2>
        <i18n-t keypath="docs.unit.training.body" tag="p" class="text" scope="global">
          <template #building><BuildingLink :type="unit.requiredBuildingType" /></template>
          <template #level>{{ unit.requiredBuildingLevel }}</template>
        </i18n-t>
        <i18n-t keypath="docs.unit.training.longhouse" tag="p" class="text" scope="global">
          <template #longhouse><BuildingLink type="longhouse" /></template>
          <template #level>{{ unit.requiredLonghouseLevel }}</template>
        </i18n-t>
        <i18n-t keypath="docs.unit.training.more" tag="p" class="text" scope="global">
          <template #page>
            <DocsPageLink :to="trainsAt">{{ $t(isShip ? 'docs.unit.training.shipsPage' : 'docs.unit.training.trainingPage') }}</DocsPageLink>
          </template>
        </i18n-t>
      </section>
      <section class="block">
        <h2>{{ $t('docs.unit.figures.heading') }}</h2>
        <table data-testid="unit-figures">
          <tbody>
            <tr><th scope="row">{{ $t('docs.unit.figures.attack') }}</th><td data-col="attack">{{ unit.attack }}</td></tr>
            <tr><th scope="row">{{ $t('docs.unit.figures.defense') }}</th><td data-col="defense">{{ unit.defense }}</td></tr>
            <tr><th scope="row">{{ $t('docs.unit.figures.speed') }}</th><td data-col="speed">{{ n(unit.speed) }}</td></tr>
            <tr><th scope="row">{{ $t('docs.unit.figures.vision') }}</th><td data-col="vision">{{ n(unit.visionRadius) }}</td></tr>
            <tr><th scope="row">{{ $t('docs.unit.figures.loot') }}</th><td data-col="loot">{{ n(unit.carryCapacity) }}</td></tr>
            <tr><th scope="row">{{ $t('docs.unit.figures.food') }}</th><td data-col="food">{{ n(unit.foodCarryCapacity) }}</td></tr>
            <tr v-if="isShip"><th scope="row">{{ $t('docs.unit.figures.shipSlots') }}</th><td data-col="slots">{{ n(unit.shipSlots) }}</td></tr>
            <tr v-else><th scope="row">{{ $t('docs.unit.figures.cargoSlots') }}</th><td data-col="slots">{{ n(unit.cargoSlots) }}</td></tr>
            <tr><th scope="row">{{ $t('docs.unit.figures.upkeep') }}</th><td data-col="upkeep">{{ n(unit.upkeepPerHour) }}</td></tr>
            <tr><th scope="row">{{ $t('docs.unit.figures.cost') }}</th><td data-col="cost"><ResourceCost :cost="unit.trainingCost" :size="13" /></td></tr>
            <tr><th scope="row">{{ $t('docs.unit.figures.time') }}</th><td data-col="time">{{ $t('docs.unit.figures.minutes', { n: Math.round(unit.trainingSeconds / 60) }) }}</td></tr>
          </tbody>
        </table>
        <p v-if="unit.ranged" class="text">{{ $t('docs.unit.ranged') }}</p>
      </section>
    </template>
  </DocsPageLayout>
</template>

<style scoped>
.block {
  margin-top: 32px;
}
.block h2 {
  margin: 0 0 10px;
}
.text,
.muted {
  margin: 0 0 12px;
  line-height: 1.6;
  color: var(--muted);
}
table {
  border-collapse: collapse;
  font-size: 14px;
  margin-bottom: 12px;
}
th,
td {
  padding: 8px 16px 8px 0;
  border-bottom: 1px solid var(--panel-border);
  text-align: left;
  font-variant-numeric: tabular-nums;
}
th {
  font-weight: 400;
  color: var(--muted);
}
</style>
