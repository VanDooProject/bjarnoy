<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import DocsHeroArt from '../components/docs/DocsHeroArt.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { resourceName, unitName } from '../i18n/catalogueNames';
import { findAtlasFrame } from '../lib/map/atlas';
import { prerequisitesOf } from '../lib/techtree/nodes';
import { favourAt } from '../lib/docs/shrineDocs';
import { formatMinutes } from '../lib/docs/landMovementDocs';
import { SHIP_CREW_CAPACITY, TOWER_DEFENCE_PERCENT_PER_LEVEL, minutesPerSeaHex } from '../lib/docs/shipDocs';

// The ships page: the dockyard, a table of the two ships and the rules for fleets at sea. Ship figures come from the
// unit catalogue, the dockyard's from the building catalogue; the sea rules are mirrored in shipDocs.ts.

const { n, locale } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const buildings = useBuildingCatalogueStore();
const units = useUnitCatalogueStore();
onMounted(() => {
  void buildings.load();
  void units.load();
});

const art = computed(() => findAtlasFrame('showcase', 'dockyard_SE_level007'));

const RESOURCES = ['wood', 'stone', 'food', 'iron'] as const;

const ships = computed(() => units.definitions.filter((u) => u.class === 'ship'));
const dockyard = computed(() => ({
  longhouse: buildings.byType.dockyard?.[0]?.requiredLonghouseLevel ?? 0,
  needs: prerequisitesOf(buildings.byType, 'dockyard'),
}));
const fishingHutLevel = computed(() => dockyard.value.needs.find((p) => p.type === 'fishinghut')?.level ?? 0);

const njord = computed(() => {
  const low = favourAt('shrineofnjord', 1);
  const high = favourAt('shrineofnjord', 5);
  return low?.kind === 'percent' && high?.kind === 'percent' ? { low: low.percent, high: high.percent } : null;
});

const loaded = computed(() => ships.value.length > 0 && dockyard.value.longhouse > 0);
const loc = computed(() => String(locale.value));
</script>

<template>
  <DocsPageLayout class="ships" :title="$t('docs.ships.title')" caption="DOCS · SHIPS" :intro="$t('docs.ships.intro')">
    <DocsHeroArt :frame="art" />

    <template v-if="loaded">
    <section id="dockyard" class="block">
      <h2>{{ $t('docs.ships.dockyard.heading') }}</h2>
      <i18n-t v-if="dockyard.longhouse" keypath="docs.ships.dockyard.body" tag="p" class="text" scope="global">
        <template #dockyard><BuildingLink type="dockyard" /></template>
        <template #longhouse><BuildingLink type="longhouse" /></template>
        <template #level>{{ dockyard.longhouse }}</template>
        <template #hut><BuildingLink type="fishinghut" /></template>
        <template #hutLevel>{{ fishingHutLevel }}</template>
      </i18n-t>
      <p class="text">{{ $t('docs.ships.dockyard.shore') }}</p>
    </section>

    <section id="ships" class="block">
      <h2>{{ $t('docs.ships.table.heading') }}</h2>
      <p v-if="units.loading" class="muted">{{ $t('docs.status.loading') }}</p>
      <div v-if="ships.length > 0" class="table-scroll">
        <table data-testid="ships-table">
          <thead>
            <tr>
              <th />
              <th v-for="ship in ships" :key="ship.type" :data-ship="ship.type">{{ unitName(ship.type) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr data-row="attack">
              <th scope="row" class="name">{{ $t('docs.ships.table.rows.attack') }}</th>
              <td v-for="ship in ships" :key="ship.type" class="value">{{ ship.attack }}</td>
            </tr>
            <tr data-row="defense">
              <th scope="row" class="name">{{ $t('docs.ships.table.rows.defense') }}</th>
              <td v-for="ship in ships" :key="ship.type" class="value">{{ ship.defense }}</td>
            </tr>
            <tr data-row="speed">
              <th scope="row" class="name">{{ $t('docs.ships.table.rows.speed') }}</th>
              <td v-for="ship in ships" :key="ship.type" class="value">{{ n(ship.speed) }}</td>
            </tr>
            <tr data-row="perHex">
              <th scope="row" class="name">{{ $t('docs.ships.table.rows.perHex') }}</th>
              <td v-for="ship in ships" :key="ship.type" class="value">{{ formatMinutes(minutesPerSeaHex(ship.speed), loc) }}</td>
            </tr>
            <tr data-row="loot">
              <th scope="row" class="name">{{ $t('docs.ships.table.rows.loot') }}</th>
              <td v-for="ship in ships" :key="ship.type" class="value">{{ n(ship.carryCapacity) }}</td>
            </tr>
            <tr data-row="food">
              <th scope="row" class="name">{{ $t('docs.ships.table.rows.food') }}</th>
              <td v-for="ship in ships" :key="ship.type" class="value">{{ n(ship.foodCarryCapacity) }}</td>
            </tr>
            <tr data-row="upkeep">
              <th scope="row" class="name">{{ $t('docs.ships.table.rows.upkeep') }}</th>
              <td v-for="ship in ships" :key="ship.type" class="value">{{ ship.upkeepPerHour }}</td>
            </tr>
            <tr data-row="cost">
              <th scope="row" class="name">{{ $t('docs.ships.table.rows.cost', { resources: RESOURCES.map(resourceName).join(' / ') }) }}</th>
              <td v-for="ship in ships" :key="ship.type" class="value">{{ RESOURCES.map((r) => n(ship.trainingCost[r])).join(' / ') }}</td>
            </tr>
            <tr data-row="time">
              <th scope="row" class="name">{{ $t('docs.ships.table.rows.time') }}</th>
              <td v-for="ship in ships" :key="ship.type" class="value">{{ $t('docs.ships.table.minutes', { n: Math.round(ship.trainingSeconds / 60) }) }}</td>
            </tr>
            <tr data-row="needs">
              <th scope="row" class="name">{{ $t('docs.ships.table.rows.needs') }}</th>
              <td v-for="ship in ships" :key="ship.type">
                <BuildingLink type="longhouse" /> {{ ship.requiredLonghouseLevel }}
                <template v-if="ship.requiredUnitType">· {{ unitName(ship.requiredUnitType) }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section id="sailing" class="block">
      <h2>{{ $t('docs.ships.sailing.heading') }}</h2>
      <ul class="rules">
        <li>{{ $t('docs.ships.sailing.sea') }}</li>
        <li>{{ $t('docs.ships.sailing.troops') }}</li>
        <li>{{ $t('docs.ships.sailing.targets') }}</li>
        <i18n-t keypath="docs.ships.sailing.walls" tag="li" scope="global">
          <template #walls>
            <DocsPageLink to="/docs/walls">{{ $t('docs.ships.sailing.wallsLink') }}</DocsPageLink>
          </template>
        </i18n-t>
        <i18n-t keypath="docs.ships.sailing.camps" tag="li" scope="global">
          <template #camps>
            <DocsPageLink to="/docs/wildlife-camps">{{ $t('docs.ships.sailing.campsLink') }}</DocsPageLink>
          </template>
        </i18n-t>
      </ul>
    </section>

    <section id="battles" class="block">
      <h2>{{ $t('docs.ships.battles.heading') }}</h2>
      <ul class="rules">
        <li>{{ $t('docs.ships.battles.same') }}</li>
        <i18n-t keypath="docs.ships.battles.tower" tag="li" scope="global">
          <template #tower><BuildingLink type="tower" /></template>
          <template #percent>{{ TOWER_DEFENCE_PERCENT_PER_LEVEL }}</template>
        </i18n-t>
        <i18n-t v-if="njord" keypath="docs.ships.battles.njord" tag="li" scope="global">
          <template #shrine><BuildingLink type="shrineofnjord" /></template>
          <template #low>{{ njord.low }}</template>
          <template #high>{{ njord.high }}</template>
          <template #shrines>
            <DocsPageLink to="/docs/shrines">{{ $t('docs.ships.battles.shrinesLink') }}</DocsPageLink>
          </template>
        </i18n-t>
      </ul>
    </section>
    </template>

    <DocsAdminNote class="block">
      <p>{{ $t('docs.ships.adminNote.route') }}</p>
      <p>{{ $t('docs.ships.adminNote.sea', { karve: SHIP_CREW_CAPACITY.karve, longship: SHIP_CREW_CAPACITY.longship }) }}</p>
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
  white-space: nowrap;
}
.name {
  font-weight: 600;
}
.value {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
