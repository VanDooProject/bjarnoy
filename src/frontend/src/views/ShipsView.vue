<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import DocsHistoryNote from '../components/docs/DocsHistoryNote.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import ResourceCost from '../components/ResourceCost.vue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { shipGroupName, unitName } from '../i18n/catalogueNames';
import { groupByShipGroup } from '../lib/units/shipGroups';
import { prerequisitesOf } from '../lib/techtree/nodes';
import { favourAt } from '../lib/docs/shrineDocs';
import { TOWER_DEFENCE_PERCENT_PER_LEVEL } from '../lib/docs/shipDocs';
import { SETTLERS_PER_FOUNDING } from '../lib/founding';

// The ships page: the harbour and the shipyard, a table of the ships by group and the rules for fleets at sea. Ship figures come
// from the unit catalogue, the buildings' from the building catalogue; the sea rules are mirrored in shipDocs.ts.

const { n } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const buildings = useBuildingCatalogueStore();
const units = useUnitCatalogueStore();
onMounted(() => {
  void buildings.load();
  void units.load();
});


// The ships by group, in display order: one heading row per group, one row per ship.
const shipGroups = computed(() => groupByShipGroup(units.definitions.filter((u) => u.class === 'ship'), (u) => u.type).filter((g) => g.group !== null));
const ships = computed(() => shipGroups.value.flatMap((g) => g.rows));
// What land units take aboard, smallest first.
const passengers = computed(() =>
  units.definitions.filter((u) => u.cargoSlots > 0).sort((a, b) => a.cargoSlots - b.cargoSlots),
);
const harbour = computed(() => ({
  longhouse: buildings.byType.harbour?.[0]?.requiredLonghouseLevel ?? 0,
  needs: prerequisitesOf(buildings.byType, 'harbour'),
}));
const shipyard = computed(() => ({
  longhouse: buildings.byType.shipyard?.[0]?.requiredLonghouseLevel ?? 0,
  needs: prerequisitesOf(buildings.byType, 'shipyard'),
}));
const fishingHutLevel = computed(() => harbour.value.needs.find((p) => p.type === 'fishinghut')?.level ?? 0);
const harbourLevelForShipyard = computed(() => shipyard.value.needs.find((p) => p.type === 'harbour')?.level ?? 0);

const njord = computed(() => {
  const low = favourAt('shrineofnjord', 1);
  const high = favourAt('shrineofnjord', 5);
  return low?.kind === 'percent' && high?.kind === 'percent' ? { low: low.percent, high: high.percent } : null;
});

const loaded = computed(() => ships.value.length > 0 && harbour.value.longhouse > 0 && shipyard.value.longhouse > 0);
</script>

<template>
  <DocsPageLayout class="ships" :title="$t('docs.ships.title')" caption="DOCS · SHIPS" :intro="$t('docs.ships.intro')">
    <template v-if="loaded">
    <section id="harbour" class="block">
      <h2>{{ $t('docs.ships.harbour.heading') }}</h2>
      <i18n-t keypath="docs.ships.harbour.body" tag="p" class="text" scope="global">
        <template #harbour><BuildingLink type="harbour" /></template>
        <template #longhouse><BuildingLink type="longhouse" /></template>
        <template #level>{{ harbour.longhouse }}</template>
        <template #hut><BuildingLink type="fishinghut" /></template>
        <template #hutLevel>{{ fishingHutLevel }}</template>
      </i18n-t>
      <i18n-t keypath="docs.ships.shipyard.body" tag="p" class="text" scope="global">
        <template #shipyard><BuildingLink type="shipyard" /></template>
        <template #longhouse><BuildingLink type="longhouse" /></template>
        <template #level>{{ shipyard.longhouse }}</template>
        <template #harbour><BuildingLink type="harbour" /></template>
        <template #harbourLevel>{{ harbourLevelForShipyard }}</template>
      </i18n-t>
      <p class="text">{{ $t('docs.ships.harbour.shore') }}</p>
      <DocsHistoryNote><p>{{ $t('docs.ships.history.dockyard') }}</p></DocsHistoryNote>
    </section>

    <section id="ships" class="block">
      <h2>{{ $t('docs.ships.table.heading') }}</h2>
      <p v-if="units.loading" class="muted">{{ $t('docs.status.loading') }}</p>
      <i18n-t keypath="docs.ships.table.training" tag="p" class="text" scope="global">
        <template #training>
          <DocsPageLink to="/docs/training">{{ $t('docs.ships.table.trainingLink') }}</DocsPageLink>
        </template>
      </i18n-t>
      <div v-if="ships.length > 0" class="table-scroll">
        <table data-testid="ships-table">
          <thead>
            <tr>
              <th scope="col">{{ $t('docs.ships.table.cols.ship') }}</th>
              <th scope="col">{{ $t('docs.ships.table.cols.attack') }}</th>
              <th scope="col">{{ $t('docs.ships.table.cols.defense') }}</th>
              <th scope="col">{{ $t('docs.ships.table.cols.speed') }}</th>
              <th scope="col">{{ $t('docs.ships.table.cols.loot') }}</th>
              <th scope="col">{{ $t('docs.ships.table.cols.slots') }}</th>
              <th scope="col">{{ $t('docs.ships.table.cols.food') }}</th>
              <th scope="col">{{ $t('docs.ships.table.cols.upkeep') }}</th>
              <th scope="col">{{ $t('docs.ships.table.cols.cost') }}</th>
              <th scope="col">{{ $t('docs.ships.table.cols.time') }}</th>
            </tr>
          </thead>
          <tbody v-for="g in shipGroups" :key="g.group!" :data-group="g.group!">
            <tr class="group-row">
              <th colspan="10" scope="colgroup" class="group">{{ shipGroupName(g.group!) }}</th>
            </tr>
            <tr v-for="ship in g.rows" :key="ship.type" :data-ship="ship.type">
              <th scope="row" class="name">{{ unitName(ship.type) }}</th>
              <td data-col="attack" class="value">{{ ship.attack }}</td>
              <td data-col="defense" class="value">{{ ship.defense }}</td>
              <td data-col="speed" class="value">{{ n(ship.speed) }}</td>
              <td data-col="loot" class="value">{{ n(ship.carryCapacity) }}</td>
              <td data-col="slots" class="value">{{ n(ship.shipSlots) }}</td>
              <td data-col="food" class="value">{{ n(ship.foodCarryCapacity) }}</td>
              <td data-col="upkeep" class="value">{{ n(ship.upkeepPerHour) }}</td>
              <td data-col="cost" class="cost"><ResourceCost :cost="ship.trainingCost" :size="13" /></td>
              <td data-col="time" class="value">{{ $t('docs.ships.table.minutes', { n: Math.round(ship.trainingSeconds / 60) }) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <DocsHistoryNote class="block">
      <p>{{ $t('docs.ships.history.faering') }}</p>
      <p>{{ $t('docs.ships.history.byrding') }}</p>
      <p>{{ $t('docs.ships.history.knarr') }}</p>
      <p>{{ $t('docs.ships.history.karve') }}</p>
      <p>{{ $t('docs.ships.history.longship') }}</p>
      <p>{{ $t('docs.ships.history.skeid') }}</p>
      <p>{{ $t('docs.ships.history.fireShip') }}</p>
    </DocsHistoryNote>

    <section id="sailing" class="block">
      <h2>{{ $t('docs.ships.sailing.heading') }}</h2>
      <ul class="rules">
        <li>{{ $t('docs.ships.sailing.sea') }}</li>
        <li>{{ $t('docs.ships.sailing.targets') }}</li>
        <i18n-t keypath="docs.ships.sailing.camp" tag="li" scope="global">
          <template #camp>
            <DocsPageLink to="/docs/beach-camp">{{ $t('docs.ships.sailing.campLink') }}</DocsPageLink>
          </template>
        </i18n-t>
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

    <section id="troops" class="block">
      <h2>{{ $t('docs.ships.troops.heading') }}</h2>
      <p class="text">{{ $t('docs.ships.troops.slots') }}</p>
      <div v-if="passengers.length > 0" class="table-scroll">
        <table data-testid="slots-table">
          <thead>
            <tr>
              <th scope="col">{{ $t('docs.ships.troops.unit') }}</th>
              <th scope="col">{{ $t('docs.ships.troops.unitSlots') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="unit in passengers" :key="unit.type" :data-unit="unit.type">
              <th scope="row" class="name">{{ unitName(unit.type) }}</th>
              <td class="value">{{ n(unit.cargoSlots) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul class="rules">
        <li>{{ $t('docs.ships.troops.anyTrip') }}</li>
        <li>{{ $t('docs.ships.troops.speed') }}</li>
        <li>{{ $t('docs.ships.troops.fight') }}</li>
        <li>{{ $t('docs.ships.troops.drown') }}</li>
      </ul>
    </section>

    <section id="battles" class="block">
      <h2>{{ $t('docs.ships.battles.heading') }}</h2>
      <ul class="rules">
        <li>{{ $t('docs.ships.battles.same') }}</li>
        <li>{{ $t('docs.ships.battles.shipsOnly') }}</li>
        <li>{{ $t('docs.ships.battles.shore') }}</li>
        <li>{{ $t('docs.ships.battles.damage') }}</li>
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
      <p>{{ $t('docs.ships.adminNote.sea', { settlers: SETTLERS_PER_FOUNDING }) }}</p>
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
.group {
  color: #fff;
  background: rgba(255, 255, 255, 0.04);
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
.name {
  white-space: nowrap;
}
.cost {
  white-space: nowrap;
}
.value {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
