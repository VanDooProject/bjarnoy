<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { resourceName } from '../i18n/catalogueNames';
import { prerequisitesOf } from '../lib/techtree/nodes';
import {
  FEAST_HOURS,
  MINIMUM_SPACING,
  settlerCostMultiplier,
  feastCost,
  feastRenown,
  foundingStock,
  renownRequired,
} from '../lib/docs/foundingDocs';
import { SETTLERS_PER_FOUNDING } from '../lib/founding';

// The founding page: your first settlement, the settlers, renown and spacing that gate the next ones, and what a new
// settlement starts with. Unit and building figures come from the catalogues; the settler rules are mirrored in
// foundingDocs.ts.

const { t, n } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const buildings = useBuildingCatalogueStore();
const units = useUnitCatalogueStore();
onMounted(() => {
  void buildings.load();
  void units.load();
});


const RESOURCES = ['wood', 'stone', 'food', 'iron'] as const;

const settler = computed(() => units.byType.settler);
const loaded = computed(() => !!settler.value && !!buildings.byType.cartworkshop?.length && !!buildings.byType.longhouse?.length);

const workshop = computed(() => ({
  longhouse: buildings.byType.cartworkshop?.[0]?.requiredLonghouseLevel ?? 0,
  needs: prerequisitesOf(buildings.byType, 'cartworkshop'),
}));

const settlerFacts = computed(() => {
  const c = settler.value;
  if (!c) return null;
  return {
    defense: c.defense,
    speed: c.speed,
    food: c.foodCarryCapacity,
    upkeep: c.upkeepPerHour,
    minutes: Math.round(c.trainingSeconds / 60),
    longhouse: c.requiredLonghouseLevel,
    cost: RESOURCES.map((r) => n(c.trainingCost[r])).join(' / '),
    carried: SETTLERS_PER_FOUNDING * c.foodCarryCapacity,
  };
});

/** One row per settlement you could found next: what you hold, the renown asked and what the settlers cost. */
const priceRows = computed(() => {
  const c = settler.value;
  if (!c) return [];
  return [1, 2, 3, 4].map((held) => {
    const factor = settlerCostMultiplier(held);
    return {
      held,
      number: held + 1,
      factor,
      renown: renownRequired(held + 1),
      perSettler: RESOURCES.map((r) => n(c.trainingCost[r] * factor)).join(' / '),
      total: RESOURCES.map((r) => n(c.trainingCost[r] * factor * SETTLERS_PER_FOUNDING)).join(' / '),
    };
  });
});

const feast = [1, 10, 20].map((level) => ({ level, cost: feastCost(level), renown: feastRenown(level) }));

const start = computed(() => {
  const levels = buildings.byType.longhouse;
  const first = levels?.[0];
  const second = levels?.[1];
  if (!first || !second) return null;
  const stock = foundingStock(first.storageCapacity.wood);
  return { claim1: first.claimRadius, claim2: second.claimRadius, stock: n(stock.wood) };
});

const tocLinks = computed(() =>
  ['first', 'more', 'renown', 'where', 'new'].map((id) => ({ href: `#${id}`, label: t(`docs.founding.toc.${id}`) })),
);
</script>

<template>
  <DocsPageLayout class="founding" :title="$t('docs.founding.title')" caption="DOCS · FOUNDING" :intro="$t('docs.founding.intro')">
    <DocsToc :links="tocLinks" />

    <p v-if="buildings.loading || units.loading" class="muted">{{ $t('docs.status.loading') }}</p>

    <template v-if="loaded">
    <section id="first" class="block">
      <h2>{{ $t('docs.founding.first.heading') }}</h2>
      <p class="text">{{ $t('docs.founding.first.body') }}</p>
    </section>

    <section id="more" class="block">
      <h2>{{ $t('docs.founding.more.heading') }}</h2>
      <i18n-t v-if="loaded" keypath="docs.founding.more.body" tag="p" class="text" scope="global">
        <template #workshop><BuildingLink type="cartworkshop" /></template>
        <template #longhouse><BuildingLink type="longhouse" /></template>
        <template #level>{{ workshop.longhouse }}</template>
        <template #square><BuildingLink type="townsquare" /></template>
        <template #squareLevel>{{ workshop.needs.find((p) => p.type === 'townsquare')?.level }}</template>
        <template #count>{{ SETTLERS_PER_FOUNDING }}</template>
      </i18n-t>
      <div v-if="settlerFacts" class="table-scroll">
        <table class="small" data-testid="settler-table">
          <thead>
            <tr>
              <th>{{ $t('docs.founding.more.settler.defense') }}</th>
              <th>{{ $t('docs.founding.more.settler.speed') }}</th>
              <th>{{ $t('docs.founding.more.settler.food') }}</th>
              <th>{{ $t('docs.founding.more.settler.upkeep') }}</th>
              <th>{{ $t('docs.founding.more.settler.time') }}</th>
              <th>{{ $t('docs.founding.more.settler.longhouse') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{{ settlerFacts.defense }}</td>
              <td>{{ settlerFacts.speed }}</td>
              <td>{{ settlerFacts.food }}</td>
              <td>{{ settlerFacts.upkeep }}</td>
              <td>{{ $t('docs.founding.more.settler.minutes', { n: settlerFacts.minutes }) }}</td>
              <td>{{ settlerFacts.longhouse }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text">{{ $t('docs.founding.more.provisions', { food: settlerFacts?.food ?? 0, total: settlerFacts?.carried ?? 0 }) }}</p>
      <i18n-t keypath="docs.founding.more.ambush" tag="p" class="text" scope="global">
        <template #camps>
          <DocsPageLink to="/docs/wildlife-camps">{{ $t('docs.founding.more.campsLink') }}</DocsPageLink>
        </template>
        <template #movement>
          <DocsPageLink to="/docs/land-movement">{{ $t('docs.founding.more.movementLink') }}</DocsPageLink>
        </template>
      </i18n-t>
    </section>

    <section id="renown" class="block">
      <h2>{{ $t('docs.founding.renown.heading') }}</h2>
      <p class="text">{{ $t('docs.founding.renown.body') }}</p>
      <div v-if="loaded" class="table-scroll">
        <table data-testid="price-table">
          <thead>
            <tr>
              <th>{{ $t('docs.founding.renown.columns.next') }}</th>
              <th>{{ $t('docs.founding.renown.columns.renown') }}</th>
              <th>{{ $t('docs.founding.renown.columns.perSettler') }}</th>
              <th>{{ $t('docs.founding.renown.columns.total', { count: SETTLERS_PER_FOUNDING }) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in priceRows" :key="row.held" :data-settlement="row.number">
              <th scope="row" class="name">{{ $t('docs.founding.renown.nth', { n: row.number }) }}</th>
              <td class="value">{{ n(row.renown) }}</td>
              <td class="value">{{ row.perSettler }}</td>
              <td class="value">{{ row.total }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted">{{ $t('docs.founding.renown.order', { resources: RESOURCES.map(resourceName).join(' / ') }) }}</p>
      <p class="text">{{ $t('docs.founding.renown.when') }}</p>
      <i18n-t keypath="docs.founding.renown.feasts" tag="p" class="text" scope="global">
        <template #square><BuildingLink type="townsquare" /></template>
        <template #hours>{{ FEAST_HOURS }}</template>
      </i18n-t>
      <div class="table-scroll">
        <table class="small" data-testid="feast-table">
          <thead>
            <tr>
              <th>{{ $t('docs.founding.renown.feast.level') }}</th>
              <th>{{ $t('docs.founding.renown.feast.cost') }}</th>
              <th>{{ $t('docs.founding.renown.feast.renown') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in feast" :key="row.level">
              <td>{{ row.level }}</td>
              <td class="value">{{ n(row.cost) }}</td>
              <td class="value">{{ n(row.renown) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section id="where" class="block">
      <h2>{{ $t('docs.founding.where.heading') }}</h2>
      <ul class="rules">
        <li>{{ $t('docs.founding.where.land') }}</li>
        <li>{{ $t('docs.founding.where.spacing', { hexes: MINIMUM_SPACING }) }}</li>
        <li>{{ $t('docs.founding.where.twice') }}</li>
        <li>{{ $t('docs.founding.where.taken') }}</li>
      </ul>
    </section>

    <section id="new" class="block">
      <h2>{{ $t('docs.founding.new.heading') }}</h2>
      <i18n-t v-if="start" keypath="docs.founding.new.body" tag="p" class="text" scope="global">
        <template #longhouse><BuildingLink type="longhouse" /></template>
        <template #claim1>{{ start.claim1 }}</template>
        <template #claim2>{{ start.claim2 }}</template>
        <template #stock>{{ start.stock }}</template>
      </i18n-t>
      <p class="text">{{ $t('docs.founding.new.garrison') }}</p>
    </section>
    </template>

    <DocsAdminNote class="block">
      <p>{{ $t('docs.founding.adminNote.sea') }}</p>
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
.muted {
  color: var(--muted);
  line-height: 1.6;
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
}
.name {
  white-space: nowrap;
  font-weight: 600;
}
.value {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.small {
  width: auto;
}
</style>
