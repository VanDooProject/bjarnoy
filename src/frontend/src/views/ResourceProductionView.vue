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
import { resourceName, terrainName } from '../i18n/catalogueNames';
import { buildingStatsFor, maxLevelFor, type BuildingKind } from '../lib/map/buildingEconomy';
import { prerequisitesOf } from '../lib/techtree/nodes';
import {
  BASE_STORAGE,
  MILLS,
  MILL_LEVELS,
  PRODUCER_LEVELS,
  PRODUCER_TYPES,
  boostTerrainsOf,
  millBoostAt,
  neighbourBoost,
  storageHouseSteps,
} from '../lib/docs/productionDocs';

// The production page: what each producer makes, the neighbour boost, the mills that raise producers, the storage
// that caps everything and the upkeep that eats food. Every number comes from the building catalogue, the economy
// formulas (buildingEconomy.ts) or the few backend mirrors in productionDocs.ts.

const { t, n } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const catalogue = useBuildingCatalogueStore();
onMounted(() => catalogue.load());

const RESOURCES = ['wood', 'stone', 'food', 'iron'] as const;
type Resource = (typeof RESOURCES)[number];

const loaded = computed(() => PRODUCER_TYPES.every((p) => catalogue.byType[p]?.length) && !!catalogue.byType.longhouse?.length);

// --- helpers -----------------------------------------------------------------------------------------------------

function definitionAt(type: string, level: number) {
  return catalogue.byType[type]?.find((d) => d.level === level);
}

/** What `type` stands on, from the catalogue: its terrain, or the coastal water. */
function standsOn(type: string): string {
  const first = catalogue.byType[type]?.[0];
  if (!first) return '';
  if (first.requiresCoastalWater) return t('docs.techTree.terrainCoastal');
  if (first.allowedTerrain.length === 0) return t('docs.techTree.terrainAny');
  return first.allowedTerrain.map(terrainName).join(', ');
}

const NOTED = new Set(['pumpkinfarm', 'fishinghut', 'claybrickworks', 'bogoreworks']);

function unlockOf(type: string) {
  return {
    longhouse: catalogue.byType[type]?.[0]?.requiredLonghouseLevel ?? 0,
    needs: prerequisitesOf(catalogue.byType, type),
  };
}

// --- producers ---------------------------------------------------------------------------------------------------

const producerRows = computed(() =>
  PRODUCER_TYPES.map((type) => {
    const resource = RESOURCES.find((r) => (definitionAt(type, 1)?.productionPerHour[r] ?? 0) > 0) as Resource;
    return {
      type,
      resource,
      cells: PRODUCER_LEVELS.map((level) => ({
        level,
        amount: Math.round(definitionAt(type, level)?.productionPerHour[resource] ?? 0),
      })),
      standsOn: standsOn(type),
      note: NOTED.has(type),
      unlock: unlockOf(type),
    };
  }),
);

const longhouseRow = computed(() => ({
  cells: PRODUCER_LEVELS.map((level) => ({
    level,
    amounts: RESOURCES.map((r) => Math.round(definitionAt('longhouse', level)?.productionPerHour[r] ?? 0)),
  })),
  perLevel: RESOURCES.map((r) => Math.round(definitionAt('longhouse', 1)?.productionPerHour[r] ?? 0)),
}));

const pumpkinPerHour = computed(() => Math.round(definitionAt('pumpkinfarm', 1)?.productionPerHour.food ?? 0));
const farmPerHour = computed(() => Math.round(definitionAt('farm', 1)?.productionPerHour.food ?? 0));

// --- neighbour boost ---------------------------------------------------------------------------------------------

const boost = neighbourBoost();
const boostRows = (['lumberjack', 'quarry', 'fishinghut', 'bogoreworks'] as const).map((type) => ({
  type,
  terrains: boostTerrainsOf(type as BuildingKind).map(terrainName).join(', '),
}));

// --- mills -------------------------------------------------------------------------------------------------------

const millRows = computed(() =>
  MILLS.map((mill) => ({
    ...mill,
    unlock: unlockOf(mill.type),
    cells: MILL_LEVELS.map((level) => ({ level, ...millBoostAt(level) })),
  })),
);
const millMax = maxLevelFor('sawmill');

// --- storage -----------------------------------------------------------------------------------------------------

const STORAGE_ROWS = [
  { type: 'longhouse', levels: [1, 10, maxLevelFor('longhouse')] },
  { type: 'storagehouse', levels: [1, 10, maxLevelFor('storagehouse')] },
  { type: 'greatstorehouse', levels: [1, 5, maxLevelFor('greatstorehouse')] },
] as const;
const storageRows = computed(() =>
  STORAGE_ROWS.map((row) => ({
    type: row.type,
    unlock: unlockOf(row.type),
    cells: row.levels.map((level) => {
      const output = buildingStatsFor(row.type as BuildingKind, level).output;
      return { level, capacity: output?.kind === 'storageCapacity' ? output.amount : 0 };
    }),
  })),
);
const steps = storageHouseSteps();

const tocLinks = computed(() =>
  ['producers', 'boost', 'mills', 'storage', 'upkeep'].map((id) => ({ href: `#${id}`, label: t(`docs.production.toc.${id}`) })),
);
</script>

<template>
  <DocsPageLayout class="production" :title="$t('docs.production.title')" caption="DOCS · PRODUCTION" :intro="$t('docs.production.intro')">
    <DocsToc :links="tocLinks" />

    <p v-if="catalogue.loading" class="muted">{{ $t('docs.status.loading') }}</p>
    <p v-else-if="catalogue.error" class="muted">{{ catalogue.error }}</p>

    <template v-if="loaded">
    <section id="producers" class="block">
      <h2>{{ $t('docs.production.producers.heading') }}</h2>
      <p class="text">{{ $t('docs.production.producers.growth') }}</p>
      <div v-if="loaded" class="table-scroll">
        <table data-testid="producers-table">
          <thead>
            <tr>
              <th>{{ $t('docs.production.producers.columns.building') }}</th>
              <th>{{ $t('docs.production.producers.columns.makes') }}</th>
              <th v-for="level in PRODUCER_LEVELS" :key="level">{{ $t('docs.production.producers.columns.level', { n: level }) }}</th>
              <th>{{ $t('docs.production.producers.columns.standsOn') }}</th>
              <th>{{ $t('docs.production.producers.columns.unlock') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in producerRows" :key="row.type" :data-producer="row.type">
              <th scope="row" class="name"><BuildingLink :type="row.type" always /></th>
              <td>{{ resourceName(row.resource) }}</td>
              <td v-for="cell in row.cells" :key="cell.level" class="value">{{ n(cell.amount) }}</td>
              <td>
                {{ row.standsOn }}
                <span v-if="row.note" class="line muted">{{ $t(`docs.production.producers.notes.${row.type}`) }}</span>
              </td>
              <td class="unlock">
                <BuildingLink type="longhouse" /> {{ row.unlock.longhouse }}
                <template v-for="need in row.unlock.needs" :key="need.type">
                  · <BuildingLink :type="need.type" /> {{ need.level }}
                </template>
              </td>
            </tr>
            <tr data-producer="longhouse">
              <th scope="row" class="name"><BuildingLink type="longhouse" always /></th>
              <td>{{ RESOURCES.map(resourceName).join(' / ') }}</td>
              <td v-for="cell in longhouseRow.cells" :key="cell.level" class="value">{{ cell.amounts.map((a) => n(a)).join(' / ') }}</td>
              <td>{{ standsOn('longhouse') }}</td>
              <td>{{ $t('docs.production.producers.longhouseUnlock') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted">{{ $t('docs.production.producers.perHour') }}</p>
      <p class="text">{{ $t('docs.production.producers.longhouse', { amounts: longhouseRow.perLevel.map((a) => n(a)).join(' / ') }) }}</p>
      <i18n-t keypath="docs.production.producers.soil" tag="p" class="text" scope="global">
        <template #pumpkin><BuildingLink type="pumpkinfarm" /></template>
        <template #farm><BuildingLink type="farm" /></template>
        <template #pumpkinRate>{{ pumpkinPerHour }}</template>
        <template #farmRate>{{ farmPerHour }}</template>
      </i18n-t>
    </section>

    <section id="boost" class="block">
      <h2>{{ $t('docs.production.boost.heading') }}</h2>
      <p class="text">{{ $t('docs.production.boost.body', { per: boost.perNeighbour, max: boost.max }) }}</p>
      <div class="table-scroll">
        <table class="small" data-testid="boost-table">
          <thead>
            <tr>
              <th>{{ $t('docs.production.producers.columns.building') }}</th>
              <th>{{ $t('docs.production.boost.boostedBy') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in boostRows" :key="row.type" :data-boost="row.type">
              <th scope="row" class="name"><BuildingLink :type="row.type" always /></th>
              <td>{{ row.terrains }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <i18n-t keypath="docs.production.boost.none" tag="p" class="text" scope="global">
        <template #herder><BuildingLink type="reindeerherder" /></template>
        <template #farm><BuildingLink type="farm" /></template>
        <template #pumpkin><BuildingLink type="pumpkinfarm" /></template>
        <template #brickworks><BuildingLink type="claybrickworks" /></template>
      </i18n-t>
    </section>

    <section id="mills" class="block">
      <h2>{{ $t('docs.production.mills.heading') }}</h2>
      <p class="text">{{ $t('docs.production.mills.body', { max: millMax }) }}</p>
      <div v-if="loaded" class="table-scroll">
        <table data-testid="mills-table">
          <thead>
            <tr>
              <th>{{ $t('docs.production.mills.columns.mill') }}</th>
              <th>{{ $t('docs.production.mills.columns.raises') }}</th>
              <th>{{ $t('docs.production.mills.columns.standsOn') }}</th>
              <th>{{ $t('docs.production.producers.columns.unlock') }}</th>
              <th v-for="level in MILL_LEVELS" :key="level">{{ $t('docs.production.producers.columns.level', { n: level }) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in millRows" :key="row.type" :data-mill="row.type">
              <th scope="row" class="name"><BuildingLink :type="row.type" always /></th>
              <td>
                <template v-for="(target, i) in row.boosts" :key="target"><template v-if="i > 0">, </template><BuildingLink :type="target" /></template>
              </td>
              <td>{{ $t(`docs.production.mills.stands.${row.stands}`) }}</td>
              <td class="unlock">
                <BuildingLink type="longhouse" /> {{ row.unlock.longhouse }}
                <template v-for="need in row.unlock.needs" :key="need.type">
                  · <BuildingLink :type="need.type" /> {{ need.level }}
                </template>
              </td>
              <td v-for="cell in row.cells" :key="cell.level" class="cell">
                {{ $t('docs.production.mills.cell', { percent: cell.percent }, cell.rings) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <i18n-t keypath="docs.production.mills.notPumpkin" tag="p" class="text" scope="global">
        <template #crop><BuildingLink type="cropmill" /></template>
        <template #pumpkin><BuildingLink type="pumpkinfarm" /></template>
      </i18n-t>
    </section>

    <section id="storage" class="block">
      <h2>{{ $t('docs.production.storage.heading') }}</h2>
      <p class="text">{{ $t('docs.production.storage.body', { base: n(BASE_STORAGE) }) }}</p>
      <div v-if="loaded" class="table-scroll">
        <table data-testid="storage-table">
          <thead>
            <tr>
              <th>{{ $t('docs.production.producers.columns.building') }}</th>
              <th>{{ $t('docs.production.storage.capacity') }}</th>
              <th>{{ $t('docs.production.producers.columns.unlock') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in storageRows" :key="row.type" :data-storage="row.type">
              <th scope="row" class="name"><BuildingLink :type="row.type" always /></th>
              <td class="value">
                <span v-for="cell in row.cells" :key="cell.level" class="line">
                  {{ $t('docs.production.storage.cell', { level: cell.level, capacity: n(cell.capacity) }) }}
                </span>
              </td>
              <td class="unlock">
                <BuildingLink type="longhouse" /> {{ row.unlock.longhouse }}
                <template v-for="need in row.unlock.needs" :key="need.type">
                  · <BuildingLink :type="need.type" /> {{ need.level }}
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <i18n-t keypath="docs.production.storage.levelCap" tag="p" class="text" scope="global">
        <template #storehouse><BuildingLink type="storagehouse" /></template>
        <template #great><BuildingLink type="greatstorehouse" /></template>
        <template #longhouse><BuildingLink type="longhouse" /></template>
      </i18n-t>
      <h3>{{ $t('docs.production.storage.moreHeading') }}</h3>
      <p class="text">{{ $t('docs.production.storage.moreBody') }}</p>
      <div class="table-scroll">
        <table class="small" data-testid="storehouse-steps">
          <thead>
            <tr>
              <th>{{ $t('docs.production.storage.step.which') }}</th>
              <th>{{ $t('docs.production.storage.step.needs') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="step in steps" :key="step.nth">
              <td>{{ $t(step.later ? 'docs.production.storage.step.later' : 'docs.production.storage.step.nth', { n: step.nth }) }}</td>
              <td>{{ $t('docs.production.storage.step.needsCell', { count: step.count, level: step.level }) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text">{{ $t('docs.production.storage.overCap') }}</p>
    </section>

    <section id="upkeep" class="block">
      <h2>{{ $t('docs.production.upkeep.heading') }}</h2>
      <i18n-t keypath="docs.production.upkeep.body" tag="p" class="text" scope="global">
        <template #movement>
          <DocsPageLink to="/docs/land-movement">{{ $t('docs.production.upkeep.movementLink') }}</DocsPageLink>
        </template>
      </i18n-t>
      <i18n-t keypath="docs.production.upkeep.shrines" tag="p" class="text" scope="global">
        <template #freyja><BuildingLink type="shrineoffreyja" /></template>
        <template #ullr><BuildingLink type="shrineofullr" /></template>
        <template #shrines>
          <DocsPageLink to="/docs/shrines">{{ $t('docs.production.upkeep.shrinesLink') }}</DocsPageLink>
        </template>
      </i18n-t>
    </section>
    </template>

    <DocsAdminNote class="block">
      <p>{{ $t('docs.production.adminNote.tooltips') }}</p>
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
.block h3 {
  margin: 20px 0 8px;
  font-size: 16px;
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
  white-space: nowrap;
  font-weight: 600;
}
.value {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.unlock {
  white-space: nowrap;
}
.cell {
  font-variant-numeric: tabular-nums;
}
.line {
  display: block;
}
.small {
  width: auto;
}
</style>
