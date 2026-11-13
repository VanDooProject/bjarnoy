<script setup lang="ts">
import { computed, onMounted } from 'vue';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import UnitDependencyGraph from '../components/docs/UnitDependencyGraph.vue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { maxLevelFor } from '../lib/map/buildingEconomy';
import { MAX_TRAINING_ORDERS_PER_BUILDING, TRAINING_TIME_REDUCTION_PER_LEVEL } from '../lib/units/trainingEconomy';

// The training page: which building trains which units at which level (a dependency graph), the queue every training
// building has, how the building's level speeds training up, and how an order is spread over several buildings. The graph
// is read from the unit catalogue (`requiredBuildingType`, `requiredBuildingLevel`, `requiredUnitType`); the queue size and the speed-up come from lib/units/trainingEconomy.ts,
// the same numbers the training window uses.

const units = useUnitCatalogueStore();
onMounted(() => void units.load());

// The graph needs the building catalogue too (what Longhouse level opens each training building).
const buildings = useBuildingCatalogueStore();
onMounted(() => void buildings.load());
const rows = computed(() => units.definitions);

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
        <UnitDependencyGraph />
      </section>

      <section id="queue" class="block">
        <h2>{{ $t('docs.training.queue.heading') }}</h2>
        <ul class="rules">
          <li>{{ $t('docs.training.queue.own', { max: MAX_TRAINING_ORDERS_PER_BUILDING }) }}</li>
          <li>{{ $t('docs.training.queue.parallel') }}</li>
          <li>{{ $t('docs.training.queue.speed', { percent: percentPerLevel, max: maxPercent, level: maxLevel }) }}</li>
          <li>{{ $t('docs.training.queue.pay') }}</li>
          <li>{{ $t('docs.training.queue.cancelOrder') }}</li>
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
</style>
