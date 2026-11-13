<script setup lang="ts">
import { computed, onMounted } from 'vue';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { unitName } from '../i18n/catalogueNames';
import { groupByShipGroup } from '../lib/units/shipGroups';
import { maxLevelFor } from '../lib/map/buildingEconomy';
import { MAX_TRAINING_ORDERS_PER_BUILDING, TRAINING_TIME_REDUCTION_PER_LEVEL } from '../lib/units/trainingEconomy';

// The training page: which building trains which units, the queue every training building has, how the building's
// level speeds training up, and how an order is spread over several buildings. The unit-to-building table is read from
// the unit catalogue (`requiredBuildingType`); the queue size and the speed-up come from lib/units/trainingEconomy.ts,
// the same numbers the training window uses.

const units = useUnitCatalogueStore();
onMounted(() => void units.load());

/** The training buildings in catalogue order, each with the units it trains. */
const rows = computed(() => {
  const byBuilding = new Map<string, string[]>();
  for (const unit of units.definitions) {
    const list = byBuilding.get(unit.requiredBuildingType) ?? [];
    list.push(unit.type);
    byBuilding.set(unit.requiredBuildingType, list);
  }
  return [...byBuilding].map(([building, types]) => ({ building, units: groupByShipGroup(types, (t) => t).flatMap((g) => g.rows).map(unitName).join(', ') }));
});

const percentPerLevel = Math.round(TRAINING_TIME_REDUCTION_PER_LEVEL * 100);
const maxLevel = maxLevelFor('barracks');
const maxPercent = percentPerLevel * maxLevel;
</script>

<template>
  <DocsPageLayout class="training" :title="$t('docs.training.title')" caption="DOCS · TRAINING" :intro="$t('docs.training.intro')">
    <template v-if="rows.length > 0">
      <section id="buildings" class="block">
        <h2>{{ $t('docs.training.buildings.heading') }}</h2>
        <p class="text">{{ $t('docs.training.buildings.body') }}</p>
        <div class="table-scroll">
          <table data-testid="training-table">
            <thead>
              <tr>
                <th>{{ $t('docs.training.buildings.building') }}</th>
                <th>{{ $t('docs.training.buildings.units') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.building" :data-building="row.building">
                <th scope="row" class="name"><BuildingLink :type="row.building" always /></th>
                <td>{{ row.units }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="queue" class="block">
        <h2>{{ $t('docs.training.queue.heading') }}</h2>
        <ul class="rules">
          <li>{{ $t('docs.training.queue.own', { max: MAX_TRAINING_ORDERS_PER_BUILDING }) }}</li>
          <li>{{ $t('docs.training.queue.parallel') }}</li>
          <li>{{ $t('docs.training.queue.speed', { percent: percentPerLevel, max: maxPercent, level: maxLevel }) }}</li>
          <li>{{ $t('docs.training.queue.pay') }}</li>
          <i18n-t keypath="docs.training.queue.cancel" tag="li" scope="global">
            <template #realm>
              <DocsPageLink to="/docs/realm">{{ $t('docs.training.queue.realmLink') }}</DocsPageLink>
            </template>
          </i18n-t>
        </ul>
      </section>

      <section id="distribute" class="block">
        <h2>{{ $t('docs.training.distribute.heading') }}</h2>
        <p class="text">{{ $t('docs.training.distribute.body') }}</p>
        <ul class="rules">
          <li>{{ $t('docs.training.distribute.evenly') }}</li>
          <li>{{ $t('docs.training.distribute.fastest') }}</li>
        </ul>
      </section>
    </template>

    <DocsAdminNote class="block">
      <p>{{ $t('docs.training.adminNote.time', { percent: percentPerLevel / 100 }) }}</p>
      <p>{{ $t('docs.training.adminNote.refund') }}</p>
    </DocsAdminNote>
  </DocsPageLayout>
</template>

<style scoped>
.block {
  margin-top: 32px;
  scroll-margin-top: 84px;
}
.block h2 {
  margin: 0 0 10px;
}
.text {
  margin: 0 0 12px;
  line-height: 1.6;
  color: var(--muted);
}
.rules {
  margin: 0;
  padding-left: 20px;
  line-height: 1.6;
  color: var(--muted);
}
.rules li {
  margin-bottom: 6px;
}
.table-scroll {
  overflow-x: auto;
  margin: 0 -4px 12px;
  padding: 0 4px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
th,
td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--panel-border);
  text-align: left;
  vertical-align: top;
}
thead th {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  white-space: nowrap;
}
.name {
  font-weight: 600;
}
</style>
